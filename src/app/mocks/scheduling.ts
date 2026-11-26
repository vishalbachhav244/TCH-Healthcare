import { dayInIndia, shiftDay, type Appointment, type Facility } from '../domain/operations';
import { ApiError } from './access';
import { db } from './database';
import { checkedDay } from './queries';

const slots = Array.from({ length: 32 }, (_, slot) => {
  const hour = String(9 + Math.floor(slot / 4)).padStart(2, '0');
  const minute = String((slot % 4) * 15).padStart(2, '0');
  return hour + ':' + minute;
});

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

export async function assertAvailable(
  facility: Facility,
  patientId: string,
  practitionerId: string,
  day: string,
  time: string,
  except?: string,
) {
  if (!slots.includes(time)) throw new ApiError(422, 'Choose a listed 15-minute appointment slot.');
  const [patient] = await Promise.all([
    db.patients.get(patientId),
    facilityPractitioner(facility, practitionerId),
  ]);
  if (patient?.tenantId !== facility.tenantId)
    throw new ApiError(404, 'Patient is unavailable at this facility.');
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

export async function availability(
  facility: Facility,
  practitionerId: string,
  value: string,
  excluding?: string,
) {
  const day = bookingDay(value);
  await facilityPractitioner(facility, practitionerId);
  const taken = await db.appointments
    .where('[facilityId+day]')
    .equals([facility.id, day])
    .filter(
      (row) =>
        row.practitionerId === practitionerId && row.status !== 'Cancelled' && row.id !== excluding,
    )
    .toArray();
  const occupied = new Set(taken.map((row) => row.time));
  return slots.filter((time) => !occupied.has(time));
}
