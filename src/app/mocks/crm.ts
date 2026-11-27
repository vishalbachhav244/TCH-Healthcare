import {
  enquiryReasons,
  enquirySources,
  enquiryStatus,
  contactOutcomes,
  type CrmData,
  type Enquiry,
  type EnquiryBooking,
  type EnquiryRow,
} from '../domain/engagement';
import {
  specialties,
  type Appointment,
  type DomainEvent,
  type Facility,
  type Session,
} from '../domain/operations';
import { ApiError } from './access';
import { accountNames, membershipId } from './accounts';
import { db } from './database';
import { availability, bookingDay, bookAppointment, facilityPractitioner } from './scheduling';

const crmRoles = new Set(['crmCoordinator', 'crmAgent']);
const coordinator = (session: Session, facility: Facility) =>
  session.facilityAccess[facility.id]?.writes.includes('crm/assign');

export async function crmPatients(facility: Facility, session: Session, search: string) {
  if (!coordinator(session, facility))
    throw new ApiError(403, 'Only CRM coordinators can open a new enquiry.');
  const q = search.trim().toLowerCase().slice(0, 100);
  if (q.length < 2) return [];
  const patients = await db.patients
    .where('tenantId')
    .equals(facility.tenantId)
    .filter((row) => (row.name + ' ' + row.id).toLowerCase().includes(q))
    .limit(20)
    .toArray();
  return patients.map(({ id, name }) => ({ id, name }));
}

function bookingFor(
  enquiry: Enquiry,
  appointment: Appointment | undefined,
): EnquiryBooking | undefined {
  if (
    !appointment ||
    enquiry.appointmentId !== appointment.id ||
    appointment.patientId !== enquiry.patientId ||
    appointment.facilityId !== enquiry.facilityId
  )
    return undefined;
  const { id, day, time, status } = appointment;
  return { id, day, time, status };
}

export async function enquiryBookings(enquiries: readonly Enquiry[]) {
  const records = await db.appointments.bulkGet(
    enquiries.map((enquiry) => enquiry.appointmentId ?? ''),
  );
  return enquiries.map((enquiry, index) => bookingFor(enquiry, records[index]));
}

export async function crmData(facility: Facility, session: Session): Promise<CrmData> {
  const manage = coordinator(session, facility);
  const [enquiries, staff, practitioners] = await Promise.all([
    db.enquiries
      .where('facilityId')
      .equals(facility.id)
      .filter((enquiry) => !!manage || enquiry.assignee === session.account)
      .toArray(),
    db.memberships
      .where('facilityId')
      .equals(facility.id)
      .filter((member) => member.active && crmRoles.has(member.role))
      .toArray(),
    db.practitioners.where('facilityId').equals(facility.id).toArray(),
  ]);
  const [patients, bookings] = await Promise.all([
    db.patients.bulkGet(enquiries.map((enquiry) => enquiry.patientId)),
    enquiryBookings(enquiries),
  ]);
  const active = new Set(staff.map((member) => member.account));
  return {
    agents: manage
      ? staff
          .map(({ account }) => ({ account, name: accountNames[account] }))
          .sort((a, b) => a.name.localeCompare(b.name))
      : [],
    enquiries: enquiries
      .flatMap<EnquiryRow>((enquiry, index) => {
        const patient = patients[index];
        if (patient?.tenantId !== facility.tenantId) return [];
        const booking = bookings[index];
        return [
          {
            ...enquiry,
            patient: { id: patient.id, name: patient.name },
            booking,
            status: enquiryStatus(enquiry, booking),
            assignmentCurrent: active.has(enquiry.assignee ?? ''),
            assigneeName: enquiry.assignee ? accountNames[enquiry.assignee] : undefined,
          },
        ];
      })
      .sort((a, b) => b.changedAt - a.changedAt),
    practitioners,
  };
}

async function authorizedEnquiry(facility: Facility, session: Session, id: unknown) {
  const enquiry = typeof id === 'string' ? await db.enquiries.get(id) : undefined;
  if (
    enquiry?.facilityId !== facility.id ||
    (!coordinator(session, facility) && enquiry.assignee !== session.account)
  )
    throw new ApiError(404, 'Enquiry unavailable at this facility.');
  if ((await db.patients.get(enquiry.patientId))?.tenantId !== facility.tenantId)
    throw new ApiError(404, 'Enquiry unavailable at this facility.');
  return enquiry;
}

async function bookingEnquiry(
  enquiry: Enquiry,
  facility: Facility,
  session: Session,
  practitionerId: unknown,
) {
  if (enquiry.assignee !== session.account)
    throw new ApiError(403, 'Only the assigned contact agent can book this enquiry.');
  const [current] = await enquiryBookings([enquiry]);
  if (enquiryStatus(enquiry, current) !== 'Contacted')
    throw new ApiError(409, 'Record that the patient was reached before booking.');
  const clinician = await facilityPractitioner(
    facility,
    typeof practitionerId === 'string' ? practitionerId : '',
  );
  if (clinician.specialty !== enquiry.specialty)
    throw new ApiError(422, 'Choose a clinician in the enquiry specialty.');
  return clinician.id;
}

