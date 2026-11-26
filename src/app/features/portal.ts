import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { NgIcon } from '@ng-icons/core';
import { Api, errorMessage } from '../core/api';
import { facilityQuery } from '../core/query';
import { SessionStore } from '../core/session';
import { Rupees, StatusTone } from '../design-system/format';
import { dayInIndia, shiftDay } from '../domain/operations';
import type { LabOrder } from '../domain/diagnostics';
import type { FollowUpDetails } from '../domain/continuity';
import { PatientSharing } from './patient-sharing';
import { DischargeDocument } from './discharge-document';
import type { DischargeDocument as ReleasedSummary } from '../domain/discharge';
import type { ReleasedImagingReport } from '../domain/radiology';

@Component({
  imports: [
    DatePipe,
    DischargeDocument,
    NgIcon,
    PatientSharing,
    ReactiveFormsModule,
    Rupees,
    StatusTone,
  ],
  templateUrl: './portal.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Portal {
  private readonly api = inject(Api);
  protected readonly store = inject(SessionStore);
  protected readonly today = dayInIndia();
  protected readonly latest = shiftDay(this.today, 90);
  protected readonly active = signal<'visits' | 'records' | 'billing' | 'sharing'>('visits');
  protected readonly report = signal<LabOrder | undefined>(undefined);
  protected readonly imagingReport = signal<ReleasedImagingReport | undefined>(undefined);
  protected readonly dischargeSummary = signal<ReleasedSummary | undefined>(undefined);
  protected readonly busy = signal(false);
  protected readonly message = signal('');
  protected readonly error = signal('');
  protected readonly pass = signal('');
  protected readonly qr = signal('');
  protected readonly booking = signal(false);
  protected readonly selectedFollowUp = signal<FollowUpDetails | undefined>(undefined);
  protected readonly earliestBooking = computed(() => {
    const start = this.selectedFollowUp()?.startsOn;
    return start && start > this.today ? start : this.today;
  });
  protected readonly latestBooking = computed(() => this.selectedFollowUp()?.endsOn ?? this.latest);
  protected readonly reload = signal(0);
  protected readonly form = inject(NonNullableFormBuilder).group({
    practitionerId: ['', Validators.required],
    day: [this.today, Validators.required],
    time: ['', Validators.required],
  });
  private readonly practitionerId = toSignal(this.form.controls.practitionerId.valueChanges, {
    initialValue: '',
  });
  private readonly bookingDay = toSignal(this.form.controls.day.valueChanges, {
    initialValue: this.today,
  });
  private readonly scope = computed(() => ({
    token: this.store.session()?.token ?? '',
    facility: this.store.facility()?.id ?? '',
    reload: this.reload(),
  }));
  protected readonly data = facilityQuery(this.scope, ({ token, facility }) =>
    this.api.portal(token, facility),
  );
  private readonly slotParams = computed(() => ({
    ...this.scope(),
    facility:
      this.booking() && this.practitionerId() && this.bookingDay() ? this.scope().facility : '',
    day: this.bookingDay(),
    practitionerId: this.practitionerId(),
  }));
  protected readonly slots = facilityQuery(
    this.slotParams,
    ({ token, facility, day, practitionerId }) =>
      this.api.portalAvailableTimes(token, facility, day, practitionerId),
  );
  protected readonly next = computed(() => {
    const data = this.data();
    return data.state === 'ready'
      ? [...data.data.appointments]
          .reverse()
          .find(
            (row) =>
              row.appointment.day >= this.today &&
              ['Booked', 'Checked in', 'In consultation'].includes(row.appointment.status),
          )
      : undefined;
  });

  protected open(dialog: HTMLDialogElement, id?: string) {
    this.booking.set(!id);
    this.selectedFollowUp.set(undefined);
    this.form.reset();
    this.error.set('');
    this.pass.set('');
    this.qr.set('');
    dialog.showModal();
    if (id)
      void this.requestPass((token, facility) => this.api.issuePortalPass(token, facility, id));
  }

  protected openFollowUp(dialog: HTMLDialogElement, request: FollowUpDetails) {
    this.open(dialog);
    this.selectedFollowUp.set(request);
    this.form.patchValue({ day: this.earliestBooking(), practitionerId: request.clinician.id });
  }

  protected async book() {
    const slots = this.slots();
    if (
      this.form.invalid ||
      slots.state !== 'ready' ||
      !slots.data.includes(this.form.controls.time.value)
    ) {
      this.error.set('Choose a clinician, date and time.');
      return;
    }
    const fields = this.form.getRawValue();
    if (fields.day < this.earliestBooking() || fields.day > this.latestBooking()) {
      this.error.set('Choose a date within the available booking window.');
      return;
    }
    const request = this.selectedFollowUp();
    if (request) {
      await this.requestPass(
        (token, facility) =>
          this.api.bookFollowUp(token, facility, request, { day: fields.day, time: fields.time }),
        'Follow-up booked.',
      );
    } else {
      await this.requestPass(
        (token, facility) => this.api.bookPortalVisit(token, facility, fields),
        'Appointment booked.',
      );
    }
  }

  protected showReport(report: LabOrder, dialog: HTMLDialogElement) {
    this.report.set(report);
    dialog.showModal();
  }

  protected showImagingReport(report: ReleasedImagingReport, dialog: HTMLDialogElement) {
    this.imagingReport.set(report);
    dialog.showModal();
  }

  protected showSummary(summary: ReleasedSummary, dialog: HTMLDialogElement) {
    this.dischargeSummary.set(summary);
    dialog.showModal();
  }

  private async requestPass(
    command: (token: string, facility: string) => Promise<{ id: string; pass?: string }>,
    message?: string,
  ) {
    if (this.busy()) return;
    const { token, facility } = this.scope();
    this.busy.set(true);
    this.error.set('');
    try {
      const result = await command(token, facility);
      if (message) this.message.set(message);
      if (result.pass) {
        this.pass.set(result.pass);
        const { toDataURL } = await import('qrcode');
        this.qr.set(await toDataURL(result.pass, { width: 192, margin: 2 }).catch(() => ''));
      }
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
