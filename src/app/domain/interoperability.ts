import type { LabFinding, LabTest } from './diagnostics';
import type { DocumentFormat, DocumentSummary } from './patient-documents';
import type { DischargeDocument, DischargeFields } from './discharge';
import type { ReleasedImagingReport } from './radiology';

export const connectorStandards = ['HL7 FHIR', 'Document exchange'] as const;
export const requestPurposes = ['Continuation of care', 'Specialist review'] as const;
export const consentHours = [24, 168] as const;
export const exchangeRecordKinds = [
  'Laboratory report',
  'Imaging report',
  'Discharge summary',
  'Patient document',
] as const;
export type ConsentAction = 'grant' | 'decline' | 'revoke';
export type ConnectorAction = 'validate' | 'enable' | 'pause';
export type RequestStatus = 'Pending' | 'Granted' | 'Declined' | 'Revoked';
export type EffectiveStatus = RequestStatus | 'Expired' | 'Unavailable';
export type ExchangeOutcome =
  | 'Released'
  | 'Consent required'
  | 'Revoked'
  | 'Expired'
  | 'Connector unavailable'
  | 'Source mismatch';

export interface Connector {
  id: string;
  facilityId: string;
  recipientAccount: string;
  name: string;
  standard: (typeof connectorStandards)[number];
  status: 'Draft' | 'Validated' | 'Enabled' | 'Paused';
  version: number;
}

export interface MatchingCode {
  code: string;
  facilityId: string;
  patientId: string;
  connectorId: string;
  expiresAt: number;
  usedAt?: number;
}

export interface RecordRequest {
  id: string;
  facilityId: string;
  patientId: string;
  connectorId: string;
  purpose: (typeof requestPurposes)[number];
  status: RequestStatus;
  createdAt: number;
  version: number;
}

export interface RecordReference {
  kind: (typeof exchangeRecordKinds)[number];
  id: string;
  version: number;
}

export interface ConsentGrant {
  requestId: string;
  record: RecordReference;
  expiresAt: number;
  revoked: boolean;
}

export interface ExchangeAuditEntry {
  id: string;
  requestId: string;
  facilityId: string;
  connectorId: string;
  outcome: ExchangeOutcome;
  occurredAt: number;
}

export interface ConnectorSummary {
  id: string;
  name: string;
  recipient: string;
}

export interface RequestSummary {
  id: string;
  connector: ConnectorSummary;
  source: string;
  purpose: RecordRequest['purpose'];
  status: EffectiveStatus;
  createdAt: number;
  version: number;
  expiresAt?: number;
  reportId?: string;
  recordKind?: RecordReference['kind'];
  decision?: RequestStatus;
}

export interface SharedReport {
  kind?: 'Laboratory report';
  test: LabTest;
  finding: LabFinding;
  accession: string;
  source: string;
  publishedAt: number;
  expiresAt: number;
}

export interface SharedDocument {
  kind: 'Patient document';
  title: string;
  format: DocumentFormat;
  origin: DocumentSummary['origin'];
  body: string[];
  source: string;
  addedAt: number;
  expiresAt: number;
}

export interface SharedImagingReport extends Pick<
  ReleasedImagingReport,
  'study' | 'note' | 'publishedAt' | 'reviewer'
> {
  kind: 'Imaging report';
  source: string;
  expiresAt: number;
}

export interface SharedDischargeSummary extends DischargeFields {
  kind: 'Discharge summary';
  source: string;
  admittedAt: number;
  releasedAt: number;
  signedAt: number;
  signedBy: string;
  expiresAt: number;
}

export type SharedRecord =
  | SharedReport
  | SharedDocument
  | SharedImagingReport
  | SharedDischargeSummary;

export interface AuditSummary {
  id: string;
  connector: string;
  source: string;
  outcome: ExchangeOutcome;
  occurredAt: number;
}

export interface IntegrationDashboard {
  connectors: (Connector & { source: string; recipient: string })[];
  facilities: { id: string; name: string }[];
  recipients: { account: string; name: string }[];
  audit: AuditSummary[];
}

export interface PatientSharing {
  connectors: ConnectorSummary[];
  requests: RequestSummary[];
  audit: AuditSummary[];
  reports: { id: string; version: number; test: LabTest; accession: string; publishedAt: number }[];
  documents: Pick<DocumentSummary, 'id' | 'version' | 'title' | 'format' | 'origin'>[];
  imagingReports: Pick<ReleasedImagingReport, 'id' | 'version' | 'study' | 'publishedAt'>[];
  dischargeSummaries: Pick<DischargeDocument, 'admissionId' | 'version' | 'releasedAt'>[];
}
