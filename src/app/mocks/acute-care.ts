import {
  arrivalModes,
  clinicalPriorities,
  criticalCareWard,
  procedureCategories,
  reviewFocuses,
  reviewOutcomes,
  theatreRooms,
  theatreTimes,
  type AcuteView,
  type EmergencyCase,
  type TheatreCase,
} from '../domain/acute-care';
import {
  dayInIndia,
  type DomainEvent,
  type Facility,
  type Patient,
  type Session,
} from '../domain/operations';
import { ApiError } from './access';
import { accountNames } from './accounts';
import { ongoingAdmission, patientAt, requestAdmission } from './admission-records';
import { db } from './database';
import { checkedDay } from './queries';
import { bookingDay } from './scheduling';
import { currentlyAdmitted } from './ward-care';

function summary(patient: Pick<Patient, 'id' | 'name'>) {
  return { id: patient.id, name: patient.name };
}

function field(body: Record<string, unknown>, key: string) {
  const value = body[key];
  if (typeof value !== 'string' || !value || value.length > 100)
    throw new ApiError(422, 'Enter a valid ' + key + '.');
  return value;
}

export async function emergencyPatients(facility: Facility, query: string) {
  const search = query.trim().toLowerCase().slice(0, 100);
  const patients = await db.patients
    .where('tenantId')
    .equals(facility.tenantId)
    .filter((row) => (row.name + ' ' + row.id).toLowerCase().includes(search))
    .limit(35)
    .toArray();
  return patients.map(summary);
}

export async function emergencyView(facility: Facility): Promise<AcuteView> {
  const cases = await db.emergencyCases.where('facilityId').equals(facility.id).toArray();
  cases.sort((a, b) => b.arrivedAt - a.arrivedAt);
  const [patients, admissions] = await Promise.all([
    db.patients.bulkGet(cases.map((row) => row.patientId)),
    db.admissions.bulkGet(cases.map((row) => row.admissionId ?? '')),
  ]);
  return {
    kind: 'emergency',
    cases: cases.flatMap(
      ({ facilityId: _, patientId, admissionId: _admission, assessedBy, ...visit }, i) => {
        const patient = patients[i];
        if (patient?.tenantId !== facility.tenantId) return [];
        const admission = admissions[i];
        const admissionStatus =
          admission?.facilityId === facility.id && admission.patientId === patientId
            ? admission.status
            : undefined;
        return [
          {
            ...visit,
            patient: summary(patient),
            assessedBy: assessedBy ? accountNames[assessedBy] : undefined,
            admissionStatus,
          },
        ];
      },
    ),
  };
}

async function activeAdmissions(facility: Facility) {
  const admissions = await db.admissions
    .where('facilityId')
    .equals(facility.id)
    .filter((row) => row.status === 'Admitted')
    .toArray();
  const [patients, beds] = await Promise.all([
    db.patients.bulkGet(admissions.map((row) => row.patientId)),
    db.beds.bulkGet(admissions.map((row) => row.bedId ?? '')),
  ]);
  return admissions.flatMap((admission, i) => {
    const patient = patients[i];
    const bed = beds[i];
    return patient?.tenantId === facility.tenantId &&
      bed?.facilityId === facility.id &&
      bed.status === 'Occupied'
      ? [{ admission, patient: summary(patient), bed }]
      : [];
  });
}

export async function criticalCareView(facility: Facility): Promise<AcuteView> {
  const [beds, admissions, stepDowns] = await Promise.all([
    db.beds
      .where('facilityId')
      .equals(facility.id)
      .filter((row) => row.ward === criticalCareWard)
      .toArray(),
    activeAdmissions(facility),
    db.icuStepDowns
      .where('facilityId')
      .equals(facility.id)
      .filter((row) => row.status === 'Requested')
      .toArray(),
  ]);
  const census = admissions.filter((row) => row.bed.ward === criticalCareWard);
  const ids = census.map((row) => row.admission.id);
  const reviews = await db.icuReviews
    .where('admissionId')
    .anyOf(ids)
    .filter((row) => row.facilityId === facility.id)
    .toArray();
  const pending = new Map(stepDowns.map((row) => [row.admissionId, row.requestedAt]));
  return {
    kind: 'critical-care',
    occupied: beds.filter((bed) => bed.status === 'Occupied').length,
    available: beds.filter((bed) => bed.status === 'Available').length,
    patients: census
      .sort((a, b) => a.bed.label.localeCompare(b.bed.label))
      .map(({ admission, patient, bed }) => ({
        admissionId: admission.id,
        version: admission.version,
        patient,
        bed: bed.label,
        stepDownRequestedAt: pending.get(admission.id),
        reviews: reviews
          .filter((review) => review.admissionId === admission.id)
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, 8)
          .map(({ id, actor, focus, outcome, createdAt }) => ({
            id,
            actor: accountNames[actor],
            focus,
            outcome,
            createdAt,
          })),
      })),
  };
}

