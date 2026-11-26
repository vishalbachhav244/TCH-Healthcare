import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { debounceTime } from 'rxjs';
import { RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { Api, errorMessage } from '../core/api';
import { facilityQuery } from '../core/query';
import { SessionStore } from '../core/session';

@Component({
  imports: [NgIcon, ReactiveFormsModule, RouterLink],
  templateUrl: './patients.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Patients {
  private readonly api = inject(Api);
  protected readonly store = inject(SessionStore);
  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly code = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.pattern(/^REG-\d{4}$/i)],
  });
  protected readonly error = signal('');
  protected readonly registered = signal('');
  protected readonly busy = signal(false);
  protected readonly reload = signal(0);
  private readonly query = toSignal(this.search.valueChanges.pipe(debounceTime(220)), {
    initialValue: '',
  });
  private readonly params = computed(() => ({
    facility: this.store.facility()?.id ?? '',
    token: this.store.session()?.token ?? '',
    query: this.query(),
    reload: this.reload(),
  }));
  protected readonly data = facilityQuery(this.params, ({ facility, token, query }) =>
    this.api.patients('patients', token, facility, query),
  );

  protected open(dialog: HTMLDialogElement) {
    this.error.set('');
    this.code.reset();
    dialog.showModal();
  }

  protected async register(dialog: HTMLDialogElement) {
    if (this.busy()) return;
    if (this.code.invalid) {
      this.error.set('Enter a registration code in the form REG-1001.');
      return;
    }
    this.error.set('');
    this.registered.set('');
    this.busy.set(true);
    const { token, facility } = this.params();
    try {
      const result = await this.api.execute('patients', token, facility, {
        registrationCode: this.code.value,
      });
      this.search.setValue(result.id);
      this.registered.set('Patient registered. ' + result.id);
      dialog.close();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
