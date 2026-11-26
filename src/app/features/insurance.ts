import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { Api, errorMessage } from '../core/api';
import { facilityQuery } from '../core/query';
import { SessionStore } from '../core/session';
import { Rupees, StatusTone } from '../design-system/format';
import { parseRupees } from '../domain/finance';
import {
  claimStatuses,
  openInsuranceClaim,
  payers,
  type ClaimAction,
  type ClaimStatus,
  type InsuranceRow,
  type Payer,
} from '../domain/insurance';
import { dayInIndia, shiftDay } from '../domain/operations';

type Editor = { kind: 'coverage' | 'request' | 'claim'; row: InsuranceRow };
type Action = ClaimAction['action'];
const actions: Partial<Record<ClaimStatus, Action[]>> = {
  Requested: ['authorise', 'deny', 'cancel'],
  Authorised: ['prepare', 'cancel'],
  Prepared: ['submit', 'cancel'],
  Submitted: ['settle', 'reject'],
};
const actionLabels: Record<Action, string> = {
  authorise: 'Record authorisation',
  deny: 'Record denial',
  prepare: 'Prepare claim',
  submit: 'Record submission',
  settle: 'Record payer settlement',
  reject: 'Record rejection',
  cancel: 'Cancel claim',
};

@Component({
  imports: [DatePipe, NgIcon, ReactiveFormsModule, Rupees, StatusTone],
  templateUrl: './insurance.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Insurance {
  private readonly api = inject(Api);
  protected readonly store = inject(SessionStore);
  private readonly forms = inject(NonNullableFormBuilder);
  protected readonly today = dayInIndia();
  protected readonly day = signal(this.today);
  protected readonly query = signal('');
  protected readonly status = signal('');
  protected readonly limit = signal(12);
  protected readonly reload = signal(0);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly editor = signal<Editor | undefined>(undefined);
  protected readonly statuses = claimStatuses;
  protected readonly payers = payers;
  protected readonly actionLabels = actionLabels;
  protected readonly openClaim = openInsuranceClaim;
  protected readonly form = this.forms.group({
    payer: this.forms.control<Payer | ''>(''),
    policy: [''],
    startsOn: [this.today],
    expiresOn: [''],
    coverageId: [''],
    action: this.forms.control<Action | ''>(''),
    approved: [''],
  });
  private readonly params = computed(() => ({
    token: this.store.session()?.token ?? '',
    facility: this.store.facility()?.id ?? '',
    day: this.day(),
    reload: this.reload(),
  }));
  protected readonly data = facilityQuery(this.params, ({ token, facility, day }) =>
    this.api.insurance(token, facility, day),
  );
  protected readonly rows = computed(() => {
    const result = this.data();
    return result.state === 'ready' ? result.data : [];
  });
  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const status = this.status();
    return this.rows().filter(
      (row) =>
        (!status || (row.claim?.status ?? 'No claim') === status) &&
        (!q ||
          [row.patientName, row.patientId, row.service, row.claim?.payer ?? ''].some((value) =>
            value.toLowerCase().includes(q),
          )),
    );
  });
  protected readonly metrics = computed(() => [
    {
      label: 'Open claims',
      count: this.rows().filter(({ claim }) => claim && openInsuranceClaim(claim)).length,
    },
    {
      label: 'Submitted',
      count: this.rows().filter(({ claim }) => claim?.status === 'Submitted').length,
    },
    {
      label: 'Settled',
      count: this.rows().filter(({ claim }) => claim?.status === 'Settled').length,
    },
  ]);
  protected readonly options = computed(() => {
    const status = this.editor()?.row.claim?.status;
    return status ? (actions[status] ?? []) : [];
  });
  protected readonly title = computed(() => {
    switch (this.editor()?.kind) {
      case 'coverage':
        return 'Record patient coverage';
      case 'request':
        return 'Request preauthorisation';
      default:
        return this.options().length ? 'Update insurance claim' : 'Insurance claim';
    }
  });

  protected open(dialog: HTMLDialogElement, editor: Editor) {
    this.error.set('');
    this.editor.set(editor);
    this.form.reset({
      startsOn: this.day(),
      expiresOn: shiftDay(this.day(), 365),
      coverageId: editor.row.coverages.length === 1 ? editor.row.coverages[0].id : '',
    });
    dialog.showModal();
  }

  protected async save(dialog: HTMLDialogElement) {
    const editor = this.editor();
    if (!editor || this.busy()) return;
    const { payer, policy, startsOn, expiresOn, coverageId, action, approved } =
      this.form.getRawValue();
    const { token, facility } = this.params();
    const { row } = editor;
    this.error.set('');
    const approvedMinor = parseRupees(approved);
    if (editor.kind === 'coverage' && (!payer || !policy || !startsOn || !expiresOn)) {
      this.error.set('Choose a payer and enter the policy code and dates.');
      return;
    }
    if (editor.kind === 'request' && !coverageId) {
      this.error.set('Choose patient coverage for this request.');
      return;
    }
    if (
      editor.kind === 'claim' &&
      (!action || (action === 'authorise' && (!approvedMinor || approvedMinor < 0)))
    ) {
      this.error.set(
        action === 'authorise'
          ? 'Enter the approved amount in rupees and paise.'
          : 'Choose a claim action.',
      );
      return;
    }
    this.notice.set('');
    this.busy.set(true);
    try {
      if (editor.kind === 'coverage' && payer) {
        await this.api.recordCoverage(token, facility, row.invoiceId, {
          payer,
          policy,
          startsOn,
          expiresOn,
        });
        this.notice.set('Patient coverage recorded.');
      } else if (editor.kind === 'request') {
        await this.api.requestClaim(token, facility, row.invoiceId, coverageId);
        this.notice.set('Preauthorisation request recorded.');
      } else if (row.claim && action) {
        const command: ClaimAction =
          action === 'authorise' ? { action, approvedMinor: approvedMinor! } : { action };
        await this.api.changeClaim(token, facility, row.claim, command);
        this.notice.set(
          action === 'settle' ? 'Local payer settlement recorded.' : 'Claim updated.',
        );
      }
      dialog.close();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
