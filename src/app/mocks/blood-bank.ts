import {
  bloodComponents,
  openBloodRequest,
  type BloodBankView,
  type BloodRequest,
} from '../domain/blood-bank';
import { dayInIndia, type DomainEvent, type Facility, type Session } from '../domain/operations';
import { ApiError } from './access';
import { db } from './database';
import { assignedPatient, currentlyAdmitted } from './ward-care';

export async function bloodBankView(facility: Facility): Promise<BloodBankView> {
  const [requests, stock] = await Promise.all([
    db.bloodRequests.where('facilityId').equals(facility.id).toArray(),
    db.bloodUnits.where('facilityId').equals(facility.id).toArray(),
  ]);
  const [patients, admissions] = await Promise.all([
    db.patients.bulkGet(requests.map((row) => row.patientId)),
    db.admissions.bulkGet(requests.map((row) => row.admissionId)),
  ]);
  const today = dayInIndia();
  const unitsById = new Map(stock.map((unit) => [unit.id, unit]));
  return {
    requests: requests
      .flatMap((request, i) => {
        const patient = patients[i];
        const admission = admissions[i];
        if (
          patient?.tenantId !== facility.tenantId ||
          admission?.facilityId !== facility.id ||
          admission.patientId !== patient.id
        )
          return [];
        const unit = request.unitId ? unitsById.get(request.unitId) : undefined;
        return [
          {
            request,
            patient: { id: patient.id, name: patient.name },
            unitCode: unit?.code,
            reservedUnitExpired: request.status === 'Reserved' && unit && unit.expiresOn < today,
          },
        ];
      })
      .sort((a, b) => b.request.changedAt - a.request.changedAt),
    units: stock.map((unit) => ({
      ...unit,
      expired: unit.expiresOn < today,
      status: unit.status === 'Available' && unit.expiresOn < today ? 'Expired' : unit.status,
    })),
  };
}

export async function wardBloodCommand(
  facility: Facility,
  session: Session,
  body: Record<string, unknown>,
  cancel: boolean,
): Promise<DomainEvent> {
  const id = body['admissionId'];
  if (typeof id !== 'string' || !id) throw new ApiError(422, 'Choose an admission.');
  const { admission, patient, assignment } = await assignedPatient(
    facility,
    session,
    'inpatient-physician',
    id,
  );
  if (
    body['admissionVersion'] !== String(admission.version) ||
    body['assignmentVersion'] !== String(assignment.version)
  )
    throw new ApiError(409, 'The admission or care team changed. Reopen the current admission.');
  const now = Date.now();
  let requestId: string;
  if (cancel) {
    const request =
      typeof body['requestId'] === 'string'
        ? await db.bloodRequests.get(body['requestId'])
        : undefined;
    if (
      request?.facilityId !== facility.id ||
      request.admissionId !== id ||
      request.patientId !== patient.id
    )
      throw new ApiError(404, 'Blood component request not found.');
    if (request.status !== 'Requested' || body['version'] !== String(request.version))
      throw new ApiError(409, 'Only a request awaiting review can be withdrawn here.');
    await db.bloodRequests.update(request.id, {
      status: 'Cancelled',
      changedAt: now,
      version: request.version + 1,
    });
    requestId = request.id;
  } else {
    const component = bloodComponents.find((entry) => entry === body['component']);
    if (!component) throw new ApiError(422, 'Choose a blood component.');
    const existing = await db.bloodRequests
      .where('admissionId')
      .equals(id)
      .filter(
        (row) =>
          row.facilityId === facility.id && row.component === component && openBloodRequest(row),
      )
      .first();
    if (existing) throw new ApiError(409, 'An open request already exists for this component.');
    requestId = crypto.randomUUID();
    await db.bloodRequests.add({
      id: requestId,
      facilityId: facility.id,
      patientId: patient.id,
      admissionId: id,
      component,
      status: 'Requested',
      version: 1,
      requestedAt: now,
      requestedBy: session.account,
      changedAt: now,
    });
  }
  return {
    type: cancel ? 'BloodRequestUpdated' : 'BloodComponentRequested',
    entityId: requestId,
    facilityId: facility.id,
    occurredAt: now,
    actor: session.account,
  };
}

export async function updateBloodRequest(
  facility: Facility,
  session: Session,
  body: Record<string, unknown>,
): Promise<DomainEvent> {
  const id = body['requestId'];
  const request = typeof id === 'string' ? await db.bloodRequests.get(id) : undefined;
  if (request?.facilityId !== facility.id)
    throw new ApiError(404, 'Blood component request not found.');
  if (body['version'] !== String(request.version))
    throw new ApiError(409, 'The request changed. Reopen the current request.');
  const { patient } = await currentlyAdmitted(facility, request.admissionId);
  if (patient.id !== request.patientId)
    throw new ApiError(404, 'Blood component request not found.');
  const now = Date.now();
  const today = dayInIndia(now);
  const next: Partial<BloodRequest> = { changedAt: now, version: request.version + 1 };
  switch (body['action']) {
    case 'reserve': {
      if (request.status !== 'Requested')
        throw new ApiError(409, 'Only a request awaiting review can reserve a unit.');
      if (body['review'] !== 'recorded')
        throw new ApiError(422, 'Record the compatibility review before reserving a unit.');
      const unitId = body['unitId'];
      const unit = typeof unitId === 'string' ? await db.bloodUnits.get(unitId) : undefined;
      if (unit?.facilityId !== facility.id || unit.component !== request.component)
        throw new ApiError(404, 'No matching component unit was found at this facility.');
      if (unit.status !== 'Available' || unit.requestId || unit.expiresOn < today)
        throw new ApiError(409, 'This unit is expired or no longer available.');
      await db.bloodUnits.update(unit.id, { status: 'Reserved', requestId: request.id });
      Object.assign(next, {
        status: 'Reserved',
        unitId: unit.id,
        review: 'Recorded',
        reviewedAt: now,
        reviewedBy: session.account,
      });
      break;
    }
    case 'decline':
      if (request.status !== 'Requested')
        throw new ApiError(409, 'Only a request awaiting review can be declined.');
      Object.assign(next, {
        status: 'Declined',
        review: 'Declined',
        reviewedAt: now,
        reviewedBy: session.account,
      });
      break;
    case 'issue':
    case 'cancel': {
      if (request.status !== 'Reserved' || !request.unitId || request.review !== 'Recorded')
        throw new ApiError(409, 'This request has no verified unit reservation.');
      const unit = await db.bloodUnits.get(request.unitId);
      if (
        unit?.facilityId !== facility.id ||
        unit.component !== request.component ||
        unit.status !== 'Reserved' ||
        unit.requestId !== request.id
      )
        throw new ApiError(409, 'The reserved unit could not be verified.');
      if (body['action'] === 'issue') {
        if (unit.expiresOn < today)
          throw new ApiError(409, 'An expired unit cannot be issued. Release this reservation.');
        await db.bloodUnits.update(unit.id, { status: 'Issued' });
        Object.assign(next, { status: 'Issued', issuedAt: now });
      } else {
        await db.bloodUnits.update(unit.id, { status: 'Available', requestId: undefined });
        next.status = 'Cancelled';
      }
      break;
    }
    default:
      throw new ApiError(422, 'Choose a blood bank action.');
  }
  await db.bloodRequests.update(request.id, next);
  return {
    type: 'BloodRequestUpdated',
    entityId: request.id,
    facilityId: facility.id,
    occurredAt: now,
    actor: session.account,
  };
}
