import type { DomainEvent, Facility, Session } from '../domain/operations';
import { products } from '../domain/pharmacy';
import { requisitionPurposes, type ProcurementData } from '../domain/procurement';
import { ApiError } from './access';
import { db } from './database';
import { stockQuantity } from './pharmacy-stock';

export async function supplyWorklist(facility: Facility) {
  const [requisitions, orders] = await Promise.all([
    db.supplyRequisitions.where('facilityId').equals(facility.id).toArray(),
    db.purchaseOrders.where('facilityId').equals(facility.id).toArray(),
  ]);
  const orderReferences = new Map(orders.map((order) => [order.requisitionId, order.reference]));
  return {
    requisitions: requisitions
      .map((request) => ({ ...request, purchaseOrderReference: orderReferences.get(request.id) }))
      .sort((a, b) => b.changedAt - a.changedAt),
    orders: orders.sort((a, b) => b.changedAt - a.changedAt),
  };
}

export async function procurementData(facility: Facility): Promise<ProcurementData> {
  const [worklist, suppliers] = await Promise.all([
    supplyWorklist(facility),
    db.suppliers.where('facilityId').equals(facility.id).toArray(),
  ]);
  return { ...worklist, suppliers };
}

export async function requisitionAt(facility: Facility, id: unknown) {
  const request = typeof id === 'string' ? await db.supplyRequisitions.get(id) : undefined;
  if (request?.facilityId !== facility.id)
    throw new ApiError(404, 'Requisition unavailable at this facility.');
  return request;
}

export async function orderAt(facility: Facility, id: unknown) {
  const order = typeof id === 'string' ? await db.purchaseOrders.get(id) : undefined;
  if (order?.facilityId !== facility.id)
    throw new ApiError(404, 'Purchase order unavailable at this facility.');
  const request = await requisitionAt(facility, order.requisitionId);
  if (
    request.status !== 'Ordered' ||
    request.productId !== order.productId ||
    request.quantity !== order.quantity
  )
    throw new ApiError(409, 'The purchase order no longer matches its requisition.');
  return order;
}

const reference = (prefix: string, id: string) => prefix + '-' + id.slice(0, 8).toUpperCase();

export async function requisitionCommand(
  facility: Facility,
  session: Session,
  body: Record<string, unknown>,
  operation: 'create' | 'withdraw' | 'decision',
): Promise<DomainEvent> {
  const now = Date.now();
  if (operation === 'create') {
    const product = products.find((item) => item.id === body['productId']);
    const purpose = requisitionPurposes.find((item) => item === body['purpose']);
    if (!product || !purpose)
      throw new ApiError(422, 'Choose a catalogue item and requisition purpose.');
    const quantity = stockQuantity(body['quantity']);
    const id = crypto.randomUUID();
    await db.supplyRequisitions.add({
      id,
      reference: reference('REQ', id),
      facilityId: facility.id,
      productId: product.id,
      quantity,
      purpose,
      status: 'Requested',
      version: 1,
      requestedAt: now,
      requestedBy: session.account,
      changedAt: now,
      changedBy: session.account,
    });
    return {
      type: 'RequisitionRecorded',
      entityId: id,
      facilityId: facility.id,
      occurredAt: now,
      actor: session.account,
    };
  }
  const request = await requisitionAt(facility, body['requisitionId']);
  if (request.status !== 'Requested' || body['version'] !== String(request.version))
    throw new ApiError(409, 'This requisition no longer awaits a decision. Reopen the worklist.');
  const requester = request.requestedBy === session.account;
  if (operation === 'withdraw' ? !requester : requester)
    throw new ApiError(
      403,
      operation === 'withdraw'
        ? 'Only the requester can withdraw this requisition.'
        : 'A different staff member must decide this requisition.',
    );
  const status =
    operation === 'withdraw'
      ? 'Withdrawn'
      : body['decision'] === 'approve'
        ? 'Approved'
        : body['decision'] === 'reject'
          ? 'Rejected'
          : undefined;
  if (!status) throw new ApiError(422, 'Choose an approval decision.');
  await db.supplyRequisitions.update(request.id, {
    status,
    version: request.version + 1,
    changedAt: now,
    changedBy: session.account,
  });
  return {
    type: 'RequisitionUpdated',
    entityId: request.id,
    facilityId: facility.id,
    occurredAt: now,
    actor: session.account,
  };
}

export async function purchaseOrderCommand(
  facility: Facility,
  session: Session,
  body: Record<string, unknown>,
  cancel: boolean,
): Promise<DomainEvent> {
  const now = Date.now();
  if (cancel) {
    const order = await orderAt(facility, body['purchaseOrderId']);
    if (
      body['version'] !== String(order.version) ||
      order.status !== 'Ordered' ||
      order.receivedQuantity !== 0
    )
      throw new ApiError(409, 'Only an order with no posted receipts can be cancelled.');
    await db.purchaseOrders.update(order.id, {
      status: 'Cancelled',
      version: order.version + 1,
      changedAt: now,
    });
    return {
      type: 'PurchaseOrderCancelled',
      entityId: order.id,
      facilityId: facility.id,
      occurredAt: now,
      actor: session.account,
    };
  }
  const request = await requisitionAt(facility, body['requisitionId']);
  if (request.status !== 'Approved' || body['version'] !== String(request.version))
    throw new ApiError(409, 'Approve the current requisition before issuing an order.');
  const supplier =
    typeof body['supplierId'] === 'string' ? await db.suppliers.get(body['supplierId']) : undefined;
  if (supplier?.facilityId !== facility.id)
    throw new ApiError(404, 'Supplier unavailable at this facility.');
  const item = supplier.items.find((entry) => entry.productId === request.productId);
  if (!item) throw new ApiError(422, 'Choose a supplier that carries the requested item.');
  const id = crypto.randomUUID();
  await db.purchaseOrders.add({
    id,
    reference: reference('PO', id),
    facilityId: facility.id,
    requisitionId: request.id,
    productId: request.productId,
    quantity: request.quantity,
    receivedQuantity: 0,
    supplierId: supplier.id,
    supplierName: supplier.name,
    unitMinor: item.unitMinor,
    status: 'Ordered',
    version: 1,
    issuedAt: now,
    issuedBy: session.account,
    changedAt: now,
  });
  await db.supplyRequisitions.update(request.id, {
    status: 'Ordered',
    version: request.version + 1,
    changedAt: now,
    changedBy: session.account,
  });
  return {
    type: 'PurchaseOrderIssued',
    entityId: id,
    facilityId: facility.id,
    occurredAt: now,
    actor: session.account,
  };
}
