import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { Api, errorMessage } from '../core/api';
import { facilityQuery } from '../core/query';
import { SessionStore } from '../core/session';
import {
  connectorStandards,
  type Connector,
  type ConnectorAction,
} from '../domain/interoperability';

@Component({
  imports: [DatePipe, NgIcon, ReactiveFormsModule],
  templateUrl: './integrations.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Integrations {
  private readonly api = inject(Api);
  private readonly store = inject(SessionStore);
  protected readonly reload = signal(0);
  protected readonly notice = signal('');
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly standards = connectorStandards;
  private readonly forms = inject(NonNullableFormBuilder);
  protected readonly form = this.forms.group({
    name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(70)]],
    facilityId: ['', Validators.required],
    recipientAccount: ['', Validators.required],
    standard: this.forms.control<Connector['standard']>('Document exchange', Validators.required),
  });
  private readonly scope = computed(() => ({
    facility: 'integrations',
    token: this.store.session()?.token ?? '',
    reload: this.reload(),
  }));
  protected readonly response = facilityQuery(this.scope, ({ token }) =>
    this.api.integrations(token),
  );
  protected readonly enabled = computed(() => {
    const result = this.response();
    return result.state === 'ready'
      ? result.data.connectors.filter((row) => row.status === 'Enabled').length
      : 0;
  });

  protected open(dialog: HTMLDialogElement) {
    this.form.reset();
    this.error.set('');
    dialog.showModal();
  }

  protected async create(dialog: HTMLDialogElement) {
    if (
      !this.form.invalid &&
      (await this.save(
        (token) => this.api.registerConnector(token, this.form.getRawValue()),
        'Connector registered.',
      ))
    )
      dialog.close();
  }

  protected change(connector: Connector, action: ConnectorAction) {
    const message =
      action === 'validate'
        ? 'Connector configuration validated.'
        : action === 'enable'
          ? 'Connector enabled.'
          : 'Connector paused.';
    return this.save((token) => this.api.updateConnector(token, connector, action), message);
  }

  private async save(command: (token: string) => Promise<unknown>, notice: string) {
    if (this.busy()) return false;
    this.error.set('');
    this.notice.set('');
    this.busy.set(true);
    try {
      await command(this.scope().token);
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
