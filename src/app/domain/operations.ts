import type { FacilityAccess } from './access';
import type { DischargePlanStatus } from './discharge';

export const specialties = [
  'General Medicine',
  'Cardiology',
  'Orthopaedics',
  'Paediatrics',
  'Dermatology',
  'ENT',
] as const;
export type Specialty = (typeof specialties)[number];

export interface Facility {
  id: string;
  tenantId: string;
  name: string;
  city: string;
  inpatient: boolean;
  publicQueue?: boolean;
  configurationVersion?: number;
  active?: boolean;
}

export interface Patient {
  id: string;
  tenantId: string;
  name: string;
  initials: string;
  age: number;
}

export interface Practitioner {
  id: string;
  facilityId: string;
  name: string;
  specialty: Specialty;
}

export interface Appointment {
  id: string;
  facilityId: string;
  patientId: string;
  practitionerId: string;
  day: string;
  time: string;
  channel: 'Scheduled' | 'Walk-in';
  status: 'Booked' | 'Checked in' | 'In consultation' | 'Completed' | 'Cancelled';
  pass?: string;
  version?: number;
  followUpId?: string;
}

export interface Ticket {
  id: string;
  facilityId: string;
  appointmentId: string;
  number: number;
  arrivedAt: number;
  calledAt?: number;
  lastCalledAt?: number;
  status: 'Waiting' | 'Called' | 'In consultation' | 'Completed' | 'Skipped';
}

export interface QueueDisplayData {
  facility: string;
  calling: { number: number; specialty: Specialty }[];
  waiting: number;
}

export interface Encounter {
  id: string;
  facilityId: string;
  appointmentId: string;
  patientId: string;
  practitionerId: string;
  startedAt: number;
  signedAt?: number;
  observation?: Observation;
}

export const observations = [
  'History reviewed and findings documented.',
  'Observation completed. Follow-up discussed.',
  'Records reviewed. Diagnostic review requested.',
] as const;
export type Observation = (typeof observations)[number];

interface InvoiceBase {
  id: string;
  facilityId: string;
  patientId: string;
  day: string;
  lines: { description: string; unitMinor: number; quantity: number }[];
}

export type Invoice = InvoiceBase &
  (
    | { encounterId: string; prescriptionId?: string; admissionId?: never }
    | { admissionId: string; encounterId?: never; prescriptionId?: never }
  );

export interface Payment {
  id: string;
  invoiceId: string;
  day: string;
  amountMinor: number;
  claimId?: string;
}

export interface Bed {
  id: string;
  facilityId: string;
  label: string;
  ward: string;
  status: 'Available' | 'Occupied' | 'Cleaning' | 'Maintenance';
}

export interface Admission {
  id: string;
  facilityId: string;
  patientId: string;
  requestedAt: number;
  admittedAt?: number;
  dischargedAt?: number;
  bedId?: string;
  status: 'Requested' | 'Admitted' | 'Discharged';
  version: number;
}

export interface InpatientBoard {
  beds: Bed[];
  admissions: {
    admission: Admission;
    patient: Patient;
    stepDownRequestedAt?: number;
    dischargeSummaryStatus?: DischargePlanStatus;
  }[];
}

export interface Alert {
  id: string;
  facilityId: string;
  title: string;
  detail: string;
  severity: 'Priority' | 'Attention' | 'Information';
  time: string;
  acknowledged: boolean;
}

export interface Session {
  token: string;
  account: string;
  name: string;
  workspaces: string[];
  writes: string[];
  facilityIds: string[];
  facilityAccess: Record<string, FacilityAccess>;
  expiresAt: number;
}

export interface AppointmentRow {
  appointment: Appointment;
  patient: Patient;
  practitioner: Practitioner;
  ticket?: Ticket;
  encounter?: Encounter;
}

export interface DashboardData {
  days: { day: string; scheduled: number; walkIn: number }[];
  metrics: {
    appointments: number;
    priorAppointments: number;
    activeQueue: number;
    averageWait: number;
    bedCapacity: number;
    bedsOccupied: number;
    revenueMinor: number;
    priorRevenueMinor: number;
  };
  departments: { name: Specialty; appointments: number; completed: number; waiting: number }[];
  alerts: Alert[];
  appointments: AppointmentRow[];
}

export interface NetworkFacilityMetrics {
  facility: Pick<Facility, 'id' | 'name' | 'city' | 'inpatient'>;
  metrics: DashboardData['metrics'];
  departments: DashboardData['departments'];
}

export interface AppointmentPage {
  items: AppointmentRow[];
  total: number;
}

export interface AccessOptions {
  practitioners: Practitioner[];
  patients: Patient[];
}

export interface InvoiceAmounts {
  balanceMinor: number;
  totalMinor: number;
  creditedMinor: number;
  reviewMinor: number;
  refundedMinor?: number;
  insurancePending?: boolean;
}

