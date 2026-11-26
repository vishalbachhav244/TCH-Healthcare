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
  cashier: { label: 'Cashier', workspaces: ['D24'], writes: ['billing'] },
  admissions: { label: 'Admissions', workspaces: ['D19'], writes: ['beds'] },
  laboratory: { label: 'Laboratory technician', workspaces: ['D20'], writes: ['laboratory'] },
  labReviewer: { label: 'Laboratory reviewer', workspaces: ['D20'], writes: ['laboratory/review'] },
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
