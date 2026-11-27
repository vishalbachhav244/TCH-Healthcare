import {
  familyAccessDurations,
  type FamilyAccessEntry,
  type FamilyAccessStatus,
  type FamilyBooking,
  type FamilyCare,
  type FamilyPermissions,
  type FamilyRelationship,
} from '../domain/family-access';
import { dayInIndia, type DomainEvent, type Facility, type Session } from '../domain/operations';
import { ApiError, patientSubject } from './access';
import { patientIdentity } from './accounts';
import { db } from './database';
import { describeDocument, documentDetail, findAvailableDocument } from './patient-documents';
import { bookAppointment, bookingDay } from './scheduling';

async function members(facility: Facility, relationship: FamilyRelationship | undefined) {
  if (
    !relationship ||
    relationship.tenantId !== facility.tenantId ||
    relationship.facilityId !== facility.id ||
    relationship.patientId === relationship.caregiverPatientId ||
    patientIdentity(relationship.caregiverAccount) !== relationship.caregiverPatientId
  )
    return undefined;
  const [patient, caregiver] = await db.patients.bulkGet([
    relationship.patientId,
    relationship.caregiverPatientId,
  ]);
  return patient?.tenantId === facility.tenantId && caregiver?.tenantId === facility.tenantId
    ? { relationship, patient, caregiver }
    : undefined;
}

function status(relationship: FamilyRelationship): FamilyAccessStatus {
  if (relationship.revoked) return 'Revoked';
  if (relationship.expiresAt === undefined) return 'Inactive';
  return relationship.expiresAt > Date.now() ? 'Active' : 'Expired';
}

function entry(
  relationship: FamilyRelationship,
  direction: FamilyAccessEntry['direction'],
  name: string,
): FamilyAccessEntry {
  const { id, permissions, expiresAt, version } = relationship;
  return { id, name, direction, status: status(relationship), permissions, expiresAt, version };
}

export async function familyAccess(facility: Facility, session: Session) {
  const patientId = patientSubject(session);
  const candidates = await db.familyRelationships
    .where('facilityId')
    .equals(facility.id)
    .filter((row) => row.patientId === patientId || row.caregiverAccount === session.account)
    .toArray();
  const rows = await Promise.all(candidates.map((row) => members(facility, row)));
  return rows.flatMap((row) => {
    if (!row) return [];
    const { relationship, patient, caregiver } = row;
    return patient.id === patientId
      ? [entry(relationship, 'granted', caregiver.name)]
      : [entry(relationship, 'received', patient.name)];
  });
}

export async function delegatedAccess(
  facility: Facility,
  session: Session,
  id: string,
  permission?: keyof FamilyPermissions,
) {
  const patientId = patientSubject(session);
  const row = await members(facility, await db.familyRelationships.get(id));
  if (
    !row ||
    row.relationship.caregiverAccount !== session.account ||
    row.caregiver.id !== patientId ||
    status(row.relationship) !== 'Active' ||
    (permission && !row.relationship.permissions[permission])
  )
    throw new ApiError(403, 'This family profile or permission is unavailable.');
  return row;
}

export async function familyCare(
  facility: Facility,
  session: Session,
  relationshipId: string,
): Promise<FamilyCare> {
  const { relationship, patient } = await delegatedAccess(facility, session, relationshipId);
  const [appointments, clinicians, documentRows] = await Promise.all([
    relationship.permissions.appointments
      ? db.appointments
          .where('facilityId')
          .equals(facility.id)
          .filter((row) => row.patientId === patient.id)
          .toArray()
      : [],
    relationship.permissions.appointments
      ? db.practitioners.where('facilityId').equals(facility.id).toArray()
      : [],
    relationship.permissions.documents
      ? db.patientDocuments
          .where('[facilityId+patientId]')
          .equals([facility.id, patient.id])
          .filter((row) => row.status === 'Available')
          .toArray()
      : [],
  ]);
  const documents = await Promise.all(
    documentRows.map((row) => findAvailableDocument(facility, patient.id, row.id)),
  );
  return {
    access: entry(relationship, 'received', patient.name),
    appointments: appointments
      .sort((a, b) => b.day.localeCompare(a.day) || b.time.localeCompare(a.time))
      .flatMap(({ id, day, time, status, version = 0, practitionerId }) => {
        const practitioner = clinicians.find((row) => row.id === practitionerId);
        return practitioner
          ? [{ appointment: { id, day, time, status, version }, practitioner }]
          : [];
      }),
    clinicians,
    documents: documents
      .flatMap((row) => (row ? [describeDocument(row)] : []))
      .sort((a, b) => b.addedAt - a.addedAt),
  };
}

