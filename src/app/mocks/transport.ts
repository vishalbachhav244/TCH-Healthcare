import type { Admission, Bed, DomainEvent, Facility, Session } from '../domain/operations';
import {
  openTrip,
  transportDestinations,
  transportKinds,
  tripUsesUnit,
  type TransportData,
  type TransportOption,
  type TransportRow,
  type TransportStatus,
} from '../domain/transport';
import { ApiError } from './access';
import { db } from './database';

function currentPickup(admission: Admission | undefined, bed: Bed | undefined, facilityId: string) {
  return (
    admission?.facilityId === facilityId &&
    admission.status === 'Admitted' &&
    bed?.facilityId === facilityId &&
    bed.status === 'Occupied' &&
    admission.bedId === bed.id
  );
}

const pickupLocation = (bed: Bed) => bed.ward + ' · ' + bed.label;

export async function transportData(facility: Facility): Promise<TransportData> {
  const [admissions, beds, records, units] = await Promise.all([
    db.admissions.where('facilityId').equals(facility.id).toArray(),
    db.beds.where('facilityId').equals(facility.id).toArray(),
    db.transportRequests.where('facilityId').equals(facility.id).toArray(),
    db.transportUnits.where('facilityId').equals(facility.id).toArray(),
  ]);
  const byBed = new Map(beds.map((bed) => [bed.id, bed]));
  const byAdmission = new Map(admissions.map((admission) => [admission.id, admission]));
  const byUnit = new Map(units.map((unit) => [unit.id, unit]));
  const openAdmissions = new Set(records.filter(openTrip).map((trip) => trip.admissionId));
  const usedUnits = new Set(records.filter(tripUsesUnit).map((trip) => trip.unitId));
  const patientIds = [
    ...new Set([
      ...records.map((trip) => trip.patientId),
      ...admissions
        .filter((admission) => admission.status === 'Admitted')
        .map((row) => row.patientId),
    ]),
  ];
  const patients = new Map(
    (await db.patients.bulkGet(patientIds)).flatMap((patient) =>
      patient?.tenantId === facility.tenantId
        ? [[patient.id, { id: patient.id, name: patient.name }] as const]
        : [],
    ),
  );
  return {
    admissions: admissions
      .flatMap<TransportOption>((admission) => {
        const bed = byBed.get(admission.bedId ?? '');
        const patient = patients.get(admission.patientId);
        if (
          !bed ||
          !patient ||
          !currentPickup(admission, bed, facility.id) ||
          openAdmissions.has(admission.id)
        )
          return [];
        return [
          {
            admissionId: admission.id,
            version: admission.version,
            patient,
            pickup: pickupLocation(bed),
          },
        ];
      })
      .sort((a, b) => a.patient.name.localeCompare(b.patient.name)),
    trips: records
      .flatMap<TransportRow>((trip) => {
        const admission = byAdmission.get(trip.admissionId);
        const bed = byBed.get(trip.pickupBedId);
        const patient = patients.get(trip.patientId);
        if (admission?.patientId !== trip.patientId || !bed || !patient) return [];
        return [
          {
            ...trip,
            patient,
            pickup: pickupLocation(bed),
            pickupCurrent: currentPickup(admission, bed, facility.id),
            unitLabel: byUnit.get(trip.unitId ?? '')?.label,
          },
        ];
      })
      .sort(
        (a, b) =>
          Number(openTrip(b)) - Number(openTrip(a)) ||
          (openTrip(a) ? a.requestedAt - b.requestedAt : b.changedAt - a.changedAt),
      ),
    units: units
      .map((unit) => ({ ...unit, available: !usedUnits.has(unit.id) }))
      .sort((a, b) => a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label)),
  };
}

export async function assertTransportHandedOff(admission: Admission) {
  if (
    await db.transportRequests
      .where('admissionId')
      .equals(admission.id)
      .filter(
        (trip) =>
          trip.facilityId === admission.facilityId &&
          trip.patientId === admission.patientId &&
          trip.status === 'In transit',
      )
      .first()
  ) {
    throw new ApiError(
      409,
      'Finish the active transport handoff before moving or discharging this admission.',
    );
  }
}

