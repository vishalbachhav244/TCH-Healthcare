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
  openTrip,
  transportDestinations,
  transportKinds,
  transportStatuses,
  type TransportAction,
  type TransportKind,
  type TransportRow,
} from '../domain/transport';

type View = 'queue' | 'history' | 'units';
type Editor = { kind: 'request' } | { kind: TransportAction; trip: TransportRow };
const prompts = {
  request: {
    title: 'Request transport',
    confirm: 'Add transport request',
    notice: 'Transport request added.',
  },
  dispatch: {
    title: 'Dispatch',
    confirm: 'Confirm dispatch',
    notice: 'Transport unit dispatched.',
  },
  pickup: {
    title: 'Record pickup',
    confirm: 'Confirm pickup',
    notice: 'Pickup recorded. Transport is in transit.',
  },
  complete: {
    title: 'Complete handoff',
    confirm: 'Confirm handoff',
    notice: 'Handoff recorded. The unit is available.',
  },
  cancel: {
    title: 'Cancel trip',
    confirm: 'Confirm cancellation',
    notice: 'Transport request cancelled.',
  },
};

@Component({
  imports: [DatePipe, ReactiveFormsModule, NgIcon, StatusTone],
  templateUrl: './patient-transport.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatientTransport {
  private readonly api = inject(Api);
  private readonly forms = inject(NonNullableFormBuilder);
  private editorFacility = '';
  protected readonly store = inject(SessionStore);
  protected readonly view = signal<View>('queue');
  protected readonly search = signal('');
  protected readonly status = signal('');
  protected readonly patientSearch = signal('');
  protected readonly limit = signal(12);
  protected readonly reload = signal(0);
  protected readonly notice = signal('');
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly editor = signal<Editor | undefined>(undefined);
  protected readonly prompts = prompts;
  protected readonly kinds = transportKinds;
  protected readonly statuses = computed(() =>
    this.view() === 'queue' ? transportStatuses.slice(0, 3) : transportStatuses.slice(3),
  );
  protected readonly form = this.forms.group({
    admissionKey: [''],
    kind: this.forms.control<TransportKind | ''>(''),
    destination: [''],
    unitId: [''],
  });
  private readonly tripKind = toSignal(this.form.controls.kind.valueChanges, {
    initialValue: '' as const,
  });
  protected readonly destinations = computed(() => {
    const kind = this.tripKind();
    return kind ? transportDestinations[kind] : [];
  });
  private readonly scope = computed(() => ({
    token: this.store.session()?.token ?? '',
    facility: this.store.facility()?.id ?? '',
    reload: this.reload(),
  }));
  protected readonly data = facilityQuery(this.scope, ({ token, facility }) =>
    this.api.patientTransport(token, facility),
  );
  protected readonly value = computed(() => {
    const result = this.data();
    return result.state === 'ready' ? result.data : undefined;
  });
  protected readonly metrics = computed(() =>
    transportStatuses.slice(0, 3).map((label) => ({
      label,
      count: this.value()?.trips.filter((row) => row.status === label).length ?? 0,
    })),
  );
  protected readonly trips = computed(() => {
    const search = this.search().trim().toLowerCase();
    return (
      this.value()?.trips.filter(
        (row) =>
          openTrip(row) === (this.view() === 'queue') &&
          (!this.status() || row.status === this.status()) &&
          [row.patient.name, row.patient.id, row.kind, row.unitLabel, row.destination]
            .join(' ')
            .toLowerCase()
            .includes(search),
      ) ?? []
    );
  });
  protected readonly patients = computed(() => {
    const search = this.patientSearch().trim().toLowerCase();
    return (
      this.value()?.admissions.filter((row) =>
        [row.patient.name, row.patient.id, row.pickup].join(' ').toLowerCase().includes(search),
      ) ?? []
    );
  });

  protected show(view: View) {
    this.view.set(view);
    this.search.set('');
    this.status.set('');
    this.limit.set(12);
  }

  protected dispatchUnits(kind: TransportKind) {
    return this.value()?.units.filter((unit) => unit.available && unit.kind === kind) ?? [];
  }

  protected actions(trip: TransportRow): readonly TransportAction[] {
    if (trip.status === 'Requested') {
      return trip.pickupCurrent && this.dispatchUnits(trip.kind).length
        ? ['dispatch', 'cancel']
        : ['cancel'];
    }
    if (trip.status === 'Dispatched') return trip.pickupCurrent ? ['pickup', 'cancel'] : ['cancel'];
    return trip.status === 'In transit' ? ['complete'] : [];
  }

  protected open(dialog: HTMLDialogElement, edit: Editor) {
    this.error.set('');
    this.editorFacility = this.scope().facility;
    this.editor.set(edit);
    this.patientSearch.set('');
    this.form.reset();
    dialog.showModal();
  }

  protected async save(dialog: HTMLDialogElement) {
    const edit = this.editor();
    if (!edit || this.busy()) return;
    const { token, facility } = this.scope();
    if (facility !== this.editorFacility) {
      this.error.set('The active facility changed. Close this form and start again.');
      return;
    }
    const { admissionKey, kind, destination, unitId } = this.form.getRawValue();
    this.error.set('');
    this.notice.set('');
    this.busy.set(true);
    try {
      if (edit.kind === 'request') {
        const admission = this.value()?.admissions.find(
          (item) => item.admissionId + ':' + item.version === admissionKey,
        );
        if (!admission || !kind || !destination) {
          this.error.set('Choose a current admission, transport type and destination.');
          return;
        }
        await this.api.requestTransport(token, facility, {
          admissionId: admission.admissionId,
          admissionVersion: admission.version,
          kind,
          destination,
        });
        this.show('queue');
      } else {
        await this.api.updateTransport(token, facility, edit.trip, edit.kind, unitId);
      }
      this.notice.set(prompts[edit.kind].notice);
      dialog.close();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
