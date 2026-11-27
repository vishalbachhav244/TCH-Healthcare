import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { SessionStore } from '../core/session';
import { evaluationAvailable, hostedDemoPassword } from '../core/evaluation';
import { errorMessage } from '../core/api';
import { Brand } from '../design-system/brand';
import { readPublicAppointment } from '../domain/public-care';
import { accountPattern } from '../domain/registration';

@Component({
  imports: [Brand, NgIcon, ReactiveFormsModule, RouterLink],
  templateUrl: './sign-in.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignIn {
  private readonly router = inject(Router);
  private readonly session = inject(SessionStore);
  protected readonly hostedDemoPassword = hostedDemoPassword;
  protected readonly selectedVisit = readPublicAppointment(
    inject(ActivatedRoute).snapshot.queryParamMap,
  );
  protected readonly form = inject(NonNullableFormBuilder).group({
    account: ['', [Validators.required, Validators.pattern(accountPattern)]],
    password: ['', Validators.required],
  });
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly help = signal(false);
  protected readonly reveal = signal(false);

  constructor() {
    if (!evaluationAvailable) void this.router.navigateByUrl('/unavailable', { replaceUrl: true });
  }

  protected async submit() {
    if (this.form.invalid || this.busy()) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set('');
    const { account, password } = this.form.getRawValue();
    try {
      await this.session.signIn(account, password);
      if (this.selectedVisit) {
        await this.router.navigate(['/find-care'], {
          queryParams: this.selectedVisit,
          replaceUrl: true,
        });
      } else {
        await this.router.navigateByUrl(this.session.home(), { replaceUrl: true });
      }
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
