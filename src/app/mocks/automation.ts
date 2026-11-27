import {
  dailyDraftLimits,
  documentationFormats,
  type AutomationData,
  type DocumentationDraft,
  type DocumentationFormat,
  type DocumentationPolicy,
  type DocumentationSource,
} from '../domain/intelligence';
import {
  dayInIndia,
  observations,
  type Appointment,
  type DomainEvent,
  type Encounter,
  type Facility,
  type Practitioner,
  type Session,
} from '../domain/operations';
import { ApiError } from './access';
import { assignedEncounter } from './continuity';
import { db } from './database';

const defaultPolicy: DocumentationPolicy = { enabled: false, dailyLimit: 5, version: 0 };

async function policyAt(facility: Facility): Promise<DocumentationPolicy> {
  const policy = await db.automationPolicies.get(facility.id);
  if (!policy) return defaultPolicy;
  const { enabled, dailyLimit, version } = policy;
  return { enabled, dailyLimit, version };
}

function documentationSource(
  encounter: Encounter,
  visit: Appointment | undefined,
  practitioner: Practitioner | undefined,
  now: number,
): DocumentationSource | undefined {
  if (
    encounter.signedAt === undefined ||
    encounter.signedAt > now ||
    visit?.status !== 'Completed' ||
    visit.id !== encounter.appointmentId ||
    visit.facilityId !== encounter.facilityId ||
    visit.patientId !== encounter.patientId ||
    visit.practitionerId !== encounter.practitionerId ||
    practitioner?.id !== encounter.practitionerId ||
    practitioner.facilityId !== encounter.facilityId ||
    !encounter.observation ||
    !observations.includes(encounter.observation)
  )
    return undefined;
  return {
    encounterId: encounter.id,
    day: visit.day,
    time: visit.time,
    specialty: practitioner.specialty,
    observation: encounter.observation,
  };
}

async function ownedSource(facility: Facility, session: Session, id: string, now: number) {
  const { encounter, visit } = await assignedEncounter(facility, session, id);
  const source = documentationSource(
    encounter,
    visit,
    await db.practitioners.get(encounter.practitionerId),
    now,
  );
  if (!source) throw new ApiError(409, 'The current source must be a signed, completed visit.');
  return source;
}

function templateText(source: DocumentationSource, format: DocumentationFormat) {
  return format === 'Administrative handoff'
    ? `${source.specialty} visit completed on ${source.day} at ${source.time} IST. Refer to the signed encounter for the recorded visit details.`
    : `The ${source.specialty} visit on ${source.day} at ${source.time} IST has a signed encounter. The visit record is ready for documentation review.`;
}

export async function automationData(
  facility: Facility,
  session: Session,
): Promise<AutomationData> {
  const today = dayInIndia();
  const [policy, records] = await Promise.all([
    policyAt(facility),
    db.documentationDrafts.where('facilityId').equals(facility.id).toArray(),
  ]);
  const usage = {
    today: records.filter((row) => row.day === today).length,
    pending: records.filter((row) => row.status === 'Pending review').length,
    approved: records.filter((row) => row.status === 'Approved').length,
    rejected: records.filter((row) => row.status === 'Rejected').length,
  };
  const access = session.facilityAccess[facility.id];
  if (access.writes.includes('automation/policy')) {
    const activity = [...records]
      .sort((a, b) => b.changedAt - a.changedAt)
      .slice(0, 30)
      .map(({ id, status, createdAt, changedAt }) => ({ id, status, createdAt, changedAt }));
    return { policy, usage, sources: [], drafts: [], activity };
  }
  const clinician = access.practitionerId;
  if (!clinician || !access.writes.includes('automation'))
    return { policy, usage, sources: [], drafts: [], activity: [] };
  const owned = records
    .filter((row) => row.author === session.account)
    .sort((a, b) => b.changedAt - a.changedAt);
  const now = Date.now();
  const recent = (
    await db.encounters
      .where('facilityId')
      .equals(facility.id)
      .filter(
        (row) =>
          row.practitionerId === clinician && row.signedAt !== undefined && row.signedAt <= now,
      )
      .toArray()
  )
    .sort((a, b) => b.signedAt! - a.signedAt! || a.id.localeCompare(b.id))
    .slice(0, 30);
  const ids = [
    ...new Set([...recent.map((row) => row.id), ...owned.map((row) => row.encounterId)]),
  ];
  const [practitioner, encounters] = await Promise.all([
    db.practitioners.get(clinician),
    db.encounters.bulkGet(ids),
  ]);
  const valid = encounters.filter(
    (row): row is Encounter => row?.facilityId === facility.id && row.practitionerId === clinician,
  );
  const [visits, patients] = await Promise.all([
    db.appointments.bulkGet(valid.map((row) => row.appointmentId)),
    db.patients.bulkGet(valid.map((row) => row.patientId)),
  ]);
  const sources = new Map(
    valid.flatMap((row, index) => {
      const source = documentationSource(row, visits[index], practitioner, now);
      return source && patients[index]?.tenantId === facility.tenantId
        ? [[row.id, source] as const]
        : [];
    }),
  );
  const active = new Set(
    owned.filter((row) => row.status !== 'Rejected').map((row) => row.encounterId),
  );
  return {
    policy,
    usage,
    activity: [],
    sources: recent.flatMap((row) => {
      const source = sources.get(row.id);
      return source && !active.has(row.id) ? [source] : [];
    }),
    drafts: owned.flatMap((row) => {
      const source = sources.get(row.encounterId);
      return source ? [{ ...row, source }] : [];
    }),
  };
}

