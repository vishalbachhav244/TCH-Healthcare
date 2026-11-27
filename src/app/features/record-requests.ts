import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { Api, errorMessage } from '../core/api';
import { facilityQuery } from '../core/query';
import { SessionStore } from '../core/session';
import {
  requestPurposes,
  type RecordRequest,
  type RequestSummary,
  type SharedRecord,
  type SharedDocument,
} from '../domain/interoperability';

@Component({
  imports: [DatePipe, NgIcon, ReactiveFormsModule],
  templateUrl: './record-requests.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecordRequests {
  private readonly api = inject(Api);
  private readonly store = inject(SessionStore);
  protected readonly purposes = requestPurposes;
  protected readonly reload = signal(0);
  protected readonly notice = signal('');
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly viewed = signal<{ requestId: string; report: SharedRecord } | undefined>(
    undefined,
  );
  protected readonly documentPreview = signal(false);
  private readonly forms = inject(NonNullableFormBuilder);
  protected readonly form = this.forms.group({
    code: ['', Validators.required],
    purpose: this.forms.control<RecordRequest['purpose']>(
      'Continuation of care',
      Validators.required,
    ),
  });
  private readonly scope = computed(() => ({
    facility: 'integrations',
    token: this.store.session()?.token ?? '',
    reload: this.reload(),
  }));
  protected readonly response = facilityQuery(this.scope, ({ token }) =>
    this.api.recordRequests(token),
  );

  constructor() {
    effect((cleanup) => {
      const view = this.viewed();
      if (!view) return;
      const response = this.response();
      if (
        response.state === 'error' ||
        (response.state === 'ready' &&
          response.data.find((row) => row.id === view.requestId)?.status !== 'Granted')
      ) {
        this.viewed.set(undefined);
        return;
      }
      const remaining = view.report.expiresAt - Date.now();
      if (remaining <= 0) {
        this.viewed.set(undefined);
        return;
      }
      const timer = setTimeout(() => this.viewed.set(undefined), remaining);
      cleanup(() => clearTimeout(timer));
    });
  }

  protected open(dialog: HTMLDialogElement) {
    this.form.reset();
    this.error.set('');
    dialog.showModal();
  }

  protected async request(dialog: HTMLDialogElement) {
    if (this.form.invalid || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await this.api.requestReport(this.scope().token, this.form.getRawValue());
      this.form.reset();
      this.notice.set('Request sent for patient review.');
      dialog.close();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected async view(request: RequestSummary, dialog: HTMLDialogElement) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.viewed.set(undefined);
    try {
      const report = await this.api.sharedReport(this.scope().token, request.id);
      this.documentPreview.set(this.isDocument(report));
      this.viewed.set({ requestId: request.id, report });
      dialog.showModal();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected isDocument(record: SharedRecord): record is SharedDocument {
    return 'kind' in record;
  }
}
