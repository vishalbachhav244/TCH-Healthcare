import { Injectable, computed, inject, signal } from '@angular/core';
import { Api } from './api';
import { evaluationAvailable } from './evaluation';
import { configurationChanges } from './events';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, EMPTY, from, switchMap } from 'rxjs';
import {
  inpatientWorkspaces,
  navigation,
  platformResources,
  type Resource,
} from '../domain/workspaces';
import type { Facility, Session } from '../domain/operations';

@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly api = inject(Api);
  private readonly identity = signal<Session | undefined>(undefined);
  private readonly allowedFacilities = signal<Facility[]>([]);
  private readonly facilityId = signal('');
  private expiry?: ReturnType<typeof setTimeout>;
  private restorePromise?: Promise<void>;
  readonly session = this.identity.asReadonly();
  readonly facilities = this.allowedFacilities.asReadonly();
  readonly facility = computed(() =>
    this.facilities().find((facility) => facility.id === this.facilityId()),
  );
  readonly entries = computed(() => navigation.filter((entry) => this.allowed(entry.resource)));
  readonly initialRoute = computed<Resource | 'denied'>(
    () => this.entries().at(0)?.resource ?? 'denied',
  );
  readonly home = computed(() =>
    this.initialRoute() === 'denied' ? '/denied' : '/work/' + this.initialRoute(),
  );
  private readonly access = computed(
    () => this.session()?.facilityAccess[this.facility()?.id ?? ''],
  );

  constructor() {
    configurationChanges
      .pipe(
        switchMap(() => {
          const token = this.session()?.token;
          return token
            ? from(Promise.all([this.api.session(token), this.api.facilities(token)])).pipe(
                catchError(() => EMPTY),
              )
            : EMPTY;
        }),
        takeUntilDestroyed(),
      )
      .subscribe(([session, facilities]) => {
        if (this.session()?.token === session.token) this.applyAccess(session, facilities);
      });
  }

  restore() {
    return (this.restorePromise ??= this.restoreFromStorage());
  }

  private async restoreFromStorage() {
    const token = evaluationAvailable ? sessionStorage.getItem('truecare-session') : null;
    if (!token) return;
    try {
      await this.accept(await this.api.session(token));
    } catch {
      this.clear();
    }
  }

  async signIn(account: string, password: string) {
    await this.accept(await this.api.login(account, password));
  }

  async signOut() {
    const token = this.session()?.token;
    this.clear();
    if (token) await this.api.logout(token).catch(() => undefined);
  }

  allowed(resource: Resource) {
    const entry = navigation.find((item) => item.resource === resource);
    return (
      !!entry &&
      (platformResources.includes(resource)
        ? !!this.session()?.workspaces.includes(entry.workspace) && this.canPerform(resource)
        : !!this.access()?.workspaces.includes(entry.workspace)) &&
      (!inpatientWorkspaces.has(entry.workspace) || !!this.facility()?.inpatient)
    );
  }

  writeAllowed(resource: Resource) {
    return this.allowed(resource) && this.canPerform(resource);
  }

  canPerform(action: string) {
    return platformResources.includes(action)
      ? !!this.session()?.writes.includes(action)
      : !!this.access()?.writes.includes(action);
  }

  selectFacility(id: string) {
    if (!this.facilities().some((item) => item.id === id)) return;
    this.facilityId.set(id);
    sessionStorage.setItem('truecare-facility', id);
  }

  private async accept(session: Session) {
    this.applyAccess(session, await this.api.facilities(session.token));
    sessionStorage.setItem('truecare-session', session.token);
    clearTimeout(this.expiry);
    this.expiry = setTimeout(() => this.clear(), Math.max(0, session.expiresAt - Date.now()));
  }

  private applyAccess(session: Session, facilities: Facility[]) {
    this.allowedFacilities.set(
      facilities.filter((facility) => !!session.facilityAccess[facility.id]),
    );
    const storedFacility = sessionStorage.getItem('truecare-facility');
    const selected =
      this.facilities().find((facility) => facility.id === storedFacility) ?? this.facilities()[0];
    if (selected) this.selectFacility(selected.id);
    else {
      this.facilityId.set('');
      sessionStorage.removeItem('truecare-facility');
    }
    this.identity.set(session);
  }

  private clear() {
    clearTimeout(this.expiry);
    this.identity.set(undefined);
    this.allowedFacilities.set([]);
    this.facilityId.set('');
    sessionStorage.removeItem('truecare-session');
    sessionStorage.removeItem('truecare-facility');
  }
}
