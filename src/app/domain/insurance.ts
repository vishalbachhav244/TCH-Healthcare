import type { InvoiceAmounts } from './operations';

export const payers = ['Meridian Health Cover', 'Horizon Benefits', 'Civic Health Plan'] as const;
export type Payer = (typeof payers)[number];
export const claimStatuses = [
  'Requested',
  'Authorised',
  'Prepared',
  'Submitted',
  'Settled',
  'Denied',
  'Rejected',
  'Cancelled',
] as const;
export type ClaimStatus = (typeof claimStatuses)[number];

export interface CoverageFields {
  payer: Payer;
  policy: string;
  startsOn: string;
  expiresOn: string;
}

export interface InsuranceCoverage extends CoverageFields {
  id: string;
  facilityId: string;
  patientId: string;
}

export interface InsuranceClaim {
  id: string;
  facilityId: string;
  invoiceId: string;
  coverageId: string;
  patientId: string;
  payer: Payer;
  status: ClaimStatus;
  requestedMinor: number;
  approvedMinor?: number;
  version: number;
  changedAt: number;
}

export type ClaimAction =
  | { action: 'authorise'; approvedMinor: number }
  | { action: 'deny' | 'prepare' | 'submit' | 'settle' | 'reject' | 'cancel' };

export interface InsuranceRow extends InvoiceAmounts {
  invoiceId: string;
  patientId: string;
  patientName: string;
  service: string;
  coverages: InsuranceCoverage[];
  claim?: InsuranceClaim;
}

export function openInsuranceClaim(claim: Pick<InsuranceClaim, 'status'>) {
  return ['Requested', 'Authorised', 'Prepared', 'Submitted'].includes(claim.status);
}
