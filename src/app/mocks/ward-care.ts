import type { Admission, Bed, DomainEvent, Facility, Patient, Session } from '../domain/operations';
import {
  observationKinds,
  observationResults,
  roundFocuses,
  roundSummaries,
  wardOrderCatalogue,
  type NursingTask,
  type WardAssignment,
  type WardAssignmentOptions,
  type WardDetail,
  type WardPatient,
  type WardRole,
  type WardWorklistRow,
} from '../domain/ward-care';
import { ApiError } from './access';
import { accountNames, membershipId } from './accounts';
import { db } from './database';

function patientProjection(
  facility: Facility,
  admission: Admission | undefined,
  patient?: Patient,
  bed?: Bed,
): WardPatient | undefined {
  if (
    admission?.facilityId !== facility.id ||
    admission.status !== 'Admitted' ||
    patient?.id !== admission.patientId ||
    patient.tenantId !== facility.tenantId ||
    bed?.id !== admission.bedId ||
    bed?.facilityId !== facility.id ||
    bed.status !== 'Occupied'
  )
    return undefined;
  return {
    admission: { id: admission.id, admittedAt: admission.admittedAt, version: admission.version },
    patient: { id: patient.id, name: patient.name, initials: patient.initials },
    bed: { label: bed.label, ward: bed.ward },
  };
}

function ownsAssignment(
  assignment: WardAssignment | undefined,
  facility: Facility,
  account: string,
  role: WardRole,
) {
  return (
    assignment?.facilityId === facility.id &&
    assignment[role === 'inpatient-physician' ? 'physician' : 'nurse'] === account
  );
}

export function openTask(task: NursingTask) {
  return task.status === 'Pending' || task.status === 'In progress';
}

export async function wardWorklist(
  facility: Facility,
  session: Session,
  role: WardRole,
): Promise<WardWorklistRow[]> {
  const assignments = await db.wardAssignments
    .where('facilityId')
    .equals(facility.id)
    .filter((row) => ownsAssignment(row, facility, session.account, role))
    .toArray();
  const ids = assignments.map((row) => row.admissionId);
  const admissions = (await db.admissions.bulkGet(ids)).filter(
    (row): row is Admission => row?.facilityId === facility.id && row.status === 'Admitted',
  );
  const [patients, beds, tasks] = await Promise.all([
    db.patients.bulkGet(admissions.map((row) => row.patientId)),
    db.beds.bulkGet(admissions.map((row) => row.bedId ?? '')),
    db.nursingTasks
      .where('admissionId')
      .anyOf(ids)
      .filter((row) => row.facilityId === facility.id)
      .toArray(),
  ]);
  return admissions
    .flatMap((row, index) => {
      const patient = patientProjection(facility, row, patients[index], beds[index]);
      if (!patient) return [];
      const patientTasks = tasks.filter((task) => task.admissionId === row.id);
      return [
        {
          ...patient,
          openTasks: patientTasks.filter(openTask).length,
          completedTasks: patientTasks.filter((task) => task.status === 'Completed').length,
        },
      ];
    })
    .sort((a, b) => a.bed.ward.localeCompare(b.bed.ward) || a.bed.label.localeCompare(b.bed.label));
}

async function currentlyAdmitted(facility: Facility, id: string) {
  const admission = await db.admissions.get(id);
  if (admission?.facilityId !== facility.id)
    throw new ApiError(404, 'Admission not found at this facility.');
  if (admission.status !== 'Admitted')
    throw new ApiError(409, 'This admission is no longer active.');
  const [patient, bed] = await Promise.all([
    db.patients.get(admission.patientId),
    db.beds.get(admission.bedId ?? ''),
  ]);
  const projected = patientProjection(facility, admission, patient, bed);
  if (!projected) throw new ApiError(409, 'The patient and occupied bed could not be verified.');
  return projected;
}

async function assignedPatient(facility: Facility, session: Session, role: WardRole, id: string) {
  const assignment = await db.wardAssignments.get(id);
  if (!assignment || !ownsAssignment(assignment, facility, session.account, role))
    throw new ApiError(404, 'This admission is unavailable in your assigned worklist.');
  return { ...(await currentlyAdmitted(facility, id)), assignment };
}

