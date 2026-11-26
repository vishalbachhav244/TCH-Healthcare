import { dayInIndia, type DomainEvent, type Facility, type Session } from '../domain/operations';
import {
  medicationReturnReasons,
  products,
  stockBalance,
  stockBatchPattern,
  stockReferencePattern,
  supplierReturnReasons,
  type StockLot,
  type StockMovement,
} from '../domain/pharmacy';
import { ApiError } from './access';
import { db } from './database';
import { invoiceBalances } from './invoice-balances';
import { checkedDay } from './queries';

export async function movementsForLot(lot: StockLot) {
  return db.stockMovements
    .where('lotId')
    .equals(lot.id)
    .filter((move) => move.facilityId === lot.facilityId)
    .toArray();
}

function stockCode(value: unknown, pattern: RegExp, message: string) {
  if (typeof value !== 'string' || !pattern.test(value.trim())) throw new ApiError(422, message);
  return value.trim().toUpperCase();
}

export async function stockCommand(
  path: string,
  facility: Facility,
  session: Session,
  body: Record<string, unknown>,
): Promise<DomainEvent> {
  const reference = stockCode(
    body['reference'],
    stockReferencePattern,
    'Enter a stock reference using 3–24 letters, digits or hyphens.',
  );
  const quantity =
    typeof body['quantity'] === 'string' && /^[1-9][0-9]{0,4}$/.test(body['quantity'])
      ? Number(body['quantity'])
      : 0;
  if (quantity < 1 || quantity > 10_000)
    throw new ApiError(422, 'Enter a whole quantity from 1 to 10,000.');
  if (
    await db.stockMovements.where('[facilityId+reference]').equals([facility.id, reference]).first()
  )
    throw new ApiError(409, 'This stock reference has already been recorded at this facility.');
  const now = Date.now();
  const id = crypto.randomUUID();
  const entry = (lotId: string) => ({
    id,
    lotId,
    facilityId: facility.id,
    quantity,
    reference,
    at: now,
    actor: session.account,
  });
  let movement: StockMovement;
  let type: DomainEvent['type'];
  if (path === 'pharmacy/stock/receipts') {
    const product = products.find((item) => item.id === body['productId']);
    if (!product) throw new ApiError(422, 'Choose a medication from the catalogue.');
    const batch = stockCode(
      body['batch'],
      stockBatchPattern,
      'Enter a batch code using 2–24 letters, digits or hyphens.',
    );
    if (typeof body['expiresOn'] !== 'string' || !body['expiresOn'])
      throw new ApiError(422, 'Enter the batch expiry date.');
    const expiresOn = checkedDay(body['expiresOn']);
    if (expiresOn < dayInIndia(now))
      throw new ApiError(422, 'Choose an expiry date on or after today.');
    const lot = await db.stockLots
      .where('[facilityId+productId+batch]')
      .equals([facility.id, product.id, batch])
      .first();
    if (lot && lot.expiresOn !== expiresOn)
      throw new ApiError(409, 'This batch already has a different expiry date.');
    const lotId = lot?.id ?? crypto.randomUUID();
    const onHand = lot ? stockBalance(await movementsForLot(lot)).onHand : 0;
    if (lot) await db.stockLots.update(lot.id, { onHand: onHand + quantity });
    else
      await db.stockLots.add({
        id: lotId,
        facilityId: facility.id,
        productId: product.id,
        batch,
        expiresOn,
        onHand: quantity,
      });
    movement = { ...entry(lotId), kind: 'Received' };
    type = 'PharmacyStockReceived';
  } else if (path === 'pharmacy/stock/supplier-returns') {
    const lotId = body['lotId'];
    const lot = typeof lotId === 'string' ? await db.stockLots.get(lotId) : undefined;
    if (lot?.facilityId !== facility.id)
      throw new ApiError(404, 'Stock lot is unavailable at this facility.');
    const reason = supplierReturnReasons.find((item) => item === body['reason']);
    if (!reason) throw new ApiError(422, 'Choose a supplier return reason.');
    const { onHand } = stockBalance(await movementsForLot(lot));
    if (onHand < quantity)
      throw new ApiError(409, 'The return quantity exceeds this lot’s on-hand stock.');
    await db.stockLots.update(lot.id, { onHand: onHand - quantity });
    movement = { ...entry(lot.id), kind: 'Supplier return', reason, quantity: -quantity };
    type = 'PharmacyStockReturned';
  } else {
    const prescriptionId = body['prescriptionId'];
    const prescription =
      typeof prescriptionId === 'string' ? await db.prescriptions.get(prescriptionId) : undefined;
    if (prescription?.facilityId !== facility.id)
      throw new ApiError(404, 'Prescription not found.');
    if (prescription.status !== 'Dispensed' || !prescription.lotId || !prescription.invoiceId)
      throw new ApiError(409, 'Only dispensed medication can be returned here.');
    const reason = medicationReturnReasons.find((item) => item === body['reason']);
    if (!reason) throw new ApiError(422, 'Choose a patient return reason.');
    const [lot, invoice, patient, encounter, previous] = await Promise.all([
      db.stockLots.get(prescription.lotId),
      db.invoices.get(prescription.invoiceId),
      db.patients.get(prescription.patientId),
      db.encounters.get(prescription.encounterId),
      db.stockMovements
        .where('prescriptionId')
        .equals(prescription.id)
        .filter((move) => move.facilityId === facility.id && move.lotId === prescription.lotId)
        .toArray(),
    ]);
    const line = invoice?.lines[0];
    if (
      lot?.facilityId !== facility.id ||
      lot.productId !== prescription.productId ||
      !invoice ||
      invoice.facilityId !== facility.id ||
      invoice.prescriptionId !== prescription.id ||
      invoice.encounterId !== prescription.encounterId ||
      invoice.patientId !== prescription.patientId ||
      patient?.tenantId !== facility.tenantId ||
      encounter?.facilityId !== facility.id ||
      encounter.patientId !== patient.id ||
      invoice.lines.length !== 1 ||
      !line ||
      line.quantity !== prescription.quantity ||
      !Number.isSafeInteger(line.unitMinor * line.quantity) ||
      line.unitMinor < 0 ||
      !previous.some(
        (move) => move.kind === 'Dispensed' && move.quantity === -prescription.quantity,
      )
    )
      throw new ApiError(
        409,
        'The dispensing record, original stock lot and invoice could not be verified.',
      );
    const alreadyReturned = stockBalance(previous).quarantined;
    if (quantity > prescription.quantity - alreadyReturned)
      throw new ApiError(409, 'The return quantity exceeds the remaining dispensed quantity.');
    const charge = line.unitMinor * quantity;
    const { balanceMinor } = (await invoiceBalances([invoice])).get(invoice.id)!;
    const creditMinor = Math.min(charge, Math.max(0, balanceMinor));
    movement = {
      ...entry(lot.id),
      kind: 'Patient return',
      reason,
      prescriptionId: prescription.id,
      invoiceId: invoice.id,
      creditMinor,
      reviewMinor: charge - creditMinor,
    };
    type = 'MedicationReturnRecorded';
  }
  await db.stockMovements.add(movement);
  return { type, entityId: id, facilityId: facility.id, occurredAt: now, actor: session.account };
}
