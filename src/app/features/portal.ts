import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { Api, errorMessage } from '../core/api';
import { facilityQuery } from '../core/query';
import { SessionStore } from '../core/session';
import { Rupees, StatusTone } from '../design-system/format';
import { dayInIndia } from '../domain/operations';
import type { LabOrder } from '../domain/diagnostics';
import { PatientSharing } from './patient-sharing';

@Component({
  imports: [DatePipe, NgIcon, PatientSharing, ReactiveFormsModule, Rupees, StatusTone],
  templateUrl: './portal.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Portal {
  private readonly api = inject(Api);
  protected readonly store = inject(SessionStore);
  protected readonly today = dayInIndia();
  protected readonly active = signal<'visits' | 'records' | 'billing' | 'sharing'>('visits');
  protected readonly report = signal<LabOrder | undefined>(undefined);
  protected readonly busy = signal(false);
  protected readonly message = signal('');
  protected readonly error = signal('');
  protected readonly pass = signal('');
  protected readonly qr = signal('');
  protected readonly booking = signal(false);
  protected readonly reload = signal(0);
  protected readonly form = inject(NonNullableFormBuilder).group({
    practitionerId: ['', Validators.required],
    day: [this.today, Validators.required],
    time: ['14:00', Validators.required],
  });
  private readonly scope = computed(() => ({
    token: this.store.session()?.token ?? '',
    facility: this.store.facility()?.id ?? '',
    reload: this.reload(),
  }));
  protected readonly data = facilityQuery(this.scope, ({ token, facility }) =>
    this.api.portal(token, facility),
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
    this.form.reset({ day: this.today, time: '14:00' });
    this.error.set('');
    this.pass.set('');
    this.qr.set('');
    dialog.showModal();
    if (id) void this.requestPass('portal/passes', { appointmentId: id });
  }

  protected async book() {
    if (this.form.invalid) {
      this.error.set('Choose a clinician, date and time.');
      return;
    }
    await this.requestPass('portal/appointments', this.form.getRawValue(), 'Appointment booked.');
  }

  protected showReport(report: LabOrder, dialog: HTMLDialogElement) {
    this.report.set(report);
    dialog.showModal();
  }

  private async requestPass(path: string, body: Record<string, string>, message?: string) {
    if (this.busy()) return;
    const { token, facility } = this.scope();
    this.busy.set(true);
    this.error.set('');
    try {
      const result = await this.api.execute(path, token, facility, body);
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
