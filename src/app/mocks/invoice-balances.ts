import { invoiceTotal, type Invoice, type InvoiceAmounts } from '../domain/operations';
import { db } from './database';

export async function invoiceBalances(invoices: readonly Invoice[]) {
  const invoiceIds = invoices.map((invoice) => invoice.id);
  const [payments, movements] = await Promise.all([
    db.payments.where('invoiceId').anyOf(invoiceIds).toArray(),
    db.stockMovements.where('invoiceId').anyOf(invoiceIds).toArray(),
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
    totals.reviewMinor += move.reviewMinor;
  }
  return amounts;
}
