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
  openSupportTask,
  supportRequests,
  supportServices,
  supportStatuses,
  type RequestedService,
  type SupportAction,
  type SupportRow,
} from '../domain/support';

type View = 'queue' | 'history';
type Editor = { kind: 'request' } | { kind: SupportAction; row: SupportRow };
const prompts = {
  request: {
    title: 'Request support',
    confirm: 'Add to work queue',
    notice: 'Support request added.',
  },
  start: { title: 'Start task', confirm: 'Confirm start', notice: 'Support task started.' },
  complete: {
    title: 'Complete task',
    confirm: 'Confirm completion',
    notice: 'Support task completed.',
  },
  cancel: {
    title: 'Cancel request',
    confirm: 'Confirm cancellation',
    notice: 'Support request cancelled.',
  },
};

@Component({
  imports: [DatePipe, ReactiveFormsModule, NgIcon, StatusTone],
  templateUrl: './hospital-support.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HospitalSupport {
  private readonly api = inject(Api);
  private readonly forms = inject(NonNullableFormBuilder);
  private editorFacility = '';
  protected readonly store = inject(SessionStore);
  protected readonly view = signal<View>('queue');
  protected readonly search = signal('');
  protected readonly service = signal('');
  protected readonly status = signal('');
  protected readonly limit = signal(12);
  protected readonly reload = signal(0);
  protected readonly notice = signal('');
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly editor = signal<Editor | undefined>(undefined);
  protected readonly services = supportServices;
  protected readonly prompts = prompts;
  protected readonly requestServices = Object.keys(supportRequests);
  protected readonly statuses = computed(() =>
    this.view() === 'queue' ? supportStatuses.slice(0, 2) : supportStatuses.slice(2),
  );
  protected readonly form = this.forms.group({
    service: this.forms.control<RequestedService | ''>(''),
    location: [''],
    request: [''],
  });
  private readonly requestService = toSignal(this.form.controls.service.valueChanges, {
    initialValue: '' as const,
  });
  protected readonly reasons = computed(() => {
    const service = this.requestService();
    return service ? supportRequests[service] : [];
  });
  private readonly scope = computed(() => ({
    token: this.store.session()?.token ?? '',
    facility: this.store.facility()?.id ?? '',
    reload: this.reload(),
  }));
  protected readonly data = facilityQuery(this.scope, ({ token, facility }) =>
    this.api.hospitalSupport(token, facility),
  );
  protected readonly value = computed(() => {
    const result = this.data();
    return result.state === 'ready' ? result.data : undefined;
  });
  protected readonly metrics = computed(() =>
    supportServices.map((service) => ({
      service,
      count:
        this.value()?.tasks.filter((row) => row.service === service && openSupportTask(row))
          .length ?? 0,
    })),
  );
  protected readonly rows = computed(() => {
    const search = this.search().trim().toLowerCase();
    return (
      this.value()?.tasks.filter(
        (row) =>
          openSupportTask(row) === (this.view() === 'queue') &&
          (!this.service() || row.service === this.service()) &&
          (!this.status() || row.status === this.status()) &&
          [row.service, row.request, row.location, row.bed?.label]
            .join(' ')
            .toLowerCase()
            .includes(search),
      ) ?? []
    );
  });

  protected show(view: View) {
    this.view.set(view);
    this.search.set('');
    this.service.set('');
    this.status.set('');
    this.limit.set(12);
  }

  protected actions(row: SupportRow): readonly SupportAction[] {
    if (row.status === 'Queued')
      return row.service === 'Housekeeping' ? ['start'] : ['start', 'cancel'];
    return row.status === 'In progress' ? ['complete'] : [];
  }

  protected open(dialog: HTMLDialogElement, edit: Editor) {
    this.error.set('');
    this.editorFacility = this.scope().facility;
    this.editor.set(edit);
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
    this.error.set('');
    this.notice.set('');
    this.busy.set(true);
    try {
      if (edit.kind === 'request') {
        const { service, location, request } = this.form.getRawValue();
        if (!service || !location || !request) {
          this.error.set('Choose a service, ward and request.');
          return;
        }
        await this.api.requestSupport(token, facility, { service, location, request });
        this.show('queue');
      } else {
        await this.api.updateSupport(token, facility, edit.row, edit.kind);
      }
      this.notice.set(
        edit.kind === 'complete' && edit.row.service === 'Housekeeping'
          ? 'Bed available for allocation.'
          : prompts[edit.kind].notice,
      );
      dialog.close();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
