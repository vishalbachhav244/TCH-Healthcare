import '@angular/compiler';
import 'fake-indexeddb/auto';
import { HttpHeaders, HttpRequest } from '@angular/common/http';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  dayInIndia,
  invoiceTotal,
  shiftDay,
  type AppointmentPage,
  type InvoiceRow,
  type Session,
} from '../domain/operations';
import type { SchedulingDay } from '../domain/scheduling';
import type { BookingContext, ClinicalContinuity } from '../domain/continuity';
import type { PatientPortal } from '../domain/portal';
import type { DischargeDocument, InpatientBillingDetail } from '../domain/discharge';
import type { GovernanceData, QualityView } from '../domain/governance';
import type { WardAssignmentOptions, WardDetail, WardWorklistRow } from '../domain/ward-care';
import type { ImagingOrder, ImagingRow } from '../domain/radiology';
import type { BloodBankView } from '../domain/blood-bank';
import type { PharmacyData } from '../domain/pharmacy';
import { criticalCareWard, type AcuteView } from '../domain/acute-care';
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

describe('radiology', () => {
  it('schedules a clinician’s order once and releases the report only through Radiology review', async () => {
    const facility = 'mer-central';
    const patientId = 'TC-MERIDIAN-01001';
    const practitionerId = 'mer-central-DR-1';
    const [clinician, reception, technician, reviewer, patient] = await Promise.all(
      ['clinician', 'reception', 'imaging', 'radiologist', 'patient'].map(login),
    );
    await expect(get('radiology', reception, facility)).rejects.toMatchObject({ status: 403 });
    const otherEncounter = (await db.encounters
      .where('facilityId')
      .equals(facility)
      .filter((row) => row.practitionerId !== practitionerId)
      .first())!;
    await expect(
      get('clinical/imaging-orders?encounterId=' + otherEncounter.id, clinician, facility),
    ).rejects.toMatchObject({ status: 403 });
    const today = dayInIndia();
    const booked = (await post(
      'appointments',
      { patientId, practitionerId, day: today, time: '15:30' },
      reception,
      facility,
    )) as { id: string; pass: string };
    await post('queue/check-in', { pass: booked.pass }, reception, facility);
    await post('queue/call', { appointmentId: booked.id }, reception, facility);
    const { id: encounterId } = (await post(
      'clinical/start',
      { appointmentId: booked.id },
      clinician,
      facility,
    )) as { id: string };
    const fields = { encounterId, study: 'Chest radiograph' };
    await expect(
      post('clinical/imaging-orders', fields, reception, facility),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      post('clinical/imaging-orders', { ...fields, study: 'unknown' }, clinician, facility),
    ).rejects.toMatchObject({ status: 422 });
    const { id: orderId } = (await post(
      'clinical/imaging-orders',
      fields,
      clinician,
      facility,
    )) as { id: string };
    await expect(
      post('clinical/imaging-orders', fields, clinician, facility),
    ).rejects.toMatchObject({ status: 409 });
    const { id: second } = (await post(
      'clinical/imaging-orders',
      { encounterId, study: 'Abdominal ultrasound' },
      clinician,
      facility,
    )) as { id: string };
    const route = 'radiology/orders/status';
    const change = (version: string, action: string, user: Session, extra = {}, at = facility) =>
      patch(route, { orderId, version, action, ...extra }, user, at);
    await expect(
      change('1', 'schedule', technician, { day: today, time: '13:00' }, 'mer-north'),
    ).rejects.toMatchObject({ status: 404 });
    await expect(change('1', 'publish', reviewer)).rejects.toMatchObject({ status: 409 });
    await expect(
      change('1', 'schedule', reviewer, { day: today, time: '13:00' }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      change('1', 'schedule', technician, { day: shiftDay(today, -1), time: '13:00' }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      change('1', 'schedule', technician, { day: today, time: '09:00' }),
    ).rejects.toMatchObject({ status: 409, message: expect.stringContaining('already reserved') });
    const schedule = { action: 'schedule', day: today, time: '13:00', version: '1' };
    await change('1', 'schedule', technician, schedule);
    await expect(
      patch(route, { orderId: second, ...schedule }, technician, facility),
    ).rejects.toMatchObject({ status: 409 });
    await expect(change('1', 'acquire', technician)).rejects.toMatchObject({ status: 409 });
    await change('2', 'schedule', technician, { day: today, time: '13:30' });
    expect(await db.imagingOrders.get(orderId)).toMatchObject({
      scheduledTime: '13:30',
      version: 3,
    });
    await change('3', 'acquire', technician);
    await expect(
      change('4', 'report', technician, { note: 'Image series documented' }),
    ).rejects.toMatchObject({ status: 403 });
    await change('4', 'report', reviewer, { note: 'Image series documented' });
    const patientReports = async () =>
      ((await get('portal', patient, facility)) as PatientPortal).imagingReports;
    expect(await patientReports()).toEqual([]);
    const orderFor = async (user: Session) =>
      ((await get('radiology', user, facility)) as ImagingRow[]).find(
        (row) => row.order.id === orderId,
      )?.order;
    expect(await orderFor(technician)).not.toHaveProperty('note');
    expect(await orderFor(reviewer)).toMatchObject({
      status: 'Report ready',
      note: 'Image series documented',
    });
    const providerOrders = async () =>
      (await get(
        'clinical/imaging-orders?encounterId=' + encounterId,
        clinician,
        facility,
      )) as ImagingOrder[];
    expect((await providerOrders()).find((row) => row.id === orderId)).not.toHaveProperty('note');
    await change('5', 'publish', reviewer);
    expect(await orderFor(technician)).not.toHaveProperty('note');
    expect(await patientReports()).toMatchObject([
      { id: orderId, study: 'Chest radiograph', note: 'Image series documented' },
    ]);
    expect(await providerOrders()).toContainEqual(
      expect.objectContaining({ id: orderId, status: 'Published', version: 6 }),
    );
    const foreign = ((await get('radiology', reviewer, facility)) as ImagingRow[]).find(
      (row) => row.patient.id !== patientId && row.order.status === 'Report ready',
    )!;
    await patch(
      route,
      { orderId: foreign.order.id, version: String(foreign.order.version), action: 'publish' },
      reviewer,
      facility,
    );
    expect((await patientReports()).map((row) => row.id)).toEqual([orderId]);
    await expect(
      change('6', 'report', reviewer, { note: 'Ordering team review requested' }),
    ).rejects.toMatchObject({ status: 409 });
    await post(
      'clinical/complete',
      { appointmentId: booked.id, observation: 'Observation completed. Follow-up discussed.' },
      clinician,
      facility,
    );
    await expect(
      post(
        'clinical/imaging-orders',
        { encounterId, study: 'Extremity radiograph' },
        clinician,
        facility,
      ),
    ).rejects.toMatchObject({ status: 409 });
  }, 90_000);
});

describe('blood bank', () => {
  it('validates assignment, expiry and review and accounts for one reserved or issued unit', async () => {
    const facility = 'mer-central';
    const patientId = 'TC-MERIDIAN-01198';
    const [physician, otherPhysician, nurse, admissions, officer] = await Promise.all(
      ['wardphysician', 'wardcover', 'wardnurse', 'admissions', 'bloodbank'].map(login),
    );
    const beds = await db.beds
      .where('facilityId')
      .equals(facility)
      .filter((row) => row.status === 'Available')
      .toArray();
    const { id: admissionId } = (await post('admissions', { patientId }, admissions, facility)) as {
      id: string;
    };
    await post(
      'admissions/allocate',
      { admissionId, version: '1', bedId: beds[0].id },
      admissions,
      facility,
    );
    const context = { admissionId, admissionVersion: '2', assignmentVersion: '1' };
    await patch(
      'admissions/care-team',
      { ...context, assignmentVersion: '0', physician: 'wardphysician', nurse: 'wardnurse' },
      admissions,
      facility,
    );
    const requestPath = 'inpatient-physician/blood-requests';
    const fields = { ...context, component: 'Red cells' };
    await expect(post(requestPath, fields, nurse, facility)).rejects.toMatchObject({ status: 403 });
    await expect(post(requestPath, fields, otherPhysician, facility)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      post(requestPath, { ...fields, component: 'Unknown' }, physician, facility),
    ).rejects.toMatchObject({ status: 422 });
    const { id: requestId } = (await post(requestPath, fields, physician, facility)) as {
      id: string;
    };
    await expect(post(requestPath, fields, physician, facility)).rejects.toMatchObject({
      status: 409,
    });
    await expect(get('blood-bank', nurse, facility)).rejects.toMatchObject({ status: 403 });
    const inventory = async () => (await get('blood-bank', officer, facility)) as BloodBankView;
    expect(
      (await inventory()).requests.find((row) => row.request.id === requestId)?.patient.id,
    ).toBe(patientId);
    const { units } = await inventory();
    const available = units.find(
      (row) => row.component === fields.component && row.status === 'Available',
    )!;
    const expired = units.find(
      (row) => row.component === fields.component && row.status === 'Expired',
    )!;
    const actionPath = 'blood-bank/requests/status';
    const reserve = {
      requestId,
      version: '1',
      action: 'reserve',
      review: 'recorded',
      unitId: available.id,
    };
    await expect(patch(actionPath, reserve, officer, 'mer-north')).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      patch(actionPath, { ...reserve, action: 'issue' }, officer, facility),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      patch(actionPath, { ...reserve, review: '' }, officer, facility),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      patch(actionPath, { ...reserve, unitId: expired.id }, officer, facility),
    ).rejects.toMatchObject({ status: 409 });
    const outcomes = await Promise.allSettled([
      patch(actionPath, reserve, officer, facility),
      patch(actionPath, reserve, officer, facility),
    ]);
    expect(outcomes.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes).toContainEqual(
      expect.objectContaining({
        status: 'rejected',
        reason: expect.objectContaining({ status: 409 }),
      }),
    );
    expect((await inventory()).units.find((row) => row.id === available.id)).toMatchObject({
      status: 'Reserved',
      requestId,
    });
    const draft = {
      ...context,
      planVersion: '0',
      destination: 'Home',
      course: 'Ward care reviewed',
      followUp: 'Follow-up to be confirmed',
    };
    await post('inpatient-physician/discharge-summary', draft, physician, facility);
    await patch(
      'inpatient-physician/discharge-summary/sign',
      { ...context, planVersion: '1' },
      physician,
      facility,
    );
    const discharge = { admissionId, version: '2' };
    await expect(
      post('admissions/discharge', discharge, admissions, facility),
    ).rejects.toMatchObject({ status: 409, message: expect.stringContaining('blood component') });
    await expect(
      patch(
        requestPath + '/withdraw',
        { ...context, requestId, version: '2' },
        physician,
        facility,
      ),
    ).rejects.toMatchObject({ status: 409 });
    await db.bloodUnits.update(available.id, { expiresOn: shiftDay(dayInIndia(), -1) });
    await expect(
      patch(actionPath, { requestId, version: '2', action: 'issue' }, officer, facility),
    ).rejects.toMatchObject({ status: 409, message: expect.stringContaining('expired') });
    expect(
      (await inventory()).requests.find((row) => row.request.id === requestId)?.reservedUnitExpired,
    ).toBe(true);
    await patch(actionPath, { requestId, version: '2', action: 'cancel' }, officer, facility);
    await db.bloodUnits.update(available.id, { expiresOn: available.expiresOn });
    expect((await inventory()).units.find((row) => row.id === available.id)?.status).toBe(
      'Available',
    );
    const second = (await post(requestPath, fields, physician, facility)) as { id: string };
    await patch(actionPath, { ...reserve, requestId: second.id }, officer, facility);
    await patch(
      actionPath,
      { requestId: second.id, version: '2', action: 'issue' },
      officer,
      facility,
    );
    await expect(
      patch(actionPath, { requestId: second.id, version: '3', action: 'issue' }, officer, facility),
    ).rejects.toMatchObject({ status: 409 });
    expect((await inventory()).units.find((row) => row.id === available.id)).toMatchObject({
      status: 'Issued',
      requestId: second.id,
    });
    const ward = (await get(
      'inpatient-physician/detail?admissionId=' + admissionId,
      physician,
      facility,
    )) as WardDetail;
    expect(ward.bloodRequests).toContainEqual({
      id: second.id,
      component: 'Red cells',
      status: 'Issued',
      version: 3,
    });
    const nurseDetail = (await get(
      'nursing-station/detail?admissionId=' + admissionId,
      nurse,
      facility,
    )) as WardDetail;
    expect(nurseDetail.bloodRequests).toBeUndefined();
    const declined = (await post(
      requestPath,
      { ...fields, component: 'Plasma' },
      physician,
      facility,
    )) as { id: string };
    await patch(
      actionPath,
      { requestId: declined.id, version: '1', action: 'decline' },
      officer,
      facility,
    );
    expect(await db.bloodRequests.get(declined.id)).toMatchObject({
      status: 'Declined',
      reviewedBy: 'bloodbank',
    });
    const third = (await post(
      requestPath,
      { ...fields, component: 'Plasma' },
      physician,
      facility,
    )) as { id: string };
    await patch(
      requestPath + '/withdraw',
      { ...context, requestId: third.id, version: '1' },
      physician,
      facility,
    );
    await post('admissions/discharge', discharge, admissions, facility);
    await post('beds/release', { bedId: beds[0].id }, admissions, facility);
    await db.facilities.update(facility, { inpatient: false });
    try {
      await expect(get('blood-bank', officer, facility)).rejects.toMatchObject({ status: 403 });
      await expect(patch(actionPath, reserve, officer, facility)).rejects.toMatchObject({
        status: 403,
      });
    } finally {
      await db.facilities.update(facility, { inpatient: true });
    }
  }, 90_000);
});

describe('emergency, ICU and theatre', () => {
  const facility = 'mer-central';

  it('records a clinician assessment, hands off one admission and resolves the ICU transfer', async () => {
    const [emergency, admissions, icu, theatre] = await Promise.all([
      login('emergency'),
      login('admissions'),
      login('icu'),
      login('theatre'),
    ]);
    const patientId = 'TC-MERIDIAN-01001';
    await expect(get('emergency', icu, facility)).rejects.toMatchObject({ status: 403 });
    await expect(
      get('emergency/patients?q=' + patientId, admissions, facility),
    ).rejects.toMatchObject({ status: 403 });
    await db.facilities.update(facility, { inpatient: false });
    try {
      for (const [path, user] of [
        ['emergency', emergency],
        ['critical-care', icu],
        ['operation-theatre', theatre],
      ] as const) {
        await expect(get(path, user, facility)).rejects.toMatchObject({ status: 403 });
      }
    } finally {
      await db.facilities.update(facility, { inpatient: true });
    }

    const arrival = { patientId, arrival: 'Facility referral' };
    const { id: caseId } = (await post('emergency/arrivals', arrival, emergency, facility)) as {
      id: string;
    };
    await expect(post('emergency/arrivals', arrival, emergency, facility)).rejects.toMatchObject({
      status: 409,
    });
    const waiting = (await get('emergency', emergency, facility)) as Extract<
      AcuteView,
      { kind: 'emergency' }
    >;
    const pending = waiting.cases.find((row) => row.id === caseId)!;
    expect(pending.status).toBe('Awaiting assessment');
    expect(pending).not.toHaveProperty('priority');
    const identity = { caseId, version: '1' };
    await expect(
      patch('emergency/visits/status', { ...identity, action: 'admit' }, emergency, facility),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      patch('emergency/visits/status', { ...identity, action: 'assess' }, emergency, facility),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      patch(
        'emergency/visits/status',
        { ...identity, action: 'assess', priority: 'Urgent' },
        emergency,
        'mer-north',
      ),
    ).rejects.toMatchObject({ status: 404 });
    await patch(
      'emergency/visits/status',
      { ...identity, action: 'assess', priority: 'Urgent' },
      emergency,
      facility,
    );
    const handoff = { caseId, version: '2', action: 'admit' };
    const results = await Promise.allSettled([
      patch('emergency/visits/status', handoff, emergency, facility),
      patch('emergency/visits/status', handoff, emergency, facility),
    ]);
    expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    const admissionId = (await db.emergencyCases.get(caseId))!.admissionId!;
    expect(await db.admissions.get(admissionId)).toMatchObject({ patientId, status: 'Requested' });
    const beds = await db.beds
      .where('facilityId')
      .equals(facility)
      .filter((row) => row.status === 'Available')
      .toArray();
    const critical = beds.find((row) => row.ward === criticalCareWard)!;
    const regular = beds.find((row) => row.ward !== criticalCareWard)!;
    await post(
      'admissions/allocate',
      { admissionId, bedId: critical.id, version: '1' },
      admissions,
      facility,
    );
    const criticalContext = { admissionId, version: '2' };
    await expect(
      post(
        'critical-care/reviews',
        { ...criticalContext, focus: 'Bedside review', outcome: 'Review documented' },
        emergency,
        facility,
      ),
    ).rejects.toMatchObject({ status: 403 });
    await post(
      'critical-care/reviews',
      { ...criticalContext, focus: 'Team handoff', outcome: 'Handoff ready' },
      icu,
      facility,
    );
    await post('critical-care/step-downs', criticalContext, icu, facility);
    await expect(
      post('critical-care/step-downs', criticalContext, icu, facility),
    ).rejects.toMatchObject({ status: 409 });
    const census = (await get('critical-care', icu, facility)) as Extract<
      AcuteView,
      { kind: 'critical-care' }
    >;
    expect(census.patients.find((row) => row.admissionId === admissionId)).toMatchObject({
      bed: critical.label,
      stepDownRequestedAt: expect.any(Number),
      reviews: [{ focus: 'Team handoff' }],
    });
    await post(
      'admissions/allocate',
      { admissionId, bedId: regular.id, version: '2' },
      admissions,
      facility,
    );
    expect(await db.icuStepDowns.where('admissionId').equals(admissionId).first()).toMatchObject({
      status: 'Transferred',
    });
    expect(await db.beds.get(critical.id)).toMatchObject({ status: 'Cleaning' });
    await expect(
      post('critical-care/step-downs', { admissionId, version: '3' }, icu, facility),
    ).rejects.toMatchObject({ status: 404 });
    await post('admissions/discharge', { admissionId, version: '3' }, admissions, facility);
    const terminal = (await get('emergency', emergency, facility)) as Extract<
      AcuteView,
      { kind: 'emergency' }
    >;
    expect(terminal.cases.find((row) => row.id === caseId)).toMatchObject({
      priority: 'Urgent',
      assessedBy: 'Dr. Kabir Mehta',
      admissionStatus: 'Discharged',
    });
    await post('beds/release', { bedId: critical.id }, admissions, facility);
    await post('beds/release', { bedId: regular.id }, admissions, facility);
  }, 60_000);

  it('rejects theatre conflicts and invalid transitions and releases discharge after recovery', async () => {
    const [theatre, admissions] = await Promise.all([login('theatre'), login('admissions')]);
    const { id: admissionId } = (await post(
      'admissions',
      { patientId: 'TC-MERIDIAN-01002' },
      admissions,
      facility,
    )) as { id: string };
    const bed = (await db.beds
      .where('facilityId')
      .equals(facility)
      .filter((row) => row.status === 'Available')
      .first())!;
    const day = dayInIndia();
    const booking = {
      admissionId,
      day,
      room: 'Theatre 1',
      category: 'Day procedure',
      startsAt: '08:00',
      endsAt: '09:00',
    };
    await expect(post('operation-theatre/cases', booking, theatre, facility)).rejects.toMatchObject(
      { status: 409 },
    );
    await post(
      'admissions/allocate',
      { admissionId, bedId: bed.id, version: '1' },
      admissions,
      facility,
    );
    const { id: caseId } = (await post('operation-theatre/cases', booking, theatre, facility)) as {
      id: string;
    };
    await expect(post('operation-theatre/cases', booking, theatre, facility)).rejects.toMatchObject(
      { status: 409 },
    );
    await expect(
      post('operation-theatre/cases', { ...booking, room: 'Theatre 2' }, theatre, facility),
    ).rejects.toMatchObject({ status: 409 });
    const { id: second } = (await post(
      'operation-theatre/cases',
      { ...booking, room: 'Theatre 2', startsAt: '09:00', endsAt: '10:00' },
      theatre,
      facility,
    )) as { id: string };
    const update = (id: string, version: string, action: string) =>
      patch('operation-theatre/cases/status', { caseId: id, version, action }, theatre, facility);
    await expect(update(caseId, '1', 'start')).rejects.toMatchObject({ status: 409 });
    await update(caseId, '1', 'ready');
    await expect(update(caseId, '1', 'start')).rejects.toMatchObject({ status: 409 });
    await update(caseId, '2', 'start');
    await update(caseId, '3', 'recovery');
    await update(second, '1', 'ready');
    await expect(update(second, '2', 'start')).rejects.toMatchObject({ status: 409 });
    const discharge = { admissionId, version: '2' };
    await expect(
      post('admissions/discharge', discharge, admissions, facility),
    ).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining('open theatre cases'),
    });
    expect(await db.beds.get(bed.id)).toMatchObject({ status: 'Occupied' });
    await update(caseId, '4', 'complete');
    await update(second, '2', 'cancel');
    await post('admissions/discharge', discharge, admissions, facility);
    const theatreView = (await get('operation-theatre?day=' + day, theatre, facility)) as Extract<
      AcuteView,
      { kind: 'operation-theatre' }
    >;
    expect(theatreView.cases.find((row) => row.id === caseId)).toMatchObject({
      status: 'Completed',
      version: 5,
    });
    expect(theatreView.cases.find((row) => row.id === second)).toMatchObject({
      status: 'Cancelled',
    });
    expect(theatreView.admissions).not.toContainEqual(expect.objectContaining({ id: admissionId }));
    await post('beds/release', { bedId: bed.id }, admissions, facility);
  }, 60_000);
});