export async function theatreView(facility: Facility, value: string | null): Promise<AcuteView> {
  const day = checkedDay(value);
  const [cases, admitted] = await Promise.all([
    db.theatreCases.where('[facilityId+day]').equals([facility.id, day]).toArray(),
    activeAdmissions(facility),
  ]);
  const admissions = await db.admissions.bulkGet(cases.map((row) => row.admissionId));
  const patients = await db.patients.bulkGet(
    admissions.map((row) => (row?.facilityId === facility.id ? row.patientId : '')),
  );
  return {
    kind: 'operation-theatre',
    cases: cases
      .flatMap(({ facilityId: _, admissionId: _admission, changedBy, ...row }, i) => {
        const patient = patients[i];
        return patient?.tenantId === facility.tenantId
          ? [{ ...row, patient: summary(patient), changedBy: accountNames[changedBy] }]
          : [];
      })
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.room.localeCompare(b.room)),
    admissions: admitted
      .map(({ admission, patient, bed }) => ({ id: admission.id, patient, bed: bed.label }))
      .sort((a, b) => a.patient.name.localeCompare(b.patient.name)),
  };
}

function createEvent(facility: Facility, session: Session, now: number) {
  return (type: DomainEvent['type'], entityId: string): DomainEvent => ({
    type,
    entityId,
    occurredAt: now,
    facilityId: facility.id,
    actor: session.account,
  });
}

export async function emergencyCommand(
  path: string,
  facility: Facility,
  session: Session,
  body: Record<string, unknown>,
) {
  const now = Date.now();
  const event = createEvent(facility, session, now);
  if (path === 'emergency/arrivals') {
    const patient = await patientAt(facility, field(body, 'patientId'));
    const arrival = arrivalModes.find((value) => value === body['arrival']);
    if (!arrival) throw new ApiError(422, 'Choose an arrival mode.');
    if (await ongoingAdmission(facility, patient.id))
      throw new ApiError(409, 'This patient has an active admission at this facility.');
    const prior = await db.emergencyCases
      .where('[facilityId+patientId]')
      .equals([facility.id, patient.id])
      .filter((visit) => visit.status === 'Awaiting assessment' || visit.status === 'Under care')
      .first();
    if (prior)
      throw new ApiError(409, 'An active emergency visit is already open for this patient.');
    const id = crypto.randomUUID();
    await db.emergencyCases.add({
      id,
      facilityId: facility.id,
      patientId: patient.id,
      arrival,
      arrivedAt: now,
      status: 'Awaiting assessment',
      version: 1,
    });
    return event('EmergencyArrivalRecorded', id);
  }
  const record = await db.emergencyCases.get(field(body, 'caseId'));
  if (record?.facilityId !== facility.id) throw new ApiError(404, 'Emergency visit not found.');
  if (String(record.version) !== body['version'])
    throw new ApiError(409, 'The emergency visit changed. Refresh and try again.');
  const next: Partial<EmergencyCase> = { version: record.version + 1 };
  if (
    body['action'] === 'assess' &&
    ['Awaiting assessment', 'Under care'].includes(record.status)
  ) {
    const priority = clinicalPriorities.find((value) => value === body['priority']);
    if (!priority) throw new ApiError(422, 'Record the clinician-assigned priority.');
    await db.emergencyCases.update(record.id, {
      ...next,
      status: 'Under care',
      priority,
      assessedBy: session.account,
    });
    return event('EmergencyAssessmentRecorded', record.id);
  }
  if (record.status === 'Under care' && body['action'] === 'admit') {
    const admissionId = await requestAdmission(facility, record.patientId, now);
    await db.emergencyCases.update(record.id, {
      ...next,
      status: 'Admission requested',
      admissionId,
    });
    return event('EmergencyAdmissionRequested', record.id);
  }
  if (record.status === 'Under care' && body['action'] === 'close') {
    await db.emergencyCases.update(record.id, { ...next, status: 'Closed' });
    return event('EmergencyVisitClosed', record.id);
  }
  throw new ApiError(409, 'This action is unavailable for the current emergency visit.');
}

