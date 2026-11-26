import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Api, errorMessage } from '../core/api';
import { facilityQuery } from '../core/query';
import { SessionStore } from '../core/session';
import { StatusTone } from '../design-system/format';
import { followUpPurposes, type FollowUpDetails, type FollowUpPurpose } from '../domain/continuity';
import { dayInIndia, shiftDay, type Encounter } from '../domain/operations';

@Component({
  selector: 'tc-consultation-continuity',
  imports: [DatePipe, ReactiveFormsModule, StatusTone],
  templateUrl: './consultation-continuity.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConsultationContinuity {
  readonly encounter = input.required<Encounter>();
  private readonly api = inject(Api);
  private readonly store = inject(SessionStore);
  private readonly forms = inject(NonNullableFormBuilder);
  protected readonly today = dayInIndia();
  protected readonly latest = shiftDay(this.today, 90);
  protected readonly refresh = signal(0);
  protected readonly specialtyFilter = this.forms.control('');
  private readonly specialty = toSignal(this.specialtyFilter.valueChanges, { initialValue: '' });
  protected readonly editor = signal(false);
  protected readonly confirming = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly purposes = followUpPurposes;
  protected readonly form = this.forms.group({
    startsOn: ['', Validators.required],
    endsOn: ['', Validators.required],
    purpose: this.forms.control<FollowUpPurpose | ''>('', Validators.required),
  });
  private readonly scope = computed(() => ({
    facility: this.store.facility()?.id ?? '',
    token: this.store.session()?.token ?? '',
    encounterId: this.encounter().id,
    refresh: this.refresh(),
  }));
  protected readonly response = facilityQuery(this.scope, ({ facility, token, encounterId }) =>
    this.api.clinicalContinuity(token, facility, encounterId),
  );
  protected readonly specialties = computed(() => {
    const state = this.response();
    return state.state === 'ready'
      ? [...new Set(state.data.history.map((row) => row.clinician.specialty))].sort()
      : [];
  });
  protected readonly history = computed(() => {
    const state = this.response();
    return state.state === 'ready'
      ? state.data.history.filter(
          (row) => !this.specialty() || row.clinician.specialty === this.specialty(),
        )
      : [];
  });

  protected open() {
    this.form.reset();
    this.error.set('');
    this.notice.set('');
    this.editor.set(true);
  }

  protected async request() {
    const { purpose, startsOn, endsOn } = this.form.getRawValue();
    if (this.form.invalid || !purpose) return;
    if (startsOn > endsOn || startsOn < this.today || endsOn > this.latest) {
      this.error.set('Choose a valid date range within the next 90 days.');
      return;
    }
    const encounterId = this.encounter().id;
    if (
      await this.save(
        (token, facility) =>
          this.api.requestFollowUp(token, facility, { encounterId, startsOn, endsOn, purpose }),
        'Follow-up requested.',
      )
    )
      this.editor.set(false);
  }

  protected async withdraw(request: FollowUpDetails) {
    if (
      await this.save(
        (token, facility) => this.api.withdrawFollowUp(token, facility, request),
        'Follow-up request withdrawn.',
      )
    )
      this.confirming.set(false);
  }

  private async save(
    command: (token: string, facility: string) => Promise<unknown>,
    notice: string,
  ) {
    if (this.busy()) return false;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    const { token, facility } = this.scope();
    try {
      await command(token, facility);
      this.notice.set(notice);
      return true;
    } catch (error) {
      this.error.set(errorMessage(error));
      return false;
    } finally {
      this.busy.set(false);
    }
  }
}
