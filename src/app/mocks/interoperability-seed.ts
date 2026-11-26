import type { LabOrder } from '../domain/diagnostics';
import type { Connector } from '../domain/interoperability';
import type { Encounter } from '../domain/operations';
import { examplePatientId, patientFacility } from './accounts';

export const initialConnectors: Connector[] = [
  {
    id: 'mer-referral-records',
    facilityId: patientFacility,
    recipientAccount: 'partnercare',
    name: 'Referral records',
    standard: 'Document exchange',
    status: 'Enabled',
    version: 1,
  },
  {
    id: 'mer-specialist-results',
    facilityId: patientFacility,
    recipientAccount: 'partnerlab',
    name: 'Specialist results',
    standard: 'HL7 FHIR',
    status: 'Draft',
    version: 1,
  },
];

export function initialSharingReport(encounters: Encounter[]): LabOrder[] {
  const encounter = encounters.find(
    (row) =>
      row.facilityId === patientFacility &&
      row.patientId === examplePatientId &&
      row.signedAt !== undefined,
  );
  if (!encounter?.signedAt) return [];
  return [
    {
      id: encounter.id + '-sharing-report',
      encounterId: encounter.id,
      facilityId: encounter.facilityId,
      patientId: encounter.patientId,
      test: 'Complete blood count',
      status: 'Published',
      orderedAt: encounter.startedAt,
      changedAt: encounter.signedAt,
      version: 1,
      accession: 'LAB-SHARE-0147',
      finding: 'Result within reference range',
      authorisedBy: 'labreview',
    },
  ];
}