export async function wardDetail(
  facility: Facility,
  session: Session,
  role: WardRole,
  id: string,
): Promise<WardDetail> {
  const { assignment, ...patient } = await assignedPatient(facility, session, role, id);
  const [orders, tasks, rounds, observations] = await Promise.all([
    db.wardOrders
      .where('admissionId')
      .equals(id)
      .filter((row) => row.facilityId === facility.id)
      .toArray(),
    db.nursingTasks
      .where('admissionId')
      .equals(id)
      .filter((row) => row.facilityId === facility.id)
      .toArray(),
    db.wardRounds
      .where('admissionId')
      .equals(id)
      .filter((row) => row.facilityId === facility.id)
      .toArray(),
    db.wardObservations
      .where('admissionId')
      .equals(id)
      .filter((row) => row.facilityId === facility.id)
      .toArray(),
  ]);
  const taskByOrder = new Map(tasks.map((item) => [item.orderId, item]));
  return {
    ...patient,
    team: {
      physician: accountNames[assignment.physician],
      nurse: accountNames[assignment.nurse],
      version: assignment.version,
    },
    orders: orders
      .sort((a, b) => b.createdAt - a.createdAt)
      .flatMap((order) => {
        const task = taskByOrder.get(order.id);
        return task
          ? [
              {
                id: order.id,
                kind: order.kind,
                physician: accountNames[order.actor],
                orderedAt: order.createdAt,
                task: {
                  id: task.id,
                  status: task.status,
                  version: task.version,
                  updatedAt: task.updatedAt,
                  updatedBy: accountNames[task.updatedBy],
                },
              },
            ]
          : [];
      }),
    rounds: rounds
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(({ id, focus, summary, createdAt, actor }) => ({
        id,
        focus,
        summary,
        createdAt,
        actor: accountNames[actor],
      })),
    observations: observations
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(({ id, kind, result, createdAt, actor, taskId }) => ({
        id,
        kind,
        result,
        createdAt,
        actor: accountNames[actor],
        taskId,
      })),
  };
}

export async function wardAssignmentOptions(
  facility: Facility,
  id: string,
): Promise<WardAssignmentOptions> {
  await currentlyAdmitted(facility, id);
  const [members, assignment] = await Promise.all([
    db.memberships
      .where('facilityId')
      .equals(facility.id)
      .filter((row) => row.active)
      .toArray(),
    db.wardAssignments.get(id),
  ]);
  const directory = (role: 'wardPhysician' | 'wardNurse') =>
    members
      .filter((member) => member.role === role && Object.hasOwn(accountNames, member.account))
      .map(({ account }) => ({ account, name: accountNames[account] }))
      .sort((a, b) => a.name.localeCompare(b.name));
  return {
    physicians: directory('wardPhysician'),
    nurses: directory('wardNurse'),
    assignment:
      assignment?.facilityId === facility.id
        ? { physician: assignment.physician, nurse: assignment.nurse, version: assignment.version }
        : null,
  };
}

function field(body: Record<string, unknown>, key: string) {
  const value = body[key];
  if (typeof value !== 'string' || !value || value.length > 100)
    throw new ApiError(422, 'Enter a valid ' + key + '.');
  return value;
}

export async function assignWardTeam(facility: Facility, body: Record<string, unknown>) {
  const id = field(body, 'admissionId');
  const { admission } = await currentlyAdmitted(facility, id);
  const physician = field(body, 'physician');
  const nurse = field(body, 'nurse');
  const [assignment, physicianGrant, nurseGrant] = await Promise.all([
    db.wardAssignments.get(id),
    db.memberships.get(membershipId(physician, facility.id)),
    db.memberships.get(membershipId(nurse, facility.id)),
  ]);
  if (
    body['admissionVersion'] !== String(admission.version) ||
    body['assignmentVersion'] !== String(assignment?.version ?? 0)
  ) {
    throw new ApiError(409, 'The admission or care team changed. Reload and try again.');
  }
  if (
    !physicianGrant?.active ||
    physicianGrant.role !== 'wardPhysician' ||
    !nurseGrant?.active ||
    nurseGrant.role !== 'wardNurse'
  ) {
    throw new ApiError(
      422,
      'Choose an active inpatient physician and ward nurse at this facility.',
    );
  }
  if (assignment?.nurse === nurse && assignment.physician === physician)
    throw new ApiError(409, 'This care team is already assigned.');
  await db.wardAssignments.put({
    admissionId: id,
    facilityId: facility.id,
    physician,
    nurse,
    version: (assignment?.version ?? 0) + 1,
  });
  return id;
}

