import { Injectable, computed, inject, signal } from '@angular/core';
import { Api } from './api';
import { evaluationAvailable } from './evaluation';
import { configurationChanges } from './events';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { navigation, type Resource } from '../domain/workspaces';
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
  readonly initialRoute = computed(() => this.entries()[0]?.resource ?? 'denied');

  constructor() {
    configurationChanges.pipe(takeUntilDestroyed()).subscribe((facilityId) => {
      const session = this.session();
      if (session?.facilityIds.includes(facilityId)) {
        void this.api
          .facilities(session.token)
          .then((facilities) => {
            if (this.session()?.token === session.token) this.allowedFacilities.set(facilities);
          })
          .catch(() => undefined);
      }
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
      !!this.session()?.workspaces.includes(entry.workspace) &&
      (resource === 'platform' || !!this.facility()) &&
      (resource !== 'beds' || !!this.facility()?.inpatient)
    );
  }

  writeAllowed(resource: Resource) {
    return this.allowed(resource) && !!this.session()?.writes.includes(resource);
  }

  selectFacility(id: string) {
    if (!this.facilities().some((item) => item.id === id)) return;
    this.facilityId.set(id);
    sessionStorage.setItem('truecare-facility', id);
  }

  private async accept(session: Session) {
    this.allowedFacilities.set(await this.api.facilities(session.token));
    const storedFacility = sessionStorage.getItem('truecare-facility');
    this.selectFacility(
      this.facilities().find((facility) => facility.id === storedFacility)?.id ??
        this.facilities()[0]?.id ??
        '',
    );
    sessionStorage.setItem('truecare-session', session.token);
    this.identity.set(session);
    clearTimeout(this.expiry);
    this.expiry = setTimeout(() => this.clear(), Math.max(0, session.expiresAt - Date.now()));
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
