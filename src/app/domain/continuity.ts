import type { Observation, Practitioner } from './operations';

export const followUpPurposes = [
  'Review progress',
  'Review test results',
  'Review care plan',
] as const;
export type FollowUpPurpose = (typeof followUpPurposes)[number];

export interface FollowUpRequest {
  id: string;
  facilityId: string;
  patientId: string;
  encounterId: string;
  practitionerId: string;
  startsOn: string;
  endsOn: string;
  purpose: FollowUpPurpose;
  createdAt: number;
  version: number;
  appointmentId?: string;
  withdrawnAt?: number;
}

type Clinician = Pick<Practitioner, 'id' | 'name' | 'specialty'>;

export interface FollowUpSummary {
  id: string;
  clinician: Clinician;
  startsOn: string;
  endsOn: string;
  status: 'To book' | 'Booked' | 'Completed' | 'Withdrawn' | 'Expired';
  version: number;
  visit?: { day: string; time: string };
}

export interface FollowUpDetails extends FollowUpSummary {
  purpose: FollowUpPurpose;
}

export interface BookingContext {
  recentClinician: { clinician: Clinician; signedAt: number } | null;
  followUps: FollowUpSummary[];
}

export interface ClinicalContinuity {
  history: { id: string; clinician: Clinician; signedAt: number; observation?: Observation }[];
  followUp: FollowUpDetails | null;
}
