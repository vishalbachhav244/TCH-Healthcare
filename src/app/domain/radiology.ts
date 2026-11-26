import type { Patient } from './operations';

export const imagingCatalogue = [
  { study: 'Chest radiograph', modality: 'X-ray', room: 'X-ray 1' },
  { study: 'Extremity radiograph', modality: 'X-ray', room: 'X-ray 1' },
  { study: 'Abdominal ultrasound', modality: 'Ultrasound', room: 'Ultrasound 1' },
] as const;

export type ImagingStudy = (typeof imagingCatalogue)[number]['study'];
export const imagingStatuses = [
  'Ordered',
  'Scheduled',
  'Acquired',
  'Report ready',
  'Published',
  'Cancelled',
] as const;
export type ImagingStatus = (typeof imagingStatuses)[number];
export const imagingNotes = ['Image series documented', 'Ordering team review requested'] as const;
export type ImagingNote = (typeof imagingNotes)[number];
export const imagingTimes = Array.from(
  { length: 16 },
  (_, index) => String(9 + Math.floor(index / 2)).padStart(2, '0') + (index % 2 ? ':30' : ':00'),
);

export type ImagingAction =
  | { action: 'schedule'; day: string; time: string }
  | { action: 'report'; note: ImagingNote }
  | { action: 'acquire' | 'publish' | 'cancel' };

export interface ImagingOrder {
  id: string;
  facilityId: string;
  patientId: string;
  encounterId: string;
  study: ImagingStudy;
  status: ImagingStatus;
  version: number;
  orderedAt: number;
  changedAt: number;
  scheduledDay?: string;
  scheduledTime?: string;
  note?: ImagingNote;
  reviewer?: string;
  publishedAt?: number;
}

export interface ImagingRow {
  order: ImagingOrder;
  patient: Pick<Patient, 'id' | 'name'>;
  equipmentUnavailable?: boolean;
}

export interface ReleasedImagingReport {
  id: string;
  study: ImagingStudy;
  note: ImagingNote;
  publishedAt: number;
  reviewer: string;
}
