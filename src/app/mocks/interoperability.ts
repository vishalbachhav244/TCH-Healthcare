import {
  connectorStandards,
  consentHours,
  exchangeRecordKinds,
  requestPurposes,
  type AuditSummary,
  type ConsentGrant,
  type Connector,
  type ConnectorSummary,
  type EffectiveStatus,
  type ExchangeOutcome,
  type IntegrationDashboard,
  type PatientSharing,
  type RecordRequest,
  type RecordReference,
  type RequestSummary,
  type SharedRecord,
} from '../domain/interoperability';
import type { DomainEvent, Facility, Session } from '../domain/operations';
import type { LabOrder } from '../domain/diagnostics';
import { ApiError, patientSubject, requireSession, scope } from './access';
import { integrationAccount, recordRecipients } from './accounts';
import { db } from './database';
import { describeDocument, documentDetail, findAvailableDocument } from './patient-documents';
import { findReleasedImaging, releasedImaging } from './radiology';
import { findReleasedDischarge, patientDischargeSummaries } from './discharge';

function requireIntegration(session: Session) {
  if (session.account !== integrationAccount)
    throw new ApiError(403, 'Integration configuration access is required.');
}

function requireRecipient(session: Session) {
  if (!recordRecipients.some((recipient) => recipient.account === session.account))
    throw new ApiError(403, 'Recipient access is required.');
}

function connectorSummary(connector: Connector): ConnectorSummary {
  return {
    id: connector.id,
    name: connector.name,
    recipient:
      recordRecipients.find((entry) => entry.account === connector.recipientAccount)?.name ??
      'Unknown recipient',
  };
}

function requestStatus(
  request: RecordRequest,
  connector: Connector,
  facility: Facility,
  grant: ConsentGrant | undefined,
  now: number,
): EffectiveStatus {
  if (request.status === 'Granted') {
    if (!grant) return 'Unavailable';
    if (grant.revoked) return 'Revoked';
    if (grant.expiresAt <= now) return 'Expired';
  }
  if (
    (request.status === 'Granted' || request.status === 'Pending') &&
    (connector.status !== 'Enabled' || facility.active === false)
  )
    return 'Unavailable';
  return request.status;
}

async function summarize(
  request: RecordRequest,
  connector: Connector,
  facility: Facility,
  grant: ConsentGrant | undefined,
  now: number,
  includeSelection = false,
): Promise<RequestSummary> {
  let status = requestStatus(request, connector, facility, grant, now);
  if (status === 'Granted' && grant) {
    const record = await releasedSource(
      facility,
      request.patientId,
      grant.record.kind,
      grant.record.id,
    );
    if (!record || record.version !== grant.record.version) status = 'Unavailable';
  }
  return {
    id: request.id,
    connector: connectorSummary(connector),
    source: facility.name,
    purpose: request.purpose,
    status,
    createdAt: request.createdAt,
    version: request.version,
    expiresAt: grant?.expiresAt,
    ...(grant ? { recordKind: grant.record.kind } : {}),
    ...(includeSelection ? { reportId: grant?.record.id, decision: request.status } : {}),
  };
}

async function grantsByRequest(requests: RecordRequest[]) {
  const grants = await db.consentGrants.bulkGet(requests.map((request) => request.id));
  return new Map(grants.flatMap((grant) => (grant ? [[grant.requestId, grant] as const] : [])));
}

async function exchangeHistory(
  connectors: Connector[],
  facilities: Facility[],
  requestIds?: string[],
): Promise<AuditSummary[]> {
  const connectorMap = new Map(connectors.map((row) => [row.id, row]));
  const locations = new Map(facilities.map((row) => [row.id, row.name]));
  const entries = requestIds
    ? (await db.exchangeAudit.where('requestId').anyOf(requestIds).toArray())
        .sort((a, b) => b.occurredAt - a.occurredAt)
        .slice(0, 50)
    : await db.exchangeAudit.orderBy('occurredAt').reverse().limit(50).toArray();
  return entries.flatMap(({ id, facilityId, connectorId, outcome, occurredAt }) => {
    const connector = connectorMap.get(connectorId);
    const source = locations.get(facilityId);
    return connector && source
      ? [{ id, connector: connector.name, source, outcome, occurredAt }]
      : [];
  });
}

