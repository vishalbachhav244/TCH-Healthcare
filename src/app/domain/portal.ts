import type { LabOrder } from './diagnostics';
import type { FollowUpDetails } from './continuity';
import type { DischargeDocument } from './discharge';
import type { ReleasedImagingReport } from './radiology';
import type { PatientMedication } from './pharmacy';
import type { Appointment, InvoiceAmounts, Patient, Practitioner, Ticket } from './operations';

export interface PatientPortal {
  patient: Patient;
  clinicians: Practitioner[];
  appointments: { appointment: Appointment; practitioner: Practitioner; ticket?: Ticket }[];
  records: LabOrder[];
  followUps: FollowUpDetails[];
  dischargeSummaries: DischargeDocument[];
  imagingReports: ReleasedImagingReport[];
  medications: PatientMedication[];
  invoices: (InvoiceAmounts & {
    id: string;
    day: string;
    inpatient?: boolean;
  })[];
}
