import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { filter, map } from 'rxjs';
import { Api, errorMessage } from '../core/api';
import { configurationChanges } from '../core/events';
import { readAppointmentPass } from '../core/qr-pass';
import { refreshingQuery } from '../core/query';
import { Brand } from '../design-system/brand';
import type { KioskReceipt } from '../domain/public-care';
import { appointmentPassPattern } from '../domain/scheduling';
import { LivePassCamera } from './live-pass-camera';

@Component({
  imports: [Brand, LivePassCamera, NgIcon, ReactiveFormsModule, RouterLink],
  templateUrl: './check-in-kiosk.html',
  styleUrl: './check-in-kiosk.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckInKiosk {
  private readonly api = inject(Api);
  private readonly injector = inject(Injector);
  private readonly route = inject(ActivatedRoute);
  private readonly passField = viewChild<ElementRef<HTMLInputElement>>('passField');
  private readonly tokenHeading = viewChild<ElementRef<HTMLElement>>('tokenHeading');
  protected readonly facility = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('facility') ?? '')),
    { initialValue: '' },
  );
  protected readonly reload = signal(0);
  protected readonly code = inject(NonNullableFormBuilder).control('');
  protected readonly busy = signal(false);
  protected readonly scanning = signal(false);
  protected readonly error = signal('');
  protected readonly receipt = signal<KioskReceipt | undefined>(undefined);
  private readonly request = computed(() => ({ facility: this.facility(), reload: this.reload() }));
  protected readonly site = refreshingQuery(
    this.request,
    ({ facility }) => !!facility,
    ({ facility }) => configurationChanges.pipe(filter((id) => id === facility)),
    ({ facility }) => this.api.kioskLocation(facility),
  );

  constructor() {
    effect(() => {
      this.facility();
      this.clear();
    });
    effect(() => {
      if (this.site().state === 'error') this.clear();
    });
    effect((cleanup) => {
      if (!this.receipt()) return;
      const timeout = setTimeout(() => this.finish(), 45_000);
      cleanup(() => clearTimeout(timeout));
      this.tokenHeading()?.nativeElement.focus();
    });
  }

  protected async scan(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.scanning() || this.busy()) return;
    const facility = this.facility();
    this.scanning.set(true);
    this.error.set('');
    this.code.reset();
    try {
      const pass = await readAppointmentPass(file);
      if (this.facility() === facility && this.site().state !== 'error') {
        this.usePass(pass);
      }
    } catch {
      if (this.facility() === facility)
        this.error.set('The image did not contain a readable TrueCare appointment code.');
    } finally {
      this.scanning.set(false);
    }
  }

  protected usePass(pass: string) {
    this.code.setValue(pass);
    this.error.set('');
    this.passField()?.nativeElement.focus();
  }

  protected async checkIn() {
    const location = this.site();
    const facility = this.facility();
    if (
      this.busy() ||
      this.scanning() ||
      location.state !== 'ready' ||
      location.data.id !== facility
    )
      return;
    const pass = this.code.value.trim();
    if (!appointmentPassPattern.test(pass)) {
      this.error.set('Enter the code shown on your appointment pass.');
      this.passField()?.nativeElement.focus();
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.code.reset();
    try {
      const receipt = await this.api.checkInAtKiosk(facility, pass);
      if (this.facility() === facility && this.site().state !== 'error') this.receipt.set(receipt);
    } catch (error) {
      if (this.facility() === facility) this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected finish() {
    this.clear();
    afterNextRender(() => this.passField()?.nativeElement.focus(), { injector: this.injector });
  }

  private clear() {
    this.code.reset();
    this.error.set('');
    this.receipt.set(undefined);
  }
}