export async function integrationDashboard(session: Session): Promise<IntegrationDashboard> {
  requireIntegration(session);
  const [connectors, facilities] = await Promise.all([
    db.connectors.toArray(),
    db.facilities.toArray(),
  ]);
  const locations = new Map(facilities.map((facility) => [facility.id, facility.name]));
  return {
    connectors: connectors.map((connector) => ({
      ...connector,
      source: locations.get(connector.facilityId) ?? 'Unavailable facility',
      recipient: connectorSummary(connector).recipient,
    })),
    facilities: facilities
      .filter((facility) => facility.active !== false)
      .map(({ id, name }) => ({ id, name })),
    recipients: recordRecipients.map((entry) => ({ ...entry })),
    audit: await exchangeHistory(connectors, facilities),
  };
}

export async function patientSharing(
  facility: Facility,
  session: Session,
): Promise<PatientSharing> {
  const patientId = patientSubject(session);
  if ((await db.patients.get(patientId))?.tenantId !== facility.tenantId)
    throw new ApiError(404, 'Patient profile unavailable.');
  const [connectors, requests, reports, documentRows, imagingReports, summaries] =
    await Promise.all([
      db.connectors.where('facilityId').equals(facility.id).toArray(),
      db.recordRequests
        .where('patientId')
        .equals(patientId)
        .filter((row) => row.facilityId === facility.id)
        .toArray(),
      db.labOrders
        .where('patientId')
        .equals(patientId)
        .filter(
          (row) =>
            row.facilityId === facility.id &&
            row.status === 'Published' &&
            !!row.accession &&
            !!row.authorisedBy,
        )
        .toArray(),
      db.patientDocuments
        .where('[facilityId+patientId]')
        .equals([facility.id, patientId])
        .filter((row) => row.status === 'Available')
        .toArray(),
      releasedImaging(facility, patientId),
      patientDischargeSummaries(facility, patientId),
    ]);
  const [labReleases, documents] = await Promise.all([
    Promise.all(reports.map((report) => labProvenance(facility, patientId, report))),
    Promise.all(documentRows.map(({ id }) => findAvailableDocument(facility, patientId, id))),
  ]);
  const grants = await grantsByRequest(requests);
  const now = Date.now();
  const map = new Map(connectors.map((connector) => [connector.id, connector]));
  return {
    connectors: connectors.filter((row) => row.status === 'Enabled').map(connectorSummary),
    requests: await Promise.all(
      requests
        .sort((a, b) => b.createdAt - a.createdAt)
        .flatMap((request) => {
          const connector = map.get(request.connectorId);
          return connector
            ? [summarize(request, connector, facility, grants.get(request.id), now, true)]
            : [];
        }),
    ),
    audit: await exchangeHistory(
      connectors,
      [facility],
      requests.map((request) => request.id),
    ),
    reports: labReleases
      .filter((release) => release !== undefined)
      .sort((a, b) => b.report.changedAt - a.report.changedAt)
      .map(({ report: { id, version, test, changedAt }, accession }) => ({
        id,
        version,
        test,
        accession,
        publishedAt: changedAt,
      })),
    documents: documents
      .filter((row) => row !== undefined)
      .sort((a, b) => b.addedAt - a.addedAt)
      .map((row) => {
        const { id, version, title, format, origin } = describeDocument(row);
        return { id, version, title, format, origin };
      }),
    imagingReports: imagingReports.map(({ id, version, study, publishedAt }) => ({
      id,
      version,
      study,
      publishedAt,
    })),
    dischargeSummaries: summaries.map(({ admissionId, version, releasedAt }) => ({
      admissionId,
      version,
      releasedAt,
    })),
  };
}

export async function recipientRequests(session: Session): Promise<RequestSummary[]> {
  requireRecipient(session);
  const connectors = await db.connectors
    .where('recipientAccount')
    .equals(session.account)
    .toArray();
  const [requests, facilities] = await Promise.all([
    db.recordRequests
      .where('connectorId')
      .anyOf(connectors.map((row) => row.id))
      .toArray(),
    db.facilities.bulkGet(connectors.map((row) => row.facilityId)),
  ]);
  const pairs = new Map(
    connectors.map((row, i) => [row.id, { connector: row, facility: facilities[i] }]),
  );
  const grants = await grantsByRequest(requests);
  const now = Date.now();
  return Promise.all(
    requests
      .sort((a, b) => b.createdAt - a.createdAt)
      .flatMap((request) => {
        const pair = pairs.get(request.connectorId);
        return pair?.facility && pair.facility.id === request.facilityId
          ? [summarize(request, pair.connector, pair.facility, grants.get(request.id), now)]
          : [];
      }),
  );
}

