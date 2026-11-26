import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Api, errorMessage } from '../core/api';
import { facilityQuery } from '../core/query';
import { SessionStore } from '../core/session';
import type { Admission } from '../domain/operations';

@Component({
  selector: 'tc-ward-team-editor',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let state = response();
    @if (state.state === 'loading') {
      <p role="status">Loading available care team members…</p>
    } @else if (state.state === 'error') {
      <p role="alert" class="field-error">{{ state.message }}</p>
      <button type="button" class="button secondary" (click)="reload.set(reload() + 1)">
        Retry
      </button>
    } @else if (!state.data.physicians.length || !state.data.nurses.length) {
      <p>
        No complete care team is available at this facility. An active inpatient physician and ward
        nurse are required.
      </p>
    } @else {
      <form class="fields" [formGroup]="form" (ngSubmit)="save()">
        <label for="care-team-physician">Inpatient physician</label>
        <select id="care-team-physician" formControlName="physician" required>
          <option value="">Select a physician</option>
          @for (item of state.data.physicians; track item.account) {
            <option [value]="item.account">{{ item.name }}</option>
          }
        </select>
        <label for="care-team-nurse">Ward nurse</label>
        <select id="care-team-nurse" formControlName="nurse" required>
          <option value="">Select a nurse</option>
          @for (item of state.data.nurses; track item.account) {
            <option [value]="item.account">{{ item.name }}</option>
          }
        </select>
        @if (error()) {
          <p role="alert" class="field-error">{{ error() }}</p>
        }
        <button type="submit" class="button primary" [disabled]="busy() || form.invalid">
          Save care team
        </button>
      </form>
    }
  `,
})
export class WardTeamEditor {
  readonly admission = input.required<Admission>();
  readonly saved = output<void>();
  private readonly api = inject(Api);
  private readonly store = inject(SessionStore);
  protected readonly reload = signal(0);
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  private readonly version = signal<number | undefined>(undefined);
  protected readonly form = inject(NonNullableFormBuilder).group({
    physician: ['', Validators.required],
    nurse: ['', Validators.required],
  });
  private readonly scope = computed(() => ({
    facility: this.store.facility()?.id ?? '',
    token: this.store.session()?.token ?? '',
    admissionId: this.admission().id,
    reload: this.reload(),
  }));
  protected readonly response = facilityQuery(this.scope, ({ token, facility, admissionId }) =>
    this.api.wardAssignment(token, facility, admissionId),
  );

  constructor() {
    effect(() => {
      const state = this.response();
      if (this.version() !== undefined || state.state !== 'ready') return;
      const assignment = state.data.assignment;
      this.version.set(assignment?.version ?? 0);
      if (assignment)
        this.form.patchValue({
          physician: state.data.physicians.some((item) => item.account === assignment.physician)
            ? assignment.physician
            : '',
          nurse: state.data.nurses.some((item) => item.account === assignment.nurse)
            ? assignment.nurse
            : '',
        });
    });
  }

  protected async save() {
    const assignmentVersion = this.version();
    if (this.form.invalid || this.busy() || assignmentVersion === undefined) return;
    const { token, facility, admissionId } = this.scope();
    this.busy.set(true);
    this.error.set('');
    try {
      await this.api.assignWardTeam(
        token,
        facility,
        { admissionId, admissionVersion: this.admission().version, assignmentVersion },
        this.form.getRawValue(),
      );
      this.saved.emit();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
