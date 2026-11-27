export const transportDestinations = {
  'Internal transfer': ['Diagnostics', 'Procedure suite'],
  'Ambulance transfer': ['External facility'],
} as const;

export const transportKinds = ['Internal transfer', 'Ambulance transfer'] as const;
export const transportStatuses = [
  'Requested',
  'Dispatched',
  'In transit',
  'Completed',
  'Cancelled',
] as const;
export type TransportKind = (typeof transportKinds)[number];
export type TransportStatus = (typeof transportStatuses)[number];
export type TransportAction = 'dispatch' | 'pickup' | 'complete' | 'cancel';

export interface TransportFields {
  admissionId: string;
  admissionVersion: number;
  kind: TransportKind;
  destination: string;
}

export interface TransportUnit {
  id: string;
  facilityId: string;
  label: string;
  kind: TransportKind;
}

export interface TransportRequest extends Omit<TransportFields, 'admissionVersion'> {
  id: string;
  facilityId: string;
  patientId: string;
  pickupBedId: string;
  status: TransportStatus;
  unitId?: string;
  version: number;
  requestedAt: number;
  changedAt: number;
  changedBy: string;
}

export interface TransportSubject {
  id: string;
  name: string;
}

export interface TransportOption {
  admissionId: string;
  version: number;
  patient: TransportSubject;
  pickup: string;
}

export interface TransportRow extends TransportRequest {
  patient: TransportSubject;
  pickup: string;
  pickupCurrent: boolean;
  unitLabel?: string;
}

export interface TransportData {
  admissions: TransportOption[];
  trips: TransportRow[];
  units: (TransportUnit & { available: boolean })[];
}

export function openTrip(trip: Pick<TransportRequest, 'status'>) {
  return trip.status !== 'Completed' && trip.status !== 'Cancelled';
}

export function tripUsesUnit(trip: Pick<TransportRequest, 'status'>) {
  return trip.status === 'Dispatched' || trip.status === 'In transit';
}
