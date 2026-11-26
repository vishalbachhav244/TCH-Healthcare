import { bloodComponents, type BloodUnit } from '../domain/blood-bank';
import { shiftDay, type Encounter, type Facility } from '../domain/operations';
import { imagingCatalogue, imagingNotes, type ImagingOrder } from '../domain/radiology';
import { examplePatientId, initialStaff } from './accounts';

export const diagnosticMemberships = initialStaff.filter((row) =>
  ['imagingTechnician', 'radiologyReviewer', 'bloodBank'].includes(row.role),
);

export function initialImagingOrders(encounters: Encounter[], day: string): ImagingOrder[] {
  const byFacility = new Map<string, Encounter[]>();
  const cutoff = Date.parse(shiftDay(day, -1) + 'T00:00:00+05:30');
  for (const row of encounters) {
    if (!row.signedAt || row.patientId === examplePatientId || row.signedAt >= cutoff) continue;
    const list = byFacility.get(row.facilityId);
    if (list) list.push(row);
    else byFacility.set(row.facilityId, [row]);
  }
  return [...byFacility.values()].flatMap((rows) =>
    rows
      .sort((a, b) => b.startedAt - a.startedAt || a.id.localeCompare(b.id))
      .slice(0, 10)
      .map((encounter, i) => {
        const study = imagingCatalogue[i % imagingCatalogue.length].study;
        const orderedAt = encounter.startedAt;
        const scheduledDay = shiftDay(day, Math.floor(i / 3));
        const scheduledTime = ['09:00', '09:30', '10:00'][i % 3];
        const base = {
          id: encounter.id + '-IMG',
          encounterId: encounter.id,
          patientId: encounter.patientId,
          facilityId: encounter.facilityId,
          study,
          orderedAt,
          changedAt: orderedAt,
        };
        if (i === 0)
          return { ...base, status: 'Scheduled', version: 2, scheduledDay, scheduledTime };
        if (i === 1)
          return {
            ...base,
            status: 'Report ready',
            version: 4,
            scheduledDay: shiftDay(day, -1),
            scheduledTime,
            changedAt: Date.parse(shiftDay(day, -1) + 'T10:30:00+05:30'),
            note: imagingNotes[0],
            reviewer: 'radiologist',
          };
        return { ...base, status: 'Ordered', version: 1 };
      }),
  );
}

export function initialBloodUnits(facilities: Facility[], day: string): BloodUnit[] {
  return facilities
    .filter((facility) => facility.inpatient)
    .flatMap((facility) =>
      bloodComponents.flatMap((component, i) =>
        [7, 12, -1].map((days, j) => {
          const code = 'BB-' + String(101 + i * 3 + j);
          return {
            id: facility.id + '-' + code,
            facilityId: facility.id,
            code,
            component,
            expiresOn: shiftDay(day, days),
            status: 'Available' as const,
          };
        }),
      ),
    );
}
