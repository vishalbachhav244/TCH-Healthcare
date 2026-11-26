import {
  dayInIndia,
  shiftDay,
  type DomainEvent,
  type Facility,
  type Session,
} from '../domain/operations';
import {
  imagingCatalogue,
  imagingNotes,
  imagingTimes,
  type ImagingOrder,
  type ImagingRow,
  type ReleasedImagingReport,
} from '../domain/radiology';
import { ApiError } from './access';
import { accountNames } from './accounts';
import { assignedEncounter } from './continuity';
import { db } from './database';
import { checkedDay } from './queries';
import { unavailableImagingRooms } from './biomedical';

function orderWithoutReport(order: ImagingOrder): ImagingOrder {
  const { note: _note, reviewer: _reviewer, ...visible } = order;
  return visible;
}

export async function imagingWorklist(
  facility: Facility,
  reviewAllowed: boolean,
): Promise<ImagingRow[]> {
  const orders = await db.imagingOrders.where('facilityId').equals(facility.id).toArray();
  const [patients, encounters, unavailable] = await Promise.all([
    db.patients.bulkGet(orders.map((row) => row.patientId)),
    db.encounters.bulkGet(orders.map((row) => row.encounterId)),
    unavailableImagingRooms(facility.id),
  ]);
  return orders
    .flatMap((order, i) => {
      const patient = patients[i];
      const encounter = encounters[i];
      if (
        patient?.tenantId !== facility.tenantId ||
        encounter?.facilityId !== facility.id ||
        encounter.patientId !== order.patientId
      )
        return [];
      return [
        {
          order: reviewAllowed ? order : orderWithoutReport(order),
          patient: { id: patient.id, name: patient.name },
          equipmentUnavailable:
            (order.status === 'Ordered' || order.status === 'Scheduled') &&
            unavailable.has(
              imagingCatalogue.find((item) => item.study === order.study)?.room ?? '',
            ),
        },
      ];
    })
    .sort((a, b) => b.order.changedAt - a.order.changedAt);
}

export async function consultationImaging(
  facility: Facility,
  session: Session,
  encounterId: string,
) {
  const { encounter } = await assignedEncounter(facility, session, encounterId);
  const orders = await db.imagingOrders
    .where('encounterId')
    .equals(encounter.id)
    .filter((row) => row.facilityId === facility.id && row.patientId === encounter.patientId)
    .toArray();
  return orders
    .sort((a, b) => b.changedAt - a.changedAt)
    .map((order) => (order.status === 'Published' ? order : orderWithoutReport(order)));
}

export async function releasedImaging(
  facility: Facility,
  patientId: string,
): Promise<ReleasedImagingReport[]> {
  const orders = await db.imagingOrders
    .where('[facilityId+patientId]')
    .equals([facility.id, patientId])
    .filter((row) => row.status === 'Published')
    .toArray();
  const encounters = await db.encounters.bulkGet(orders.map((row) => row.encounterId));
  return orders
    .flatMap((row, i) => {
      const encounter = encounters[i];
      const { id, study, note, publishedAt, reviewer } = row;
      if (
        encounter?.facilityId !== facility.id ||
        encounter.patientId !== patientId ||
        !note ||
        publishedAt === undefined ||
        !reviewer
      )
        return [];
      return [{ id, study, note, publishedAt, reviewer: accountNames[reviewer] }];
    })
    .sort((a, b) => b.publishedAt - a.publishedAt);
}

export async function requestImaging(
  facility: Facility,
  session: Session,
  body: Record<string, unknown>,
): Promise<DomainEvent> {
  const encounterId = body['encounterId'];
  if (typeof encounterId !== 'string' || !encounterId)
    throw new ApiError(422, 'Choose an encounter.');
  const { encounter, visit } = await assignedEncounter(facility, session, encounterId);
  if (encounter.signedAt || visit.status !== 'In consultation')
    throw new ApiError(409, 'Start an active consultation before placing an imaging order.');
  const exam = imagingCatalogue.find((entry) => entry.study === body['study']);
  if (!exam) throw new ApiError(422, 'Choose an imaging study.');
  const existing = await db.imagingOrders
    .where('encounterId')
    .equals(encounterId)
    .filter(
      (row) =>
        row.facilityId === facility.id && row.study === exam.study && row.status !== 'Cancelled',
    )
    .first();
  if (existing) throw new ApiError(409, 'This study has already been ordered for the encounter.');
  const id = crypto.randomUUID();
  const now = Date.now();
  await db.imagingOrders.add({
    id,
    encounterId,
    facilityId: facility.id,
    patientId: encounter.patientId,
    study: exam.study,
    status: 'Ordered',
    version: 1,
    orderedAt: now,
    changedAt: now,
  });
  return {
    type: 'ImagingOrdered',
    entityId: id,
    facilityId: facility.id,
    occurredAt: now,
    actor: session.account,
  };
}

