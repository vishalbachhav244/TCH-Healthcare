import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { Api, errorMessage } from '../core/api';
import { facilityQuery } from '../core/query';
import { SessionStore } from '../core/session';
import { Rupees, StatusTone } from '../design-system/format';
import {
  parseRupees,
  refundOutcomes,
  type CollectionSummary,
  type RefundOutcome,
  type RefundReviewRow,
} from '../domain/finance';
import { dayInIndia } from '../domain/operations';

type Editor =
  | { kind: 'close'; day: string; summary: CollectionSummary }
  | { kind: 'review'; review: RefundReviewRow };

@Component({
  imports: [DatePipe, NgIcon, ReactiveFormsModule, Rupees, StatusTone],
  templateUrl: './finance.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Finance {
  private readonly api = inject(Api);
  protected readonly store = inject(SessionStore);
  private readonly forms = inject(NonNullableFormBuilder);
  protected readonly today = dayInIndia();
  protected readonly day = signal(this.today);
  protected readonly view = signal<'collections' | 'reviews'>('collections');
  protected readonly reload = signal(0);
  protected readonly notice = signal('');
  protected readonly failure = signal('');
  protected readonly busy = signal(false);
  protected readonly editor = signal<Editor | undefined>(undefined);
  protected readonly counted = this.forms.control('');
  protected readonly decision = this.forms.control<RefundOutcome | ''>('');
  protected readonly outcomes = refundOutcomes;
  protected readonly query = signal('');
  protected readonly status = signal('');
  protected readonly limit = signal(12);
  private readonly params = computed(() => ({
    token: this.store.session()?.token ?? '',
    facility: this.store.facility()?.id ?? '',
    day: this.day(),
    reload: this.reload(),
  }));
  protected readonly data = facilityQuery(this.params, ({ token, facility, day }) =>
    this.api.finance(token, facility, day),
  );
  protected readonly reviews = computed(() => {
    const data = this.data();
    if (data.state !== 'ready') return [];
    const q = this.query().trim().toLowerCase();
    return data.data.reviews.filter(
      (row) =>
        (!this.status() || (this.status() === 'pending' ? !row.decision : !!row.decision)) &&
        (!q ||
          [row.patient, row.reference, row.medication].some((value) =>
            value.toLowerCase().includes(q),
          )),
    );
  });

  protected open(dialog: HTMLDialogElement, editor: Editor) {
    this.failure.set('');
    this.counted.reset();
    this.decision.reset();
    this.editor.set(editor);
    dialog.showModal();
  }

  protected async save(dialog: HTMLDialogElement) {
    const editor = this.editor();
    if (!editor || this.busy()) return;
    const { token, facility } = this.params();
    this.failure.set('');
    const amount = parseRupees(this.counted.value);
    const outcome = this.decision.value;
    if (editor.kind === 'close' ? amount === undefined : !outcome) {
      this.failure.set(
        editor.kind === 'close'
          ? 'Enter the counted amount in rupees and paise.'
          : 'Choose a review decision.',
      );
      return;
    }
    this.busy.set(true);
    this.notice.set('');
    try {
      if (editor.kind === 'close' && amount !== undefined) {
        await this.api.closeCollections(token, facility, editor.day, amount);
        this.notice.set('Collections reconciled and closed.');
      } else if (editor.kind === 'review' && outcome) {
        await this.api.decideRefund(token, facility, editor.review.id, outcome);
        this.notice.set(
          outcome === 'Record local refund'
            ? 'Local refund recorded.'
            : 'Review closed without refund.',
        );
      }
      dialog.close();
    } catch (error) {
      this.failure.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
