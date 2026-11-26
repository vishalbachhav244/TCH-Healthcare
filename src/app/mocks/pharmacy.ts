import { dayInIndia, type DomainEvent, type Facility, type Session } from '../domain/operations';
import { products, type PharmacyData, type Prescription } from '../domain/pharmacy';
import { ApiError } from './access';
import { db } from './database';

export async function pharmacyData(facility: Facility): Promise<PharmacyData> {
  const [visible, lots] = await Promise.all([
    db.prescriptions
      .where('facilityId')
      .equals(facility.id)
      .filter((row) => row.status !== 'Draft')
      .toArray(),
    db.stockLots.where('facilityId').equals(facility.id).toArray(),
  ]);
  const patients = await db.patients.bulkGet(visible.map((row) => row.patientId));
  return {
    prescriptions: visible.flatMap((prescription, index) => {
      const patient = patients[index];
      return patient?.tenantId === facility.tenantId
        ? [{ prescription, patient: { id: patient.id, name: patient.name } }]
        : [];
    }),
    lots: lots.sort((a, b) => a.expiresOn.localeCompare(b.expiresOn)),
  };
}

export async function clinicalPrescriptions(
  facility: Facility,
  session: Session,
  encounterId: string,
) {
  const encounter = await db.encounters.get(encounterId);
  if (
    encounter?.facilityId !== facility.id ||
    encounter.practitionerId !== session.facilityAccess[facility.id].practitionerId
  ) {
    throw new ApiError(404, 'Encounter not found.');
  }
  return db.prescriptions.where('encounterId').equals(encounter.id).toArray();
}

export async function pharmacyCommand(
  path: string,
  facility: Facility,
  session: Session,
  body: Record<string, unknown>,
): Promise<DomainEvent> {
  const now = Date.now();
  const event = (type: DomainEvent['type'], entityId: string): DomainEvent => ({
    type,
    entityId,
    facilityId: facility.id,
    occurredAt: now,
    actor: session.account,
  });
  if (path === 'clinical/prescriptions') {
    const encounterId = body['encounterId'];
    const encounter =
      typeof encounterId === 'string' ? await db.encounters.get(encounterId) : undefined;
    if (
      encounter?.facilityId !== facility.id ||
      encounter.practitionerId !== session.facilityAccess[facility.id].practitionerId
    ) {
      throw new ApiError(404, 'Encounter not found.');
    }
    if (encounter.signedAt) throw new ApiError(409, 'This consultation has been signed.');
    const product = products.find((item) => item.id === body['productId']);
    const quantity = Number(body['quantity']);
    if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 30)
      throw new ApiError(422, 'Select a medication and a quantity from 1 to 30.');
    if (
      await db.prescriptions
        .where('encounterId')
        .equals(encounter.id)
        .filter((row) => row.productId === product.id)
        .first()
    ) {
      throw new ApiError(409, 'This medication already appears on the consultation prescription.');
    }
    const id = crypto.randomUUID();
    await db.prescriptions.add({
      id,
      facilityId: facility.id,
      encounterId: encounter.id,
      patientId: encounter.patientId,
      practitionerId: encounter.practitionerId,
      productId: product.id,
      quantity,
      status: 'Draft',
      createdAt: now,
    });
    return event('PrescriptionDrafted', id);
  }
  const id = body['prescriptionId'];
  const prescription = typeof id === 'string' ? await db.prescriptions.get(id) : undefined;
  if (prescription?.facilityId !== facility.id) throw new ApiError(404, 'Prescription not found.');
  if (path === 'clinical/prescriptions/sign') {
    if (prescription.practitionerId !== session.facilityAccess[facility.id].practitionerId)
      throw new ApiError(403, 'Only the prescribing clinician can sign this prescription.');
    if (prescription.status !== 'Draft')
      throw new ApiError(409, 'Only a draft prescription can be signed.');
    await db.prescriptions.update(prescription.id, {
      status: 'Signed',
      signedAt: now,
      signedBy: session.account,
    });
    return event('PrescriptionSigned', prescription.id);
  }
  if (prescription.status !== 'Signed')
    throw new ApiError(409, 'Only a signed, undispensed prescription can be filled.');
  const lot = typeof body['lotId'] === 'string' ? await db.stockLots.get(body['lotId']) : undefined;
  if (lot?.facilityId !== facility.id || lot.productId !== prescription.productId)
    throw new ApiError(404, 'Stock lot is unavailable for this medication.');
  const day = dayInIndia(now);
  if (lot.expiresOn < day) throw new ApiError(409, 'This stock lot has expired.');
  if (lot.onHand < prescription.quantity)
    throw new ApiError(409, 'This stock lot has insufficient quantity.');
  const product = products.find((item) => item.id === prescription.productId);
  if (!product) throw new ApiError(422, 'Medication catalogue entry is unavailable.');
  const invoiceId = crypto.randomUUID();
  await db.stockLots.update(lot.id, { onHand: lot.onHand - prescription.quantity });
  await db.stockMovements.add({
    id: crypto.randomUUID(),
    lotId: lot.id,
    facilityId: facility.id,
    prescriptionId: prescription.id,
    quantity: -prescription.quantity,
    at: now,
    actor: session.account,
  });
  await db.invoices.add({
    id: invoiceId,
    facilityId: facility.id,
    patientId: prescription.patientId,
    encounterId: prescription.encounterId,
    day,
    prescriptionId: prescription.id,
    lines: [
      { description: product.name, unitMinor: product.unitMinor, quantity: prescription.quantity },
    ],
  });
  const fulfilled: Partial<Prescription> = {
    status: 'Dispensed',
    lotId: lot.id,
    invoiceId,
    dispensedAt: now,
  };
  await db.prescriptions.update(prescription.id, fulfilled);
  return event('PrescriptionDispensed', prescription.id);
}
