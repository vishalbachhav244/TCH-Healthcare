import type { Admission, DomainEvent, Facility, InpatientBoard } from '../domain/operations';
import { ApiError } from './access';
import { db } from './database';

export async function board(
  facility: Facility,
  includeAdmissions: boolean,
): Promise<InpatientBoard> {
  const [beds, admissions] = await Promise.all([
    db.beds.where('facilityId').equals(facility.id).toArray(),
    includeAdmissions ? db.admissions.where('facilityId').equals(facility.id).toArray() : [],
  ]);
  const patients = await db.patients.bulkGet(admissions.map((row) => row.patientId));
  return {
    beds,
    admissions: admissions
      .flatMap((admission, index) => {
        const patient = patients[index];
        return patient?.tenantId === facility.tenantId ? [{ admission, patient }] : [];
      })
      .sort((a, b) => b.admission.requestedAt - a.admission.requestedAt),
  };
}

export async function inpatientCommand(
  path: string,
  facility: Facility,
  payload: Record<string, unknown>,
): Promise<DomainEvent> {
  const time = Date.now();
  const event = (type: DomainEvent['type'], entityId: string) => ({
    type,
    entityId,
    facilityId: facility.id,
    occurredAt: time,
  });
  if (path === 'beds/release') {
    const bed =
      typeof payload['bedId'] === 'string' ? await db.beds.get(payload['bedId']) : undefined;
    if (!bed || bed.facilityId !== facility.id) throw new ApiError(404, 'Bed not found.');
    if (bed.status !== 'Cleaning')
      throw new ApiError(409, 'Only a bed awaiting cleaning can be released.');
    await db.beds.update(bed.id, { status: 'Available' });
    return event('BedReleased', bed.id);
  }
  if (path === 'admissions') {
    const patient =
      typeof payload['patientId'] === 'string'
        ? await db.patients.get(payload['patientId'])
        : undefined;
    if (patient?.tenantId !== facility.tenantId) throw new ApiError(404, 'Patient not found.');
    const existing = await db.admissions
      .where('[facilityId+patientId]')
      .equals([facility.id, patient.id])
      .filter((row) => row.status !== 'Discharged')
      .first();
    if (existing)
      throw new ApiError(409, 'This patient already has an active admission at this facility.');
    const id = crypto.randomUUID();
    await db.admissions.add({
      id,
      facilityId: facility.id,
      patientId: patient.id,
      requestedAt: time,
      status: 'Requested',
      version: 1,
    });
    return event('AdmissionRequested', id);
  }
  const admission =
    typeof payload['admissionId'] === 'string'
      ? await db.admissions.get(payload['admissionId'])
      : undefined;
  if (admission?.facilityId !== facility.id) throw new ApiError(404, 'Admission not found.');
  if (String(admission.version) !== payload['version'])
    throw new ApiError(409, 'This admission was updated. Reload and try again.');
  const next: Partial<Admission> = { version: admission.version + 1 };
  if (path === 'admissions/discharge') {
    if (admission.status !== 'Admitted' || !admission.bedId)
      throw new ApiError(409, 'Only an admitted patient can be discharged.');
    await db.beds.update(admission.bedId, { status: 'Cleaning' });
    await db.admissions.update(admission.id, { ...next, status: 'Discharged', dischargedAt: time });
    return event('PatientDischarged', admission.id);
  }
  if (admission.status === 'Discharged') throw new ApiError(409, 'This admission is closed.');
  const bed =
    typeof payload['bedId'] === 'string' ? await db.beds.get(payload['bedId']) : undefined;
  if (!bed || bed.facilityId !== facility.id) throw new ApiError(404, 'Bed not found.');
  if (bed.status !== 'Available')
    throw new ApiError(409, 'The selected bed is no longer available.');
  if (admission.bedId) await db.beds.update(admission.bedId, { status: 'Cleaning' });
  await db.beds.update(bed.id, { status: 'Occupied' });
  await db.admissions.update(admission.id, {
    ...next,
    bedId: bed.id,
    status: 'Admitted',
    admittedAt: admission.admittedAt ?? time,
  });
  return event(admission.status === 'Requested' ? 'PatientAdmitted' : 'BedAllocated', admission.id);
}
