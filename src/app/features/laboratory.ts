import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { debounceTime } from 'rxjs';
import { NgIcon } from '@ng-icons/core';
import { Api, errorMessage } from '../core/api';
import { facilityQuery } from '../core/query';
import { SessionStore } from '../core/session';
import { StatusTone } from '../design-system/format';
import { labFindings, type LabRow, type LabStage } from '../domain/diagnostics';

const actions: Partial<Record<LabStage, string>> = {
  Ordered: 'Collect specimen',
  Collected: 'Start processing',
  Processing: 'Enter result',
  Entered: 'Authorise result',
  Authorised: 'Publish report',
};

@Component({
  imports: [DatePipe, NgIcon, ReactiveFormsModule, StatusTone],
  templateUrl: './laboratory.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Laboratory {
  private readonly api = inject(Api);
  protected readonly store = inject(SessionStore);
  protected readonly selected = signal<LabRow | undefined>(undefined);
  protected readonly state = signal('');
  protected readonly reload = signal(0);
  protected readonly offset = signal(0);
  protected readonly busy = signal(false);
  protected readonly feedback = signal('');
  protected readonly failure = signal('');
  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly finding = new FormControl('', { nonNullable: true });
  protected readonly findings = labFindings;
  private readonly searchValue = toSignal(this.search.valueChanges.pipe(debounceTime(220)), {
    initialValue: '',
  });
  private readonly params = computed(() => ({
    token: this.store.session()?.token ?? '',
    facility: this.store.facility()?.id ?? '',
    q: this.searchValue(),
    status: this.state(),
    offset: this.offset(),
    reload: this.reload(),
  }));
  protected readonly result = facilityQuery(this.params, ({ token, facility, q, status, offset }) =>
    this.api.laboratory(token, facility, { q, status, offset }),
  );

  protected action(status: LabStage) {
    const canReview = this.store.canPerform('laboratory/review');
    if (status === 'Entered' || status === 'Authorised')
      return canReview ? actions[status] : undefined;
    return this.store.writeAllowed('laboratory') ? actions[status] : undefined;
  }

  protected open(row: LabRow, dialog: HTMLDialogElement) {
    this.selected.set(row);
    this.failure.set('');
    this.finding.reset();
    dialog.showModal();
  }

  protected async advance(dialog: HTMLDialogElement) {
    const row = this.selected();
    if (!row || !this.action(row.order.status) || this.busy()) return;
    if (row.order.status === 'Processing' && !this.finding.value) {
      this.failure.set('Select a result before saving.');
      return;
    }
    const { token, facility } = this.params();
    this.failure.set('');
    this.feedback.set('');
    this.busy.set(true);
    try {
      await this.api.execute('laboratory/advance', token, facility, {
        orderId: row.order.id,
        version: String(row.order.version),
        finding: this.finding.value,
      });
      this.feedback.set('Laboratory worklist updated.');
      dialog.close();
    } catch (error) {
      this.failure.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
