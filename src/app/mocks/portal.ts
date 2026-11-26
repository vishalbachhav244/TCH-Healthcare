import type { Facility, Session } from '../domain/operations';
import type { PatientPortal } from '../domain/portal';
import { ApiError, patientSubject } from './access';
import { db } from './database';
import { followUpsForPatient } from './continuity';
import { patientDischargeSummaries } from './discharge';
import { releasedImaging } from './radiology';
import { patientMedications } from './pharmacy';
import { invoiceBalances } from './invoice-balances';

export async function portal(facility: Facility, session: Session): Promise<PatientPortal> {
  const patientId = patientSubject(session);
  const [
    patient,
    appointments,
    clinicians,
    records,
    invoices,
    followUps,
    dischargeSummaries,
    imagingReports,
    medications,
  ] = await Promise.all([
    db.patients.get(patientId),
    db.appointments
      .where('facilityId')
      .equals(facility.id)
      .filter((row) => row.patientId === patientId)
      .toArray(),
    db.practitioners.where('facilityId').equals(facility.id).toArray(),
    db.labOrders
      .where('patientId')
      .equals(patientId)
      .filter((row) => row.facilityId === facility.id && row.status === 'Published')
      .toArray(),
    db.invoices
      .where('facilityId')
      .equals(facility.id)
      .filter((row) => row.patientId === patientId)
      .toArray(),
    followUpsForPatient(facility, patientId),
    patientDischargeSummaries(facility, patientId),
    releasedImaging(facility, patientId),
    patientMedications(facility, patientId),
  ]);
  if (patient?.tenantId !== facility.tenantId)
    throw new ApiError(404, 'Patient profile unavailable.');
  const [tickets, balances] = await Promise.all([
    db.tickets
      .where('appointmentId')
      .anyOf(appointments.map((row) => row.id))
      .toArray(),
    invoiceBalances(invoices),
  ]);
  return {
    patient,
    clinicians,
    records: records.sort((a, b) => b.changedAt - a.changedAt),
    followUps,
    dischargeSummaries,
    imagingReports,
    medications,
    appointments: appointments
      .sort((a, b) => b.day.localeCompare(a.day) || b.time.localeCompare(a.time))
      .flatMap(({ pass: _pass, ...appointment }) => {
        const clinician = clinicians.find((row) => row.id === appointment.practitionerId);
        return clinician
          ? [
              {
                appointment,
                practitioner: clinician,
                ticket: tickets.find((row) => row.appointmentId === appointment.id),
              },
            ]
          : [];
      }),
    invoices: invoices
      .sort((a, b) => b.day.localeCompare(a.day))
      .map((invoice) => ({
        id: invoice.id,
        day: invoice.day,
        ...balances.get(invoice.id)!,
        ...(invoice.admissionId ? { inpatient: true } : {}),
      })),
  };
}
