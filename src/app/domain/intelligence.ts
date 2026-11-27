import type { Observation, Specialty } from './operations';

export const analyticsWindows = [7, 14, 30] as const;
export type AnalyticsWindow = (typeof analyticsWindows)[number];

export interface AnalyticsDay {
  day: string;
  scheduled: number;
  walkIn: number;
  completed: number;
  cancelled: number;
  waitSamples: number;
  waitMilliseconds: number;
  netMinor: number;
  postingCount: number;
}

export interface SpecialtyActivity {
  specialty: Specialty;
  scheduled: number;
  walkIn: number;
  completed: number;
}

export interface AnalyticsReport {
  days: AnalyticsDay[];
  specialties: SpecialtyActivity[];
}

export const documentationFormats = ['Visit record summary', 'Administrative handoff'] as const;
export const draftStatuses = ['Pending review', 'Approved', 'Rejected'] as const;
export const dailyDraftLimits = [1, 3, 5, 10] as const;
export type DocumentationFormat = (typeof documentationFormats)[number];
export type DraftStatus = (typeof draftStatuses)[number];
export type DailyDraftLimit = (typeof dailyDraftLimits)[number];
export type DraftAction = 'edit' | 'approve' | 'reject';

export interface DocumentationPolicy {
  enabled: boolean;
  dailyLimit: DailyDraftLimit;
  version: number;
}

export interface FacilityDocumentationPolicy extends DocumentationPolicy {
  facilityId: string;
}

export interface DocumentationSource {
  encounterId: string;
  day: string;
  time: string;
  specialty: Specialty;
  observation: Observation;
}

export interface DocumentationDraft {
  id: string;
  facilityId: string;
  encounterId: string;
  author: string;
  day: string;
  version: number;
  status: DraftStatus;
  format: DocumentationFormat;
  text: string;
  createdAt: number;
  changedAt: number;
}

export interface DocumentationRow extends DocumentationDraft {
  source: DocumentationSource;
}

export interface AutomationData {
  policy: DocumentationPolicy;
  usage: { today: number; pending: number; approved: number; rejected: number };
  sources: DocumentationSource[];
  drafts: DocumentationRow[];
  activity: Pick<DocumentationDraft, 'id' | 'status' | 'createdAt' | 'changedAt'>[];
}
