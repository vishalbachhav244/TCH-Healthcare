import { shiftDay, type Encounter, type Facility } from '../domain/operations';
import { products, type Prescription, type StockLot, type StockMovement } from '../domain/pharmacy';

type DispensingMovement = Extract<StockMovement, { kind: 'Dispensed' }>;
export type LegacyDispensingMovement = Omit<DispensingMovement, 'kind'>;

export function openingStock(
  lots: StockLot[],
  at: number,
  history: readonly LegacyDispensingMovement[] = [],
): StockMovement[] {
  const dispensedByLot = new Map<string, number>();
  for (const move of history) {
    const key = move.facilityId + ':' + move.lotId;
    dispensedByLot.set(key, (dispensedByLot.get(key) ?? 0) + move.quantity);
  }
  return lots.map((lot) => ({
    id: lot.id + ':opening',
    lotId: lot.id,
    facilityId: lot.facilityId,
    kind: 'Opening balance',
    quantity: lot.onHand - (dispensedByLot.get(lot.facilityId + ':' + lot.id) ?? 0),
    at,
    actor: 'system',
  }));
}

export function pharmacyFixtures(facilities: Facility[], encounters: Encounter[], day: string) {
  const prescriptions: Prescription[] = [];
  const lots: StockLot[] = [];
  for (const facility of facilities) {
    products.forEach((product, index) => {
      lots.push(
        {
          id: `${facility.id}-${product.id}-1`,
          facilityId: facility.id,
          productId: product.id,
          batch: `HC-${2320 + index}`,
          expiresOn: shiftDay(day, 125 + index * 11),
          onHand: 38 + index * 4,
        },
        {
          id: `${facility.id}-${product.id}-2`,
          facilityId: facility.id,
          productId: product.id,
          batch: `HC-${1824 + index}`,
          expiresOn: shiftDay(day, index === 0 ? -1 : 31 + index * 4),
          onHand: 5 + index * 2,
        },
      );
    });
    encounters
      .filter((row) => row.facilityId === facility.id && !!row.signedAt)
      .slice(0, 2)
      .forEach((row, index) => {
        prescriptions.push({
          id: row.id + '-rx',
          facilityId: row.facilityId,
          encounterId: row.id,
          patientId: row.patientId,
          practitionerId: row.practitionerId,
          productId: products[index].id,
          quantity: index + 2,
          status: 'Signed',
          createdAt: row.startedAt,
          signedAt: row.signedAt,
          signedBy: row.practitionerId,
        });
      });
  }
  return { lots, prescriptions };
}