export async function wardCareCommand(
  path: string,
  facility: Facility,
  session: Session,
  role: WardRole,
  body: Record<string, unknown>,
): Promise<DomainEvent> {
  const admissionId = field(body, 'admissionId');
  const { admission, assignment } = await assignedPatient(facility, session, role, admissionId);
  if (
    body['admissionVersion'] !== String(admission.version) ||
    body['assignmentVersion'] !== String(assignment.version)
  ) {
    throw new ApiError(
      409,
      'The bed or care team changed. Reopen the current admission before recording care.',
    );
  }
  const now = Date.now();
  const base = { facilityId: facility.id, admissionId, actor: session.account, createdAt: now };
  const event = (type: DomainEvent['type'], entityId: string): DomainEvent => ({
    type,
    entityId,
    facilityId: facility.id,
    occurredAt: now,
    actor: session.account,
  });
  if (path === 'inpatient-physician/rounds') {
    const focus = roundFocuses.find((value) => value === body['focus']);
    const summary = roundSummaries.find((value) => value === body['summary']);
    if (!focus || !summary) throw new ApiError(422, 'Select a round focus and summary.');
    const id = crypto.randomUUID();
    await db.wardRounds.add({ ...base, id, focus, summary });
    return event('WardRoundRecorded', id);
  }
  if (path === 'inpatient-physician/orders') {
    const kind = wardOrderCatalogue.find((item) => item.kind === body['kind'])?.kind;
    if (!kind) throw new ApiError(422, 'Choose a ward order.');
    const nurse = await db.memberships.get(membershipId(assignment.nurse, facility.id));
    if (!nurse?.active || nurse.role !== 'wardNurse')
      throw new ApiError(409, 'Assign an active ward nurse before placing an order.');
    const existing = await db.wardOrders
      .where('admissionId')
      .equals(admissionId)
      .filter((row) => row.facilityId === facility.id && row.kind === kind)
      .toArray();
    const tasks = await db.nursingTasks
      .where('orderId')
      .anyOf(existing.map((item) => item.id))
      .toArray();
    if (tasks.some(openTask))
      throw new ApiError(409, 'An open order already exists for this task.');
    const id = crypto.randomUUID();
    await db.wardOrders.add({ ...base, id, kind });
    await db.nursingTasks.add({
      id: crypto.randomUUID(),
      orderId: id,
      admissionId,
      facilityId: facility.id,
      status: 'Pending',
      version: 1,
      updatedAt: now,
      updatedBy: session.account,
    });
    return event('WardOrderPlaced', id);
  }
  if (path === 'nursing-station/observations') {
    const kind = observationKinds.find((value) => value === body['kind']);
    const result = observationResults.find((value) => value === body['result']);
    if (!kind || !result) throw new ApiError(422, 'Select an observation and its status.');
    const id = crypto.randomUUID();
    await db.wardObservations.add({ ...base, id, kind, result });
    return event('WardObservationRecorded', id);
  }
  const task = await db.nursingTasks.get(field(body, 'taskId'));
  if (task?.facilityId !== facility.id || task.admissionId !== admissionId)
    throw new ApiError(404, 'Nursing task not found for this admission.');
  if (body['taskVersion'] !== String(task.version))
    throw new ApiError(409, 'This task changed. Refresh and try again.');
  const order = await db.wardOrders.get(task.orderId);
  if (order?.admissionId !== admissionId || order.facilityId !== facility.id)
    throw new ApiError(409, 'The order and nursing task link could not be verified.');
  const update = { version: task.version + 1, updatedAt: now, updatedBy: session.account };
  if (path === 'inpatient-physician/orders/cancel' && task.status === 'Pending') {
    await db.nursingTasks.update(task.id, { ...update, status: 'Cancelled' });
    return event('WardOrderCancelled', order.id);
  }
  if (path === 'nursing-station/tasks/start' && task.status === 'Pending') {
    await db.nursingTasks.update(task.id, { ...update, status: 'In progress' });
    return event('NursingTaskStarted', task.id);
  }
  if (path === 'nursing-station/tasks/complete' && task.status === 'In progress') {
    const kind = wardOrderCatalogue.find((item) => item.kind === order.kind)?.observation;
    const result = observationResults.find((value) => value === body['result']);
    if (!kind || !result)
      throw new ApiError(422, 'Select an observation status to complete this task.');
    await db.wardObservations.add({
      ...base,
      id: crypto.randomUUID(),
      taskId: task.id,
      kind,
      result,
    });
    await db.nursingTasks.update(task.id, { ...update, status: 'Completed' });
    return event('NursingTaskCompleted', task.id);
  }
  throw new ApiError(409, 'This action is unavailable for the current task status.');
}
