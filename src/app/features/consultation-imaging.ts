import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Api, errorMessage } from '../core/api';
import { facilityQuery } from '../core/query';
import { SessionStore } from '../core/session';
import type { Encounter } from '../domain/operations';
import { imagingCatalogue, type ImagingStudy } from '../domain/radiology';

@Component({
  selector: 'tc-consultation-imaging',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="fields" aria-label="Consultation imaging">
      <h3>Imaging orders</h3>
      @if (notice()) {
        <p role="status">{{ notice() }}</p>
      }
      @if (error()) {
        <p role="alert" class="field-error">{{ error() }}</p>
      }
      @let response = data();
      @if (response.state === 'loading') {
        <p role="status">Loading imaging orders…</p>
      } @else if (response.state === 'error') {
        <p role="alert">{{ response.message }}</p>
        <button class="button secondary" type="button" (click)="reload.set(reload() + 1)">
          Retry imaging orders
        </button>
      } @else {
        @for (order of response.data; track order.id) {
          <div>
            <strong>{{ order.study }}</strong>
            <p class="subtle">
              {{ order.status }}
              @if (order.scheduledDay && order.status !== 'Cancelled') {
                · {{ order.scheduledDay }} at {{ order.scheduledTime }} IST
              }
            </p>
            @if (order.note) {
              <p>{{ order.note }}</p>
            }
          </div>
        } @empty {
          <p class="subtle">No imaging studies have been ordered for this visit.</p>
        }
      }
      @if (!encounter().signedAt && store.writeAllowed('clinical')) {
        <form class="fields" (submit)="$event.preventDefault(); order()">
          <label for="consult-imaging-study">Imaging study</label>
          <select id="consult-imaging-study" [formControl]="study" required>
            <option value="">Choose a study</option>
            @for (item of studies; track item.study) {
              <option [value]="item.study">{{ item.study }}</option>
            }
          </select>
          <button class="button secondary" type="submit" [disabled]="busy() || !study.value">
            Order imaging
          </button>
        </form>
      }
    </section>
  `,
})
export class ConsultationImaging {
  private readonly api = inject(Api);
  protected readonly store = inject(SessionStore);
  readonly encounter = input.required<Encounter>();
  protected readonly studies = imagingCatalogue;
  protected readonly study = inject(NonNullableFormBuilder).control<ImagingStudy | ''>('');
  protected readonly reload = signal(0);
  protected readonly busy = signal(false);
  protected readonly notice = signal('');
  protected readonly error = signal('');
  private readonly scope = computed(() => ({
    token: this.store.session()?.token ?? '',
    facility: this.store.facility()?.id ?? '',
    encounterId: this.encounter().id,
    reload: this.reload(),
  }));
  protected readonly data = facilityQuery(this.scope, ({ token, facility, encounterId }) =>
    this.api.imagingOrders(token, facility, encounterId),
  );

  protected async order() {
    const study = this.study.value;
    if (this.busy() || !study) return;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      const { token, facility, encounterId } = this.scope();
      await this.api.requestImaging(token, facility, encounterId, study);
      this.study.reset();
      this.notice.set('Imaging order sent to Radiology.');
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
