import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { Api, errorMessage } from '../core/api';
import { facilityQuery } from '../core/query';
import { SessionStore } from '../core/session';
import { Rupees, StatusTone } from '../design-system/format';
import type { InpatientBillingDetail } from '../domain/discharge';

@Component({
  selector: 'tc-inpatient-billing',
  imports: [DatePipe, NgIcon, ReactiveFormsModule, Rupees, StatusTone],
  templateUrl: './inpatient-billing.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InpatientBilling {
  private readonly api = inject(Api);
  readonly issued = output<void>();
  protected readonly store = inject(SessionStore);
  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly status = new FormControl('', { nonNullable: true });
  protected readonly acknowledged = new FormControl(false, { nonNullable: true });
  protected readonly visible = signal(12);
  protected readonly reload = signal(0);
  protected readonly admissionId = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  private readonly searchValue = toSignal(this.search.valueChanges, { initialValue: '' });
  private readonly statusValue = toSignal(this.status.valueChanges, { initialValue: '' });
  private readonly scope = computed(() => ({
    token: this.store.session()?.token ?? '',
    facility: this.store.facility()?.id ?? '',
    reload: this.reload(),
  }));
  protected readonly list = facilityQuery(this.scope, ({ token, facility }) =>
    this.api.inpatientBilling(token, facility),
  );
  protected readonly filtered = computed(() => {
    const list = this.list();
    if (list.state !== 'ready') return [];
    const search = this.searchValue().trim().toLowerCase();
    const status = this.statusValue();
    return list.data.filter(
      (row) =>
        (!status || row.status === status) &&
        (!search || (row.patient.name + ' ' + row.patient.id).toLowerCase().includes(search)),
    );
  });
  private readonly detailParams = computed(() => ({
    ...this.scope(),
    facility: this.admissionId() ? this.scope().facility : '',
    admissionId: this.admissionId(),
  }));
  protected readonly detail = facilityQuery(this.detailParams, ({ token, facility, admissionId }) =>
    this.api.inpatientBillDetail(token, facility, admissionId),
  );

  protected review(dialog: HTMLDialogElement, id: string) {
    this.error.set('');
    this.acknowledged.reset();
    this.admissionId.set(id);
    dialog.showModal();
  }

  protected async issue(dialog: HTMLDialogElement, account: InpatientBillingDetail) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    const { token, facility } = this.scope();
    try {
      await this.api.issueInpatientInvoice(
        token,
        facility,
        account.admissionId,
        this.acknowledged.value,
      );
      dialog.close();
      this.issued.emit();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
