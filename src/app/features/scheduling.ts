import { DatePipe, SlicePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { debounceTime } from 'rxjs';
import { Api, errorMessage } from '../core/api';
import { facilityQuery } from '../core/query';
import { SessionStore } from '../core/session';
import { StatusTone } from '../design-system/format';
import { dayInIndia, shiftDay } from '../domain/operations';
import {
  exceptionReasons,
  scheduleBoundaries,
  type ScheduleException,
  type WaitlistRow,
} from '../domain/scheduling';

@Component({
  imports: [DatePipe, SlicePipe, ReactiveFormsModule, RouterLink, NgIcon, StatusTone],
  templateUrl: './scheduling.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Scheduling {
  private readonly api = inject(Api);
  private readonly forms = inject(NonNullableFormBuilder);
  protected readonly store = inject(SessionStore);
  protected readonly today = dayInIndia();
  protected readonly latest = shiftDay(this.today, 90);
  private readonly dateParam = inject(ActivatedRoute).snapshot.queryParamMap.get('day');
  protected readonly day = signal(
    this.dateParam && /^\d{4}-\d{2}-\d{2}$/.test(this.dateParam) ? this.dateParam : this.today,
  );
  protected readonly clinicianFilter = this.forms.control('');
  protected readonly statusFilter = this.forms.control('');
  private readonly clinicianValue = toSignal(this.clinicianFilter.valueChanges, {
    initialValue: '',
  });
  private readonly status = toSignal(this.statusFilter.valueChanges, { initialValue: '' });
  protected readonly statuses = ['Waiting', 'Booked', 'Withdrawn', 'Expired'] as const;
  protected readonly offset = signal(0);
  protected readonly reload = signal(0);
  protected readonly notice = signal('');
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly joining = signal(false);
  protected readonly target = signal<{ row: WaitlistRow; action: 'book' | 'withdraw' } | undefined>(
    undefined,
  );
  protected readonly releasing = signal<string | undefined>(undefined);
  protected readonly reasons = exceptionReasons;
  protected readonly boundaries = scheduleBoundaries;
  protected readonly search = this.forms.control('');
  private readonly searchValue = toSignal(this.search.valueChanges.pipe(debounceTime(180)), {
    initialValue: '',
  });
  protected readonly time = this.forms.control('', Validators.required);
  protected readonly waitlistForm = this.forms.group({
    patientId: ['', Validators.required],
    practitionerId: ['', Validators.required],
    day: [this.today, Validators.required],
  });
  protected readonly blockForm = this.forms.group({
    practitionerId: ['', Validators.required],
    day: [this.today, Validators.required],
    start: ['', Validators.required],
    end: ['', Validators.required],
    reason: this.forms.control<ScheduleException['reason'] | ''>('', Validators.required),
  });
  private readonly scope = computed(() => ({
    token: this.store.session()?.token ?? '',
    facility: this.store.facility()?.id ?? '',
  }));
  private readonly params = computed(() => ({
    ...this.scope(),
    day: this.day(),
    reload: this.reload(),
  }));
  protected readonly response = facilityQuery(this.params, ({ token, facility, day }) =>
    this.api.schedulingDay(token, facility, day),
  );
  private readonly patientParams = computed(() => ({
    ...this.scope(),
    facility: this.joining() ? this.scope().facility : '',
    q: this.searchValue(),
  }));
  protected readonly patients = facilityQuery(this.patientParams, ({ token, facility, q }) =>
    this.api.schedulingPatients(token, facility, q),
  );
  protected readonly editableDay = computed(
    () => this.day() >= this.today && this.day() <= this.latest,
  );
  private readonly clinician = computed(() => {
    const response = this.response();
    return response.state === 'ready' &&
      response.data.practitioners.some((item) => item.id === this.clinicianValue())
      ? this.clinicianValue()
      : '';
  });
  private readonly clinicianWaitlist = computed(() => {
    const response = this.response();
    return response.state === 'ready'
      ? response.data.waitlist.filter(
          (row) => !this.clinician() || row.practitionerId === this.clinician(),
        )
      : [];
  });
  protected readonly waitingCount = computed(
    () => this.clinicianWaitlist().filter((row) => row.status === 'Waiting').length,
  );
  protected readonly bookableCount = computed(
    () => this.clinicianWaitlist().filter((row) => row.availableTimes.length > 0).length,
  );
  protected readonly filtered = computed(() =>
    this.clinicianWaitlist().filter((row) => !this.status() || row.status === this.status()),
  );
  protected readonly blocks = computed(() => {
    const response = this.response();
    return response.state === 'ready'
      ? response.data.exceptions.filter(
          (row) => !this.clinician() || row.practitionerId === this.clinician(),
        )
      : [];
  });
  protected readonly blockedCount = computed(
    () => this.blocks().filter((item) => item.releasedAt === undefined).length,
  );
  protected readonly currentTimes = computed(() => {
    const response = this.response();
    const target = this.target();
    return response.state === 'ready' && target
      ? (response.data.waitlist.find((row) => row.id === target.row.id)?.availableTimes ?? [])
      : [];
  });

  protected selectDay(value: string) {
    this.day.set(value || this.today);
    this.offset.set(0);
  }

  protected openWaitlist(dialog: HTMLDialogElement) {
    this.search.reset();
    this.waitlistForm.reset({ day: this.day(), practitionerId: this.clinician() });
    this.joining.set(true);
    this.open(dialog);
  }

  protected searchPatients() {
    this.waitlistForm.controls.patientId.reset();
  }

  protected async addRequest(dialog: HTMLDialogElement) {
    if (this.waitlistForm.invalid) return;
    const fields = this.waitlistForm.getRawValue();
    if (
      await this.save(
        (token, facility) => this.api.joinWaitlist(token, facility, fields),
        'Patient added to the waitlist.',
      )
    ) {
      this.selectDay(fields.day);
      this.clinicianFilter.setValue(fields.practitionerId);
      this.statusFilter.setValue('Waiting');
      dialog.close();
    }
  }

  protected openAction(dialog: HTMLDialogElement, row: WaitlistRow, action: 'book' | 'withdraw') {
    this.target.set({ row, action });
    this.time.reset();
    this.open(dialog);
  }

  protected async changeRequest(dialog: HTMLDialogElement) {
    const target = this.target();
    if (!target) return;
    const time = this.time.value;
    if (target.action === 'book' && !this.currentTimes().includes(time)) return;
    const action =
      target.action === 'book'
        ? ({ action: 'book', time } as const)
        : ({ action: 'withdraw' } as const);
    const notice =
      action.action === 'book'
        ? 'Appointment booked from the waitlist.'
        : 'Waitlist request withdrawn.';
    if (
      await this.save(
        (token, facility) => this.api.changeWaitlist(token, facility, target.row, action),
        notice,
      )
    ) {
      this.statusFilter.setValue(action.action === 'book' ? 'Booked' : 'Withdrawn');
      this.offset.set(0);
      dialog.close();
    }
  }

  protected openBlock(dialog: HTMLDialogElement) {
    this.blockForm.reset({ day: this.day(), practitionerId: this.clinician() });
    this.open(dialog);
  }

  protected async createBlock(dialog: HTMLDialogElement) {
    const { reason, ...fields } = this.blockForm.getRawValue();
    if (this.blockForm.invalid || !reason) return;
    if (
      await this.save(
        (token, facility) =>
          this.api.createScheduleException(token, facility, { ...fields, reason }),
        'Clinician time blocked.',
      )
    ) {
      this.selectDay(fields.day);
      this.clinicianFilter.setValue(fields.practitionerId);
      dialog.close();
    }
  }

  protected openRelease(dialog: HTMLDialogElement, id: string) {
    this.releasing.set(id);
    this.open(dialog);
  }

  protected async release(dialog: HTMLDialogElement) {
    const id = this.releasing();
    if (
      id &&
      (await this.save(
        (token, facility) => this.api.releaseScheduleException(token, facility, id),
        'Schedule block released.',
      ))
    )
      dialog.close();
  }

  private open(dialog: HTMLDialogElement) {
    this.error.set('');
    dialog.showModal();
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
