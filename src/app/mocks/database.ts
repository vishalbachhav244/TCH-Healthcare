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
import { openingStock, pharmacyFixtures, type LegacyDispensingMovement } from './pharmacy-seed';
import type { PlatformIncident } from '../domain/platform-operations';
import type {
  ConsentGrant,
  Connector,
  ExchangeAuditEntry,
  MatchingCode,
  RecordRequest,
} from '../domain/interoperability';
import { initialConnectors, initialSharingReport } from './interoperability-seed';
import type { ClinicalReview, QualityCase } from '../domain/governance';
import type { ScheduleException, WaitlistEntry } from '../domain/scheduling';
import type { FollowUpRequest } from '../domain/continuity';
import type {
  NursingTask,
  WardAssignment,
  WardObservation,
  WardOrder,
  WardRound,
} from '../domain/ward-care';
import { initialQualityCases } from './governance-seed';
import { initialWardAssignments } from './ward-seed';
import type { EmergencyCase, IcuReview, IcuStepDown, TheatreCase } from '../domain/acute-care';
import type { BedStay, DischargePlan, InpatientAccount } from '../domain/discharge';
import { initialBedStays } from '../domain/bed-charges';
import type { BloodRequest, BloodUnit } from '../domain/blood-bank';
import type { ImagingOrder } from '../domain/radiology';
import type { CollectionClose, RefundDecision } from '../domain/finance';
import type { InsuranceClaim, InsuranceCoverage } from '../domain/insurance';
import type { GoodsReceipt, PurchaseOrder, Requisition, Supplier } from '../domain/procurement';
import { initialSuppliers } from './procurement-seed';
import type { StaffShift } from '../domain/workforce';
import type { BiomedicalAsset, MaintenanceOrder } from '../domain/biomedical';
import { initialEquipment } from './biomedical-seed';
import { diagnosticMemberships, initialBloodUnits, initialImagingOrders } from './diagnostics-seed';

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
  refundDecisions: EntityTable<RefundDecision, 'movementId'>;
  collectionCloses: EntityTable<CollectionClose, 'id'>;
  insuranceCoverages: EntityTable<InsuranceCoverage, 'id'>;
  insuranceClaims: EntityTable<InsuranceClaim, 'id'>;
  suppliers: EntityTable<Supplier, 'id'>;
  supplyRequisitions: EntityTable<Requisition, 'id'>;
  purchaseOrders: EntityTable<PurchaseOrder, 'id'>;
  goodsReceipts: EntityTable<GoodsReceipt, 'id'>;
  staffShifts: EntityTable<StaffShift, 'id'>;
  biomedicalAssets: EntityTable<BiomedicalAsset, 'id'>;
  maintenanceOrders: EntityTable<MaintenanceOrder, 'id'>;
  platformIncidents: EntityTable<PlatformIncident, 'id'>;
  connectors: EntityTable<Connector, 'id'>;
  matchingCodes: EntityTable<MatchingCode, 'code'>;
  recordRequests: EntityTable<RecordRequest, 'id'>;
  consentGrants: EntityTable<ConsentGrant, 'requestId'>;
  exchangeAudit: EntityTable<ExchangeAuditEntry, 'id'>;
  clinicalReviews: EntityTable<ClinicalReview, 'reportId'>;
  qualityCases: EntityTable<QualityCase, 'id'>;
  waitlist: EntityTable<WaitlistEntry, 'id'>;
  scheduleExceptions: EntityTable<ScheduleException, 'id'>;
  followUps: EntityTable<FollowUpRequest, 'id'>;
  wardAssignments: EntityTable<WardAssignment, 'admissionId'>;
  wardRounds: EntityTable<WardRound, 'id'>;
  wardOrders: EntityTable<WardOrder, 'id'>;
  nursingTasks: EntityTable<NursingTask, 'id'>;
  wardObservations: EntityTable<WardObservation, 'id'>;
  emergencyCases: EntityTable<EmergencyCase, 'id'>;
  icuReviews: EntityTable<IcuReview, 'id'>;
  icuStepDowns: EntityTable<IcuStepDown, 'id'>;
  theatreCases: EntityTable<TheatreCase, 'id'>;
  bedStays: EntityTable<BedStay, 'id'>;
  dischargePlans: EntityTable<DischargePlan, 'admissionId'>;
  inpatientAccounts: EntityTable<InpatientAccount, 'admissionId'>;
  imagingOrders: EntityTable<ImagingOrder, 'id'>;
  bloodRequests: EntityTable<BloodRequest, 'id'>;
  bloodUnits: EntityTable<BloodUnit, 'id'>;
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

