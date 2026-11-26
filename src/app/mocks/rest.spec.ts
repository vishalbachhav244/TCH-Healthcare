import '@angular/compiler';
import 'fake-indexeddb/auto';
import { HttpHeaders, HttpRequest } from '@angular/common/http';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { dayInIndia, invoiceTotal, type AppointmentPage, type Session } from '../domain/operations';
import type { GovernanceData, QualityView } from '../domain/governance';
import { db, initialize } from './database';
import { handle } from './rest';
import { seed } from './seed';
import type {
  IntegrationDashboard,
  PatientSharing,
  RequestSummary,
  SharedReport,
} from '../domain/interoperability';

beforeAll(async () => {
  vi.stubGlobal('location', { origin: 'http://127.0.0.1:4317' });
  await initialize();
}, 60_000);

function get(path: string, session?: Session, facility?: string) {
  return handle(new HttpRequest('GET', '/api/v1/' + path, { headers: headers(session, facility) }));
}

function post(path: string, body: Record<string, string>, session?: Session, facility?: string) {
  return handle(
    new HttpRequest('POST', '/api/v1/' + path, body, { headers: headers(session, facility) }),
  );
}

function patch(path: string, body: Record<string, string>, session: Session, facility?: string) {
  return handle(
    new HttpRequest('PATCH', '/api/v1/' + path, body, { headers: headers(session, facility) }),
  );
}

function headers(session?: Session, facility?: string) {
  let values = new HttpHeaders();
  if (session) values = values.set('Authorization', 'Bearer ' + session.token);
  if (facility) values = values.set('X-Facility-Id', facility);
  return values;
}

const login = (account: string) =>
  post('session', { account, password: 'TrueCare-Local-2026' }) as Promise<Session>;

describe('facility governance', () => {
  const facility = 'mer-central';

  it('scopes review and referral and closes a de-identified case through a versioned lifecycle', async () => {
    const director = await login('medicaldirector');
    const coordinator = await login('quality');
    const executive = await login('executive');
    const worklist = 'clinical-governance?day=' + dayInIndia();
    await expect(get(worklist, executive, facility)).rejects.toMatchObject({ status: 403 });
    await expect(get(worklist, director, 'mer-north')).rejects.toMatchObject({ status: 403 });
    await expect(get('quality', director, facility)).rejects.toMatchObject({ status: 403 });
    const governance = (await get(worklist, director, facility)) as GovernanceData;
    expect(governance.pendingReviews).toBeGreaterThan(0);
    const item = governance.items.find((row) => !row.review)!;
    const referral = { reportId: item.id, action: 'refer', version: String(item.version) };
    await expect(
      post('clinical-governance/reviews', referral, coordinator, facility),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      post('clinical-governance/reviews', { ...referral, version: '0' }, director, facility),
    ).rejects.toMatchObject({ status: 409 });
    await post('clinical-governance/reviews', referral, director, facility);
    await expect(
      post('clinical-governance/reviews', referral, director, facility),
    ).rejects.toMatchObject({ status: 409 });

    const register = (await get('quality', coordinator, facility)) as QualityView[];
    const matches = register.filter((row) => row.origin === 'Clinical referral');
    expect(matches).toHaveLength(1);
    const qualityCase = matches[0];
    expect(JSON.stringify(qualityCase)).not.toContain(item.accession);
    expect(JSON.stringify(qualityCase)).not.toContain(item.id);
    const command = { caseId: qualityCase.id, version: '1', action: 'claim' };
    await expect(
      patch('quality/cases/status', { ...command, action: 'resolve' }, coordinator, facility),
    ).rejects.toMatchObject({ status: 409 });
    await patch('quality/cases/status', command, coordinator, facility);
    await expect(
      patch('quality/cases/status', command, coordinator, facility),
    ).rejects.toMatchObject({ status: 409 });
    const resolution = { ...command, version: '2', action: 'resolve' };
    await expect(
      patch('quality/cases/status', resolution, coordinator, facility),
    ).rejects.toMatchObject({ status: 422 });
    await patch(
      'quality/cases/status',
      { ...resolution, disposition: 'Follow-up scheduled' },
      coordinator,
      facility,
    );
    const refreshed = (await get('quality', coordinator, facility)) as QualityView[];
    const resolved = refreshed.find((row) => row.id === qualityCase.id)!;
    expect(resolved.timeline.map((entry) => entry.status)).toEqual([
      'Open',
      'Investigating',
      'Resolved',
    ]);
    expect(resolved.timeline.at(-1)?.disposition).toBe('Follow-up scheduled');
    const reviewed = (await get(worklist, director, facility)) as GovernanceData;
    expect(reviewed.items.find((row) => row.id === item.id)).toMatchObject({
      review: 'Referred',
      caseStatus: 'Resolved',
    });
  });
});

