import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Brand } from '../design-system/brand';
import { Api, errorMessage } from '../core/api';
import { configurationChanges } from '../core/events';
import { refreshingQuery } from '../core/query';
import { SessionStore } from '../core/session';
import { readPublicAppointment } from '../domain/public-care';
import { patientInvitationPattern, registrationAccountPattern } from '../domain/registration';

@Component({
  imports: [Brand, ReactiveFormsModule, RouterLink],
  templateUrl: './patient-registration.html',
  styleUrl: './patient-registration.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatientRegistrationPage {
  private readonly api = inject(Api);
  private readonly store = inject(SessionStore);
  private readonly router = inject(Router);
  protected readonly selectedVisit = readPublicAppointment(
    inject(ActivatedRoute).snapshot.queryParamMap,
  );
  protected readonly reload = signal(0);
  protected readonly state = refreshingQuery(
    this.reload,
    () => true,
    () => configurationChanges,
    () => this.api.careDirectory(),
  );
  protected readonly form = inject(NonNullableFormBuilder).group({
    facilityId: [this.selectedVisit?.facilityId ?? '', Validators.required],
    invitation: ['', [Validators.required, Validators.pattern(patientInvitationPattern)]],
    account: ['', [Validators.required, Validators.pattern(registrationAccountPattern)]],
    password: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(128)]],
    confirmation: ['', Validators.required],
  });
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected async create() {
    if (this.busy()) return;
    this.error.set('');
    const { confirmation, ...registration } = this.form.getRawValue();
    const state = this.state();
    this.form.controls.invitation.setValue(registration.invitation.trim());
    if (
      this.form.invalid ||
      state.state !== 'ready' ||
      !state.data.facilities.some((site) => site.id === registration.facilityId)
    ) {
      this.form.markAllAsTouched();
      this.error.set('Check the facility, invitation, account ID and password fields.');
      return;
    }
    if (confirmation !== registration.password) {
      this.error.set('The passwords do not match.');
      return;
    }
    this.busy.set(true);
    try {
      await this.store.registerPatient(registration);
      if (this.selectedVisit?.facilityId === registration.facilityId) {
        await this.router.navigate(['/find-care'], {
          queryParams: this.selectedVisit,
          replaceUrl: true,
        });
      } else {
        await this.router.navigateByUrl(this.store.home(), { replaceUrl: true });
      }
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
