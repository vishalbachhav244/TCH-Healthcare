import {
  bedStayFields,
  calculateBedCharges,
  initialBedStays,
  totalBedCharges,
} from '../domain/bed-charges';
import type {
  BedStay,
  InpatientAccount,
  InpatientBillingDetail,
  InpatientBillingRow,
} from '../domain/discharge';
import {
  dayInIndia,
  type Admission,
  type Bed,
  type Facility,
  type Patient,
} from '../domain/operations';
import { ApiError } from './access';
import { db } from './database';

export async function endBedStay(admission: Admission, bed: Bed, time: number) {
  const stays = await db.bedStays
    .where('admissionId')
    .equals(admission.id)
    .filter((stay) => stay.facilityId === admission.facilityId && stay.endedAt === undefined)
    .toArray();
  if (stays.length > 1 || (stays[0] && stays[0].bedId !== bed.id)) {
    throw new ApiError(409, 'The admission and bed history could not be verified.');
  }
  if (stays[0]) {
    if (stays[0].startedAt > time) throw new ApiError(409, 'The bed stay has not started.');
    await db.bedStays.update(stays[0].id, { endedAt: time });
    return;
  }
  const known = initialBedStays([admission], [bed], time)[0];
  if (!known || known.startedAt > time) throw new ApiError(409, 'The bed stay has not started.');
  await db.bedStays.add({ ...known, id: crypto.randomUUID(), endedAt: time });
}

export function startBedStay(admission: Admission, bed: Bed, time: number) {
  return db.bedStays.add({ id: crypto.randomUUID(), ...bedStayFields(admission, bed, time) });
}

export async function finalizeInpatientAccount(admission: Admission, time: number) {
  const stays = await db.bedStays
    .where('admissionId')
    .equals(admission.id)
    .filter((row) => row.facilityId === admission.facilityId)
    .toArray();
  const charges = calculateBedCharges(stays, time);
  if (!charges.length || stays.some((row) => row.endedAt === undefined))
    throw new ApiError(409, 'The bed history could not be finalized.');
  await db.inpatientAccounts.add({
    admissionId: admission.id,
    facilityId: admission.facilityId,
    patientId: admission.patientId,
    finalizedAt: time,
    coverage: stays.some((row) => row.partial) ? 'Tracked segments only' : 'Full stay',
    charges,
  });
}

function validAccount(
  facility: Facility,
  admission: Admission | undefined,
  account: InpatientAccount | undefined,
) {
  return (
    account?.facilityId === facility.id &&
    admission?.facilityId === facility.id &&
    admission.id === account.admissionId &&
    admission.patientId === account.patientId &&
    admission.status === 'Discharged' &&
    admission.dischargedAt === account.finalizedAt
  );
}

function describeAccount(
  facility: Facility,
  admission: Admission,
  patient: Patient | undefined,
  stays: BedStay[],
  account: InpatientAccount | undefined,
  invoiceId: string | undefined,
  now: number,
): InpatientBillingDetail | undefined {
  if (patient?.tenantId !== facility.tenantId || admission.admittedAt === undefined)
    return undefined;
  if (admission.status !== 'Admitted' && !validAccount(facility, admission, account))
    return undefined;
  const charges = account?.charges ?? calculateBedCharges(stays, now);
  return {
    admissionId: admission.id,
    admittedAt: admission.admittedAt,
    patient: { id: patient.id, name: patient.name },
    coverage:
      account?.coverage ??
      (stays.some((row) => row.partial) ? 'Tracked segments only' : 'Full stay'),
    status: invoiceId ? 'Invoiced' : account ? 'Ready to invoice' : 'Accruing',
    finalizedAt: account?.finalizedAt,
    chargeDays: charges.length,
    totalMinor: totalBedCharges(charges),
    charges,
    invoiceId,
  };
}

