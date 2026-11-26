import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { Api, errorMessage } from '../core/api';
import { facilityQuery } from '../core/query';
import { SessionStore } from '../core/session';
import { StatusTone } from '../design-system/format';
import { dayInIndia } from '../domain/operations';
import { products, type StockLotView } from '../domain/pharmacy';
import {
  countReasons,
  openPurchaseOrder,
  orderStatuses,
  requisitionPurposes,
  requisitionStatuses,
  type CountFields,
  type ReceivingRow,
  type RequisitionFields,
  type RequisitionRow,
} from '../domain/procurement';

type View = 'stock' | 'requests' | 'receiving';
type Editor =
  | { kind: 'request' }
  | { kind: 'withdraw'; request: RequisitionRow }
  | { kind: 'receive' | 'history'; order: ReceivingRow }
  | { kind: 'count'; lot: StockLotView };
const editorLabels: Record<Editor['kind'], string> = {
  request: 'Create requisition',
  withdraw: 'Withdraw requisition',
  receive: 'Post goods receipt',
  history: 'Goods receipt history',
  count: 'Record stock count',
};
const saveLabels: Record<Editor['kind'], string> = {
  request: 'Submit requisition',
  withdraw: 'Confirm withdrawal',
  receive: 'Save receipt',
  history: 'Close',
  count: 'Save stock count',
};

@Component({
  imports: [DatePipe, NgIcon, ReactiveFormsModule, StatusTone],
  templateUrl: './inventory.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Inventory {
  private readonly api = inject(Api);
  protected readonly store = inject(SessionStore);
  private readonly forms = inject(NonNullableFormBuilder);
  protected readonly today = dayInIndia();
  protected readonly view = signal<View>('stock');
  protected readonly search = signal('');
  protected readonly status = signal('');
  protected readonly limit = signal(12);
  protected readonly reload = signal(0);
  protected readonly notice = signal('');
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly editor = signal<Editor | undefined>(undefined);
  protected readonly editorLabels = editorLabels;
  protected readonly saveLabels = saveLabels;
  protected readonly products = products;
  protected readonly causes = requisitionPurposes;
  protected readonly countReasons = countReasons;
  protected readonly openOrder = openPurchaseOrder;
  protected readonly form = this.forms.group({
    productId: [''],
    quantity: [1],
    purpose: this.forms.control<RequisitionFields['purpose'] | ''>(''),
    batch: [''],
    expiresOn: [this.today],
    reference: [''],
    counted: [0],
    reason: this.forms.control<CountFields['reason'] | ''>(''),
  });
  private readonly scope = computed(() => ({
    token: this.store.session()?.token ?? '',
    facility: this.store.facility()?.id ?? '',
    reload: this.reload(),
  }));
  protected readonly data = facilityQuery(this.scope, ({ token, facility }) =>
    this.api.inventory(token, facility),
  );
  protected readonly statuses = computed(() =>
    this.view() === 'stock'
      ? ['Current', 'Expired', 'Out of stock']
      : this.view() === 'requests'
        ? requisitionStatuses
        : orderStatuses,
  );
  private readonly value = computed(() => {
    const data = this.data();
    return data.state === 'ready' ? data.data : undefined;
  });
  protected readonly metrics = computed(() => {
    const data = this.value();
    return [
      {
        label: 'Unexpired units on hand',
        count:
          data?.lots
            .filter((lot) => lot.expiresOn >= this.today)
            .reduce((sum, lot) => sum + lot.onHand, 0) ?? 0,
      },
      {
        label: 'Awaiting approval',
        count: data?.requisitions.filter((row) => row.status === 'Requested').length ?? 0,
      },
      { label: 'Open for receiving', count: data?.orders.filter(openPurchaseOrder).length ?? 0 },
    ];
  });
  protected readonly lots = computed(
    () =>
      this.value()?.lots.filter((row) =>
        this.matches(this.lotStatus(row), row.batch, this.item(row.productId)),
      ) ?? [],
  );
  protected readonly requests = computed(
    () =>
      this.value()?.requisitions.filter((row) =>
        this.matches(
          row.status,
          row.reference,
          this.item(row.productId),
          row.purchaseOrderReference ?? '',
        ),
      ) ?? [],
  );
  protected readonly orders = computed(
    () =>
      this.value()?.orders.filter((row) =>
        this.matches(row.status, row.reference, this.item(row.productId), row.supplierName),
      ) ?? [],
  );
  protected readonly matchesCount = computed(() =>
    this.view() === 'stock'
      ? this.lots().length
      : this.view() === 'requests'
        ? this.requests().length
        : this.orders().length,
  );

  protected item(id: string) {
    return products.find((product) => product.id === id)?.name ?? id;
  }

  protected lotStatus(lot: StockLotView) {
    if (lot.expiresOn < this.today) return 'Expired';
    return lot.onHand > 0 ? 'Current' : 'Out of stock';
  }

  protected show(view: View) {
    this.view.set(view);
    this.search.set('');
    this.status.set('');
    this.limit.set(12);
  }

  protected open(dialog: HTMLDialogElement, editor: Editor) {
    this.error.set('');
    this.editor.set(editor);
    this.form.reset({
      expiresOn: this.today,
      counted: editor.kind === 'count' ? editor.lot.onHand : 0,
    });
    dialog.showModal();
  }

  protected async save(dialog: HTMLDialogElement) {
    const edit = this.editor();
    if (!edit || this.busy()) return;
    const { token, facility } = this.scope();
    const { productId, purpose, quantity, batch, expiresOn, reference, counted, reason } =
      this.form.getRawValue();
    this.error.set('');
    this.notice.set('');
    this.busy.set(true);
    try {
      switch (edit.kind) {
        case 'request':
          if (
            !productId ||
            !purpose ||
            !Number.isInteger(quantity) ||
            quantity < 1 ||
            quantity > 10_000
          ) {
            this.error.set('Choose an item, purpose and whole request quantity from 1 to 10,000.');
            return;
          }
          await this.api.recordRequisition(token, facility, { productId, purpose, quantity });
          this.show('requests');
          this.notice.set('Requisition submitted for approval.');
          break;
        case 'withdraw':
          await this.api.changeRequisition(token, facility, edit.request, 'withdraw');
          this.notice.set('Requisition withdrawn.');
          break;
        case 'receive':
          if (!reference || !batch || !expiresOn || !Number.isInteger(quantity) || quantity < 1) {
            this.error.set('Enter the receipt reference, batch, expiry and whole quantity.');
            return;
          }
          await this.api.postGoodsReceipt(token, facility, {
            purchaseOrderId: edit.order.id,
            version: edit.order.version,
            reference,
            batch,
            expiresOn,
            quantity,
          });
          this.notice.set('Goods receipt posted to the stock ledger.');
          break;
        case 'count':
          if (!reference || !reason || !Number.isSafeInteger(counted) || counted < 0) {
            this.error.set('Enter a reference, reason and non-negative whole count.');
            return;
          }
          await this.api.recordStockCount(token, facility, {
            lotId: edit.lot.id,
            expectedOnHand: edit.lot.onHand,
            countedOnHand: counted,
            reference,
            reason,
          });
          this.notice.set('Stock count recorded.');
          break;
      }
      dialog.close();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  private matches(status: string, ...values: string[]) {
    const q = this.search().trim().toLowerCase();
    return (
      (!this.status() || this.status() === status) &&
      values.some((item) => item.toLowerCase().includes(q))
    );
  }
}