db.version(10)
  .stores({
    connectors: 'id, facilityId, recipientAccount',
    matchingCodes: 'code, [patientId+connectorId], expiresAt',
    recordRequests: 'id, patientId, connectorId',
    exchangeAudit: 'id, requestId, occurredAt',
  })
  .upgrade(async (transaction) => {
    const date = await transaction
      .table<{ key: string; value: string }, string>('metadata')
      .get('referenceDay');
    if (!date) return;
    await transaction.table('connectors').bulkAdd(initialConnectors);
    const encounters = await transaction.table<Encounter, string>('encounters').toArray();
    await transaction.table('labOrders').bulkAdd(initialSharingReport(encounters));
  });

db.version(11)
  .stores({ clinicalReviews: 'reportId, facilityId', qualityCases: 'id, facilityId' })
  .upgrade(async (transaction) => {
    const date = await transaction
      .table<{ key: string; value: string }, string>('metadata')
      .get('referenceDay');
    if (date) await transaction.table('qualityCases').bulkAdd(initialQualityCases(date.value));
    const memberships = transaction.table<StaffMembership, string>('memberships');
    for (const grant of initialStaff.filter(
      (item) => item.account === 'medicaldirector' || item.account === 'quality',
    )) {
      if (!(await memberships.get(grant.id))) await memberships.add(grant);
    }
  });

db.version(12)
  .stores({ consentGrants: 'requestId' })
  .upgrade(async (transaction) => {
    type PreviousRequest = RecordRequest & {
      reportId?: string;
      reportVersion?: number;
      expiresAt?: number;
    };
    const requests = transaction.table<PreviousRequest, string>('recordRequests');
    const grants: ConsentGrant[] = [];
    await requests.toCollection().modify((request) => {
      if (
        request.reportId &&
        request.reportVersion !== undefined &&
        request.expiresAt !== undefined
      ) {
        grants.push({
          requestId: request.id,
          record: {
            kind: 'Laboratory report',
            id: request.reportId,
            version: request.reportVersion,
          },
          expiresAt: request.expiresAt,
          revoked: request.status === 'Revoked',
        });
      }
      delete request.reportId;
      delete request.reportVersion;
      delete request.expiresAt;
    });
    await transaction.table<ConsentGrant, string>('consentGrants').bulkAdd(grants);
  });

db.version(13).stores({
  waitlist: 'id, [facilityId+day]',
  scheduleExceptions: 'id, [facilityId+day], [facilityId+practitionerId+day]',
});

db.version(14).stores({
  encounters: 'id, facilityId, &appointmentId, [facilityId+patientId]',
  followUps: 'id, [facilityId+patientId], encounterId, &appointmentId',
});

db.version(15)
  .stores({
    wardAssignments: 'admissionId, facilityId',
    wardRounds: 'id, admissionId',
    wardOrders: 'id, admissionId',
    nursingTasks: 'id, admissionId, &orderId',
    wardObservations: 'id, admissionId',
  })
  .upgrade(async (transaction) => {
    const admissions = await transaction.table<Admission, string>('admissions').toArray();
    await transaction.table('wardAssignments').bulkAdd(initialWardAssignments(admissions));
    const memberships = transaction.table<StaffMembership, string>('memberships');
    for (const grant of initialStaff.filter(
      (row) => row.role === 'wardPhysician' || row.role === 'wardNurse',
    )) {
      if (!(await memberships.get(grant.id))) await memberships.add(grant);
    }
  });

