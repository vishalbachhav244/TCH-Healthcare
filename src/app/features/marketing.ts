import { DatePipe, PercentPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { Api, errorMessage } from '../core/api';
import { facilityQuery } from '../core/query';
import { SessionStore } from '../core/session';
import { StatusTone } from '../design-system/format';
import {
  campaignStatuses,
  campaignTemplates,
  engagementChannels,
  type Campaign,
  type CampaignAction,
  type CampaignTemplate,
  type EngagementChannel,
} from '../domain/engagement';

type Editor = { kind: 'draft' } | { kind: CampaignAction; row: Campaign };
const labels = {
  draft: { title: 'Create campaign', save: 'Save draft', notice: 'Campaign draft saved.' },
  simulate: {
    title: 'Simulate campaign',
    save: 'Run simulation',
    notice: 'Campaign simulation recorded.',
  },
  cancel: {
    title: 'Cancel draft',
    save: 'Confirm cancellation',
    notice: 'Campaign draft cancelled.',
  },
};

@Component({
  imports: [DatePipe, PercentPipe, ReactiveFormsModule, NgIcon, StatusTone],
  templateUrl: './marketing.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Marketing {
  private readonly api = inject(Api);
  private readonly forms = inject(NonNullableFormBuilder);
  private editorFacility = '';
  protected readonly store = inject(SessionStore);
  protected readonly view = signal<'conversions' | 'campaigns'>('conversions');
  protected readonly status = signal('');
  protected readonly channel = signal('');
  protected readonly limit = signal(12);
  protected readonly reload = signal(0);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly busy = signal(false);
  protected readonly editor = signal<Editor | undefined>(undefined);
  protected readonly labels = labels;
  protected readonly channels = engagementChannels;
  protected readonly templates = campaignTemplates;
  protected readonly statuses = campaignStatuses;
  protected readonly form = this.forms.group({
    channel: this.forms.control<EngagementChannel | ''>(''),
    template: this.forms.control<CampaignTemplate | ''>(''),
  });
  private readonly scope = computed(() => ({
    token: this.store.session()?.token ?? '',
    facility: this.store.facility()?.id ?? '',
    reload: this.reload(),
  }));
  protected readonly data = facilityQuery(this.scope, ({ token, facility }) =>
    this.api.marketing(token, facility),
  );
  protected readonly value = computed(() => {
    const result = this.data();
    return result.state === 'ready' ? result.data : undefined;
  });
  protected readonly totals = computed(() =>
    (this.value()?.conversions ?? []).reduce(
      (total, current) => ({
        enquiries: total.enquiries + current.enquiries,
        bookings: total.bookings + current.bookings,
      }),
      { enquiries: 0, bookings: 0 },
    ),
  );
  protected readonly rows = computed(
    () =>
      this.value()?.campaigns.filter(
        (row) =>
          (!this.status() || this.status() === row.status) &&
          (!this.channel() || this.channel() === row.channel),
      ) ?? [],
  );

  protected open(dialog: HTMLDialogElement, edit: Editor) {
    this.editorFacility = this.scope().facility;
    this.error.set('');
    this.form.reset();
    this.editor.set(edit);
    dialog.showModal();
  }

  protected async save(dialog: HTMLDialogElement) {
    const edit = this.editor();
    if (!edit || this.busy()) return;
    const { token, facility } = this.scope();
    if (facility !== this.editorFacility) {
      this.error.set('The active facility changed. Open this form again.');
      return;
    }
    this.error.set('');
    this.notice.set('');
    this.busy.set(true);
    try {
      if (edit.kind === 'draft') {
        const { channel, template } = this.form.getRawValue();
        if (!channel || !template) {
          this.error.set('Choose a template and channel.');
          return;
        }
        await this.api.draftCampaign(token, facility, channel, template);
        this.view.set('campaigns');
        this.channel.set('');
      } else {
        await this.api.updateCampaign(token, facility, edit.row, edit.kind);
      }
      this.status.set('');
      this.notice.set(labels[edit.kind].notice);
      dialog.close();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
