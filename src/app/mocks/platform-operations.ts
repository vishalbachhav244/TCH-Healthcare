import { dayInIndia, type DomainEvent, type Session } from '../domain/operations';
import {
  incidentPriorities,
  incidentServices,
  type PlatformOperationsData,
} from '../domain/platform-operations';
import { ApiError } from './access';
import { db } from './database';

function requireOperations(session: Session) {
  if (!session.workspaces.includes('D03'))
    throw new ApiError(403, 'Platform operations access is required.');
}

export async function platformOperations(session: Session): Promise<PlatformOperationsData> {
  requireOperations(session);
  const today = Date.parse(dayInIndia() + 'T00:00:00+05:30');
  const [incidents, activeSessions, eventsToday, recent, facilities] = await Promise.all([
    db.platformIncidents.orderBy('updatedAt').reverse().toArray(),
    db.sessions.where('expiresAt').above(Date.now()).count(),
    db.events.where('occurredAt').aboveOrEqual(today).count(),
    db.events.orderBy('occurredAt').reverse().limit(15).toArray(),
    db.facilities.toArray(),
  ]);
  const names = new Map(facilities.map(({ id, name }) => [id, name]));
  return {
    incidents,
    activeSessions,
    eventsToday,
    activity: recent.map(({ id, type, facilityId, occurredAt }) => ({
      id,
      type,
      location: names.get(facilityId) ?? 'Platform administration',
      occurredAt,
    })),
  };
}

export async function updateIncident(method: string, body: unknown, session: Session) {
  requireOperations(session);
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new ApiError(422, 'Invalid incident record.');
  const value = body as Record<string, unknown>;
  return db.transaction('rw', [db.platformIncidents, db.events], async () => {
    const now = Date.now();
    let id: string;
    let type: DomainEvent['type'];
    if (method === 'POST') {
      const title = typeof value['title'] === 'string' ? value['title'].trim() : '';
      const service = incidentServices.find((item) => item === value['service']);
      const priority = incidentPriorities.find((item) => item === value['priority']);
      if (title.length < 4 || title.length > 100 || !service || !priority)
        throw new ApiError(422, 'Enter an incident title, service and priority.');
      id = crypto.randomUUID();
      await db.platformIncidents.add({
        id,
        title,
        service,
        priority,
        status: 'Open',
        version: 1,
        createdAt: now,
        updatedAt: now,
      });
      type = 'IncidentOpened';
    } else {
      const incident =
        typeof value['id'] === 'string' ? await db.platformIncidents.get(value['id']) : undefined;
      if (!incident) throw new ApiError(404, 'Incident not found.');
      if (value['version'] !== String(incident.version))
        throw new ApiError(409, 'This incident changed. Refresh and try again.');
      const status =
        incident.status === 'Open'
          ? 'Investigating'
          : incident.status === 'Investigating'
            ? 'Resolved'
            : undefined;
      if (!status) throw new ApiError(409, 'This incident has already been resolved.');
      id = incident.id;
      await db.platformIncidents.update(id, {
        status,
        version: incident.version + 1,
        updatedAt: now,
      });
      type = status === 'Resolved' ? 'IncidentResolved' : 'IncidentInvestigating';
    }
    const event: DomainEvent = {
      type,
      facilityId: 'platform',
      entityId: id,
      occurredAt: now,
      actor: session.account,
    };
    await db.events.add({ ...event, id: crypto.randomUUID() });
    return { id, event };
  });
}
