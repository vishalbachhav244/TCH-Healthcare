import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { Api } from '../core/api';
import { facilityQuery } from '../core/query';
import { SessionStore } from '../core/session';
import { Rupees } from '../design-system/format';
import { dayInIndia } from '../domain/operations';

@Component({
  imports: [NgIcon, RouterLink, Rupees],
  templateUrl: './network.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Network {
  private readonly api = inject(Api);
  protected readonly store = inject(SessionStore);
  protected readonly day = signal(dayInIndia());
  protected readonly reload = signal(0);
  protected readonly focused = signal('');
  private readonly scope = computed(() => ({
    token: this.store.session()?.token ?? '',
    facility: this.store.facility()?.id ?? '',
    day: this.day(),
    reload: this.reload(),
    branchIds: this.store
      .facilities()
      .filter((row) => row.tenantId === this.store.facility()?.tenantId)
      .map((row) => row.id),
  }));
  protected readonly response = facilityQuery(
    this.scope,
    ({ token, facility, day }) => this.api.network(token, facility, day),
    (id, params) => params.branchIds.includes(id),
  );
  protected readonly rows = computed(() => {
    const response = this.response();
    return response.state === 'ready' ? response.data : [];
  });
  protected readonly totals = computed(() =>
    this.rows().reduce(
      (totals, { metrics }) => ({
        appointments: totals.appointments + metrics.appointments,
        activeQueue: totals.activeQueue + metrics.activeQueue,
        collections: totals.collections + metrics.revenueMinor,
        beds: totals.beds + metrics.bedCapacity,
        occupied: totals.occupied + metrics.bedsOccupied,
      }),
      { appointments: 0, activeQueue: 0, collections: 0, beds: 0, occupied: 0 },
    ),
  );
  protected readonly branch = computed(
    () => this.rows().find((row) => row.facility.id === this.focused()) ?? this.rows().at(0),
  );
}