function fields(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new ApiError(422, 'Invalid request.');
  return body as Record<string, unknown>;
}

function key(value: unknown) {
  return typeof value === 'string' && value.length < 160 ? value : '';
}

async function emit(
  session: Session,
  type: DomainEvent['type'],
  facilityId: string,
  entityId: string,
  now: number,
) {
  const event: DomainEvent = {
    type,
    facilityId,
    entityId,
    occurredAt: now,
    actor: session.account,
  };
  await db.events.add({ ...event, id: crypto.randomUUID() });
  return { id: entityId, event };
}

async function configure(
  method: string,
  session: Session,
  input: Record<string, unknown>,
  now: number,
) {
  requireIntegration(session);
  if (method === 'POST') {
    const facility = await db.facilities.get(key(input['facilityId']));
    const name = key(input['name']).trim();
    const standard = connectorStandards.find((value) => value === input['standard']);
    const recipient = recordRecipients.find((entry) => entry.account === input['recipientAccount']);
    if (
      !facility ||
      facility.active === false ||
      !recipient ||
      !standard ||
      name.length < 3 ||
      name.length > 70
    ) {
      throw new ApiError(
        422,
        'Choose an active facility, a recipient and a standard, then name the connector.',
      );
    }
    if (
      await db.connectors
        .where('facilityId')
        .equals(facility.id)
        .filter((row) => row.name.toLowerCase() === name.toLowerCase())
        .first()
    ) {
      throw new ApiError(409, 'A connector with this name already exists at the facility.');
    }
    const id = crypto.randomUUID();
    await db.connectors.add({
      id,
      facilityId: facility.id,
      name,
      standard,
      recipientAccount: recipient.account,
      status: 'Draft',
      version: 1,
    });
    return emit(session, 'ConnectorConfigured', facility.id, id, now);
  }
  const connector = await db.connectors.get(key(input['connectorId']));
  if (!connector) throw new ApiError(404, 'Connector not found.');
  if (String(connector.version) !== input['version'])
    throw new ApiError(409, 'This connector changed. Reload and try again.');
  const action = input['action'];
  let status: Connector['status'];
  if (action === 'validate' && connector.status === 'Draft') status = 'Validated';
  else if (action === 'enable' && ['Validated', 'Paused'].includes(connector.status))
    status = 'Enabled';
  else if (action === 'pause' && connector.status === 'Enabled') status = 'Paused';
  else throw new ApiError(409, 'This action is unavailable for the current connector status.');
  const facility = await db.facilities.get(connector.facilityId);
  if (status !== 'Paused' && (!facility || facility.active === false))
    throw new ApiError(409, 'The source facility is inactive.');
  await db.connectors.update(connector.id, { status, version: connector.version + 1 });
  return emit(session, 'ConnectorConfigured', connector.facilityId, connector.id, now);
}

async function issueCode(
  session: Session,
  facility: Facility,
  input: Record<string, unknown>,
  now: number,
) {
  const patientId = patientSubject(session);
  const connector = await db.connectors.get(key(input['connectorId']));
  if (connector?.facilityId !== facility.id || connector.status !== 'Enabled')
    throw new ApiError(404, 'This recipient is unavailable.');
  // A new matching code supersedes older unredeemed codes for this patient and recipient.
  await db.matchingCodes
    .where('[patientId+connectorId]')
    .equals([patientId, connector.id])
    .filter((row) => !row.usedAt)
    .delete();
  const code = crypto.randomUUID();
  const expiresAt = now + 15 * 60_000;
  await db.matchingCodes.add({
    code,
    patientId,
    facilityId: facility.id,
    connectorId: connector.id,
    expiresAt,
  });
  const { event } = await emit(session, 'MatchingCodeIssued', facility.id, connector.id, now);
  return { id: connector.id, code, expiresAt, event };
}

