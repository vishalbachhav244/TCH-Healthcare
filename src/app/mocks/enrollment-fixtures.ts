import type { PatientInvitation } from '../domain/registration';

export const patientInvitations: PatientInvitation[] = [
  {
    code: 'H4K9-M7Q2-V6N3',
    facilityId: 'mer-central',
    tenantId: 'meridian',
    patientIndex: 20_001,
  },
  {
    code: 'T8L3-R6P7-K4V2',
    facilityId: 'mer-north',
    tenantId: 'meridian',
    patientIndex: 20_002,
  },
  {
    code: 'B7Q4-N2H8-P5R3',
    facilityId: 'sunrise',
    tenantId: 'sunrise',
    patientIndex: 20_001,
  },
];