export async function updateImaging(
  facility: Facility,
  session: Session,
  body: Record<string, unknown>,
): Promise<DomainEvent> {
  const id = body['orderId'];
  const order = typeof id === 'string' ? await db.imagingOrders.get(id) : undefined;
  if (order?.facilityId !== facility.id) throw new ApiError(404, 'Imaging order not found.');
  const [patient, encounter] = await Promise.all([
    db.patients.get(order.patientId),
    db.encounters.get(order.encounterId),
  ]);
  if (
    patient?.tenantId !== facility.tenantId ||
    encounter?.facilityId !== facility.id ||
    encounter.patientId !== order.patientId
  )
    throw new ApiError(404, 'Imaging order not found.');
  if (body['version'] !== String(order.version))
    throw new ApiError(409, 'The imaging order changed. Reopen the current order.');
  const now = Date.now();
  const today = dayInIndia(now);
  const next: Partial<ImagingOrder> = { version: order.version + 1, changedAt: now };
  const room = imagingCatalogue.find((entry) => entry.study === order.study)?.room;
  if (
    (body['action'] === 'schedule' || body['action'] === 'acquire') &&
    room &&
    (await unavailableImagingRooms(facility.id)).has(room)
  ) {
    throw new ApiError(409, 'Equipment for this imaging room is out of service.');
  }
  switch (body['action']) {
    case 'schedule': {
      if (order.status !== 'Ordered' && order.status !== 'Scheduled')
        throw new ApiError(409, 'This study can no longer be scheduled.');
      if (typeof body['day'] !== 'string' || !body['day'])
        throw new ApiError(422, 'Choose an exam date.');
      const day = checkedDay(body['day']);
      const time = body['time'];
      if (
        day < today ||
        day > shiftDay(today, 90) ||
        typeof time !== 'string' ||
        !imagingTimes.includes(time)
      )
        throw new ApiError(422, 'Choose a listed time within the next 90 days.');
      const clash = await db.imagingOrders
        .where('[facilityId+scheduledDay]')
        .equals([facility.id, day])
        .filter(
          (row) =>
            row.id !== order.id &&
            row.status !== 'Cancelled' &&
            row.scheduledTime === time &&
            (row.patientId === order.patientId ||
              imagingCatalogue.find((entry) => entry.study === row.study)?.room === room),
        )
        .first();
      if (clash) throw new ApiError(409, 'This time is already reserved for this room or patient.');
      Object.assign(next, { status: 'Scheduled', scheduledDay: day, scheduledTime: time });
      break;
    }
    case 'acquire':
      if (order.status !== 'Scheduled' || !order.scheduledDay || order.scheduledDay > today)
        throw new ApiError(409, 'Acquisition can be recorded from the scheduled date.');
      next.status = 'Acquired';
      break;
    case 'report': {
      if (order.status !== 'Acquired' && order.status !== 'Report ready')
        throw new ApiError(409, 'Record acquisition before preparing a report.');
      const note = imagingNotes.find((entry) => entry === body['note']);
      if (!note) throw new ApiError(422, 'Choose the recorded report summary.');
      Object.assign(next, { status: 'Report ready', note, reviewer: session.account });
      break;
    }
    case 'publish':
      if (order.status !== 'Report ready' || !order.note)
        throw new ApiError(409, 'Save a report before releasing it.');
      if (order.reviewer !== session.account)
        throw new ApiError(403, 'The report author must confirm release.');
      Object.assign(next, { status: 'Published', publishedAt: now });
      break;
    case 'cancel':
      if (order.status !== 'Ordered' && order.status !== 'Scheduled')
        throw new ApiError(409, 'Only an order awaiting acquisition can be cancelled.');
      next.status = 'Cancelled';
      break;
    default:
      throw new ApiError(422, 'Choose an imaging action.');
  }
  await db.imagingOrders.update(order.id, next);
  return {
    type: next.status === 'Published' ? 'ImagingReportPublished' : 'ImagingUpdated',
    entityId: order.id,
    facilityId: facility.id,
    occurredAt: now,
    actor: session.account,
  };
}