describe('assigned inpatient care', () => {
  const facility = 'mer-central';
  const physicianPath = 'inpatient-physician';
  const nursePath = 'nursing-station';

  it('enforces assignment, facility, role and inpatient entitlement in ward queries', async () => {
    const [physician, nurse, cover, admissions] = await Promise.all([
      login('wardphysician'),
      login('wardnurse'),
      login('wardcover'),
      login('admissions'),
    ]);
    const list = (await get(physicianPath, physician, facility)) as WardWorklistRow[];
    expect(list.length).toBeGreaterThan(0);
    const id = list[0].admission.id;
    const detail = `${physicianPath}/detail?admissionId=${id}`;
    await expect(get(detail, physician, facility)).resolves.toHaveProperty('rounds');
    await expect(get(detail, cover, facility)).rejects.toMatchObject({ status: 404 });
    await expect(get(detail, physician, 'mer-north')).rejects.toMatchObject({ status: 404 });
    await expect(get(detail, nurse, facility)).rejects.toMatchObject({ status: 403 });
    await expect(get(nursePath, admissions, facility)).rejects.toMatchObject({ status: 403 });
    await expect(
      get('admissions/care-team?admissionId=' + id, physician, facility),
    ).rejects.toMatchObject({ status: 403 });
    const available = (await get(
      'admissions/care-team?admissionId=' + id,
      admissions,
      facility,
    )) as WardAssignmentOptions;
    expect(available.physicians.map((row) => row.account)).toContain('wardcover');
    expect(available.nurses.map((row) => row.account)).toContain('wardrelief');
    await db.facilities.update(facility, { inpatient: false });
    try {
      await expect(get(detail, physician, facility)).rejects.toMatchObject({ status: 403 });
      await expect(get(nursePath, nurse, facility)).rejects.toMatchObject({ status: 403 });
      await expect(
        post(`${physicianPath}/rounds`, { admissionId: id }, physician, facility),
      ).rejects.toMatchObject({ status: 403 });
    } finally {
      await db.facilities.update(facility, { inpatient: true });
    }
  });

  it('hands off ordered tasks, prevents discharge while open and keeps completion evidence through reassignment', async () => {
    const [physician, nurse, relief, admissions] = await Promise.all([
      login('wardphysician'),
      login('wardnurse'),
      login('wardrelief'),
      login('admissions'),
    ]);
    const patientId = 'TC-MERIDIAN-01001';
    const bed = (await db.beds
      .where('facilityId')
      .equals(facility)
      .filter((row) => row.status === 'Available')
      .first())!;
    const { id: admissionId } = (await post('admissions', { patientId }, admissions, facility)) as {
      id: string;
    };
    const roles = { physician: 'wardphysician', nurse: 'wardnurse' };
    await expect(
      patch(
        'admissions/care-team',
        { admissionId, admissionVersion: '1', assignmentVersion: '0', ...roles },
        admissions,
        facility,
      ),
    ).rejects.toMatchObject({ status: 409 });
    await post(
      'admissions/allocate',
      { admissionId, version: '1', bedId: bed.id },
      admissions,
      facility,
    );
    const registration = { admissionId, admissionVersion: '2', assignmentVersion: '0', ...roles };
    await expect(
      patch('admissions/care-team', { ...registration, nurse: 'reception' }, admissions, facility),
    ).rejects.toMatchObject({ status: 422 });
    await patch('admissions/care-team', registration, admissions, facility);
    await expect(
      patch('admissions/care-team', registration, admissions, facility),
    ).rejects.toMatchObject({ status: 409 });
    const versions = { admissionId, admissionVersion: '2', assignmentVersion: '1' };
    const readWard = (role: string, session: Session) =>
      get(`${role}/detail?admissionId=${admissionId}`, session, facility) as Promise<WardDetail>;
    await post(
      `${physicianPath}/rounds`,
      { ...versions, focus: 'Post-admission review', summary: 'Reviewed with the ward team' },
      physician,
      facility,
    );
    await expect(readWard(nursePath, relief)).rejects.toMatchObject({ status: 404 });
    const order = { ...versions, kind: 'Record ward observations' };
    await expect(post(`${physicianPath}/orders`, order, nurse, facility)).rejects.toMatchObject({
      status: 403,
    });
    await post(`${physicianPath}/orders`, order, physician, facility);
    await expect(post(`${physicianPath}/orders`, order, physician, facility)).rejects.toMatchObject(
      { status: 409 },
    );
    const pending = await readWard(nursePath, nurse);
    expect(pending.rounds[0]).toMatchObject({ focus: 'Post-admission review' });
    const taskId = pending.orders[0].task.id;
    const command = { ...versions, taskId, taskVersion: '1' };
    const discharge = { admissionId, version: '2' };
    await expect(
      post('admissions/discharge', discharge, admissions, facility),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      patch(`${nursePath}/tasks/complete`, { ...command, result: 'Recorded' }, nurse, facility),
    ).rejects.toMatchObject({ status: 409 });
    await patch(`${nursePath}/tasks/start`, command, nurse, facility);
    await expect(
      patch(
        `${physicianPath}/orders/cancel`,
        { ...command, taskVersion: '2' },
        physician,
        facility,
      ),
    ).rejects.toMatchObject({ status: 409 });
    await patch(
      'admissions/care-team',
      { ...versions, ...roles, nurse: 'wardrelief' },
      admissions,
      facility,
    );
    await expect(
      patch(
        `${nursePath}/tasks/complete`,
        { ...command, taskVersion: '2', result: 'Recorded' },
        nurse,
        facility,
      ),
    ).rejects.toMatchObject({ status: 404 });
    const current = { ...command, assignmentVersion: '2', taskVersion: '2' };
    await expect(
      patch(`${nursePath}/tasks/complete`, current, relief, facility),
    ).rejects.toMatchObject({ status: 422 });
    const outcomes = await Promise.allSettled([
      patch(
        `${nursePath}/tasks/complete`,
        { ...current, result: 'Physician review requested' },
        relief,
        facility,
      ),
      patch(
        `${nursePath}/tasks/complete`,
        { ...current, result: 'Physician review requested' },
        relief,
        facility,
      ),
    ]);
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes).toContainEqual(
      expect.objectContaining({
        status: 'rejected',
        reason: expect.objectContaining({ status: 409 }),
      }),
    );
    const complete = await readWard(physicianPath, physician);
    expect(complete.orders[0].task).toMatchObject({
      status: 'Completed',
      version: 3,
      updatedBy: 'Ishani Joshi',
    });
    expect(complete.observations).toMatchObject([
      { taskId, kind: 'Ward observations', result: 'Physician review requested' },
    ]);
    const [patient, cashier] = await Promise.all([login('patient'), login('cashier')]);
    const summaryPath = 'admissions/discharge-summary?admissionId=' + admissionId;
    const billingPath = 'billing/inpatient/detail?admissionId=' + admissionId;
    const invoicePath = 'billing/inpatient/invoices';
    const ownPortal = () => get('portal', patient, facility) as Promise<PatientPortal>;
    const draft = {
      ...versions,
      assignmentVersion: '2',
      planVersion: '0',
      destination: 'Home',
      course: 'Ward care reviewed',
      followUp: 'Arrange outpatient review',
    };
    const savePath = physicianPath + '/discharge-summary';
    await expect(
      post('admissions/discharge', discharge, admissions, facility),
    ).rejects.toMatchObject({ status: 409, message: expect.stringContaining('must sign') });
    await expect(post(savePath, draft, nurse, facility)).rejects.toMatchObject({ status: 403 });
    await expect(
      post(savePath, { ...draft, destination: 'invalid' }, physician, facility),
    ).rejects.toMatchObject({ status: 422 });
    await post(savePath, draft, physician, facility);
    expect((await readWard(physicianPath, physician)).dischargePlan).toMatchObject({
      status: 'Draft',
      version: 1,
    });
    expect((await readWard(nursePath, relief)).dischargePlan).toBeUndefined();
    await expect(get(summaryPath, admissions, facility)).rejects.toMatchObject({ status: 404 });
    const sign = { ...versions, assignmentVersion: '2', planVersion: '1' };
    await expect(
      patch(savePath + '/sign', { ...sign, planVersion: '0' }, physician, facility),
    ).rejects.toMatchObject({ status: 409 });
    await patch(savePath + '/sign', sign, physician, facility);
    await expect(
      post(savePath, { ...draft, planVersion: '2' }, physician, facility),
    ).rejects.toMatchObject({ status: 409 });
    expect((await ownPortal()).dischargeSummaries).not.toContainEqual(
      expect.objectContaining({ admissionId }),
    );
    await expect(get(billingPath, admissions, facility)).rejects.toMatchObject({ status: 403 });
    await expect(get(billingPath, cashier, 'mer-north')).rejects.toMatchObject({ status: 403 });
    await expect(get(billingPath, cashier, facility)).resolves.toMatchObject({
      status: 'Accruing',
    });
    await expect(post(invoicePath, { admissionId }, cashier, facility)).rejects.toMatchObject({
      status: 409,
    });
    await post('admissions/discharge', discharge, admissions, facility);
    const summary = (await get(summaryPath, admissions, facility)) as DischargeDocument;
    expect(summary).toMatchObject({
      admissionId,
      patientId,
      destination: 'Home',
      ward: bed.ward,
      bed: bed.label,
    });
    expect((await ownPortal()).dischargeSummaries).toContainEqual(summary);
    await expect(get(summaryPath, cashier, facility)).rejects.toMatchObject({ status: 403 });
    await expect(get(summaryPath, admissions, 'mer-north')).rejects.toMatchObject({ status: 403 });
    const account = (await get(billingPath, cashier, facility)) as InpatientBillingDetail;
    expect(account).toMatchObject({
      status: 'Ready to invoice',
      coverage: 'Full stay',
      chargeDays: 1,
    });
    expect(account.charges[0]).toMatchObject({ ward: bed.ward, bed: bed.label });
    const issues = await Promise.allSettled([
      post(invoicePath, { admissionId }, cashier, facility),
      post(invoicePath, { admissionId }, cashier, facility),
    ]);
    expect(issues.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(issues).toContainEqual(
      expect.objectContaining({
        status: 'rejected',
        reason: expect.objectContaining({ status: 409 }),
      }),
    );
    const invoice = (await db.invoices.where('admissionId').equals(admissionId).first())!;
    expect(invoice.encounterId).toBeUndefined();
    expect(invoiceTotal(invoice)).toBe(account.totalMinor);
    await post('billing/payments', { invoiceId: invoice.id }, cashier, facility);
    expect((await ownPortal()).invoices).toContainEqual(
      expect.objectContaining({ id: invoice.id, inpatient: true, balanceMinor: 0 }),
    );
    await db.facilities.update(facility, { inpatient: false });
    try {
      await expect(get('billing/inpatient', cashier, facility)).rejects.toMatchObject({
        status: 403,
      });
      await expect(post(invoicePath, { admissionId }, cashier, facility)).rejects.toMatchObject({
        status: 403,
      });
    } finally {
      await db.facilities.update(facility, { inpatient: true });
    }
    await expect(readWard(physicianPath, physician)).rejects.toMatchObject({ status: 409 });
    await expect(get(physicianPath, physician, facility)).resolves.not.toContainEqual(
      expect.objectContaining({ admission: expect.objectContaining({ id: admissionId }) }),
    );
    expect(await db.wardObservations.where('admissionId').equals(admissionId).count()).toBe(1);
    await post('beds/release', { bedId: bed.id }, admissions, facility);
  }, 60_000);
});