export async function familyDocument(
  facility: Facility,
  session: Session,
  relationshipId: string,
  id: string,
  version: string | null,
) {
  const { patient } = await delegatedAccess(facility, session, relationshipId, 'documents');
  const record = await findAvailableDocument(facility, patient.id, id);
  if (!record || version !== String(record.version))
    throw new ApiError(404, 'This document is unavailable.');
  return documentDetail(record, facility);
}

export async function changeFamilyAccess(
  facility: Facility,
  session: Session,
  id: string,
  body: Record<string, unknown>,
): Promise<DomainEvent> {
  const patientId = patientSubject(session);
  const row = await members(facility, await db.familyRelationships.get(id));
  if (row?.patient.id !== patientId)
    throw new ApiError(403, 'Only the patient can change access to their profile.');
  const { relationship } = row;
  if (body['version'] !== relationship.version)
    throw new ApiError(409, 'Family access has changed. Reload and try again.');

  const version = relationship.version + 1;
  const now = Date.now();
  if (body['action'] === 'grant') {
    const { appointments, documents, hours } = body;
    if (
      typeof appointments !== 'boolean' ||
      typeof documents !== 'boolean' ||
      (!appointments && !documents) ||
      !familyAccessDurations.some((value) => value === hours) ||
      typeof hours !== 'number'
    )
      throw new ApiError(422, 'Choose at least one permission and a listed duration.');
    await db.familyRelationships.update(id, {
      permissions: { appointments, documents },
      expiresAt: now + hours * 3_600_000,
      revoked: false,
      version,
    });
  } else if (body['action'] === 'revoke') {
    if (status(relationship) !== 'Active')
      throw new ApiError(409, 'There is no active access to revoke.');
    await db.familyRelationships.update(id, {
      permissions: { appointments: false, documents: false },
      revoked: true,
      version,
    });
  } else {
    throw new ApiError(422, 'Choose a family access action.');
  }
  return {
    type: 'FamilyAccessChanged',
    facilityId: facility.id,
    entityId: id,
    occurredAt: now,
    actor: session.account,
  };
}

export async function bookFamilyVisit(
  facility: Facility,
  session: Session,
  id: string,
  fields: FamilyBooking,
) {
  const { patient } = await delegatedAccess(facility, session, id, 'appointments');
  return bookAppointment(facility, {
    ...fields,
    day: bookingDay(fields.day),
    channel: 'Scheduled',
    patientId: patient.id,
  });
}

export async function issueFamilyPass(
  facility: Facility,
  session: Session,
  relationshipId: string,
  appointmentId: string,
) {
  const { relationship, patient } = await delegatedAccess(
    facility,
    session,
    relationshipId,
    'appointments',
  );
  const appointment = await db.appointments.get(appointmentId);
  if (appointment?.facilityId !== facility.id || appointment.patientId !== patient.id)
    throw new ApiError(404, 'Appointment not found.');
  if (appointment.status !== 'Booked' || appointment.day < dayInIndia())
    throw new ApiError(409, 'A pass is unavailable for this appointment.');
  const grantVersion = relationship.version;
  const appointmentVersion = appointment.version ?? 0;
  const current = await db.familyPasses
    .where('[relationshipId+appointmentId]')
    .equals([relationshipId, appointmentId])
    .filter(
      (row) => row.grantVersion === grantVersion && row.appointmentVersion === appointmentVersion,
    )
    .first();
  if (current) return current.code;
  const code = crypto.randomUUID();
  await db.familyPasses.add({
    code,
    facilityId: facility.id,
    relationshipId,
    appointmentId,
    grantVersion,
    appointmentVersion,
  });
  return code;
}

export async function appointmentByFamilyPass(facility: Facility, code: string) {
  const pass = await db.familyPasses.get(code);
  if (pass?.facilityId !== facility.id) return undefined;
  const row = await members(facility, await db.familyRelationships.get(pass.relationshipId));
  if (
    !row ||
    row.relationship.version !== pass.grantVersion ||
    status(row.relationship) !== 'Active' ||
    !row.relationship.permissions.appointments
  )
    return undefined;
  const appointment = await db.appointments.get(pass.appointmentId);
  return appointment?.facilityId === facility.id &&
    appointment.patientId === row.patient.id &&
    (appointment.version ?? 0) === pass.appointmentVersion
    ? appointment
    : undefined;
}
