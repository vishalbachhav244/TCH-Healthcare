import type { Specialty } from './operations';

export type DocumentFormat = 'PDF' | 'TXT';
export type DocumentStatus = 'Available' | 'Withdrawn';
export type DocumentFixture = 'synthetic-referral-v1' | 'synthetic-visit-preparation-v1';

interface DocumentRecord {
  id: string;
  facilityId: string;
  patientId: string;
  status: DocumentStatus;
  addedAt: number;
  changedAt: number;
  version: number;
}

export type PatientDocument = DocumentRecord &
  (
    | { origin: 'Patient upload'; fixture: DocumentFixture }
    | {
        origin: 'Facility release';
        encounterId: string;
        clinician: string;
        day: string;
        time: string;
        specialty: Specialty;
      }
  );

export interface DocumentSummary {
  id: string;
  title: string;
  format: DocumentFormat;
  origin: PatientDocument['origin'];
  status: DocumentStatus;
  addedAt: number;
  version: number;
  clinician?: string;
}

export interface DocumentFile {
  filename: string;
  format: DocumentFormat;
  data: string;
}

export interface DocumentSample extends DocumentFile {
  title: string;
}

export interface DocumentDetail extends DocumentSummary {
  body: string[];
  file: DocumentFile;
  source: string;
}

export interface PatientDocuments {
  documents: DocumentSummary[];
  samples: DocumentSample[];
}
