import type { DomainEvent, Facility, Session } from '../domain/operations';
import { stockBalance, type StockMovement } from '../domain/pharmacy';
import {
  countReasons,
  openPurchaseOrder,
  type GoodsReceipt,
  type InventoryData,
} from '../domain/procurement';
import { ApiError } from './access';
import { db } from './database';
import {
  movementsForLot,
  receiveStock,
  requireUnusedStockReference,
  stockLedger,
  stockQuantity,
  stockReference,
} from './pharmacy-stock';
import { orderAt, supplyWorklist } from './procurement';

export async function inventoryData(facility: Facility): Promise<InventoryData> {
  const [{ lots }, worklist, receipts] = await Promise.all([
    stockLedger(facility.id),
    supplyWorklist(facility),
    db.goodsReceipts.where('facilityId').equals(facility.id).toArray(),
  ]);
  const receiptMap = new Map<string, GoodsReceipt[]>();
  for (const receipt of receipts) {
    const records = receiptMap.get(receipt.purchaseOrderId);
    if (records) records.push(receipt);
    else receiptMap.set(receipt.purchaseOrderId, [receipt]);
  }
  return {
    lots,
    requisitions: worklist.requisitions,
    orders: worklist.orders.map(({ unitMinor: _unitMinor, ...order }) => {
      const deliveries = receiptMap.get(order.id) ?? [];
      return { ...order, receipts: deliveries.sort((a, b) => b.receivedAt - a.receivedAt) };
    }),
  };
}

export async function postGoodsReceipt(
  facility: Facility,
  session: Session,
  body: Record<string, unknown>,
): Promise<DomainEvent> {
  const order = await orderAt(facility, body['purchaseOrderId']);
  if (!openPurchaseOrder(order) || body['version'] !== String(order.version))
    throw new ApiError(409, 'This order changed or is closed for receiving. Reopen the worklist.');
  const quantity = stockQuantity(body['quantity']);
  if (quantity > order.quantity - order.receivedQuantity)
    throw new ApiError(409, 'The receipt quantity exceeds the remaining order quantity.');
  const movement = await receiveStock(
    facility,
    session.account,
    { ...body, productId: order.productId },
    order,
  );
  const lot = (await db.stockLots.get(movement.lotId))!;
  const receivedQuantity = order.receivedQuantity + quantity;
  const id = crypto.randomUUID();
  await db.goodsReceipts.add({
    id,
    facilityId: facility.id,
    purchaseOrderId: order.id,
    movementId: movement.id,
    lotId: movement.lotId,
    reference: movement.reference,
    batch: lot.batch,
    quantity,
    receivedAt: movement.at,
    receivedBy: session.account,
  });
  await db.purchaseOrders.update(order.id, {
    receivedQuantity,
    version: order.version + 1,
    changedAt: movement.at,
    status: receivedQuantity === order.quantity ? 'Received' : 'Partially received',
  });
  return {
    type: 'GoodsReceiptPosted',
    entityId: id,
    facilityId: facility.id,
    occurredAt: movement.at,
    actor: session.account,
  };
}

export async function recordStockCount(
  facility: Facility,
  session: Session,
  body: Record<string, unknown>,
): Promise<DomainEvent> {
  const lot = typeof body['lotId'] === 'string' ? await db.stockLots.get(body['lotId']) : undefined;
  if (lot?.facilityId !== facility.id)
    throw new ApiError(404, 'Stock lot unavailable at this facility.');
  const reason = countReasons.find((item) => item === body['reason']);
  if (!reason) throw new ApiError(422, 'Choose a stock count reason.');
  const reference = stockReference(body['reference']);
  const counted = stockQuantity(body['countedOnHand'], true);
  await requireUnusedStockReference(facility.id, reference);
  const { onHand } = stockBalance(await movementsForLot(lot));
  if (body['expectedOnHand'] !== String(onHand))
    throw new ApiError(
      409,
      'Stock changed since the count was opened. Reopen the lot and confirm the current count.',
    );
  const id = crypto.randomUUID();
  const at = Date.now();
  const movement: StockMovement = {
    id,
    facilityId: facility.id,
    lotId: lot.id,
    kind: 'Count adjustment',
    reference,
    reason,
    countedOnHand: counted,
    quantity: counted - onHand,
    at,
    actor: session.account,
  };
  await db.stockMovements.add(movement);
  await db.stockLots.update(lot.id, { onHand: counted });
  return {
    type: 'StockCountRecorded',
    entityId: id,
    facilityId: facility.id,
    occurredAt: at,
    actor: session.account,
  };
}
