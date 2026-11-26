import { refundOutcomes, type CollectionSummary, type FinanceData } from '../domain/finance';
import {
  dayInIndia,
  invoiceTotal,
  type DomainEvent,
  type Facility,
  type Session,
} from '../domain/operations';
import type { ReturnMovement } from '../domain/pharmacy';
import { ApiError } from './access';
import { db } from './database';

const closeId = (facilityId: string, day: string) => facilityId + ':' + day;

export async function requireOpenCollectionDay(facilityId: string, day: string) {
  if (await db.collectionCloses.get(closeId(facilityId, day))) {
    throw new ApiError(409, 'Collections are closed for this facility and date.');
  }
}

async function summaryFor(facility: Facility, day: string): Promise<CollectionSummary> {
  const [invoices, payments, refunds] = await Promise.all([
    db.invoices.where('[facilityId+day]').equals([facility.id, day]).toArray(),
    db.payments.where('day').equals(day).toArray(),
    db.refundDecisions.where('[facilityId+day]').equals([facility.id, day]).toArray(),
  ]);
  const sources = await db.invoices.bulkGet(payments.map((item) => item.invoiceId));
  const summary = {
    billedMinor: invoices.reduce((total, invoice) => total + invoiceTotal(invoice), 0),
    patientMinor: 0,
    payerMinor: 0,
    refundedMinor: refunds.reduce((total, row) => total + row.amountMinor, 0),
    netMinor: 0,
    paymentCount: 0,
  };
  for (const [index, payment] of payments.entries()) {
    if (sources[index]?.facilityId !== facility.id) continue;
    if (payment.claimId) summary.payerMinor += payment.amountMinor;
    else summary.patientMinor += payment.amountMinor;
    summary.paymentCount++;
  }
  summary.netMinor = summary.patientMinor + summary.payerMinor - summary.refundedMinor;
  return summary;
}

export async function financeData(facility: Facility, day: string): Promise<FinanceData> {
  const [summary, close, movements, decisions] = await Promise.all([
    summaryFor(facility, day),
    db.collectionCloses.get(closeId(facility.id, day)),
    db.stockMovements
      .where('facilityId')
      .equals(facility.id)
      .filter((row) => row.kind === 'Patient return' && row.reviewMinor > 0)
      .toArray(),
    db.refundDecisions.where('facilityId').equals(facility.id).toArray(),
  ]);
  const returns = movements as ReturnMovement[];
  const invoices = await db.invoices.bulkGet(returns.map((row) => row.invoiceId));
  const patients = await db.patients.bulkGet(invoices.map((invoice) => invoice?.patientId ?? ''));
  const byMovement = new Map(decisions.map((row) => [row.movementId, row]));
  const reviews = returns
    .flatMap((row, index) => {
      const invoice = invoices[index];
      const patient = patients[index];
      if (
        invoice?.facilityId !== facility.id ||
        invoice.prescriptionId !== row.prescriptionId ||
        patient?.tenantId !== facility.tenantId
      )
        return [];
      return [
        {
          id: row.id,
          patient: patient.name,
          medication: invoice.lines[0]?.description ?? 'Medication',
          reference: row.reference,
          requestedAt: row.at,
          requestedMinor: row.reviewMinor,
          decision: byMovement.get(row.id),
        },
      ];
    })
    .sort((a, b) => Number(!!a.decision) - Number(!!b.decision) || b.requestedAt - a.requestedAt);
  return { summary, close, reviews };
}

export async function closeCollections(
  facility: Facility,
  session: Session,
  day: string,
  counted: unknown,
): Promise<DomainEvent> {
  if (day > dayInIndia()) throw new ApiError(422, 'Select today or an earlier collection date.');
  if (typeof counted !== 'string' || !/^-?\d{1,12}$/.test(counted))
    throw new ApiError(422, 'Enter the counted net collection in rupees and paise.');
  await requireOpenCollectionDay(facility.id, day);
  const summary = await summaryFor(facility, day);
  const countedMinor = Number(counted);
  if (countedMinor !== summary.netMinor)
    throw new ApiError(409, 'The counted net amount must match the collection ledger.');
  const id = closeId(facility.id, day);
  const now = Date.now();
  await db.collectionCloses.add({
    id,
    facilityId: facility.id,
    day,
    summary,
    countedMinor,
    closedAt: now,
    actor: session.account,
  });
  return {
    type: 'CollectionDayClosed',
    facilityId: facility.id,
    entityId: id,
    occurredAt: now,
    actor: session.account,
  };
}

export async function decideRefund(
  facility: Facility,
  session: Session,
  body: Record<string, unknown>,
): Promise<DomainEvent> {
  const movementId = body['movementId'];
  const movement =
    typeof movementId === 'string' ? await db.stockMovements.get(movementId) : undefined;
  if (
    movement?.facilityId !== facility.id ||
    movement.kind !== 'Patient return' ||
    movement.reviewMinor <= 0
  )
    throw new ApiError(404, 'Payment review not found.');
  const invoice = await db.invoices.get(movement.invoiceId);
  const patient = invoice ? await db.patients.get(invoice.patientId) : undefined;
  if (
    invoice?.facilityId !== facility.id ||
    invoice.prescriptionId !== movement.prescriptionId ||
    patient?.tenantId !== facility.tenantId
  )
    throw new ApiError(404, 'Payment review not found.');
  if (await db.refundDecisions.get(movement.id))
    throw new ApiError(409, 'This return has already been reviewed.');
  const outcome = refundOutcomes.find((value) => value === body['outcome']);
  if (!outcome) throw new ApiError(422, 'Choose a payment review decision.');
  const now = Date.now();
  const day = dayInIndia(now);
  const amountMinor = outcome === 'Record local refund' ? movement.reviewMinor : 0;
  if (amountMinor) await requireOpenCollectionDay(facility.id, day);
  await db.refundDecisions.add({
    movementId: movement.id,
    invoiceId: movement.invoiceId,
    facilityId: facility.id,
    outcome,
    amountMinor,
    day,
    decidedAt: now,
    actor: session.account,
  });
  return {
    type: 'RefundReviewDecided',
    facilityId: facility.id,
    entityId: movement.id,
    occurredAt: now,
    actor: session.account,
  };
}
