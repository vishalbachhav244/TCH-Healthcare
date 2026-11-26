import type { DomainEvent, Facility, Practitioner } from './operations';
import type { StaffMembership } from './access';

export const plans = ['Clinic', 'Hospital', 'Network'] as const;
export type Plan = (typeof plans)[number];

export interface Organisation {
  id: string;
  name: string;
  plan: Plan;
  subscriptionVersion?: number;
  reviewedOn?: string;
}

export interface SubscriptionRow {
  organisation: Organisation;
  facilities: number;
  activeFacilities: number;
  inpatientFacilities: number;
  nextReview: string;
}

export interface PlatformData {
  organisations: Organisation[];
  facilities: Facility[];
  activity: DomainEvent[];
  staff: { account: string; name: string }[];
  memberships: StaffMembership[];
  practitioners: Practitioner[];
}
