import {
  dayInIndia,
  shiftDay,
  specialties,
  type Appointment,
  type AppointmentRow,
  type DashboardData,
  type Facility,
  type QueueDisplayData,
} from '../domain/operations';
import { db } from './database';
import { ApiError } from './access';
import { invoiceBalances } from './invoice-balances';

export function checkedDay(day: string | null) {
  if (!day) return dayInIndia();
  const value = Date.parse(day + 'T00:00:00Z');
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    !Number.isFinite(value) ||
    new Date(value).toISOString().slice(0, 10) !== day
  ) {
    throw new ApiError(422, 'Enter a valid date.');
  }
  return day;
}

function dailyAppointments(facility: Facility, day: string) {
  return db.appointments.where('[facilityId+day]').equals([facility.id, day]).toArray();
}

export async function queueDisplay(facilityId: string | null): Promise<QueueDisplayData> {
  // Public signage is configured explicitly for these facilities.
  const facility = facilityId ? await db.facilities.get(facilityId) : undefined;
  if (!facility?.publicQueue || facility.active === false)
    throw new ApiError(404, 'Queue display is unavailable at this facility.');
  const today = await dailyAppointments(facility, dayInIndia());
  const [tickets, practitioners] = await Promise.all([
    db.tickets
      .where('appointmentId')
      .anyOf(today.map((row) => row.id))
      .toArray(),
    db.practitioners.where('facilityId').equals(facility.id).toArray(),
  ]);
  const providerByAppointment = new Map(today.map((row) => [row.id, row.practitionerId]));
  const specialtyByProvider = new Map(practitioners.map((row) => [row.id, row.specialty]));
  return {
    facility: facility.name,
    calling: tickets
      .filter((row) => row.status === 'Called')
      .sort((a, b) => (b.lastCalledAt ?? b.calledAt ?? 0) - (a.lastCalledAt ?? a.calledAt ?? 0))
      .slice(0, 6)
      .flatMap((row) => {
        const provider = providerByAppointment.get(row.appointmentId);
        const specialty = provider ? specialtyByProvider.get(provider) : undefined;
        return specialty ? [{ number: row.number, specialty }] : [];
      }),
    waiting: tickets.filter((row) => row.status === 'Waiting').length,
  };
}

async function hydrate(
  facility: Facility,
  appointments: Appointment[],
  includeEncounters = false,
): Promise<AppointmentRow[]> {
  const ids = appointments.map((row) => row.id);
  const [patients, providers, tickets, encounters] = await Promise.all([
    db.patients.bulkGet(appointments.map((row) => row.patientId)),
    db.practitioners.bulkGet(appointments.map((row) => row.practitionerId)),
    db.tickets.where('appointmentId').anyOf(ids).toArray(),
    includeEncounters
      ? db.encounters
          .where('appointmentId')
          .anyOf(ids)
          .filter((row) => row.facilityId === facility.id)
          .toArray()
      : [],
  ]);
  const ticketByAppointment = new Map(tickets.map((ticket) => [ticket.appointmentId, ticket]));
  const encounterByAppointment = new Map(encounters.map((row) => [row.appointmentId, row]));
  return appointments.flatMap((appointment, i) => {
    const patient = patients[i];
    const practitioner = providers[i];
    if (patient?.tenantId !== facility.tenantId || practitioner?.facilityId !== facility.id)
      return [];
    // Passes are delivered by the dedicated pass endpoint.
    const { pass: _pass, ...publicAppointment } = appointment;
    const encounter = encounterByAppointment.get(appointment.id);
    return [
      {
        appointment: publicAppointment,
        patient,
        practitioner,
        ticket: ticketByAppointment.get(appointment.id),
        ...(encounter?.patientId === patient.id && encounter.practitionerId === practitioner.id
          ? { encounter }
          : {}),
      },
    ];
  });
}

export async function appointments(
  facility: Facility,
  day: string,
  params: URLSearchParams,
  mode: 'all' | 'queue' | 'clinical',
  practitionerId?: string,
) {
  let appointmentList = await dailyAppointments(facility, day);
  if (mode === 'clinical')
    appointmentList = appointmentList.filter((item) => item.practitionerId === practitionerId);
  let rows = await hydrate(facility, appointmentList, mode === 'clinical');
  if (mode === 'queue')
    rows = rows.filter((row) => row.ticket && row.ticket.status !== 'Completed');
  if (mode === 'clinical') rows = rows.filter((row) => row.ticket);
  const search = (params.get('q') ?? '').trim().toLowerCase().slice(0, 100);
  if (search)
    rows = rows.filter((row) =>
      [row.patient.name, row.patient.id, row.practitioner.name, row.practitioner.specialty].some(
        (text) => text.toLowerCase().includes(search),
      ),
    );
  const status = params.get('status');
  if (status)
    rows = rows.filter(
      (row) => (mode === 'queue' ? row.ticket?.status : row.appointment.status) === status,
    );
  rows.sort((a, b) =>
    mode === 'queue'
      ? (a.ticket?.arrivedAt ?? 0) - (b.ticket?.arrivedAt ?? 0)
      : a.appointment.time.localeCompare(b.appointment.time) ||
        a.patient.name.localeCompare(b.patient.name),
  );
  const parsedOffset = Number(params.get('offset'));
  const offset = Number.isSafeInteger(parsedOffset) ? Math.max(0, parsedOffset) : 0;
  return { items: rows.slice(offset, offset + 12), total: rows.length };
}

