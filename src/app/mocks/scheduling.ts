import { dayInIndia, shiftDay, type Appointment, type Facility } from '../domain/operations';
import { appointmentSlots, type ScheduleException } from '../domain/scheduling';
import { ApiError } from './access';
import { db } from './database';
import { checkedDay } from './queries';

export function bookingDay(value: string) {
  const day = checkedDay(value);
  const today = dayInIndia();
  if (day < today || day > shiftDay(today, 90))
    throw new ApiError(422, 'Choose an appointment date within the next 90 days.');
  return day;
}

export async function facilityPractitioner(facility: Facility, practitionerId: string) {
  const practitioner = await db.practitioners.get(practitionerId);
  if (practitioner?.facilityId !== facility.id)
    throw new ApiError(404, 'Clinician is unavailable at this facility.');
  return practitioner;
}

function exceptionsFor(facility: Facility, practitionerId: string, day: string) {
  return db.scheduleExceptions
    .where('[facilityId+practitionerId+day]')
    .equals([facility.id, practitionerId, day])
    .filter((item) => item.releasedAt === undefined);
}

export function includesTime(block: Pick<ScheduleException, 'start' | 'end'>, time: string) {
  return time >= block.start && time < block.end;
}

export function availableSlots(appointments: Appointment[], blocks: ScheduleException[]) {
  const occupied = new Set(
    appointments.filter((row) => row.status !== 'Cancelled').map((row) => row.time),
  );
  return appointmentSlots.filter(
    (time) => !occupied.has(time) && !blocks.some((block) => includesTime(block, time)),
  );
}

export async function assertAvailable(
  facility: Facility,
  patientId: string,
  practitionerId: string,
  day: string,
  time: string,
  except?: string,
) {
  if (!appointmentSlots.includes(time))
    throw new ApiError(422, 'Choose a listed 15-minute appointment slot.');
  const [patient, , block] = await Promise.all([
    db.patients.get(patientId),
    facilityPractitioner(facility, practitionerId),
    exceptionsFor(facility, practitionerId, day)
      .and((row) => includesTime(row, time))
      .first(),
  ]);
  if (patient?.tenantId !== facility.tenantId)
    throw new ApiError(404, 'Patient is unavailable at this facility.');
  if (block) throw new ApiError(409, 'The clinician’s schedule is blocked at this time.');
  const scheduled = (item: Appointment) => item.id !== except && item.status !== 'Cancelled';
  const [occupied, overlapping] = await Promise.all([
    db.appointments
      .where('[facilityId+practitionerId+day+time]')
      .equals([facility.id, practitionerId, day, time])
      .filter(scheduled)
      .first(),
    db.appointments
      .where('[facilityId+day]')
      .equals([facility.id, day])
      .filter((item) => scheduled(item) && item.patientId === patientId && item.time === time)
      .first(),
  ]);
  if (occupied) throw new ApiError(409, 'The clinician already has an appointment at this time.');
  if (overlapping) throw new ApiError(409, 'This patient already has an appointment at this time.');
}

export async function bookAppointment(
  facility: Facility,
  fields: Pick<
    Appointment,
    'patientId' | 'practitionerId' | 'day' | 'time' | 'channel' | 'followUpId'
  >,
) {
  const { patientId, practitionerId, day, time } = fields;
  await assertAvailable(facility, patientId, practitionerId, day, time);
  const appointment = {
    ...fields,
    id: crypto.randomUUID(),
    facilityId: facility.id,
    status: 'Booked' as const,
    pass: crypto.randomUUID(),
  };
  await db.appointments.add(appointment);
  return appointment;
}

export async function availability(
  facility: Facility,
  practitionerId: string,
  value: string,
  excluding?: string,
  patientId?: string,
) {
  const day = bookingDay(value);
  await facilityPractitioner(facility, practitionerId);
  if (patientId && (await db.patients.get(patientId))?.tenantId !== facility.tenantId) {
    throw new ApiError(404, 'Patient is unavailable at this facility.');
  }
  const [appointments, blocks] = await Promise.all([
    db.appointments
      .where('[facilityId+day]')
      .equals([facility.id, day])
      .filter(
        (row) =>
          (row.practitionerId === practitionerId || row.patientId === patientId) &&
          row.id !== excluding,
      )
      .toArray(),
    exceptionsFor(facility, practitionerId, day).toArray(),
  ]);
  return availableSlots(appointments, blocks);
}
