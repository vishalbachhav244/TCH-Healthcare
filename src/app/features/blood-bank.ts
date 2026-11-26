import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { Api, errorMessage } from '../core/api';
import { facilityQuery } from '../core/query';
import { SessionStore } from '../core/session';
import { StatusTone } from '../design-system/format';
import {
  bloodComponents,
  bloodRequestStatuses,
  type BloodAction,
  type BloodRequestRow,
} from '../domain/blood-bank';

const actionLabels = {
  reserve: 'Review component request',
  issue: 'Issue reserved unit',
  decline: 'Decline component request',
  cancel: 'Release unit reservation',
};
const notices = {
  reserve: 'Review recorded and unit reserved.',
  issue: 'Component unit issued.',
  decline: 'Component request declined.',
  cancel: 'Reservation released and request cancelled.',
};

@Component({
  imports: [DatePipe, NgIcon, ReactiveFormsModule, StatusTone],
  templateUrl: './blood-bank.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BloodBank {
  private readonly api = inject(Api);
  protected readonly store = inject(SessionStore);
  private readonly forms = inject(NonNullableFormBuilder);
  protected readonly view = signal<'requests' | 'stock'>('requests');
  protected readonly reload = signal(0);
  protected readonly visible = signal(12);
  protected readonly busy = signal(false);
  protected readonly notice = signal('');
  protected readonly error = signal('');
  protected readonly editor = signal<
    { row: BloodRequestRow; action: BloodAction['action'] } | undefined
  >(undefined);
  protected readonly search = this.forms.control('');
  protected readonly status = this.forms.control('');
  protected readonly component = this.forms.control('');
  protected readonly reserve = this.forms.group({ unitId: [''], reviewed: [false] });
  private readonly searchValue = toSignal(this.search.valueChanges, { initialValue: '' });
  private readonly statusValue = toSignal(this.status.valueChanges, { initialValue: '' });
  private readonly componentValue = toSignal(this.component.valueChanges, { initialValue: '' });
  protected readonly components = bloodComponents;
  protected readonly requestStatuses = bloodRequestStatuses;
  protected readonly stockStatuses = ['Available', 'Reserved', 'Issued', 'Expired'];
  private readonly scope = computed(() => ({
    token: this.store.session()?.token ?? '',
    facility: this.store.facility()?.id ?? '',
    reload: this.reload(),
  }));
  protected readonly response = facilityQuery(this.scope, ({ token, facility }) =>
    this.api.bloodBank(token, facility),
  );
  private readonly dataset = computed(() => {
    const response = this.response();
    return response.state === 'ready' ? response.data : { requests: [], units: [] };
  });
  protected readonly metrics = computed(() => {
    const { requests, units } = this.dataset();
    return [
      {
        label: 'Awaiting review',
        count: requests.filter(({ request }) => request.status === 'Requested').length,
      },
      { label: 'Reserved units', count: units.filter((unit) => unit.status === 'Reserved').length },
      {
        label: 'Available units',
        count: units.filter((unit) => unit.status === 'Available').length,
      },
    ];
  });
  protected readonly requests = computed(() => {
    const q = this.searchValue().trim().toLowerCase();
    return this.dataset().requests.filter(
      ({ request, patient }) =>
        this.matches(request) &&
        (!q || (patient.name + ' ' + patient.id).toLowerCase().includes(q)),
    );
  });
  protected readonly inventory = computed(() => {
    const q = this.searchValue().trim().toLowerCase();
    return this.dataset().units.filter(
      (unit) => this.matches(unit) && (!q || unit.code.toLowerCase().includes(q)),
    );
  });
  protected readonly available = computed(() =>
    this.dataset().units.filter(
      (unit) =>
        unit.status === 'Available' && unit.component === this.editor()?.row.request.component,
    ),
  );
  protected readonly title = computed(() => actionLabels[this.editor()?.action ?? 'reserve']);

  protected show(view: 'requests' | 'stock') {
    this.view.set(view);
    this.visible.set(12);
    this.search.reset();
    this.status.reset();
  }

  protected open(dialog: HTMLDialogElement, row: BloodRequestRow, action: BloodAction['action']) {
    this.error.set('');
    this.editor.set({ row, action });
    this.reserve.reset();
    dialog.showModal();
  }

  protected async save(dialog: HTMLDialogElement) {
    const edit = this.editor();
    if (!edit || this.busy()) return;
    const { unitId, reviewed } = this.reserve.getRawValue();
    let action: BloodAction;
    if (edit.action === 'reserve') {
      if (!reviewed || !this.available().some((unit) => unit.id === unitId)) {
        this.error.set('Choose an available unit and record its review before reserving it.');
        return;
      }
      action = { action: 'reserve', unitId, review: 'recorded' };
    } else {
      action = { action: edit.action };
    }
    this.busy.set(true);
    this.notice.set('');
    this.error.set('');
    try {
      const { token, facility } = this.scope();
      await this.api.updateBloodRequest(token, facility, edit.row.request, action);
      this.notice.set(notices[action.action]);
      dialog.close();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  private matches(record: { component: string; status: string }) {
    return (
      (!this.statusValue() || record.status === this.statusValue()) &&
      (!this.componentValue() || record.component === this.componentValue())
    );
  }
}
