import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  input,
  viewChild,
} from '@angular/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { init, use } from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';
import type { DashboardData } from '../domain/operations';

use([LineChart, GridComponent, TooltipComponent, SVGRenderer]);

const dateLabel = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

@Component({
  selector: 'tc-trend',
  template: '<div #plot class="trend-plot" aria-hidden="true"></div>',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Trend {
  readonly days = input.required<DashboardData['days']>();
  private readonly element = viewChild<ElementRef<HTMLDivElement>>('plot');

  constructor() {
    effect((cleanup) => {
      const node = this.element()?.nativeElement;
      const days = this.days();
      if (!node) return;
      const chart = init(node, undefined, { renderer: 'svg' });
      const observer = new ResizeObserver(() => chart.resize());
      observer.observe(node);
      chart.setOption({
        animation: !matchMedia('(prefers-reduced-motion: reduce)').matches,
        animationDuration: 320,
        textStyle: { fontFamily: 'Inter Variable, sans-serif', color: '#586660' },
        grid: { top: 16, right: 16, bottom: 25, left: 37 },
        xAxis: {
          type: 'category',
          boundaryGap: false,
          data: days.map((item) => dateLabel.format(new Date(item.day))),
          axisTick: { show: false },
          axisLine: { show: false },
          axisLabel: { color: '#59665f', margin: 14, fontSize: 11, hideOverlap: true },
        },
        yAxis: {
          type: 'value',
          min: 0,
          minInterval: 1,
          splitNumber: 4,
          axisLabel: { color: '#59665f', fontSize: 11 },
          splitLine: { lineStyle: { color: '#e5ece8', type: 'dashed' } },
        },
        tooltip: { trigger: 'axis', confine: true },
        series: [
          {
            name: 'Scheduled',
            type: 'line',
            smooth: 0.29,
            data: days.map((item) => item.scheduled),
            symbol: 'circle',
            showSymbol: false,
            lineStyle: { width: 3, color: '#176b65' },
            itemStyle: { color: '#176b65' },
            areaStyle: {
              opacity: 1,
              color: {
                type: 'linear',
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: '#cce8e1' },
                  { offset: 1, color: '#f4faf8' },
                ],
              },
            },
          },
          {
            name: 'Walk-ins',
            type: 'line',
            smooth: 0.28,
            data: days.map((item) => item.walkIn),
            symbol: 'circle',
            showSymbol: false,
            lineStyle: { width: 2, color: '#9572bc', type: 'dashed' },
            itemStyle: { color: '#9572bc' },
          },
        ],
      });
      cleanup(() => {
        observer.disconnect();
        chart.dispose();
      });
    });
  }
}
