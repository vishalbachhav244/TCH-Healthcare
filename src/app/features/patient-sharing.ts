import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  FormControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { Api, errorMessage } from '../core/api';
import { facilityQuery } from '../core/query';
import { SessionStore } from '../core/session';
import type { ConsentAction, RequestSummary } from '../domain/interoperability';

@Component({
  selector: 'tc-patient-sharing',
  imports: [DatePipe, NgIcon, ReactiveFormsModule],
  templateUrl: './patient-sharing.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatientSharing {
  private readonly api = inject(Api);
  private readonly store = inject(SessionStore);
  protected readonly reload = signal(0);
  protected readonly notice = signal('');
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly connector = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required],
  });
  protected readonly code = signal<{ code: string; expiresAt: number } | undefined>(undefined);
  protected readonly selected = signal<
    { request: RequestSummary; action: ConsentAction } | undefined
  >(undefined);
  protected readonly grant = inject(NonNullableFormBuilder).group({
    reportId: ['', Validators.required],
    hours: ['24', Validators.required],
  });
  private readonly scope = computed(() => ({
    facility: this.store.facility()?.id ?? '',
    token: this.store.session()?.token ?? '',
    reload: this.reload(),
  }));
  protected readonly response = facilityQuery(this.scope, ({ token, facility }) =>
    this.api.patientSharing(token, facility),
  );

  protected async issue() {
    if (this.busy() || this.connector.invalid) return;
    const { token, facility } = this.scope();
    this.busy.set(true);
    this.error.set('');
    this.code.set(undefined);
    try {
      const code = await this.api.matchingCode(token, facility, this.connector.value);
      this.code.set(code);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected async copy() {
    const code = this.code();
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code.code);
      this.notice.set('Matching code copied.');
    } catch {
      this.notice.set('Select and copy the matching code shown above.');
    }
  }

  protected open(request: RequestSummary, action: ConsentAction, dialog: HTMLDialogElement) {
    this.selected.set({ request, action });
    this.grant.reset();
    this.error.set('');
    dialog.showModal();
  }

  protected async decide(dialog: HTMLDialogElement) {
    const target = this.selected();
    if (!target || this.busy() || (target.action === 'grant' && this.grant.invalid)) return;
    const { token, facility } = this.scope();
    this.busy.set(true);
    this.notice.set('');
    this.error.set('');
    try {
      await this.api.decideReportConsent(
        token,
        facility,
        target.request,
        target.action,
        target.action === 'grant' ? this.grant.getRawValue() : undefined,
      );
      this.notice.set(
        target.action === 'grant'
          ? 'Report access granted.'
          : target.action === 'decline'
            ? 'Request declined.'
            : 'Report access revoked.',
      );
      dialog.close();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
