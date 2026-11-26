import type { StaffRole } from './access';

export const shiftStatuses = [
  'Scheduled',
  'Checked in',
  'Completed',
  'Absent',
  'Cancelled',
] as const;
export type ShiftStatus = (typeof shiftStatuses)[number];
export const shiftTimes = Array.from(
  { length: 49 },
  (_, slot) => String(Math.floor(slot / 2)).padStart(2, '0') + (slot % 2 ? ':30' : ':00'),
);
export type ShiftAction = 'check-in' | 'check-out' | 'absent' | 'cancel';

export interface RosterMember {
  id: string;
  account: string;
  name: string;
  role: StaffRole;
  version: number;
}

export interface ShiftFields {
  membershipId: string;
  membershipVersion: number;
  day: string;
  startsAt: string;
  endsAt: string;
}

export interface StaffShift extends ShiftFields {
  id: string;
  facilityId: string;
  account: string;
  name: string;
  role: StaffRole;
  status: ShiftStatus;
  version: number;
  changedAt: number;
  changedBy: string;
  checkedInAt?: number;
  checkedOutAt?: number;
}

export interface ShiftRow extends StaffShift {
  assignmentCurrent: boolean;
}

export interface WorkforceData {
  members: RosterMember[];
  shifts: ShiftRow[];
}
