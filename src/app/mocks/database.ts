import Dexie, { type EntityTable } from 'dexie';
import {
  dayInIndia,
  type Admission,
  type Alert,
  type Appointment,
  type Bed,
  type DomainEvent,
  type Encounter,
  type Facility,
  type Invoice,
  type Patient,
  type Payment,
  type Practitioner,
  type Session,
  type Ticket,
} from '../domain/operations';
import { facilities, organisations, seed } from './seed';
import { labFixtures, type LabOrder } from '../domain/diagnostics';
import type { Organisation } from '../domain/platform';
import type { StaffMembership } from '../domain/access';
import { initialStaff } from './accounts';
import type { Prescription, StockLot, StockMovement } from '../domain/pharmacy';
import { pharmacyFixtures } from './pharmacy-seed';
import type { PlatformIncident } from '../domain/platform-operations';

export const db = new Dexie('truecare-evaluation-v1') as Dexie & {
  patients: EntityTable<Patient, 'id'>;
  practitioners: EntityTable<Practitioner, 'id'>;
  appointments: EntityTable<Appointment, 'id'>;
  tickets: EntityTable<Ticket, 'id'>;
  encounters: EntityTable<Encounter, 'id'>;
  beds: EntityTable<Bed, 'id'>;
  admissions: EntityTable<Admission, 'id'>;
  labOrders: EntityTable<LabOrder, 'id'>;
  facilities: EntityTable<Facility, 'id'>;
  memberships: EntityTable<StaffMembership, 'id'>;
  prescriptions: EntityTable<Prescription, 'id'>;
  stockLots: EntityTable<StockLot, 'id'>;
  stockMovements: EntityTable<StockMovement, 'id'>;
  platformIncidents: EntityTable<PlatformIncident, 'id'>;
  organisations: EntityTable<Organisation, 'id'>;
  invoices: EntityTable<Invoice, 'id'>;
  payments: EntityTable<Payment, 'id'>;
  alerts: EntityTable<Alert, 'id'>;
  sessions: EntityTable<Session, 'token'>;
  metadata: EntityTable<{ key: string; value: string }, 'key'>;
  events: EntityTable<DomainEvent & { id: string }, 'id'>;
};

db.version(1).stores({
  patients: 'id, tenantId',
  practitioners: 'id, facilityId',
  appointments: 'id, facilityId, [facilityId+day], [facilityId+practitionerId+day+time], &pass',
  tickets: 'id, facilityId, &appointmentId',
  encounters: 'id, facilityId, &appointmentId',
  beds: 'id, facilityId',
  invoices: 'id, facilityId, [facilityId+day], &encounterId',
  payments: 'id, invoiceId, day',
  alerts: 'id, facilityId',
  sessions: 'token, expiresAt',
  metadata: 'key',
  events: 'id, facilityId, occurredAt',
});

db.version(2)
  .stores({ admissions: 'id, facilityId, [facilityId+patientId], bedId' })
  .upgrade(async (transaction) => {
    const date = (await transaction.table('metadata').get('referenceDay')) as
      | { value: string }
      | undefined;
    if (date) await transaction.table('admissions').bulkAdd(seed(date.value).admissions);
  });

db.version(3)
  .stores({ labOrders: 'id, facilityId, encounterId, patientId, orderedAt' })
  .upgrade(async (transaction) => {
    const encounters = await transaction.table<Encounter, string>('encounters').toArray();
    await transaction.table('labOrders').bulkAdd(labFixtures(encounters));
  });

const initialFacilities = facilities.map((facility) => ({ ...facility, configurationVersion: 1 }));

function initialPlatformActivity(day: string) {
  const time = Date.parse(day + 'T07:30:00+05:30');
  return organisations.map((row, index) => ({
    id: `admin-provision-${row.id}`,
    entityId: row.id,
    facilityId: 'platform',
    type: 'OrganisationCreated' as const,
    actor: 'platform',
    occurredAt: time - (index + 1) * 86_400_000,
  }));
}

db.version(4)
  .stores({ facilities: 'id, tenantId', organisations: 'id, &name' })
  .upgrade(async (transaction) => {
    await transaction.table('facilities').bulkAdd(initialFacilities);
    await transaction.table('organisations').bulkAdd(organisations);
    const date = await transaction
      .table<{ key: string; value: string }, string>('metadata')
      .get('referenceDay');
    if (date) await transaction.table('events').bulkAdd(initialPlatformActivity(date.value));
  });

let initialization: Promise<void> | undefined;

