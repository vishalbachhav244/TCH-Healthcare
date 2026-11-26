import type { DomainEvent, Session } from '../domain/operations';
import { plans, type PlatformData } from '../domain/platform';
import { ApiError, requirePlatform } from './access';
import { db } from './database';

const administrativeEvents = [
  'OrganisationCreated',
  'FacilityCreated',
  'ModuleConfigurationChanged',
];

export async function platformData(session: Session): Promise<PlatformData> {
  requirePlatform(session);
  const [organisations, facilities, activity] = await Promise.all([
    db.organisations.orderBy('name').toArray(),
    db.facilities.toArray(),
    db.events
      .orderBy('occurredAt')
      .reverse()
      .filter((event) => administrativeEvents.includes(event.type))
      .limit(10)
      .toArray(),
  ]);
  return { organisations, facilities, activity };
}

function label(value: unknown, description: string) {
  if (typeof value !== 'string' || !/^[\p{L}\p{N}][\p{L}\p{N} .&'-]{1,64}$/u.test(value.trim())) {
    throw new ApiError(422, 'Enter a valid ' + description + '.');
  }
  return value.trim().replace(/\s+/g, ' ');
}

export async function updatePlatform(path: string, body: unknown, session: Session) {
  requirePlatform(session);
  if (typeof body !== 'object' || !body || Array.isArray(body))
    throw new ApiError(422, 'Invalid request.');
  const value = body as Record<string, unknown>;
  return db.transaction('rw', [db.organisations, db.facilities, db.events], async () => {
    const emit = async (type: DomainEvent['type'], entityId: string, facilityId = 'platform') => {
      const event: DomainEvent = {
        type,
        facilityId,
        entityId,
        occurredAt: Date.now(),
        actor: session.account,
      };
      await db.events.add({ ...event, id: crypto.randomUUID() });
      return { id: entityId, event };
    };
    if (path === 'platform/organizations') {
      const name = label(value['name'], 'organization name');
      const plan = plans.find((option) => option === value['plan']);
      if (!plan) throw new ApiError(422, 'Select a subscription plan.');
      if (
        await db.organisations
          .filter((row) => row.name.toLowerCase() === name.toLowerCase())
          .first()
      ) {
        throw new ApiError(409, 'An organization with this name already exists.');
      }
      const id = crypto.randomUUID();
      await db.organisations.add({ id, name, plan });
      return emit('OrganisationCreated', id);
    }
    if (path === 'platform/facilities') {
      const organisation =
        typeof value['tenantId'] === 'string'
          ? await db.organisations.get(value['tenantId'])
          : undefined;
      if (!organisation) throw new ApiError(404, 'Organization not found.');
      const name = label(value['name'], 'facility name');
      const city = label(value['city'], 'city');
      if (
        await db.facilities
          .where('tenantId')
          .equals(organisation.id)
          .filter((row) => row.name.toLowerCase() === name.toLowerCase())
          .first()
      ) {
        throw new ApiError(409, 'This organization already has a facility with that name.');
      }
      const id = crypto.randomUUID();
      await db.facilities.add({
        id,
        name,
        city,
        tenantId: organisation.id,
        inpatient: false,
        configurationVersion: 1,
      });
      return emit('FacilityCreated', id, id);
    }
    if (path !== 'platform/entitlements') throw new ApiError(404, 'Platform operation not found.');
    const facility =
      typeof value['facilityId'] === 'string'
        ? await db.facilities.get(value['facilityId'])
        : undefined;
    if (!facility) throw new ApiError(404, 'Facility not found.');
    if (value['version'] !== String(facility.configurationVersion))
      throw new ApiError(409, 'Facility settings have changed. Refresh and try again.');
    if (value['inpatient'] !== 'true' && value['inpatient'] !== 'false')
      throw new ApiError(422, 'Choose an inpatient entitlement state.');
    const inpatient = value['inpatient'] === 'true';
    const organisation = await db.organisations.get(facility.tenantId);
    if (organisation?.plan === 'Clinic' && inpatient)
      throw new ApiError(409, 'The Clinic plan does not include inpatient operations.');
    await db.facilities.update(facility.id, {
      inpatient,
      configurationVersion: (facility.configurationVersion ?? 0) + 1,
    });
    return emit('ModuleConfigurationChanged', facility.id, facility.id);
  });
}
