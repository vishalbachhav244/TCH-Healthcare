import {
  analyticsWindows,
  type AnalyticsDay,
  type AnalyticsReport,
  type SpecialtyActivity,
} from '../domain/intelligence';
import { dayInIndia, shiftDay, specialties, type Facility } from '../domain/operations';
import { ApiError } from './access';
import { db } from './database';
import { checkedDay } from './queries';

export async function analyticsReport(
  facility: Facility,
  params: URLSearchParams,
): Promise<AnalyticsReport> {
  const end = checkedDay(params.get('end'));
  const range = analyticsWindows.find((window) => String(window) === (params.get('window') ?? '7'));
  if (!range || end > dayInIndia() || end < '1900-01-01')
    throw new ApiError(422, 'Choose a 7, 14 or 30-day report ending today or earlier.');
  const days = Array.from(
    { length: range },
    (_, index): AnalyticsDay => ({
      day: shiftDay(end, index - range + 1),
      scheduled: 0,
      walkIn: 0,
      completed: 0,
      cancelled: 0,
      waitSamples: 0,
      waitMilliseconds: 0,
      netMinor: 0,
      postingCount: 0,
    }),
  );
  const dates = days.map((item) => item.day);
  const byDay = new Map(days.map((item) => [item.day, item]));
  const [appointments, practitioners, payments, refunds] = await Promise.all([
    db.appointments
      .where('[facilityId+day]')
      .between([facility.id, dates[0]], [facility.id, end], true, true)
      .toArray(),
    db.practitioners.where('facilityId').equals(facility.id).toArray(),
    db.payments.where('day').anyOf(dates).toArray(),
    db.refundDecisions
      .where('[facilityId+day]')
      .anyOf(dates.map((day) => [facility.id, day]))
      .toArray(),
  ]);
  const specialityByPractitioner = new Map(practitioners.map((item) => [item.id, item.specialty]));
  const [invoices, tickets] = await Promise.all([
    db.invoices.bulkGet([
      ...new Set([
        ...payments.map((entry) => entry.invoiceId),
        ...refunds.map((entry) => entry.invoiceId),
      ]),
    ]),
    db.tickets
      .where('appointmentId')
      .anyOf(appointments.map((item) => item.id))
      .filter((item) => item.facilityId === facility.id)
      .toArray(),
  ]);
  const patientIds = [
    ...new Set([
      ...appointments.map((item) => item.patientId),
      ...invoices.flatMap((item) => (item?.facilityId === facility.id ? [item.patientId] : [])),
    ]),
  ];
  const patients = new Set(
    (await db.patients.bulkGet(patientIds))
      .filter((item) => item?.tenantId === facility.tenantId)
      .map((item) => item!.id),
  );
  const invoiceIds = new Set(
    invoices.flatMap((item) =>
      item?.facilityId === facility.id && patients.has(item.patientId) ? [item.id] : [],
    ),
  );
  const departmentRows = new Map(
    specialties.map((specialty) => [
      specialty,
      {
        specialty,
        scheduled: 0,
        walkIn: 0,
        completed: 0,
      } satisfies SpecialtyActivity,
    ]),
  );
  const byAppointment = new Map(tickets.map((item) => [item.appointmentId, item]));
  for (const appointment of appointments) {
    const specialty = specialityByPractitioner.get(appointment.practitionerId);
    const day = byDay.get(appointment.day);
    if (!specialty || !day || !patients.has(appointment.patientId)) continue;
    if (appointment.status === 'Cancelled') {
      day.cancelled++;
      continue;
    }
    const department = departmentRows.get(specialty)!;
    const channel = appointment.channel === 'Scheduled' ? 'scheduled' : 'walkIn';
    day[channel]++;
    department[channel]++;
    if (appointment.status === 'Completed') {
      day.completed++;
      department.completed++;
    }
    const ticket = byAppointment.get(appointment.id);
    if (ticket?.calledAt !== undefined && ticket.calledAt >= ticket.arrivedAt) {
      day.waitSamples++;
      day.waitMilliseconds += ticket.calledAt - ticket.arrivedAt;
    }
  }
  for (const payment of payments) {
    const day = byDay.get(payment.day);
    if (!day || !invoiceIds.has(payment.invoiceId)) continue;
    day.netMinor += payment.amountMinor;
    day.postingCount++;
  }
  for (const refund of refunds) {
    const day = byDay.get(refund.day);
    if (!day || !invoiceIds.has(refund.invoiceId) || refund.outcome !== 'Record local refund')
      continue;
    day.netMinor -= refund.amountMinor;
    day.postingCount++;
  }
  return { days, specialties: [...departmentRows.values()] };
}
