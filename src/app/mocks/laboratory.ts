import type { DomainEvent, Facility, Session } from '../domain/operations';
import {
  labCatalogue,
  labFindings,
  labStages,
  type LabOrder,
  type LabRow,
} from '../domain/diagnostics';
import { ApiError } from './access';
import { db } from './database';

export async function listLaboratory(facility: Facility, params: URLSearchParams) {
  const all = await db.labOrders.where('facilityId').equals(facility.id).toArray();
  const statuses = labStages.map((status) => ({
    status,
    count: all.filter((row) => row.status === status).length,
  }));
  const search = (params.get('q') ?? '').slice(0, 100).trim().toLowerCase();
  const status = params.get('status');
  const rows = all
    .filter((row) => !status || row.status === status)
    .sort((a, b) => b.orderedAt - a.orderedAt);
  const patients = await db.patients.bulkGet([...new Set(rows.map((row) => row.patientId))]);
  const profiles = new Map(
    patients.flatMap((patient) => (patient ? [[patient.id, patient] as const] : [])),
  );
  const matches: LabRow[] = rows.flatMap((order) => {
    const patient = profiles.get(order.patientId);
    if (patient?.tenantId !== facility.tenantId) return [];
    if (
      search &&
      ![patient.name, patient.id, order.test, order.accession ?? ''].some((text) =>
        text.toLowerCase().includes(search),
      )
    )
      return [];
    return [{ order, patient }];
  });
  const offset = Math.max(0, Number(params.get('offset')) || 0);
  return { statuses, total: matches.length, items: matches.slice(offset, offset + 12) };
}

export async function laboratoryCommand(
  path: string,
  facility: Facility,
  payload: Record<string, unknown>,
  session: Session,
): Promise<DomainEvent> {
  const time = Date.now();
  const publish = (type: DomainEvent['type'], entityId: string) => ({
    type,
    entityId,
    facilityId: facility.id,
    occurredAt: time,
  });
  if (path === 'clinical/lab-orders') {
    const encounter =
      typeof payload['encounterId'] === 'string'
        ? await db.encounters.get(payload['encounterId'])
        : undefined;
    if (encounter?.facilityId !== facility.id || encounter.practitionerId !== facility.id + '-DR-1')
      throw new ApiError(404, 'Encounter not found.');
    if (encounter.signedAt) throw new ApiError(409, 'The encounter has already been signed.');
    const test = labCatalogue.find((value) => value === payload['test']);
    if (!test) throw new ApiError(422, 'Select a test from the laboratory catalogue.');
    const existing = await db.labOrders
      .where('encounterId')
      .equals(encounter.id)
      .filter((row) => row.test === test)
      .first();
    if (existing) throw new ApiError(409, 'This test has already been ordered for the encounter.');
    const id = crypto.randomUUID();
    await db.labOrders.add({
      id,
      encounterId: encounter.id,
      patientId: encounter.patientId,
      facilityId: facility.id,
      test,
      status: 'Ordered',
      version: 1,
      orderedAt: time,
      changedAt: time,
    });
    return publish('ClinicalOrderCreated', id);
  }
  const order =
    typeof payload['orderId'] === 'string' ? await db.labOrders.get(payload['orderId']) : undefined;
  if (order?.facilityId !== facility.id) throw new ApiError(404, 'Order not found.');
  if (payload['version'] !== String(order.version))
    throw new ApiError(409, 'The worklist changed. Reload and try again.');
  const status = labStages[labStages.indexOf(order.status) + 1];
  if (!status) throw new ApiError(409, 'This order is already published.');
  if (
    ['Authorised', 'Published'].includes(status)
      ? !session.writes.includes('laboratory/review')
      : !session.writes.includes('laboratory')
  ) {
    throw new ApiError(403, 'The current stage requires a different laboratory responsibility.');
  }
  const next: Partial<LabOrder> = { status, version: order.version + 1, changedAt: time };
  if (status === 'Collected')
    next.accession = 'LAB-' + order.id.replaceAll('-', '').slice(0, 12).toUpperCase();
  if (status === 'Entered') {
    next.finding = labFindings.find((value) => value === payload['finding']);
    if (!next.finding) throw new ApiError(422, 'Select the recorded result.');
  }
  if (status === 'Authorised') next.authorisedBy = session.account;
  await db.labOrders.update(order.id, next);
  return publish(
    status === 'Authorised'
      ? 'LabResultAuthorized'
      : status === 'Published'
        ? 'LabResultPublished'
        : 'LabStageChanged',
    order.id,
  );
}
