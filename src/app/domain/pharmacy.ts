import type { Patient } from './operations';

export const products = [
  { id: 'hydration', name: 'Oral hydration sachets', unit: 'sachet', unitMinor: 3200 },
  { id: 'saline', name: 'Saline nasal spray', unit: 'bottle', unitMinor: 9400 },
  { id: 'tears', name: 'Lubricating eye drops', unit: 'bottle', unitMinor: 12500 },
  { id: 'dressing', name: 'Sterile dressing kit', unit: 'kit', unitMinor: 8400 },
] as const;

export interface StockLot {
  id: string;
  facilityId: string;
  productId: string;
  batch: string;
  expiresOn: string;
  onHand: number;
}

export interface Prescription {
  id: string;
  facilityId: string;
  encounterId: string;
  patientId: string;
  practitionerId: string;
  productId: string;
  quantity: number;
  status: 'Draft' | 'Signed' | 'Dispensed';
  createdAt: number;
  signedAt?: number;
  signedBy?: string;
  dispensedAt?: number;
  lotId?: string;
  invoiceId?: string;
}

export interface StockMovement {
  id: string;
  facilityId: string;
  lotId: string;
  prescriptionId: string;
  quantity: number;
  at: number;
  actor: string;
}

export interface PharmacyData {
  prescriptions: { prescription: Prescription; patient: Pick<Patient, 'id' | 'name'> }[];
  lots: StockLot[];
}
