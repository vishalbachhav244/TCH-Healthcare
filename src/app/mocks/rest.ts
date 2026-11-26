import type { HttpRequest } from '@angular/common/http';
import type { Facility } from '../domain/operations';
import { notifyFacility } from '../core/events';
import { ApiError, requireSession, scope, startSession } from './access';
import { command, services } from './commands';
import { db, initialize } from './database';
import { appointments, checkedDay, dashboard, invoiceRows, queueDisplay } from './queries';
import { platformData, updatePlatform } from './platform';
import { board } from './inpatient';
import { listLaboratory } from './laboratory';
import { portal } from './portal';
import { subscriptions, updateSubscription } from './subscriptions';
import { availability } from './scheduling';
import { clinicalPrescriptions, pharmacyData } from './pharmacy';
import { platformOperations, updateIncident } from './platform-operations';

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
  const isConfiguration = [
    'platform/entitlements',
    'platform/activation',
    'platform/membership',
    'subscriptions',
    'appointments/reschedule',
    'appointments/cancel',
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
    case 'pharmacy':
      return pharmacyData(scope(session, facilityRecord, 'D22'));
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
    case 'appointments/availability': {
      const facility = scope(session, facilityRecord, 'D10', 'appointments');
      return availability(
        facility,
        params.get('practitionerId') ?? '',
        params.get('day') ?? '',
        params.get('appointmentId') ?? undefined,
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
    case 'laboratory':
      return listLaboratory(scope(session, facilityRecord, 'D20'), params);
    case 'portal':
      return portal(scope(session, facilityRecord, 'D12'), session);
    case 'billing':
      return invoiceRows(scope(session, facilityRecord, 'D24'), checkedDay(params.get('day')));
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
