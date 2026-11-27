import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom, map } from 'rxjs';
import type {
  AccessOptions,
  AppointmentPage,
  DashboardData,
  Facility,
  InpatientBoard,
  InvoiceRow,
  QueueDisplayData,
  Session,
} from '../domain/operations';
import type { LabRow, LabStage } from '../domain/diagnostics';
import type { ImagingAction, ImagingOrder, ImagingRow, ImagingStudy } from '../domain/radiology';
import type {
  BloodAction,
  BloodBankView,
  BloodComponent,
  WardBloodRequest,
} from '../domain/blood-bank';
import type { PatientPortal } from '../domain/portal';
import type { FinanceData, RefundOutcome } from '../domain/finance';
import type {
  BiomedicalAsset,
  BiomedicalData,
  EquipmentFields,
  MaintenanceAction,
  MaintenanceOrder,
  MaintenanceReason,
} from '../domain/biomedical';
import type { ShiftAction, ShiftFields, StaffShift, WorkforceData } from '../domain/workforce';
import type {
  AnalyticsReport,
  AnalyticsWindow,
  AutomationData,
  DocumentationDraft,
  DocumentationFormat,
  DocumentationPolicy,
  DraftAction,
} from '../domain/intelligence';
import type {
  Campaign,
  CampaignAction,
  CampaignTemplate,
  ContactPreferences,
  CrmData,
  EngagementChannel,
  Enquiry,
  EnquiryFields,
  EnquiryPatient,
  EnquiryUpdate,
  MarketingData,
} from '../domain/engagement';
import type { SupportAction, SupportData, SupportFields, SupportTask } from '../domain/support';
import type {
  TransportAction,
  TransportData,
  TransportFields,
  TransportRequest,
} from '../domain/transport';
import type {
  CountFields,
  InventoryData,
  ProcurementData,
  PurchaseOrder,
  ReceiptFields,
  Requisition,
  RequisitionFields,
} from '../domain/procurement';
import type {
  ClaimAction,
  CoverageFields,
  InsuranceClaim,
  InsuranceRow,
} from '../domain/insurance';
import type {
  DischargeDocument,
  DischargeFields,
  InpatientBillingDetail,
  InpatientBillingRow,
} from '../domain/discharge';
import type { PlatformData } from '../domain/platform';
import type { SubscriptionRow } from '../domain/platform';
import type { NetworkFacilityMetrics } from '../domain/operations';
import type {
  MedicationReturn,
  PharmacyData,
  Prescription,
  StockReceipt,
  SupplierReturn,
} from '../domain/pharmacy';
import type { PlatformOperationsData } from '../domain/platform-operations';
import type {
  Connector,
  ConnectorAction,
  ConsentAction,
  IntegrationDashboard,
  PatientSharing,
  RecordRequest,
  RequestSummary,
  SharedReport,
} from '../domain/interoperability';
import type { Disposition, GovernanceData, QualityCase, QualityView } from '../domain/governance';
import type { ScheduleException, SchedulingDay, WaitlistEntry } from '../domain/scheduling';
import type {
  AcuteView,
  AcuteWorkspace,
  EmergencyCase,
  EmergencyRow,
  IcuReviewFields,
  IcuRow,
  TheatreAction,
  TheatreBooking,
  TheatreRow,
} from '../domain/acute-care';
import type {
  NursingTask,
  ObservationFields,
  ObservationResult,
  RoundFields,
  WardAssignmentOptions,
  WardDetail,
  WardOrderKind,
  WardRecordVersion,
  WardRole,
  WardWorklistRow,
} from '../domain/ward-care';
import type {
  BookingContext,
  ClinicalContinuity,
  FollowUpRequest,
  FollowUpSummary,
} from '../domain/continuity';

interface CommandResult {
  id: string;
  pass?: string;
}

interface BillingOptions {
  services: { description: string; unitMinor: number }[];
  encounters: { id: string; name: string; patientId: string }[];
}

export function errorMessage(error: unknown) {
  return error instanceof HttpErrorResponse && typeof error.error?.message === 'string'
    ? error.error.message
    : 'The request could not be completed. Try again.';
}

function objectShape<T>(value: unknown, keys: readonly (keyof T)[]): T {
  if (typeof value !== 'object' || value === null || keys.some((key) => !(key in value)))
    throw new Error('Invalid API response');
  return value as T;
}

function collection<T>(value: unknown, keys: readonly (keyof T)[]): T[] {
  if (!Array.isArray(value)) throw new Error('Invalid API response');
  return value.map((row: unknown) => objectShape<T>(row, keys));
}

function timeSlots(value: unknown) {
  if (!Array.isArray(value) || value.some((time) => typeof time !== 'string'))
    throw new Error('The workspace returned invalid appointment times.');
  return value as string[];
}

