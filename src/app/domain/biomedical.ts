export const registeringEquipment = [
  'Patient monitor',
  'Infusion pump',
  'Examination light',
] as const;
export const equipmentLocations = ['Outpatient', 'General ward', 'Critical care'] as const;
export const maintenanceReasons = [
  'Fault reported',
  'Preventive service',
  'Inspection required',
] as const;
export const maintenanceStatuses = [
  'Open',
  'In progress',
  'Ready for release',
  'Completed',
  'Cancelled',
] as const;
export type MaintenanceStatus = (typeof maintenanceStatuses)[number];
export type MaintenanceReason = (typeof maintenanceReasons)[number];
export type MaintenanceAction = 'start' | 'verify' | 'release' | 'cancel';

export interface EquipmentFields {
  tag: string;
  category: (typeof registeringEquipment)[number];
  location: (typeof equipmentLocations)[number];
}

export interface BiomedicalAsset {
  id: string;
  facilityId: string;
  tag: string;
  category: EquipmentFields['category'] | 'Imaging equipment';
  location: string;
  imagingRoom?: string;
  activeWorkId?: string;
  status: 'Available' | 'Unavailable';
  version: number;
}

export interface MaintenanceOrder {
  id: string;
  facilityId: string;
  assetId: string;
  reason: MaintenanceReason;
  status: MaintenanceStatus;
  version: number;
  openedAt: number;
  changedAt: number;
  changedBy: string;
  verifiedAt?: number;
  verifiedBy?: string;
}

export interface MaintenanceRow extends MaintenanceOrder {
  asset: Pick<BiomedicalAsset, 'tag' | 'category' | 'location'>;
}

export interface BiomedicalData {
  equipment: BiomedicalAsset[];
  orders: MaintenanceRow[];
}

export function openMaintenance(order: Pick<MaintenanceOrder, 'status'>) {
  return order.status !== 'Completed' && order.status !== 'Cancelled';
}
