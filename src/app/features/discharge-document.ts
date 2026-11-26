import { formatDate } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { DischargeDocument as ReleasedSummary } from '../domain/discharge';

@Component({
  selector: 'tc-discharge-document',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="document-identity">
      <strong>{{ document().patientName }}</strong>
      <p>{{ document().patientId }} · {{ document().facilityName }}</p>
    </div>
    <dl class="document-facts">
      @for (fact of facts(); track fact.label) {
        <div>
          <dt>{{ fact.label }}</dt>
          <dd>{{ fact.value }}</dd>
        </div>
      }
    </dl>
    <button class="button secondary" type="button" (click)="download()">Download summary</button>
  `,
})
export class DischargeDocument {
  readonly document = input.required<ReleasedSummary>();
  protected readonly facts = computed(() => {
    const summary = this.document();
    const time = (value: number) => formatDate(value, 'd MMM y, HH:mm', 'en-US', '+0530') + ' IST';
    return [
      { label: 'Admitted', value: time(summary.admittedAt) },
      { label: 'Discharged', value: time(summary.releasedAt) },
      { label: 'Final placement', value: summary.ward + ' · Bed ' + summary.bed },
      { label: 'Destination', value: summary.destination },
      { label: 'Stay summary', value: summary.course },
      { label: 'Follow-up handoff', value: summary.followUp },
      { label: 'Signed by', value: summary.signedBy + ' · ' + time(summary.signedAt) },
    ];
  });

  protected download() {
    const summary = this.document();
    const lines = [
      'TrueCare discharge summary',
      'Synthetic demo record',
      '',
      summary.patientName + ' · ' + summary.patientId,
      summary.facilityName,
      '',
      ...this.facts().map(({ label, value }) => label + ': ' + value),
    ];
    const url = URL.createObjectURL(
      new Blob([lines.join('\r\n')], { type: 'text/plain;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'truecare-discharge-summary.txt';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
