import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { firstValueFrom } from 'rxjs';
import { Api, errorMessage } from '../core/api';
import { downloadDocument } from '../core/download';
import { facilityQuery } from '../core/query';
import { SessionStore } from '../core/session';
import { StatusTone } from '../design-system/format';
import {
  familyAccessDurations,
  type FamilyAccessDuration,
  type FamilyAccessEntry,
  type FamilyAccessUpdate,
} from '../domain/family-access';
import { dayInIndia, shiftDay } from '../domain/operations';
import type { DocumentSummary } from '../domain/patient-documents';

type FamilyAction =
  | { kind: 'grant' | 'revoke' | 'book'; access: FamilyAccessEntry }
  | { kind: 'pass'; access: FamilyAccessEntry; appointmentId: string; appointmentVersion: number }
  | { kind: 'document'; access: FamilyAccessEntry; record: DocumentSummary };

@Component({
  selector: 'tc-family-access',
  imports: [DatePipe, NgIcon, ReactiveFormsModule, StatusTone],
  templateUrl: './family-access.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FamilyAccess {
  private readonly api = inject(Api);
  private readonly session = inject(SessionStore);
  private readonly forms = inject(NonNullableFormBuilder);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('editor');
  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');
  protected readonly reload = signal(0);
  protected readonly today = dayInIndia();
  protected readonly latest = shiftDay(this.today, 90);
  protected readonly durations = familyAccessDurations;
  protected readonly selected = signal('');
  private readonly expired = signal<number | undefined>(undefined);
  protected readonly action = signal<FamilyAction | undefined>(undefined);
  protected readonly busy = signal(false);
  protected readonly notice = signal('');
  protected readonly error = signal('');
  protected readonly pass = signal('');
  protected readonly qr = signal('');
  protected readonly more = signal(6);
  protected readonly permissions = this.forms.group({
    appointments: false,
    documents: false,
    hours: this.forms.control<FamilyAccessDuration>(24),
  });
  protected readonly booking = this.forms.group({
    practitionerId: ['', Validators.required],
    day: [this.today, Validators.required],
    time: ['', Validators.required],
  });
  private readonly clinician = toSignal(this.booking.controls.practitionerId.valueChanges, {
    initialValue: '',
  });
  private readonly day = toSignal(this.booking.controls.day.valueChanges, {
    initialValue: this.today,
  });
  private readonly scope = computed(() => ({
    token: this.session.session()?.token ?? '',
    facility: this.session.facility()?.id ?? '',
    reload: this.reload(),
  }));
  protected readonly entries = facilityQuery(this.scope, ({ token, facility }) =>
    this.api.familyAccess(token, facility),
  );
  protected readonly profile = computed(() => {
    const entries = this.entries();
    return entries.state === 'ready'
      ? entries.data.find(
          (row) =>
            row.id === this.selected() &&
            row.direction === 'received' &&
            row.status === 'Active' &&
            row.expiresAt !== this.expired(),
        )
      : undefined;
  });
  private readonly careScope = computed(() => {
    const scope = this.scope();
    const profile = this.profile();
    return {
      ...scope,
      facility: profile ? scope.facility : '',
      id: profile?.id ?? '',
      version: profile?.version,
    };
  });
  protected readonly care = facilityQuery(this.careScope, ({ token, facility, id }) =>
    this.api.familyCare(token, facility, id),
  );
  protected readonly currentPass = computed(() => {
    const action = this.action();
    const care = this.care();
    return (
      action?.kind === 'pass' &&
      action.access.version === this.profile()?.version &&
      care.state === 'ready' &&
      care.data.access.version === action.access.version &&
      care.data.appointments.some(
        ({ appointment }) =>
          appointment.id === action.appointmentId &&
          appointment.version === action.appointmentVersion &&
          appointment.status === 'Booked',
      )
    );
  });
  private readonly availabilityScope = computed(() => {
    const scope = this.careScope();
    const day = this.day();
    const clinician = this.clinician();
    const booking =
      this.profile()?.permissions.appointments &&
      this.action()?.kind === 'book' &&
      clinician &&
      day >= this.today &&
      day <= this.latest;
    return { ...scope, facility: booking ? scope.facility : '', day, clinician };
  });
  protected readonly slots = facilityQuery(
    this.availabilityScope,
    ({ token, facility, id, day, clinician }) =>
      this.api.familyAvailableTimes(token, facility, id, day, clinician),
  );
  private readonly previewScope = computed(() => {
    const scope = this.careScope();
    const action = this.action();
    return {
      ...scope,
      facility:
        this.profile()?.permissions.documents && action?.kind === 'document' ? scope.facility : '',
      record: action?.kind === 'document' ? action.record : undefined,
    };
  });
  protected readonly preview = facilityQuery(this.previewScope, ({ token, facility, id, record }) =>
    this.api.familyDocument(token, facility, id, record!),
  );

  constructor() {
    effect((cleanup) => {
      const entries = this.entries();
      if (entries.state !== 'ready') return;
      const next = entries.data
        .flatMap((row) => (row.status === 'Active' && row.expiresAt ? [row.expiresAt] : []))
        .sort((a, b) => a - b)[0];
      if (next === undefined) return;
      const timeout = setTimeout(
        () => {
          this.expired.set(next);
          this.refresh();
        },
        Math.max(0, next - Date.now()),
      );
      cleanup(() => clearTimeout(timeout));
    });
    effect(() => {
      const entries = this.entries();
      const action = this.action();
      if (entries.state === 'loading' || !this.selected()) return;
      const profile = this.profile();
      if (!profile) {
        this.selected.set('');
        this.notice.set('Family access is no longer available.');
      }
      if (
        action?.access.direction === 'received' &&
        (!profile || profile.version !== action.access.version)
      ) {
        this.close();
        this.heading().nativeElement.focus();
      }
    });
    effect(() => {
      const action = this.action();
      const care = this.care();
      if (
        action?.kind === 'pass' &&
        this.profile()?.version === action.access.version &&
        care.state === 'ready' &&
        care.data.access.version === action.access.version &&
        !this.currentPass()
      ) {
        this.close();
        this.notice.set('This family appointment pass is no longer available.');
        this.heading().nativeElement.focus();
      }
    });
  }

  protected refresh() {
    this.reload.update((value) => value + 1);
  }

  protected pick(access?: FamilyAccessEntry) {
    this.notice.set('');
    this.more.set(6);
    this.selected.set(access?.id ?? '');
  }

  protected open(action: FamilyAction) {
    if (this.busy()) return;
    this.notice.set('');
    this.error.set('');
    if (action.kind === 'grant') {
      this.permissions.reset({
        appointments: action.access.status === 'Active' && action.access.permissions.appointments,
        documents: action.access.status === 'Active' && action.access.permissions.documents,
        hours: 24,
      });
    }
    if (action.kind === 'book') this.booking.reset();
    this.action.set(action);
    this.dialog().nativeElement.showModal();
    if (action.kind === 'pass') void this.issuePass(action);
  }

  protected close() {
    this.action.set(undefined);
    this.pass.set('');
    this.qr.set('');
    this.dialog().nativeElement.close();
  }

  protected async changeAccess(access: FamilyAccessEntry, action: 'grant' | 'revoke') {
    const { token, facility } = this.scope();
    const { hours, ...permissions } = this.permissions.getRawValue();
    const update: FamilyAccessUpdate =
      action === 'grant' ? { action, permissions, hours } : { action };
    await this.submit(
      () => this.api.updateFamilyAccess(token, facility, access, update),
      action === 'grant' ? 'Family access saved.' : 'Family access revoked.',
    );
  }

  protected async book(access: FamilyAccessEntry) {
    const { token, facility } = this.scope();
    const slots = this.slots();
    const booking = this.booking.getRawValue();
    if (this.booking.invalid || slots.state !== 'ready' || !slots.data.includes(booking.time)) {
      this.error.set('Choose a clinician, date and available time.');
      return;
    }
    await this.submit(
      () => this.api.bookFamilyVisit(token, facility, access.id, booking),
      'Appointment booked for ' + access.name + '.',
    );
  }

  protected async downloadSharedDocument() {
    const action = this.action();
    if (action?.kind !== 'document' || this.busy()) return;
    const { token, facility } = this.scope();
    this.busy.set(true);
    this.error.set('');
    try {
      const detail = await firstValueFrom(
        this.api.familyDocument(token, facility, action.access.id, action.record),
      );
      if (this.action() === action && this.profile()?.version === action.access.version)
        downloadDocument(detail.file);
    } catch (error) {
      if (this.action() === action) this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  private async issuePass(action: Extract<FamilyAction, { kind: 'pass' }>) {
    const { token, facility } = this.scope();
    this.busy.set(true);
    try {
      const result = await this.api.issueFamilyPass(
        token,
        facility,
        action.access.id,
        action.appointmentId,
      );
      if (this.action() !== action || !result.pass) return;
      this.pass.set(result.pass);
      const { toDataURL } = await import('qrcode');
      const image = await toDataURL(result.pass, { width: 192, margin: 2 }).catch(() => '');
      if (this.action() === action) this.qr.set(image);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  private async submit(command: () => Promise<unknown>, message: string) {
    if (this.busy()) return;
    this.error.set('');
    this.busy.set(true);
    try {
      await command();
      this.close();
      this.notice.set(message);
      this.heading().nativeElement.focus();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