db.version(16)
  .stores({
    emergencyCases: 'id, facilityId, [facilityId+patientId]',
    icuReviews: 'id, admissionId',
    icuStepDowns: 'id, facilityId, admissionId',
    theatreCases: 'id, facilityId, [facilityId+day], admissionId',
  })
  .upgrade(async (transaction) => {
    const memberships = transaction.table<StaffMembership, string>('memberships');
    for (const grant of initialStaff.filter((row) =>
      ['emergencyClinician', 'criticalCare', 'theatreCoordinator'].includes(row.role),
    )) {
      if (!(await memberships.get(grant.id))) await memberships.add(grant);
    }
  });

db.version(17)
  .stores({
    bedStays: 'id, facilityId, admissionId',
    dischargePlans: 'admissionId, facilityId, [facilityId+patientId]',
    inpatientAccounts: 'admissionId, facilityId',
    invoices: 'id, facilityId, [facilityId+day], encounterId, &prescriptionId, &admissionId',
  })
  .upgrade(async (transaction) => {
    const [admissions, beds, transfers] = await Promise.all([
      transaction.table<Admission, string>('admissions').toArray(),
      transaction.table<Bed, string>('beds').toArray(),
      transaction
        .table<DomainEvent, string>('events')
        .filter((row) => row.type === 'BedAllocated')
        .toArray(),
    ]);
    await transaction
      .table('bedStays')
      .bulkAdd(initialBedStays(admissions, beds, Date.now(), transfers));
  });

db.version(18)
  .stores({
    imagingOrders: 'id, facilityId, encounterId, [facilityId+patientId], [facilityId+scheduledDay]',
    bloodRequests: 'id, facilityId, admissionId',
    bloodUnits: 'id, facilityId',
  })
  .upgrade(async (transaction) => {
    const reference = await transaction
      .table<{ key: string; value: string }, string>('metadata')
      .get('referenceDay');
    if (!reference) return;
    const [facilities, encounters] = await Promise.all([
      transaction.table<Facility, string>('facilities').toArray(),
      transaction.table<Encounter, string>('encounters').toArray(),
    ]);
    const today = dayInIndia();
    await transaction.table('imagingOrders').bulkAdd(initialImagingOrders(encounters, today));
    await transaction.table('bloodUnits').bulkAdd(initialBloodUnits(facilities, today));
    const memberships = transaction.table<StaffMembership, string>('memberships');
    for (const membership of diagnosticMemberships) {
      if (
        facilities.some((facility) => facility.id === membership.facilityId) &&
        !(await memberships.get(membership.id))
      )
        await memberships.add(membership);
    }
  });

db.version(19)
  .stores({
    stockLots: 'id, facilityId, [facilityId+productId+batch]',
    stockMovements: 'id, facilityId, lotId, prescriptionId, invoiceId, &[facilityId+reference]',
  })
  .upgrade(async (transaction) => {
    const movements = transaction.table<StockMovement, string>('stockMovements');
    const [lots, history, reference] = await Promise.all([
      transaction.table<StockLot, string>('stockLots').toArray(),
      transaction.table<LegacyDispensingMovement, string>('stockMovements').toArray(),
      transaction.table<{ key: string; value: string }, string>('metadata').get('referenceDay'),
    ]);
    const at = Date.parse((reference?.value ?? dayInIndia()) + 'T00:00:00+05:30');
    await movements.bulkPut(history.map((move) => ({ ...move, kind: 'Dispensed' })));
    await movements.bulkAdd(openingStock(lots, at, history));
  });

