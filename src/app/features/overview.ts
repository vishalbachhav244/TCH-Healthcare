import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { Api, errorMessage } from '../core/api';
import { downloadCsv } from '../core/download';
import { SessionStore } from '../core/session';
import { facilityQuery } from '../core/query';
import { Rupees, StatusTone } from '../design-system/format';
import { Trend } from '../design-system/trend';
import { dayInIndia, type Alert, type DashboardData } from '../domain/operations';

@Component({
  imports: [DatePipe, DecimalPipe, NgIcon, RouterLink, Rupees, StatusTone, Trend],
  templateUrl: './overview.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Overview {
  protected readonly store = inject(SessionStore);
  private readonly api = inject(Api);
  protected readonly day = signal(dayInIndia());
  protected readonly range = signal(7);
  protected readonly reload = signal(0);
  protected readonly feedback = signal('');
  protected readonly busy = signal('');
  protected readonly selectedAlert = signal<Alert | undefined>(undefined);
  private readonly params = computed(() => ({
    token: this.store.session()?.token ?? '',
    facility: this.store.facility()?.id ?? '',
    day: this.day(),
    range: this.range(),
    reload: this.reload(),
  }));
  protected readonly result = facilityQuery(this.params, (params) =>
    this.api.overview(params.token, params.facility, params.day, params.range),
  );
  protected readonly newAlerts = computed(() => {
    const result = this.result();
    return result.state === 'ready'
      ? result.data.alerts.filter((alert) => !alert.acknowledged).length
      : 0;
  });

  protected percentage(n: number, total: number) {
    return total ? Math.round((n / total) * 100) : 0;
  }

  protected difference(value: number, prior: number) {
    return prior ? Math.round(((value - prior) / prior) * 100) : null;
  }

  protected async acknowledge() {
    const alert = this.selectedAlert();
    const user = this.store.session();
    const facility = this.store.facility();
    if (!user || !facility || !alert || this.busy()) return;
    this.busy.set(alert.id);
    this.feedback.set('');
    try {
      await this.api.execute('alerts/acknowledge', user.token, facility.id, { alertId: alert.id });
      this.selectedAlert.set(undefined);
      this.feedback.set('Alert acknowledged.');
    } catch (error) {
      this.feedback.set(errorMessage(error));
    } finally {
      this.busy.set('');
    }
  }

  protected exportSummary(data: DashboardData) {
    const content = [
      'Date,Scheduled,Walk-ins',
      ...data.days.map((item) => `${item.day},${item.scheduled},${item.walkIn}`),
    ].join('\r\n');
    downloadCsv('truecare-patient-flow-' + this.day() + '.csv', content);
  }
}
