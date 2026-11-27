import { patientInvitationPattern, registrationAccountPattern } from '../domain/registration';
import type { DomainEvent } from '../domain/operations';
import { ApiError, issueSession } from './access';
import { accountNames } from './accounts';
import { passwordVerifier } from './credentials';
import { db } from './database';
import { createPatient } from './seed';

export async function registerPatient(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new ApiError(422, 'Enter the required registration details.');
  const { account, password, facilityId, invitation } = body as Record<string, unknown>;
  if (typeof account !== 'string' || !registrationAccountPattern.test(account))
    throw new ApiError(422, 'Use 3 to 24 lowercase letters and numbers, starting with a letter.');
  if (
    typeof password !== 'string' ||
    password.length < 10 ||
    password.length > 128 ||
    !password.trim()
  )
    throw new ApiError(422, 'Choose a demo password with 10 to 128 characters.');
  if (
    typeof invitation !== 'string' ||
    !patientInvitationPattern.test(invitation.trim()) ||
    typeof facilityId !== 'string' ||
    !/^[a-z0-9-]{1,80}$/i.test(facilityId)
  )
    throw new ApiError(422, 'Choose a facility and enter a valid invitation code.');
  const code = invitation.trim().toUpperCase();
  const salt = [...crypto.getRandomValues(new Uint8Array(16))];
  const verifier = await passwordVerifier(password, salt);
  return db.transaction(
    'rw',
    [db.patientInvitations, db.patientAccounts, db.patients, db.facilities, db.sessions, db.events],
    async () => {
      const [invite, facility] = await Promise.all([
        db.patientInvitations.get(code),
        db.facilities.get(facilityId),
      ]);
      if (
        !invite ||
        !facility?.publicDiscovery ||
        facility.active === false ||
        invite.facilityId !== facilityId ||
        invite.tenantId !== facility.tenantId
      )
        throw new ApiError(404, 'This invitation is unavailable for the selected facility.');
      if (invite.claimedAt !== undefined)
        throw new ApiError(
          409,
          'This invitation has already been used. Sign in with the account you created.',
        );
      if (Object.hasOwn(accountNames, account) || (await db.patientAccounts.get(account)))
        throw new ApiError(409, 'This account ID is already in use. Choose another.');
      const patient = createPatient(invite.tenantId, invite.patientIndex);
      if (await db.patients.get(patient.id))
        throw new ApiError(409, 'This invitation cannot create another patient profile.');
      await db.patients.add(patient);
      await db.patientAccounts.add({
        account,
        patientId: patient.id,
        facilityId,
        tenantId: invite.tenantId,
        salt,
        verifier,
      });
      const occurredAt = Date.now();
      await db.patientInvitations.update(code, { claimedAt: occurredAt });
      const event: DomainEvent = {
        type: 'PatientRegistered',
        facilityId,
        entityId: patient.id,
        actor: 'self-registration',
        occurredAt,
      };
      await db.events.add({ ...event, id: crypto.randomUUID() });
      return { session: await issueSession(account), event };
    },
  );
}