describe('inpatient billing for legacy stays', () => {
  it('requires acknowledgement before issuing a tracked-only invoice', async () => {
    const facility = 'mer-central';
    const [admissions, cashier] = await Promise.all([login('admissions'), login('cashier')]);
    const { id: admissionId } = (await post(
      'admissions',
      { patientId: 'TC-MERIDIAN-01199' },
      admissions,
      facility,
    )) as { id: string };
    const bed = (await db.beds
      .where('facilityId')
      .equals(facility)
      .filter((row) => row.status === 'Available')
      .first())!;
    await post(
      'admissions/allocate',
      { admissionId, version: '1', bedId: bed.id },
      admissions,
      facility,
    );
    await db.admissions.update(admissionId, { version: 3 });
    await db.bedStays.where('admissionId').equals(admissionId).modify({ partial: true });
    await post('admissions/discharge', { admissionId, version: '3' }, admissions, facility);
    const path = 'billing/inpatient/invoices';
    await expect(post(path, { admissionId }, cashier, facility)).rejects.toMatchObject({
      status: 422,
    });
    expect(await db.invoices.where('admissionId').equals(admissionId).count()).toBe(0);
    await post(path, { admissionId, acknowledgePartial: 'true' }, cashier, facility);
    await expect(
      get('billing/inpatient/detail?admissionId=' + admissionId, cashier, facility),
    ).resolves.toMatchObject({ status: 'Invoiced', coverage: 'Tracked segments only' });
    await post('beds/release', { bedId: bed.id }, admissions, facility);
  }, 60_000);
});

