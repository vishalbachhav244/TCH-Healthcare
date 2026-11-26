import type { Facility, Session } from '../domain/operations';
import type { Resource } from '../domain/workspaces';
import { db } from './database';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const accounts: Record<
  string,
  {
    name: string;
    facilityIds: string[];
    workspaces: string[];
    writes: string[];
  }
> = {
  platform: {
    name: 'Devika Iyer',
    facilityIds: [],
    workspaces: ['D01'],
    writes: ['platform'],
  },
  executive: {
    name: 'Aditi Mehra',
    facilityIds: ['mer-central', 'mer-north'],
    workspaces: ['D06', 'D10', 'D11', 'D19'],
    writes: ['overview'],
  },
  reception: {
    name: 'Meera Shah',
    facilityIds: ['mer-central'],
    workspaces: ['D09', 'D10', 'D11'],
    writes: ['patients', 'appointments', 'queue'],
  },
  clinician: {
    name: 'Dr. Nandita Rao',
    facilityIds: ['mer-central'],
    workspaces: ['D13'],
    writes: ['clinical'],
  },
  cashier: {
    name: 'Rohan Nair',
    facilityIds: ['mer-central'],
    workspaces: ['D24'],
    writes: ['billing'],
  },
  admissions: {
    name: 'Charu Menon',
    facilityIds: ['mer-central'],
    workspaces: ['D19'],
    writes: ['beds'],
  },
  lab: {
    name: 'Farah Joseph',
    facilityIds: ['mer-central'],
    workspaces: ['D20'],
    writes: ['laboratory'],
  },
  labreview: {
    name: 'Dr. Ajay Iyer',
    facilityIds: ['mer-central'],
    workspaces: ['D20'],
    writes: ['laboratory/review'],
  },
  patient: {
    name: 'Ananya Sharma',
    facilityIds: ['mer-central'],
    workspaces: ['D12'],
    writes: ['portal'],
  },
  sunrise: {
    name: 'Ishita Rao',
    facilityIds: ['sunrise'],
    workspaces: ['D06', 'D09', 'D10', 'D11', 'D19'],
    writes: ['overview', 'patients', 'appointments', 'queue'],
  },
};

export function patientSubject(session: Session) {
  if (session.account !== 'patient') throw new ApiError(403, 'Patient access is unavailable.');
  return 'TC-MERIDIAN-01001';
}

export async function startSession(body: unknown): Promise<Session> {
  if (
    typeof body !== 'object' ||
    body === null ||
    !('account' in body) ||
    !('password' in body) ||
    typeof body.account !== 'string' ||
    body.password !== 'TrueCare-Local-2026' ||
    !Object.hasOwn(accounts, body.account)
  ) {
    throw new ApiError(401, 'The account ID or password was not recognised.');
  }
  const account = accounts[body.account];
  const session: Session = {
    token: crypto.randomUUID(),
    account: body.account,
    name: account.name,
    facilityIds: account.facilityIds,
    workspaces: account.workspaces,
    writes: account.writes,
    expiresAt: Date.now() + 8 * 60 * 60_000,
  };
  await db.sessions.add(session);
  return session;
}

export async function requireSession(token: string | null): Promise<Session> {
  const session = token ? await db.sessions.get(token) : undefined;
  if (!session || session.expiresAt <= Date.now()) throw new ApiError(401, 'Sign in to continue.');
  return session;
}

export function scope(
  session: Session,
  facility: Facility | undefined,
  workspace: string,
  write?: Resource | 'laboratory/review',
): Facility {
  if (
    !facility ||
    !session.facilityIds.includes(facility.id) ||
    !session.workspaces.includes(workspace) ||
    (workspace === 'D19' && !facility.inpatient) ||
    (write && !accounts[session.account]?.writes.includes(write))
  ) {
    throw new ApiError(403, 'You do not have access to this operation at the selected facility.');
  }
  return facility;
}

export function requirePlatform(session: Session) {
  if (
    !session.workspaces.includes('D01') ||
    !accounts[session.account]?.writes.includes('platform')
  ) {
    throw new ApiError(403, 'Platform administration access is required.');
  }
}
