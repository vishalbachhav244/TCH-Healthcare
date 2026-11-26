import { invoiceTotal, type Facility, type Session } from '../domain/operations';
import type { PatientPortal } from '../domain/portal';
import { ApiError, patientSubject } from './access';
import { db } from './database';

export async function portal(facility: Facility, session: Session): Promise<PatientPortal> {
  const patientId = patientSubject(session);
  const [patient, appointments, clinicians, records, invoices] = await Promise.all([
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
  ]);
  if (patient?.tenantId !== facility.tenantId)
    throw new ApiError(404, 'Patient profile unavailable.');
  const [tickets, payments] = await Promise.all([
    db.tickets
      .where('appointmentId')
      .anyOf(appointments.map((row) => row.id))
      .toArray(),
    db.payments
      .where('invoiceId')
      .anyOf(invoices.map((row) => row.id))
      .toArray(),
  ]);
  return {
    patient,
    clinicians,
    records: records.sort((a, b) => b.changedAt - a.changedAt),
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
      .map((invoice) => {
        const totalMinor = invoiceTotal(invoice);
        const balanceMinor =
          totalMinor -
          payments
            .filter((row) => row.invoiceId === invoice.id)
            .reduce((total, row) => total + row.amountMinor, 0);
        return { id: invoice.id, day: invoice.day, totalMinor, balanceMinor };
      }),
  };
}
