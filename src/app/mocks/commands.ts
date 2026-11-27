import {
  dayInIndia,
  observations,
  type DomainEvent,
  type Facility,
  type Observation,
} from '../domain/operations';
import { ApiError, patientSubject, requireSession, scope } from './access';
import { db } from './database';
import { assertAvailable, bookAppointment, bookingDay, facilityPractitioner } from './scheduling';
import { updateException, updateWaitlist } from './scheduling-workspace';
import {
  bookFollowUp,
  changeFollowUpAppointment,
  requestFollowUp,
  withdrawFollowUp,
} from './continuity';
import { createPatient } from './seed';
import { inpatientCommand } from './inpatient';
import { dischargePlanCommand } from './discharge';
import { issueInpatientInvoice } from './inpatient-billing';
import { laboratoryCommand } from './laboratory';
import { requestImaging, updateImaging } from './radiology';
import { updateBloodRequest, wardBloodCommand } from './blood-bank';
import { pharmacyCommand } from './pharmacy';
import { stockCommand } from './pharmacy-stock';
import { invoiceBalances } from './invoice-balances';
import { closeCollections, decideRefund, requireOpenCollectionDay } from './finance';
import { claimCommand, recordCoverage } from './insurance';
import { postGoodsReceipt, recordStockCount } from './inventory';
import { purchaseOrderCommand, requisitionCommand } from './procurement';
import { workforceCommand } from './workforce';
import { biomedicalCommand } from './biomedical';
import { supportCommand } from './support';
import { transportCommand } from './transport';
import { crmCommand } from './crm';
import { campaignCommand, updateContactPreferences } from './marketing';
import { automationCommand } from './automation';
import { documentCommand } from './patient-documents';
import { bookFamilyVisit, changeFamilyAccess, issueFamilyPass } from './family-access';
import { checkInAppointment } from './arrival';
import { requireDiscovery } from './public-care';
import { checkedDay } from './queries';
import { governanceCommand } from './governance';
import { assignWardTeam, wardCareCommand } from './ward-care';
import { criticalCareCommand, emergencyCommand, theatreCommand } from './acute-care';

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
      db.patientAccounts,
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
      db.refundDecisions,
      db.collectionCloses,
      db.insuranceCoverages,
      db.insuranceClaims,
      db.suppliers,
      db.supplyRequisitions,
      db.purchaseOrders,
      db.goodsReceipts,
      db.staffShifts,
      db.biomedicalAssets,
      db.maintenanceOrders,
      db.supportTasks,
      db.transportRequests,
      db.transportUnits,
      db.enquiries,
      db.campaigns,
      db.engagementPermissions,
      db.automationPolicies,
      db.documentationDrafts,
      db.patientDocuments,
      db.familyRelationships,
      db.familyPasses,
      db.clinicalReviews,
      db.qualityCases,
      db.waitlist,
      db.scheduleExceptions,
      db.followUps,
      db.wardAssignments,
      db.wardRounds,
      db.wardOrders,
      db.nursingTasks,
      db.wardObservations,
      db.emergencyCases,
      db.icuReviews,
      db.icuStepDowns,
      db.theatreCases,
      db.dischargePlans,
      db.bedStays,
      db.inpatientAccounts,
      db.imagingOrders,
      db.bloodRequests,
      db.bloodUnits,
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
        case 'public/appointments':
        case 'portal/appointments': {
          const selfService = path !== 'appointments';
          const facility = selfService
            ? scope(session, facilityRecord, 'D12', 'portal')
            : scope(session, facilityRecord, 'D10', 'appointments');
          if (path === 'public/appointments') requireDiscovery(facility);
          const patientId = selfService ? patientSubject(session) : field(payload, 'patientId');
          const practitionerId = field(payload, 'practitionerId');
          const day = bookingDay(field(payload, 'day'));
          const time = field(payload, 'time');
          const appointment = await bookAppointment(facility, {
            day,
            time,
            patientId,
            practitionerId,
            channel: !selfService && payload['channel'] === 'Walk-in' ? 'Walk-in' : 'Scheduled',
          });
          pass = appointment.pass;
          changed = {
            ...event(facility, 'AppointmentBooked', appointment.id),
            actor: session.account,
          };
          break;
        }
        case 'scheduling/waitlist':
        case 'scheduling/waitlist/status': {
          const facility = scope(session, facilityRecord, 'D10', 'appointments');
          const result = await updateWaitlist(facility, path, payload);
          changed = { ...event(facility, result.type, result.id), actor: session.account };
          pass = result.pass;
          break;
        }
        case 'scheduling/exceptions':
        case 'scheduling/exceptions/release': {
          const facility = scope(session, facilityRecord, 'D10', 'schedule-exceptions');
          const result = await updateException(facility, path, payload);
          changed = { ...event(facility, result.type, result.id), actor: session.account };
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
            await changeFollowUpAppointment(appointment);
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
            await changeFollowUpAppointment(appointment, { day, practitionerId });
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
        case 'clinical/follow-ups':
        case 'clinical/follow-ups/withdraw': {
          const facility = scope(session, facilityRecord, 'D13', 'clinical');
          const withdrawing = path.endsWith('/withdraw');
          const id = withdrawing
            ? await withdrawFollowUp(facility, session, payload)
            : await requestFollowUp(facility, session, payload);
          changed = {
            ...event(facility, withdrawing ? 'FollowUpWithdrawn' : 'FollowUpRequested', id),
            actor: session.account,
          };
          break;
        }
        case 'appointments/follow-ups/book':
        case 'portal/follow-ups/book': {
          const selfService = path === 'portal/follow-ups/book';
          const facility = selfService
            ? scope(session, facilityRecord, 'D12', 'portal')
            : scope(session, facilityRecord, 'D10', 'appointments');
          const appointment = await bookFollowUp(facility, session, payload, selfService);
          pass = appointment.pass;
          changed = {
            ...event(facility, 'FollowUpBooked', appointment.id),
            actor: session.account,
          };
          break;
        }
        case 'queue/check-in': {
          const facility = scope(session, facilityRecord, 'D11', 'queue');
          const { appointmentId } = await checkInAppointment(facility, payload['pass']);
          changed = event(facility, 'PatientCheckedIn', appointmentId);
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
        case 'billing/inpatient/invoices': {
          const facility = scope(session, facilityRecord, 'D24', 'billing');
          if (!facility.inpatient)
            throw new ApiError(403, 'Inpatient services are disabled at this facility.');
          const id = await issueInpatientInvoice(
            facility,
            field(payload, 'admissionId'),
            payload['acknowledgePartial'],
          );
          changed = event(facility, 'InvoiceCreated', id);
          break;
        }
        case 'billing/payments': {
          const facility = scope(session, facilityRecord, 'D24', 'billing');
          const invoice = await db.invoices.get(field(payload, 'invoiceId'));
          if (invoice?.facilityId !== facility.id) throw new ApiError(404, 'Invoice not found.');
          const { balanceMinor: amountMinor, insurancePending } = (
            await invoiceBalances([invoice])
          ).get(invoice.id)!;
          if (insurancePending)
            throw new ApiError(409, 'Patient settlement is on hold while insurance is pending.');
          if (amountMinor <= 0) throw new ApiError(409, 'This invoice has no outstanding balance.');
          const day = dayInIndia();
          await requireOpenCollectionDay(facility.id, day);
          const id = crypto.randomUUID();
          await db.payments.add({ id, invoiceId: invoice.id, day, amountMinor });
          changed = event(facility, 'PaymentRecorded', id);
          break;
        }
        case 'finance/closes':
          changed = await closeCollections(
            scope(session, facilityRecord, 'D25', 'finance'),
            session,
            checkedDay(field(payload, 'day')),
            payload['countedMinor'],
          );
          break;
        case 'finance/refund-reviews':
          changed = await decideRefund(
            scope(session, facilityRecord, 'D25', 'finance'),
            session,
            payload,
          );
          break;
        case 'insurance/coverage':
          changed = await recordCoverage(
            scope(session, facilityRecord, 'D26', 'insurance'),
            session,
            payload,
          );
          break;
        case 'insurance/claims':
        case 'insurance/claims/status':
          changed = await claimCommand(
            scope(session, facilityRecord, 'D26', 'insurance'),
            session,
            payload,
            path === 'insurance/claims',
          );
          break;
        case 'inventory/requisitions':
        case 'inventory/requisitions/withdraw':
          changed = await requisitionCommand(
            scope(session, facilityRecord, 'D27', 'inventory'),
            session,
            payload,
            path.endsWith('/withdraw') ? 'withdraw' : 'create',
          );
          break;
        case 'inventory/goods-receipts':
          changed = await postGoodsReceipt(
            scope(session, facilityRecord, 'D27', 'inventory'),
            session,
            payload,
          );
          break;
        case 'inventory/counts':
          changed = await recordStockCount(
            scope(session, facilityRecord, 'D27', 'inventory'),
            session,
            payload,
          );
          break;
        case 'procurement/requisitions/status':
          changed = await requisitionCommand(
            scope(session, facilityRecord, 'D28', 'procurement'),
            session,
            payload,
            'decision',
          );
          break;
        case 'procurement/orders':
        case 'procurement/orders/cancel':
          changed = await purchaseOrderCommand(
            scope(session, facilityRecord, 'D28', 'procurement'),
            session,
            payload,
            path.endsWith('/cancel'),
          );
          break;
        case 'workforce/shifts':
        case 'workforce/shifts/status':
          changed = await workforceCommand(
            scope(session, facilityRecord, 'D29', 'workforce'),
            session,
            payload,
            path === 'workforce/shifts',
          );
          break;
        case 'biomedical/equipment':
        case 'biomedical/maintenance':
        case 'biomedical/maintenance/status':
          changed = await biomedicalCommand(
            scope(session, facilityRecord, 'D30', 'biomedical'),
            session,
            payload,
            path.endsWith('/equipment') ? 'register' : path.endsWith('/status') ? 'update' : 'open',
          );
          break;
        case 'hospital-support/tasks':
        case 'hospital-support/tasks/status':
          changed = await supportCommand(
            scope(session, facilityRecord, 'D31', 'hospital-support'),
            session,
            payload,
            path === 'hospital-support/tasks',
          );
          break;
        case 'patient-transport/trips':
        case 'patient-transport/trips/status':
          changed = await transportCommand(
            scope(session, facilityRecord, 'D32', 'patient-transport'),
            session,
            payload,
            path === 'patient-transport/trips',
          );
          break;
        case 'crm/enquiries':
        case 'crm/enquiries/status':
          changed = await crmCommand(
            scope(session, facilityRecord, 'D33', 'crm'),
            session,
            payload,
            path === 'crm/enquiries',
          );
          break;
        case 'marketing/campaigns':
        case 'marketing/campaigns/status':
          changed = await campaignCommand(
            scope(session, facilityRecord, 'D34', 'marketing'),
            session,
            payload,
            path === 'marketing/campaigns',
          );
          break;
        case 'portal/contact-preferences':
          changed = await updateContactPreferences(
            scope(session, facilityRecord, 'D12', 'portal'),
            session,
            payload,
          );
          break;
        case 'automation/policy':
          changed = await automationCommand(
            scope(session, facilityRecord, 'D36'),
            session,
            payload,
            'policy',
          );
          break;
        case 'automation/drafts':
        case 'automation/drafts/status':
          changed = await automationCommand(
            scope(session, facilityRecord, 'D36', 'automation'),
            session,
            payload,
            path.endsWith('/status') ? 'review' : 'request',
          );
          break;
        case 'portal/documents':
        case 'portal/documents/withdraw':
          changed = await documentCommand(
            path,
            scope(session, facilityRecord, 'D12', 'portal'),
            session,
            payload,
          );
          break;
        case 'portal/family-access':
        case 'portal/family/appointments':
        case 'portal/family/passes': {
          const facility = scope(session, facilityRecord, 'D12', 'portal');
          const relationshipId = field(payload, 'relationshipId');
          if (path === 'portal/family-access') {
            changed = await changeFamilyAccess(facility, session, relationshipId, payload);
          } else if (path === 'portal/family/appointments') {
            const appointment = await bookFamilyVisit(facility, session, relationshipId, {
              practitionerId: field(payload, 'practitionerId'),
              day: field(payload, 'day'),
              time: field(payload, 'time'),
            });
            changed = {
              ...event(facility, 'AppointmentBooked', appointment.id),
              actor: session.account,
            };
          } else {
            const id = field(payload, 'appointmentId');
            pass = await issueFamilyPass(facility, session, relationshipId, id);
            await db.events.add({
              ...event(facility, 'AppointmentPassIssued', id),
              id: crypto.randomUUID(),
              actor: session.account,
            });
            return { id, pass, event: undefined };
          }
          break;
        }
        case 'clinical/documents':
        case 'clinical/documents/withdraw':
          changed = await documentCommand(
            path,
            scope(session, facilityRecord, 'D13', 'clinical'),
            session,
            payload,
          );
          break;
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
            session.account,
          );
          break;
        case 'admissions/care-team': {
          const facility = scope(session, facilityRecord, 'D19', 'beds');
          const id = await assignWardTeam(facility, payload);
          changed = { ...event(facility, 'WardTeamAssigned', id), actor: session.account };
          break;
        }
        case 'emergency/arrivals':
        case 'emergency/visits/status':
          changed = await emergencyCommand(
            path,
            scope(session, facilityRecord, 'D16', 'emergency'),
            session,
            payload,
          );
          break;
        case 'critical-care/reviews':
        case 'critical-care/step-downs':
          changed = await criticalCareCommand(
            path,
            scope(session, facilityRecord, 'D17', 'critical-care'),
            session,
            payload,
          );
          break;
        case 'operation-theatre/cases':
        case 'operation-theatre/cases/status':
          changed = await theatreCommand(
            path,
            scope(session, facilityRecord, 'D18', 'operation-theatre'),
            session,
            payload,
          );
          break;
        case 'inpatient-physician/discharge-summary':
        case 'inpatient-physician/discharge-summary/sign':
          changed = await dischargePlanCommand(
            scope(session, facilityRecord, 'D14', 'inpatient-physician'),
            session,
            payload,
            path.endsWith('/sign'),
          );
          break;
        case 'inpatient-physician/rounds':
        case 'inpatient-physician/orders':
        case 'inpatient-physician/orders/cancel':
          changed = await wardCareCommand(
            path,
            scope(session, facilityRecord, 'D14', 'inpatient-physician'),
            session,
            'inpatient-physician',
            payload,
          );
          break;
        case 'nursing-station/observations':
        case 'nursing-station/tasks/start':
        case 'nursing-station/tasks/complete':
          changed = await wardCareCommand(
            path,
            scope(session, facilityRecord, 'D15', 'nursing-station'),
            session,
            'nursing-station',
            payload,
          );
          break;
        case 'clinical/imaging-orders':
          changed = await requestImaging(
            scope(session, facilityRecord, 'D13', 'clinical'),
            session,
            payload,
          );
          break;
        case 'radiology/orders/status': {
          const review = payload['action'] === 'report' || payload['action'] === 'publish';
          changed = await updateImaging(
            scope(session, facilityRecord, 'D21', review ? 'radiology/review' : 'radiology'),
            session,
            payload,
          );
          break;
        }
        case 'inpatient-physician/blood-requests':
        case 'inpatient-physician/blood-requests/withdraw':
          changed = await wardBloodCommand(
            scope(session, facilityRecord, 'D14', 'inpatient-physician'),
            session,
            payload,
            path.endsWith('/withdraw'),
          );
          break;
        case 'blood-bank/requests/status':
          changed = await updateBloodRequest(
            scope(session, facilityRecord, 'D23', 'blood-bank'),
            session,
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
        case 'pharmacy/stock/receipts':
        case 'pharmacy/stock/supplier-returns':
        case 'pharmacy/medication-returns':
          changed = await stockCommand(
            path,
            scope(session, facilityRecord, 'D22', 'pharmacy'),
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
        case 'clinical-governance/reviews':
          changed = await governanceCommand(
            path,
            scope(session, facilityRecord, 'D07', 'clinical-governance'),
            session,
            payload,
          );
          break;
        case 'quality/cases':
        case 'quality/cases/status':
          changed = await governanceCommand(
            path,
            scope(session, facilityRecord, 'D08', 'quality'),
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
