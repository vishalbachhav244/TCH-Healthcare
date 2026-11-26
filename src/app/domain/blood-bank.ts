import type { Patient } from './operations';

export const bloodComponents = ['Red cells', 'Platelets', 'Plasma'] as const;
export type BloodComponent = (typeof bloodComponents)[number];
export const bloodRequestStatuses = [
  'Requested',
  'Reserved',
  'Issued',
  'Declined',
  'Cancelled',
] as const;
export type BloodRequestStatus = (typeof bloodRequestStatuses)[number];
export type BloodAction =
  | { action: 'reserve'; unitId: string; review: 'recorded' }
  | { action: 'issue' | 'decline' | 'cancel' };

export interface BloodRequest {
  id: string;
  facilityId: string;
  admissionId: string;
  patientId: string;
  component: BloodComponent;
  status: BloodRequestStatus;
  version: number;
  requestedAt: number;
  requestedBy: string;
  changedAt: number;
  unitId?: string;
  review?: 'Recorded' | 'Declined';
  reviewedAt?: number;
  reviewedBy?: string;
  issuedAt?: number;
}

export interface BloodUnit {
  id: string;
  facilityId: string;
  code: string;
  component: BloodComponent;
  expiresOn: string;
  status: 'Available' | 'Reserved' | 'Issued';
  requestId?: string;
}

export interface BloodRequestRow {
  request: BloodRequest;
  patient: Pick<Patient, 'id' | 'name'>;
  unitCode?: string;
  reservedUnitExpired?: boolean;
}

export type BloodUnitRow = Omit<BloodUnit, 'status'> & {
  status: BloodUnit['status'] | 'Expired';
  expired: boolean;
};

export interface BloodBankView {
  requests: BloodRequestRow[];
  units: BloodUnitRow[];
}

export type WardBloodRequest = Pick<BloodRequest, 'id' | 'component' | 'status' | 'version'>;

export function openBloodRequest(request: Pick<BloodRequest, 'status'>) {
  return request.status === 'Requested' || request.status === 'Reserved';
}
