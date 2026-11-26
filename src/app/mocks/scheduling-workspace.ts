import {
  dayInIndia,
  type Appointment,
  type DomainEvent,
  type Facility,
} from '../domain/operations';
import {
  exceptionReasons,
  scheduleBoundaries,
  type SchedulingDay,
  type WaitlistRow,
} from '../domain/scheduling';
import { ApiError } from './access';
import { db } from './database';
import { checkedDay } from './queries';
import {
  availableSlots,
  bookAppointment,
  bookingDay,
  facilityPractitioner,
  includesTime,
} from './scheduling';

function dailyAppointments(facility: Facility, day: string) {
  return db.appointments.where('[facilityId+day]').equals([facility.id, day]);
}

export async function schedulingDay(
  facility: Facility,
  params: URLSearchParams,
): Promise<SchedulingDay> {
  const day = checkedDay(params.get('day'));
  const [practitioners, entries, blocks, appointments] = await Promise.all([
    db.practitioners.where('facilityId').equals(facility.id).toArray(),
    db.waitlist.where('[facilityId+day]').equals([facility.id, day]).toArray(),
    db.scheduleExceptions.where('[facilityId+day]').equals([facility.id, day]).toArray(),
    dailyAppointments(facility, day).toArray(),
  ]);
  const patients = await db.patients.bulkGet([...new Set(entries.map((entry) => entry.patientId))]);
  const patientMap = new Map(
    patients.flatMap((patient) =>
      patient?.tenantId === facility.tenantId ? [[patient.id, patient.name] as const] : [],
    ),
  );
  const booked = await db.appointments.bulkGet(
    entries.flatMap((entry) => (entry.appointmentId ? [entry.appointmentId] : [])),
  );
  const bookedMap = new Map(
    booked.flatMap((item) => (item?.facilityId === facility.id ? [[item.id, item] as const] : [])),
  );
  const clinicianMap = new Map(practitioners.map((clinician) => [clinician.id, clinician.name]));
  const past = day < dayInIndia();
  const openTimes = new Map(
    practitioners.map(
      ({ id }) =>
        [
          id,
          availableSlots(
            appointments.filter((row) => row.practitionerId === id),
            blocks.filter((row) => row.practitionerId === id && row.releasedAt === undefined),
          ),
        ] as const,
    ),
  );
  const waitlist = entries
    .sort((a, b) => a.requestedAt - b.requestedAt || a.id.localeCompare(b.id))
    .flatMap((entry): WaitlistRow[] => {
      const patient = patientMap.get(entry.patientId);
      const practitioner = clinicianMap.get(entry.practitionerId);
      if (!patient || !practitioner) return [];
      const status = entry.status === 'Waiting' && past ? 'Expired' : entry.status;
      const appointment = entry.appointmentId ? bookedMap.get(entry.appointmentId) : undefined;
      const matchingAppointment =
        appointment?.patientId === entry.patientId ? appointment : undefined;
      const conflicting = appointments.filter(
        (row) => row.patientId === entry.patientId && row.status !== 'Cancelled',
      );
      const canBook = status === 'Waiting' && !alreadyBooked(conflicting, entry.practitionerId);
      const availableTimes = canBook
        ? (openTimes.get(entry.practitionerId) ?? []).filter(
            (time) => !conflicting.some((existing) => existing.time === time),
          )
        : [];
      return [
        {
          id: entry.id,
          patient,
          patientId: entry.patientId,
          practitioner,
          practitionerId: entry.practitionerId,
          requestedAt: entry.requestedAt,
          status,
          version: entry.version,
          availableTimes,
          bookedTime: matchingAppointment?.time,
          bookedDay: matchingAppointment?.day,
          appointmentStatus: matchingAppointment?.status,
        },
      ];
    });
  return {
    practitioners,
    waitlist,
    exceptions: blocks
      .sort((a, b) => a.start.localeCompare(b.start) || a.createdAt - b.createdAt)
      .flatMap(({ facilityId: _facility, createdAt: _created, ...block }) => {
        const practitioner = clinicianMap.get(block.practitionerId);
        return practitioner ? [{ ...block, practitioner }] : [];
      }),
  };
}

function alreadyBooked(appointments: Appointment[], practitionerId: string) {
  return appointments.some(
    (row) => row.practitionerId === practitionerId && row.status !== 'Cancelled',
  );
}

function field(input: Record<string, unknown>, key: string) {
  const value = input[key];
  if (typeof value !== 'string' || !value || value.length > 100)
    throw new ApiError(422, 'Enter a valid ' + key + '.');
  return value;
}

