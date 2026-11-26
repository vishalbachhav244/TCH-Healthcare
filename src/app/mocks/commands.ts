import {
  dayInIndia,
  invoiceTotal,
  observations,
  type Appointment,
  type DomainEvent,
  type Facility,
  type Observation,
} from '../domain/operations';
import { ApiError, patientSubject, requireSession, scope } from './access';
import { db } from './database';
import { assertAvailable, bookingDay, facilityPractitioner } from './scheduling';
import { createPatient } from './seed';
import { inpatientCommand } from './inpatient';
import { laboratoryCommand } from './laboratory';
import { pharmacyCommand } from './pharmacy';

export const services = [
  { description: 'Outpatient consultation', unitMinor: 75000 },
  { description: 'Specialist consultation', unitMinor: 125000 },
] as const;

function input(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body))
    throw new ApiError(422, 'Invalid request.');
  return body as Record<string, unknown>;
}

function field(body: Record<string, unknown>, key: string) {
  const value = body[key];
  if (typeof value !== 'string' || !value || value.length > 100)
    throw new ApiError(422, 'Select a valid ' + key + '.');
  return value;
}

function event(facility: Facility, type: DomainEvent['type'], entityId: string): DomainEvent {
  return { facilityId: facility.id, type, entityId, occurredAt: Date.now() };
}

async function appointmentAt(facility: Facility, id: string) {
  const appointment = await db.appointments.get(id);
  if (appointment?.facilityId !== facility.id) throw new ApiError(404, 'Appointment not found.');
  return appointment;
}

