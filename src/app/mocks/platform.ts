import type { DomainEvent, Session } from '../domain/operations';
import { plans, type PlatformData } from '../domain/platform';
import { ApiError, requirePlatform } from './access';
import { db } from './database';
import { staff, membershipId } from './accounts';
import { staffRoles, type StaffRole } from '../domain/access';
import { initialTransportUnits } from './support-seed';

const administrativeEvents = [
  'OrganisationCreated',
  'FacilityCreated',
  'ModuleConfigurationChanged',
  'FacilityActivationChanged',
  'StaffAccessChanged',
  'SubscriptionPlanChanged',
  'SubscriptionReviewed',
];

export async function platformData(session: Session): Promise<PlatformData> {
  requirePlatform(session);
  const [organisations, facilities, activity, memberships, practitioners] = await Promise.all([
    db.organisations.orderBy('name').toArray(),
    db.facilities.toArray(),
    db.events
      .orderBy('occurredAt')
      .reverse()
      .filter((event) => administrativeEvents.includes(event.type))
      .limit(10)
      .toArray(),
    db.memberships.toArray(),
    db.practitioners.toArray(),
  ]);
  return {
    organisations,
    facilities,
    activity,
    memberships,
    practitioners,
    staff: Object.entries(staff).map(([account, profile]) => ({ account, name: profile.name })),
  };
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
  return db.transaction(
    'rw',
    [
      db.organisations,
      db.facilities,
      db.memberships,
      db.practitioners,
      db.events,
      db.transportUnits,
    ],
    async () => {
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
          active: false,
          configurationVersion: 1,
        });
        return emit('FacilityCreated', id, id);
      }
      if (!['platform/entitlements', 'platform/activation', 'platform/membership'].includes(path))
        throw new ApiError(404, 'Platform operation not found.');
      const facility =
        typeof value['facilityId'] === 'string'
          ? await db.facilities.get(value['facilityId'])
          : undefined;
      if (!facility) throw new ApiError(404, 'Facility not found.');
      if (path === 'platform/membership') {
        const account = value['account'];
        if (typeof account !== 'string' || !Object.hasOwn(staff, account))
          throw new ApiError(422, 'Select a named staff account.');
        const id = membershipId(account, facility.id);
        const existing = await db.memberships.get(id);
        const version = existing?.version ?? 0;
        if (value['version'] !== String(version))
          throw new ApiError(409, 'Staff access has changed. Refresh and try again.');
        const state = value['active'];
        if (state !== 'true' && state !== 'false')
          throw new ApiError(422, 'Choose a staff access status.');
        if (state === 'false') {
          if (!existing?.active)
            throw new ApiError(409, 'This staff account has no active membership.');
          await db.memberships.update(id, { active: false, version: version + 1 });
        } else {
          const role = value['role'];
          if (typeof role !== 'string' || !Object.hasOwn(staffRoles, role))
            throw new ApiError(422, 'Select a facility role.');
          const practitioner =
            role === 'clinician' && typeof value['practitionerId'] === 'string'
              ? await db.practitioners.get(value['practitionerId'])
              : undefined;
          if (role === 'clinician' && practitioner?.facilityId !== facility.id) {
            throw new ApiError(422, 'Select a practitioner registered at this facility.');
          }
          if (
            practitioner &&
            (await db.memberships
              .where('facilityId')
              .equals(facility.id)
              .filter(
                (grant) =>
                  grant.id !== id && grant.active && grant.practitionerId === practitioner.id,
              )
              .first())
          ) {
            throw new ApiError(
              409,
              'An active staff account is already assigned to this practitioner.',
            );
          }
          await db.memberships.put({
            id,
            account,
            facilityId: facility.id,
            role: role as StaffRole,
            active: true,
            version: version + 1,
            practitionerId: practitioner?.id,
          });
        }
        return emit('StaffAccessChanged', facility.id, facility.id);
      }
      if (value['version'] !== String(facility.configurationVersion))
        throw new ApiError(409, 'Facility settings have changed. Refresh and try again.');
      if (path === 'platform/activation') {
        if (value['active'] !== 'true' && value['active'] !== 'false')
          throw new ApiError(422, 'Choose a facility status.');
        await db.facilities.update(facility.id, {
          active: value['active'] === 'true',
          configurationVersion: (facility.configurationVersion ?? 0) + 1,
        });
        return emit('FacilityActivationChanged', facility.id, facility.id);
      }
      if (value['inpatient'] !== 'true' && value['inpatient'] !== 'false')
        throw new ApiError(422, 'Choose an inpatient entitlement state.');
      const inpatient = value['inpatient'] === 'true';
      const organisation = await db.organisations.get(facility.tenantId);
      if (organisation?.plan === 'Clinic' && inpatient)
        throw new ApiError(409, 'The Clinic plan does not include inpatient operations.');
      if (inpatient)
        await db.transportUnits.bulkPut(initialTransportUnits([{ ...facility, inpatient }]));
      await db.facilities.update(facility.id, {
        inpatient,
        configurationVersion: (facility.configurationVersion ?? 0) + 1,
      });
      return emit('ModuleConfigurationChanged', facility.id, facility.id);
    },
  );
}
