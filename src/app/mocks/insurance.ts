import {
  openInsuranceClaim,
  payers,
  type ClaimStatus,
  type InsuranceClaim,
  type InsuranceRow,
} from '../domain/insurance';
import { dayInIndia, type DomainEvent, type Facility, type Session } from '../domain/operations';
import { ApiError } from './access';
import { db } from './database';
import { requireOpenCollectionDay } from './finance';
import { invoiceBalances } from './invoice-balances';
import { checkedDay, invoiceRows } from './queries';

function activeForDay(coverage: { startsOn: string; expiresOn: string }, day: string) {
  return coverage.startsOn <= day && coverage.expiresOn >= day;
}

async function billAt(facility: Facility, id: unknown) {
  const invoice = typeof id === 'string' ? await db.invoices.get(id) : undefined;
  if (invoice?.facilityId !== facility.id || invoice.prescriptionId)
    throw new ApiError(404, 'Eligible invoice not found.');
  const patient = await db.patients.get(invoice.patientId);
  if (patient?.tenantId !== facility.tenantId)
    throw new ApiError(404, 'Eligible invoice not found.');
  return invoice;
}

export async function insuranceData(facility: Facility, day: string): Promise<InsuranceRow[]> {
  const [rows, coverages, claims] = await Promise.all([
    invoiceRows(facility, day),
    db.insuranceCoverages.where('facilityId').equals(facility.id).toArray(),
    db.insuranceClaims.where('facilityId').equals(facility.id).toArray(),
  ]);
  const byInvoice = new Map(claims.map((claim) => [claim.invoiceId, claim]));
  return rows.flatMap(({ invoice, patient, ...amounts }) => {
    if (invoice.prescriptionId) return [];
    const claim = byInvoice.get(invoice.id);
    if (!claim && amounts.balanceMinor <= 0) return [];
    return [
      {
        ...amounts,
        invoiceId: invoice.id,
        patientId: patient.id,
        patientName: patient.name,
        service: invoice.admissionId
          ? 'Inpatient stay'
          : (invoice.lines[0]?.description ?? 'Consultation'),
        coverages: coverages.filter(
          (row) => row.patientId === patient.id && activeForDay(row, day),
        ),
        claim: claim?.patientId === patient.id ? claim : undefined,
      },
    ];
  });
}

export async function recordCoverage(
  facility: Facility,
  session: Session,
  body: Record<string, unknown>,
): Promise<DomainEvent> {
  const invoice = await billAt(facility, body['invoiceId']);
  const payer = payers.find((item) => item === body['payer']);
  const policy = typeof body['policy'] === 'string' ? body['policy'].trim().toUpperCase() : '';
  if (!payer || !/^[A-Z0-9][A-Z0-9-]{5,23}$/.test(policy))
    throw new ApiError(
      422,
      'Choose a payer and enter a policy code with 6–24 letters, digits or hyphens.',
    );
  if (
    typeof body['startsOn'] !== 'string' ||
    !body['startsOn'] ||
    typeof body['expiresOn'] !== 'string' ||
    !body['expiresOn']
  )
    throw new ApiError(422, 'Enter both coverage dates.');
  const startsOn = checkedDay(body['startsOn']);
  const expiresOn = checkedDay(body['expiresOn']);
  if (!activeForDay({ startsOn, expiresOn }, invoice.day))
    throw new ApiError(422, 'The coverage period must include the invoice date.');
  if (
    await db.insuranceCoverages
      .where('[facilityId+payer+policy]')
      .equals([facility.id, payer, policy])
      .first()
  )
    throw new ApiError(409, 'This payer and policy code are already recorded at this facility.');
  const id = crypto.randomUUID();
  await db.insuranceCoverages.add({
    id,
    facilityId: facility.id,
    patientId: invoice.patientId,
    payer,
    policy,
    startsOn,
    expiresOn,
  });
  return {
    type: 'InsuranceCoverageRecorded',
    facilityId: facility.id,
    entityId: id,
    occurredAt: Date.now(),
    actor: session.account,
  };
}

const transitions: Readonly<Record<string, { from: ClaimStatus; to: ClaimStatus }>> = {
  authorise: { from: 'Requested', to: 'Authorised' },
  deny: { from: 'Requested', to: 'Denied' },
  prepare: { from: 'Authorised', to: 'Prepared' },
  submit: { from: 'Prepared', to: 'Submitted' },
  settle: { from: 'Submitted', to: 'Settled' },
  reject: { from: 'Submitted', to: 'Rejected' },
};

