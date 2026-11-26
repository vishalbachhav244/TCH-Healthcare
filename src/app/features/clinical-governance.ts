import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { Api, errorMessage } from '../core/api';
import { facilityQuery } from '../core/query';
import { SessionStore } from '../core/session';
import type { GovernanceItem } from '../domain/governance';
import { dayInIndia, shiftDay } from '../domain/operations';

@Component({
  imports: [DatePipe, NgIcon],
  templateUrl: './clinical-governance.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClinicalGovernance {
  private readonly api = inject(Api);
  private readonly store = inject(SessionStore);
  protected readonly today = dayInIndia();
  protected readonly day = signal(this.today);
  protected readonly from = computed(() => shiftDay(this.day(), -6));
  protected readonly status = signal('');
  protected readonly offset = signal(0);
  protected readonly reload = signal(0);
  protected readonly selected = signal<GovernanceItem | undefined>(undefined);
  protected readonly notice = signal('');
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  private readonly scope = computed(() => ({
    facility: this.store.facility()?.id ?? '',
    token: this.store.session()?.token ?? '',
    day: this.day(),
    status: this.status(),
    offset: this.offset(),
    reload: this.reload(),
  }));
  protected readonly response = facilityQuery(
    this.scope,
    ({ token, facility, day, status, offset }) =>
      this.api.clinicalGovernance(token, facility, { day, offset, ...(status ? { status } : {}) }),
  );

  protected setDay(value: string) {
    this.day.set(value || this.today);
    this.offset.set(0);
  }

  protected setStatus(value: string) {
    this.status.set(value);
    this.offset.set(0);
  }

  protected open(dialog: HTMLDialogElement, item: GovernanceItem) {
    this.selected.set(item);
    this.error.set('');
    dialog.showModal();
  }

  protected async review(dialog: HTMLDialogElement, action: 'acknowledge' | 'refer') {
    const item = this.selected();
    if (!item || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    const { token, facility } = this.scope();
    try {
      await this.api.recordClinicalReview(token, facility, item.id, item.version, action);
      this.notice.set(
        action === 'refer' ? 'Referred to Quality & Compliance.' : 'Review acknowledged.',
      );
      dialog.close();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
