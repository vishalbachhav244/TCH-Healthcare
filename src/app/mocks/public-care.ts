import type { DomainEvent, Facility } from '../domain/operations';
import type { CareDirectory, PublicFacility } from '../domain/public-care';
import { ApiError } from './access';
import { checkInAppointment } from './arrival';
import { db } from './database';
import { availability } from './scheduling';

function publicFacility({ id, name, city }: Facility): PublicFacility {
  return { id, name, city };
}

function published(facility: Facility | undefined, capability: 'publicDiscovery' | 'publicKiosk') {
  return facility?.[capability] === true && facility.active !== false ? facility : undefined;
}

export function requireDiscovery(facility: Facility | undefined) {
  const site = published(facility, 'publicDiscovery');
  if (!site) throw new ApiError(404, 'Online booking is unavailable for this facility.');
  return site;
}

export async function directory(): Promise<CareDirectory> {
  return db.transaction('r', [db.facilities, db.practitioners], async () => {
    const sites = (await db.facilities.toArray()).filter((row) =>
      published(row, 'publicDiscovery'),
    );
    const clinicians = await db.practitioners
      .where('facilityId')
      .anyOf(sites.map(({ id }) => id))
      .toArray();
    return {
      facilities: sites
        .map((site) => ({ ...publicFacility(site), kiosk: site.publicKiosk === true }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      clinicians: clinicians
        .map(({ id, facilityId, name, specialty }) => ({ id, facilityId, name, specialty }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  });
}

export function publicAvailability(facilityId: string, practitionerId: string, day: string) {
  return db.transaction(
    'r',
    [db.facilities, db.practitioners, db.appointments, db.scheduleExceptions],
    async () =>
      availability(requireDiscovery(await db.facilities.get(facilityId)), practitionerId, day),
  );
}

async function requireKiosk(id: string) {
  const facility = published(await db.facilities.get(id), 'publicKiosk');
  if (!facility) throw new ApiError(404, 'Self-service check-in is unavailable at this address.');
  return facility;
}

export async function kioskLocation(id: string) {
  return publicFacility(await requireKiosk(id));
}

export async function kioskCheckIn(id: string, body: unknown) {
  return db.transaction(
    'rw',
    [
      db.facilities,
      db.appointments,
      db.tickets,
      db.events,
      db.familyPasses,
      db.familyRelationships,
      db.patients,
      db.practitioners,
    ],
    async () => {
      const facility = await requireKiosk(id);
      const code =
        typeof body === 'object' && body !== null && 'pass' in body ? body.pass : undefined;
      const { appointmentId, number } = await checkInAppointment(facility, code);
      const event: DomainEvent = {
        type: 'PatientCheckedIn',
        facilityId: facility.id,
        entityId: appointmentId,
        occurredAt: Date.now(),
        actor: 'kiosk',
      };
      await db.events.add({ ...event, id: crypto.randomUUID() });
      return { number, event };
    },
  );
}
