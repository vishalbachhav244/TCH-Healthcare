import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { Api, errorMessage } from '../core/api';
import { facilityQuery } from '../core/query';
import { SessionStore } from '../core/session';
import { Rupees } from '../design-system/format';
import { dayInIndia } from '../domain/operations';
import { products, type PharmacyData } from '../domain/pharmacy';

type DispensingRow = PharmacyData['prescriptions'][number];

@Component({
  imports: [DatePipe, NgIcon, ReactiveFormsModule, Rupees],
  templateUrl: './pharmacy.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Pharmacy {
  private readonly api = inject(Api);
  private readonly store = inject(SessionStore);
  protected readonly today = dayInIndia();
  protected readonly reload = signal(0);
  protected readonly query = signal('');
  protected readonly tab = signal<'orders' | 'stock'>('orders');
  protected readonly selected = signal<DispensingRow | undefined>(undefined);
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
  protected readonly visible = computed(() => {
    const query = this.query().trim().toLowerCase();
    return this.rows().filter(({ patient, prescription }) =>
      [patient.name, patient.id, this.product(prescription.productId)?.name ?? ''].some((value) =>
        value.toLowerCase().includes(query),
      ),
    );
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

  protected open(row: DispensingRow, dialog: HTMLDialogElement) {
    this.selected.set(row);
    this.lot.setValue('');
    this.failure.set('');
    dialog.showModal();
  }

  protected async dispense(dialog: HTMLDialogElement) {
    const selected = this.selected();
    const { token, facility } = this.scope();
    if (!selected || this.lot.invalid || this.saving()) return;
    this.saving.set(true);
    this.failure.set('');
    this.notice.set('');
    try {
      await this.api.execute('pharmacy/dispense', token, facility, {
        prescriptionId: selected.prescription.id,
        lotId: this.lot.value,
      });
      this.notice.set('Medication dispensed and charge posted.');
      dialog.close();
    } catch (error) {
      this.failure.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }
}
