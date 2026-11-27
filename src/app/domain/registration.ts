export const accountPattern = /^[a-z][a-z0-9]{0,23}$/;
export const registrationAccountPattern = /^[a-z][a-z0-9]{2,23}$/;
export const patientInvitationPattern = /^[A-Z0-9]{4}(?:-[A-Z0-9]{4}){2}$/i;

export interface PatientRegistration {
  account: string;
  password: string;
  facilityId: string;
  invitation: string;
}

export interface PatientEnrollmentAccount {
  account: string;
  facilityId: string;
  tenantId: string;
  patientId: string;
  salt: number[];
  verifier: string;
}

export interface PatientInvitation {
  code: string;
  facilityId: string;
  tenantId: string;
  patientIndex: number;
  claimedAt?: number;
}
