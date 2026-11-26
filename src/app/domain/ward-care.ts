import type { Admission, Bed, Patient } from './operations';
import type { DischargePlanView } from './discharge';

export const roundFocuses = ['Daily review', 'Post-admission review', 'Care coordination'] as const;
export const roundSummaries = [
  'Reviewed with the ward team',
  'Care plan discussed',
  'Follow-up review requested',
] as const;
export const wardOrderCatalogue = [
  { kind: 'Record ward observations', observation: 'Ward observations' },
  { kind: 'Document shift handover', observation: 'Shift handover' },
  { kind: 'Confirm mobility assistance', observation: 'Mobility assistance' },
] as const;
export const observationKinds = [
  'Ward observations',
  'Shift handover',
  'Mobility assistance',
  'Comfort check',
] as const;
export const observationResults = ['Recorded', 'Physician review requested'] as const;
export type WardOrderKind = (typeof wardOrderCatalogue)[number]['kind'];
export type ObservationKind = (typeof observationKinds)[number];
export type ObservationResult = (typeof observationResults)[number];
export type WardRole = 'inpatient-physician' | 'nursing-station';

export interface WardAssignment {
  admissionId: string;
  facilityId: string;
  physician: string;
  nurse: string;
  version: number;
}

interface WardEntry {
  id: string;
  admissionId: string;
  facilityId: string;
  createdAt: number;
  actor: string;
}

export interface WardRound extends WardEntry {
  focus: (typeof roundFocuses)[number];
  summary: (typeof roundSummaries)[number];
}

export interface WardOrder extends WardEntry {
  kind: WardOrderKind;
}

export interface WardObservation extends WardEntry {
  kind: ObservationKind;
  result: ObservationResult;
  taskId?: string;
}

export interface NursingTask {
  id: string;
  orderId: string;
  admissionId: string;
  facilityId: string;
  status: 'Pending' | 'In progress' | 'Completed' | 'Cancelled';
  version: number;
  updatedAt: number;
  updatedBy: string;
}

export interface WardPatient {
  admission: Pick<Admission, 'id' | 'admittedAt' | 'version'>;
  patient: Pick<Patient, 'id' | 'name' | 'initials'>;
  bed: Pick<Bed, 'label' | 'ward'>;
}

export interface WardWorklistRow extends WardPatient {
  openTasks: number;
  completedTasks: number;
}

export type WardRecordVersion = {
  admissionId: string;
  admissionVersion: number;
  assignmentVersion: number;
};
export type RoundFields = Pick<WardRound, 'focus' | 'summary'>;
export type ObservationFields = Pick<WardObservation, 'kind' | 'result'>;
export type WardOrderRow = {
  id: string;
  kind: WardOrderKind;
  physician: string;
  orderedAt: number;
  task: Pick<NursingTask, 'id' | 'status' | 'version' | 'updatedAt' | 'updatedBy'>;
};

export interface WardDetail extends WardPatient {
  team: { physician: string; nurse: string; version: number };
  dischargePlan?: DischargePlanView;
  rounds: (RoundFields & { id: string; createdAt: number; actor: string })[];
  observations: (ObservationFields & {
    id: string;
    createdAt: number;
    actor: string;
    taskId?: string;
  })[];
  orders: WardOrderRow[];
}

interface TeamChoice {
  account: string;
  name: string;
}

export interface WardAssignmentOptions {
  physicians: TeamChoice[];
  nurses: TeamChoice[];
  assignment: Pick<WardAssignment, 'physician' | 'nurse' | 'version'> | null;
}
