import type { DocumentSummary } from './patient-documents';
import type { Appointment, Practitioner } from './operations';

export interface FamilyPermissions {
  appointments: boolean;
  documents: boolean;
}

export const familyAccessDurations = [24, 168] as const;
export type FamilyAccessDuration = (typeof familyAccessDurations)[number];
export type FamilyAccessUpdate =
  | { action: 'grant'; permissions: FamilyPermissions; hours: FamilyAccessDuration }
  | { action: 'revoke' };

export interface FamilyRelationship {
  id: string;
  facilityId: string;
  tenantId: string;
  patientId: string;
  caregiverPatientId: string;
  caregiverAccount: string;
  permissions: FamilyPermissions;
  expiresAt?: number;
  revoked: boolean;
  version: number;
}

export interface FamilyPass {
  code: string;
  facilityId: string;
  relationshipId: string;
  appointmentId: string;
  grantVersion: number;
  appointmentVersion: number;
}

export type FamilyAccessStatus = 'Inactive' | 'Active' | 'Expired' | 'Revoked';

export interface FamilyAccessEntry {
  id: string;
  name: string;
  direction: 'granted' | 'received';
  permissions: FamilyPermissions;
  status: FamilyAccessStatus;
  expiresAt?: number;
  version: number;
}

export interface FamilyCare {
  access: FamilyAccessEntry;
  appointments: {
    appointment: Pick<Appointment, 'id' | 'day' | 'time' | 'status'> & { version: number };
    practitioner: Practitioner;
  }[];
  clinicians: Practitioner[];
  documents: DocumentSummary[];
}

export interface FamilyBooking {
  practitionerId: string;
  day: string;
  time: string;
}