async function requestRecord(session: Session, input: Record<string, unknown>, now: number) {
  requireRecipient(session);
  const code = await db.matchingCodes.get(key(input['code']).trim().toLowerCase());
  const connector = code ? await db.connectors.get(code.connectorId) : undefined;
  const facility = code ? await db.facilities.get(code.facilityId) : undefined;
  if (
    !code ||
    !facility ||
    facility.active === false ||
    connector?.recipientAccount !== session.account ||
    connector.facilityId !== facility.id ||
    connector.status !== 'Enabled' ||
    code.usedAt !== undefined ||
    code.expiresAt <= now
  ) {
    throw new ApiError(404, 'This matching code is unavailable. Ask the patient for a new code.');
  }
  const purpose = requestPurposes.find((value) => value === input['purpose']);
  if (!purpose) throw new ApiError(422, 'Select the purpose for this request.');
  const id = crypto.randomUUID();
  await db.recordRequests.add({
    id,
    facilityId: facility.id,
    patientId: code.patientId,
    connectorId: connector.id,
    purpose,
    status: 'Pending',
    version: 1,
    createdAt: now,
  });
  await db.matchingCodes.update(code.code, { usedAt: now });
  return emit(session, 'RecordRequested', facility.id, id, now);
}

async function labProvenance(facility: Facility, patientId: string, report: LabOrder | undefined) {
  if (
    report?.status !== 'Published' ||
    !report.finding ||
    !report.accession ||
    !report.authorisedBy ||
    report.facilityId !== facility.id ||
    report.patientId !== patientId
  )
    return undefined;
  const encounter = await db.encounters.get(report.encounterId);
  if (encounter?.facilityId !== facility.id || encounter.patientId !== patientId) return undefined;
  return { report, finding: report.finding, accession: report.accession };
}

type SharedPreview<T = SharedRecord> = T extends SharedRecord ? Omit<T, 'expiresAt'> : never;

async function releasedSource(
  facility: Facility,
  patientId: string,
  kind: RecordReference['kind'],
  id: string,
): Promise<{ version: number; preview: SharedPreview } | undefined> {
  if ((await db.patients.get(patientId))?.tenantId !== facility.tenantId) return undefined;
  const source = facility.name;
  switch (kind) {
    case 'Laboratory report': {
      const release = await labProvenance(facility, patientId, await db.labOrders.get(id));
      if (!release) return undefined;
      const { report, finding, accession } = release;
      return {
        version: report.version,
        preview: { test: report.test, finding, accession, source, publishedAt: report.changedAt },
      };
    }
    case 'Imaging report': {
      const release = await findReleasedImaging(facility, patientId, id);
      if (!release) return undefined;
      const { version, study, note, publishedAt, reviewer } = release;
      return { version, preview: { kind, study, note, publishedAt, reviewer, source } };
    }
    case 'Discharge summary': {
      const release = await findReleasedDischarge(facility, patientId, id);
      if (!release) return undefined;
      const {
        version,
        facilityName,
        admittedAt,
        releasedAt,
        signedAt,
        signedBy,
        destination,
        course,
        followUp,
      } = release;
      return {
        version,
        preview: {
          kind,
          source: facilityName,
          admittedAt,
          releasedAt,
          signedAt,
          signedBy,
          destination,
          course,
          followUp,
        },
      };
    }
    case 'Patient document': {
      const release = await findAvailableDocument(facility, patientId, id);
      if (!release) return undefined;
      const { title, format, origin, body, addedAt } = documentDetail(release, facility);
      return {
        version: release.version,
        preview: { kind, title, format, origin, body, addedAt, source },
      };
    }
  }
}

