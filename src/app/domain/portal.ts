import type { LabOrder } from './diagnostics';
import type { FollowUpDetails } from './continuity';
import type { DischargeDocument } from './discharge';
import type { Appointment, Patient, Practitioner, Ticket } from './operations';

export interface PatientPortal {
  patient: Patient;
  clinicians: Practitioner[];
  appointments: { appointment: Appointment; practitioner: Practitioner; ticket?: Ticket }[];
  records: LabOrder[];
  followUps: FollowUpDetails[];
  dischargeSummaries: DischargeDocument[];
  invoices: {
    id: string;
    day: string;
    totalMinor: number;
    balanceMinor: number;
    inpatient?: boolean;
  }[];
}