export async function crmAvailability(
  facility: Facility,
  session: Session,
  params: URLSearchParams,
) {
  const enquiry = await authorizedEnquiry(facility, session, params.get('enquiryId'));
  const clinician = await bookingEnquiry(enquiry, facility, session, params.get('practitionerId'));
  return availability(facility, clinician, params.get('day') ?? '', undefined, enquiry.patientId);
}

export async function crmCommand(
  facility: Facility,
  session: Session,
  body: Record<string, unknown>,
  create: boolean,
): Promise<DomainEvent> {
  const now = Date.now();
  const manage = coordinator(session, facility);
  const event = (type: DomainEvent['type'], entityId: string) => ({
    type,
    entityId,
    facilityId: facility.id,
    occurredAt: now,
    actor: session.account,
  });
  if (create) {
    if (!manage) throw new ApiError(403, 'Only CRM coordinators can open a new enquiry.');
    const patient =
      typeof body['patientId'] === 'string' ? await db.patients.get(body['patientId']) : undefined;
    if (patient?.tenantId !== facility.tenantId)
      throw new ApiError(404, 'Patient unavailable at this facility.');
    const source = enquirySources.find((value) => value === body['source']);
    const specialty = specialties.find((value) => value === body['specialty']);
    if (!source || !specialty) throw new ApiError(422, 'Choose an enquiry source and specialty.');
    const existing = await db.enquiries
      .where('[facilityId+patientId]')
      .equals([facility.id, patient.id])
      .filter((record) => record.specialty === specialty && !record.closedReason)
      .toArray();
    const bookings = await enquiryBookings(existing);
    if (existing.some((record, index) => enquiryStatus(record, bookings[index]) !== 'Booked')) {
      throw new ApiError(409, 'This patient already has an open enquiry for this specialty.');
    }
    const id = crypto.randomUUID();
    await db.enquiries.add({
      id,
      facilityId: facility.id,
      patientId: patient.id,
      source,
      specialty,
      version: 1,
      createdAt: now,
      changedAt: now,
      attempts: [],
    });
    return event('EnquiryCaptured', id);
  }
  const enquiry = await authorizedEnquiry(facility, session, body['enquiryId']);
  if (body['version'] !== String(enquiry.version))
    throw new ApiError(409, 'This enquiry changed. Refresh and try again.');
  const [current] = await enquiryBookings([enquiry]);
  const state = enquiryStatus(enquiry, current);
  if (state === 'Closed' || state === 'Booked')
    throw new ApiError(409, 'This enquiry has no open contact task.');
  const next: Partial<Enquiry> = { changedAt: now, version: enquiry.version + 1 };
  switch (body['action']) {
    case 'assign': {
      if (!manage) throw new ApiError(403, 'Only CRM coordinators can assign follow-up.');
      const member =
        typeof body['assignee'] === 'string'
          ? await db.memberships.get(membershipId(body['assignee'], facility.id))
          : undefined;
      if (
        !member?.active ||
        !crmRoles.has(member.role) ||
        typeof body['followUpOn'] !== 'string' ||
        !body['followUpOn']
      )
        throw new ApiError(422, 'Choose an active contact agent and a follow-up date.');
      next.assignee = member.account;
      next.followUpOn = bookingDay(body['followUpOn']);
      break;
    }
    case 'contact': {
      if (enquiry.assignee !== session.account)
        throw new ApiError(403, 'Only the assigned contact agent can log the outcome.');
      const outcome = contactOutcomes.find((value) => value === body['outcome']);
      if (!outcome) throw new ApiError(422, 'Choose a contact outcome.');
      next.attempts = [
        ...enquiry.attempts,
        { id: crypto.randomUUID(), outcome, occurredAt: now, actor: session.account },
      ];
      break;
    }
    case 'book': {
      const practitionerId = await bookingEnquiry(
        enquiry,
        facility,
        session,
        body['practitionerId'],
      );
      if (typeof body['day'] !== 'string' || !body['day'] || typeof body['time'] !== 'string')
        throw new ApiError(422, 'Choose an appointment date and time.');
      const appointment = await bookAppointment(facility, {
        patientId: enquiry.patientId,
        practitionerId,
        day: bookingDay(body['day']),
        time: body['time'],
        channel: 'Scheduled',
      });
      next.appointmentId = appointment.id;
      await db.events.add({
        ...event('AppointmentBooked', appointment.id),
        id: crypto.randomUUID(),
      });
      break;
    }
    case 'close': {
      if (!manage && enquiry.assignee !== session.account)
        throw new ApiError(403, 'This contact task belongs to another agent.');
      const reason = enquiryReasons.find((value) => value === body['reason']);
      if (!reason) throw new ApiError(422, 'Choose a reason for closing the enquiry.');
      next.closedReason = reason;
      break;
    }
    default:
      throw new ApiError(422, 'Choose an enquiry action.');
  }
  await db.enquiries.update(enquiry.id, next);
  return event('EnquiryUpdated', enquiry.id);
}