async function decide(
  session: Session,
  facility: Facility,
  input: Record<string, unknown>,
  now: number,
) {
  const request = await db.recordRequests.get(key(input['requestId']));
  if (request?.facilityId !== facility.id || request.patientId !== patientSubject(session))
    throw new ApiError(404, 'Request not found.');
  if (String(request.version) !== input['version'])
    throw new ApiError(409, 'This request changed. Reload and try again.');
  const version = request.version + 1;
  if (input['action'] === 'grant' && request.status === 'Pending') {
    const connector = await db.connectors.get(request.connectorId);
    if (connector?.status !== 'Enabled' || connector.facilityId !== facility.id)
      throw new ApiError(409, 'This connector is unavailable.');
    const kind = exchangeRecordKinds.find(
      (option) => option === (input['recordKind'] ?? 'Laboratory report'),
    );
    const duration = consentHours.find((value) => String(value) === input['hours']);
    const id = key(input['reportId']);
    const source = kind && (await releasedSource(facility, request.patientId, kind, id));
    if (!kind || !source || !duration)
      throw new ApiError(422, 'Choose an available record and a consent duration.');
    const selectedVersion = input['recordVersion'];
    if (
      (kind === 'Imaging report' || kind === 'Discharge summary') &&
      selectedVersion === undefined
    )
      throw new ApiError(422, 'Select the current released record version.');
    if (selectedVersion !== undefined && selectedVersion !== String(source.version))
      throw new ApiError(
        409,
        'The selected record changed. Select it again before granting access.',
      );
    await db.consentGrants.add({
      requestId: request.id,
      record: { kind, id, version: source.version },
      expiresAt: now + duration * 3_600_000,
      revoked: false,
    });
    await db.recordRequests.update(request.id, { status: 'Granted', version });
  } else if (input['action'] === 'decline' && request.status === 'Pending') {
    await db.recordRequests.update(request.id, { status: 'Declined', version });
  } else if (input['action'] === 'revoke' && request.status === 'Granted') {
    await db.consentGrants.update(request.id, { revoked: true });
    await db.recordRequests.update(request.id, { status: 'Revoked', version });
  } else {
    throw new ApiError(409, 'This consent action is unavailable.');
  }
  return emit(session, 'ConsentChanged', facility.id, request.id, now);
}

async function retrieve(session: Session, input: Record<string, unknown>, now: number) {
  requireRecipient(session);
  const request = await db.recordRequests.get(key(input['requestId']));
  const connector = request ? await db.connectors.get(request.connectorId) : undefined;
  if (
    !request ||
    connector?.recipientAccount !== session.account ||
    connector.facilityId !== request.facilityId
  )
    throw new ApiError(404, 'Request not found.');
  const [facility, grant] = await Promise.all([
    db.facilities.get(request.facilityId),
    db.consentGrants.get(request.id),
  ]);
  let outcome: ExchangeOutcome;
  let report: SharedRecord | undefined;
  if (request.status === 'Revoked' || grant?.revoked) outcome = 'Revoked';
  else if (request.status !== 'Granted' || !grant) outcome = 'Consent required';
  else if (grant.expiresAt <= now) outcome = 'Expired';
  else if (!facility || facility.active === false || connector.status !== 'Enabled')
    outcome = 'Connector unavailable';
  else {
    const source = await releasedSource(
      facility,
      request.patientId,
      grant.record.kind,
      grant.record.id,
    );
    if (source && source.version === grant.record.version) {
      outcome = 'Released';
      report = { ...source.preview, expiresAt: grant.expiresAt };
    } else outcome = 'Source mismatch';
  }
  await db.exchangeAudit.add({
    id: crypto.randomUUID(),
    requestId: request.id,
    facilityId: request.facilityId,
    connectorId: connector.id,
    outcome,
    occurredAt: now,
  });
  const result = await emit(session, 'RecordAccessed', request.facilityId, request.id, now);
  // A denial travels out of the transaction as a value so its audit entry can commit.
  return { ...result, report, denied: !report ? outcome : undefined };
}

export async function exchangeCommand(
  path: string,
  method: string,
  token: string,
  facilityId: string | null,
  body: unknown,
) {
  const input = fields(body);
  return db.transaction(
    'rw',
    [
      db.sessions,
      db.patientAccounts,
      db.memberships,
      db.facilities,
      db.connectors,
      db.matchingCodes,
      db.recordRequests,
      db.consentGrants,
      db.exchangeAudit,
      db.labOrders,
      db.encounters,
      db.patientDocuments,
      db.imagingOrders,
      db.dischargePlans,
      db.admissions,
      db.patients,
      db.events,
    ],
    async () => {
      const session = await requireSession(token);
      const now = Date.now();
      if (path === 'integrations/connectors') return configure(method, session, input, now);
      if (path === 'record-requests') return requestRecord(session, input, now);
      if (path === 'record-requests/retrieve') return retrieve(session, input, now);
      const facility = scope(
        session,
        facilityId ? await db.facilities.get(facilityId) : undefined,
        'D12',
        'portal',
      );
      if (path === 'portal/matching-code') return issueCode(session, facility, input, now);
      return decide(session, facility, input, now);
    },
  );
}
