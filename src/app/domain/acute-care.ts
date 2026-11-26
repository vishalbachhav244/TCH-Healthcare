import type { Admission, Patient } from './operations';

export type AcuteWorkspace = 'emergency' | 'critical-care' | 'operation-theatre';
export const arrivalModes = ['Walk-in', 'Ambulance', 'Facility referral'] as const;
export const clinicalPriorities = ['Immediate', 'Urgent', 'Standard'] as const;
export const criticalCareWard = 'Critical care';
export const reviewFocuses = ['Bedside review', 'Team handoff', 'Transfer coordination'] as const;
export const reviewOutcomes = ['Review documented', 'Handoff ready', 'Follow-up needed'] as const;
export const theatreRooms = ['Theatre 1', 'Theatre 2'] as const;
export const procedureCategories = [
  'General surgery',
  'Orthopaedic procedure',
  'Day procedure',
] as const;
export const theatreTimes = Array.from(
  { length: 41 },
  (_, slot) =>
    `${String(8 + Math.floor(slot / 4)).padStart(2, '0')}:${String((slot % 4) * 15).padStart(2, '0')}`,
);

export interface EmergencyCase {
  id: string;
  facilityId: string;
  patientId: string;
  arrival: (typeof arrivalModes)[number];
  arrivedAt: number;
  status: 'Awaiting assessment' | 'Under care' | 'Admission requested' | 'Closed';
  priority?: (typeof clinicalPriorities)[number];
  assessedBy?: string;
  admissionId?: string;
  version: number;
}

export interface IcuReview {
  id: string;
  facilityId: string;
  admissionId: string;
  createdAt: number;
  actor: string;
  focus: (typeof reviewFocuses)[number];
  outcome: (typeof reviewOutcomes)[number];
}

export interface IcuStepDown {
  id: string;
  facilityId: string;
  admissionId: string;
  requestedAt: number;
  requestedBy: string;
  status: 'Requested' | 'Transferred' | 'Closed';
  resolvedAt?: number;
}

export interface TheatreCase {
  id: string;
  facilityId: string;
  admissionId: string;
  room: (typeof theatreRooms)[number];
  category: (typeof procedureCategories)[number];
  day: string;
  startsAt: string;
  endsAt: string;
  status: 'Scheduled' | 'Ready' | 'In theatre' | 'Recovery' | 'Completed' | 'Cancelled';
  version: number;
  changedAt: number;
  changedBy: string;
}

export const openTheatreCase = (record: Pick<TheatreCase, 'status'>) =>
  record.status !== 'Completed' && record.status !== 'Cancelled';

type AcutePatient = Pick<Patient, 'id' | 'name'>;
export interface EmergencyRow extends Omit<
  EmergencyCase,
  'facilityId' | 'patientId' | 'admissionId'
> {
  patient: AcutePatient;
  admissionStatus?: Admission['status'];
}

export interface IcuRow {
  admissionId: string;
  version: number;
  patient: AcutePatient;
  bed: string;
  stepDownRequestedAt?: number;
  reviews: Pick<IcuReview, 'id' | 'createdAt' | 'actor' | 'focus' | 'outcome'>[];
}

export interface TheatreRow extends Omit<TheatreCase, 'facilityId' | 'admissionId'> {
  patient: AcutePatient;
}

export type TheatreBooking = Pick<
  TheatreCase,
  'admissionId' | 'room' | 'category' | 'day' | 'startsAt' | 'endsAt'
>;
export type IcuReviewFields = Pick<IcuReview, 'focus' | 'outcome'>;
export type TheatreAction = 'ready' | 'start' | 'recovery' | 'complete' | 'cancel';

export type AcuteView =
  | { kind: 'emergency'; cases: EmergencyRow[] }
  | { kind: 'critical-care'; occupied: number; available: number; patients: IcuRow[] }
  | {
      kind: 'operation-theatre';
      cases: TheatreRow[];
      admissions: { id: string; patient: AcutePatient; bed: string }[];
    };
