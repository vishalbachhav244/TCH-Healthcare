import type { HttpRequest } from '@angular/common/http';
import type { Facility } from '../domain/operations';
import { notifyFacility } from '../core/events';
import { ApiError, patientSubject, requireSession, scope, startSession } from './access';
import { command, services } from './commands';
import { db, initialize } from './database';
import { appointments, checkedDay, dashboard, invoiceRows, queueDisplay } from './queries';
import { platformData, updatePlatform } from './platform';
import { board } from './inpatient';
import { admissionDischargeDocument } from './discharge';
import { inpatientBillingDetail, inpatientBillingRows } from './inpatient-billing';
import { financeData } from './finance';
import { insuranceData } from './insurance';
import { inventoryData } from './inventory';
import { procurementData } from './procurement';
import { workforceData } from './workforce';
import { biomedicalData } from './biomedical';
import { supportData } from './support';
import { transportData } from './transport';
import { listLaboratory } from './laboratory';
import { consultationImaging, imagingWorklist } from './radiology';
import { bloodBankView } from './blood-bank';
import { portal } from './portal';
import { subscriptions, updateSubscription } from './subscriptions';
import { availability } from './scheduling';
import { schedulingDay } from './scheduling-workspace';
import { bookingContext, clinicalContinuity } from './continuity';
import { clinicalPrescriptions, pharmacyData } from './pharmacy';
import { platformOperations, updateIncident } from './platform-operations';
import {
  exchangeCommand,
  integrationDashboard,
  patientSharing,
  recipientRequests,
} from './interoperability';
import { clinicalGovernance, qualityRegister } from './governance';
import { wardAssignmentOptions, wardDetail, wardWorklist } from './ward-care';
import { criticalCareView, emergencyPatients, emergencyView, theatreView } from './acute-care';