export async function dashboard(
  facility: Facility,
  day: string,
  range: number,
  includeAppointmentActivity = true,
): Promise<DashboardData> {
  const slots = Array.from({ length: range }, (_, i) => shiftDay(day, i - range + 1));
  const priorDay = shiftDay(day, -1);
  const [forPeriod, prior, providers, beds, alerts, datedPayments, refunds] = await Promise.all([
    db.appointments
      .where('[facilityId+day]')
      .between([facility.id, slots[0]], [facility.id, day], true, true)
      .toArray(),
    dailyAppointments(facility, priorDay),
    db.practitioners.where('facilityId').equals(facility.id).toArray(),
    facility.inpatient ? db.beds.where('facilityId').equals(facility.id).toArray() : [],
    db.alerts.where('facilityId').equals(facility.id).toArray(),
    db.payments.where('day').anyOf([priorDay, day]).toArray(),
    db.refundDecisions
      .where('[facilityId+day]')
      .anyOf([
        [facility.id, priorDay],
        [facility.id, day],
      ])
      .toArray(),
  ]);
  const today = forPeriod.filter((item) => item.day === day);
  const [tickets, paymentInvoices] = await Promise.all([
    db.tickets
      .where('appointmentId')
      .anyOf(today.map((item) => item.id))
      .toArray(),
    db.invoices.bulkGet(datedPayments.map((payment) => payment.invoiceId)),
  ]);
  const payments = datedPayments.filter(
    (_, index) => paymentInvoices[index]?.facilityId === facility.id,
  );
  const available = today.filter((appointment) => appointment.status !== 'Cancelled');
  const visits = tickets.filter((ticket) => ticket.calledAt !== undefined);
  const average = visits.length
    ? Math.round(
        visits.reduce(
          (total, ticket) => total + ((ticket.calledAt ?? ticket.arrivedAt) - ticket.arrivedAt),
          0,
        ) /
          visits.length /
          60_000,
      )
    : 0;
  const providerMap = new Map(providers.map((item) => [item.id, item.specialty]));
  const revenue = (on: string) =>
    payments
      .filter((payment) => payment.day === on)
      .reduce((sum, payment) => sum + payment.amountMinor, 0) -
    refunds
      .filter((refund) => refund.day === on)
      .reduce((sum, refund) => sum + refund.amountMinor, 0);
  return {
    days: slots.map((on) => {
      const rows = forPeriod.filter((row) => row.day === on && row.status !== 'Cancelled');
      const scheduled = rows.filter((row) => row.channel === 'Scheduled').length;
      return { day: on, scheduled, walkIn: rows.length - scheduled };
    }),
    metrics: {
      appointments: available.length,
      priorAppointments: prior.filter((row) => row.status !== 'Cancelled').length,
      activeQueue: tickets.filter((ticket) =>
        ['Waiting', 'Called', 'In consultation'].includes(ticket.status),
      ).length,
      averageWait: average,
      bedCapacity: beds.filter((bed) => bed.status !== 'Maintenance').length,
      bedsOccupied: beds.filter((bed) => bed.status === 'Occupied').length,
      revenueMinor: revenue(day),
      priorRevenueMinor: revenue(priorDay),
    },
    departments: specialties.map((name) => {
      const rows = available.filter((row) => providerMap.get(row.practitionerId) === name);
      return {
        name,
        appointments: rows.length,
        completed: rows.filter((row) => row.status === 'Completed').length,
        waiting: rows.filter((row) => row.status === 'Checked in').length,
      };
    }),
    alerts,
    appointments: includeAppointmentActivity
      ? await hydrate(
          facility,
          [...available].sort((a, b) => appointmentOrder(a) - appointmentOrder(b)).slice(0, 5),
        )
      : [],
  };
}

function appointmentOrder(appointment: Appointment) {
  const status = ['Checked in', 'In consultation', 'Booked', 'Completed', 'Cancelled'].indexOf(
    appointment.status,
  );
  return status * 10_000 + Number(appointment.time.replace(':', ''));
}

export async function invoiceRows(facility: Facility, day: string) {
  const invoices = await db.invoices
    .where('[facilityId+day]')
    .equals([facility.id, day])
    .limit(200)
    .toArray();
  const [patients, balances] = await Promise.all([
    db.patients.bulkGet(invoices.map((invoice) => invoice.patientId)),
    invoiceBalances(invoices),
  ]);
  return invoices
    .flatMap((invoice, i) => {
      const patient = patients[i];
      if (patient?.tenantId !== facility.tenantId) return [];
      return [{ invoice, patient, ...balances.get(invoice.id)! }];
    })
    .sort((a, b) => b.balanceMinor - a.balanceMinor);
}