export async function automationCommand(
  facility: Facility,
  session: Session,
  body: Record<string, unknown>,
  action: 'policy' | 'request' | 'review',
): Promise<DomainEvent> {
  const now = Date.now();
  const day = dayInIndia(now);
  const event = (type: DomainEvent['type'], entityId: string) => ({
    type,
    entityId,
    facilityId: facility.id,
    occurredAt: now,
    actor: session.account,
  });
  if (action === 'policy') {
    if (!session.facilityAccess[facility.id].writes.includes('automation/policy'))
      throw new ApiError(403, 'Only the automation supervisor can change policy.');
    const current = await policyAt(facility);
    if (body['version'] !== String(current.version))
      throw new ApiError(409, 'The automation policy changed.');
    const enabled = body['enabled'];
    const limit = dailyDraftLimits.find((item) => String(item) === body['dailyLimit']);
    if ((enabled !== 'true' && enabled !== 'false') || limit === undefined)
      throw new ApiError(422, 'Choose a valid policy state and daily draft limit.');
    await db.automationPolicies.put({
      facilityId: facility.id,
      version: current.version + 1,
      enabled: enabled === 'true',
      dailyLimit: limit,
    });
    return event('AutomationPolicyUpdated', facility.id);
  }
  if (action === 'request') {
    const policy = await policyAt(facility);
    if (!policy.enabled) throw new ApiError(403, 'Draft requests are paused by facility policy.');
    if (typeof body['encounterId'] !== 'string' || !body['encounterId'])
      throw new ApiError(422, 'Choose a signed encounter.');
    const source = await ownedSource(facility, session, body['encounterId'], now);
    if (
      await db.documentationDrafts
        .where('[facilityId+encounterId]')
        .equals([facility.id, source.encounterId])
        .filter((row) => row.author === session.account && row.status !== 'Rejected')
        .first()
    )
      throw new ApiError(409, 'This encounter already has a current draft.');
    const used = await db.documentationDrafts
      .where('[facilityId+day]')
      .equals([facility.id, day])
      .count();
    if (used >= policy.dailyLimit)
      throw new ApiError(409, 'The facility has reached its daily draft limit.');
    const id = crypto.randomUUID();
    const format = documentationFormats[0];
    await db.documentationDrafts.add({
      id,
      facilityId: facility.id,
      encounterId: source.encounterId,
      author: session.account,
      day,
      version: 1,
      status: 'Pending review',
      format,
      text: templateText(source, format),
      createdAt: now,
      changedAt: now,
    });
    return event('DocumentationDraftRequested', id);
  }
  const draft =
    typeof body['draftId'] === 'string'
      ? await db.documentationDrafts.get(body['draftId'])
      : undefined;
  if (draft?.facilityId !== facility.id || draft.author !== session.account)
    throw new ApiError(404, 'Draft unavailable at this facility.');
  if (draft.status !== 'Pending review' || body['version'] !== String(draft.version))
    throw new ApiError(409, 'This draft is no longer the current pending version.');
  const source = await ownedSource(facility, session, draft.encounterId, now);
  const next: Partial<DocumentationDraft> = { version: draft.version + 1, changedAt: now };
  if (body['action'] === 'edit') {
    const format = documentationFormats.find((item) => item === body['format']);
    if (!format) throw new ApiError(422, 'Choose a draft format.');
    next.format = format;
    next.text = templateText(source, format);
  } else if (body['action'] === 'approve') {
    next.status = 'Approved';
  } else if (body['action'] === 'reject') {
    next.status = 'Rejected';
  } else throw new ApiError(422, 'Choose a draft review action.');
  await db.documentationDrafts.update(draft.id, next);
  return event('DocumentationDraftUpdated', draft.id);
}
