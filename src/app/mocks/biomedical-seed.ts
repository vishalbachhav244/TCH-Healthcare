import type { BiomedicalAsset } from '../domain/biomedical';
import type { Facility } from '../domain/operations';
import { imagingCatalogue } from '../domain/radiology';

export function initialEquipment(facilities: readonly Facility[]): BiomedicalAsset[] {
  const rooms = [...new Set(imagingCatalogue.map((item) => item.room))];
  return facilities.flatMap((facility) => [
    ...rooms.map(
      (room, index): BiomedicalAsset => ({
        id: facility.id + '-imaging-' + (index + 1),
        facilityId: facility.id,
        tag: 'IMG-0' + (index + 1),
        category: 'Imaging equipment',
        location: room,
        imagingRoom: room,
        status: 'Available',
        version: 1,
      }),
    ),
    ...(facility.inpatient
      ? [
          {
            id: facility.id + '-monitor-1',
            facilityId: facility.id,
            tag: 'MON-01',
            category: 'Patient monitor',
            location: 'General ward',
            status: 'Available',
            version: 1,
          } as const,
        ]
      : []),
  ]);
}
