import { DatePipe, SlicePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { Api, errorMessage } from '../core/api';
import { facilityQuery } from '../core/query';
import { SessionStore } from '../core/session';
import {
  dispositions,
  qualityCategories,
  qualityPriorities,
  type Disposition,
  type QualityView,
} from '../domain/governance';

@Component({
  imports: [DatePipe, SlicePipe, NgIcon, ReactiveFormsModule],
  templateUrl: './quality-register.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QualityRegister {
  private readonly api = inject(Api);
  private readonly store = inject(SessionStore);
  private readonly forms = inject(NonNullableFormBuilder);
  protected readonly form = this.forms.group({
    title: ['', [Validators.required, Validators.minLength(4), Validators.maxLength(100)]],
    category: this.forms.control<(typeof qualityCategories)[number] | ''>('', Validators.required),
    priority: this.forms.control<(typeof qualityPriorities)[number]>(
      'Routine',
      Validators.required,
    ),
  });
  protected readonly resolution = this.forms.control<Disposition | ''>('', Validators.required);
  protected readonly categories = qualityCategories;
  protected readonly priorities = qualityPriorities;
  protected readonly dispositions = dispositions;
  protected readonly statuses = ['Open', 'Investigating', 'Resolved'] as const;
  protected readonly status = signal('');
  protected readonly offset = signal(0);
  protected readonly reload = signal(0);
  protected readonly notice = signal('');
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly selected = signal<QualityView | undefined>(undefined);
  private readonly scope = computed(() => ({
    facility: this.store.facility()?.id ?? '',
    token: this.store.session()?.token ?? '',
    reload: this.reload(),
  }));
  protected readonly response = facilityQuery(this.scope, ({ token, facility }) =>
    this.api.qualityRegister(token, facility),
  );
  protected readonly rows = computed(() => {
    const state = this.response();
    return state.state === 'ready' ? state.data : [];
  });
  protected readonly totals = computed(() =>
    this.statuses.map((status) => ({
      status,
      count: this.rows().filter((row) => row.status === status).length,
    })),
  );
  protected readonly filtered = computed(() =>
    this.rows().filter((row) => !this.status() || row.status === this.status()),
  );

  protected setStatus(value: string) {
    this.status.set(value);
    this.offset.set(0);
  }

  protected showEditor(dialog: HTMLDialogElement) {
    this.form.reset();
    this.error.set('');
    dialog.showModal();
  }

  protected showCase(dialog: HTMLDialogElement, row: QualityView) {
    this.selected.set(row);
    this.resolution.reset();
    this.error.set('');
    dialog.showModal();
  }

  protected async create(dialog: HTMLDialogElement) {
    const { title, category, priority } = this.form.getRawValue();
    if (this.form.invalid || !category) return;
    if (
      await this.save(
        (token, facility) =>
          this.api.openQualityCase(token, facility, { title, category, priority }),
        'Quality case opened.',
      )
    ) {
      this.setStatus('');
      dialog.close();
    }
  }

  protected async update(dialog: HTMLDialogElement, action: 'claim' | 'resolve') {
    const row = this.selected();
    const disposition = this.resolution.value || undefined;
    if (!row || (action === 'resolve' && !disposition)) return;
    const notice = action === 'claim' ? 'Quality case assigned to you.' : 'Quality case resolved.';
    if (
      await this.save(
        (token, facility) => this.api.updateQualityCase(token, facility, row, action, disposition),
        notice,
      )
    ) {
      this.offset.set(0);
      dialog.close();
    }
  }

  private async save(
    command: (token: string, facility: string) => Promise<unknown>,
    notice: string,
  ) {
    if (this.busy()) return false;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    const { token, facility } = this.scope();
    try {
      await command(token, facility);
      this.notice.set(notice);
      return true;
    } catch (error) {
      this.error.set(errorMessage(error));
      return false;
    } finally {
      this.busy.set(false);
    }
  }
}
