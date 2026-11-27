import type { Bed } from './operations';

export const supportRequests = {
  CSSD: ['Sterile set delivery', 'Used set collection'],
  Dietary: ['Meal trolley delivery', 'Meal trolley collection'],
} as const;

export const supportServices = ['Housekeeping', 'CSSD', 'Dietary'] as const;
export const supportStatuses = ['Queued', 'In progress', 'Completed', 'Cancelled'] as const;
export type SupportStatus = (typeof supportStatuses)[number];
export type SupportAction = 'start' | 'complete' | 'cancel';
export type SupportService = (typeof supportServices)[number];
export type RequestedService = keyof typeof supportRequests;

export interface SupportFields {
  service: RequestedService;
  location: string;
  request: string;
}

type SupportDetails =
  | { service: 'Housekeeping'; bedId: string; activeBedId?: string; request: 'Prepare bed' }
  | { service: RequestedService; request: (typeof supportRequests)[RequestedService][number] };

export type SupportTask = SupportDetails & {
  id: string;
  facilityId: string;
  location: string;
  status: SupportStatus;
  version: number;
  requestedAt: number;
  changedAt: number;
  changedBy?: string;
};

export type SupportRow = SupportTask & { bed?: Pick<Bed, 'label' | 'ward'> };

export interface SupportData {
  locations: string[];
  tasks: SupportRow[];
}

export function openSupportTask(task: Pick<SupportTask, 'status'>) {
  return task.status === 'Queued' || task.status === 'In progress';
}