export interface InvoiceRow extends InvoiceAmounts {
  invoice: Invoice;
  patient: Patient;
}

export type EventType =
  | 'PatientRegistered'
  | 'AppointmentBooked'
  | 'AppointmentRescheduled'
  | 'AppointmentCancelled'
  | 'WaitlistJoined'
  | 'WaitlistBooked'
  | 'WaitlistWithdrawn'
  | 'ScheduleExceptionCreated'
  | 'ScheduleExceptionReleased'
  | 'PatientCheckedIn'
  | 'QueueTicketCalled'
  | 'QueueTicketRecalled'
  | 'QueueTicketSkipped'
  | 'QueueTicketRequeued'
  | 'QueueTicketTransferred'
  | 'EncounterStarted'
  | 'EncounterCompleted'
  | 'FollowUpRequested'
  | 'FollowUpBooked'
  | 'FollowUpWithdrawn'
  | 'InvoiceCreated'
  | 'PaymentRecorded'
  | 'AlertAcknowledged'
  | 'AdmissionRequested'
  | 'BedAllocated'
  | 'PatientAdmitted'
  | 'WardTeamAssigned'
  | 'WardRoundRecorded'
  | 'WardOrderPlaced'
  | 'WardOrderCancelled'
  | 'NursingTaskStarted'
  | 'NursingTaskCompleted'
  | 'WardObservationRecorded'
  | 'EmergencyArrivalRecorded'
  | 'EmergencyAssessmentRecorded'
  | 'EmergencyAdmissionRequested'
  | 'EmergencyVisitClosed'
  | 'IcuReviewRecorded'
  | 'IcuStepDownRequested'
  | 'TheatreCaseBooked'
  | 'TheatreCaseStatusChanged'
  | 'PatientDischarged'
  | 'DischargeDraftSaved'
  | 'DischargeSummarySigned'
  | 'BedReleased'
  | 'ClinicalOrderCreated'
  | 'LabStageChanged'
  | 'LabResultAuthorized'
  | 'LabResultPublished'
  | 'ImagingOrdered'
  | 'ImagingUpdated'
  | 'ImagingReportPublished'
  | 'BloodComponentRequested'
  | 'BloodRequestUpdated'
  | 'AppointmentPassIssued'
  | 'OrganisationCreated'
  | 'FacilityCreated'
  | 'ModuleConfigurationChanged'
  | 'FacilityActivationChanged'
  | 'StaffAccessChanged'
  | 'SubscriptionPlanChanged'
  | 'SubscriptionReviewed'
  | 'PrescriptionDrafted'
  | 'PrescriptionSigned'
  | 'PrescriptionDispensed'
  | 'PharmacyStockReceived'
  | 'PharmacyStockReturned'
  | 'MedicationReturnRecorded'
  | 'CollectionDayClosed'
  | 'RefundReviewDecided'
  | 'InsuranceCoverageRecorded'
  | 'InsuranceClaimUpdated'
  | 'RequisitionRecorded'
  | 'RequisitionUpdated'
  | 'PurchaseOrderIssued'
  | 'PurchaseOrderCancelled'
  | 'GoodsReceiptPosted'
  | 'StockCountRecorded'
  | 'StaffShiftScheduled'
  | 'StaffAttendanceUpdated'
  | 'BiomedicalAssetRegistered'
  | 'MaintenanceOpened'
  | 'MaintenanceUpdated'
  | 'SupportRequested'
  | 'SupportUpdated'
  | 'TransportRequested'
  | 'TransportUpdated'
  | 'IncidentOpened'
  | 'IncidentInvestigating'
  | 'IncidentResolved'
  | 'ConnectorConfigured'
  | 'MatchingCodeIssued'
  | 'RecordRequested'
  | 'ConsentChanged'
  | 'RecordAccessed'
  | 'ClinicalReviewRecorded'
  | 'QualityCaseOpened'
  | 'QualityCaseClaimed'
  | 'QualityCaseResolved';

export interface DomainEvent {
  type: EventType;
  facilityId: string;
  entityId: string;
  occurredAt: number;
  actor?: string;
}

export const dayInIndia = (value = Date.now()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);

export function shiftDay(day: string, amount: number) {
  const date = new Date(day + 'T00:00:00.000Z');
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function invoiceTotal(invoice: Invoice) {
  return invoice.lines.reduce((total, line) => total + line.unitMinor * line.quantity, 0);
}

export function invoiceStatus(amounts: InvoiceAmounts) {
  if (amounts.insurancePending) return 'Insurance pending';
  if (amounts.balanceMinor > 0) return 'Outstanding';
  if (amounts.reviewMinor > 0) return 'Review needed';
  return amounts.creditedMinor === amounts.totalMinor && amounts.totalMinor > 0
    ? 'Credited'
    : 'Paid';
}
