import type { Admission, DomainEvent, Facility, InpatientBoard } from '../domain/operations';
import { ApiError } from './access';
import { db } from './database';
import { openTask } from './ward-care';
import { criticalCareWard, openTheatreCase } from '../domain/acute-care';
import { requestAdmission } from './admission-records';
import { releaseDischargeSummary } from './discharge';
import { endBedStay, finalizeInpatientAccount, startBedStay } from './inpatient-billing';
import { openBloodRequest } from '../domain/blood-bank';

function pendingStepDown(facility: Facility, admissionId: string) {
  return db.icuStepDowns
    .where('admissionId')
    .equals(admissionId)
    .filter((row) => row.facilityId === facility.id && row.status === 'Requested');
}

export async function board(
  facility: Facility,
  includeAdmissions: boolean,
): Promise<InpatientBoard> {
  const [beds, admissions, stepDowns, plans, assignments] = await Promise.all([
    db.beds.where('facilityId').equals(facility.id).toArray(),
    includeAdmissions ? db.admissions.where('facilityId').equals(facility.id).toArray() : [],
    includeAdmissions
      ? db.icuStepDowns
          .where('facilityId')
          .equals(facility.id)
          .filter((row) => row.status === 'Requested')
          .toArray()
      : [],
    includeAdmissions ? db.dischargePlans.where('facilityId').equals(facility.id).toArray() : [],
    includeAdmissions
      ? db.wardAssignments.where('facilityId').equals(facility.id).primaryKeys()
      : [],
  ]);
  const patients = await db.patients.bulkGet(admissions.map((row) => row.patientId));
  const handoffs = new Map(stepDowns.map((row) => [row.admissionId, row.requestedAt]));
  const summaries = new Map(plans.map((row) => [row.admissionId, row]));
  const assigned = new Set(assignments);
  return {
    beds,
    admissions: admissions
      .flatMap((admission, index) => {
        const patient = patients[index];
        if (patient?.tenantId !== facility.tenantId) return [];
        const plan = summaries.get(admission.id);
        const dischargeSummaryStatus =
          plan?.patientId === patient.id
            ? plan.release
              ? ('Released' as const)
              : plan.signedAt === undefined
                ? ('Draft' as const)
                : ('Signed' as const)
            : admission.status === 'Admitted' && assigned.has(admission.id)
              ? ('Required' as const)
              : undefined;
        return [
          {
            admission,
            patient,
            stepDownRequestedAt: handoffs.get(admission.id),
            dischargeSummaryStatus,
          },
        ];
      })
      .sort((a, b) => b.admission.requestedAt - a.admission.requestedAt),
  };
}

export async function inpatientCommand(
  path: string,
  facility: Facility,
  payload: Record<string, unknown>,
): Promise<DomainEvent> {
  const time = Date.now();
  const event = (type: DomainEvent['type'], entityId: string) => ({
    type,
    entityId,
    facilityId: facility.id,
    occurredAt: time,
  });
  if (path === 'beds/release') {
    const bed =
      typeof payload['bedId'] === 'string' ? await db.beds.get(payload['bedId']) : undefined;
    if (!bed || bed.facilityId !== facility.id) throw new ApiError(404, 'Bed not found.');
    if (bed.status !== 'Cleaning')
      throw new ApiError(409, 'Only a bed awaiting cleaning can be released.');
    await db.beds.update(bed.id, { status: 'Available' });
    return event('BedReleased', bed.id);
  }
  if (path === 'admissions') {
    if (typeof payload['patientId'] !== 'string') throw new ApiError(404, 'Patient not found.');
    const id = await requestAdmission(facility, payload['patientId'], time);
    return event('AdmissionRequested', id);
  }
  const admission =
    typeof payload['admissionId'] === 'string'
      ? await db.admissions.get(payload['admissionId'])
      : undefined;
  if (admission?.facilityId !== facility.id) throw new ApiError(404, 'Admission not found.');
  if (String(admission.version) !== payload['version'])
    throw new ApiError(409, 'This admission was updated. Reload and try again.');
  const next: Partial<Admission> = { version: admission.version + 1 };
  if (path === 'admissions/discharge') {
    if (admission.status !== 'Admitted' || !admission.bedId)
      throw new ApiError(409, 'Only an admitted patient can be discharged.');
    const bed = await db.beds.get(admission.bedId);
    if (bed?.facilityId !== facility.id || bed.status !== 'Occupied')
      throw new ApiError(409, 'The assigned bed could not be verified.');
    if (
      await db.nursingTasks
        .where('admissionId')
        .equals(admission.id)
        .filter((task) => task.facilityId === facility.id && openTask(task))
        .first()
    ) {
      throw new ApiError(
        409,
        'Complete or cancel open nursing tasks before discharging this patient.',
      );
    }
    if (
      await db.theatreCases
        .where('admissionId')
        .equals(admission.id)
        .filter((record) => record.facilityId === facility.id && openTheatreCase(record))
        .first()
    ) {
      throw new ApiError(409, 'Complete or cancel open theatre cases before discharge.');
    }
    if (
      await db.bloodRequests
        .where('admissionId')
        .equals(admission.id)
        .filter(
          (row) =>
            row.facilityId === facility.id &&
            row.patientId === admission.patientId &&
            openBloodRequest(row),
        )
        .first()
    ) {
      throw new ApiError(409, 'Resolve open blood component requests before discharge.');
    }
    await releaseDischargeSummary(facility, admission, bed, time);
    await endBedStay(admission, bed, time);
    await finalizeInpatientAccount(admission, time);
    await db.beds.update(admission.bedId, { status: 'Cleaning' });
    await pendingStepDown(facility, admission.id).modify({ status: 'Closed', resolvedAt: time });
    await db.admissions.update(admission.id, { ...next, status: 'Discharged', dischargedAt: time });
    return event('PatientDischarged', admission.id);
  }
  if (admission.status === 'Discharged') throw new ApiError(409, 'This admission is closed.');
  const bed =
    typeof payload['bedId'] === 'string' ? await db.beds.get(payload['bedId']) : undefined;
  if (!bed || bed.facilityId !== facility.id) throw new ApiError(404, 'Bed not found.');
  if (bed.status !== 'Available')
    throw new ApiError(409, 'The selected bed is no longer available.');
  if (admission.bedId) {
    const previous = await db.beds.get(admission.bedId);
    if (previous?.facilityId !== facility.id || previous.status !== 'Occupied')
      throw new ApiError(409, 'The assigned bed could not be verified.');
    await endBedStay(admission, previous, time);
    await db.beds.update(previous.id, { status: 'Cleaning' });
    if (previous.ward === criticalCareWard && bed.ward !== criticalCareWard) {
      await pendingStepDown(facility, admission.id).modify({
        status: 'Transferred',
        resolvedAt: time,
      });
    }
  }
  await startBedStay(admission, bed, time);
  await db.beds.update(bed.id, { status: 'Occupied' });
  await db.admissions.update(admission.id, {
    ...next,
    bedId: bed.id,
    status: 'Admitted',
    admittedAt: admission.admittedAt ?? time,
  });
  return event(admission.status === 'Requested' ? 'PatientAdmitted' : 'BedAllocated', admission.id);
}