export async function criticalCareCommand(
  path: string,
  facility: Facility,
  session: Session,
  body: Record<string, unknown>,
) {
  const id = field(body, 'admissionId');
  const record = await currentlyAdmitted(facility, id);
  if (record.bed.ward !== criticalCareWard)
    throw new ApiError(404, 'Admission is outside the critical care census.');
  if (String(record.admission.version) !== body['version'])
    throw new ApiError(409, 'The admission changed. Refresh the ICU census.');
  const now = Date.now();
  const event = createEvent(facility, session, now);
  const entryId = crypto.randomUUID();
  if (path === 'critical-care/reviews') {
    const focus = reviewFocuses.find((value) => value === body['focus']);
    const outcome = reviewOutcomes.find((value) => value === body['outcome']);
    if (!focus || !outcome) throw new ApiError(422, 'Choose a review focus and outcome.');
    await db.icuReviews.add({
      id: entryId,
      facilityId: facility.id,
      admissionId: id,
      createdAt: now,
      actor: session.account,
      focus,
      outcome,
    });
    return event('IcuReviewRecorded', entryId);
  }
  const pending = await db.icuStepDowns
    .where('admissionId')
    .equals(id)
    .filter((row) => row.facilityId === facility.id && row.status === 'Requested')
    .first();
  if (pending)
    throw new ApiError(409, 'A step-down request is already pending for this admission.');
  await db.icuStepDowns.add({
    id: entryId,
    facilityId: facility.id,
    admissionId: id,
    requestedAt: now,
    requestedBy: session.account,
    status: 'Requested',
  });
  return event('IcuStepDownRequested', entryId);
}

function theatreStatus(
  previous: TheatreCase['status'],
  action: unknown,
): TheatreCase['status'] | undefined {
  if (previous === 'Scheduled' && action === 'ready') return 'Ready';
  if (previous === 'Ready' && action === 'start') return 'In theatre';
  if (previous === 'In theatre' && action === 'recovery') return 'Recovery';
  if (previous === 'Recovery' && action === 'complete') return 'Completed';
  if ((previous === 'Scheduled' || previous === 'Ready') && action === 'cancel') return 'Cancelled';
  return undefined;
}

export async function theatreCommand(
  path: string,
  facility: Facility,
  session: Session,
  body: Record<string, unknown>,
) {
  const now = Date.now();
  const event = createEvent(facility, session, now);
  if (path === 'operation-theatre/cases') {
    const admissionId = field(body, 'admissionId');
    const { patient } = await currentlyAdmitted(facility, admissionId);
    const day = bookingDay(field(body, 'day'));
    const room = theatreRooms.find((item) => item === body['room']);
    const category = procedureCategories.find((item) => item === body['category']);
    const startsAt = field(body, 'startsAt');
    const endsAt = field(body, 'endsAt');
    if (
      !room ||
      !category ||
      !theatreTimes.includes(startsAt) ||
      !theatreTimes.includes(endsAt) ||
      startsAt >= endsAt
    ) {
      throw new ApiError(422, 'Choose a theatre, category and valid booking interval.');
    }
    const patientAdmissions = new Set(
      await db.admissions
        .where('[facilityId+patientId]')
        .equals([facility.id, patient.id])
        .primaryKeys(),
    );
    const overlap = await db.theatreCases
      .where('[facilityId+day]')
      .equals([facility.id, day])
      .filter(
        (record) =>
          record.status !== 'Cancelled' &&
          (record.room === room || patientAdmissions.has(record.admissionId)) &&
          record.startsAt < endsAt &&
          record.endsAt > startsAt,
      )
      .first();
    if (overlap)
      throw new ApiError(409, 'The theatre or the patient is already booked during that interval.');
    const id = crypto.randomUUID();
    await db.theatreCases.add({
      id,
      facilityId: facility.id,
      admissionId,
      day,
      room,
      category,
      startsAt,
      endsAt,
      status: 'Scheduled',
      version: 1,
      changedAt: now,
      changedBy: session.account,
    });
    return event('TheatreCaseBooked', id);
  }
  const record = await db.theatreCases.get(field(body, 'caseId'));
  if (record?.facilityId !== facility.id) throw new ApiError(404, 'Theatre case not found.');
  if (String(record.version) !== body['version'])
    throw new ApiError(409, 'The theatre case changed. Refresh and try again.');
  await currentlyAdmitted(facility, record.admissionId);
  const status = theatreStatus(record.status, body['action']);
  if (!status) throw new ApiError(409, 'This action is unavailable for the current theatre stage.');
  if (status === 'In theatre') {
    if (record.day !== dayInIndia(now))
      throw new ApiError(409, 'Start the case on its booked date.');
    const [roomBusy, patientBusy] = await Promise.all([
      db.theatreCases
        .where('facilityId')
        .equals(facility.id)
        .filter((row) => row.room === record.room && row.status === 'In theatre')
        .first(),
      db.theatreCases
        .where('admissionId')
        .equals(record.admissionId)
        .filter(
          (row) =>
            row.facilityId === facility.id && ['In theatre', 'Recovery'].includes(row.status),
        )
        .first(),
    ]);
    if (roomBusy || patientBusy)
      throw new ApiError(409, 'The theatre or patient is still committed to another case.');
  }
  await db.theatreCases.update(record.id, {
    status,
    version: record.version + 1,
    changedAt: now,
    changedBy: session.account,
  });
  return event('TheatreCaseStatusChanged', record.id);
}