@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1/';

  login(account: string, password: string) {
    return firstValueFrom(
      this.http
        .post<unknown>(this.base + 'session', { account, password })
        .pipe(map((value) => this.sessionShape(value))),
    );
  }

  session(token: string) {
    return firstValueFrom(
      this.get('session', token).pipe(map((value) => this.sessionShape(value))),
    );
  }

  logout(token: string) {
    return firstValueFrom(
      this.http.delete(this.base + 'session', { headers: this.headers(token) }),
    );
  }

  facilities(token: string) {
    return firstValueFrom(
      this.get('facilities', token).pipe(
        map((value) =>
          collection<Facility>(value, ['id', 'tenantId', 'name', 'city', 'inpatient']),
        ),
      ),
    );
  }

  platform(token: string) {
    return this.get('platform', token).pipe(
      map((value) =>
        objectShape<PlatformData>(value, [
          'organisations',
          'facilities',
          'activity',
          'staff',
          'memberships',
          'practitioners',
        ]),
      ),
    );
  }

  platformOperations(token: string) {
    return this.get('platform-operations', token).pipe(
      map((value) =>
        objectShape<PlatformOperationsData>(value, [
          'incidents',
          'activeSessions',
          'eventsToday',
          'activity',
        ]),
      ),
    );
  }

  overview(token: string, facility: string, day: string, range: number) {
    return this.get('overview', token, facility, { day, range }).pipe(
      map((value) =>
        objectShape<DashboardData>(value, [
          'days',
          'metrics',
          'departments',
          'alerts',
          'appointments',
        ]),
      ),
    );
  }

  subscriptions(token: string) {
    return this.get('subscriptions', token).pipe(
      map((value) =>
        collection<SubscriptionRow>(value, [
          'organisation',
          'facilities',
          'activeFacilities',
          'inpatientFacilities',
          'nextReview',
        ]),
      ),
    );
  }

  network(token: string, facility: string, day: string) {
    return this.get('network', token, facility, { day }).pipe(
      map((value) =>
        collection<NetworkFacilityMetrics>(value, ['facility', 'metrics', 'departments']),
      ),
    );
  }

  pharmacy(token: string, facility: string) {
    return this.get('pharmacy', token, facility).pipe(
      map((value) => objectShape<PharmacyData>(value, ['prescriptions', 'lots', 'activity'])),
    );
  }

  dispenseMedication(token: string, facility: string, prescriptionId: string, lotId: string) {
    return this.execute('pharmacy/dispense', token, facility, { prescriptionId, lotId });
  }

  receivePharmacyStock(token: string, facility: string, fields: StockReceipt) {
    return this.execute('pharmacy/stock/receipts', token, facility, {
      ...fields,
      quantity: String(fields.quantity),
    });
  }

  returnPharmacyStock(token: string, facility: string, fields: SupplierReturn) {
    return this.execute('pharmacy/stock/supplier-returns', token, facility, {
      ...fields,
      quantity: String(fields.quantity),
    });
  }

  returnMedication(token: string, facility: string, fields: MedicationReturn) {
    return this.execute('pharmacy/medication-returns', token, facility, {
      ...fields,
      quantity: String(fields.quantity),
    });
  }

  prescriptions(token: string, facility: string, encounterId: string) {
    return this.get('clinical/prescriptions', token, facility, { encounterId }).pipe(
      map((value) => collection<Prescription>(value, ['id', 'productId', 'quantity', 'status'])),
    );
  }

  imagingOrders(token: string, facility: string, encounterId: string) {
    return this.get('clinical/imaging-orders', token, facility, { encounterId }).pipe(
      map((value) => collection<ImagingOrder>(value, ['id', 'study', 'status', 'version'])),
    );
  }

  requestImaging(token: string, facility: string, encounterId: string, study: ImagingStudy) {
    return this.execute('clinical/imaging-orders', token, facility, { encounterId, study });
  }

  radiology(token: string, facility: string) {
    return this.get('radiology', token, facility).pipe(
      map((value) => collection<ImagingRow>(value, ['order', 'patient'])),
    );
  }

  updateImaging(
    token: string,
    facility: string,
    record: Pick<ImagingOrder, 'id' | 'version'>,
    action: ImagingAction,
  ) {
    return this.execute(
      'radiology/orders/status',
      token,
      facility,
      { orderId: record.id, version: String(record.version), ...action },
      'PATCH',
    );
  }

  bloodBank(token: string, facility: string) {
    return this.get('blood-bank', token, facility).pipe(
      map((value) => objectShape<BloodBankView>(value, ['requests', 'units'])),
    );
  }

  requestBloodComponent(
    token: string,
    facility: string,
    context: WardRecordVersion,
    component: BloodComponent,
  ) {
    return this.execute('inpatient-physician/blood-requests', token, facility, {
      ...this.wardVersions(context),
      component,
    });
  }

  withdrawBloodRequest(
    token: string,
    facility: string,
    context: WardRecordVersion,
    request: WardBloodRequest,
  ) {
    return this.execute(
      'inpatient-physician/blood-requests/withdraw',
      token,
      facility,
      { ...this.wardVersions(context), requestId: request.id, version: String(request.version) },
      'PATCH',
    );
  }

  updateBloodRequest(
    token: string,
    facility: string,
    request: WardBloodRequest,
    action: BloodAction,
  ) {
    return this.execute(
      'blood-bank/requests/status',
      token,
      facility,
      { requestId: request.id, version: String(request.version), ...action },
      'PATCH',
    );
  }

  availableTimes(
    token: string,
    facility: string,
    day: string,
    practitionerId: string,
    appointmentId: string,
    patientId = '',
  ) {
    return this.get('appointments/availability', token, facility, {
      day,
      practitionerId,
      appointmentId,
      ...(patientId ? { patientId } : {}),
    }).pipe(map(timeSlots));
  }

  portalAvailableTimes(token: string, facility: string, day: string, practitionerId: string) {
    return this.get('portal/availability', token, facility, { day, practitionerId }).pipe(
      map(timeSlots),
    );
  }

  bookingContext(token: string, facility: string, patientId: string) {
    return this.get('appointments/patient-context', token, facility, { patientId }).pipe(
      map((value) => objectShape<BookingContext>(value, ['recentClinician', 'followUps'])),
    );
  }

  clinicalContinuity(token: string, facility: string, encounterId: string) {
    return this.get('clinical/patient-context', token, facility, { encounterId }).pipe(
      map((value) => objectShape<ClinicalContinuity>(value, ['history', 'followUp'])),
    );
  }

  requestFollowUp(
    token: string,
    facility: string,
    fields: Pick<FollowUpRequest, 'encounterId' | 'startsOn' | 'endsOn' | 'purpose'>,
  ) {
    return this.execute('clinical/follow-ups', token, facility, fields);
  }

  withdrawFollowUp(
    token: string,
    facility: string,
    request: Pick<FollowUpRequest, 'id' | 'version'>,
  ) {
    return this.execute(
      'clinical/follow-ups/withdraw',
      token,
      facility,
      { followUpId: request.id, version: String(request.version) },
      'PATCH',
    );
  }

  bookFollowUp(
    token: string,
    facility: string,
    request: Pick<FollowUpSummary, 'id' | 'version'>,
    fields: { day: string; time: string; patientId?: string },
  ) {
    const path = fields.patientId ? 'appointments/follow-ups/book' : 'portal/follow-ups/book';
    return this.execute(path, token, facility, {
      followUpId: request.id,
      version: String(request.version),
      ...fields,
    });
  }

  bookPortalVisit(
    token: string,
    facility: string,
    fields: { practitionerId: string; day: string; time: string },
  ) {
    return this.execute('portal/appointments', token, facility, fields);
  }

  issuePortalPass(token: string, facility: string, appointmentId: string) {
    return this.execute('portal/passes', token, facility, { appointmentId });
  }

  schedulingDay(token: string, facility: string, day: string) {
    return this.get('scheduling', token, facility, { day }).pipe(
      map((value) =>
        objectShape<SchedulingDay>(value, ['practitioners', 'waitlist', 'exceptions']),
      ),
    );
  }

  schedulingPatients(token: string, facility: string, q: string) {
    return this.patients('appointments/options', token, facility, q).pipe(
      map((data) => data.patients),
    );
  }

  joinWaitlist(
    token: string,
    facility: string,
    fields: Pick<WaitlistEntry, 'patientId' | 'practitionerId' | 'day'>,
  ) {
    return this.execute('scheduling/waitlist', token, facility, fields);
  }

  changeWaitlist(
    token: string,
    facility: string,
    entry: Pick<WaitlistEntry, 'id' | 'version'>,
    action: { action: 'withdraw' } | { action: 'book'; time: string },
  ) {
    return this.execute(
      'scheduling/waitlist/status',
      token,
      facility,
      { entryId: entry.id, version: String(entry.version), ...action },
      'PATCH',
    );
  }

  createScheduleException(
    token: string,
    facility: string,
    fields: Pick<ScheduleException, 'practitionerId' | 'day' | 'start' | 'end' | 'reason'>,
  ) {
    return this.execute('scheduling/exceptions', token, facility, fields);
  }

  releaseScheduleException(token: string, facility: string, exceptionId: string) {
    return this.execute('scheduling/exceptions/release', token, facility, { exceptionId }, 'PATCH');
  }

  appointments(
    path: 'appointments' | 'queue' | 'clinical',
    token: string,
    facility: string,
    params: Record<string, string | number>,
  ) {
    return this.get(path, token, facility, params).pipe(
      map((value) => objectShape<AppointmentPage>(value, ['items', 'total'])),
    );
  }

  patients(
    path: 'patients' | 'appointments/options' | 'admissions/options' | 'queue/options',
    token: string,
    facility: string,
    q: string,
  ) {
    return this.get(path, token, facility, { q }).pipe(
      map((value) => objectShape<AccessOptions>(value, ['patients', 'practitioners'])),
    );
  }

  beds(token: string, facility: string) {
    return this.get('beds', token, facility).pipe(
      map((value) => objectShape<InpatientBoard>(value, ['beds', 'admissions'])),
    );
  }

  acuteView(token: string, facility: string, role: AcuteWorkspace, day: string) {
    return this.get(role, token, facility, { day }).pipe(
      map((value): AcuteView => {
        if (role === 'emergency')
          return objectShape<Extract<AcuteView, { kind: 'emergency' }>>(value, ['kind', 'cases']);
        if (role === 'critical-care')
          return objectShape<Extract<AcuteView, { kind: 'critical-care' }>>(value, [
            'kind',
            'patients',
            'occupied',
            'available',
          ]);
        return objectShape<Extract<AcuteView, { kind: 'operation-theatre' }>>(value, [
          'kind',
          'cases',
          'admissions',
        ]);
      }),
    );
  }

  emergencyPatients(token: string, facility: string, q: string) {
    return this.get('emergency/patients', token, facility, { q }).pipe(
      map((value) => collection<EmergencyRow['patient']>(value, ['id', 'name'])),
    );
  }

  recordEmergencyArrival(
    token: string,
    facility: string,
    fields: Pick<EmergencyCase, 'patientId' | 'arrival'>,
  ) {
    return this.execute('emergency/arrivals', token, facility, fields);
  }

  updateEmergencyVisit(
    token: string,
    facility: string,
    visit: Pick<EmergencyRow, 'id' | 'version'>,
    change:
      | { action: 'admit' | 'close' }
      | { action: 'assess'; priority: NonNullable<EmergencyCase['priority']> },
  ) {
    return this.execute(
      'emergency/visits/status',
      token,
      facility,
      { caseId: visit.id, version: String(visit.version), ...change },
      'PATCH',
    );
  }

  recordIcuReview(
    token: string,
    facility: string,
    record: Pick<IcuRow, 'admissionId' | 'version'>,
    fields: IcuReviewFields,
  ) {
    return this.execute('critical-care/reviews', token, facility, {
      admissionId: record.admissionId,
      version: String(record.version),
      ...fields,
    });
  }

  requestIcuStepDown(
    token: string,
    facility: string,
    record: Pick<IcuRow, 'admissionId' | 'version'>,
  ) {
    return this.execute('critical-care/step-downs', token, facility, {
      admissionId: record.admissionId,
      version: String(record.version),
    });
  }

  bookTheatreCase(token: string, facility: string, fields: TheatreBooking) {
    return this.execute('operation-theatre/cases', token, facility, fields);
  }

  updateTheatreCase(
    token: string,
    facility: string,
    record: Pick<TheatreRow, 'id' | 'version'>,
    action: TheatreAction,
  ) {
    return this.execute(
      'operation-theatre/cases/status',
      token,
      facility,
      { caseId: record.id, version: String(record.version), action },
      'PATCH',
    );
  }

  wardAssignment(token: string, facility: string, admissionId: string) {
    return this.get('admissions/care-team', token, facility, { admissionId }).pipe(
      map((value) =>
        objectShape<WardAssignmentOptions>(value, ['physicians', 'nurses', 'assignment']),
      ),
    );
  }

  assignWardTeam(
    token: string,
    facility: string,
    context: WardRecordVersion,
    team: { physician: string; nurse: string },
  ) {
    return this.execute(
      'admissions/care-team',
      token,
      facility,
      { ...this.wardVersions(context), ...team },
      'PATCH',
    );
  }

  wardWorklist(token: string, facility: string, role: WardRole) {
    return this.get(role, token, facility).pipe(
      map((value) =>
        collection<WardWorklistRow>(value, [
          'admission',
          'patient',
          'bed',
          'openTasks',
          'completedTasks',
        ]),
      ),
    );
  }

  wardDetail(token: string, facility: string, role: WardRole, admissionId: string) {
    return this.get(role + '/detail', token, facility, { admissionId }).pipe(
      map((value) =>
        objectShape<WardDetail>(value, [
          'admission',
          'patient',
          'bed',
          'team',
          'rounds',
          'observations',
          'orders',
        ]),
      ),
    );
  }

  recordWardRound(
    token: string,
    facility: string,
    context: WardRecordVersion,
    fields: RoundFields,
  ) {
    return this.execute('inpatient-physician/rounds', token, facility, {
      ...this.wardVersions(context),
      ...fields,
    });
  }

  saveDischargePlan(
    token: string,
    facility: string,
    context: WardRecordVersion,
    planVersion: number,
    fields: DischargeFields,
  ) {
    return this.execute('inpatient-physician/discharge-summary', token, facility, {
      ...this.wardVersions(context),
      planVersion: String(planVersion),
      ...fields,
    });
  }

  signDischargePlan(
    token: string,
    facility: string,
    context: WardRecordVersion,
    planVersion: number,
  ) {
    return this.execute(
      'inpatient-physician/discharge-summary/sign',
      token,
      facility,
      {
        ...this.wardVersions(context),
        planVersion: String(planVersion),
      },
      'PATCH',
    );
  }

  admissionDischargeDocument(token: string, facility: string, admissionId: string) {
    return this.get('admissions/discharge-summary', token, facility, { admissionId }).pipe(
      map((value) =>
        objectShape<DischargeDocument>(value, [
          'admissionId',
          'patientName',
          'releasedAt',
          'signedBy',
          'destination',
          'course',
          'followUp',
        ]),
      ),
    );
  }

  placeWardOrder(token: string, facility: string, context: WardRecordVersion, kind: WardOrderKind) {
    return this.execute('inpatient-physician/orders', token, facility, {
      ...this.wardVersions(context),
      kind,
    });
  }

  recordWardObservation(
    token: string,
    facility: string,
    context: WardRecordVersion,
    fields: ObservationFields,
  ) {
    return this.execute('nursing-station/observations', token, facility, {
      ...this.wardVersions(context),
      ...fields,
    });
  }

  updateWardTask(
    token: string,
    facility: string,
    context: WardRecordVersion,
    task: Pick<NursingTask, 'id' | 'version'>,
    command: { action: 'cancel' | 'start' } | { action: 'complete'; result: ObservationResult },
  ) {
    const path =
      command.action === 'cancel'
        ? 'inpatient-physician/orders/cancel'
        : 'nursing-station/tasks/' + command.action;
    return this.execute(
      path,
      token,
      facility,
      {
        ...this.wardVersions(context),
        taskId: task.id,
        taskVersion: String(task.version),
        ...(command.action === 'complete' ? { result: command.result } : {}),
      },
      'PATCH',
    );
  }

  private wardVersions(context: WardRecordVersion) {
    return {
      admissionId: context.admissionId,
      admissionVersion: String(context.admissionVersion),
      assignmentVersion: String(context.assignmentVersion),
    };
  }

  laboratory(token: string, facility: string, params: Record<string, string | number>) {
    return this.get('laboratory', token, facility, params).pipe(
      map((value) =>
        objectShape<{
          statuses: { status: LabStage; count: number }[];
          items: LabRow[];
          total: number;
        }>(value, ['statuses', 'items', 'total']),
      ),
    );
  }

  portal(token: string, facility: string) {
    return this.get('portal', token, facility).pipe(
      map((value) =>
        objectShape<PatientPortal>(value, [
          'patient',
          'clinicians',
          'appointments',
          'records',
          'dischargeSummaries',
          'imagingReports',
          'medications',
          'followUps',
          'invoices',
        ]),
      ),
    );
  }

  queueDisplay(facility: string) {
    return this.http
      .get<unknown>(this.base + 'queue-display', { params: { facility } })
      .pipe(
        map((value) => objectShape<QueueDisplayData>(value, ['facility', 'calling', 'waiting'])),
      );
  }

  invoices(token: string, facility: string, day: string) {
    return this.get('billing', token, facility, { day }).pipe(
      map((value) =>
        collection<InvoiceRow>(value, [
          'invoice',
          'patient',
          'balanceMinor',
          'totalMinor',
          'creditedMinor',
          'reviewMinor',
        ]),
      ),
    );
  }

  inpatientBilling(token: string, facility: string) {
    return this.get('billing/inpatient', token, facility).pipe(
      map((value) =>
        collection<InpatientBillingRow>(value, [
          'admissionId',
          'patient',
          'status',
          'coverage',
          'chargeDays',
          'totalMinor',
        ]),
      ),
    );
  }

  inpatientBillDetail(token: string, facility: string, admissionId: string) {
    return this.get('billing/inpatient/detail', token, facility, { admissionId }).pipe(
      map((value) =>
        objectShape<InpatientBillingDetail>(value, [
          'admissionId',
          'patient',
          'status',
          'coverage',
          'charges',
          'totalMinor',
        ]),
      ),
    );
  }

  issueInpatientInvoice(
    token: string,
    facility: string,
    admissionId: string,
    acknowledgePartial: boolean,
  ) {
    return this.execute('billing/inpatient/invoices', token, facility, {
      admissionId,
      acknowledgePartial: String(acknowledgePartial),
    });
  }

  finance(token: string, facility: string, day: string) {
    return this.get('finance', token, facility, { day }).pipe(
      map((value) => objectShape<FinanceData>(value, ['summary', 'reviews'])),
    );
  }

  closeCollections(token: string, facility: string, day: string, countedMinor: number) {
    return this.execute('finance/closes', token, facility, {
      day,
      countedMinor: String(countedMinor),
    });
  }

  decideRefund(token: string, facility: string, movementId: string, outcome: RefundOutcome) {
    return this.execute('finance/refund-reviews', token, facility, { movementId, outcome });
  }

  insurance(token: string, facility: string, day: string) {
    return this.get('insurance', token, facility, { day }).pipe(
      map((value) =>
        collection<InsuranceRow>(value, [
          'invoiceId',
          'patientId',
          'patientName',
          'service',
          'coverages',
          'balanceMinor',
        ]),
      ),
    );
  }

  recordCoverage(token: string, facility: string, invoiceId: string, fields: CoverageFields) {
    return this.execute('insurance/coverage', token, facility, { invoiceId, ...fields });
  }

  requestClaim(token: string, facility: string, invoiceId: string, coverageId: string) {
    return this.execute('insurance/claims', token, facility, { invoiceId, coverageId });
  }

  changeClaim(token: string, facility: string, claim: InsuranceClaim, command: ClaimAction) {
    const { action } = command;
    return this.execute(
      'insurance/claims/status',
      token,
      facility,
      {
        claimId: claim.id,
        version: String(claim.version),
        action,
        ...(action === 'authorise' ? { approvedMinor: String(command.approvedMinor) } : {}),
      },
      'PATCH',
    );
  }

  inventory(token: string, facility: string) {
    return this.get('inventory', token, facility).pipe(
      map((value) => objectShape<InventoryData>(value, ['lots', 'requisitions', 'orders'])),
    );
  }

  procurement(token: string, facility: string) {
    return this.get('procurement', token, facility).pipe(
      map((value) => objectShape<ProcurementData>(value, ['requisitions', 'orders', 'suppliers'])),
    );
  }

  recordRequisition(token: string, facility: string, fields: RequisitionFields) {
    return this.execute('inventory/requisitions', token, facility, {
      ...fields,
      quantity: String(fields.quantity),
    });
  }

  changeRequisition(
    token: string,
    facility: string,
    record: Requisition,
    decision: 'approve' | 'reject' | 'withdraw',
  ) {
    const path =
      decision === 'withdraw'
        ? 'inventory/requisitions/withdraw'
        : 'procurement/requisitions/status';
    return this.execute(
      path,
      token,
      facility,
      { requisitionId: record.id, version: String(record.version), decision },
      'PATCH',
    );
  }

  issuePurchaseOrder(token: string, facility: string, record: Requisition, supplierId: string) {
    return this.execute('procurement/orders', token, facility, {
      requisitionId: record.id,
      version: String(record.version),
      supplierId,
    });
  }

  cancelPurchaseOrder(token: string, facility: string, order: PurchaseOrder) {
    return this.execute(
      'procurement/orders/cancel',
      token,
      facility,
      { purchaseOrderId: order.id, version: String(order.version) },
      'PATCH',
    );
  }

  postGoodsReceipt(token: string, facility: string, fields: ReceiptFields) {
    return this.execute('inventory/goods-receipts', token, facility, {
      ...fields,
      version: String(fields.version),
      quantity: String(fields.quantity),
    });
  }

  recordStockCount(token: string, facility: string, fields: CountFields) {
    return this.execute('inventory/counts', token, facility, {
      ...fields,
      expectedOnHand: String(fields.expectedOnHand),
      countedOnHand: String(fields.countedOnHand),
    });
  }

  workforce(token: string, facility: string, day: string) {
    return this.get('workforce', token, facility, { day }).pipe(
      map((value) => objectShape<WorkforceData>(value, ['members', 'shifts'])),
    );
  }

  scheduleShift(token: string, facility: string, fields: ShiftFields) {
    return this.execute('workforce/shifts', token, facility, {
      ...fields,
      membershipVersion: String(fields.membershipVersion),
    });
  }

  recordAttendance(token: string, facility: string, shift: StaffShift, action: ShiftAction) {
    return this.execute(
      'workforce/shifts/status',
      token,
      facility,
      { shiftId: shift.id, version: String(shift.version), action },
      'PATCH',
    );
  }

  biomedical(token: string, facility: string) {
    return this.get('biomedical', token, facility).pipe(
      map((value) => objectShape<BiomedicalData>(value, ['equipment', 'orders'])),
    );
  }

  registerEquipment(token: string, facility: string, fields: EquipmentFields) {
    return this.execute('biomedical/equipment', token, facility, { ...fields });
  }

  openMaintenance(
    token: string,
    facility: string,
    asset: BiomedicalAsset,
    reason: MaintenanceReason,
  ) {
    return this.execute('biomedical/maintenance', token, facility, {
      assetId: asset.id,
      version: String(asset.version),
      reason,
    });
  }

  updateMaintenance(
    token: string,
    facility: string,
    order: MaintenanceOrder,
    action: MaintenanceAction,
    verified: boolean,
  ) {
    return this.execute(
      'biomedical/maintenance/status',
      token,
      facility,
      { orderId: order.id, version: String(order.version), action, verified: String(verified) },
      'PATCH',
    );
  }

  hospitalSupport(token: string, facility: string) {
    return this.get('hospital-support', token, facility).pipe(
      map((value) => objectShape<SupportData>(value, ['locations', 'tasks'])),
    );
  }

  requestSupport(token: string, facility: string, fields: SupportFields) {
    return this.execute('hospital-support/tasks', token, facility, { ...fields });
  }

  updateSupport(token: string, facility: string, task: SupportTask, action: SupportAction) {
    return this.execute(
      'hospital-support/tasks/status',
      token,
      facility,
      { taskId: task.id, version: String(task.version), action },
      'PATCH',
    );
  }

  patientTransport(token: string, facility: string) {
    return this.get('patient-transport', token, facility).pipe(
      map((value) => objectShape<TransportData>(value, ['admissions', 'trips', 'units'])),
    );
  }

  requestTransport(token: string, facility: string, fields: TransportFields) {
    return this.execute('patient-transport/trips', token, facility, {
      ...fields,
      admissionVersion: String(fields.admissionVersion),
    });
  }

  updateTransport(
    token: string,
    facility: string,
    trip: TransportRequest,
    action: TransportAction,
    unitId: string,
  ) {
    return this.execute(
      'patient-transport/trips/status',
      token,
      facility,
      { tripId: trip.id, version: String(trip.version), action, ...(unitId ? { unitId } : {}) },
      'PATCH',
    );
  }

  crm(token: string, facility: string) {
    return this.get('crm', token, facility).pipe(
      map((value) => objectShape<CrmData>(value, ['enquiries', 'agents', 'practitioners'])),
    );
  }

  crmPatients(token: string, facility: string, q: string) {
    return this.get('crm/patients', token, facility, { q }).pipe(
      map((value) => collection<EnquiryPatient>(value, ['id', 'name'])),
    );
  }

  crmTimes(
    token: string,
    facility: string,
    enquiryId: string,
    practitionerId: string,
    day: string,
  ) {
    return this.get('crm/availability', token, facility, { enquiryId, practitionerId, day }).pipe(
      map((value) => {
        if (!Array.isArray(value) || value.some((item) => typeof item !== 'string'))
          throw new Error('Appointment times are unavailable.');
        return value as string[];
      }),
    );
  }

  captureEnquiry(token: string, facility: string, fields: EnquiryFields) {
    return this.execute('crm/enquiries', token, facility, { ...fields });
  }

  updateEnquiry(token: string, facility: string, enquiry: Enquiry, update: EnquiryUpdate) {
    return this.execute(
      'crm/enquiries/status',
      token,
      facility,
      { enquiryId: enquiry.id, version: String(enquiry.version), ...update },
      'PATCH',
    );
  }

  marketing(token: string, facility: string) {
    return this.get('marketing', token, facility).pipe(
      map((value) => objectShape<MarketingData>(value, ['campaigns', 'conversions', 'audience'])),
    );
  }

  draftCampaign(
    token: string,
    facility: string,
    channel: EngagementChannel,
    template: CampaignTemplate,
  ) {
    return this.execute('marketing/campaigns', token, facility, { channel, template });
  }

  updateCampaign(token: string, facility: string, campaign: Campaign, action: CampaignAction) {
    return this.execute(
      'marketing/campaigns/status',
      token,
      facility,
      { campaignId: campaign.id, version: String(campaign.version), action },
      'PATCH',
    );
  }

  contactPreferences(token: string, facility: string) {
    return this.get('portal/contact-preferences', token, facility).pipe(
      map((value) => objectShape<ContactPreferences>(value, ['email', 'sms', 'version'])),
    );
  }

  saveContactPreferences(token: string, facility: string, prefs: ContactPreferences) {
    return this.execute(
      'portal/contact-preferences',
      token,
      facility,
      { email: String(prefs.email), sms: String(prefs.sms), version: String(prefs.version) },
      'PATCH',
    );
  }

  analytics(token: string, facility: string, end: string, window: AnalyticsWindow) {
    return this.get('analytics', token, facility, { end, window }).pipe(
      map((value) => objectShape<AnalyticsReport>(value, ['days', 'specialties'])),
    );
  }

  automation(token: string, facility: string) {
    return this.get('automation', token, facility).pipe(
      map((value) =>
        objectShape<AutomationData>(value, ['policy', 'usage', 'sources', 'drafts', 'activity']),
      ),
    );
  }

  configureAutomation(token: string, facility: string, policy: DocumentationPolicy) {
    return this.execute(
      'automation/policy',
      token,
      facility,
      {
        version: String(policy.version),
        enabled: String(policy.enabled),
        dailyLimit: String(policy.dailyLimit),
      },
      'PATCH',
    );
  }

  requestDocumentationDraft(token: string, facility: string, encounterId: string) {
    return this.execute('automation/drafts', token, facility, { encounterId });
  }

  reviewDocumentationDraft(
    token: string,
    facility: string,
    draft: DocumentationDraft,
    action: DraftAction,
    format?: DocumentationFormat,
  ) {
    return this.execute(
      'automation/drafts/status',
      token,
      facility,
      { draftId: draft.id, version: String(draft.version), action, ...(format ? { format } : {}) },
      'PATCH',
    );
  }

  invoiceOptions(token: string, facility: string, day: string) {
    return firstValueFrom(
      this.get('billing/options', token, facility, { day }).pipe(
        map((value) => objectShape<BillingOptions>(value, ['services', 'encounters'])),
      ),
    );
  }

  execute(
    path: string,
    token: string,
    facility: string,
    body: Record<string, string>,
    method: 'POST' | 'PATCH' = 'POST',
  ) {
    return this.mutate<CommandResult>(path, token, facility, body, method, ['id']);
  }

  integrations(token: string) {
    return this.get('integrations', token).pipe(
      map((value) =>
        objectShape<IntegrationDashboard>(value, [
          'connectors',
          'facilities',
          'recipients',
          'audit',
        ]),
      ),
    );
  }

  registerConnector(
    token: string,
    profile: Pick<Connector, 'facilityId' | 'name' | 'recipientAccount' | 'standard'>,
  ) {
    return this.execute('integrations/connectors', token, '', profile);
  }

  updateConnector(
    token: string,
    connector: Pick<Connector, 'id' | 'version'>,
    action: ConnectorAction,
  ) {
    return this.execute(
      'integrations/connectors',
      token,
      '',
      {
        connectorId: connector.id,
        version: String(connector.version),
        action,
      },
      'PATCH',
    );
  }

  recordRequests(token: string) {
    return this.get('record-requests', token).pipe(
      map((value) =>
        collection<RequestSummary>(value, [
          'id',
          'connector',
          'source',
          'purpose',
          'status',
          'version',
          'createdAt',
        ]),
      ),
    );
  }

  requestReport(token: string, request: { code: string; purpose: RecordRequest['purpose'] }) {
    return this.execute('record-requests', token, '', request);
  }

  clinicalGovernance(token: string, facility: string, params: Record<string, string | number>) {
    return this.get('clinical-governance', token, facility, params).pipe(
      map((value) =>
        objectShape<GovernanceData>(value, [
          'encounters',
          'signedNotes',
          'flaggedReports',
          'pendingReviews',
          'total',
          'items',
        ]),
      ),
    );
  }

  recordClinicalReview(
    token: string,
    facility: string,
    reportId: string,
    version: number,
    action: 'acknowledge' | 'refer',
  ) {
    return this.execute('clinical-governance/reviews', token, facility, {
      reportId,
      version: String(version),
      action,
    });
  }

  qualityRegister(token: string, facility: string) {
    return this.get('quality', token, facility).pipe(
      map((value) =>
        collection<QualityView>(value, [
          'id',
          'title',
          'status',
          'category',
          'priority',
          'version',
          'timeline',
          'ownedByCurrentUser',
        ]),
      ),
    );
  }

  openQualityCase(
    token: string,
    facility: string,
    fields: Pick<QualityCase, 'title' | 'priority'> & {
      category: Exclude<QualityCase['category'], 'Diagnostic follow-up'>;
    },
  ) {
    return this.execute('quality/cases', token, facility, fields);
  }

  updateQualityCase(
    token: string,
    facility: string,
    item: Pick<QualityCase, 'id' | 'version'>,
    action: 'claim' | 'resolve',
    disposition?: Disposition,
  ) {
    return this.execute(
      'quality/cases/status',
      token,
      facility,
      {
        caseId: item.id,
        version: String(item.version),
        action,
        ...(disposition ? { disposition } : {}),
      },
      'PATCH',
    );
  }

  patientSharing(token: string, facility: string) {
    return this.get('portal/sharing', token, facility).pipe(
      map((value) =>
        objectShape<PatientSharing>(value, ['connectors', 'requests', 'audit', 'reports']),
      ),
    );
  }

  decideReportConsent(
    token: string,
    facility: string,
    request: Pick<RequestSummary, 'id' | 'version'>,
    action: ConsentAction,
    grant?: { reportId: string; hours: string },
  ) {
    return this.execute(
      'portal/sharing',
      token,
      facility,
      {
        requestId: request.id,
        version: String(request.version),
        action,
        ...grant,
      },
      'PATCH',
    );
  }

  matchingCode(token: string, facility: string, connectorId: string) {
    return this.mutate<{ id: string; code: string; expiresAt: number }>(
      'portal/matching-code',
      token,
      facility,
      { connectorId },
      'POST',
      ['id', 'code', 'expiresAt'],
    );
  }

  async sharedReport(token: string, requestId: string) {
    const response = await this.mutate<{ id: string; report: unknown }>(
      'record-requests/retrieve',
      token,
      '',
      { requestId },
      'POST',
      ['id', 'report'],
    );
    return objectShape<SharedReport>(response.report, [
      'test',
      'finding',
      'accession',
      'source',
      'publishedAt',
      'expiresAt',
    ]);
  }

  private mutate<T>(
    path: string,
    token: string,
    facility: string,
    body: Record<string, string>,
    method: 'POST' | 'PATCH',
    required: readonly (keyof T)[],
  ) {
    return firstValueFrom(
      this.http
        .request<unknown>(method, this.base + path, {
          body,
          headers: this.headers(token, facility),
        })
        .pipe(map((value) => objectShape<T>(value, required))),
    );
  }

  private get(
    path: string,
    token: string,
    facility?: string,
    params?: Record<string, string | number>,
  ) {
    return this.http.get<unknown>(this.base + path, {
      headers: this.headers(token, facility),
      params,
    });
  }

  private headers(token: string, facility?: string) {
    const headers = new HttpHeaders({ Authorization: 'Bearer ' + token });
    return facility ? headers.set('X-Facility-Id', facility) : headers;
  }

  private sessionShape(value: unknown) {
    return objectShape<Session>(value, [
      'account',
      'token',
      'name',
      'workspaces',
      'writes',
      'facilityIds',
      'facilityAccess',
      'expiresAt',
    ]);
  }
}