export async function handle(request: HttpRequest<unknown>): Promise<unknown> {
  const url = new URL(request.urlWithParams, location.origin);
  const path = url.pathname.slice('/api/v1/'.length);
  const token = request.headers.get('Authorization')?.match(/^Bearer ([\da-f-]+)$/i)?.[1] ?? null;
  await initialize();
  if (path === 'session' && request.method === 'POST') return startSession(request.body);
  if (path === 'queue-display' && request.method === 'GET')
    return queueDisplay(url.searchParams.get('facility'));
  const session = await requireSession(token);
  if (path === 'session' && request.method === 'DELETE') {
    await db.sessions.delete(session.token);
    return { signedOut: true };
  }
  if (path === 'session' && request.method === 'GET') return session;
  const facilityId = request.headers.get('X-Facility-Id');
  const params = url.searchParams;
  const exchangeWrite =
    (request.method === 'POST' &&
      [
        'integrations/connectors',
        'portal/matching-code',
        'record-requests',
        'record-requests/retrieve',
      ].includes(path)) ||
    (request.method === 'PATCH' && ['integrations/connectors', 'portal/sharing'].includes(path));
  if (exchangeWrite) {
    const { event, ...result } = await exchangeCommand(
      path,
      request.method,
      session.token,
      facilityId,
      request.body,
    );
    notifyFacility(event);
    if ('denied' in result && result.denied)
      throw new ApiError(403, 'Report access denied: ' + result.denied + '.');
    return result;
  }
  const isConfiguration = [
    'platform/entitlements',
    'platform/activation',
    'platform/membership',
    'subscriptions',
    'appointments/reschedule',
    'appointments/cancel',
    'clinical/follow-ups/withdraw',
    'scheduling/waitlist/status',
    'scheduling/exceptions/release',
    'quality/cases/status',
    'admissions/care-team',
    'inpatient-physician/orders/cancel',
    'inpatient-physician/discharge-summary/sign',
    'nursing-station/tasks/start',
    'nursing-station/tasks/complete',
    'emergency/visits/status',
    'operation-theatre/cases/status',
    'radiology/orders/status',
    'inpatient-physician/blood-requests/withdraw',
    'blood-bank/requests/status',
    'insurance/claims/status',
    'inventory/requisitions/withdraw',
    'procurement/requisitions/status',
    'procurement/orders/cancel',
    'workforce/shifts/status',
    'biomedical/maintenance/status',
    'hospital-support/tasks/status',
    'patient-transport/trips/status',
  ].includes(path);
  const incidentWrite =
    path === 'platform-operations/incidents' && ['POST', 'PATCH'].includes(request.method);
  if (
    incidentWrite ||
    (isConfiguration && request.method === 'PATCH') ||
    (!isConfiguration && request.method === 'POST')
  ) {
    const { event, ...result } = incidentWrite
      ? await updateIncident(request.method, request.body, session)
      : path === 'subscriptions'
        ? await updateSubscription(request.body, session)
        : path.startsWith('platform/')
          ? await updatePlatform(path, request.body, session)
          : await command(path, request.body, session.token, facilityId);
    if (event) notifyFacility(event);
    return result;
  }
  if (request.method !== 'GET') throw new ApiError(405, 'Method unavailable.');
  const facilityRecord = facilityId ? await db.facilities.get(facilityId) : undefined;
  switch (path) {
    case 'facilities':
      return (await db.facilities.bulkGet(session.facilityIds)).filter((facility) => !!facility);
    case 'platform':
      return platformData(session);
    case 'subscriptions':
      return subscriptions(session);
    case 'platform-operations':
      return platformOperations(session);
    case 'integrations':
      return integrationDashboard(session);
    case 'record-requests':
      return recipientRequests(session);
    case 'portal/sharing':
      return patientSharing(scope(session, facilityRecord, 'D12'), session);
    case 'clinical-governance':
      return clinicalGovernance(scope(session, facilityRecord, 'D07'), params);
    case 'quality':
      return qualityRegister(scope(session, facilityRecord, 'D08'), session);
    case 'network': {
      const selected = scope(session, facilityRecord, 'D05');
      const day = checkedDay(params.get('day'));
      const facilities = (await db.facilities.bulkGet(session.facilityIds)).filter(
        (facility): facility is Facility =>
          facility?.tenantId === selected.tenantId &&
          facility.active !== false &&
          session.facilityAccess[facility.id]?.workspaces.includes('D05'),
      );
      return Promise.all(
        facilities.map(async ({ id, name, city, inpatient, ...facility }) => {
          const { metrics, departments } = await dashboard(
            { ...facility, id, name, city, inpatient },
            day,
            1,
            false,
          );
          return { facility: { id, name, city, inpatient }, metrics, departments };
        }),
      );
    }
    case 'overview':
      return dashboard(
        scope(session, facilityRecord, 'D06'),
        checkedDay(params.get('day')),
        params.get('range') === '14' ? 14 : 7,
      );
    case 'appointments':
      return appointments(
        scope(session, facilityRecord, 'D10'),
        checkedDay(params.get('day')),
        params,
        'all',
      );
    case 'scheduling':
      return schedulingDay(scope(session, facilityRecord, 'D10'), params);
    case 'queue':
      return appointments(
        scope(session, facilityRecord, 'D11'),
        checkedDay(params.get('day')),
        params,
        'queue',
      );
    case 'clinical': {
      const facility = scope(session, facilityRecord, 'D13');
      return appointments(
        facility,
        checkedDay(params.get('day')),
        params,
        'clinical',
        session.facilityAccess[facility.id].practitionerId,
      );
    }
    case 'clinical/prescriptions':
      return clinicalPrescriptions(
        scope(session, facilityRecord, 'D13'),
        session,
        params.get('encounterId') ?? '',
      );
    case 'clinical/patient-context':
      return clinicalContinuity(
        scope(session, facilityRecord, 'D13', 'clinical'),
        session,
        params.get('encounterId') ?? '',
      );
    case 'appointments/patient-context':
      return bookingContext(
        scope(session, facilityRecord, 'D10', 'appointments'),
        params.get('patientId') ?? '',
      );
    case 'pharmacy': {
      const facility = scope(session, facilityRecord, 'D22');
      return db.transaction(
        'r',
        [db.prescriptions, db.stockLots, db.stockMovements, db.patients],
        async () => pharmacyData(facility),
      );
    }
    case 'patients':
    case 'appointments/options':
    case 'admissions/options': {
      const facility =
        path === 'admissions/options'
          ? scope(session, facilityRecord, 'D19', 'beds')
          : scope(
              session,
              facilityRecord,
              path === 'patients' ? 'D09' : 'D10',
              path === 'patients' ? undefined : 'appointments',
            );
      const q = (params.get('q') ?? '').trim().toLowerCase().slice(0, 100);
      const patientList = db.patients.where('tenantId').equals(facility.tenantId);
      const patients = await patientList
        .filter((patient) => (patient.name + ' ' + patient.id).toLowerCase().includes(q))
        .limit(35)
        .toArray();
      const practitioners =
        path === 'appointments/options'
          ? await db.practitioners.where('facilityId').equals(facility.id).toArray()
          : [];
      return { patients, practitioners };
    }
    case 'appointments/availability':
    case 'portal/availability': {
      const selfService = path === 'portal/availability';
      const facility = selfService
        ? scope(session, facilityRecord, 'D12', 'portal')
        : scope(session, facilityRecord, 'D10', 'appointments');
      return availability(
        facility,
        params.get('practitionerId') ?? '',
        params.get('day') ?? '',
        selfService ? undefined : (params.get('appointmentId') ?? undefined),
        selfService ? patientSubject(session) : params.get('patientId') || undefined,
      );
    }
    case 'queue/options': {
      const facility = scope(session, facilityRecord, 'D11', 'queue');
      return {
        patients: [],
        practitioners: await db.practitioners.where('facilityId').equals(facility.id).toArray(),
      };
    }
    case 'beds': {
      const facility = scope(session, facilityRecord, 'D19');
      return board(facility, session.facilityAccess[facility.id].writes.includes('beds'));
    }
    case 'admissions/care-team':
      return wardAssignmentOptions(
        scope(session, facilityRecord, 'D19', 'beds'),
        params.get('admissionId') ?? '',
      );
    case 'admissions/discharge-summary':
      return admissionDischargeDocument(
        scope(session, facilityRecord, 'D19', 'beds'),
        params.get('admissionId') ?? '',
      );
    case 'emergency/patients':
      return emergencyPatients(
        scope(session, facilityRecord, 'D16', 'emergency'),
        params.get('q') ?? '',
      );
    case 'emergency': {
      const facility = scope(session, facilityRecord, 'D16');
      return db.transaction('r', [db.emergencyCases, db.patients, db.admissions], () =>
        emergencyView(facility),
      );
    }
    case 'critical-care': {
      const facility = scope(session, facilityRecord, 'D17');
      return db.transaction(
        'r',
        [db.icuReviews, db.icuStepDowns, db.admissions, db.patients, db.beds],
        () => criticalCareView(facility),
      );
    }
    case 'operation-theatre': {
      const facility = scope(session, facilityRecord, 'D18');
      return db.transaction('r', [db.theatreCases, db.admissions, db.patients, db.beds], () =>
        theatreView(facility, params.get('day')),
      );
    }
    case 'inpatient-physician':
    case 'nursing-station':
    case 'inpatient-physician/detail':
    case 'nursing-station/detail': {
      const role = path.startsWith('inpatient-physician')
        ? 'inpatient-physician'
        : 'nursing-station';
      const facility = scope(
        session,
        facilityRecord,
        role === 'inpatient-physician' ? 'D14' : 'D15',
      );
      return db.transaction(
        'r',
        [
          db.wardAssignments,
          db.admissions,
          db.patients,
          db.beds,
          db.wardRounds,
          db.wardOrders,
          db.nursingTasks,
          db.wardObservations,
          db.dischargePlans,
          db.bloodRequests,
        ],
        async () =>
          path.endsWith('/detail')
            ? wardDetail(facility, session, role, params.get('admissionId') ?? '')
            : wardWorklist(facility, session, role),
      );
    }
    case 'laboratory':
      return listLaboratory(scope(session, facilityRecord, 'D20'), params);
    case 'radiology': {
      const facility = scope(session, facilityRecord, 'D21');
      return db.transaction(
        'r',
        [db.imagingOrders, db.patients, db.encounters, db.biomedicalAssets],
        async () =>
          imagingWorklist(
            facility,
            session.facilityAccess[facility.id].writes.includes('radiology/review'),
          ),
      );
    }
    case 'clinical/imaging-orders': {
      const facility = scope(session, facilityRecord, 'D13', 'clinical');
      return db.transaction(
        'r',
        [db.imagingOrders, db.patients, db.encounters, db.appointments],
        async () => consultationImaging(facility, session, params.get('encounterId') ?? ''),
      );
    }
    case 'blood-bank': {
      const facility = scope(session, facilityRecord, 'D23', 'blood-bank');
      return db.transaction(
        'r',
        [db.bloodRequests, db.bloodUnits, db.patients, db.admissions],
        async () => bloodBankView(facility),
      );
    }
    case 'portal':
      return portal(scope(session, facilityRecord, 'D12'), session);
    case 'billing': {
      const facility = scope(session, facilityRecord, 'D24');
      const day = checkedDay(params.get('day'));
      return db.transaction(
        'r',
        [
          db.invoices,
          db.patients,
          db.payments,
          db.stockMovements,
          db.refundDecisions,
          db.insuranceClaims,
        ],
        async () => invoiceRows(facility, day),
      );
    }
    case 'finance': {
      const facility = scope(session, facilityRecord, 'D25', 'finance');
      const day = checkedDay(params.get('day'));
      return db.transaction(
        'r',
        [
          db.invoices,
          db.payments,
          db.refundDecisions,
          db.collectionCloses,
          db.stockMovements,
          db.patients,
        ],
        async () => financeData(facility, day),
      );
    }
    case 'insurance': {
      const facility = scope(session, facilityRecord, 'D26', 'insurance');
      const day = checkedDay(params.get('day'));
      return db.transaction(
        'r',
        [
          db.invoices,
          db.payments,
          db.refundDecisions,
          db.insuranceCoverages,
          db.insuranceClaims,
          db.stockMovements,
          db.patients,
        ],
        async () => insuranceData(facility, day),
      );
    }
    case 'inventory': {
      const facility = scope(session, facilityRecord, 'D27', 'inventory');
      return db.transaction(
        'r',
        [
          db.stockLots,
          db.stockMovements,
          db.supplyRequisitions,
          db.purchaseOrders,
          db.goodsReceipts,
        ],
        async () => inventoryData(facility),
      );
    }
    case 'procurement': {
      const facility = scope(session, facilityRecord, 'D28', 'procurement');
      return db.transaction(
        'r',
        [db.supplyRequisitions, db.purchaseOrders, db.suppliers],
        async () => procurementData(facility),
      );
    }
    case 'workforce': {
      const facility = scope(session, facilityRecord, 'D29');
      const day = checkedDay(params.get('day'));
      return db.transaction('r', [db.memberships, db.staffShifts], async () =>
        workforceData(facility, day),
      );
    }
    case 'biomedical': {
      const facility = scope(session, facilityRecord, 'D30');
      return db.transaction('r', [db.biomedicalAssets, db.maintenanceOrders], async () =>
        biomedicalData(facility),
      );
    }
    case 'hospital-support': {
      const facility = scope(session, facilityRecord, 'D31');
      return db.transaction('r', [db.beds, db.supportTasks], () => supportData(facility));
    }
    case 'patient-transport': {
      const facility = scope(session, facilityRecord, 'D32');
      return db.transaction(
        'r',
        [db.admissions, db.beds, db.patients, db.transportRequests, db.transportUnits],
        () => transportData(facility),
      );
    }
    case 'billing/inpatient':
    case 'billing/inpatient/detail': {
      const facility = scope(session, facilityRecord, 'D24', 'billing');
      if (!facility.inpatient)
        throw new ApiError(403, 'Inpatient services are disabled at this facility.');
      return db.transaction(
        'r',
        [db.admissions, db.inpatientAccounts, db.bedStays, db.invoices, db.patients],
        async () =>
          path.endsWith('/detail')
            ? inpatientBillingDetail(facility, params.get('admissionId') ?? '')
            : inpatientBillingRows(facility),
      );
    }
    case 'billing/options': {
      const facility = scope(session, facilityRecord, 'D24', 'billing');
      const day = checkedDay(params.get('day'));
      const encounters = await db.encounters
        .where('facilityId')
        .equals(facility.id)
        .filter(
          (encounter) =>
            !!encounter.signedAt &&
            new Date(encounter.startedAt + 19_800_000).toISOString().slice(0, 10) === day,
        )
        .toArray();
      const invoices = await db.invoices
        .where('encounterId')
        .anyOf(encounters.map((row) => row.id))
        .toArray();
      const invoiced = new Set(
        invoices.filter((invoice) => !invoice.prescriptionId).map((invoice) => invoice.encounterId),
      );
      const pending = encounters.filter((row) => !invoiced.has(row.id));
      const patients = await db.patients.bulkGet(pending.map((row) => row.patientId));
      return {
        services,
        encounters: pending.flatMap((row, i) =>
          patients[i]?.tenantId === facility.tenantId
            ? [{ id: row.id, name: patients[i]?.name, patientId: row.patientId }]
            : [],
        ),
      };
    }
    default:
      throw new ApiError(404, 'Resource not found.');
  }
}
