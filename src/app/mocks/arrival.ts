import { dayInIndia, type Facility } from '../domain/operations';
import { appointmentPassPattern } from '../domain/scheduling';
import { ApiError } from './access';
import { db } from './database';
import { appointmentByFamilyPass } from './family-access';

export async function checkInAppointment(facility: Facility, value: unknown) {
  const code = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!appointmentPassPattern.test(code))
    throw new ApiError(422, 'Enter a valid appointment pass.');
  const appointment =
    (await db.appointments.where('pass').equals(code).first()) ??
    (await appointmentByFamilyPass(facility, code));
  if (appointment?.facilityId !== facility.id)
    throw new ApiError(404, 'Appointment pass not found for this facility.');
  const [patient, clinician] = await Promise.all([
    db.patients.get(appointment.patientId),
    db.practitioners.get(appointment.practitionerId),
  ]);
  if (patient?.tenantId !== facility.tenantId || clinician?.facilityId !== facility.id)
    throw new ApiError(404, 'Appointment pass not found for this facility.');
  if (appointment.day !== dayInIndia())
    throw new ApiError(422, 'This pass is valid only on the appointment date.');
  if (appointment.status !== 'Booked')
    throw new ApiError(409, 'The appointment has already been checked in or closed.');
  const sameDay = await db.appointments
    .where('[facilityId+day]')
    .equals([facility.id, appointment.day])
    .primaryKeys();
  const tickets = await db.tickets.where('appointmentId').anyOf(sameDay).toArray();
  const number = tickets.reduce((largest, ticket) => Math.max(largest, ticket.number), 0) + 1;
  await db.tickets.add({
    id: crypto.randomUUID(),
    appointmentId: appointment.id,
    facilityId: facility.id,
    number,
    arrivedAt: Date.now(),
    status: 'Waiting',
  });
  await db.appointments.update(appointment.id, { status: 'Checked in' });
  return { appointmentId: appointment.id, number };
}
