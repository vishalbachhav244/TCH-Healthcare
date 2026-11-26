import { describe, expect, it } from 'vitest';
import { calculateBedCharges, initialBedStays } from './bed-charges';
import type { BedStay } from './discharge';
import type { Admission, Bed } from './operations';

const at = (time: string) => Date.parse(time + '+05:30');

describe('inpatient bed charges', () => {
  it('uses the highest occupied rate once per IST date and excludes midnight discharge', () => {
    const general: BedStay = {
      id: 'general',
      admissionId: 'stay',
      facilityId: 'facility',
      bedId: 'general-bed',
      ward: 'General ward',
      bed: 'G-1',
      dailyRateMinor: 125_000,
      startedAt: at('2026-11-25T22:00:00'),
      endedAt: at('2026-11-26T10:00:00'),
    };
    const critical: BedStay = {
      ...general,
      id: 'critical',
      bedId: 'critical-bed',
      ward: 'Critical care',
      bed: 'I-1',
      dailyRateMinor: 350_000,
      startedAt: general.endedAt!,
      endedAt: at('2026-11-27T00:00:00'),
    };
    expect(calculateBedCharges([critical, general], at('2026-11-27T14:00:00'))).toEqual([
      { day: '2026-11-25', ward: 'General ward', bed: 'G-1', amountMinor: 125_000 },
      { day: '2026-11-26', ward: 'Critical care', bed: 'I-1', amountMinor: 350_000 },
    ]);
    expect(
      calculateBedCharges([{ ...critical, endedAt: critical.startedAt }], critical.startedAt),
    ).toHaveLength(1);
  });

  it('keeps only the verified current placement for legacy transfers', () => {
    const bed: Bed = {
      id: 'G-1',
      facilityId: 'facility',
      label: 'G-1',
      ward: 'General ward',
      status: 'Occupied',
    };
    const admission: Admission = {
      id: 'stay',
      facilityId: bed.facilityId,
      patientId: 'patient',
      bedId: bed.id,
      requestedAt: at('2026-11-24T09:00:00'),
      admittedAt: at('2026-11-24T10:00:00'),
      version: 3,
      status: 'Admitted',
    };
    const transferTime = at('2026-11-25T12:00:00');
    const now = at('2026-11-26T12:00:00');
    expect(
      initialBedStays([admission], [bed], now, [
        {
          type: 'BedAllocated',
          entityId: admission.id,
          facilityId: bed.facilityId,
          occurredAt: transferTime,
        },
      ]),
    ).toMatchObject([{ partial: true, startedAt: transferTime, bedId: bed.id }]);
    expect(initialBedStays([{ ...admission, status: 'Discharged' }], [bed], now)).toEqual([]);
    expect(initialBedStays([admission], [{ ...bed, facilityId: 'other' }], now)).toEqual([]);
  });
});
