import type { LabOrder } from './diagnostics';
import type { Appointment, Patient, Practitioner, Ticket } from './operations';

export interface PatientPortal {
  patient: Patient;
  clinicians: Practitioner[];
  appointments: { appointment: Appointment; practitioner: Practitioner; ticket?: Ticket }[];
  records: LabOrder[];
  invoices: { id: string; day: string; totalMinor: number; balanceMinor: number }[];
}
