import type { Encounter, Patient } from './operations';

export const labCatalogue = [
  'Complete blood count',
  'Metabolic panel',
  'Urinalysis',
  'Lipid panel',
] as const;
export type LabTest = (typeof labCatalogue)[number];
export const labStages = [
  'Ordered',
  'Collected',
  'Processing',
  'Entered',
  'Authorised',
  'Published',
] as const;
export type LabStage = (typeof labStages)[number];
export const labFindings = [
  'Result within reference range',
  'Result flagged for clinician review',
] as const;
export type LabFinding = (typeof labFindings)[number];

export interface LabOrder {
  id: string;
  encounterId: string;
  facilityId: string;
  patientId: string;
  test: LabTest;
  status: LabStage;
  orderedAt: number;
  changedAt: number;
  version: number;
  accession?: string;
  finding?: LabFinding;
  authorisedBy?: string;
}

export interface LabRow {
  order: LabOrder;
  patient: Patient;
}

export function labFixtures(encounters: Encounter[]) {
  return encounters
    .filter((encounter, i) => encounter.signedAt && i % 2 === 0)
    .map((encounter, i): LabOrder => {
      const step = i % labStages.length;
      return {
        id: encounter.id + '-L',
        encounterId: encounter.id,
        facilityId: encounter.facilityId,
        patientId: encounter.patientId,
        test: labCatalogue[i % labCatalogue.length],
        status: labStages[step],
        orderedAt: encounter.startedAt,
        changedAt: encounter.startedAt + step * 840_000,
        version: 1 + step,
        accession: step > 0 ? 'LAB-' + String(10_000 + i) : undefined,
        finding: step >= 3 ? labFindings[i % labFindings.length] : undefined,
        authorisedBy: step >= 4 ? 'labreview' : undefined,
      };
    });
}
