import type { Bed, DomainEvent, Facility, Session } from '../domain/operations';
import {
  openSupportTask,
  supportRequests,
  type SupportData,
  type SupportRow,
  type SupportStatus,
  type SupportTask,
} from '../domain/support';
import { ApiError } from './access';
import { db } from './database';
import { bedPreparation } from './support-seed';

export async function queueBedPreparation(bed: Bed, time: number, actor: string) {
  await db.beds.update(bed.id, { status: 'Cleaning' });
  await db.supportTasks.add(bedPreparation(bed, crypto.randomUUID(), time, actor));
}

export async function releaseCleanedBed(bed: Bed, time: number, actor: string) {
  const task = await db.supportTasks.where('activeBedId').equals(bed.id).first();
  if (task) {
    if (
      task.service !== 'Housekeeping' ||
      task.bedId !== bed.id ||
      task.facilityId !== bed.facilityId ||
      !openSupportTask(task)
    )
      throw new ApiError(409, 'The bed and housekeeping task relationship could not be verified.');
    const completed: SupportTask = {
      ...task,
      status: 'Completed',
      activeBedId: undefined,
      version: task.version + 1,
      changedAt: time,
      changedBy: actor,
    };
    await db.supportTasks.put(completed);
  }
  await db.beds.update(bed.id, { status: 'Available' });
}

function supportLocations(beds: readonly Bed[]) {
  return [...new Set(beds.map((bed) => bed.ward))].sort();
}

export async function supportData(facility: Facility): Promise<SupportData> {
  const [beds, tasks] = await Promise.all([
    db.beds.where('facilityId').equals(facility.id).toArray(),
    db.supportTasks.where('facilityId').equals(facility.id).toArray(),
  ]);
  const byId = new Map(beds.map((bed) => [bed.id, bed]));
  return {
    locations: supportLocations(beds),
    tasks: tasks
      .flatMap<SupportRow>((task) => {
        if (task.service !== 'Housekeeping') return [task];
        const bed = byId.get(task.bedId);
        return bed ? [{ ...task, bed: { label: bed.label, ward: bed.ward } }] : [];
      })
      .sort(
        (a, b) =>
          Number(openSupportTask(b)) - Number(openSupportTask(a)) ||
          (openSupportTask(a) ? a.requestedAt - b.requestedAt : b.changedAt - a.changedAt),
      ),
  };
}

export async function supportCommand(
  facility: Facility,
  session: Session,
  body: Record<string, unknown>,
  create: boolean,
): Promise<DomainEvent> {
  const time = Date.now();
  const event = (type: DomainEvent['type'], entityId: string) => ({
    type,
    entityId,
    occurredAt: time,
    facilityId: facility.id,
    actor: session.account,
  });
  if (create) {
    const service = body['service'];
    if (service !== 'CSSD' && service !== 'Dietary')
      throw new ApiError(422, 'Choose CSSD or Dietary.');
    const request = supportRequests[service].find((option) => option === body['request']);
    const location = supportLocations(
      await db.beds.where('facilityId').equals(facility.id).toArray(),
    ).find((option) => option === body['location']);
    if (!location || !request)
      throw new ApiError(422, 'Choose a facility ward and service request.');
    const id = crypto.randomUUID();
    await db.supportTasks.add({
      id,
      facilityId: facility.id,
      service,
      location,
      request,
      status: 'Queued',
      version: 1,
      requestedAt: time,
      changedAt: time,
      changedBy: session.account,
    });
    return event('SupportRequested', id);
  }
  const task =
    typeof body['taskId'] === 'string' ? await db.supportTasks.get(body['taskId']) : undefined;
  if (task?.facilityId !== facility.id)
    throw new ApiError(404, 'Support request unavailable at this facility.');
  if (body['version'] !== String(task.version))
    throw new ApiError(409, 'The request changed. Refresh and try again.');
  const action = body['action'];
  const bed = task.service === 'Housekeeping' ? await db.beds.get(task.bedId) : undefined;
  if (
    task.service === 'Housekeeping' &&
    (bed?.facilityId !== facility.id || bed.status !== 'Cleaning' || task.activeBedId !== bed.id)
  ) {
    throw new ApiError(409, 'This bed is no longer awaiting preparation.');
  }
  let status: SupportStatus;
  if (action === 'start' && task.status === 'Queued') status = 'In progress';
  else if (action === 'complete' && task.status === 'In progress') {
    if (bed) {
      await releaseCleanedBed(bed, time, session.account);
      return event('SupportUpdated', task.id);
    }
    status = 'Completed';
  } else if (action === 'cancel' && task.status === 'Queued' && task.service !== 'Housekeeping')
    status = 'Cancelled';
  else throw new ApiError(409, 'This action is unavailable for the current request.');
  await db.supportTasks.update(task.id, {
    status,
    version: task.version + 1,
    changedAt: time,
    changedBy: session.account,
  });
  return event('SupportUpdated', task.id);
}
