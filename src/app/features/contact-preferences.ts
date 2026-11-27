import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Api, errorMessage } from '../core/api';
import { facilityQuery } from '../core/query';
import { SessionStore } from '../core/session';
import type { ContactPreferences as Preferences } from '../domain/engagement';

@Component({
  selector: 'tc-contact-preferences',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel portal-list" aria-labelledby="contact-heading">
      <h2 id="contact-heading">Contact preferences</h2>
      <p>Choose whether this facility can include you in optional news and education campaigns.</p>
      @if (notice()) {
        <p class="inline-notice success" role="status">{{ notice() }}</p>
      }
      @if (error()) {
        <p class="field-error" role="alert">{{ error() }}</p>
      }
      @let state = data();
      @if (state.state === 'loading') {
        <p role="status">Loading contact preferences…</p>
      } @else if (state.state === 'error') {
        <p role="alert">{{ state.message }}</p>
        <button class="button secondary" type="button" (click)="reload.set(reload() + 1)">
          Retry
        </button>
      } @else {
        @for (channel of channels; track channel.key) {
          @let enabled = state.data[channel.key];
          <article>
            <div>
              <strong>{{ channel.label }}</strong>
              <p>{{ enabled ? 'Allowed' : 'Off' }}</p>
            </div>
            <button
              class="button secondary"
              type="button"
              [disabled]="busy()"
              (click)="toggle(state.data, channel.key)"
            >
              {{ enabled ? 'Turn off ' + channel.label : 'Allow ' + channel.label }}
            </button>
          </article>
        }
      }
    </section>
  `,
})
export class ContactPreferences {
  private readonly api = inject(Api);
  private readonly store = inject(SessionStore);
  protected readonly reload = signal(0);
  protected readonly notice = signal('');
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly channels = [
    { key: 'email', label: 'Email' },
    { key: 'sms', label: 'SMS' },
  ] as const;
  private readonly scope = computed(() => ({
    token: this.store.session()?.token ?? '',
    facility: this.store.facility()?.id ?? '',
    reload: this.reload(),
  }));
  protected readonly data = facilityQuery(this.scope, ({ token, facility }) =>
    this.api.contactPreferences(token, facility),
  );

  protected async toggle(current: Preferences, channel: 'email' | 'sms') {
    if (this.busy()) return;
    const { token, facility } = this.scope();
    this.notice.set('');
    this.error.set('');
    this.busy.set(true);
    try {
      await this.api.saveContactPreferences(token, facility, {
        ...current,
        [channel]: !current[channel],
      });
      this.notice.set('Contact preferences saved.');
    } catch (error) {
      this.error.set(errorMessage(error));
      this.reload.set(this.reload() + 1);
    } finally {
      this.busy.set(false);
    }
  }
}