export async function inpatientBillingRows(facility: Facility): Promise<InpatientBillingRow[]> {
  const [admissions, accounts, stays, invoices] = await Promise.all([
    db.admissions
      .where('facilityId')
      .equals(facility.id)
      .filter((row) => row.status !== 'Requested')
      .toArray(),
    db.inpatientAccounts.where('facilityId').equals(facility.id).toArray(),
    db.bedStays.where('facilityId').equals(facility.id).toArray(),
    db.invoices
      .where('facilityId')
      .equals(facility.id)
      .filter((row) => !!row.admissionId)
      .toArray(),
  ]);
  const patients = await db.patients.bulkGet(admissions.map((row) => row.patientId));
  const accountById = new Map(accounts.map((row) => [row.admissionId, row]));
  const invoiceById = new Map(invoices.map((row) => [row.admissionId, row]));
  const staysByAdmission = new Map<string, BedStay[]>();
  for (const stay of stays) {
    const group = staysByAdmission.get(stay.admissionId);
    if (group) group.push(stay);
    else staysByAdmission.set(stay.admissionId, [stay]);
  }
  const now = Date.now();
  return admissions
    .flatMap((admission, index) => {
      const invoice = invoiceById.get(admission.id);
      const detail = describeAccount(
        facility,
        admission,
        patients[index],
        staysByAdmission.get(admission.id) ?? [],
        accountById.get(admission.id),
        invoice?.patientId === admission.patientId ? invoice.id : undefined,
        now,
      );
      if (!detail) return [];
      const { charges: _charges, ...row } = detail;
      return [row];
    })
    .sort(
      (a, b) =>
        Number(b.status === 'Ready to invoice') - Number(a.status === 'Ready to invoice') ||
        (b.finalizedAt ?? b.admittedAt) - (a.finalizedAt ?? a.admittedAt),
    );
}

export async function inpatientBillingDetail(facility: Facility, id: string) {
  const admission = await db.admissions.get(id);
  if (admission?.facilityId !== facility.id)
    throw new ApiError(404, 'Inpatient account not found.');
  const [patient, stays, account, invoice] = await Promise.all([
    db.patients.get(admission.patientId),
    db.bedStays
      .where('admissionId')
      .equals(id)
      .filter((row) => row.facilityId === facility.id)
      .toArray(),
    db.inpatientAccounts.get(id),
    db.invoices.where('admissionId').equals(id).first(),
  ]);
  const detail = describeAccount(
    facility,
    admission,
    patient,
    stays,
    account?.facilityId === facility.id ? account : undefined,
    invoice?.facilityId === facility.id && invoice.patientId === admission.patientId
      ? invoice.id
      : undefined,
    Date.now(),
  );
  if (!detail)
    throw new ApiError(404, 'No tracked inpatient charges were found for this admission.');
  return detail;
}

export async function issueInpatientInvoice(
  facility: Facility,
  id: string,
  acknowledgePartial: unknown,
) {
  const [admission, account] = await Promise.all([
    db.admissions.get(id),
    db.inpatientAccounts.get(id),
  ]);
  if (admission?.facilityId !== facility.id)
    throw new ApiError(404, 'Inpatient account not found.');
  if (!validAccount(facility, admission, account) || !account)
    throw new ApiError(409, 'Discharge must finalize the inpatient charges before invoicing.');
  if ((await db.patients.get(account.patientId))?.tenantId !== facility.tenantId)
    throw new ApiError(404, 'Inpatient account not found.');
  if (account.coverage === 'Tracked segments only' && acknowledgePartial !== 'true') {
    throw new ApiError(422, 'Acknowledge that this invoice covers the tracked bed history.');
  }
  if (await db.invoices.where('admissionId').equals(id).first())
    throw new ApiError(409, 'An invoice already exists for this admission.');
  const invoiceId = crypto.randomUUID();
  await db.invoices.add({
    id: invoiceId,
    facilityId: facility.id,
    patientId: account.patientId,
    admissionId: id,
    day: dayInIndia(),
    lines: account.charges.map((charge) => ({
      description: charge.ward + ' · ' + charge.day,
      unitMinor: charge.amountMinor,
      quantity: 1,
    })),
  });
  return invoiceId;
}
