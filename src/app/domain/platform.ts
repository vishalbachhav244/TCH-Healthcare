import type { DomainEvent, Facility } from './operations';

export const plans = ['Clinic', 'Hospital', 'Network'] as const;
export type Plan = (typeof plans)[number];

export interface Organisation {
  id: string;
  name: string;
  plan: Plan;
}

export interface PlatformData {
  organisations: Organisation[];
  facilities: Facility[];
  activity: DomainEvent[];
}
