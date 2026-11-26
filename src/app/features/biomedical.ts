import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { Api, errorMessage } from '../core/api';
import { facilityQuery } from '../core/query';
import { SessionStore } from '../core/session';
import { StatusTone } from '../design-system/format';
import {
  equipmentLocations,
  maintenanceReasons,
  maintenanceStatuses,
  openMaintenance,
  registeringEquipment,
  type BiomedicalAsset,
  type EquipmentFields,
  type MaintenanceAction,
  type MaintenanceReason,
  type MaintenanceRow,
  type MaintenanceStatus,
} from '../domain/biomedical';

type View = 'equipment' | 'orders';
type Editor =
  | { kind: 'register' }
  | { kind: 'open'; asset: BiomedicalAsset }
  | { kind: MaintenanceAction; order: MaintenanceRow };
const prompts = {
  register: {
    title: 'Register equipment',
    confirm: 'Save equipment',
    notice: 'Equipment registered.',
  },
  open: {
    title: 'Open work order',
    confirm: 'Open work order',
    notice: 'Work order opened. Equipment is unavailable.',
  },
  start: { title: 'Start maintenance', confirm: 'Confirm start', notice: 'Maintenance started.' },
  verify: {
    title: 'Record functional check',
    confirm: 'Save functional check',
    notice: 'Check recorded. Equipment is ready for release.',
  },
  release: {
    title: 'Return to service',
    confirm: 'Confirm return to service',
    notice: 'Equipment returned to service.',
  },
  cancel: {
    title: 'Cancel work order',
    confirm: 'Confirm cancellation',
    notice: 'Work order cancelled. Equipment is available.',
  },
};
const availableActions: Record<MaintenanceStatus, readonly MaintenanceAction[]> = {
  Open: ['start', 'cancel'],
  'In progress': ['verify'],
  'Ready for release': ['release'],
  Completed: [],
  Cancelled: [],
};

@Component({
  imports: [DatePipe, ReactiveFormsModule, NgIcon, StatusTone],
  templateUrl: './biomedical.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Biomedical {
  private readonly api = inject(Api);
  private readonly forms = inject(NonNullableFormBuilder);
  protected readonly store = inject(SessionStore);
  protected readonly view = signal<View>('equipment');
  protected readonly search = signal('');
  protected readonly status = signal('');
  protected readonly limit = signal(12);
  protected readonly reload = signal(0);
  protected readonly notice = signal('');
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly editor = signal<Editor | undefined>(undefined);
  protected readonly prompts = prompts;
  protected readonly actions = availableActions;
  protected readonly categories = registeringEquipment;
  protected readonly locations = computed(() =>
    this.store.facility()?.inpatient ? equipmentLocations : equipmentLocations.slice(0, 1),
  );
  protected readonly reasons = maintenanceReasons;
  protected readonly statuses = computed(() =>
    this.view() === 'equipment' ? ['Available', 'Unavailable'] : maintenanceStatuses,
  );
  protected readonly form = this.forms.group({
    tag: [''],
    category: this.forms.control<EquipmentFields['category'] | ''>(''),
    location: this.forms.control<EquipmentFields['location'] | ''>(''),
    reason: this.forms.control<MaintenanceReason | ''>(''),
    verified: [false],
  });
  private readonly scope = computed(() => ({
    token: this.store.session()?.token ?? '',
    facility: this.store.facility()?.id ?? '',
    reload: this.reload(),
  }));
  protected readonly data = facilityQuery(this.scope, ({ token, facility }) =>
    this.api.biomedical(token, facility),
  );
  private readonly value = computed(() => {
    const result = this.data();
    return result.state === 'ready' ? result.data : undefined;
  });
  protected readonly metrics = computed(() => {
    const data = this.value();
    return [
      {
        label: 'Available equipment',
        count: data?.equipment.filter((item) => item.status === 'Available').length ?? 0,
      },
      {
        label: 'Unavailable equipment',
        count: data?.equipment.filter((item) => item.status === 'Unavailable').length ?? 0,
      },
      { label: 'Active work orders', count: data?.orders.filter(openMaintenance).length ?? 0 },
    ];
  });
  protected readonly equipment = computed(
    () =>
      this.value()?.equipment.filter((item) =>
        this.matches(item.status, item.tag, item.category, item.location),
      ) ?? [],
  );
  protected readonly orders = computed(
    () =>
      this.value()?.orders.filter((row) =>
        this.matches(row.status, row.asset.tag, row.asset.category, row.asset.location, row.reason),
      ) ?? [],
  );

  protected show(view: View) {
    this.view.set(view);
    this.search.set('');
    this.status.set('');
    this.limit.set(12);
  }

  protected open(dialog: HTMLDialogElement, edit: Editor) {
    this.error.set('');
    this.editor.set(edit);
    this.form.reset();
    dialog.showModal();
  }

  protected async save(dialog: HTMLDialogElement) {
    const edit = this.editor();
    if (!edit || this.busy()) return;
    const { token, facility } = this.scope();
    const { tag, category, location, reason, verified } = this.form.getRawValue();
    this.error.set('');
    this.notice.set('');
    this.busy.set(true);
    try {
      if (edit.kind === 'register') {
        if (!tag.trim() || !category || !location) {
          this.error.set('Enter a tag and choose the equipment category and location.');
          return;
        }
        await this.api.registerEquipment(token, facility, { tag, category, location });
        this.show('equipment');
      } else if (edit.kind === 'open') {
        if (!reason) {
          this.error.set('Choose a maintenance reason.');
          return;
        }
        await this.api.openMaintenance(token, facility, edit.asset, reason);
        this.show('orders');
      } else {
        await this.api.updateMaintenance(token, facility, edit.order, edit.kind, verified);
      }
      this.notice.set(prompts[edit.kind].notice);
      dialog.close();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  private matches(status: string, ...values: string[]) {
    return (
      (!this.status() || this.status() === status) &&
      values.join(' ').toLowerCase().includes(this.search().trim().toLowerCase())
    );
  }
}
