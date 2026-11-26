export const incidentServices = [
  'Workspace access',
  'Queue display',
  'Payment posting',
  'Facility configuration',
] as const;
export const incidentPriorities = ['Normal', 'High', 'Critical'] as const;

export interface PlatformIncident {
  id: string;
  title: string;
  service: (typeof incidentServices)[number];
  priority: (typeof incidentPriorities)[number];
  status: 'Open' | 'Investigating' | 'Resolved';
  version: number;
  createdAt: number;
  updatedAt: number;
}

export interface PlatformOperationsData {
  incidents: PlatformIncident[];
  activeSessions: number;
  eventsToday: number;
  activity: { id: string; type: string; location: string; occurredAt: number }[];
}
