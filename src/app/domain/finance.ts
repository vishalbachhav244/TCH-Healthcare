export const refundOutcomes = ['Record local refund', 'Close without refund'] as const;
export type RefundOutcome = (typeof refundOutcomes)[number];

export interface RefundDecision {
  movementId: string;
  invoiceId: string;
  facilityId: string;
  outcome: RefundOutcome;
  amountMinor: number;
  day: string;
  decidedAt: number;
  actor: string;
}

export interface CollectionSummary {
  billedMinor: number;
  patientMinor: number;
  payerMinor: number;
  refundedMinor: number;
  netMinor: number;
  paymentCount: number;
}

export interface CollectionClose {
  id: string;
  facilityId: string;
  day: string;
  summary: CollectionSummary;
  countedMinor: number;
  closedAt: number;
  actor: string;
}

export interface RefundReviewRow {
  id: string;
  patient: string;
  medication: string;
  reference: string;
  requestedAt: number;
  requestedMinor: number;
  decision?: RefundDecision;
}

export interface FinanceData {
  summary: CollectionSummary;
  close?: CollectionClose;
  reviews: RefundReviewRow[];
}

export function parseRupees(value: string): number | undefined {
  const trimmed = value.trim();
  if (!/^-?\d{1,10}(?:\.\d{1,2})?$/.test(trimmed)) return undefined;
  const [whole, decimals = ''] = trimmed.replace(/^-/, '').split('.');
  const minor = Number(whole) * 100 + Number(decimals.padEnd(2, '0'));
  return trimmed.startsWith('-') ? -minor : minor;
}
