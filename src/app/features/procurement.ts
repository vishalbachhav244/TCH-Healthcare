import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { Api, errorMessage } from '../core/api';
import { facilityQuery } from '../core/query';
import { SessionStore } from '../core/session';
import { Rupees, StatusTone } from '../design-system/format';
import { products } from '../domain/pharmacy';
import {
  openPurchaseOrder,
  orderStatuses,
  requisitionStatuses,
  type PurchaseOrder,
  type RequisitionRow,
} from '../domain/procurement';

type View = 'requests' | 'orders' | 'suppliers';
type Editor =
  | { kind: 'approve' | 'reject' | 'order'; request: RequisitionRow }
  | { kind: 'cancel'; order: PurchaseOrder };
const labels: Record<Editor['kind'], string> = {
  approve: 'Approve requisition',
  reject: 'Reject requisition',
  order: 'Issue purchase order',
  cancel: 'Cancel purchase order',
};
const notices: Record<Editor['kind'], string> = {
  approve: 'Requisition approved.',
  reject: 'Requisition rejected.',
  order: 'Purchase order issued.',
  cancel: 'Purchase order cancelled.',
};

@Component({
  imports: [NgIcon, ReactiveFormsModule, Rupees, StatusTone],
  templateUrl: './procurement.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Procurement {
  private readonly api = inject(Api);
  protected readonly store = inject(SessionStore);
  private readonly forms = inject(NonNullableFormBuilder);
  protected readonly reload = signal(0);
  protected readonly view = signal<View>('requests');
  protected readonly search = signal('');
  protected readonly status = signal('');
  protected readonly limit = signal(12);
  protected readonly editor = signal<Editor | undefined>(undefined);
  protected readonly supplier = this.forms.control('');
  private readonly supplierId = toSignal(this.supplier.valueChanges, { initialValue: '' });
  protected readonly labels = labels;
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly busy = signal(false);
  private readonly scope = computed(() => ({
    token: this.store.session()?.token ?? '',
    facility: this.store.facility()?.id ?? '',
    reload: this.reload(),
  }));
  protected readonly data = facilityQuery(this.scope, ({ token, facility }) =>
    this.api.procurement(token, facility),
  );
  private readonly value = computed(() => {
    const data = this.data();
    return data.state === 'ready' ? data.data : undefined;
  });
  protected readonly metrics = computed(() => {
    const data = this.value();
    return [
      {
        label: 'Awaiting approval',
        count: data?.requisitions.filter((row) => row.status === 'Requested').length ?? 0,
      },
      {
        label: 'Approved to order',
        count: data?.requisitions.filter((row) => row.status === 'Approved').length ?? 0,
      },
      { label: 'Open purchase orders', count: data?.orders.filter(openPurchaseOrder).length ?? 0 },
    ];
  });
  protected readonly statuses = computed(() =>
    this.view() === 'orders' ? orderStatuses : requisitionStatuses,
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
        this.matches(row.status, row.reference, row.supplierName, this.item(row.productId)),
      ) ?? [],
  );
  protected readonly suppliers = computed(
    () =>
      this.value()?.suppliers.filter((row) =>
        this.matches('', row.name, ...row.items.map((item) => this.item(item.productId))),
      ) ?? [],
  );
  protected readonly matchesCount = computed(() =>
    this.view() === 'requests'
      ? this.requests().length
      : this.view() === 'orders'
        ? this.orders().length
        : this.suppliers().length,
  );
  protected readonly compatible = computed(() => {
    const edit = this.editor();
    if (edit?.kind !== 'order') return [];
    const product = edit.request.productId;
    return (
      this.value()?.suppliers.flatMap((supplier) => {
        const item = supplier.items.find((row) => row.productId === product);
        return item ? [{ id: supplier.id, name: supplier.name, unitMinor: item.unitMinor }] : [];
      }) ?? []
    );
  });
  protected readonly quote = computed(() =>
    this.compatible().find((row) => row.id === this.supplierId()),
  );

  protected item(id: string) {
    return products.find((product) => product.id === id)?.name ?? id;
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
    this.supplier.reset();
    dialog.showModal();
  }

  protected async save(dialog: HTMLDialogElement) {
    const edit = this.editor();
    if (!edit || this.busy()) return;
    if (edit.kind === 'order' && !this.quote()) {
      this.error.set('Choose an eligible supplier.');
      return;
    }
    const { token, facility } = this.scope();
    this.notice.set('');
    this.error.set('');
    this.busy.set(true);
    try {
      switch (edit.kind) {
        case 'approve':
        case 'reject':
          await this.api.changeRequisition(token, facility, edit.request, edit.kind);
          break;
        case 'order':
          await this.api.issuePurchaseOrder(token, facility, edit.request, this.supplier.value);
          this.show('orders');
          break;
        case 'cancel':
          await this.api.cancelPurchaseOrder(token, facility, edit.order);
          break;
      }
      this.notice.set(notices[edit.kind]);
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
