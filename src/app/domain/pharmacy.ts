import type { Patient } from './operations';
import type { CountFields } from './procurement';

export const products = [
  { id: 'hydration', name: 'Oral hydration sachets', unit: 'sachet', unitMinor: 3200 },
  { id: 'saline', name: 'Saline nasal spray', unit: 'bottle', unitMinor: 9400 },
  { id: 'tears', name: 'Lubricating eye drops', unit: 'bottle', unitMinor: 12500 },
  { id: 'dressing', name: 'Sterile dressing kit', unit: 'kit', unitMinor: 8400 },
] as const;

export const stockReferencePattern = /^[A-Z0-9][A-Z0-9-]{2,23}$/i;
export const stockBatchPattern = /^[A-Z0-9][A-Z0-9-]{1,23}$/i;
export const supplierReturnReasons = [
  'Supplier recall',
  'Damaged stock',
  'Expired stock',
  'Incorrect shipment',
] as const;
export const medicationReturnReasons = [
  'Unused medication returned',
  'Dispensing discrepancy',
  'Patient declined supply',
] as const;
export const stockMovementKinds = [
  'Opening balance',
  'Received',
  'Dispensed',
  'Supplier return',
  'Patient return',
  'Count adjustment',
] as const;

export interface StockReceipt {
  productId: string;
  batch: string;
  expiresOn: string;
  quantity: number;
  reference: string;
}

export interface SupplierReturn {
  lotId: string;
  quantity: number;
  reference: string;
  reason: (typeof supplierReturnReasons)[number];
}

export interface MedicationReturn {
  prescriptionId: string;
  quantity: number;
  reference: string;
  reason: (typeof medicationReturnReasons)[number];
}

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

interface StockMovementBase {
  id: string;
  facilityId: string;
  lotId: string;
  quantity: number;
  at: number;
  actor: string;
}

export type StockMovement = StockMovementBase &
  (
    | { kind: 'Opening balance'; prescriptionId?: never; reference?: never; invoiceId?: never }
    | {
        kind: 'Received';
        reference: string;
        purchaseOrderId?: string;
        purchaseOrderReference?: string;
        prescriptionId?: never;
        invoiceId?: never;
      }
    | { kind: 'Dispensed'; prescriptionId: string; reference?: never; invoiceId?: never }
    | {
        kind: 'Supplier return';
        reference: string;
        reason: SupplierReturn['reason'];
        prescriptionId?: never;
        invoiceId?: never;
      }
    | {
        kind: 'Patient return';
        reference: string;
        reason: MedicationReturn['reason'];
        prescriptionId: string;
        invoiceId: string;
        creditMinor: number;
        reviewMinor: number;
      }
    | {
        kind: 'Count adjustment';
        reference: string;
        reason: CountFields['reason'];
        countedOnHand: number;
        prescriptionId?: never;
        invoiceId?: never;
      }
  );

export type ReturnMovement = Extract<StockMovement, { kind: 'Patient return' }>;
export type StockLotView = StockLot & { quarantined: number };

export interface PharmacyStockEntry {
  movement: StockMovement;
  batch: string;
  productId: string;
  recordedBy: string;
}

export interface PharmacyData {
  prescriptions: {
    prescription: Prescription;
    patient: Pick<Patient, 'id' | 'name'>;
    returnedQuantity: number;
  }[];
  lots: StockLotView[];
  activity: PharmacyStockEntry[];
}

export interface PatientMedication {
  id: string;
  medication: string;
  quantity: number;
  dispensedAt: number;
  returnedQuantity: number;
}

export function stockBalance(movements: readonly StockMovement[]) {
  return movements.reduce(
    (balance, movement) => {
      if (movement.kind === 'Patient return') balance.quarantined += movement.quantity;
      else balance.onHand += movement.quantity;
      return balance;
    },
    { onHand: 0, quarantined: 0 },
  );
}
