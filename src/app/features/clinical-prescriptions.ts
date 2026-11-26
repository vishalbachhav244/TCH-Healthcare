import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Api, errorMessage } from '../core/api';
import { facilityQuery } from '../core/query';
import { SessionStore } from '../core/session';
import type { Encounter } from '../domain/operations';
import { products } from '../domain/pharmacy';

@Component({
  selector: 'tc-clinical-prescriptions',
  imports: [ReactiveFormsModule],
  template: `
    <section class="fields" aria-label="Consultation prescriptions">
      <h3>Prescriptions</h3>
      @let response = data();
      @if (notice()) {
        <p role="status">{{ notice() }}</p>
      }
      @if (failure()) {
        <p class="field-error" role="alert">{{ failure() }}</p>
      }
      @if (response.state === 'loading') {
        <p role="status">Loading prescriptions…</p>
      } @else if (response.state === 'error') {
        <p role="alert">{{ response.message }}</p>
      } @else {
        @for (row of response.data; track row.id) {
          <div class="table-footer">
            <span
              ><strong>{{ name(row.productId) }}</strong> · {{ row.quantity }} ·
              {{ row.status }}</span
            >
            @if (row.status === 'Draft') {
              <button type="button" class="text-button" [disabled]="busy()" (click)="sign(row.id)">
                Sign prescription
              </button>
            }
          </div>
        } @empty {
          <p class="subtle">No prescriptions recorded for this encounter.</p>
        }
      }
      @if (!encounter().signedAt) {
        <form class="fields" [formGroup]="draft" (ngSubmit)="create()">
          <label for="prescribed-product">Medication</label>
          <select id="prescribed-product" formControlName="productId">
            <option value="">Select medication</option>
            @for (item of catalogue; track item.id) {
              <option [value]="item.id">{{ item.name }}</option>
            }
          </select>
          <label for="prescribed-quantity">Dispensing quantity</label>
          <input
            id="prescribed-quantity"
            type="number"
            min="1"
            max="30"
            formControlName="quantity"
          />
          <button type="submit" class="button secondary" [disabled]="draft.invalid || busy()">
            Save prescription draft
          </button>
        </form>
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClinicalPrescriptions {
  private readonly api = inject(Api);
  private readonly store = inject(SessionStore);
  readonly encounter = input.required<Encounter>();
  protected readonly catalogue = products;
  protected readonly busy = signal(false);
  protected readonly failure = signal('');
  protected readonly notice = signal('');
  protected readonly draft = inject(NonNullableFormBuilder).group({
    productId: ['', Validators.required],
    quantity: [1, [Validators.required, Validators.min(1), Validators.max(30)]],
  });
  private readonly scope = computed(() => ({
    token: this.store.session()?.token ?? '',
    facility: this.store.facility()?.id ?? '',
    encounterId: this.encounter().id,
  }));
  protected readonly data = facilityQuery(this.scope, ({ token, facility, encounterId }) =>
    this.api.prescriptions(token, facility, encounterId),
  );

  protected name(id: string) {
    return this.catalogue.find((product) => product.id === id)?.name ?? 'Medication';
  }

  protected async create() {
    if (this.draft.invalid) return;
    const { productId, quantity } = this.draft.getRawValue();
    if (
      await this.save(
        'clinical/prescriptions',
        { encounterId: this.encounter().id, productId, quantity: String(quantity) },
        'Prescription draft saved.',
      )
    ) {
      this.draft.reset();
    }
  }

  protected sign(prescriptionId: string) {
    return this.save(
      'clinical/prescriptions/sign',
      { prescriptionId },
      'Prescription signed and sent to pharmacy.',
    );
  }

  private async save(path: string, body: Record<string, string>, notice: string) {
    if (this.busy()) return false;
    this.busy.set(true);
    this.notice.set('');
    this.failure.set('');
    try {
      const { token, facility } = this.scope();
      await this.api.execute(path, token, facility, body);
      this.notice.set(notice);
      return true;
    } catch (error) {
      this.failure.set(errorMessage(error));
      return false;
    } finally {
      this.busy.set(false);
    }
  }
}
