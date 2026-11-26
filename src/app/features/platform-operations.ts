import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { Api, errorMessage } from '../core/api';
import { facilityQuery } from '../core/query';
import { SessionStore } from '../core/session';
import {
  incidentPriorities,
  incidentServices,
  type PlatformIncident,
} from '../domain/platform-operations';

@Component({
  imports: [DatePipe, NgIcon, ReactiveFormsModule],
  templateUrl: './platform-operations.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformOperations {
  private readonly api = inject(Api);
  private readonly store = inject(SessionStore);
  protected readonly services = incidentServices;
  protected readonly priorities = incidentPriorities;
  protected readonly reload = signal(0);
  protected readonly showResolved = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly draft = inject(NonNullableFormBuilder).group({
    title: ['', [Validators.required, Validators.minLength(4), Validators.maxLength(100)]],
    service: ['Workspace access', Validators.required],
    priority: ['Normal', Validators.required],
  });
  private readonly scope = computed(() => ({
    token: this.store.session()?.token ?? '',
    facility: 'platform',
    reload: this.reload(),
  }));
  protected readonly data = facilityQuery(
    this.scope,
    ({ token }) => this.api.platformOperations(token),
    () => true,
  );
  protected readonly openCount = computed(() => {
    const response = this.data();
    return response.state === 'ready'
      ? response.data.incidents.filter((item) => item.status !== 'Resolved').length
      : 0;
  });
  protected readonly incidents = computed(() => {
    const response = this.data();
    return response.state === 'ready'
      ? response.data.incidents.filter((item) => this.showResolved() || item.status !== 'Resolved')
      : [];
  });

  protected eventText(type: string) {
    return type.replace(/([a-z])([A-Z])/g, '$1 $2');
  }

  protected open(dialog: HTMLDialogElement) {
    this.draft.reset();
    this.error.set('');
    dialog.showModal();
  }

  protected async create(dialog: HTMLDialogElement) {
    if (this.draft.invalid) return;
    if (await this.save(this.draft.getRawValue(), 'POST', 'Incident opened.')) dialog.close();
  }

  protected advance(incident: PlatformIncident) {
    return this.save(
      { id: incident.id, version: String(incident.version) },
      'PATCH',
      incident.status === 'Open' ? 'Investigation started.' : 'Incident resolved.',
    );
  }

  private async save(body: Record<string, string>, method: 'POST' | 'PATCH', notice: string) {
    if (this.busy()) return false;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await this.api.execute('platform-operations/incidents', this.scope().token, '', body, method);
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
