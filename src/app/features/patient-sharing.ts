import { DatePipe, formatDate } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
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
import {
  exchangeRecordKinds,
  type ConsentAction,
  type RecordReference,
  type RequestSummary,
} from '../domain/interoperability';

const recordLabels: Record<RecordReference['kind'], string> = {
  'Laboratory report': 'Report',
  'Imaging report': 'Imaging report',
  'Discharge summary': 'Discharge summary',
  'Patient document': 'Document',
};

function releaseDate(time: number) {
  return formatDate(time, 'd MMM y, HH:mm', 'en', '+0530') + ' IST';
}

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
  protected readonly recordKinds = exchangeRecordKinds;
  protected readonly labels = recordLabels;
  protected readonly connector = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required],
  });
  protected readonly code = signal<{ code: string; expiresAt: number } | undefined>(undefined);
  protected readonly selected = signal<
    { request: RequestSummary; action: ConsentAction } | undefined
  >(undefined);
  protected readonly grant = inject(NonNullableFormBuilder).group({
    recordKind: new FormControl<RecordReference['kind']>('Laboratory report', {
      nonNullable: true,
    }),
    recordSelection: ['', Validators.required],
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
  protected readonly recordKind = toSignal(this.grant.controls.recordKind.valueChanges, {
    initialValue: this.grant.controls.recordKind.value,
  });
  protected readonly choices = computed(() => {
    const response = this.response();
    if (response.state !== 'ready') return [];
    const data = response.data;
    switch (this.recordKind()) {
      case 'Laboratory report':
        return data.reports.map(({ id, version, test, accession }) => ({
          id,
          version,
          label: test + ' · ' + accession,
        }));
      case 'Imaging report':
        return data.imagingReports.map(({ id, version, study, publishedAt }) => ({
          id,
          version,
          label: study + ' · ' + releaseDate(publishedAt),
        }));
      case 'Discharge summary':
        return data.dischargeSummaries.map(({ admissionId, version, releasedAt }) => ({
          id: admissionId,
          version,
          label: 'Discharge summary · ' + releaseDate(releasedAt),
        }));
      case 'Patient document':
        return data.documents.map(({ id, version, title, format }) => ({
          id,
          version,
          label: title + ' · ' + format,
        }));
    }
  });

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
      const { recordSelection, hours, recordKind } = this.grant.getRawValue();
      const [reportId, recordVersion] = recordSelection.split('|');
      await this.api.decideReportConsent(
        token,
        facility,
        target.request,
        target.action,
        target.action === 'grant' ? { reportId, recordVersion, hours, recordKind } : undefined,
      );
      this.notice.set(
        target.action === 'grant'
          ? recordLabels[recordKind] + ' access granted.'
          : target.action === 'decline'
            ? 'Request declined.'
            : recordLabels[target.request.recordKind ?? 'Laboratory report'] + ' access revoked.',
      );
      dialog.close();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
