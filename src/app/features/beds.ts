import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { NgIcon } from '@ng-icons/core';
import { debounceTime } from 'rxjs';
import { Api, errorMessage } from '../core/api';
import { facilityQuery } from '../core/query';
import { SessionStore } from '../core/session';
import { StatusTone } from '../design-system/format';
import type { InpatientBoard } from '../domain/operations';

type AdmissionRow = InpatientBoard['admissions'][number];

@Component({
  imports: [DatePipe, NgIcon, ReactiveFormsModule, StatusTone],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './beds.html',
})
export class Beds {
  private readonly api = inject(Api);
  protected readonly store = inject(SessionStore);
  protected readonly ward = signal('');
  protected readonly status = signal('');
  protected readonly mode = signal<'beds' | 'admissions'>('beds');
  protected readonly reload = signal(0);
  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly patientSearch = new FormControl('', { nonNullable: true });
  protected readonly selectedId = new FormControl('', { nonNullable: true });
  protected readonly selectedBed = new FormControl('', { nonNullable: true });
  protected readonly busy = signal(false);
  protected readonly feedback = signal('');
  protected readonly failure = signal('');
  protected readonly dialogFailure = signal('');
  protected readonly task = signal<'request' | 'allocate' | 'discharge' | undefined>(undefined);
  protected readonly selected = signal<AdmissionRow | undefined>(undefined);
  protected readonly visible = signal(24);
  private readonly searchValue = toSignal(this.search.valueChanges.pipe(debounceTime(200)), {
    initialValue: '',
  });
  private readonly patientValue = toSignal(
    this.patientSearch.valueChanges.pipe(debounceTime(200)),
    { initialValue: '' },
  );
  private readonly scope = computed(() => ({
    facility: this.store.facility()?.id ?? '',
    token: this.store.session()?.token ?? '',
  }));
  private readonly params = computed(() => ({ ...this.scope(), reload: this.reload() }));
  protected readonly data = facilityQuery(this.params, ({ token, facility }) =>
    this.api.beds(token, facility),
  );
  private readonly searchParams = computed(() =>
    this.task() === 'request'
      ? { ...this.scope(), query: this.patientValue() }
      : { token: '', facility: '', query: '' },
  );
  protected readonly options = facilityQuery(this.searchParams, ({ token, facility, query }) =>
    this.api.patients('admissions/options', token, facility, query),
  );
  private readonly board = computed(() => {
    const response = this.data();
    return response.state === 'ready' ? response.data : undefined;
  });
  protected readonly wards = computed(() => [
    ...new Set(this.board()?.beds.map((bed) => bed.ward)),
  ]);
  protected readonly beds = computed(
    () =>
      this.board()?.beds.filter(
        (bed) =>
          (!this.ward() || this.ward() === bed.ward) &&
          (!this.status() || this.status() === bed.status),
      ) ?? [],
  );
  protected readonly available = computed(
    () => this.board()?.beds.filter((bed) => bed.status === 'Available') ?? [],
  );
  protected readonly admissions = computed(() => {
    const q = this.searchValue().trim().toLowerCase();
    return (
      this.board()?.admissions.filter(
        (row) => !q || (row.patient.name + ' ' + row.patient.id).toLowerCase().includes(q),
      ) ?? []
    );
  });

  protected location(id?: string) {
    return this.board()?.beds.find((bed) => bed.id === id)?.label ?? '—';
  }

  protected open(
    task: 'request' | 'allocate' | 'discharge',
    dialog: HTMLDialogElement,
    row?: AdmissionRow,
  ) {
    this.selected.set(row);
    this.selectedId.reset();
    this.selectedBed.reset();
    this.patientSearch.reset();
    this.dialogFailure.set('');
    this.task.set(task);
    dialog.showModal();
  }

  protected async submit(dialog: HTMLDialogElement) {
    const task = this.task();
    const record = this.selected()?.admission;
    if (task === 'request') {
      if (!this.selectedId.value) {
        this.dialogFailure.set('Select a patient.');
        return;
      }
      await this.change(
        'admissions',
        { patientId: this.selectedId.value },
        'Admission requested.',
        dialog,
      );
    } else if (task && record) {
      if (task === 'allocate' && !this.selectedBed.value) {
        this.dialogFailure.set('Select an available bed.');
        return;
      }
      await this.change(
        'admissions/' + task,
        { admissionId: record.id, version: String(record.version), bedId: this.selectedBed.value },
        task === 'allocate'
          ? 'Bed allocation updated.'
          : 'Patient discharged. The bed is awaiting cleaning.',
        dialog,
      );
    }
  }

  protected release(id: string) {
    return this.change('beds/release', { bedId: id }, 'Bed available for allocation.');
  }

  private async change(
    path: string,
    body: Record<string, string>,
    message: string,
    dialog?: HTMLDialogElement,
  ) {
    if (this.busy()) return;
    this.busy.set(true);
    this.failure.set('');
    this.dialogFailure.set('');
    this.feedback.set('');
    const { token, facility } = this.scope();
    try {
      await this.api.execute(path, token, facility, body);
      this.feedback.set(message);
      dialog?.close();
      if (path === 'admissions') {
        this.mode.set('admissions');
        this.search.reset();
      }
    } catch (error) {
      (dialog ? this.dialogFailure : this.failure).set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
