import type { Patient } from './operations';

export const dischargeDestinations = ['Home', 'Another facility'] as const;
export const dischargeCourses = [
  'Ward care reviewed',
  'Observation stay completed',
  'Transferred for continued care',
] as const;
export const dischargeFollowUps = [
  'Arrange outpatient review',
  'Receiving team to coordinate',
  'Follow-up to be confirmed',
] as const;

export interface DischargeFields {
  destination: (typeof dischargeDestinations)[number];
  course: (typeof dischargeCourses)[number];
  followUp: (typeof dischargeFollowUps)[number];
}

interface DischargeRelease {
  releasedAt: number;
  admittedAt: number;
  patientName: string;
  facilityName: string;
  ward: string;
  bed: string;
}

export interface DischargePlan extends DischargeFields {
  admissionId: string;
  facilityId: string;
  patientId: string;
  version: number;
  updatedAt: number;
  updatedBy: string;
  signedAt?: number;
  signedBy?: string;
  release?: DischargeRelease;
}

export type DischargePlanStatus = 'Required' | 'Draft' | 'Signed' | 'Released';
export type DischargePlanView = DischargeFields & {
  version: number;
  status: 'Draft' | 'Signed';
  signedBy?: string;
  signedAt?: number;
};
export type DischargeDocument = DischargeFields &
  DischargeRelease & {
    admissionId: string;
    patientId: string;
    signedAt: number;
    signedBy: string;
  };

export interface BedStay {
  id: string;
  admissionId: string;
  facilityId: string;
  bedId: string;
  ward: string;
  bed: string;
  startedAt: number;
  endedAt?: number;
  dailyRateMinor: number;
  partial?: boolean;
}

export const demoWardRates = {
  'General ward': 125_000,
  'Surgical ward': 180_000,
  'Paediatric ward': 150_000,
  'Critical care': 350_000,
} as const;

export interface BedCharge {
  day: string;
  ward: string;
  bed: string;
  amountMinor: number;
}

export interface InpatientAccount {
  admissionId: string;
  facilityId: string;
  patientId: string;
  finalizedAt: number;
  coverage: 'Full stay' | 'Tracked segments only';
  charges: BedCharge[];
}

export interface InpatientBillingRow {
  admissionId: string;
  patient: Pick<Patient, 'id' | 'name'>;
  admittedAt: number;
  finalizedAt?: number;
  coverage: InpatientAccount['coverage'];
  status: 'Accruing' | 'Ready to invoice' | 'Invoiced';
  chargeDays: number;
  totalMinor: number;
  invoiceId?: string;
}

export interface InpatientBillingDetail extends InpatientBillingRow {
  charges: BedCharge[];
}
