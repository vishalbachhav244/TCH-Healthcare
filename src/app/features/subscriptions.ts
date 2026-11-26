import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { Api, errorMessage } from '../core/api';
import { facilityQuery } from '../core/query';
import { SessionStore } from '../core/session';
import { dayInIndia } from '../domain/operations';
import { plans, type SubscriptionRow } from '../domain/platform';

@Component({
  imports: [DatePipe, NgIcon, ReactiveFormsModule],
  templateUrl: './subscriptions.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Subscriptions {
  private readonly api = inject(Api);
  private readonly store = inject(SessionStore);
  protected readonly today = dayInIndia();
  protected readonly plans = plans;
  protected readonly query = signal('');
  protected readonly dueOnly = signal(false);
  protected readonly selectedPlan = signal('');
  protected readonly reload = signal(0);
  protected readonly notice = signal('');
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly selected = signal<SubscriptionRow | undefined>(undefined);
  protected readonly plan = new FormControl('', { nonNullable: true });
  private readonly scope = computed(() => ({
    token: this.store.session()?.token ?? '',
    facility: 'platform',
    reload: this.reload(),
  }));
  protected readonly response = facilityQuery(this.scope, ({ token }) =>
    this.api.subscriptions(token),
  );
  protected readonly rows = computed(() => {
    const response = this.response();
    return response.state === 'ready' ? response.data : [];
  });
  protected readonly due = computed(
    () => this.rows().filter((row) => row.nextReview <= this.today).length,
  );
  protected readonly activeFacilities = computed(() =>
    this.rows().reduce((sum, row) => sum + row.activeFacilities, 0),
  );
  protected readonly visible = computed(() => {
    const query = this.query().trim().toLowerCase();
    return this.rows().filter(
      (row) =>
        (!this.dueOnly() || row.nextReview <= this.today) &&
        (!this.selectedPlan() || row.organisation.plan === this.selectedPlan()) &&
        row.organisation.name.toLowerCase().includes(query),
    );
  });

  protected manage(row: SubscriptionRow, dialog: HTMLDialogElement) {
    this.selected.set(row);
    this.plan.setValue(row.organisation.plan);
    this.error.set('');
    dialog.showModal();
  }

  protected async save(action: 'plan' | 'review', dialog: HTMLDialogElement) {
    const row = this.selected();
    if (!row || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await this.api.execute(
        'subscriptions',
        this.scope().token,
        '',
        {
          organisationId: row.organisation.id,
          version: String(row.organisation.subscriptionVersion ?? 0),
          action,
          plan: this.plan.value,
        },
        'PATCH',
      );
      this.notice.set(
        action === 'plan' ? 'Subscription plan updated.' : 'Account review recorded.',
      );
      dialog.close();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