db.version(5)
  .stores({})
  .upgrade(async (transaction) => {
    const orders = transaction.table<Omit<LabOrder, 'finding'> & { finding?: string }, string>(
      'labOrders',
    );
    await orders
      .filter((row) => row.finding === 'Result recorded within fixture range')
      .modify({ finding: 'Result within reference range' });
  });

db.version(6)
  .stores({ memberships: 'id, account, facilityId' })
  .upgrade((transaction) => transaction.table('memberships').bulkAdd(initialStaff));

db.version(7)
  .stores({})
  .upgrade(async (transaction) => {
    const memberships = transaction.table<StaffMembership, string>('memberships');
    for (const grant of initialStaff.filter((row) => row.account === 'network')) {
      if (!(await memberships.get(grant.id))) await memberships.add(grant);
    }
  });

db.version(8)
  .stores({
    prescriptions: 'id, facilityId, encounterId',
    stockLots: 'id, facilityId',
    stockMovements: 'id, facilityId, &prescriptionId',
    invoices: 'id, facilityId, [facilityId+day], encounterId, &prescriptionId',
  })
  .upgrade(async (transaction) => {
    const date = await transaction
      .table<{ key: string; value: string }, string>('metadata')
      .get('referenceDay');
    if (!date) return;
    const encounters = await transaction.table<Encounter, string>('encounters').toArray();
    const pharmacy = pharmacyFixtures(initialFacilities, encounters, date.value);
    await transaction.table('stockLots').bulkAdd(pharmacy.lots);
    await transaction.table('prescriptions').bulkAdd(pharmacy.prescriptions);
    const membership = initialStaff.find((item) => item.account === 'pharmacy');
    if (membership && !(await transaction.table('memberships').get(membership.id))) {
      await transaction.table('memberships').add(membership);
    }
  });

function initialIncidents(day: string): PlatformIncident[] {
  const time = Date.parse(day + 'T08:15:00+05:30');
  return [
    {
      id: 'ops-queue-sync',
      title: 'Queue display update delayed',
      service: 'Queue display',
      priority: 'High',
      status: 'Open',
      version: 1,
      createdAt: time,
      updatedAt: time,
    },
    {
      id: 'ops-facility-review',
      title: 'Review facility activation history',
      service: 'Facility configuration',
      priority: 'Normal',
      status: 'Investigating',
      version: 2,
      createdAt: time - 86_400_000,
      updatedAt: time - 1_800_000,
    },
  ];
}

db.version(9)
  .stores({ platformIncidents: 'id, updatedAt' })
  .upgrade(async (transaction) => {
    const date = await transaction
      .table<{ key: string; value: string }, string>('metadata')
      .get('referenceDay');
    if (date) await transaction.table('platformIncidents').bulkAdd(initialIncidents(date.value));
  });

export function initialize() {
  return (initialization ??= db
    .transaction(
      'rw',
      [
        db.metadata,
        db.patients,
        db.practitioners,
        db.appointments,
        db.tickets,
        db.encounters,
        db.beds,
        db.admissions,
        db.labOrders,
        db.facilities,
        db.memberships,
        db.prescriptions,
        db.stockLots,
        db.platformIncidents,
        db.organisations,
        db.invoices,
        db.payments,
        db.alerts,
        db.sessions,
        db.events,
      ],
      async () => {
        if (await db.metadata.get('referenceDay')) return;
        const referenceDay = dayInIndia();
        const data = seed(referenceDay);
        const pharmacy = pharmacyFixtures(initialFacilities, data.encounters, referenceDay);
        await Promise.all([
          db.patients.bulkAdd(data.patients),
          db.practitioners.bulkAdd(data.practitioners),
          db.appointments.bulkAdd(data.appointments),
          db.tickets.bulkAdd(data.tickets),
          db.encounters.bulkAdd(data.encounters),
          db.beds.bulkAdd(data.beds),
          db.admissions.bulkAdd(data.admissions),
          db.labOrders.bulkAdd(labFixtures(data.encounters)),
          db.facilities.bulkAdd(initialFacilities),
          db.memberships.bulkAdd(initialStaff),
          db.stockLots.bulkAdd(pharmacy.lots),
          db.platformIncidents.bulkAdd(initialIncidents(referenceDay)),
          db.prescriptions.bulkAdd(pharmacy.prescriptions),
          db.organisations.bulkAdd(organisations),
          db.events.bulkAdd(initialPlatformActivity(referenceDay)),
          db.invoices.bulkAdd(data.invoices),
          db.payments.bulkAdd(data.payments),
          db.alerts.bulkAdd(data.alerts),
        ]);
        await db.metadata.add({ key: 'referenceDay', value: referenceDay });
      },
    )
    .catch((error: unknown) => {
      initialization = undefined;
      throw error;
    }));
}
