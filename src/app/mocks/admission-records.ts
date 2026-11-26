import type { Facility } from '../domain/operations';
import { ApiError } from './access';
import { db } from './database';

export async function patientAt(facility: Facility, id: string) {
  const patient = await db.patients.get(id);
  if (patient?.tenantId !== facility.tenantId) throw new ApiError(404, 'Patient not found.');
  return patient;
}

export function ongoingAdmission(facility: Facility, patientId: string) {
  return db.admissions
    .where('[facilityId+patientId]')
    .equals([facility.id, patientId])
    .filter((row) => row.status !== 'Discharged')
    .first();
}

export async function requestAdmission(facility: Facility, patientId: string, requestedAt: number) {
  const patient = await patientAt(facility, patientId);
  if (await ongoingAdmission(facility, patient.id)) {
    throw new ApiError(409, 'This patient already has an active admission at this facility.');
  }
  const id = crypto.randomUUID();
  await db.admissions.add({
    id,
    facilityId: facility.id,
    patientId: patient.id,
    requestedAt,
    status: 'Requested',
    version: 1,
  });
  return id;
}
