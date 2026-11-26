import type { LabFinding, LabTest } from './diagnostics';

export const qualityCategories = ['Patient safety', 'Documentation', 'Service process'] as const;
export const qualityPriorities = ['Routine', 'Elevated'] as const;
export const dispositions = [
  'Follow-up scheduled',
  'Policy reviewed',
  'Containment confirmed',
] as const;
export type Disposition = (typeof dispositions)[number];

export interface ClinicalReview {
  reportId: string;
  facilityId: string;
  status: 'Acknowledged' | 'Referred';
  reviewedAt: number;
  reviewer: string;
  caseId?: string;
}

export interface QualityCase {
  id: string;
  facilityId: string;
  title: string;
  category: (typeof qualityCategories)[number] | 'Diagnostic follow-up';
  priority: (typeof qualityPriorities)[number];
  origin: 'Clinical referral' | 'Facility report';
  status: 'Open' | 'Investigating' | 'Resolved';
  version: number;
  createdAt: number;
  owner?: string;
  timeline: {
    status: QualityCase['status'];
    at: number;
    actor: string;
    disposition?: Disposition;
  }[];
}

export interface GovernanceItem {
  id: string;
  test: LabTest;
  finding: LabFinding;
  accession: string;
  publishedAt: number;
  version: number;
  review?: ClinicalReview['status'];
  caseStatus?: QualityCase['status'];
}

export interface GovernanceData {
  encounters: number;
  signedNotes: number;
  flaggedReports: number;
  pendingReviews: number;
  total: number;
  items: GovernanceItem[];
}

export type QualityView = Omit<QualityCase, 'facilityId' | 'owner'> & {
  ownedByCurrentUser: boolean;
};