export async function claimCommand(
  facility: Facility,
  session: Session,
  body: Record<string, unknown>,
  create: boolean,
): Promise<DomainEvent> {
  const now = Date.now();
  const event = (id: string): DomainEvent => ({
    type: 'InsuranceClaimUpdated',
    facilityId: facility.id,
    entityId: id,
    occurredAt: now,
    actor: session.account,
  });
  if (create) {
    const invoice = await billAt(facility, body['invoiceId']);
    const coverage =
      typeof body['coverageId'] === 'string'
        ? await db.insuranceCoverages.get(body['coverageId'])
        : undefined;
    if (
      coverage?.facilityId !== facility.id ||
      coverage.patientId !== invoice.patientId ||
      !activeForDay(coverage, invoice.day)
    )
      throw new ApiError(404, 'Coverage is not available for this invoice.');
    if (await db.insuranceClaims.where('invoiceId').equals(invoice.id).first())
      throw new ApiError(409, 'A claim already exists for this invoice.');
    const { balanceMinor } = (await invoiceBalances([invoice])).get(invoice.id)!;
    if (balanceMinor <= 0) throw new ApiError(409, 'The invoice has no outstanding balance.');
    const id = crypto.randomUUID();
    await db.insuranceClaims.add({
      id,
      coverageId: coverage.id,
      facilityId: facility.id,
      invoiceId: invoice.id,
      patientId: invoice.patientId,
      payer: coverage.payer,
      status: 'Requested',
      requestedMinor: balanceMinor,
      version: 1,
      changedAt: now,
    });
    return event(id);
  }
  const claim =
    typeof body['claimId'] === 'string' ? await db.insuranceClaims.get(body['claimId']) : undefined;
  if (claim?.facilityId !== facility.id) throw new ApiError(404, 'Claim not found.');
  const invoice = await billAt(facility, claim.invoiceId);
  const coverage = await db.insuranceCoverages.get(claim.coverageId);
  if (
    invoice.patientId !== claim.patientId ||
    coverage?.facilityId !== facility.id ||
    coverage.patientId !== claim.patientId ||
    coverage.payer !== claim.payer ||
    !activeForDay(coverage, invoice.day)
  )
    throw new ApiError(404, 'Claim not found.');
  if (body['version'] !== String(claim.version))
    throw new ApiError(409, 'This claim was updated. Reopen it and try again.');
  const action = body['action'];
  const next: Partial<InsuranceClaim> = { changedAt: now, version: claim.version + 1 };
  if (action === 'cancel') {
    if (!openInsuranceClaim(claim) || claim.status === 'Submitted')
      throw new ApiError(409, 'Only an unsubmitted open claim can be cancelled.');
    next.status = 'Cancelled';
  } else {
    const rule =
      typeof action === 'string' && Object.hasOwn(transitions, action)
        ? transitions[action]
        : undefined;
    if (!rule || claim.status !== rule.from)
      throw new ApiError(409, 'This action is unavailable at the current claim stage.');
    next.status = rule.to;
  }
  if (action === 'authorise' || action === 'settle') {
    const { balanceMinor } = (await invoiceBalances([invoice])).get(invoice.id)!;
    if (action === 'authorise') {
      const amount = body['approvedMinor'];
      const approved = typeof amount === 'string' && /^\d{1,12}$/.test(amount) ? Number(amount) : 0;
      if (approved <= 0 || approved > Math.min(claim.requestedMinor, balanceMinor))
        throw new ApiError(
          422,
          'Enter an approved amount no greater than the outstanding request.',
        );
      next.approvedMinor = approved;
    } else {
      const day = dayInIndia(now);
      await requireOpenCollectionDay(facility.id, day);
      const approved = claim.approvedMinor ?? 0;
      if (approved <= 0 || approved > balanceMinor)
        throw new ApiError(409, 'The approved amount exceeds the available balance.');
      await db.payments.add({
        id: crypto.randomUUID(),
        invoiceId: invoice.id,
        claimId: claim.id,
        day,
        amountMinor: approved,
      });
    }
  }
  await db.insuranceClaims.update(claim.id, next);
  return event(claim.id);
}