db.version(20)
  .stores({
    refundDecisions: 'movementId, facilityId, invoiceId, [facilityId+day]',
    collectionCloses: 'id, facilityId',
    insuranceCoverages: 'id, facilityId, [facilityId+patientId], &[facilityId+payer+policy]',
    insuranceClaims: 'id, facilityId, &invoiceId',
    payments: 'id, invoiceId, day, &claimId',
  })
  .upgrade(async (transaction) => {
    const memberships = transaction.table<StaffMembership, string>('memberships');
    const facilities = transaction.table<Facility, string>('facilities');
    for (const membership of initialStaff.filter(
      (row) => row.role === 'finance' || row.role === 'insurance',
    )) {
      if (
        (await facilities.get(membership.facilityId)) &&
        !(await memberships.get(membership.id))
      ) {
        await memberships.add(membership);
      }
    }
  });

db.version(21)
  .stores({
    suppliers: 'id, facilityId',
    supplyRequisitions: 'id, facilityId',
    purchaseOrders: 'id, facilityId, &requisitionId',
    goodsReceipts: 'id, facilityId, purchaseOrderId, &movementId',
  })
  .upgrade(async (transaction) => {
    const sites = await transaction.table<Facility, string>('facilities').toArray();
    await transaction.table('suppliers').bulkAdd(initialSuppliers(sites));
    const existing = new Set(sites.map((facility) => facility.id));
    const members = transaction.table<StaffMembership, string>('memberships');
    for (const membership of initialStaff.filter(
      (row) => row.role === 'inventory' || row.role === 'procurement',
    )) {
      if (existing.has(membership.facilityId) && !(await members.get(membership.id)))
        await members.add(membership);
    }
  });

db.version(22)
  .stores({
    staffShifts: 'id, [facilityId+day], [account+day]',
    biomedicalAssets: 'id, facilityId, &[facilityId+tag], &[facilityId+imagingRoom]',
    maintenanceOrders: 'id, facilityId, assetId',
  })
  .upgrade(async (transaction) => {
    const sites = await transaction.table<Facility, string>('facilities').toArray();
    await transaction.table('biomedicalAssets').bulkAdd(initialEquipment(sites));
    const existing = new Set(sites.map((facility) => facility.id));
    const members = transaction.table<StaffMembership, string>('memberships');
    for (const membership of initialStaff.filter(
      (row) => row.role === 'workforce' || row.role === 'biomedical',
    )) {
      if (existing.has(membership.facilityId) && !(await members.get(membership.id)))
        await members.add(membership);
    }
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
        db.bedStays,
        db.wardAssignments,
        db.labOrders,
        db.imagingOrders,
        db.bloodUnits,
        db.facilities,
        db.memberships,
        db.prescriptions,
        db.stockLots,
        db.stockMovements,
        db.suppliers,
        db.biomedicalAssets,
        db.platformIncidents,
        db.connectors,
        db.qualityCases,
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
          db.bedStays.bulkAdd(initialBedStays(data.admissions, data.beds, Date.now())),
          db.wardAssignments.bulkAdd(initialWardAssignments(data.admissions)),
          db.labOrders.bulkAdd([
            ...labFixtures(data.encounters),
            ...initialSharingReport(data.encounters),
          ]),
          db.imagingOrders.bulkAdd(initialImagingOrders(data.encounters, referenceDay)),
          db.bloodUnits.bulkAdd(initialBloodUnits(initialFacilities, referenceDay)),
          db.facilities.bulkAdd(initialFacilities),
          db.memberships.bulkAdd(initialStaff),
          db.stockLots.bulkAdd(pharmacy.lots),
          db.stockMovements.bulkAdd(
            openingStock(pharmacy.lots, Date.parse(referenceDay + 'T00:00:00+05:30')),
          ),
          db.suppliers.bulkAdd(initialSuppliers(initialFacilities)),
          db.biomedicalAssets.bulkAdd(initialEquipment(initialFacilities)),
          db.platformIncidents.bulkAdd(initialIncidents(referenceDay)),
          db.connectors.bulkAdd(initialConnectors),
          db.qualityCases.bulkAdd(initialQualityCases(referenceDay)),
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
