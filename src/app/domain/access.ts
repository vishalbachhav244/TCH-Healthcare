export const staffRoles = {
  medicalDirector: {
    label: 'Medical director',
    workspaces: ['D07'],
    writes: ['clinical-governance'],
  },
  qualityCoordinator: { label: 'Quality coordinator', workspaces: ['D08'], writes: ['quality'] },
  pharmacist: { label: 'Pharmacist', workspaces: ['D22'], writes: ['pharmacy'] },
  networkExecutive: { label: 'Network executive', workspaces: ['D05', 'D06'], writes: [] },
  executive: {
    label: 'Facility executive',
    workspaces: ['D06', 'D10', 'D11', 'D19'],
    writes: ['overview', 'schedule-exceptions'],
  },
  reception: {
    label: 'Reception',
    workspaces: ['D09', 'D10', 'D11'],
    writes: ['patients', 'appointments', 'queue'],
  },
  clinician: { label: 'Clinician', workspaces: ['D13'], writes: ['clinical'] },
  wardPhysician: {
    label: 'Inpatient physician',
    workspaces: ['D14'],
    writes: ['inpatient-physician'],
  },
  wardNurse: { label: 'Ward nurse', workspaces: ['D15'], writes: ['nursing-station'] },
  emergencyClinician: { label: 'Emergency clinician', workspaces: ['D16'], writes: ['emergency'] },
  criticalCare: {
    label: 'Critical care clinician',
    workspaces: ['D17'],
    writes: ['critical-care'],
  },
  theatreCoordinator: {
    label: 'Theatre coordinator',
    workspaces: ['D18'],
    writes: ['operation-theatre'],
  },
  cashier: { label: 'Cashier', workspaces: ['D24'], writes: ['billing'] },
  finance: { label: 'Finance officer', workspaces: ['D25'], writes: ['finance'] },
  insurance: { label: 'Insurance coordinator', workspaces: ['D26'], writes: ['insurance'] },
  inventory: { label: 'Stores officer', workspaces: ['D27'], writes: ['inventory'] },
  procurement: { label: 'Procurement officer', workspaces: ['D28'], writes: ['procurement'] },
  workforce: { label: 'Workforce coordinator', workspaces: ['D29'], writes: ['workforce'] },
  biomedical: { label: 'Biomedical engineer', workspaces: ['D30'], writes: ['biomedical'] },
  supportCoordinator: {
    label: 'Hospital support coordinator',
    workspaces: ['D31'],
    writes: ['hospital-support'],
  },
  transportDispatcher: {
    label: 'Transport dispatcher',
    workspaces: ['D32'],
    writes: ['patient-transport'],
  },
  admissions: { label: 'Admissions', workspaces: ['D19'], writes: ['beds'] },
  laboratory: { label: 'Laboratory technician', workspaces: ['D20'], writes: ['laboratory'] },
  labReviewer: { label: 'Laboratory reviewer', workspaces: ['D20'], writes: ['laboratory/review'] },
  imagingTechnician: { label: 'Imaging technician', workspaces: ['D21'], writes: ['radiology'] },
  radiologyReviewer: { label: 'Radiologist', workspaces: ['D21'], writes: ['radiology/review'] },
  bloodBank: { label: 'Blood bank officer', workspaces: ['D23'], writes: ['blood-bank'] },
  clinicOperator: {
    label: 'Clinic operator',
    workspaces: ['D06', 'D09', 'D10', 'D11', 'D19'],
    writes: ['overview', 'patients', 'appointments', 'queue', 'schedule-exceptions'],
  },
} as const;

export type StaffRole = keyof typeof staffRoles;
export interface StaffMembership {
  id: string;
  account: string;
  facilityId: string;
  role: StaffRole;
  active: boolean;
  version: number;
  practitionerId?: string;
}

export interface FacilityAccess {
  workspaces: string[];
  writes: string[];
  practitionerId?: string;
}
