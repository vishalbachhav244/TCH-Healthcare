import type { Practitioner } from './operations';
import { appointmentSlots } from './scheduling';

export interface PublicFacility {
  id: string;
  name: string;
  city: string;
}

export interface CareDirectory {
  facilities: (PublicFacility & { kiosk: boolean })[];
  clinicians: Practitioner[];
}

export interface PublicAppointment {
  facilityId: string;
  practitionerId: string;
  day: string;
  time: string;
}

export function readPublicAppointment(params: {
  get(key: string): string | null;
}): PublicAppointment | undefined {
  const facilityId = params.get('facilityId') ?? '';
  const practitionerId = params.get('practitionerId') ?? '';
  const day = params.get('day') ?? '';
  const time = params.get('time') ?? '';
  const id = /^[a-z0-9-]{1,80}$/i;
  return id.test(facilityId) &&
    id.test(practitionerId) &&
    /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    appointmentSlots.includes(time)
    ? { facilityId, practitionerId, day, time }
    : undefined;
}

export interface KioskReceipt {
  number: number;
}
