import {
  followUpPurposes,
  type BookingContext,
  type ClinicalContinuity,
  type FollowUpDetails,
  type FollowUpRequest,
  type FollowUpSummary,
} from '../domain/continuity';
import {
  dayInIndia,
  type Appointment,
  type Facility,
  type Practitioner,
  type Session,
} from '../domain/operations';
import { ApiError, patientSubject } from './access';
import { db } from './database';
import { bookAppointment, bookingDay } from './scheduling';

async function scopedPatient(facility: Facility, patientId: string) {
  const patient = await db.patients.get(patientId);
  if (patient?.tenantId !== facility.tenantId)
    throw new ApiError(404, 'Patient is unavailable at this facility.');
  return patient;
}

async function assignedEncounter(facility: Facility, session: Session, id: string) {
  const encounter = await db.encounters.get(id);
  if (encounter?.facilityId !== facility.id) throw new ApiError(404, 'Encounter not found.');
  if (encounter.practitionerId !== session.facilityAccess[facility.id]?.practitionerId) {
    throw new ApiError(403, 'Only the assigned clinician can open this patient context.');
  }
  const visit = await db.appointments.get(encounter.appointmentId);
  if (
    visit?.facilityId !== facility.id ||
    visit.patientId !== encounter.patientId ||
    visit.practitionerId !== encounter.practitionerId ||
    !['In consultation', 'Completed'].includes(visit.status)
  ) {
    throw new ApiError(409, 'The encounter’s appointment could not be verified.');
  }
  await scopedPatient(facility, encounter.patientId);
  return { encounter, visit };
}

function clinicianSummary(clinician: Practitioner) {
  return { id: clinician.id, name: clinician.name, specialty: clinician.specialty };
}

async function signedHistory(
  facility: Facility,
  patientId: string,
  limit: number,
  exclude?: string,
) {
  const encounters = await db.encounters
    .where('[facilityId+patientId]')
    .equals([facility.id, patientId])
    .filter((row) => !!row.signedAt && row.signedAt <= Date.now() && row.id !== exclude)
    .toArray();
  encounters.sort((a, b) => (b.signedAt ?? 0) - (a.signedAt ?? 0) || a.id.localeCompare(b.id));
  const [visits, clinicians] = await Promise.all([
    db.appointments.bulkGet(encounters.map((row) => row.appointmentId)),
    db.practitioners.bulkGet(encounters.map((row) => row.practitionerId)),
  ]);
  return encounters
    .flatMap((row, i): ClinicalContinuity['history'] => {
      const visit = visits[i];
      const clinician = clinicians[i];
      if (
        !row.signedAt ||
        !visit ||
        visit.status !== 'Completed' ||
        visit.facilityId !== facility.id ||
        visit.patientId !== patientId ||
        visit.practitionerId !== row.practitionerId ||
        clinician?.facilityId !== facility.id
      )
        return [];
      return [
        {
          id: row.id,
          clinician: clinicianSummary(clinician),
          signedAt: row.signedAt,
          observation: row.observation,
        },
      ];
    })
    .slice(0, limit);
}

function followUpStatus(
  request: FollowUpRequest,
  appointment?: Appointment,
): FollowUpSummary['status'] {
  if (request.withdrawnAt !== undefined) return 'Withdrawn';
  if (appointment?.status === 'Completed') return 'Completed';
  if (appointment && appointment.status !== 'Cancelled') return 'Booked';
  return request.endsOn < dayInIndia() ? 'Expired' : 'To book';
}

function hasActiveFollowUp(request: FollowUpRequest, today: string) {
  return request.withdrawnAt === undefined && (!!request.appointmentId || request.endsOn >= today);
}

async function followUpDetails(
  facility: Facility,
  requests: FollowUpRequest[],
): Promise<FollowUpDetails[]> {
  const [clinicians, visits] = await Promise.all([
    db.practitioners.bulkGet(requests.map((row) => row.practitionerId)),
    db.appointments.bulkGet(
      requests.flatMap((row) => (row.appointmentId ? [row.appointmentId] : [])),
    ),
  ]);
  const byId = new Map(
    visits.flatMap((appointment) =>
      appointment?.facilityId === facility.id ? [[appointment.id, appointment] as const] : [],
    ),
  );
  return requests.flatMap((request, i) => {
    const clinician = clinicians[i];
    if (request.facilityId !== facility.id || clinician?.facilityId !== facility.id) return [];
    const linked = request.appointmentId ? byId.get(request.appointmentId) : undefined;
    const visit =
      linked?.patientId === request.patientId && linked.followUpId === request.id
        ? linked
        : undefined;
    return [
      {
        id: request.id,
        clinician: clinicianSummary(clinician),
        purpose: request.purpose,
        startsOn: request.startsOn,
        endsOn: request.endsOn,
        version: request.version,
        status: followUpStatus(request, visit),
        visit: visit && { day: visit.day, time: visit.time },
      },
    ];
  });
}

export async function followUpsForPatient(facility: Facility, patientId: string) {
  const requests = await db.followUps
    .where('[facilityId+patientId]')
    .equals([facility.id, patientId])
    .toArray();
  return followUpDetails(
    facility,
    requests.sort((a, b) => b.createdAt - a.createdAt),
  );
}

