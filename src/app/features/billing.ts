import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  viewChild,
  type ElementRef,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { Api, errorMessage } from '../core/api';
import { facilityQuery } from '../core/query';
import { SessionStore } from '../core/session';
import { Rupees, StatusTone } from '../design-system/format';
import { dayInIndia, type InvoiceRow } from '../domain/operations';
import { InpatientBilling } from './inpatient-billing';

@Component({
  imports: [InpatientBilling, NgIcon, ReactiveFormsModule, Rupees, StatusTone],
  templateUrl: './billing.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Billing {
  private readonly api = inject(Api);
  private readonly invoiceView = viewChild<ElementRef<HTMLButtonElement>>('invoiceView');
  protected readonly store = inject(SessionStore);
  protected readonly settings = signal<Awaited<ReturnType<Api['invoiceOptions']>> | undefined>(
    undefined,
  );
  protected readonly selected = signal<InvoiceRow | undefined>(undefined);
  protected readonly day = signal(dayInIndia());
  protected readonly mode = signal<'invoices' | 'inpatient'>('invoices');
  protected readonly inpatientAllowed = computed(
    () => this.store.facility()?.inpatient && this.store.writeAllowed('billing'),
  );
  protected readonly showInpatient = computed(
    () => this.inpatientAllowed() && this.mode() === 'inpatient',
  );
  protected readonly reload = signal(0);
  protected readonly message = signal('');
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly form = inject(NonNullableFormBuilder).group({
    encounterId: ['', Validators.required],
    service: ['', Validators.required],
  });
  private readonly params = computed(() => ({
    facility: this.store.facility()?.id ?? '',
    token: this.store.session()?.token ?? '',
    day: this.day(),
    reload: this.reload(),
  }));
  protected readonly data = facilityQuery(this.params, ({ token, facility, day }) =>
    this.api.invoices(token, facility, day),
  );
  protected readonly totals = computed(() => {
    const response = this.data();
    const rows = response.state === 'ready' ? response.data : [];
    return rows.reduce(
      (acc, row) => ({
        total: acc.total + row.totalMinor,
        due: acc.due + row.balanceMinor,
        count: acc.count + 1,
      }),
      { total: 0, due: 0, count: 0 },
    );
  });

  protected async newInvoice(dialog: HTMLDialogElement) {
    const { token, facility } = this.params();
    this.form.reset();
    this.settings.set(undefined);
    this.error.set('');
    dialog.showModal();
    try {
      this.settings.set(await this.api.invoiceOptions(token, facility, dayInIndia()));
    } catch (error) {
      this.error.set(errorMessage(error));
    }
  }

  protected inpatientIssued() {
    this.day.set(dayInIndia());
    this.mode.set('invoices');
    this.message.set('Inpatient invoice issued.');
    this.invoiceView()?.nativeElement.focus();
  }

  protected openPayment(row: InvoiceRow, dialog: HTMLDialogElement) {
    this.error.set('');
    this.selected.set(row);
    dialog.showModal();
  }

  protected create(dialog: HTMLDialogElement) {
    if (this.form.invalid) {
      this.error.set('Choose an encounter and service.');
      return;
    }
    return this.save('billing/invoices', this.form.getRawValue(), 'Invoice issued.', dialog);
  }

  protected settle(dialog: HTMLDialogElement) {
    const selected = this.selected();
    if (selected)
      return this.save(
        'billing/payments',
        { invoiceId: selected.invoice.id },
        'Local settlement recorded.',
        dialog,
      );
    return undefined;
  }

  private async save(
    path: string,
    payload: Record<string, string>,
    message: string,
    dialog: HTMLDialogElement,
  ) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.message.set('');
    const { token, facility } = this.params();
    try {
      await this.api.execute(path, token, facility, payload);
      this.message.set(message);
      dialog.close();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
