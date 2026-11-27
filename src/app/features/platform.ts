import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { Api, errorMessage } from '../core/api';
import { facilityQuery } from '../core/query';
import { SessionStore } from '../core/session';
import { StatusTone } from '../design-system/format';
import type { DomainEvent, Facility } from '../domain/operations';
import { plans } from '../domain/platform';
import { staffRoles, type StaffMembership } from '../domain/access';

const actions = {
  organizations: 'Create organization',
  facilities: 'Add facility',
  entitlements: 'Edit inpatient entitlement',
  engagement: 'Edit engagement entitlement',
  activation: 'Edit facility status',
  membership: 'Manage staff access',
} as const;

const eventLabels: Partial<Record<DomainEvent['type'], string>> = {
  OrganisationCreated: 'Organization created',
  FacilityCreated: 'Facility added',
  ModuleConfigurationChanged: 'Inpatient entitlement updated',
  EngagementConfigurationChanged: 'Engagement entitlement updated',
  FacilityActivationChanged: 'Facility status updated',
  StaffAccessChanged: 'Staff access updated',
  SubscriptionReviewed: 'Subscription reviewed',
  SubscriptionPlanChanged: 'Subscription plan changed',
};

@Component({
  imports: [DatePipe, NgIcon, ReactiveFormsModule, StatusTone],
  templateUrl: './platform.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Platform {
  private readonly api = inject(Api);
  private readonly store = inject(SessionStore);
  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly plans = plans;
  protected readonly actions = actions;
  protected readonly reload = signal(0);
  protected readonly active = signal('');
  protected readonly activeFacility = signal<Facility | undefined>(undefined);
  protected readonly task = signal<keyof typeof actions>('organizations');
  protected readonly feedback = signal('');
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly organisationForm = this.fb.group({
    name: ['', Validators.required],
    plan: ['Clinic', Validators.required],
  });
  protected readonly facilityForm = this.fb.group({
    name: ['', Validators.required],
    city: ['', Validators.required],
  });
  protected readonly inpatient = this.fb.control('false');
  protected readonly engagement = this.fb.control('true');
  protected readonly facilityActive = this.fb.control('true');
  protected readonly staffRoleOptions = Object.entries(staffRoles);
  protected readonly staffForm = this.fb.group({
    account: ['', Validators.required],
    role: ['reception'],
    practitionerId: [''],
  });
  protected readonly currentMembership = signal<StaffMembership | undefined>(undefined);
  protected readonly selectedRole = signal('reception');
  protected readonly staffAccounts = computed(() => {
    const state = this.data();
    return state.state === 'ready' ? state.data.staff : [];
  });
  protected readonly availablePractitioners = computed(() => {
    const state = this.data();
    return state.state === 'ready'
      ? state.data.practitioners.filter((item) => item.facilityId === this.activeFacility()?.id)
      : [];
  });
  private readonly scope = computed(() => ({
    token: this.store.session()?.token ?? '',
    facility: 'platform',
    reload: this.reload(),
  }));
  protected readonly data = facilityQuery(this.scope, ({ token }) => this.api.platform(token));
  protected readonly current = computed(() => {
    const page = this.data();
    if (page.state !== 'ready') return undefined;
    return (
      page.data.organisations.find((item) => item.id === this.active()) ??
      page.data.organisations[0]
    );
  });
  protected readonly facilities = computed(() => {
    const page = this.data();
    const selected = this.current();
    return page.state === 'ready'
      ? page.data.facilities.filter((facility) => facility.tenantId === selected?.id)
      : [];
  });

  protected eventName(event: DomainEvent) {
    return eventLabels[event.type];
  }

  protected eventEntity(event: DomainEvent) {
    const page = this.data();
    if (page.state !== 'ready') return '';
    return (
      page.data.facilities.find((facility) => facility.id === event.entityId)?.name ??
      page.data.organisations.find((organisation) => organisation.id === event.entityId)?.name
    );
  }

  protected open(task: keyof typeof actions, dialog: HTMLDialogElement, facility?: Facility) {
    this.error.set('');
    this.task.set(task);
    this.organisationForm.reset({ plan: 'Clinic' });
    this.facilityForm.reset();
    this.activeFacility.set(facility);
    this.inpatient.setValue(String(!!facility?.inpatient));
    this.engagement.setValue(String(facility?.engagement !== false));
    this.facilityActive.setValue(String(facility?.active !== false));
    this.staffForm.reset({ role: 'reception' });
    this.selectedRole.set('reception');
    this.currentMembership.set(undefined);
    dialog.showModal();
  }

  protected chooseStaff(account: string) {
    const state = this.data();
    const grant =
      state.state === 'ready'
        ? state.data.memberships.find(
            (item) => item.account === account && item.facilityId === this.activeFacility()?.id,
          )
        : undefined;
    this.currentMembership.set(grant);
    this.staffForm.patchValue({
      role: grant?.role ?? 'reception',
      practitionerId: grant?.practitionerId ?? '',
    });
    this.selectedRole.set(this.staffForm.controls.role.value);
  }

  protected async save(dialog: HTMLDialogElement, revoke = false) {
    if (this.busy()) return;
    const task = this.task();
    const tenantId = this.current()?.id;
    const facility = this.activeFacility();
    let payload: Record<string, string>;
    if (task === 'organizations') {
      if (this.organisationForm.invalid) return;
      payload = this.organisationForm.getRawValue();
    } else if (task === 'facilities') {
      if (this.facilityForm.invalid || !tenantId) return;
      payload = { ...this.facilityForm.getRawValue(), tenantId };
    } else if (task === 'membership') {
      if (!facility || this.staffForm.invalid) return;
      payload = {
        ...this.staffForm.getRawValue(),
        facilityId: facility.id,
        version: String(this.currentMembership()?.version ?? 0),
        active: String(!revoke),
      };
    } else {
      if (!facility) return;
      payload = {
        facilityId: facility.id,
        version: String(facility.configurationVersion),
        ...(task === 'activation'
          ? { active: this.facilityActive.value }
          : task === 'engagement'
            ? { engagement: this.engagement.value }
            : { inpatient: this.inpatient.value }),
      };
    }
    this.busy.set(true);
    this.error.set('');
    this.feedback.set('');
    try {
      const { id } = await this.api.execute(
        'platform/' + task,
        this.scope().token,
        '',
        payload,
        task === 'organizations' || task === 'facilities' ? 'POST' : 'PATCH',
      );
      if (task === 'organizations') this.active.set(id);
      this.feedback.set(
        task === 'organizations'
          ? 'Organization created.'
          : task === 'facilities'
            ? 'Facility added.'
            : task === 'activation'
              ? 'Facility status updated.'
              : task === 'membership'
                ? revoke
                  ? 'Staff access revoked.'
                  : 'Staff access saved.'
                : task === 'engagement'
                  ? 'Engagement entitlement updated.'
                  : 'Inpatient entitlement updated.',
      );
      this.reload.update((number) => number + 1);
      dialog.close();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
