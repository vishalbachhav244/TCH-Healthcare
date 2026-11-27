import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { Api, errorMessage } from '../core/api';
import { facilityQuery } from '../core/query';
import { SessionStore } from '../core/session';
import { StatusTone } from '../design-system/format';
import {
  dailyDraftLimits,
  documentationFormats,
  draftStatuses,
  type DailyDraftLimit,
  type DocumentationFormat,
  type DocumentationPolicy,
  type DocumentationRow,
  type DraftAction,
} from '../domain/intelligence';

type Editor =
  | { kind: 'policy'; policy: DocumentationPolicy }
  | { kind: 'request' }
  | { kind: 'review'; draft: DocumentationRow };
const titles = {
  policy: 'Edit draft policy',
  request: 'Request synthetic draft',
  review: 'Review documentation draft',
};
const feedback = {
  edit: 'Draft edits saved.',
  approve: 'Draft approved in the simulation.',
  reject: 'Draft rejected.',
};

@Component({
  imports: [DatePipe, ReactiveFormsModule, NgIcon, StatusTone],
  templateUrl: './automation.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Automation {
  private readonly api = inject(Api);
  private readonly forms = inject(NonNullableFormBuilder);
  protected readonly store = inject(SessionStore);
  private editorFacility = '';
  protected readonly titles = titles;
  protected readonly formats = documentationFormats;
  protected readonly limits = dailyDraftLimits;
  protected readonly statuses = draftStatuses;
  protected readonly status = signal('');
  protected readonly limit = signal(12);
  protected readonly editor = signal<Editor | undefined>(undefined);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly busy = signal(false);
  protected readonly reload = signal(0);
  protected readonly managesPolicy = computed(
    () => this.store.allowed('automation') && this.store.canPerform('automation/policy'),
  );
  protected readonly form = this.forms.group({
    encounterId: [''],
    enabled: [false],
    dailyLimit: this.forms.control<DailyDraftLimit>(5),
    format: this.forms.control<DocumentationFormat>(documentationFormats[0]),
  });
  private readonly scope = computed(() => ({
    token: this.store.session()?.token ?? '',
    facility: this.store.facility()?.id ?? '',
    reload: this.reload(),
  }));
  protected readonly data = facilityQuery(this.scope, ({ token, facility }) =>
    this.api.automation(token, facility),
  );
  protected readonly sourceData = computed(() => {
    const current = this.data();
    return current.state === 'ready' ? current.data : undefined;
  });
  protected readonly drafts = computed(
    () =>
      this.sourceData()?.drafts.filter((row) => !this.status() || row.status === this.status()) ??
      [],
  );
  protected readonly activity = computed(
    () =>
      this.sourceData()?.activity.filter((row) => !this.status() || row.status === this.status()) ??
      [],
  );

  protected open(dialog: HTMLDialogElement, editor: Editor) {
    this.editorFacility = this.scope().facility;
    this.editor.set(editor);
    this.error.set('');
    this.form.reset({
      format: editor.kind === 'review' ? editor.draft.format : documentationFormats[0],
      enabled: editor.kind === 'policy' && editor.policy.enabled,
      dailyLimit: editor.kind === 'policy' ? editor.policy.dailyLimit : 5,
    });
    dialog.showModal();
  }

  protected async save(dialog: HTMLDialogElement, decision?: DraftAction) {
    const editor = this.editor();
    if (!editor || this.busy()) return;
    const { token, facility } = this.scope();
    if (facility !== this.editorFacility) {
      this.error.set('The active facility changed. Open this form again.');
      return;
    }
    const fields = this.form.getRawValue();
    this.error.set('');
    this.notice.set('');
    this.busy.set(true);
    try {
      if (editor.kind === 'policy') {
        await this.api.configureAutomation(token, facility, {
          enabled: fields.enabled,
          dailyLimit: fields.dailyLimit,
          version: editor.policy.version,
        });
        this.notice.set('Draft policy updated.');
      } else if (editor.kind === 'request') {
        if (!fields.encounterId) {
          this.error.set('Choose a signed visit.');
          return;
        }
        await this.api.requestDocumentationDraft(token, facility, fields.encounterId);
        this.notice.set('Synthetic draft ready for review.');
      } else if (decision && editor.draft.status === 'Pending review') {
        await this.api.reviewDocumentationDraft(
          token,
          facility,
          editor.draft,
          decision,
          decision === 'edit' ? fields.format : undefined,
        );
        this.notice.set(feedback[decision]);
      } else {
        return;
      }
      this.status.set('');
      dialog.close();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