export async function bookingContext(
  facility: Facility,
  patientId: string,
): Promise<BookingContext> {
  await scopedPatient(facility, patientId);
  const [[latest], followUps] = await Promise.all([
    signedHistory(facility, patientId, 1),
    followUpsForPatient(facility, patientId),
  ]);
  return {
    recentClinician: latest ? { clinician: latest.clinician, signedAt: latest.signedAt } : null,
    followUps: followUps
      .filter((row) => row.status === 'To book' || row.status === 'Booked')
      .map(({ purpose: _purpose, ...row }) => row),
  };
}

export async function clinicalContinuity(
  facility: Facility,
  session: Session,
  encounterId: string,
): Promise<ClinicalContinuity> {
  const { encounter } = await assignedEncounter(facility, session, encounterId);
  const [history, requests] = await Promise.all([
    signedHistory(facility, encounter.patientId, 12, encounter.id),
    db.followUps
      .where('encounterId')
      .equals(encounter.id)
      .filter((row) => row.facilityId === facility.id && row.patientId === encounter.patientId)
      .toArray(),
  ]);
  requests.sort((a, b) => b.createdAt - a.createdAt);
  const today = dayInIndia();
  const latest = requests.find((row) => hasActiveFollowUp(row, today)) ?? requests[0];
  const [followUp] = latest ? await followUpDetails(facility, [latest]) : [];
  return { history, followUp: followUp ?? null };
}

function field(body: Record<string, unknown>, key: string) {
  const value = body[key];
  if (typeof value !== 'string' || !value || value.length > 100)
    throw new ApiError(422, 'Enter a valid ' + key + '.');
  return value;
}

export async function requestFollowUp(
  facility: Facility,
  session: Session,
  body: Record<string, unknown>,
) {
  const { encounter, visit } = await assignedEncounter(
    facility,
    session,
    field(body, 'encounterId'),
  );
  if (!encounter.signedAt || visit.status !== 'Completed')
    throw new ApiError(409, 'Sign and complete the consultation before requesting follow-up.');
  const today = dayInIndia();
  if (
    await db.followUps
      .where('encounterId')
      .equals(encounter.id)
      .filter((row) => hasActiveFollowUp(row, today))
      .first()
  ) {
    throw new ApiError(409, 'This consultation already has a follow-up request.');
  }
  const startsOn = bookingDay(field(body, 'startsOn'));
  const endsOn = bookingDay(field(body, 'endsOn'));
  const purpose = followUpPurposes.find((item) => item === body['purpose']);
  if (startsOn > endsOn || startsOn < visit.day || !purpose)
    throw new ApiError(422, 'Choose a valid follow-up date range and purpose.');
  const id = crypto.randomUUID();
  await db.followUps.add({
    id,
    facilityId: facility.id,
    patientId: encounter.patientId,
    encounterId: encounter.id,
    practitionerId: encounter.practitionerId,
    version: 1,
    createdAt: Date.now(),
    startsOn,
    endsOn,
    purpose,
  });
  return id;
}

export async function withdrawFollowUp(
  facility: Facility,
  session: Session,
  body: Record<string, unknown>,
) {
  const id = field(body, 'followUpId');
  const request = await db.followUps.get(id);
  if (request?.facilityId !== facility.id) throw new ApiError(404, 'Follow-up request not found.');
  await assignedEncounter(facility, session, request.encounterId);
  if (
    String(request.version) !== body['version'] ||
    request.appointmentId ||
    request.withdrawnAt !== undefined ||
    request.endsOn < dayInIndia()
  ) {
    throw new ApiError(409, 'Only a current unbooked follow-up request can be withdrawn.');
  }
  await db.followUps.update(id, { version: request.version + 1, withdrawnAt: Date.now() });
  return id;
}

function validateFollowUpDate(request: FollowUpRequest, day: string, clinician: string) {
  if (day < request.startsOn || day > request.endsOn || clinician !== request.practitionerId)
    throw new ApiError(
      422,
      'Choose the requested clinician and a date within the follow-up window.',
    );
}

export async function bookFollowUp(
  facility: Facility,
  session: Session,
  body: Record<string, unknown>,
  selfService: boolean,
) {
  const id = field(body, 'followUpId');
  const request = await db.followUps.get(id);
  const patientId = selfService ? patientSubject(session) : field(body, 'patientId');
  if (request?.facilityId !== facility.id || request.patientId !== patientId)
    throw new ApiError(404, 'Follow-up request not found.');
  if (
    String(request.version) !== body['version'] ||
    request.appointmentId ||
    request.withdrawnAt !== undefined ||
    request.endsOn < dayInIndia()
  ) {
    throw new ApiError(
      409,
      'This follow-up request changed or is no longer available for booking.',
    );
  }
  const day = bookingDay(field(body, 'day'));
  validateFollowUpDate(request, day, request.practitionerId);
  const appointment = await bookAppointment(facility, {
    patientId,
    practitionerId: request.practitionerId,
    day,
    time: field(body, 'time'),
    channel: 'Scheduled',
    followUpId: id,
  });
  await db.followUps.update(id, { appointmentId: appointment.id, version: request.version + 1 });
  return appointment;
}

export async function changeFollowUpAppointment(
  appointment: Appointment,
  change?: { day: string; practitionerId: string },
) {
  if (!appointment.followUpId) return;
  const request = await db.followUps.get(appointment.followUpId);
  if (
    request?.appointmentId !== appointment.id ||
    request.facilityId !== appointment.facilityId ||
    request.patientId !== appointment.patientId
  )
    throw new ApiError(409, 'The follow-up and appointment link could not be verified.');
  if (change) validateFollowUpDate(request, change.day, change.practitionerId);
  else
    await db.followUps.update(request.id, {
      appointmentId: undefined,
      version: request.version + 1,
    });
}
