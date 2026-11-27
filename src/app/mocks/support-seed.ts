import type { Bed, Facility } from '../domain/operations';
import type { SupportTask } from '../domain/support';
import type { TransportUnit } from '../domain/transport';

export function bedPreparation(bed: Bed, id: string, time: number, actor?: string): SupportTask {
  return {
    id,
    facilityId: bed.facilityId,
    service: 'Housekeeping',
    request: 'Prepare bed',
    bedId: bed.id,
    activeBedId: bed.id,
    location: bed.ward,
    status: 'Queued',
    version: 1,
    requestedAt: time,
    changedAt: time,
    changedBy: actor,
  };
}

export function initialBedPreparations(beds: readonly Bed[], time: number) {
  return beds
    .filter((bed) => bed.status === 'Cleaning')
    .map((bed) => bedPreparation(bed, bed.id + '-cleaning-initial', time));
}

export function initialTransportUnits(facilities: readonly Facility[]): TransportUnit[] {
  return facilities
    .filter((facility) => facility.inpatient)
    .flatMap((facility) => [
      {
        id: facility.id + '-porter-1',
        facilityId: facility.id,
        label: 'Porter team 1',
        kind: 'Internal transfer',
      },
      {
        id: facility.id + '-porter-2',
        facilityId: facility.id,
        label: 'Porter team 2',
        kind: 'Internal transfer',
      },
      {
        id: facility.id + '-ambulance-1',
        facilityId: facility.id,
        label: 'Ambulance 1',
        kind: 'Ambulance transfer',
      },
    ]);
}
