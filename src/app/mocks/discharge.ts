import {
  dischargeCourses,
  dischargeDestinations,
  dischargeFollowUps,
  type DischargeDocument,
  type DischargePlan,
} from '../domain/discharge';
import type { Admission, Bed, DomainEvent, Facility, Session } from '../domain/operations';
import { ApiError } from './access';
import { accountNames } from './accounts';
import { patientAt } from './admission-records';
import { db } from './database';
import { assignedPatient } from './ward-care';

export async function dischargePlanCommand(
  facility: Facility,
  session: Session,
  fields: Record<string, unknown>,
  sign: boolean,
): Promise<DomainEvent> {
  const id = fields['admissionId'];
  if (typeof id !== 'string' || !id) throw new ApiError(422, 'Choose an admission.');
  const { admission, patient, assignment } = await assignedPatient(
    facility,
    session,
    'inpatient-physician',
    id,
  );
  if (
    fields['admissionVersion'] !== String(admission.version) ||
    fields['assignmentVersion'] !== String(assignment.version)
  ) {
    throw new ApiError(409, 'The admission or care team changed. Reopen the current admission.');
  }
  const current = await db.dischargePlans.get(id);
  if (current && (current.facilityId !== facility.id || current.patientId !== patient.id)) {
    throw new ApiError(409, 'The admission and discharge summary link could not be verified.');
  }
  if (
    fields['planVersion'] !== String(current?.version ?? 0) ||
    current?.signedAt !== undefined ||
    current?.release
  ) {
    throw new ApiError(409, 'The discharge summary changed or has already been signed.');
  }
  const now = Date.now();
  const version = (current?.version ?? 0) + 1;
  if (sign) {
    if (!current) throw new ApiError(409, 'Save a discharge draft before signing.');
    await db.dischargePlans.update(id, {
      version,
      signedAt: now,
      signedBy: session.account,
      updatedBy: session.account,
      updatedAt: now,
    });
  } else {
    const destination = dischargeDestinations.find((value) => value === fields['destination']);
    const course = dischargeCourses.find((value) => value === fields['course']);
    const followUp = dischargeFollowUps.find((value) => value === fields['followUp']);
    if (!destination || !course || !followUp)
      throw new ApiError(422, 'Choose a destination, stay summary and follow-up handoff.');
    await db.dischargePlans.put({
      admissionId: id,
      facilityId: facility.id,
      patientId: patient.id,
      destination,
      course,
      followUp,
      version,
      updatedAt: now,
      updatedBy: session.account,
    });
  }
  return {
    type: sign ? 'DischargeSummarySigned' : 'DischargeDraftSaved',
    entityId: id,
    facilityId: facility.id,
    occurredAt: now,
    actor: session.account,
  };
}

export async function releaseDischargeSummary(
  facility: Facility,
  admission: Admission,
  bed: Bed,
  time: number,
) {
  const [assignment, plan] = await Promise.all([
    db.wardAssignments.get(admission.id),
    db.dischargePlans.get(admission.id),
  ]);
  if (!plan && assignment?.facilityId !== facility.id) return;
  if (
    plan?.facilityId !== facility.id ||
    plan.patientId !== admission.patientId ||
    plan.signedAt === undefined ||
    !plan.signedBy ||
    plan.release
  ) {
    throw new ApiError(
      409,
      'The assigned physician must sign the discharge summary before discharge.',
    );
  }
  const patient = await patientAt(facility, admission.patientId);
  if (admission.admittedAt === undefined)
    throw new ApiError(409, 'The admission time could not be verified.');
  await db.dischargePlans.update(plan.admissionId, {
    version: plan.version + 1,
    release: {
      releasedAt: time,
      admittedAt: admission.admittedAt,
      patientName: patient.name,
      facilityName: facility.name,
      ward: bed.ward,
      bed: bed.label,
    },
  });
}

function releasedDocument(
  plan: DischargePlan | undefined,
  admission: Admission | undefined,
  facility: Facility,
): DischargeDocument | undefined {
  if (
    plan?.facilityId !== facility.id ||
    !plan.release ||
    plan.signedAt === undefined ||
    !plan.signedBy ||
    !Object.hasOwn(accountNames, plan.signedBy) ||
    admission?.id !== plan.admissionId ||
    admission.facilityId !== facility.id ||
    admission.patientId !== plan.patientId ||
    admission.status !== 'Discharged' ||
    admission.dischargedAt !== plan.release.releasedAt
  )
    return undefined;
  return {
    admissionId: plan.admissionId,
    version: plan.version,
    patientId: plan.patientId,
    ...plan.release,
    signedAt: plan.signedAt,
    signedBy: accountNames[plan.signedBy],
    destination: plan.destination,
    course: plan.course,
    followUp: plan.followUp,
  };
}

export async function admissionDischargeDocument(facility: Facility, admissionId: string) {
  const [plan, admission] = await Promise.all([
    db.dischargePlans.get(admissionId),
    db.admissions.get(admissionId),
  ]);
  const document = releasedDocument(plan, admission, facility);
  if (!document)
    throw new ApiError(404, 'No released discharge summary was found for this admission.');
  return document;
}

export async function findReleasedDischarge(
  facility: Facility,
  patientId: string,
  admissionId: string,
) {
  const [plan, admission] = await Promise.all([
    db.dischargePlans.get(admissionId),
    db.admissions.get(admissionId),
  ]);
  return plan?.patientId === patientId ? releasedDocument(plan, admission, facility) : undefined;
}

export async function patientDischargeSummaries(facility: Facility, patientId: string) {
  const plans = await db.dischargePlans
    .where('[facilityId+patientId]')
    .equals([facility.id, patientId])
    .filter((row) => !!row.release)
    .toArray();
  const admissions = await db.admissions.bulkGet(plans.map((row) => row.admissionId));
  return plans
    .flatMap((row, i) => {
      const document = releasedDocument(row, admissions[i], facility);
      return document ? [document] : [];
    })
    .sort((a, b) => b.releasedAt - a.releasedAt);
}
