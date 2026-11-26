import type { StockLotView } from './pharmacy';

export const requisitionPurposes = [
  'Routine replenishment',
  'Low stock',
  'Replace expired stock',
] as const;
export const countReasons = ['Cycle count', 'Recount after discrepancy'] as const;
export const requisitionStatuses = [
  'Requested',
  'Approved',
  'Rejected',
  'Withdrawn',
  'Ordered',
] as const;
export const orderStatuses = ['Ordered', 'Partially received', 'Received', 'Cancelled'] as const;
export type RequisitionStatus = (typeof requisitionStatuses)[number];
export type PurchaseOrderStatus = (typeof orderStatuses)[number];

export interface RequisitionFields {
  productId: string;
  quantity: number;
  purpose: (typeof requisitionPurposes)[number];
}

export interface Requisition extends RequisitionFields {
  id: string;
  facilityId: string;
  reference: string;
  status: RequisitionStatus;
  version: number;
  requestedAt: number;
  requestedBy: string;
  changedAt: number;
  changedBy: string;
}

export interface Supplier {
  id: string;
  facilityId: string;
  name: string;
  items: { productId: string; unitMinor: number }[];
}

export interface PurchaseOrder {
  id: string;
  facilityId: string;
  reference: string;
  requisitionId: string;
  supplierId: string;
  supplierName: string;
  productId: string;
  quantity: number;
  receivedQuantity: number;
  unitMinor: number;
  status: PurchaseOrderStatus;
  version: number;
  issuedAt: number;
  issuedBy: string;
  changedAt: number;
}

export interface ReceiptFields {
  purchaseOrderId: string;
  version: number;
  reference: string;
  batch: string;
  expiresOn: string;
  quantity: number;
}

export interface GoodsReceipt {
  id: string;
  facilityId: string;
  purchaseOrderId: string;
  movementId: string;
  lotId: string;
  reference: string;
  batch: string;
  quantity: number;
  receivedAt: number;
  receivedBy: string;
}

export interface CountFields {
  lotId: string;
  expectedOnHand: number;
  countedOnHand: number;
  reference: string;
  reason: (typeof countReasons)[number];
}

export interface RequisitionRow extends Requisition {
  purchaseOrderReference?: string;
}

export interface ReceivingRow extends Omit<PurchaseOrder, 'unitMinor'> {
  receipts: GoodsReceipt[];
}

export interface InventoryData {
  lots: StockLotView[];
  requisitions: RequisitionRow[];
  orders: ReceivingRow[];
}

export interface ProcurementData {
  requisitions: RequisitionRow[];
  orders: PurchaseOrder[];
  suppliers: Supplier[];
}

export function openPurchaseOrder(order: Pick<PurchaseOrder, 'status'>) {
  return order.status === 'Ordered' || order.status === 'Partially received';
}
