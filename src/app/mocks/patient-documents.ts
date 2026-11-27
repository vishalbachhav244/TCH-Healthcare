import type {
  DocumentDetail,
  DocumentFixture,
  DocumentSummary,
  PatientDocument,
  PatientDocuments,
} from '../domain/patient-documents';
import type { DomainEvent, Facility, Session } from '../domain/operations';
import { ApiError, patientSubject } from './access';
import { patientAt } from './admission-records';
import { assignedEncounter } from './continuity';
import { db } from './database';
import { documentFixtures, textDocument } from './document-fixtures';

export function describeDocument(record: PatientDocument): DocumentSummary {
  const fields =
    record.origin === 'Patient upload'
      ? {
          title: documentFixtures[record.fixture].sample.title,
          format: documentFixtures[record.fixture].sample.format,
        }
      : { title: 'Visit attendance note', format: 'TXT' as const, clinician: record.clinician };
  return {
    id: record.id,
    origin: record.origin,
    status: record.status,
    addedAt: record.addedAt,
    version: record.version,
    ...fields,
  };
}

export async function findAvailableDocument(facility: Facility, patientId: string, id: string) {
  const record = await db.patientDocuments.get(id);
  if (
    record?.facilityId !== facility.id ||
    record.patientId !== patientId ||
    record.status !== 'Available' ||
    (await db.patients.get(patientId))?.tenantId !== facility.tenantId
  )
    return undefined;
  if (record.origin === 'Facility release') {
    const encounter = await db.encounters.get(record.encounterId);
    if (
      encounter?.facilityId !== facility.id ||
      encounter.patientId !== patientId ||
      !encounter.signedAt
    )
      return undefined;
  }
  return record;
}

export function documentDetail(record: PatientDocument, facility: Facility): DocumentDetail {
  const summary = describeDocument(record);
  if (record.origin === 'Patient upload') {
    const fixture = documentFixtures[record.fixture];
    const { filename, format, data } = fixture.sample;
    return {
      ...summary,
      source: facility.name,
      body: [...fixture.body],
      file: { filename, format, data },
    };
  }
  const body = [
    `Visit completed on ${record.day} at ${record.time} IST.`,
    `${record.specialty} consultation recorded by ${record.clinician}.`,
    'Generated for the TrueCare evaluation workspace.',
  ];
  return {
    ...summary,
    source: facility.name,
    body,
    file: textDocument(summary.title, 'truecare-visit-attendance.txt', body),
  };
}

export async function portalDocuments(
  facility: Facility,
  session: Session,
): Promise<PatientDocuments> {
  const patientId = patientSubject(session);
  await patientAt(facility, patientId);
  const rows = await db.patientDocuments
    .where('[facilityId+patientId]')
    .equals([facility.id, patientId])
    .toArray();
  return {
    documents: rows.sort((a, b) => b.addedAt - a.addedAt).map(describeDocument),
    samples: Object.values(documentFixtures).map(({ sample }) => sample),
  };
}

export async function portalDocument(
  facility: Facility,
  session: Session,
  id: string,
  version: string | null,
) {
  const record = await findAvailableDocument(facility, patientSubject(session), id);
  if (!record || version !== String(record.version))
    throw new ApiError(404, 'This document is unavailable.');
  return documentDetail(record, facility);
}

export async function clinicalDocuments(facility: Facility, session: Session, encounterId: string) {
  await assignedEncounter(facility, session, encounterId);
  const rows = await db.patientDocuments
    .where('[facilityId+encounterId]')
    .equals([facility.id, encounterId])
    .toArray();
  return rows.sort((a, b) => b.addedAt - a.addedAt).map(describeDocument);
}

export async function documentCommand(
  path: string,
  facility: Facility,
  session: Session,
  body: Record<string, unknown>,
): Promise<DomainEvent> {
  const time = Date.now();
  const event = (type: DomainEvent['type'], entityId: string) => ({
    type,
    entityId,
    facilityId: facility.id,
    occurredAt: time,
    actor: session.account,
  });
  if (path === 'portal/documents') {
    const patientId = patientSubject(session);
    await patientAt(facility, patientId);
    const fixture = (Object.keys(documentFixtures) as DocumentFixture[]).find(
      (key) =>
        documentFixtures[key].sample.data === body['data'] &&
        documentFixtures[key].sample.format === body['format'],
    );
    if (!fixture) throw new ApiError(422, 'Choose one of the TrueCare sample files.');
    if (
      await db.patientDocuments
        .where('[facilityId+patientId]')
        .equals([facility.id, patientId])
        .filter(
          (row) =>
            row.status === 'Available' &&
            row.origin === 'Patient upload' &&
            row.fixture === fixture,
        )
        .first()
    )
      throw new ApiError(409, 'This sample is already in your documents.');
    const id = crypto.randomUUID();
    const uploaded: PatientDocument = {
      id,
      facilityId: facility.id,
      patientId,
      origin: 'Patient upload',
      fixture,
      addedAt: time,
      changedAt: time,
      status: 'Available',
      version: 1,
    };
    await db.patientDocuments.add(uploaded);
    return event('PatientDocumentUploaded', id);
  }
  if (path === 'clinical/documents') {
    const id = typeof body['encounterId'] === 'string' ? body['encounterId'] : '';
    const { encounter, visit } = await assignedEncounter(facility, session, id);
    if (!encounter.signedAt || encounter.signedAt > time || visit.status !== 'Completed')
      throw new ApiError(409, 'Complete and sign the visit before releasing its attendance note.');
    const clinician = await db.practitioners.get(encounter.practitionerId);
    if (clinician?.facilityId !== facility.id)
      throw new ApiError(404, 'The visit clinician is unavailable.');
    if (
      await db.patientDocuments
        .where('[facilityId+encounterId]')
        .equals([facility.id, id])
        .filter((row) => row.status === 'Available')
        .first()
    )
      throw new ApiError(409, 'An attendance note is already released for this visit.');
    const documentId = crypto.randomUUID();
    const released: PatientDocument = {
      id: documentId,
      facilityId: facility.id,
      patientId: encounter.patientId,
      origin: 'Facility release',
      encounterId: id,
      clinician: clinician.name,
      specialty: clinician.specialty,
      day: visit.day,
      time: visit.time,
      status: 'Available',
      addedAt: time,
      changedAt: time,
      version: 1,
    };
    await db.patientDocuments.add(released);
    return event('PatientDocumentReleased', documentId);
  }
  const record =
    typeof body['documentId'] === 'string'
      ? await db.patientDocuments.get(body['documentId'])
      : undefined;
  if (record?.facilityId !== facility.id) throw new ApiError(404, 'This document is unavailable.');
  if (path === 'portal/documents/withdraw') {
    const patientId = patientSubject(session);
    if (record.origin !== 'Patient upload' || record.patientId !== patientId)
      throw new ApiError(404, 'This document is unavailable.');
    await patientAt(facility, patientId);
  } else {
    if (record.origin !== 'Facility release')
      throw new ApiError(404, 'This document is unavailable.');
    await assignedEncounter(facility, session, record.encounterId);
  }
  if (record.status !== 'Available' || body['version'] !== String(record.version))
    throw new ApiError(409, 'This document is no longer the current available version.');
  await db.patientDocuments.update(record.id, {
    status: 'Withdrawn',
    version: record.version + 1,
    changedAt: time,
  });
  return event('PatientDocumentWithdrawn', record.id);
}
