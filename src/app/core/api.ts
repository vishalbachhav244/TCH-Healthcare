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
import type { PatientPortal } from '../domain/portal';
import type { PlatformData } from '../domain/platform';
import type { SubscriptionRow } from '../domain/platform';
import type { NetworkFacilityMetrics } from '../domain/operations';
import type { PharmacyData, Prescription } from '../domain/pharmacy';
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
      map((value) => objectShape<PharmacyData>(value, ['prescriptions', 'lots'])),
    );
  }

  prescriptions(token: string, facility: string, encounterId: string) {
    return this.get('clinical/prescriptions', token, facility, { encounterId }).pipe(
      map((value) => collection<Prescription>(value, ['id', 'productId', 'quantity', 'status'])),
    );
  }

  availableTimes(
    token: string,
    facility: string,
    day: string,
    practitionerId: string,
    appointmentId: string,
  ) {
    return this.get('appointments/availability', token, facility, {
      day,
      practitionerId,
      appointmentId,
    }).pipe(
      map((value) => {
        if (!Array.isArray(value) || value.some((time) => typeof time !== 'string'))
          throw new Error('The workspace returned invalid appointment times.');
        return value as string[];
      }),
    );
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
        collection<InvoiceRow>(value, ['invoice', 'patient', 'balanceMinor', 'totalMinor']),
      ),
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
