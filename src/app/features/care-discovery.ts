import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { filter } from 'rxjs';
import { Api, errorMessage } from '../core/api';
import { configurationChanges, facilityChanges } from '../core/events';
import { refreshingQuery } from '../core/query';
import { SessionStore } from '../core/session';
import { Brand } from '../design-system/brand';
import { dayInIndia, shiftDay, type Practitioner } from '../domain/operations';
import { readPublicAppointment, type PublicAppointment } from '../domain/public-care';

@Component({
  imports: [Brand, DatePipe, NgIcon, ReactiveFormsModule, RouterLink],
  templateUrl: './care-discovery.html',
  styleUrl: './care-discovery.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CareDiscovery {
  private readonly api = inject(Api);
  protected readonly store = inject(SessionStore);
  private readonly returnVisit = signal(
    readPublicAppointment(inject(ActivatedRoute).snapshot.queryParamMap),
  );
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('booking');
  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');
  protected readonly today = dayInIndia();
  protected readonly lastDay = shiftDay(this.today, 90);
  protected readonly reload = signal(0);
  protected readonly search = signal('');
  protected readonly facility = signal('');
  protected readonly specialty = signal('');
  protected readonly selected = signal<Practitioner | undefined>(undefined);
  protected readonly message = signal('');
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly confirmed = signal<PublicAppointment | undefined>(undefined);
  protected readonly bookingForm = inject(NonNullableFormBuilder).group({
    day: [this.today, Validators.required],
    time: ['', Validators.required],
  });
  protected readonly day = toSignal(this.bookingForm.controls.day.valueChanges, {
    initialValue: this.today,
  });
  private readonly time = toSignal(this.bookingForm.controls.time.valueChanges, {
    initialValue: '',
  });
  protected readonly directory = refreshingQuery(
    this.reload,
    () => true,
    () => configurationChanges,
    () => this.api.careDirectory(),
  );
  protected readonly facilities = computed(() => {
    const state = this.directory();
    return state.state === 'ready' ? state.data.facilities : [];
  });
  protected readonly byId = computed(
    () => new Map(this.facilities().map((facility) => [facility.id, facility])),
  );
  private readonly clinicians = computed(() => {
    const state = this.directory();
    return state.state === 'ready' ? state.data.clinicians : [];
  });
  protected readonly specialties = computed(() =>
    [...new Set(this.clinicians().map((clinician) => clinician.specialty))].sort(),
  );
  protected readonly results = computed(() => {
    const term = this.search().trim().toLowerCase();
    const facilityId = this.facility();
    const specialty = this.specialty();
    const sites = this.byId();
    return this.clinicians().filter((clinician) => {
      const site = sites.get(clinician.facilityId);
      return (
        site &&
        (!facilityId || facilityId === site.id) &&
        (!specialty || specialty === clinician.specialty) &&
        [clinician.name, clinician.specialty, site.name, site.city].some((value) =>
          value.toLowerCase().includes(term),
        )
      );
    });
  });
  protected readonly selection = computed(() => {
    const clinician = this.selected();
    return (
      clinician && {
        facilityId: clinician.facilityId,
        practitionerId: clinician.id,
        day: this.day(),
        time: this.time(),
      }
    );
  });
  private readonly slotQuery = computed(() => ({
    clinician: this.selected(),
    day: this.day(),
    reload: this.reload(),
  }));
  protected readonly slots = refreshingQuery(
    this.slotQuery,
    ({ clinician, day }) => !!clinician && day >= this.today && day <= this.lastDay,
    ({ clinician }) => facilityChanges.pipe(filter((id) => id === clinician?.facilityId)),
    ({ clinician, day }) => this.api.publicTimes(clinician!.facilityId, clinician!.id, day),
  );
  protected readonly canBook = computed(() => {
    const site = this.selected()?.facilityId;
    return !!site && this.store.session()?.facilityAccess[site]?.writes.includes('portal') === true;
  });
  protected readonly readyToBook = computed(() => {
    const query = this.slots();
    const selection = this.selection();
    return (
      !!selection &&
      this.byId().has(selection.facilityId) &&
      query.state === 'ready' &&
      query.data.includes(selection.time)
    );
  });

  constructor() {
    effect(() => {
      const intent = this.returnVisit();
      const catalogue = this.directory();
      if (catalogue.state !== 'ready') return;
      if (this.facility() && !catalogue.data.facilities.some(({ id }) => id === this.facility()))
        this.facility.set('');
      if (
        this.specialty() &&
        !this.specialties().some((specialty) => specialty === this.specialty())
      )
        this.specialty.set('');
      if (intent) {
        this.returnVisit.set(undefined);
        const clinician = catalogue.data.clinicians.find(
          (row) => row.id === intent.practitionerId && row.facilityId === intent.facilityId,
        );
        if (clinician && intent.day >= this.today && intent.day <= this.lastDay)
          this.open(clinician, intent);
        else
          this.message.set(
            'The selected appointment is unavailable. Choose another clinician or date.',
          );
      }
      const selected = this.selected();
      if (selected && !catalogue.data.clinicians.some((row) => row.id === selected.id)) {
        this.dialog().nativeElement.close();
        this.message.set('Online booking is no longer available for this facility.');
      }
    });
  }

  protected resetFilters() {
    this.search.set('');
    this.facility.set('');
    this.specialty.set('');
  }

  protected refresh() {
    this.reload.update((value) => value + 1);
  }

  protected closeBooking() {
    this.selected.set(undefined);
    if (document.activeElement === document.body) this.heading().nativeElement.focus();
  }

  protected open(clinician: Practitioner, intent?: PublicAppointment) {
    this.confirmed.set(undefined);
    this.error.set('');
    this.message.set('');
    this.bookingForm.reset(intent ? { day: intent.day, time: intent.time } : undefined);
    this.selected.set(clinician);
    this.dialog().nativeElement.showModal();
  }

  protected async book() {
    const choice = this.selection();
    const token = this.store.session()?.token;
    if (this.busy() || !choice || !token || !this.canBook() || !this.readyToBook()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.api.bookPublicVisit(token, choice);
      this.confirmed.set(choice);
    } catch (error) {
      this.error.set(errorMessage(error));
      this.refresh();
    } finally {
      this.busy.set(false);
    }
  }
}
