import {
  equipmentLocations,
  maintenanceReasons,
  openMaintenance,
  registeringEquipment,
  type BiomedicalData,
  type MaintenanceOrder,
  type MaintenanceStatus,
} from '../domain/biomedical';
import type { DomainEvent, Facility, Session } from '../domain/operations';
import { ApiError } from './access';
import { db } from './database';

export async function unavailableImagingRooms(facilityId: string) {
  const assets = await db.biomedicalAssets
    .where('facilityId')
    .equals(facilityId)
    .filter((asset) => !!asset.imagingRoom && asset.status === 'Unavailable')
    .toArray();
  return new Set(assets.flatMap((asset) => (asset.imagingRoom ? [asset.imagingRoom] : [])));
}

export async function biomedicalData(facility: Facility): Promise<BiomedicalData> {
  const [equipment, orders] = await Promise.all([
    db.biomedicalAssets.where('facilityId').equals(facility.id).toArray(),
    db.maintenanceOrders.where('facilityId').equals(facility.id).toArray(),
  ]);
  const byId = new Map(equipment.map((asset) => [asset.id, asset]));
  return {
    equipment: equipment.sort((a, b) => a.tag.localeCompare(b.tag)),
    orders: orders
      .flatMap((order) => {
        const asset = byId.get(order.assetId);
        if (!asset) return [];
        return [
          {
            ...order,
            asset: { tag: asset.tag, category: asset.category, location: asset.location },
          },
        ];
      })
      .sort(
        (a, b) =>
          Number(openMaintenance(b)) - Number(openMaintenance(a)) || b.changedAt - a.changedAt,
      ),
  };
}

const transitions: Readonly<Record<string, { from: MaintenanceStatus; to: MaintenanceStatus }>> = {
  start: { from: 'Open', to: 'In progress' },
  verify: { from: 'In progress', to: 'Ready for release' },
  release: { from: 'Ready for release', to: 'Completed' },
  cancel: { from: 'Open', to: 'Cancelled' },
};

export async function biomedicalCommand(
  facility: Facility,
  session: Session,
  body: Record<string, unknown>,
  operation: 'register' | 'open' | 'update',
): Promise<DomainEvent> {
  const now = Date.now();
  const event = (type: DomainEvent['type'], id: string): DomainEvent => ({
    type,
    entityId: id,
    facilityId: facility.id,
    occurredAt: now,
    actor: session.account,
  });
  if (operation === 'register') {
    const tag = typeof body['tag'] === 'string' ? body['tag'].trim().toUpperCase() : '';
    const category = registeringEquipment.find((value) => value === body['category']);
    const location = equipmentLocations.find((value) => value === body['location']);
    if (
      !/^[A-Z0-9][A-Z0-9-]{2,19}$/.test(tag) ||
      !category ||
      !location ||
      (!facility.inpatient && location !== 'Outpatient')
    )
      throw new ApiError(
        422,
        'Enter a unique equipment tag, category and valid facility location.',
      );
    if (await db.biomedicalAssets.where('[facilityId+tag]').equals([facility.id, tag]).first())
      throw new ApiError(409, 'That equipment tag already exists at this facility.');
    const id = crypto.randomUUID();
    await db.biomedicalAssets.add({
      id,
      facilityId: facility.id,
      tag,
      category,
      location,
      status: 'Available',
      version: 1,
    });
    return event('BiomedicalAssetRegistered', id);
  }
  if (operation === 'open') {
    const asset =
      typeof body['assetId'] === 'string'
        ? await db.biomedicalAssets.get(body['assetId'])
        : undefined;
    if (asset?.facilityId !== facility.id)
      throw new ApiError(404, 'Equipment unavailable at this facility.');
    if (
      asset.activeWorkId ||
      asset.status !== 'Available' ||
      body['version'] !== String(asset.version)
    )
      throw new ApiError(409, 'Equipment availability changed. Reopen the register.');
    const reason = maintenanceReasons.find((value) => value === body['reason']);
    if (!reason) throw new ApiError(422, 'Choose a maintenance reason.');
    const id = crypto.randomUUID();
    await db.maintenanceOrders.add({
      id,
      facilityId: facility.id,
      assetId: asset.id,
      reason,
      status: 'Open',
      version: 1,
      openedAt: now,
      changedAt: now,
      changedBy: session.account,
    });
    await db.biomedicalAssets.update(asset.id, {
      status: 'Unavailable',
      activeWorkId: id,
      version: asset.version + 1,
    });
    return event('MaintenanceOpened', id);
  }
  const order =
    typeof body['orderId'] === 'string'
      ? await db.maintenanceOrders.get(body['orderId'])
      : undefined;
  if (order?.facilityId !== facility.id)
    throw new ApiError(404, 'Work order unavailable at this facility.');
  if (body['version'] !== String(order.version))
    throw new ApiError(409, 'The work order changed. Reopen it and try again.');
  const action = body['action'];
  const transition =
    typeof action === 'string' && Object.hasOwn(transitions, action)
      ? transitions[action]
      : undefined;
  if (!transition || order.status !== transition.from)
    throw new ApiError(409, 'This action is unavailable at the current work order stage.');
  const asset = await db.biomedicalAssets.get(order.assetId);
  if (
    asset?.facilityId !== facility.id ||
    asset.activeWorkId !== order.id ||
    asset.status !== 'Unavailable'
  )
    throw new ApiError(409, 'The equipment and work order relationship could not be verified.');
  const next: Partial<MaintenanceOrder> = {
    status: transition.to,
    version: order.version + 1,
    changedAt: now,
    changedBy: session.account,
  };
  if (action === 'verify') {
    if (body['verified'] !== 'true')
      throw new ApiError(422, 'Confirm that the local functional check was recorded.');
    next.verifiedAt = now;
    next.verifiedBy = session.account;
  }
  if (action === 'release' && order.verifiedAt === undefined)
    throw new ApiError(409, 'Record the functional check before returning equipment to service.');
  if (!openMaintenance({ status: transition.to })) {
    await db.biomedicalAssets.update(asset.id, {
      status: 'Available',
      activeWorkId: undefined,
      version: asset.version + 1,
    });
  }
  await db.maintenanceOrders.update(order.id, next);
  return event('MaintenanceUpdated', order.id);
}
