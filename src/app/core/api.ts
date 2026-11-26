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
    return firstValueFrom(
      this.http
        .request<unknown>(method, this.base + path, {
          body,
          headers: this.headers(token, facility),
        })
        .pipe(map((value) => objectShape<CommandResult>(value, ['id']))),
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
