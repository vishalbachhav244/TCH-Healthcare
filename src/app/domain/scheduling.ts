import type { Appointment, Practitioner } from './operations';

export const appointmentPassPattern = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;

export const appointmentSlots = Array.from({ length: 32 }, (_, slot) => {
  const hour = String(9 + Math.floor(slot / 4)).padStart(2, '0');
  const minute = String((slot % 4) * 15).padStart(2, '0');
  return hour + ':' + minute;
});
export const scheduleBoundaries = [...appointmentSlots, '17:00'];
export const exceptionReasons = [
  'Clinician leave',
  'Team meeting',
  'Service interruption',
] as const;

export interface WaitlistEntry {
  id: string;
  facilityId: string;
  patientId: string;
  practitionerId: string;
  day: string;
  requestedAt: number;
  status: 'Waiting' | 'Booked' | 'Withdrawn';
  version: number;
  appointmentId?: string;
}

export interface ScheduleException {
  id: string;
  facilityId: string;
  practitionerId: string;
  day: string;
  start: string;
  end: string;
  reason: (typeof exceptionReasons)[number];
  createdAt: number;
  releasedAt?: number;
}

export interface WaitlistRow {
  id: string;
  patient: string;
  patientId: string;
  practitioner: string;
  practitionerId: string;
  requestedAt: number;
  status: WaitlistEntry['status'] | 'Expired';
  version: number;
  availableTimes: string[];
  bookedTime?: string;
  bookedDay?: string;
  appointmentStatus?: Appointment['status'];
}

export interface SchedulingDay {
  practitioners: Practitioner[];
  waitlist: WaitlistRow[];
  exceptions: (Omit<ScheduleException, 'facilityId' | 'createdAt'> & { practitioner: string })[];
}
