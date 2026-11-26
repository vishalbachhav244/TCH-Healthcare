import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { Api, errorMessage } from '../core/api';
import { facilityQuery } from '../core/query';
import { SessionStore } from '../core/session';
import { StatusTone } from '../design-system/format';
import { dayInIndia, shiftDay } from '../domain/operations';
import {
  imagingCatalogue,
  imagingNotes,
  imagingStatuses,
  imagingTimes,
  type ImagingAction,
  type ImagingNote,
  type ImagingRow,
  type ImagingStudy,
} from '../domain/radiology';

const actionLabels = {
  schedule: 'Schedule exam',
  acquire: 'Record acquisition',
  report: 'Prepare imaging report',
  publish: 'Release imaging report',
  cancel: 'Cancel imaging order',
};
const feedback = {
  schedule: 'Exam scheduled.',
  acquire: 'Acquisition recorded.',
  report: 'Imaging report saved.',
  publish: 'Imaging report released.',
  cancel: 'Imaging order cancelled.',
};

@Component({
  imports: [DatePipe, NgIcon, ReactiveFormsModule, StatusTone],
  templateUrl: './radiology.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Radiology {
  private readonly api = inject(Api);
  private readonly store = inject(SessionStore);
  private readonly forms = inject(NonNullableFormBuilder);
  protected readonly tech = computed(() => this.store.writeAllowed('radiology'));
  protected readonly reviewer = computed(() => this.store.canPerform('radiology/review'));
  protected readonly account = computed(() => this.store.session()?.account);
  protected readonly view = signal<'orders' | 'schedule'>('orders');
  protected readonly today = dayInIndia();
  protected readonly latest = shiftDay(this.today, 90);
  protected readonly day = signal(this.today);
  protected readonly reload = signal(0);
  protected readonly visible = signal(12);
  protected readonly busy = signal(false);
  protected readonly notice = signal('');
  protected readonly error = signal('');
  protected readonly editor = signal<
    { row: ImagingRow; action: ImagingAction['action'] } | undefined
  >(undefined);
  protected readonly search = this.forms.control('');
  protected readonly status = this.forms.control('');
  protected readonly modality = this.forms.control('');
  protected readonly form = this.forms.group({
    day: [this.today],
    time: [''],
    note: this.forms.control<ImagingNote | ''>(''),
  });
  private readonly searchValue = toSignal(this.search.valueChanges, { initialValue: '' });
  private readonly statusValue = toSignal(this.status.valueChanges, { initialValue: '' });
  private readonly modalityValue = toSignal(this.modality.valueChanges, { initialValue: '' });
  private readonly chosenDay = toSignal(this.form.controls.day.valueChanges, {
    initialValue: this.today,
  });
  protected readonly statuses = imagingStatuses;
  protected readonly notes = imagingNotes;
  protected readonly modalities = [...new Set(imagingCatalogue.map((row) => row.modality))];
  private readonly scope = computed(() => ({
    token: this.store.session()?.token ?? '',
    facility: this.store.facility()?.id ?? '',
    reload: this.reload(),
  }));
  protected readonly data = facilityQuery(this.scope, ({ token, facility }) =>
    this.api.radiology(token, facility),
  );
  private readonly orders = computed(() => {
    const response = this.data();
    return response.state === 'ready' ? response.data : [];
  });
  protected readonly metrics = computed(() => [
    {
      label: 'Awaiting scheduling',
      count: this.orders().filter(({ order }) => order.status === 'Ordered').length,
    },
    {
      label: 'Scheduled today',
      count: this.orders().filter(
        ({ order }) => order.status === 'Scheduled' && order.scheduledDay === this.today,
      ).length,
    },
    {
      label: 'Awaiting report release',
      count: this.orders().filter(
        ({ order }) => order.status === 'Acquired' || order.status === 'Report ready',
      ).length,
    },
  ]);
  protected readonly rows = computed(() => {
    const search = this.searchValue().trim().toLowerCase();
    const modality = this.modalityValue();
    const status = this.statusValue();
    if (this.view() === 'schedule') {
      return this.orders()
        .filter(
          ({ order }) =>
            order.scheduledDay === this.day() &&
            order.status !== 'Cancelled' &&
            (!modality || this.exam(order.study)?.modality === modality),
        )
        .sort((a, b) => (a.order.scheduledTime ?? '').localeCompare(b.order.scheduledTime ?? ''));
    }
    return this.orders().filter(
      ({ order, patient }) =>
        (!status || status === order.status) &&
        (!modality || this.exam(order.study)?.modality === modality) &&
        (!search ||
          [patient.name, patient.id, order.study].some((value) =>
            value.toLowerCase().includes(search),
          )),
    );
  });
  protected readonly availableTimes = computed(() => {
    const row = this.editor()?.row;
    const day = this.chosenDay();
    if (!row || day < this.today || day > this.latest) return [];
    const room = this.exam(row.order.study)?.room;
    const reserved = new Set(
      this.orders()
        .filter(
          ({ order }) =>
            order.id !== row.order.id &&
            order.scheduledDay === day &&
            order.status !== 'Cancelled' &&
            (order.patientId === row.patient.id || this.exam(order.study)?.room === room),
        )
        .map(({ order }) => order.scheduledTime),
    );
    return imagingTimes.filter((time) => !reserved.has(time));
  });
  protected readonly title = computed(() => actionLabels[this.editor()?.action ?? 'schedule']);

  protected exam(study: ImagingStudy) {
    return imagingCatalogue.find((item) => item.study === study);
  }

  protected show(view: 'orders' | 'schedule') {
    this.view.set(view);
    this.visible.set(12);
  }

  protected open(dialog: HTMLDialogElement, row: ImagingRow, action: ImagingAction['action']) {
    this.error.set('');
    this.editor.set({ row, action });
    const day = row.order.scheduledDay;
    this.form.reset({
      day: day && day >= this.today ? day : this.today,
      time: row.order.scheduledTime ?? '',
      note: row.order.note ?? '',
    });
    dialog.showModal();
  }

  protected async save(dialog: HTMLDialogElement) {
    const edit = this.editor();
    if (!edit || this.busy()) return;
    const { day, time, note } = this.form.getRawValue();
    let action: ImagingAction;
    if (edit.action === 'schedule') {
      if (!this.availableTimes().includes(time)) {
        this.error.set('Choose a time that is still available for this room and patient.');
        return;
      }
      action = { action: 'schedule', day, time };
    } else if (edit.action === 'report') {
      if (!note) return;
      action = { action: 'report', note };
    } else {
      action = { action: edit.action };
    }
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      const { token, facility } = this.scope();
      await this.api.updateImaging(token, facility, edit.row.order, action);
      this.notice.set(feedback[action.action]);
      dialog.close();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
