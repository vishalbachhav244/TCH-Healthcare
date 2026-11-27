import type { Appointment, Practitioner, Specialty } from './operations';

export const enquirySources = ['Phone', 'Reception', 'Referral'] as const;
export const enquiryStatuses = ['New', 'Assigned', 'Contacted', 'Booked', 'Closed'] as const;
export const contactOutcomes = ['Reached', 'No answer', 'Callback requested'] as const;
export const enquiryReasons = ['Resolved without booking', 'Patient declined'] as const;
export type EnquirySource = (typeof enquirySources)[number];
export type EnquiryStatus = (typeof enquiryStatuses)[number];
export type EnquiryAction = 'assign' | 'contact' | 'book' | 'close';
export type ContactOutcome = (typeof contactOutcomes)[number];
export type EnquiryReason = (typeof enquiryReasons)[number];

export type EnquiryUpdate =
  | { action: 'assign'; assignee: string; followUpOn: string }
  | { action: 'contact'; outcome: ContactOutcome }
  | { action: 'book'; practitionerId: string; day: string; time: string }
  | { action: 'close'; reason: EnquiryReason };

export interface EnquiryFields {
  patientId: string;
  specialty: Specialty;
  source: EnquirySource;
}

export interface ContactAttempt {
  id: string;
  outcome: ContactOutcome;
  occurredAt: number;
  actor: string;
}

export interface Enquiry extends EnquiryFields {
  id: string;
  facilityId: string;
  version: number;
  createdAt: number;
  changedAt: number;
  assignee?: string;
  followUpOn?: string;
  attempts: ContactAttempt[];
  appointmentId?: string;
  closedReason?: EnquiryReason;
}

export interface EnquiryBooking {
  id: string;
  day: string;
  time: string;
  status: Appointment['status'];
}

export interface EnquiryPatient {
  id: string;
  name: string;
}

export interface EnquiryRow extends Enquiry {
  patient: EnquiryPatient;
  status: EnquiryStatus;
  booking?: EnquiryBooking;
  assigneeName?: string;
  assignmentCurrent: boolean;
}

export interface CrmData {
  enquiries: EnquiryRow[];
  agents: { account: string; name: string }[];
  practitioners: Practitioner[];
}

export function enquiryStatus(enquiry: Enquiry, booking?: EnquiryBooking): EnquiryStatus {
  if (enquiry.closedReason) return 'Closed';
  if (booking && booking.status !== 'Cancelled') return 'Booked';
  if (enquiry.attempts.some((attempt) => attempt.outcome === 'Reached')) return 'Contacted';
  return enquiry.assignee ? 'Assigned' : 'New';
}

export const engagementChannels = ['Email', 'SMS'] as const;
export const campaignTemplates = [
  'Facility updates',
  'Health education',
  'Community events',
] as const;
export const campaignStatuses = ['Draft', 'Simulated', 'Cancelled'] as const;
export type EngagementChannel = (typeof engagementChannels)[number];
export type CampaignTemplate = (typeof campaignTemplates)[number];
export type CampaignStatus = (typeof campaignStatuses)[number];
export type CampaignAction = 'simulate' | 'cancel';

export interface ContactPreferences {
  email: boolean;
  sms: boolean;
  version: number;
}

export interface EngagementPermission extends ContactPreferences {
  id: string;
  facilityId: string;
  patientId: string;
  changedAt: number;
}

export interface Campaign {
  id: string;
  facilityId: string;
  channel: EngagementChannel;
  template: CampaignTemplate;
  status: CampaignStatus;
  version: number;
  createdAt: number;
  changedAt: number;
  simulatedCount?: number;
}

export interface SourceConversion {
  source: EnquirySource;
  enquiries: number;
  bookings: number;
}

export interface MarketingData {
  campaigns: Campaign[];
  conversions: SourceConversion[];
  audience: Record<EngagementChannel, number>;
}
