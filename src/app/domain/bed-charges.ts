import { demoWardRates, type BedCharge, type BedStay } from './discharge';
import { dayInIndia, shiftDay, type Admission, type Bed, type DomainEvent } from './operations';

export function bedStayFields(
  admission: Pick<Admission, 'id' | 'facilityId'>,
  bed: Bed,
  startedAt: number,
) {
  const rate = Object.hasOwn(demoWardRates, bed.ward)
    ? demoWardRates[bed.ward as keyof typeof demoWardRates]
    : demoWardRates['General ward'];
  return {
    admissionId: admission.id,
    facilityId: admission.facilityId,
    bedId: bed.id,
    ward: bed.ward,
    bed: bed.label,
    startedAt,
    dailyRateMinor: rate,
  };
}

export function initialBedStays(
  admissions: Admission[],
  beds: Bed[],
  now: number,
  events: DomainEvent[] = [],
): BedStay[] {
  const byId = new Map(beds.map((bed) => [bed.id, bed]));
  const transfers = new Map<string, number>();
  for (const event of events) {
    const key = event.facilityId + ':' + event.entityId;
    transfers.set(key, Math.max(event.occurredAt, transfers.get(key) ?? 0));
  }
  return admissions.flatMap((admission) => {
    const bed = admission.bedId ? byId.get(admission.bedId) : undefined;
    if (
      admission.status !== 'Admitted' ||
      bed?.facilityId !== admission.facilityId ||
      bed.status !== 'Occupied'
    )
      return [];
    const partial = admission.version > 2 || admission.admittedAt === undefined;
    const lastTransfer = transfers.get(admission.facilityId + ':' + admission.id);
    const startedAt = partial
      ? Math.min(now, Math.max(admission.admittedAt ?? 0, lastTransfer ?? now))
      : admission.admittedAt!;
    return [
      {
        id: admission.id + ':initial-stay',
        ...bedStayFields(admission, bed, startedAt),
        ...(partial ? { partial: true } : {}),
      },
    ];
  });
}

export function calculateBedCharges(stays: BedStay[], asOf: number): BedCharge[] {
  const byDay = new Map<string, BedCharge>();
  for (const stay of [...stays].sort(
    (a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id),
  )) {
    const end = Math.min(stay.endedAt ?? asOf, asOf);
    if (end < stay.startedAt) continue;
    // Intervals exclude the end instant, so departure at midnight does not add a day.
    const lastDay = dayInIndia(Math.max(stay.startedAt, end - 1));
    for (let day = dayInIndia(stay.startedAt); day <= lastDay; day = shiftDay(day, 1)) {
      const prior = byDay.get(day);
      if (!prior || stay.dailyRateMinor > prior.amountMinor) {
        byDay.set(day, { day, ward: stay.ward, bed: stay.bed, amountMinor: stay.dailyRateMinor });
      }
    }
  }
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}

export function totalBedCharges(charges: BedCharge[]) {
  return charges.reduce((sum, charge) => sum + charge.amountMinor, 0);
}