describe('consultation continuity', () => {
  const facility = 'mer-central';
  const patientId = 'TC-MERIDIAN-01001';
  const practitionerId = 'mer-central-DR-1';

  it('limits history to assigned care and keeps the returning-clinician hint free of clinical notes', async () => {
    const [clinician, reception, executive] = await Promise.all([
      login('clinician'),
      login('reception'),
      login('executive'),
    ]);
    const lookup = 'appointments/patient-context?patientId=' + patientId;
    const previous = (await get(lookup, reception, facility)) as BookingContext;
    expect(previous.recentClinician).toMatchObject({
      clinician: { id: expect.stringMatching(/^mer-central-DR-/) },
      signedAt: expect.any(Number),
    });
    expect(Object.keys(previous.recentClinician!).sort()).toEqual(['clinician', 'signedAt']);
    await expect(get(lookup, executive, facility)).rejects.toMatchObject({ status: 403 });
    await expect(get(lookup, reception, 'mer-north')).rejects.toMatchObject({ status: 403 });
    await expect(
      get('appointments/patient-context?patientId=TC-SUNRISE-01001', reception, facility),
    ).rejects.toMatchObject({ status: 404 });
    const other = await db.encounters
      .where('facilityId')
      .equals(facility)
      .filter((row) => row.practitionerId !== practitionerId && !!row.signedAt)
      .first();
    await expect(
      get('clinical/patient-context?encounterId=' + other!.id, clinician, facility),
    ).rejects.toMatchObject({ status: 403 });
    const own = await db.encounters
      .where('facilityId')
      .equals(facility)
      .filter((row) => row.practitionerId === practitionerId && !!row.signedAt)
      .first();
    const appointment = (await db.appointments.get(own!.appointmentId))!;
    const desk = (await get(
      `appointments?day=${appointment.day}&q=${appointment.patientId}`,
      reception,
      facility,
    )) as AppointmentPage;
    const visible = desk.items.find((row) => row.appointment.id === appointment.id);
    expect(visible).toBeDefined();
    expect(visible).not.toHaveProperty('encounter');
    await expect(
      get('clinical/patient-context?encounterId=' + own!.id, reception, facility),
    ).rejects.toMatchObject({ status: 403 });
    const context = (await get(
      'clinical/patient-context?encounterId=' + own!.id,
      clinician,
      facility,
    )) as ClinicalContinuity;
    expect(context.history.length).toBeLessThanOrEqual(12);
    for (const row of context.history) {
      expect(row.id).not.toBe(own!.id);
      expect(await db.encounters.get(row.id)).toMatchObject({
        facilityId: facility,
        patientId: own!.patientId,
        signedAt: expect.any(Number),
      });
    }
  });

  it('requests a follow-up after signing, claims it once across roles and reopens it after cancellation', async () => {
    const [clinician, reception, patient] = await Promise.all([
      login('clinician'),
      login('reception'),
      login('patient'),
    ]);
    const today = dayInIndia();
    const booking = (await post(
      'appointments',
      { patientId, practitionerId, day: today, time: '16:15' },
      reception,
      facility,
    )) as { id: string; pass: string };
    await post('queue/check-in', { pass: booking.pass }, reception, facility);
    await post('queue/call', { appointmentId: booking.id }, reception, facility);
    const { id: encounterId } = (await post(
      'clinical/start',
      { appointmentId: booking.id },
      clinician,
      facility,
    )) as { id: string };
    const startsOn = shiftDay(today, 7);
    const endsOn = shiftDay(today, 10);
    const fields = { encounterId, startsOn, endsOn, purpose: 'Review care plan' };
    await expect(post('clinical/follow-ups', fields, clinician, facility)).rejects.toMatchObject({
      status: 409,
    });
    await post(
      'clinical/complete',
      { appointmentId: booking.id, observation: 'Observation completed. Follow-up discussed.' },
      clinician,
      facility,
    );
    await expect(
      post('clinical/follow-ups', { ...fields, endsOn: today }, clinician, facility),
    ).rejects.toMatchObject({ status: 422 });
    const first = (await post('clinical/follow-ups', fields, clinician, facility)) as {
      id: string;
    };
    await expect(post('clinical/follow-ups', fields, clinician, facility)).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      patch(
        'clinical/follow-ups/withdraw',
        { followUpId: first.id, version: '0' },
        clinician,
        facility,
      ),
    ).rejects.toMatchObject({ status: 409 });
    await patch(
      'clinical/follow-ups/withdraw',
      { followUpId: first.id, version: '1' },
      clinician,
      facility,
    );
    const { id: followUpId } = (await post('clinical/follow-ups', fields, clinician, facility)) as {
      id: string;
    };
    const lookup = 'appointments/patient-context?patientId=' + patientId;
    const context = (await get(lookup, reception, facility)) as BookingContext;
    expect(context.recentClinician?.clinician.id).toBe(practitionerId);
    expect(context.followUps.find((item) => item.id === followUpId)).not.toHaveProperty('purpose');
    expect(
      ((await get('portal', patient, facility)) as PatientPortal).followUps.find(
        (item) => item.id === followUpId,
      ),
    ).toMatchObject({ status: 'To book', purpose: fields.purpose });
    const claim = { followUpId, version: '1', day: startsOn, time: '09:00' };
    await expect(
      post('portal/follow-ups/book', { ...claim, day: shiftDay(startsOn, -1) }, patient, facility),
    ).rejects.toMatchObject({ status: 422 });
    const results = await Promise.allSettled([
      post('portal/follow-ups/book', claim, patient, facility),
      post('appointments/follow-ups/book', { ...claim, patientId }, reception, facility),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results).toContainEqual(
      expect.objectContaining({
        status: 'rejected',
        reason: expect.objectContaining({ status: 409 }),
      }),
    );
    const linked = (await db.followUps.get(followUpId))!;
    const appointment = (await db.appointments.get(linked.appointmentId!))!;
    expect(appointment).toMatchObject({
      followUpId,
      day: startsOn,
      time: '09:00',
      patientId,
      practitionerId,
    });
    await expect(
      patch(
        'appointments/reschedule',
        {
          appointmentId: appointment.id,
          version: '0',
          practitionerId,
          day: shiftDay(endsOn, 1),
          time: '09:15',
        },
        reception,
        facility,
      ),
    ).rejects.toMatchObject({ status: 422 });
    await patch(
      'appointments/reschedule',
      { appointmentId: appointment.id, version: '0', practitionerId, day: endsOn, time: '09:15' },
      reception,
      facility,
    );
    expect(
      ((await get('portal', patient, facility)) as PatientPortal).followUps.find(
        (row) => row.id === followUpId,
      ),
    ).toMatchObject({ status: 'Booked', visit: { day: endsOn, time: '09:15' } });
    await patch(
      'appointments/cancel',
      { appointmentId: appointment.id, version: '1' },
      reception,
      facility,
    );
    const reopened = (
      (await get(
        'appointments/patient-context?patientId=' + patientId,
        reception,
        facility,
      )) as BookingContext
    ).followUps.find((row) => row.id === followUpId)!;
    expect(reopened).toMatchObject({ status: 'To book', version: 3 });
    expect(await db.appointments.get(appointment.id)).toMatchObject({
      status: 'Cancelled',
      followUpId,
    });
    await expect(post('portal/follow-ups/book', claim, patient, facility)).rejects.toMatchObject({
      status: 409,
    });
  }, 60_000);

  it('keeps another patient’s follow-up off the portal and denies identifier replay', async () => {
    const [clinician, patient] = await Promise.all([login('clinician'), login('patient')]);
    const encounter = await db.encounters
      .where('facilityId')
      .equals(facility)
      .filter(
        (row) =>
          row.patientId !== patientId && row.practitionerId === practitionerId && !!row.signedAt,
      )
      .first();
    const day = shiftDay(dayInIndia(), 5);
    const { id } = (await post(
      'clinical/follow-ups',
      { encounterId: encounter!.id, startsOn: day, endsOn: day, purpose: 'Review progress' },
      clinician,
      facility,
    )) as { id: string };
    expect(
      ((await get('portal', patient, facility)) as PatientPortal).followUps.map((row) => row.id),
    ).not.toContain(id);
    await expect(
      post(
        'portal/follow-ups/book',
        { followUpId: id, version: '1', day, time: '09:00' },
        patient,
        facility,
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
});

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
    const allocated = (await db.admissions
      .where('bedId')
      .equals(bed.id)
      .filter((row) => row.status === 'Admitted')
      .first())!;
    expect([first.id, second.id]).toContain(allocated.id);
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
  it('enforces schedule blocks on staff, portal and waitlist booking with scoped release', async () => {
    const [reception, executive, patient, clinician] = await Promise.all([
      login('reception'),
      login('executive'),
      login('patient'),
      login('clinician'),
    ]);
    const facility = 'mer-central';
    const day = shiftDay(dayInIndia(), 2);
    const entryFields = { patientId: 'TC-MERIDIAN-01001', practitionerId: 'mer-central-DR-1', day };
    const blockFields = {
      practitionerId: entryFields.practitionerId,
      day,
      start: '09:00',
      end: '09:15',
      reason: 'Clinician leave',
    };
    const appointmentFields = { ...entryFields, time: '09:00' };
    const view = (session: Session, selectedFacility = facility) =>
      get('scheduling?day=' + day, session, selectedFacility) as Promise<SchedulingDay>;
    const query = `?day=${day}&practitionerId=${entryFields.practitionerId}`;
    await expect(view(clinician)).rejects.toMatchObject({ status: 403 });
    await expect(view(reception, 'mer-north')).rejects.toMatchObject({ status: 403 });
    await expect(
      post('scheduling/exceptions', blockFields, reception, facility),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      post('scheduling/waitlist', entryFields, executive, facility),
    ).rejects.toMatchObject({ status: 403 });
    const { id: entryId } = (await post(
      'scheduling/waitlist',
      entryFields,
      reception,
      facility,
    )) as { id: string };
    await expect(
      post('scheduling/waitlist', entryFields, reception, facility),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      post('scheduling/exceptions', { ...blockFields, end: '09:07' }, executive, facility),
    ).rejects.toMatchObject({ status: 422 });
    const { id: exceptionId } = (await post(
      'scheduling/exceptions',
      blockFields,
      executive,
      facility,
    )) as { id: string };
    await expect(
      post('scheduling/exceptions', { ...blockFields, end: '09:30' }, executive, facility),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      get('appointments/availability' + query, reception, facility),
    ).resolves.not.toContain('09:00');
    await expect(get('portal/availability' + query, patient, facility)).resolves.not.toContain(
      '09:00',
    );
    await expect(get('portal/availability' + query, reception, facility)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      post('appointments', appointmentFields, reception, facility),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      post('portal/appointments', appointmentFields, patient, facility),
    ).rejects.toMatchObject({ status: 409 });
    const confirmed = (await post(
      'appointments',
      { ...entryFields, patientId: 'TC-MERIDIAN-01002', time: '09:15' },
      reception,
      facility,
    )) as { id: string };
    await expect(
      patch(
        'appointments/reschedule',
        { ...appointmentFields, appointmentId: confirmed.id, version: '0' },
        reception,
        facility,
      ),
    ).rejects.toMatchObject({ status: 409 });
    const booking = { entryId, version: '1', action: 'book', time: '09:00' };
    await expect(
      patch('scheduling/waitlist/status', booking, reception, facility),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      patch('scheduling/exceptions/release', { exceptionId }, executive, 'mer-north'),
    ).rejects.toMatchObject({ status: 404 });
    await patch('scheduling/exceptions/release', { exceptionId }, executive, facility);
    await expect(
      patch('scheduling/exceptions/release', { exceptionId }, executive, facility),
    ).rejects.toMatchObject({ status: 409 });
    const active = (await view(reception)).waitlist.find((row) => row.id === entryId)!;
    expect(active.availableTimes).toContain('09:00');
    expect(active.availableTimes).not.toContain('09:15');
    const commands = await Promise.allSettled([
      patch('scheduling/waitlist/status', booking, reception, facility),
      patch('scheduling/waitlist/status', booking, reception, facility),
    ]);
    expect(commands.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(commands).toContainEqual(
      expect.objectContaining({
        status: 'rejected',
        reason: expect.objectContaining({ status: 409 }),
      }),
    );
    const appointment = await db.appointments
      .where('[facilityId+practitionerId+day+time]')
      .equals([facility, entryFields.practitionerId, day, '09:00'])
      .toArray();
    expect(appointment).toHaveLength(1);
    expect(appointment[0]).toMatchObject({
      patientId: entryFields.patientId,
      status: 'Booked',
      pass: expect.any(String),
    });
    await expect(
      post('scheduling/exceptions', blockFields, executive, facility),
    ).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining('existing appointment'),
    });
    expect((await view(executive)).waitlist.find((row) => row.id === entryId)).toMatchObject({
      status: 'Booked',
      version: 2,
      bookedTime: '09:00',
    });
  });

  it('retains waitlist withdrawal history, denies expired requests and permits another request', async () => {
    const user = await login('reception');
    const facility = 'mer-central';
    const day = shiftDay(dayInIndia(), 3);
    const fields = { patientId: 'TC-MERIDIAN-01002', practitionerId: 'mer-central-DR-2', day };
    const { id } = (await post('scheduling/waitlist', fields, user, facility)) as { id: string };
    await patch(
      'scheduling/waitlist/status',
      { entryId: id, version: '1', action: 'withdraw' },
      user,
      facility,
    );
    const { id: nextId } = (await post('scheduling/waitlist', fields, user, facility)) as {
      id: string;
    };
    expect(nextId).not.toBe(id);
    const view = (await get('scheduling?day=' + day, user, facility)) as SchedulingDay;
    expect(view.waitlist.find((row) => row.id === id)?.status).toBe('Withdrawn');
    const yesterday = shiftDay(dayInIndia(), -1);
    await db.waitlist.update(nextId, { day: yesterday });
    const prior = (await get('scheduling?day=' + yesterday, user, facility)) as SchedulingDay;
    expect(prior.waitlist.find((row) => row.id === nextId)).toMatchObject({
      status: 'Expired',
      availableTimes: [],
    });
    await expect(
      patch(
        'scheduling/waitlist/status',
        { entryId: nextId, version: '1', action: 'book', time: '10:00' },
        user,
        facility,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

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

  it('receives batches once per reference and serializes supplier returns against on-hand stock', async () => {
    const facility = 'mer-central';
    const [pharmacist, cashier] = await Promise.all([login('pharmacy'), login('cashier')]);
    const receive = 'pharmacy/stock/receipts';
    const supplierReturn = 'pharmacy/stock/supplier-returns';
    const record = {
      productId: 'dressing',
      batch: 'demo-r42',
      expiresOn: shiftDay(dayInIndia(), 70),
      quantity: '3',
      reference: 'grn-9001',
    };
    await expect(post(receive, record, cashier, facility)).rejects.toMatchObject({ status: 403 });
    await expect(
      post(receive, { ...record, quantity: '3.5' }, pharmacist, facility),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      post(receive, { ...record, expiresOn: shiftDay(dayInIndia(), -1) }, pharmacist, facility),
    ).rejects.toMatchObject({ status: 422 });
    const outcomes = await Promise.allSettled([
      post(receive, record, pharmacist, facility),
      post(receive, { ...record, reference: 'GRN-9001' }, pharmacist, facility),
    ]);
    expect(outcomes.map((item) => item.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(outcomes).toContainEqual(
      expect.objectContaining({
        status: 'rejected',
        reason: expect.objectContaining({ status: 409 }),
      }),
    );
    await expect(
      post(
        receive,
        { ...record, reference: 'GRN-9002', expiresOn: shiftDay(record.expiresOn, 1) },
        pharmacist,
        facility,
      ),
    ).rejects.toMatchObject({ status: 409 });
    await post(
      receive,
      { ...record, reference: 'GRN-9002', batch: 'DEMO-R42', quantity: '2' },
      pharmacist,
      facility,
    );
    const feed = async () => (await get('pharmacy', pharmacist, facility)) as PharmacyData;
    const lot = (await feed()).lots.find((item) => item.batch === 'DEMO-R42')!;
    expect(lot).toMatchObject({ onHand: 5, quarantined: 0 });
    const correction = {
      lotId: lot.id,
      quantity: '4',
      reference: 'SR-8001',
      reason: 'Supplier recall',
    };
    await expect(
      post(supplierReturn, { ...correction, lotId: 'mer-north-dressing-1' }, pharmacist, facility),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      post(supplierReturn, { ...correction, reason: 'Other' }, pharmacist, facility),
    ).rejects.toMatchObject({ status: 422 });
    const returns = await Promise.allSettled([
      post(supplierReturn, correction, pharmacist, facility),
      post(supplierReturn, { ...correction, reference: 'SR-8002' }, pharmacist, facility),
    ]);
    expect(returns.map((item) => item.status).sort()).toEqual(['fulfilled', 'rejected']);
    const view = await feed();
    expect(view.lots.filter((row) => row.batch === lot.batch)).toMatchObject([
      { id: lot.id, onHand: 1 },
    ]);
    const ledger = view.activity
      .filter((row) => row.movement.lotId === lot.id)
      .map((row) => row.movement);
    expect(ledger).toHaveLength(3);
    expect(ledger).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'Received', quantity: 3, reference: 'GRN-9001' }),
        expect.objectContaining({ kind: 'Received', quantity: 2, reference: 'GRN-9002' }),
        expect.objectContaining({ kind: 'Supplier return', quantity: -4 }),
      ]),
    );
    await db.facilities.update(facility, { active: false });
    try {
      await expect(get('pharmacy', pharmacist, facility)).rejects.toMatchObject({ status: 403 });
      await expect(post(receive, record, pharmacist, facility)).rejects.toMatchObject({
        status: 403,
      });
    } finally {
      await db.facilities.update(facility, { active: true });
    }
  }, 90_000);

  it('quarantines patient returns and credits only the outstanding medication charge', async () => {
    const facility = 'mer-central';
    const patientId = 'TC-MERIDIAN-01001';
    const practitionerId = 'mer-central-DR-1';
    const [desk, clinician, pharmacist, cashier, patient] = await Promise.all(
      ['reception', 'clinician', 'pharmacy', 'cashier', 'patient'].map(login),
    );
    const day = dayInIndia();
    const times = (await get(
      'appointments/availability?practitionerId=' +
        practitionerId +
        '&day=' +
        day +
        '&patientId=' +
        patientId,
      desk,
      facility,
    )) as string[];
    const visit = (await post(
      'appointments',
      { patientId, practitionerId, day, time: times.at(-1)! },
      desk,
      facility,
    )) as { id: string; pass: string };
    await post('queue/check-in', { pass: visit.pass }, desk, facility);
    await post('queue/call', { appointmentId: visit.id }, desk, facility);
    const { id: encounterId } = (await post(
      'clinical/start',
      { appointmentId: visit.id },
      clinician,
      facility,
    )) as { id: string };
    const { id: prescriptionId } = (await post(
      'clinical/prescriptions',
      { encounterId, productId: 'hydration', quantity: '3' },
      clinician,
      facility,
    )) as { id: string };
    await post('clinical/prescriptions/sign', { prescriptionId }, clinician, facility);
    const path = 'pharmacy/medication-returns';
    const fields = {
      prescriptionId,
      quantity: '1',
      reference: 'PR-7001',
      reason: 'Unused medication returned',
    };
    await expect(post(path, fields, pharmacist, facility)).rejects.toMatchObject({ status: 409 });
    const lotId = 'mer-central-hydration-1';
    await post('pharmacy/dispense', { prescriptionId, lotId }, pharmacist, facility);
    const invoice = (await db.invoices.where('prescriptionId').equals(prescriptionId).first())!;
    const cashierInvoice = async () =>
      ((await get('billing?day=' + day, cashier, facility)) as InvoiceRow[]).find(
        (row) => row.invoice.id === invoice.id,
      );
    expect(await cashierInvoice()).toMatchObject({ totalMinor: 9600, balanceMinor: 9600 });
    const lotBefore = (await db.stockLots.get(lotId))!.onHand;
    await expect(
      post(path, { ...fields, quantity: '4' }, pharmacist, facility),
    ).rejects.toMatchObject({ status: 409 });
    await post(path, fields, pharmacist, facility);
    await expect(post(path, fields, pharmacist, facility)).rejects.toMatchObject({ status: 409 });
    expect(await cashierInvoice()).toMatchObject({
      totalMinor: 9600,
      balanceMinor: 6400,
      creditedMinor: 3200,
      reviewMinor: 0,
    });
    const portal = async () => (await get('portal', patient, facility)) as PatientPortal;
    expect((await portal()).medications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: prescriptionId, quantity: 3, returnedQuantity: 1 }),
      ]),
    );
    await post('billing/payments', { invoiceId: invoice.id }, cashier, facility);
    expect(await db.payments.where('invoiceId').equals(invoice.id).first()).toMatchObject({
      amountMinor: 6400,
    });
    const second = { ...fields, quantity: '2', reference: 'PR-7002' };
    const attempts = await Promise.allSettled([
      post(path, second, pharmacist, facility),
      post(path, { ...second, reference: 'PR-7003' }, pharmacist, facility),
    ]);
    expect(attempts.map((item) => item.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(await cashierInvoice()).toMatchObject({
      balanceMinor: 0,
      creditedMinor: 3200,
      reviewMinor: 6400,
    });
    const view = (await get('pharmacy', pharmacist, facility)) as PharmacyData;
    expect(view.lots.find((lot) => lot.id === lotId)).toMatchObject({
      onHand: lotBefore,
      quarantined: 3,
    });
    expect(
      view.prescriptions.find((row) => row.prescription.id === prescriptionId)?.returnedQuantity,
    ).toBe(3);
    expect((await portal()).invoices.find((row) => row.id === invoice.id)).toMatchObject({
      balanceMinor: 0,
      reviewMinor: 6400,
    });
    expect(await db.invoices.get(invoice.id)).toEqual(invoice);
    await expect(
      post('billing/payments', { invoiceId: invoice.id }, cashier, facility),
    ).rejects.toMatchObject({ status: 409 });
  }, 90_000);
});
