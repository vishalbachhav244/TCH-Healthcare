import { staffRoles, type FacilityAccess } from '../domain/access';
import type { Facility, Session } from '../domain/operations';
import { accountPattern } from '../domain/registration';
import { workspaceEnabled, type Resource } from '../domain/workspaces';
import {
  accountNames,
  globalAccess,
  patientFacility,
  patientIdentity,
  platformAccount,
  subscriptionAccount,
} from './accounts';
import { db } from './database';
import { passwordVerifier } from './credentials';

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
  const builtIn = Object.hasOwn(accountNames, identity.account);
  const enrolled = builtIn ? undefined : await db.patientAccounts.get(identity.account);
  const global = Object.hasOwn(globalAccess, identity.account)
    ? globalAccess[identity.account]
    : undefined;
  let name = builtIn ? accountNames[identity.account] : undefined;
  const patientId = enrolled?.patientId ?? patientIdentity(identity.account);
  let facilityAccess: Session['facilityAccess'] = {};
  if (patientId) {
    const facilityId = enrolled?.facilityId ?? patientFacility;
    const [facility, patient] = await Promise.all([
      db.facilities.get(facilityId),
      db.patients.get(patientId),
    ]);
    if (!patient || (enrolled && patient.tenantId !== enrolled.tenantId))
      throw new ApiError(401, 'Sign in to continue.');
    name = patient.name;
    if (facility?.tenantId === patient.tenantId && facility.active !== false)
      facilityAccess[facilityId] = patientAccess;
  } else if (builtIn && !global) {
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
  if (!name) throw new ApiError(401, 'Sign in to continue.');
  const grants = Object.values(facilityAccess);
  return {
    ...identity,
    name,
    ...(patientId ? { patientId } : {}),
    facilityAccess,
    facilityIds: Object.keys(facilityAccess),
    workspaces: global?.workspaces ?? [...new Set(grants.flatMap((grant) => grant.workspaces))],
    writes: global?.writes ?? [...new Set(grants.flatMap((grant) => grant.writes))],
  };
}

export function patientSubject(session: Session) {
  const patientId = session.patientId;
  if (!patientId) throw new ApiError(403, 'Patient access is unavailable.');
  return patientId;
}

export async function startSession(body: unknown): Promise<Session> {
  const invalid = () => new ApiError(401, 'The account ID or password was not recognised.');
  if (!body || typeof body !== 'object' || !('account' in body) || !('password' in body))
    throw invalid();
  const { account, password } = body;
  if (
    typeof account !== 'string' ||
    !accountPattern.test(account) ||
    typeof password !== 'string' ||
    !password ||
    password.length > 128
  )
    throw invalid();
  if (Object.hasOwn(accountNames, account)) {
    if (password !== 'TrueCare-Local-2026') throw invalid();
  } else {
    const enrolled = await db.patientAccounts.get(account);
    if (!enrolled || (await passwordVerifier(password, enrolled.salt)) !== enrolled.verifier)
      throw invalid();
  }
  return issueSession(account);
}

export async function issueSession(account: string) {
  const session = await project({
    account,
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