export async function updateWaitlist(
  facility: Facility,
  path: string,
  input: Record<string, unknown>,
): Promise<{ type: DomainEvent['type']; id: string; pass?: string }> {
  if (path === 'scheduling/waitlist') {
    const day = bookingDay(field(input, 'day'));
    const patientId = field(input, 'patientId');
    const practitionerId = field(input, 'practitionerId');
    const [patient, , existing, appointments] = await Promise.all([
      db.patients.get(patientId),
      facilityPractitioner(facility, practitionerId),
      db.waitlist
        .where('[facilityId+day]')
        .equals([facility.id, day])
        .filter(
          (row) =>
            row.patientId === patientId &&
            row.practitionerId === practitionerId &&
            row.status === 'Waiting',
        )
        .first(),
      dailyAppointments(facility, day)
        .filter((row) => row.patientId === patientId)
        .toArray(),
    ]);
    if (patient?.tenantId !== facility.tenantId)
      throw new ApiError(404, 'Patient is unavailable at this facility.');
    if (existing)
      throw new ApiError(409, 'This patient is already waiting for this clinician on that date.');
    if (alreadyBooked(appointments, practitionerId))
      throw new ApiError(
        409,
        'This patient already has an appointment with this clinician on that date.',
      );
    const id = crypto.randomUUID();
    await db.waitlist.add({
      id,
      facilityId: facility.id,
      patientId,
      practitionerId,
      day,
      requestedAt: Date.now(),
      status: 'Waiting',
      version: 1,
    });
    return { type: 'WaitlistJoined', id };
  }

  const entry = await db.waitlist.get(field(input, 'entryId'));
  if (entry?.facilityId !== facility.id) throw new ApiError(404, 'Waitlist entry not found.');
  if (
    String(entry.version) !== input['version'] ||
    entry.status !== 'Waiting' ||
    entry.day < dayInIndia()
  ) {
    throw new ApiError(409, 'This waitlist entry has changed or is no longer active.');
  }
  if (input['action'] === 'withdraw') {
    await db.waitlist.update(entry.id, { status: 'Withdrawn', version: entry.version + 1 });
    return { type: 'WaitlistWithdrawn', id: entry.id };
  }
  if (input['action'] !== 'book') throw new ApiError(422, 'Choose a waitlist action.');
  const appointments = await dailyAppointments(facility, entry.day)
    .filter((row) => row.patientId === entry.patientId)
    .toArray();
  if (alreadyBooked(appointments, entry.practitionerId))
    throw new ApiError(
      409,
      'This patient already has an appointment with this clinician on that date.',
    );
  const appointment = await bookAppointment(facility, {
    patientId: entry.patientId,
    practitionerId: entry.practitionerId,
    day: entry.day,
    time: field(input, 'time'),
    channel: 'Scheduled',
  });
  await db.waitlist.update(entry.id, {
    status: 'Booked',
    appointmentId: appointment.id,
    version: entry.version + 1,
  });
  return { type: 'WaitlistBooked', id: appointment.id, pass: appointment.pass };
}

export async function updateException(
  facility: Facility,
  path: string,
  input: Record<string, unknown>,
): Promise<{ type: DomainEvent['type']; id: string }> {
  if (path === 'scheduling/exceptions/release') {
    const block = await db.scheduleExceptions.get(field(input, 'exceptionId'));
    if (block?.facilityId !== facility.id) throw new ApiError(404, 'Schedule block not found.');
    if (block.releasedAt !== undefined || block.day < dayInIndia())
      throw new ApiError(409, 'This schedule block is no longer active.');
    await db.scheduleExceptions.update(block.id, { releasedAt: Date.now() });
    return { type: 'ScheduleExceptionReleased', id: block.id };
  }

  const day = bookingDay(field(input, 'day'));
  const practitionerId = field(input, 'practitionerId');
  await facilityPractitioner(facility, practitionerId);
  const start = field(input, 'start');
  const end = field(input, 'end');
  const reason = exceptionReasons.find((value) => value === input['reason']);
  if (
    !scheduleBoundaries.includes(start) ||
    !scheduleBoundaries.includes(end) ||
    start >= end ||
    !reason
  ) {
    throw new ApiError(422, 'Choose a valid time range and a reason.');
  }
  const [overlap, occupied] = await Promise.all([
    db.scheduleExceptions
      .where('[facilityId+practitionerId+day]')
      .equals([facility.id, practitionerId, day])
      .filter((row) => row.releasedAt === undefined && row.start < end && row.end > start)
      .first(),
    dailyAppointments(facility, day)
      .filter(
        (row) =>
          row.practitionerId === practitionerId &&
          row.status !== 'Cancelled' &&
          includesTime({ start, end }, row.time),
      )
      .first(),
  ]);
  if (overlap) throw new ApiError(409, 'This range overlaps an active schedule block.');
  if (occupied)
    throw new ApiError(
      409,
      'This range contains an existing appointment. Move or cancel the appointment before blocking this time.',
    );
  const id = crypto.randomUUID();
  await db.scheduleExceptions.add({
    id,
    facilityId: facility.id,
    practitionerId,
    day,
    start,
    end,
    reason,
    createdAt: Date.now(),
  });
  return { type: 'ScheduleExceptionCreated', id };
}