export async function command(
  path: string,
  body: unknown,
  token: string,
  facilityId: string | null,
) {
  const payload = input(body);
  return db.transaction(
    'rw',
    [
      db.patients,
      db.practitioners,
      db.appointments,
      db.tickets,
      db.encounters,
      db.invoices,
      db.payments,
      db.alerts,
      db.events,
      db.beds,
      db.admissions,
      db.labOrders,
      db.facilities,
      db.memberships,
      db.sessions,
      db.prescriptions,
      db.stockLots,
      db.stockMovements,
    ],
    async () => {
      const session = await requireSession(token);
      const facilityRecord = facilityId ? await db.facilities.get(facilityId) : undefined;
      let changed: DomainEvent;
      let pass: string | undefined;
      switch (path) {
        case 'patients': {
          const facility = scope(session, facilityRecord, 'D09', 'patients');
          const code = field(payload, 'registrationCode').toUpperCase();
          if (!/^REG-[0-9]{4}$/.test(code))
            throw new ApiError(422, 'Use an issued registration code in the form REG-1001.');
          const index = 1_000 + Number(code.slice(4));
          const patient = createPatient(facility.tenantId, index);
          if (await db.patients.get(patient.id))
            throw new ApiError(409, 'This registration code is already assigned to a patient.');
          await db.patients.add(patient);
          changed = event(facility, 'PatientRegistered', patient.id);
          break;
        }
        case 'appointments':
        case 'portal/appointments': {
          const selfService = path === 'portal/appointments';
          const facility = selfService
            ? scope(session, facilityRecord, 'D12', 'portal')
            : scope(session, facilityRecord, 'D10', 'appointments');
          const patientId = selfService ? patientSubject(session) : field(payload, 'patientId');
          const practitionerId = field(payload, 'practitionerId');
          const day = bookingDay(field(payload, 'day'));
          const time = field(payload, 'time');
          await assertAvailable(facility, patientId, practitionerId, day, time);
          pass = crypto.randomUUID();
          const appointment: Appointment = {
            id: crypto.randomUUID(),
            facilityId: facility.id,
            day,
            time,
            patientId,
            practitionerId,
            channel: !selfService && payload['channel'] === 'Walk-in' ? 'Walk-in' : 'Scheduled',
            status: 'Booked',
            pass,
          };
          await db.appointments.add(appointment);
          changed = event(facility, 'AppointmentBooked', appointment.id);
          break;
        }
        case 'appointments/reschedule':
        case 'appointments/cancel': {
          const facility = scope(session, facilityRecord, 'D10', 'appointments');
          const appointment = await appointmentAt(facility, field(payload, 'appointmentId'));
          if (appointment.status !== 'Booked' || appointment.day < dayInIndia()) {
            throw new ApiError(409, 'Only upcoming booked appointments can be changed.');
          }
          const version = appointment.version ?? 0;
          if (field(payload, 'version') !== String(version))
            throw new ApiError(409, 'This appointment has changed. Refresh and try again.');
          if (path.endsWith('/cancel')) {
            await db.appointments.update(appointment.id, {
              status: 'Cancelled',
              pass: undefined,
              version: version + 1,
            });
            changed = event(facility, 'AppointmentCancelled', appointment.id);
          } else {
            const day = bookingDay(field(payload, 'day'));
            const time = field(payload, 'time');
            const practitionerId = field(payload, 'practitionerId');
            if (
              day === appointment.day &&
              time === appointment.time &&
              practitionerId === appointment.practitionerId
            ) {
              throw new ApiError(409, 'Choose a different appointment slot or clinician.');
            }
            await assertAvailable(
              facility,
              appointment.patientId,
              practitionerId,
              day,
              time,
              appointment.id,
            );
            pass = crypto.randomUUID();
            await db.appointments.update(appointment.id, {
              day,
              time,
              practitionerId,
              pass,
              version: version + 1,
            });
            changed = event(facility, 'AppointmentRescheduled', appointment.id);
          }
          break;
        }
        case 'queue/check-in': {
          const facility = scope(session, facilityRecord, 'D11', 'queue');
          const code = field(payload, 'pass').toLowerCase();
          if (!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/.test(code))
            throw new ApiError(422, 'Enter a valid appointment pass.');
          const appointment = await db.appointments.where('pass').equals(code).first();
          if (appointment?.facilityId !== facility.id)
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
          const number =
            tickets.reduce((largest, ticket) => Math.max(largest, ticket.number), 0) + 1;
          const id = crypto.randomUUID();
          await db.tickets.add({
            id,
            appointmentId: appointment.id,
            facilityId: facility.id,
            number,
            arrivedAt: Date.now(),
            status: 'Waiting',
          });
          await db.appointments.update(appointment.id, { status: 'Checked in' });
          changed = event(facility, 'PatientCheckedIn', appointment.id);
          break;
        }
        case 'portal/passes': {
          const facility = scope(session, facilityRecord, 'D12', 'portal');
          const appointment = await appointmentAt(facility, field(payload, 'appointmentId'));
          if (appointment.patientId !== patientSubject(session))
            throw new ApiError(404, 'Appointment not found.');
          if (appointment.status !== 'Booked' || appointment.day < dayInIndia())
            throw new ApiError(409, 'A pass is unavailable for this appointment.');
          if (appointment.pass)
            return { id: appointment.id, pass: appointment.pass, event: undefined };
          pass = crypto.randomUUID();
          await db.appointments.update(appointment.id, { pass });
          changed = event(facility, 'AppointmentPassIssued', appointment.id);
          break;
        }
        case 'queue/call':
        case 'queue/recall':
        case 'queue/skip':
        case 'queue/requeue':
        case 'queue/transfer': {
          const facility = scope(session, facilityRecord, 'D11', 'queue');
          const appointment = await appointmentAt(facility, field(payload, 'appointmentId'));
          const ticket = await db.tickets.where('appointmentId').equals(appointment.id).first();
          if (appointment.day !== dayInIndia())
            throw new ApiError(422, 'Only today’s tokens can be updated.');
          if (
            !ticket ||
            (payload['expectedStatus'] && payload['expectedStatus'] !== ticket.status)
          ) {
            throw new ApiError(409, 'This token has changed. Refresh and try again.');
          }
          if (path === 'queue/call' || path === 'queue/recall') {
            const recall = path === 'queue/recall';
            if (ticket.status !== (recall ? 'Called' : 'Waiting')) {
              throw new ApiError(
                409,
                recall
                  ? 'Only a called token can be recalled.'
                  : 'Only a waiting token can be called.',
              );
            }
            const now = Date.now();
            await db.tickets.update(ticket.id, {
              status: 'Called',
              calledAt: ticket.calledAt ?? now,
              lastCalledAt: now,
            });
            changed = event(
              facility,
              recall ? 'QueueTicketRecalled' : 'QueueTicketCalled',
              ticket.id,
            );
          } else if (path === 'queue/skip' || path === 'queue/requeue') {
            const requeue = path === 'queue/requeue';
            if (
              requeue ? ticket.status !== 'Skipped' : !['Called', 'Waiting'].includes(ticket.status)
            ) {
              throw new ApiError(409, 'This token is not eligible for the requested queue action.');
            }
            await db.tickets.update(ticket.id, { status: requeue ? 'Waiting' : 'Skipped' });
            changed = event(
              facility,
              requeue ? 'QueueTicketRequeued' : 'QueueTicketSkipped',
              ticket.id,
            );
          } else {
            if (!['Called', 'Waiting', 'Skipped'].includes(ticket.status))
              throw new ApiError(409, 'Only tokens awaiting consultation can be transferred.');
            if (payload['fromPractitionerId'] !== appointment.practitionerId)
              throw new ApiError(409, 'This token’s clinician has changed. Refresh and try again.');
            const practitioner = await facilityPractitioner(
              facility,
              field(payload, 'practitionerId'),
            );
            if (practitioner.id === appointment.practitionerId)
              throw new ApiError(409, 'Choose a different clinician.');
            await db.appointments.update(appointment.id, { practitionerId: practitioner.id });
            await db.tickets.update(ticket.id, { status: 'Waiting' });
            changed = event(facility, 'QueueTicketTransferred', ticket.id);
          }
          break;
        }
        case 'clinical/start':
        case 'clinical/complete': {
          const facility = scope(session, facilityRecord, 'D13', 'clinical');
          const appointment = await appointmentAt(facility, field(payload, 'appointmentId'));
          if (appointment.practitionerId !== session.facilityAccess[facility.id].practitionerId)
            throw new ApiError(403, 'Only the assigned clinician can update this encounter.');
          const ticket = await db.tickets.where('appointmentId').equals(appointment.id).first();
          if (!ticket || appointment.day !== dayInIndia())
            throw new ApiError(409, 'A current queue ticket is required.');
          if (path === 'clinical/start') {
            if (ticket.status !== 'Called')
              throw new ApiError(409, 'Call the patient before starting a consultation.');
            const id = crypto.randomUUID();
            await db.encounters.add({
              id,
              appointmentId: appointment.id,
              facilityId: facility.id,
              patientId: appointment.patientId,
              practitionerId: appointment.practitionerId,
              startedAt: Date.now(),
            });
            await db.tickets.update(ticket.id, { status: 'In consultation' });
            await db.appointments.update(appointment.id, { status: 'In consultation' });
            changed = event(facility, 'EncounterStarted', id);
          } else {
            const encounter = await db.encounters
              .where('appointmentId')
              .equals(appointment.id)
              .first();
            const observation = field(payload, 'observation');
            if (!observations.some((value) => value === observation))
              throw new ApiError(422, 'Select a listed consultation observation.');
            if (!encounter || ticket.status !== 'In consultation' || encounter.signedAt)
              throw new ApiError(409, 'The encounter cannot be signed at its current stage.');
            await db.encounters.update(encounter.id, {
              observation: observation as Observation,
              signedAt: Date.now(),
            });
            await db.tickets.update(ticket.id, { status: 'Completed' });
            await db.appointments.update(appointment.id, { status: 'Completed' });
            changed = event(facility, 'EncounterCompleted', encounter.id);
          }
          break;
        }
        case 'billing/invoices': {
          const facility = scope(session, facilityRecord, 'D24', 'billing');
          const encounter = await db.encounters.get(field(payload, 'encounterId'));
          if (encounter?.facilityId !== facility.id || !encounter.signedAt)
            throw new ApiError(404, 'No signed encounter is available for billing.');
          if (
            await db.invoices
              .where('encounterId')
              .equals(encounter.id)
              .filter((invoice) => !invoice.prescriptionId)
              .first()
          )
            throw new ApiError(409, 'This encounter already has an invoice.');
          const line = services.find((service) => service.description === payload['service']);
          if (!line) throw new ApiError(422, 'Select a listed service.');
          const id = crypto.randomUUID();
          await db.invoices.add({
            id,
            patientId: encounter.patientId,
            encounterId: encounter.id,
            facilityId: facility.id,
            day: dayInIndia(),
            lines: [{ ...line, quantity: 1 }],
          });
          changed = event(facility, 'InvoiceCreated', id);
          break;
        }
        case 'billing/payments': {
          const facility = scope(session, facilityRecord, 'D24', 'billing');
          const invoice = await db.invoices.get(field(payload, 'invoiceId'));
          if (invoice?.facilityId !== facility.id) throw new ApiError(404, 'Invoice not found.');
          const existing = await db.payments.where('invoiceId').equals(invoice.id).toArray();
          const amountMinor =
            invoiceTotal(invoice) - existing.reduce((sum, payment) => sum + payment.amountMinor, 0);
          if (amountMinor <= 0) throw new ApiError(409, 'This invoice has already been settled.');
          const id = crypto.randomUUID();
          await db.payments.add({ id, invoiceId: invoice.id, day: dayInIndia(), amountMinor });
          changed = event(facility, 'PaymentRecorded', id);
          break;
        }
        case 'alerts/acknowledge': {
          const facility = scope(session, facilityRecord, 'D06', 'overview');
          const alert = await db.alerts.get(field(payload, 'alertId'));
          if (alert?.facilityId !== facility.id) throw new ApiError(404, 'Alert not found.');
          if (alert.acknowledged)
            throw new ApiError(409, 'This alert has already been acknowledged.');
          await db.alerts.update(alert.id, { acknowledged: true });
          changed = event(facility, 'AlertAcknowledged', alert.id);
          break;
        }
        case 'admissions':
        case 'admissions/allocate':
        case 'admissions/discharge':
        case 'beds/release':
          changed = await inpatientCommand(
            path,
            scope(session, facilityRecord, 'D19', 'beds'),
            payload,
          );
          break;
        case 'clinical/lab-orders':
          changed = await laboratoryCommand(
            path,
            scope(session, facilityRecord, 'D13', 'clinical'),
            payload,
            session,
          );
          break;
        case 'clinical/prescriptions':
        case 'clinical/prescriptions/sign':
          changed = await pharmacyCommand(
            path,
            scope(session, facilityRecord, 'D13', 'clinical'),
            session,
            payload,
          );
          break;
        case 'pharmacy/dispense':
          changed = await pharmacyCommand(
            path,
            scope(session, facilityRecord, 'D22', 'pharmacy'),
            session,
            payload,
          );
          break;
        case 'laboratory/advance':
          changed = await laboratoryCommand(
            path,
            scope(session, facilityRecord, 'D20'),
            payload,
            session,
          );
          break;
        default:
          throw new ApiError(404, 'Operation not found.');
      }
      await db.events.add({ ...changed, id: crypto.randomUUID() });
      return { id: changed.entityId, event: changed, ...(pass ? { pass } : {}) };
    },
  );
}
