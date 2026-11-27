import { staffRoles, type FacilityAccess } from '../domain/access';
import type { Facility, Session } from '../domain/operations';
import { workspaceEnabled, type Resource } from '../domain/workspaces';
import {
  accountNames,
  examplePatientId,
  globalAccess,
  patientAccount,
  patientFacility,
  platformAccount,
  subscriptionAccount,
} from './accounts';
import { db } from './database';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type Identity = Pick<Session, 'token' | 'account' | 'expiresAt'>;
const patientAccess: FacilityAccess = { workspaces: ['D12'], writes: ['portal'] };

async function project(identity: Identity): Promise<Session> {
  const name = accountNames[identity.account];
  if (!Object.hasOwn(accountNames, identity.account) || !name)
    throw new ApiError(401, 'Sign in to continue.');
  let facilityAccess: Session['facilityAccess'] = {};
  if (identity.account === patientAccount) {
    const facility = await db.facilities.get(patientFacility);
    if (facility && facility.active !== false) facilityAccess[patientFacility] = patientAccess;
  } else if (!Object.hasOwn(globalAccess, identity.account)) {
    const grants = await db.memberships
      .where('account')
      .equals(identity.account)
      .filter((grant) => grant.active)
      .toArray();
    const facilities = await db.facilities.bulkGet(grants.map((grant) => grant.facilityId));
    facilityAccess = Object.fromEntries(
      grants.flatMap((grant, index) => {
        const facility = facilities[index];
        if (!facility || facility.active === false) return [];
        const role = staffRoles[grant.role];
        return [
          [
            grant.facilityId,
            {
              workspaces: [...role.workspaces],
              writes: [...role.writes],
              practitionerId: grant.practitionerId,
            },
          ],
        ];
      }),
    );
  }
  const grants = Object.values(facilityAccess);
  return {
    ...identity,
    name,
    facilityAccess,
    facilityIds: Object.keys(facilityAccess),
    workspaces: globalAccess[identity.account]
      ? globalAccess[identity.account].workspaces
      : [...new Set(grants.flatMap((grant) => grant.workspaces))],
    writes: globalAccess[identity.account]
      ? globalAccess[identity.account].writes
      : [...new Set(grants.flatMap((grant) => grant.writes))],
  };
}

export function patientSubject(session: Session) {
  if (session.account !== patientAccount) throw new ApiError(403, 'Patient access is unavailable.');
  return examplePatientId;
}

export async function startSession(body: unknown): Promise<Session> {
  if (
    typeof body !== 'object' ||
    body === null ||
    !('account' in body) ||
    !('password' in body) ||
    typeof body.account !== 'string' ||
    body.password !== 'TrueCare-Local-2026' ||
    !Object.hasOwn(accountNames, body.account)
  ) {
    throw new ApiError(401, 'The account ID or password was not recognised.');
  }
  const session = await project({
    account: body.account,
    token: crypto.randomUUID(),
    expiresAt: Date.now() + 8 * 60 * 60_000,
  });
  await db.sessions.add(session);
  return session;
}

export async function requireSession(token: string | null): Promise<Session> {
  const session = token ? await db.sessions.get(token) : undefined;
  if (!session || session.expiresAt <= Date.now()) throw new ApiError(401, 'Sign in to continue.');
  const { account, expiresAt } = session;
  return project({ token: session.token, account, expiresAt });
}

export function scope(
  session: Session,
  facility: Facility | undefined,
  workspace: string,
  write?: Resource | 'laboratory/review' | 'schedule-exceptions' | 'radiology/review',
): Facility {
  const access = facility ? session.facilityAccess[facility.id] : undefined;
  if (
    !facility ||
    facility.active === false ||
    !access?.workspaces.includes(workspace) ||
    !workspaceEnabled(facility, workspace) ||
    (write && !access.writes.includes(write))
  ) {
    throw new ApiError(403, 'You do not have access to this operation at the selected facility.');
  }
  return facility;
}

export function requirePlatform(session: Session) {
  if (session.account !== platformAccount)
    throw new ApiError(403, 'Platform administration access is required.');
}

export function requireSubscriptions(session: Session) {
  if (session.account !== subscriptionAccount)
    throw new ApiError(403, 'Subscription administration access is required.');
}
