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
import { Rupees, StatusTone } from '../design-system/format';
import { dayInIndia } from '../domain/operations';
import {
  medicationReturnReasons,
  products,
  stockBatchPattern,
  stockMovementKinds,
  stockReferencePattern,
  supplierReturnReasons,
  type MedicationReturn,
  type PharmacyData,
  type StockLotView,
  type SupplierReturn,
} from '../domain/pharmacy';

type DispensingRow = PharmacyData['prescriptions'][number];
type StockEditor =
  | { kind: 'receipt' }
  | { kind: 'supplier return'; lot: StockLotView }
  | { kind: 'patient return'; row: DispensingRow };
type PharmacyView = 'orders' | 'stock' | 'activity';

@Component({
  imports: [DatePipe, NgIcon, ReactiveFormsModule, Rupees, StatusTone],
  templateUrl: './pharmacy.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Pharmacy {
  private readonly api = inject(Api);
  protected readonly store = inject(SessionStore);
  private readonly forms = inject(NonNullableFormBuilder);
  protected readonly today = dayInIndia();
  protected readonly reload = signal(0);
  protected readonly query = signal('');
  protected readonly tab = signal<PharmacyView>('orders');
  protected readonly selected = signal<DispensingRow | undefined>(undefined);
  protected readonly stockEditor = signal<StockEditor | undefined>(undefined);
  protected readonly catalogue = products;
  protected readonly stockKinds = stockMovementKinds;
  protected readonly supplierReasons = supplierReturnReasons;
  protected readonly returnReasons = medicationReturnReasons;
  protected readonly filter = signal('');
  protected readonly pageSize = signal(12);
  protected readonly stockForm = this.forms.group({
    productId: [''],
    batch: ['', Validators.pattern(stockBatchPattern)],
    expiresOn: [this.today],
    quantity: [1],
    reference: ['', [Validators.required, Validators.pattern(stockReferencePattern)]],
    supplierReason: this.forms.control<SupplierReturn['reason'] | ''>(''),
    returnReason: this.forms.control<MedicationReturn['reason'] | ''>(''),
  });
  protected readonly lot = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required],
  });
  protected readonly notice = signal('');
  protected readonly failure = signal('');
  protected readonly saving = signal(false);
  private readonly scope = computed(() => ({
    token: this.store.session()?.token ?? '',
    facility: this.store.facility()?.id ?? '',
    reload: this.reload(),
  }));
  protected readonly data = facilityQuery(this.scope, ({ token, facility }) =>
    this.api.pharmacy(token, facility),
  );
  protected readonly lots = computed(() => {
    const data = this.data();
    return data.state === 'ready' ? data.data.lots : [];
  });
  protected readonly rows = computed(() => {
    const data = this.data();
    return data.state === 'ready' ? data.data.prescriptions : [];
  });
  protected readonly pending = computed(
    () => this.rows().filter(({ prescription }) => prescription.status === 'Signed').length,
  );
  protected readonly expired = computed(
    () => this.lots().filter((lot) => lot.expiresOn < this.today).length,
  );
  protected readonly quarantined = computed(() =>
    this.lots().reduce((count, lot) => count + lot.quarantined, 0),
  );
  protected readonly visibleLots = computed(() => {
    const query = this.query().trim().toLowerCase();
    return this.lots().filter(
      (lot) =>
        [lot.batch, this.product(lot.productId)?.name ?? ''].some((value) =>
          value.toLowerCase().includes(query),
        ) &&
        (!this.filter() || this.lotStatus(lot) === this.filter()),
    );
  });
  protected readonly activity = computed(() => {
    const data = this.data();
    if (data.state !== 'ready') return [];
    const query = this.query().trim().toLowerCase();
    return data.data.activity.filter(
      ({ movement, productId, batch }) =>
        [batch, movement.reference ?? '', this.product(productId)?.name ?? ''].some((value) =>
          value.toLowerCase().includes(query),
        ) &&
        (!this.filter() || movement.kind === this.filter()),
    );
  });
  protected readonly visible = computed(() => {
    const query = this.query().trim().toLowerCase();
    return this.rows().filter((row) => {
      const { patient, prescription } = row;
      return (
        (!this.filter() || this.prescriptionStatus(row) === this.filter()) &&
        [patient.name, patient.id, this.product(prescription.productId)?.name ?? ''].some((value) =>
          value.toLowerCase().includes(query),
        )
      );
    });
  });
  protected readonly resultCount = computed(() =>
    this.tab() === 'orders'
      ? this.visible().length
      : this.tab() === 'stock'
        ? this.visibleLots().length
        : this.activity().length,
  );
  protected readonly maxQuantity = computed(() => {
    const edit = this.stockEditor();
    if (edit?.kind === 'patient return') {
      const row =
        this.rows().find((item) => item.prescription.id === edit.row.prescription.id) ?? edit.row;
      return row.prescription.quantity - row.returnedQuantity;
    }
    if (edit?.kind === 'supplier return') {
      const lot = this.lots().find((item) => item.id === edit.lot.id) ?? edit.lot;
      return Math.min(lot.onHand, 10_000);
    }
    return 10_000;
  });
  protected readonly stockTitle = computed(() => {
    switch (this.stockEditor()?.kind) {
      case 'supplier return':
        return 'Return stock to supplier';
      case 'patient return':
        return 'Record patient return';
      default:
        return 'Receive stock';
    }
  });
  protected readonly eligibleLots = computed(() => {
    const request = this.selected()?.prescription;
    return request
      ? this.lots().filter(
          (lot) =>
            lot.productId === request.productId &&
            lot.expiresOn >= this.today &&
            lot.onHand >= request.quantity,
        )
      : [];
  });

  protected product(id: string) {
    return products.find((product) => product.id === id);
  }

  protected show(view: PharmacyView) {
    this.tab.set(view);
    this.query.set('');
    this.filter.set('');
    this.pageSize.set(12);
  }

  protected lotStatus(lot: StockLotView) {
    if (lot.expiresOn < this.today) return 'Expired';
    return lot.onHand ? 'Current' : 'Out of stock';
  }

  protected prescriptionStatus(row: DispensingRow) {
    return row.returnedQuantity === row.prescription.quantity
      ? 'Returned'
      : row.prescription.status;
  }

  protected open(row: DispensingRow, dialog: HTMLDialogElement) {
    this.selected.set(row);
    this.lot.setValue('');
    this.failure.set('');
    dialog.showModal();
  }

  protected async dispense(dialog: HTMLDialogElement) {
    const selected = this.selected();
    if (!selected || this.lot.invalid || this.saving()) return;
    await this.save(
      dialog,
      (token, facility) =>
        this.api.dispenseMedication(token, facility, selected.prescription.id, this.lot.value),
      'Medication dispensed and charge posted.',
    );
  }

  protected openStock(dialog: HTMLDialogElement, editor: StockEditor) {
    this.stockEditor.set(editor);
    this.stockForm.reset({ expiresOn: this.today });
    this.failure.set('');
    dialog.showModal();
  }

  protected async recordStock(dialog: HTMLDialogElement) {
    const action = this.stockEditor();
    const { productId, batch, expiresOn, quantity, reference, supplierReason, returnReason } =
      this.stockForm.getRawValue();
    if (!action || this.saving()) return;
    if (
      !stockReferencePattern.test(reference.trim()) ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > this.maxQuantity()
    ) {
      this.failure.set('Enter a valid reference and quantity within the displayed limit.');
      return;
    }
    if (action.kind === 'receipt') {
      if (!productId || !expiresOn || !stockBatchPattern.test(batch.trim())) {
        this.failure.set('Choose a medication and expiry and enter a valid batch code.');
        return;
      }
      if (
        await this.save(
          dialog,
          (token, facility) =>
            this.api.receivePharmacyStock(token, facility, {
              productId,
              batch,
              expiresOn,
              quantity,
              reference,
            }),
          'Stock receipt recorded.',
        )
      ) {
        this.show('stock');
        this.query.set(batch.trim().toUpperCase());
      }
    } else if (action.kind === 'supplier return' && supplierReason) {
      await this.save(
        dialog,
        (token, facility) =>
          this.api.returnPharmacyStock(token, facility, {
            lotId: action.lot.id,
            quantity,
            reference,
            reason: supplierReason,
          }),
        'Supplier return recorded.',
      );
    } else if (action.kind === 'patient return' && returnReason) {
      await this.save(
        dialog,
        (token, facility) =>
          this.api.returnMedication(token, facility, {
            prescriptionId: action.row.prescription.id,
            quantity,
            reference,
            reason: returnReason,
          }),
        'Patient return recorded in quarantine.',
      );
    }
  }

  private async save(
    dialog: HTMLDialogElement,
    command: (token: string, facility: string) => Promise<unknown>,
    notice: string,
  ) {
    const { token, facility } = this.scope();
    this.saving.set(true);
    this.failure.set('');
    this.notice.set('');
    try {
      await command(token, facility);
      this.notice.set(notice);
      dialog.close();
      return true;
    } catch (error) {
      this.failure.set(errorMessage(error));
      return false;
    } finally {
      this.saving.set(false);
    }
  }
}