export async function transportCommand(
  facility: Facility,
  session: Session,
  fields: Record<string, unknown>,
  create: boolean,
): Promise<DomainEvent> {
  const time = Date.now();
  const event = (type: DomainEvent['type'], entityId: string) => ({
    type,
    entityId,
    occurredAt: time,
    facilityId: facility.id,
    actor: session.account,
  });
  if (create) {
    const admission =
      typeof fields['admissionId'] === 'string'
        ? await db.admissions.get(fields['admissionId'])
        : undefined;
    if (admission?.facilityId !== facility.id)
      throw new ApiError(404, 'Admission unavailable at this facility.');
    const [patient, bed] = await Promise.all([
      db.patients.get(admission.patientId),
      admission.bedId ? db.beds.get(admission.bedId) : undefined,
    ]);
    if (patient?.tenantId !== facility.tenantId)
      throw new ApiError(404, 'Admission unavailable at this facility.');
    if (
      !bed ||
      !currentPickup(admission, bed, facility.id) ||
      fields['admissionVersion'] !== String(admission.version)
    )
      throw new ApiError(409, 'The admission or pickup bed changed. Select the current admission.');
    const kind = transportKinds.find((item) => item === fields['kind']);
    const destination =
      kind && transportDestinations[kind].find((item) => item === fields['destination']);
    if (!kind || !destination)
      throw new ApiError(422, 'Choose a transport type and a compatible destination.');
    if (
      await db.transportRequests
        .where('admissionId')
        .equals(admission.id)
        .filter((trip) => trip.facilityId === facility.id && openTrip(trip))
        .first()
    )
      throw new ApiError(409, 'This admission already has an active transport request.');
    const id = crypto.randomUUID();
    await db.transportRequests.add({
      id,
      facilityId: facility.id,
      admissionId: admission.id,
      patientId: patient.id,
      pickupBedId: bed.id,
      kind,
      destination,
      status: 'Requested',
      version: 1,
      requestedAt: time,
      changedAt: time,
      changedBy: session.account,
    });
    return event('TransportRequested', id);
  }
  const trip =
    typeof fields['tripId'] === 'string'
      ? await db.transportRequests.get(fields['tripId'])
      : undefined;
  if (trip?.facilityId !== facility.id)
    throw new ApiError(404, 'Transport request unavailable at this facility.');
  if (fields['version'] !== String(trip.version))
    throw new ApiError(409, 'The transport request changed. Refresh and try again.');
  const [admission, bed, patient] = await Promise.all([
    db.admissions.get(trip.admissionId),
    db.beds.get(trip.pickupBedId),
    db.patients.get(trip.patientId),
  ]);
  if (
    admission?.facilityId !== facility.id ||
    admission.patientId !== trip.patientId ||
    bed?.facilityId !== facility.id ||
    patient?.tenantId !== facility.tenantId
  )
    throw new ApiError(404, 'Transport request unavailable at this facility.');
  const action = fields['action'];
  let status: TransportStatus;
  let unitId = trip.unitId;
  if (action === 'dispatch' && trip.status === 'Requested') {
    const unit =
      typeof fields['unitId'] === 'string'
        ? await db.transportUnits.get(fields['unitId'])
        : undefined;
    if (unit?.facilityId !== facility.id || unit.kind !== trip.kind)
      throw new ApiError(422, 'Choose a compatible transport unit at this facility.');
    if (
      await db.transportRequests
        .where('unitId')
        .equals(unit.id)
        .filter((other) => other.facilityId === facility.id && tripUsesUnit(other))
        .first()
    )
      throw new ApiError(409, 'This transport unit is already assigned.');
    status = 'Dispatched';
    unitId = unit.id;
  } else if (action === 'pickup' && trip.status === 'Dispatched') {
    status = 'In transit';
  } else if (action === 'complete' && trip.status === 'In transit') {
    status = 'Completed';
  } else if (action === 'cancel' && (trip.status === 'Requested' || trip.status === 'Dispatched')) {
    status = 'Cancelled';
  } else {
    throw new ApiError(409, 'This action is unavailable at the current transport stage.');
  }
  if ((action === 'dispatch' || action === 'pickup') && !currentPickup(admission, bed, facility.id))
    throw new ApiError(
      409,
      'The pickup changed. Cancel this request and use the current admission.',
    );
  await db.transportRequests.update(trip.id, {
    status,
    unitId,
    version: trip.version + 1,
    changedAt: time,
    changedBy: session.account,
  });
  return event('TransportUpdated', trip.id);
}