describe('consent and interoperability', () => {
  const facility = 'mer-central';
  const connector = 'mer-referral-records';

  async function issue(patient: Session, connectorId = connector) {
    return post('portal/matching-code', { connectorId }, patient, facility) as Promise<{
      code: string;
    }>;
  }

  function request(recipient: Session, code: string) {
    return post(
      'record-requests',
      { code, purpose: 'Continuation of care' },
      recipient,
    ) as Promise<{ id: string }>;
  }

  function access(recipient: Session, requestId: string) {
    return post('record-requests/retrieve', { requestId }, recipient) as Promise<{
      report: SharedReport;
    }>;
  }

  function decision(
    patient: Session,
    requestId: string,
    action: string,
    version: string,
    reportId = '',
  ) {
    return patch(
      'portal/sharing',
      { requestId, version, action, hours: '24', reportId },
      patient,
      facility,
    );
  }

  it('isolates connector configuration and rejects stale lifecycle commands', async () => {
    const admin = await login('integration');
    const patient = await login('patient');
    const recipient = await login('partnercare');
    await expect(get('integrations', recipient)).rejects.toMatchObject({ status: 403 });
    await expect(get('record-requests', admin)).rejects.toMatchObject({ status: 403 });
    await expect(get('portal/sharing', patient, 'mer-north')).rejects.toMatchObject({
      status: 403,
    });
    const { id } = (await post(
      'integrations/connectors',
      {
        facilityId: facility,
        name: 'Alternate referral records',
        standard: 'HL7 FHIR',
        recipientAccount: 'partnercare',
      },
      admin,
    )) as { id: string };
    await expect(issue(patient, id)).rejects.toMatchObject({ status: 404 });
    await expect(
      patch('integrations/connectors', { connectorId: id, action: 'enable', version: '1' }, admin),
    ).rejects.toMatchObject({ status: 409 });
    await patch(
      'integrations/connectors',
      { connectorId: id, action: 'validate', version: '1' },
      admin,
    );
    await expect(
      patch('integrations/connectors', { connectorId: id, action: 'enable', version: '1' }, admin),
    ).rejects.toMatchObject({ status: 409 });
    await patch(
      'integrations/connectors',
      { connectorId: id, action: 'enable', version: '2' },
      admin,
    );
    await expect(issue(patient, id)).resolves.toHaveProperty('code');
    await patch(
      'integrations/connectors',
      { connectorId: id, action: 'pause', version: '3' },
      admin,
    );
    await expect(issue(patient, id)).rejects.toMatchObject({ status: 404 });
  });

  it('matches one recipient, releases only the approved report version, and audits revocation', async () => {
    const patient = await login('patient');
    const recipient = await login('partnercare');
    const other = await login('partnerlab');
    const admin = await login('integration');
    const { code } = await issue(patient);
    await expect(request(other, code)).rejects.toMatchObject({ status: 404 });
    const attempts = await Promise.allSettled([request(recipient, code), request(recipient, code)]);
    expect(attempts.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    const confirmed = attempts.find((item) => item.status === 'fulfilled')!;
    const id = confirmed.value.id;
    await expect(access(recipient, id)).rejects.toMatchObject({
      status: 403,
      message: expect.stringContaining('Consent required'),
    });
    await expect(access(other, id)).rejects.toMatchObject({ status: 404 });
    await expect(access(admin, id)).rejects.toMatchObject({ status: 403 });
    const feed = (await get('portal/sharing', patient, facility)) as PatientSharing;
    const own = feed.reports[0]!;
    const otherReport = await db.labOrders
      .filter((item) => item.status === 'Published' && item.patientId !== 'TC-MERIDIAN-01001')
      .first();
    await expect(decision(patient, id, 'grant', '1', otherReport!.id)).rejects.toMatchObject({
      status: 422,
    });
    await decision(patient, id, 'grant', '1', own.id);
    const released = await access(recipient, id);
    expect(released.report).toMatchObject({
      test: own.test,
      accession: own.accession,
      source: 'Meridian Medical Centre',
    });
    expect(released.report).not.toHaveProperty('patientId');
    const requests = (await get('record-requests', recipient)) as RequestSummary[];
    expect(requests.find((item) => item.id === id)).not.toHaveProperty('reportId');
    await expect(decision(patient, id, 'revoke', '1')).rejects.toMatchObject({ status: 409 });
    await decision(patient, id, 'revoke', '2');
    await expect(access(recipient, id)).rejects.toMatchObject({
      status: 403,
      message: expect.stringContaining('Revoked'),
    });
    const logs = (await get('integrations', admin)) as IntegrationDashboard;
    expect(logs.audit.map((entry) => entry.outcome)).toEqual(
      expect.arrayContaining(['Consent required', 'Released', 'Revoked']),
    );
    expect(logs.audit.every((entry) => !('patientId' in entry) && !('requestId' in entry))).toBe(
      true,
    );
  });

  it('denies expired codes, expired grants and reports whose provenance changed', async () => {
    const patient = await login('patient');
    const recipient = await login('partnercare');
    const expired = await issue(patient);
    await db.matchingCodes.update(expired.code, { expiresAt: Date.now() - 1 });
    await expect(request(recipient, expired.code)).rejects.toMatchObject({ status: 404 });
    const record = await request(recipient, (await issue(patient)).code);
    const feed = (await get('portal/sharing', patient, facility)) as PatientSharing;
    const selected = (await db.labOrders.get(feed.reports[0]!.id))!;
    await decision(patient, record.id, 'grant', '1', selected.id);
    expect(await db.consentGrants.get(record.id)).toMatchObject({
      revoked: false,
      record: { kind: 'Laboratory report', id: selected.id, version: selected.version },
    });
    expect(await db.recordRequests.get(record.id)).not.toHaveProperty('reportId');
    await db.labOrders.update(selected.id, { version: selected.version + 1 });
    try {
      await expect(access(recipient, record.id)).rejects.toMatchObject({
        status: 403,
        message: expect.stringContaining('Source mismatch'),
      });
    } finally {
      await db.labOrders.update(selected.id, { version: selected.version });
    }
    await db.consentGrants.update(record.id, { expiresAt: Date.now() - 1 });
    await expect(access(recipient, record.id)).rejects.toMatchObject({
      status: 403,
      message: expect.stringContaining('Expired'),
    });
    const rows = (await get('record-requests', recipient)) as RequestSummary[];
    expect(rows.find((row) => row.id === record.id)?.status).toBe('Expired');
    expect(await db.exchangeAudit.where('requestId').equals(record.id).count()).toBe(2);
  });
});

describe('evaluation REST contract', () => {
  it('requires a valid unexpired session and rejects disabled entitlements or another tenant', async () => {
    await expect(get('overview')).rejects.toMatchObject({ status: 401 });
    await expect(
      post('session', { account: 'executive', password: 'wrong' }),
    ).rejects.toMatchObject({ status: 401 });
    const user = await login('sunrise');
    await expect(get('beds', user, 'sunrise')).rejects.toMatchObject({ status: 403 });
    await expect(get('appointments', user, 'mer-central')).rejects.toMatchObject({ status: 403 });
    await expect(get('clinical', user, 'sunrise')).rejects.toMatchObject({ status: 403 });
    await db.sessions.update(user.token, { expiresAt: Date.now() - 1 });
    await expect(get('appointments', user, 'sunrise')).rejects.toMatchObject({ status: 401 });
  }, 20_000);

  it('serializes conflicts and rejects replay, cross-tenant patient IDs and appointment pass disclosure', async () => {
    const user = await login('reception');
    const day = dayInIndia();
    const detail = {
      patientId: 'TC-MERIDIAN-01001',
      practitionerId: 'mer-central-DR-1',
      time: '15:45',
      day,
    };
    await expect(
      post('appointments', { ...detail, patientId: 'TC-SUNRISE-01001' }, user, 'mer-central'),
    ).rejects.toMatchObject({ status: 404 });
    const bookings = await Promise.allSettled([
      post('appointments', detail, user, 'mer-central'),
      post('appointments', detail, user, 'mer-central'),
    ]);
    expect(bookings.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    const saved = bookings.find(
      (result) => result.status === 'fulfilled',
    ) as PromiseFulfilledResult<{ id: string; pass: string }>;
    const list = (await get(
      'appointments?q=TC-MERIDIAN-01001',
      user,
      'mer-central',
    )) as AppointmentPage;
    expect(
      list.items.find((row) => row.appointment.id === saved.value.id)?.appointment,
    ).not.toHaveProperty('pass');
    await post('queue/check-in', { pass: saved.value.pass }, user, 'mer-central');
    await expect(
      post('queue/check-in', { pass: saved.value.pass }, user, 'mer-central'),
    ).rejects.toMatchObject({ status: 409 });
    const executive = await login('executive');
    await expect(
      post('queue/call', { appointmentId: saved.value.id }, executive, 'mer-central'),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('records at most one payment on an outstanding invoice under concurrent requests', async () => {
    const user = await login('cashier');
    const payments = await db.payments.toArray();
    const paid = new Set(payments.map((row) => row.invoiceId));
    const invoice = (await db.invoices.where('facilityId').equals('mer-central').toArray()).find(
      (row) => !paid.has(row.id),
    )!;
    const results = await Promise.allSettled([
      post('billing/payments', { invoiceId: invoice.id }, user, 'mer-central'),
      post('billing/payments', { invoiceId: invoice.id }, user, 'mer-central'),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    const entries = await db.payments.where('invoiceId').equals(invoice.id).toArray();
    expect(entries).toHaveLength(1);
    expect(entries[0].amountMinor).toBe(invoiceTotal(invoice));
  });

  it('prevents simultaneous bed allocations and preserves the ward status through discharge', async () => {
    const user = await login('admissions');
    const facility = 'mer-central';
    const first = (await post(
      'admissions',
      { patientId: 'TC-MERIDIAN-01199' },
      user,
      facility,
    )) as { id: string };
    const second = (await post(
      'admissions',
      { patientId: 'TC-MERIDIAN-01200' },
      user,
      facility,
    )) as { id: string };
    const bed = (await db.beds
      .where('facilityId')
      .equals(facility)
      .filter((row) => row.status === 'Available')
      .first())!;
    const results = await Promise.allSettled(
      [first, second].map(({ id }) =>
        post(
          'admissions/allocate',
          { admissionId: id, version: '1', bedId: bed.id },
          user,
          facility,
        ),
      ),
    );
    expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    const allocated = (await db.admissions.where('bedId').equals(bed.id).first())!;
    await expect(
      post('admissions/discharge', { admissionId: allocated.id, version: '1' }, user, facility),
    ).rejects.toMatchObject({ status: 409 });
    await post('admissions/discharge', { admissionId: allocated.id, version: '2' }, user, facility);
    expect((await db.beds.get(bed.id))?.status).toBe('Cleaning');
    await post('beds/release', { bedId: bed.id }, user, facility);
    expect((await db.beds.get(bed.id))?.status).toBe('Available');
  });

  it('releases only the patient’s published reports and restricts the laboratory authorisation stage', async () => {
    const facility = 'mer-central';
    const technician = await login('lab');
    const reviewer = await login('labreview');
    const patient = await login('patient');
    const order = (await db.labOrders
      .where('facilityId')
      .equals(facility)
      .filter((row) => row.status === 'Entered')
      .first())!;
    const body = { orderId: order.id, version: String(order.version) };
    await expect(post('laboratory/advance', body, technician, facility)).rejects.toMatchObject({
      status: 403,
    });
    await post('laboratory/advance', body, reviewer, facility);
    await expect(post('laboratory/advance', body, reviewer, facility)).rejects.toMatchObject({
      status: 409,
    });
    await post(
      'laboratory/advance',
      { ...body, version: String(order.version + 1) },
      reviewer,
      facility,
    );
    const portal = (await get(
      'portal',
      patient,
      facility,
    )) as import('../domain/portal').PatientPortal;
    expect(portal.patient.id).toBe('TC-MERIDIAN-01001');
    expect(
      portal.records.every(
        (row) => row.status === 'Published' && row.patientId === portal.patient.id,
      ),
    ).toBe(true);
    await expect(
      post('portal/passes', { appointmentId: 'mer-central-A-0-2' }, patient, facility),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('exposes token numbers and clinical departments on approved signage without identity fields', async () => {
    const feed = (await get(
      'queue-display?facility=mer-central',
    )) as import('../domain/operations').QueueDisplayData;
    expect(feed.calling.length).toBeGreaterThan(0);
    expect(
      feed.calling.every((token) => Object.keys(token).sort().join(',') === 'number,specialty'),
    ).toBe(true);
    await expect(get('queue-display?facility=sunrise')).rejects.toMatchObject({ status: 404 });
  });
});

describe('fixture contract', () => {
  it('generates deterministic tenant identities and linked outpatient records', () => {
    const date = '2026-11-26';
    const dataset = seed(date, true);
    expect(seed(date, true)).toEqual(dataset);
    const patients = new Map(dataset.patients.map((row) => [row.id, row]));
    const appointments = new Map(dataset.appointments.map((row) => [row.id, row]));
    const encounters = new Map(dataset.encounters.map((row) => [row.id, row]));
    const invoices = new Map(dataset.invoices.map((row) => [row.id, row]));
    expect(dataset.appointments.every((row) => patients.has(row.patientId))).toBe(true);
    expect(
      dataset.encounters.every(
        (row) => appointments.get(row.appointmentId)?.patientId === row.patientId,
      ),
    ).toBe(true);
    expect(
      dataset.invoices.every((row) => encounters.get(row.encounterId)?.patientId === row.patientId),
    ).toBe(true);
    expect(dataset.payments.every((row) => invoices.has(row.invoiceId))).toBe(true);
  });
});

describe('platform authorization and entitlements', () => {
  it('authorizes incident transitions and returns only platform event metadata', async () => {
    const operations = await login('operations');
    const admin = await login('platform');
    await expect(get('platform-operations', admin)).rejects.toMatchObject({ status: 403 });
    const created = (await post(
      'platform-operations/incidents',
      {
        title: 'Investigate delayed workflow refresh',
        service: 'Queue display',
        priority: 'High',
      },
      operations,
    )) as { id: string };
    const transition = (version: string) =>
      handle(
        new HttpRequest(
          'PATCH',
          '/api/v1/platform-operations/incidents',
          { id: created.id, version },
          { headers: headers(operations) },
        ),
      );
    await transition('1');
    await expect(transition('1')).rejects.toMatchObject({ status: 409 });
    await transition('2');
    await expect(transition('3')).rejects.toMatchObject({ status: 409 });
    const overview = (await get(
      'platform-operations',
      operations,
    )) as import('../domain/platform-operations').PlatformOperationsData;
    expect(overview.incidents).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: created.id, status: 'Resolved' })]),
    );
    expect(overview.activity.some((field) => field.type === 'IncidentResolved')).toBe(true);
    expect(JSON.stringify(overview.activity)).not.toContain('entityId');
  });
  it('keeps subscription administration and network metrics inside their assigned scopes', async () => {
    const success = await login('success');
    const network = await login('network');
    const executive = await login('executive');
    await expect(get('platform', success)).rejects.toMatchObject({ status: 403 });
    await expect(get('network', executive, 'mer-central')).rejects.toMatchObject({ status: 403 });
    await expect(get('network', network, 'sunrise')).rejects.toMatchObject({ status: 403 });
    const comparisons = (await get('network', network, 'mer-central')) as {
      facility: { id: string };
    }[];
    expect(comparisons.map((row) => row.facility.id).sort()).toEqual(['mer-central', 'mer-north']);
    expect(JSON.stringify(comparisons)).not.toContain('patientId');
    const update = (body: Record<string, string>) =>
      handle(
        new HttpRequest('PATCH', '/api/v1/subscriptions', body, { headers: headers(success) }),
      );
    await expect(
      update({ organisationId: 'meridian', action: 'plan', version: '0', plan: 'Clinic' }),
    ).rejects.toMatchObject({ status: 409 });
    await update({ organisationId: 'meridian', action: 'review', version: '0' });
    await expect(
      update({ organisationId: 'meridian', action: 'plan', version: '0', plan: 'Hospital' }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(get('subscriptions', success)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          organisation: expect.objectContaining({
            id: 'meridian',
            subscriptionVersion: 1,
            reviewedOn: dayInIndia(),
          }),
        }),
      ]),
    );
  });
  it('reprojects named access on existing sessions and confines each role to its facility', async () => {
    const admin = await login('platform');
    const reception = await login('reception');
    const organization = (await post(
      'platform/organizations',
      { name: 'Windward Clinic', plan: 'Clinic' },
      admin,
    )) as { id: string };
    const facility = (await post(
      'platform/facilities',
      { tenantId: organization.id, name: 'Windward South', city: 'Pune' },
      admin,
    )) as { id: string };
    const configure = (operation: string, body: Record<string, string>) =>
      handle(
        new HttpRequest(
          'PATCH',
          '/api/v1/platform/' + operation,
          { facilityId: facility.id, ...body },
          { headers: headers(admin) },
        ),
      );
    const grant = { account: 'reception', role: 'cashier', active: 'true', version: '0' };
    await expect(configure('membership', { ...grant, account: 'patient' })).rejects.toMatchObject({
      status: 422,
    });
    await configure('membership', grant);
    await expect(get('billing', reception, facility.id)).rejects.toMatchObject({ status: 403 });
    await configure('activation', { active: 'true', version: '1' });
    await expect(get('billing', reception, facility.id)).resolves.toEqual([]);
    await expect(get('billing', reception, 'mer-central')).rejects.toMatchObject({ status: 403 });
    await expect(get('patients', reception, facility.id)).rejects.toMatchObject({ status: 403 });
    await expect(get('patients', reception, 'mer-central')).resolves.toHaveProperty('patients');
    await expect(configure('membership', { ...grant, active: 'false' })).rejects.toMatchObject({
      status: 409,
    });
    await configure('membership', { ...grant, active: 'false', version: '1' });
    await expect(get('billing', reception, facility.id)).rejects.toMatchObject({ status: 403 });
    await expect(
      post('billing/payments', { invoiceId: 'irrelevant' }, reception, facility.id),
    ).rejects.toMatchObject({ status: 403 });
  });
  it('provisions an organisation and a facility without sharing clinical access', async () => {
    const admin = await login('platform');
    const staff = await login('reception');
    await expect(get('platform', staff)).rejects.toMatchObject({ status: 403 });
    await expect(get('appointments', admin, 'mer-central')).rejects.toMatchObject({ status: 403 });
    const organisation = (await post(
      'platform/organizations',
      { name: 'Juniper Healthcare', plan: 'Hospital' },
      admin,
    )) as { id: string };
    const facility = (await post(
      'platform/facilities',
      { tenantId: organisation.id, name: 'Juniper East Hospital', city: 'Pune' },
      admin,
    )) as { id: string };
    await expect(get('patients', staff, facility.id)).rejects.toMatchObject({ status: 403 });
    await expect(
      post('platform/organizations', { name: 'juniper healthcare', plan: 'Hospital' }, admin),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('enforces the live configuration record and rejects stale versions or ineligible plans', async () => {
    const admin = await login('platform');
    const staff = await login('executive');
    const context = 'mer-central';
    const setup = (id: string, version: string, inpatient: string) =>
      handle(
        new HttpRequest(
          'PATCH',
          '/api/v1/platform/entitlements',
          { facilityId: id, version, inpatient },
          { headers: headers(admin) },
        ),
      );
    await expect(setup('sunrise', '1', 'true')).rejects.toMatchObject({ status: 409 });
    await expect(get('beds', staff, context)).resolves.toHaveProperty('beds');
    await setup(context, '1', 'false');
    await expect(get('beds', staff, context)).rejects.toMatchObject({ status: 403 });
    await expect(setup(context, '1', 'true')).rejects.toMatchObject({ status: 409 });
    await setup(context, '2', 'true');
    await expect(get('beds', staff, context)).resolves.toHaveProperty('beds');
  });
});

describe('scheduling and queue transitions', () => {
  it('rotates appointment passes, rejects stale changes, and releases cancelled slots', async () => {
    const user = await login('reception');
    const facility = 'mer-central';
    const day = dayInIndia();
    const details = {
      patientId: 'TC-MERIDIAN-01004',
      practitionerId: 'mer-central-DR-1',
      day,
      time: '16:45',
    };
    const appointment = (await post('appointments', details, user, facility)) as {
      id: string;
      pass: string;
    };
    const edit = (operation: string, body: Record<string, string>) =>
      handle(
        new HttpRequest(
          'PATCH',
          '/api/v1/appointments/' + operation,
          { appointmentId: appointment.id, ...body },
          { headers: headers(user, facility) },
        ),
      );
    const updated = (await edit('reschedule', { ...details, time: '16:30', version: '0' })) as {
      id: string;
      pass: string;
    };
    expect(updated.id).toBe(appointment.id);
    expect(updated.pass).not.toBe(appointment.pass);
    await expect(
      post('queue/check-in', { pass: appointment.pass }, user, facility),
    ).rejects.toMatchObject({ status: 404 });
    await expect(edit('cancel', { version: '0' })).rejects.toMatchObject({ status: 409 });
    await edit('cancel', { version: '1' });
    await expect(
      post('queue/check-in', { pass: updated.pass }, user, facility),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      get('appointments/availability?practitionerId=mer-central-DR-1&day=' + day, user, facility),
    ).resolves.toEqual(expect.arrayContaining(['16:30', '16:45']));
  });
});

describe('medication authorization and dispensing', () => {
  it('keeps drafts off the dispensing queue and posts exactly one charge and stock movement', async () => {
    const desk = await login('reception');
    const clinician = await login('clinician');
    const pharmacist = await login('pharmacy');
    const cashier = await login('cashier');
    const facility = 'mer-central';
    const booking = (await post(
      'appointments',
      {
        patientId: 'TC-MERIDIAN-01005',
        practitionerId: 'mer-central-DR-1',
        day: dayInIndia(),
        time: '15:15',
      },
      desk,
      facility,
    )) as { id: string; pass: string };
    await post('queue/check-in', { pass: booking.pass }, desk, facility);
    await post('queue/call', { appointmentId: booking.id }, desk, facility);
    const encounter = (await post(
      'clinical/start',
      { appointmentId: booking.id },
      clinician,
      facility,
    )) as { id: string };
    const draft = (await post(
      'clinical/prescriptions',
      { encounterId: encounter.id, productId: 'hydration', quantity: '3' },
      clinician,
      facility,
    )) as { id: string };
    const feed = (await get(
      'pharmacy',
      pharmacist,
      facility,
    )) as import('../domain/pharmacy').PharmacyData;
    expect(feed.prescriptions.some((row) => row.prescription.id === draft.id)).toBe(false);
    await expect(
      post(
        'pharmacy/dispense',
        { prescriptionId: draft.id, lotId: 'mer-central-hydration-1' },
        pharmacist,
        facility,
      ),
    ).rejects.toMatchObject({ status: 409 });
    await post('clinical/prescriptions/sign', { prescriptionId: draft.id }, clinician, facility);
    await expect(
      post(
        'pharmacy/dispense',
        { prescriptionId: draft.id, lotId: 'mer-central-hydration-2' },
        pharmacist,
        facility,
      ),
    ).rejects.toMatchObject({ status: 409 });
    const lotId = 'mer-central-hydration-1';
    const stock = (await db.stockLots.get(lotId))!.onHand;
    const dispense = () =>
      post('pharmacy/dispense', { prescriptionId: draft.id, lotId }, pharmacist, facility);
    const requests = await Promise.allSettled([dispense(), dispense()]);
    expect(requests.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect((await db.stockLots.get(lotId))?.onHand).toBe(stock - 3);
    expect(await db.stockMovements.where('prescriptionId').equals(draft.id).count()).toBe(1);
    expect(await db.invoices.where('prescriptionId').equals(draft.id).count()).toBe(1);
    await post(
      'clinical/complete',
      { appointmentId: booking.id, observation: 'History reviewed and findings documented.' },
      clinician,
      facility,
    );
    await post(
      'billing/invoices',
      { encounterId: encounter.id, service: 'Outpatient consultation' },
      cashier,
      facility,
    );
    expect(await db.invoices.where('encounterId').equals(encounter.id).count()).toBe(2);
  });
});
