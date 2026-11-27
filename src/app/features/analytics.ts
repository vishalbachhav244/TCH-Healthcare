import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { Api } from '../core/api';
import { downloadCsv } from '../core/download';
import { facilityQuery } from '../core/query';
import { SessionStore } from '../core/session';
import { Rupees } from '../design-system/format';
import { Trend } from '../design-system/trend';
import {
  analyticsWindows,
  type AnalyticsReport,
  type AnalyticsWindow,
} from '../domain/intelligence';
import { dayInIndia } from '../domain/operations';

@Component({
  imports: [DatePipe, DecimalPipe, NgIcon, Rupees, Trend],
  templateUrl: './analytics.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Analytics {
  private readonly api = inject(Api);
  protected readonly store = inject(SessionStore);
  protected readonly today = dayInIndia();
  protected readonly end = signal(this.today);
  protected readonly range = signal<AnalyticsWindow>(7);
  protected readonly windows = analyticsWindows;
  protected readonly reload = signal(0);
  protected readonly view = signal<'daily' | 'specialties'>('daily');
  private readonly scope = computed(() => ({
    token: this.store.session()?.token ?? '',
    facility: this.store.facility()?.id ?? '',
    end: this.end(),
    range: this.range(),
    reload: this.reload(),
  }));
  protected readonly data = facilityQuery(this.scope, ({ token, facility, end, range }) =>
    this.api.analytics(token, facility, end, range),
  );
  protected readonly totals = computed(() => {
    const data = this.data();
    const days = data.state === 'ready' ? data.data.days : [];
    return days.reduce(
      (totals, row) => ({
        appointments: totals.appointments + row.scheduled + row.walkIn,
        completed: totals.completed + row.completed,
        cancelled: totals.cancelled + row.cancelled,
        waitSamples: totals.waitSamples + row.waitSamples,
        waitMilliseconds: totals.waitMilliseconds + row.waitMilliseconds,
        netMinor: totals.netMinor + row.netMinor,
        postingCount: totals.postingCount + row.postingCount,
      }),
      {
        appointments: 0,
        completed: 0,
        cancelled: 0,
        waitSamples: 0,
        waitMilliseconds: 0,
        netMinor: 0,
        postingCount: 0,
      },
    );
  });
  protected readonly hasActivity = computed(
    () => this.totals().appointments + this.totals().cancelled + this.totals().postingCount > 0,
  );
  protected readonly specialties = computed(() => {
    const data = this.data();
    return data.state === 'ready'
      ? data.data.specialties.filter((row) => row.scheduled + row.walkIn > 0)
      : [];
  });

  protected setRange(value: string) {
    const range = analyticsWindows.find((item) => String(item) === value);
    if (range !== undefined) this.range.set(range);
  }

  protected wait(item: { waitSamples: number; waitMilliseconds: number }) {
    return item.waitSamples ? item.waitMilliseconds / (item.waitSamples * 60_000) : null;
  }

  protected exportReport(report: AnalyticsReport) {
    const csv = [
      'Date,Scheduled,Walk-ins,Completed,Cancelled,Wait samples,Mean wait minutes,Net collections (INR)',
      ...report.days.map((row) =>
        [
          row.day,
          row.scheduled,
          row.walkIn,
          row.completed,
          row.cancelled,
          row.waitSamples,
          this.wait(row)?.toFixed(1) ?? '',
          (row.netMinor / 100).toFixed(2),
        ].join(','),
      ),
    ].join('\r\n');
    downloadCsv('truecare-analytics-' + this.scope().facility + '-' + this.end() + '.csv', csv);
  }
}
