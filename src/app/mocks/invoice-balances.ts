import { invoiceTotal, type Invoice, type InvoiceAmounts } from '../domain/operations';
import { openInsuranceClaim } from '../domain/insurance';
import { db } from './database';

export async function invoiceBalances(invoices: readonly Invoice[]) {
  const invoiceIds = invoices.map((invoice) => invoice.id);
  const [payments, movements, refunds, claims] = await Promise.all([
    db.payments.where('invoiceId').anyOf(invoiceIds).toArray(),
    db.stockMovements.where('invoiceId').anyOf(invoiceIds).toArray(),
    db.refundDecisions.where('invoiceId').anyOf(invoiceIds).toArray(),
    db.insuranceClaims.where('invoiceId').anyOf(invoiceIds).toArray(),
  ]);
  const byId = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  const amounts = new Map(
    invoices.map((invoice): [string, InvoiceAmounts] => {
      const totalMinor = invoiceTotal(invoice);
      return [
        invoice.id,
        { totalMinor, balanceMinor: totalMinor, creditedMinor: 0, reviewMinor: 0 },
      ];
    }),
  );
  for (const payment of payments) {
    const invoice = amounts.get(payment.invoiceId);
    if (invoice) invoice.balanceMinor -= payment.amountMinor;
  }
  const decided = new Map(refunds.map((decision) => [decision.movementId, decision]));
  for (const move of movements) {
    if (move.kind !== 'Patient return') continue;
    const invoice = byId.get(move.invoiceId);
    const totals = amounts.get(move.invoiceId);
    if (
      !totals ||
      invoice?.facilityId !== move.facilityId ||
      invoice.prescriptionId !== move.prescriptionId
    )
      continue;
    totals.creditedMinor += move.creditMinor;
    totals.balanceMinor -= move.creditMinor;
    const decision = decided.get(move.id);
    if (decision?.facilityId === invoice.facilityId && decision.invoiceId === invoice.id) {
      if (decision.amountMinor)
        totals.refundedMinor = (totals.refundedMinor ?? 0) + decision.amountMinor;
    } else {
      totals.reviewMinor += move.reviewMinor;
    }
  }
  for (const claim of claims) {
    const invoice = byId.get(claim.invoiceId);
    const totals = amounts.get(claim.invoiceId);
    if (
      invoice?.facilityId === claim.facilityId &&
      invoice.patientId === claim.patientId &&
      totals &&
      openInsuranceClaim(claim)
    )
      totals.insurancePending = true;
  }
  return amounts;
}
