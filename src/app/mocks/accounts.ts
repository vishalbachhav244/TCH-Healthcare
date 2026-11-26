import type { StaffMembership, StaffRole } from '../domain/access';

export const platformAccount = 'platform';
export const subscriptionAccount = 'success';
export const operationsAccount = 'operations';
export const integrationAccount = 'integration';
export const patientAccount = 'patient';
export const patientFacility = 'mer-central';
export const examplePatientId = 'TC-MERIDIAN-01001';
export const recordRecipients = [
  { account: 'partnercare', name: 'CityCare Referral Centre' },
  { account: 'partnerlab', name: 'Horizon Specialist Diagnostics' },
] as const;
export const staff = {
  medicaldirector: { name: 'Dr. Aruna Rao', role: 'medicalDirector', facilities: ['mer-central'] },
  quality: { name: 'Harini Patel', role: 'qualityCoordinator', facilities: ['mer-central'] },
  pharmacy: { name: 'Reena Mathew', role: 'pharmacist', facilities: ['mer-central'] },
  network: {
    name: 'Nalini Verma',
    role: 'networkExecutive',
    facilities: ['mer-central', 'mer-north'],
  },
  executive: { name: 'Aditi Mehra', role: 'executive', facilities: ['mer-central', 'mer-north'] },
  reception: { name: 'Meera Shah', role: 'reception', facilities: ['mer-central'] },
  clinician: { name: 'Dr. Nandita Rao', role: 'clinician', facilities: ['mer-central'] },
  wardphysician: {
    name: 'Dr. Mira Desai',
    role: 'wardPhysician',
    facilities: ['mer-central', 'mer-north'],
  },
  wardcover: { name: 'Dr. Arvind Shah', role: 'wardPhysician', facilities: ['mer-central'] },
  wardnurse: { name: 'Neha Pillai', role: 'wardNurse', facilities: ['mer-central', 'mer-north'] },
  wardrelief: { name: 'Ishani Joshi', role: 'wardNurse', facilities: ['mer-central'] },
  emergency: {
    name: 'Dr. Kabir Mehta',
    role: 'emergencyClinician',
    facilities: ['mer-central', 'mer-north'],
  },
  icu: { name: 'Dr. Leena Reddy', role: 'criticalCare', facilities: ['mer-central', 'mer-north'] },
  theatre: {
    name: 'Riya Bose',
    role: 'theatreCoordinator',
    facilities: ['mer-central', 'mer-north'],
  },
  cashier: { name: 'Rohan Nair', role: 'cashier', facilities: ['mer-central'] },
  finance: { name: 'Sanjay Das', role: 'finance', facilities: ['mer-central', 'mer-north'] },
  claims: { name: 'Leena Patel', role: 'insurance', facilities: ['mer-central', 'mer-north'] },
  admissions: { name: 'Charu Menon', role: 'admissions', facilities: ['mer-central'] },
  lab: { name: 'Farah Joseph', role: 'laboratory', facilities: ['mer-central'] },
  labreview: { name: 'Dr. Ajay Iyer', role: 'labReviewer', facilities: ['mer-central'] },
  imaging: {
    name: 'Kavya Menon',
    role: 'imagingTechnician',
    facilities: ['mer-central', 'mer-north'],
  },
  radiologist: { name: 'Dr. Tara Iyer', role: 'radiologyReviewer', facilities: ['mer-central'] },
  bloodbank: { name: 'Vikram Shah', role: 'bloodBank', facilities: ['mer-central', 'mer-north'] },
  sunrise: { name: 'Ishita Rao', role: 'clinicOperator', facilities: ['sunrise'] },
} satisfies Record<string, { name: string; role: StaffRole; facilities: string[] }>;

export const accountNames: Readonly<Record<string, string>> = {
  [platformAccount]: 'Devika Iyer',
  [subscriptionAccount]: 'Priya Desai',
  [operationsAccount]: 'Aniket Shah',
  [integrationAccount]: 'Maya Menon',
  [patientAccount]: 'Ananya Sharma',
  ...Object.fromEntries(Object.entries(staff).map(([key, value]) => [key, value.name])),
  ...Object.fromEntries(recordRecipients.map(({ account, name }) => [account, name])),
};

export const globalAccess: Readonly<Record<string, { workspaces: string[]; writes: string[] }>> = {
  [platformAccount]: { workspaces: ['D01'], writes: ['platform'] },
  [subscriptionAccount]: { workspaces: ['D02'], writes: ['subscriptions'] },
  [operationsAccount]: { workspaces: ['D03'], writes: ['platform-operations'] },
  [integrationAccount]: { workspaces: ['D04'], writes: ['integrations'] },
  ...Object.fromEntries(
    recordRecipients.map(({ account }) => [
      account,
      { workspaces: ['D04'], writes: ['record-requests'] },
    ]),
  ),
};

export const membershipId = (account: string, facilityId: string) => account + ':' + facilityId;
export const initialStaff: StaffMembership[] = Object.entries(staff).flatMap(([account, staff]) =>
  staff.facilities.map((facilityId) => ({
    id: membershipId(account, facilityId),
    account,
    facilityId,
    role: staff.role,
    active: true,
    version: 1,
    practitionerId: staff.role === 'clinician' ? facilityId + '-DR-1' : undefined,
  })),
);
