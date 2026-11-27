import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { debounceTime } from 'rxjs';
import { NgIcon } from '@ng-icons/core';
import { Api, errorMessage } from '../core/api';
import { facilityQuery } from '../core/query';
import { SessionStore } from '../core/session';
import { StatusTone } from '../design-system/format';
import { dayInIndia, observations, shiftDay, type AppointmentRow } from '../domain/operations';
import { labCatalogue } from '../domain/diagnostics';
import type { FollowUpSummary } from '../domain/continuity';
import { ClinicalPrescriptions } from './clinical-prescriptions';
import { ClinicalVisitDocuments } from './clinical-visit-documents';
import { ConsultationImaging } from './consultation-imaging';
import { ConsultationContinuity } from './consultation-continuity';

const headings = {
  appointments: 'Appointments',
  queue: 'Consultation Queue',
  clinical: 'Clinical Workspace',
} as const;
const descriptions = {
  appointments: 'Manage bookings and review the facility schedule.',
  queue: 'Verify arrivals and manage waiting tokens.',
  clinical: 'Review your assigned patients and complete consultations.',
} as const;
const states = {
  appointments: ['Booked', 'Checked in', 'In consultation', 'Completed', 'Cancelled'],
  queue: ['Waiting', 'Called', 'In consultation', 'Skipped'],
  clinical: ['Checked in', 'In consultation', 'Completed'],
};

@Component({
  imports: [
    ClinicalPrescriptions,
    ClinicalVisitDocuments,
    ConsultationImaging,
    ConsultationContinuity,
    DatePipe,
    NgIcon,
    ReactiveFormsModule,
    RouterLink,
    StatusTone,
  ],
  templateUrl: './access-worklist.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccessWorklist {
  protected readonly store = inject(SessionStore);
  private readonly api = inject(Api);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly kind = this.route.snapshot.data['resource'] as keyof typeof headings;
  protected readonly heading = headings[this.kind];
  protected readonly description = descriptions[this.kind];
  protected readonly statuses = states[this.kind];
  protected readonly today = dayInIndia();
  protected readonly latest = shiftDay(this.today, 90);
  private readonly dateParam = this.route.snapshot.queryParamMap.get('day');
  protected readonly day = signal(
    this.dateParam && /^\d{4}-\d{2}-\d{2}$/.test(this.dateParam) ? this.dateParam : this.today,
  );
  protected readonly state = signal('');
  protected readonly offset = signal(0);
  protected readonly refresh = signal(0);
  protected readonly message = signal('');
  protected readonly failure = signal('');
  protected readonly dialogFailure = signal('');
  protected readonly busy = signal(false);
  protected readonly pass = signal('');
  protected readonly qr = signal('');
  protected readonly search = this.fb.control('');
  protected readonly patientSearch = this.fb.control('');
  private readonly searchValue = toSignal(this.search.valueChanges.pipe(debounceTime(220)), {
    initialValue: '',
  });
  private readonly patientSearchValue = toSignal(
    this.patientSearch.valueChanges.pipe(debounceTime(220)),
    { initialValue: '' },
  );
  protected readonly booking = this.fb.group({
    patientId: ['', Validators.required],
    practitionerId: ['', Validators.required],
    day: [this.today, Validators.required],
    time: ['14:00', Validators.required],
    channel: ['Scheduled'],
  });
  protected readonly checkInCode = this.fb.control('', Validators.required);
  protected readonly active = signal<AppointmentRow | undefined>(undefined);
  protected readonly observation = this.fb.control('', Validators.required);
  protected readonly observations = observations;
  protected readonly labCatalogue = labCatalogue;
  protected readonly selectedTest = this.fb.control('', Validators.required);
  protected readonly clinicalFeedback = signal('');
  protected readonly bookingOpen = signal(false);
  protected readonly bookingTarget = signal<AppointmentRow | undefined>(undefined);
  protected readonly selectedFollowUp = signal<FollowUpSummary | undefined>(undefined);
  protected readonly cancellationTarget = signal<AppointmentRow | undefined>(undefined);
  protected readonly transferTarget = signal<AppointmentRow | undefined>(undefined);
  protected readonly destination = this.fb.control('', Validators.required);
  protected readonly displayEnabled = computed(() => !!this.store.facility()?.publicQueue);
  private readonly scope = computed(() => ({
    token: this.store.session()?.token ?? '',
    facility: this.store.facility()?.id ?? '',
  }));
  private readonly params = computed(() => ({
    ...this.scope(),
    day: this.day(),
    status: this.state(),
    offset: this.offset(),
    q: this.searchValue(),
    refresh: this.refresh(),
  }));
  protected readonly result = facilityQuery(
    this.params,
    ({ token, facility, day, status, offset, q }) =>
      this.api.appointments(this.kind, token, facility, { day, status, offset, q }),
  );
  private readonly choiceParams = computed(() =>
    this.bookingOpen()
      ? { ...this.scope(), q: this.patientSearchValue() }
      : { token: '', facility: '', q: '' },
  );
  protected readonly options = facilityQuery(this.choiceParams, ({ token, facility, q }) =>
    this.api.patients('appointments/options', token, facility, q),
  );
  private readonly patientId = toSignal(this.booking.controls.patientId.valueChanges, {
    initialValue: '',
  });
  private readonly contextParams = computed(() => ({
    ...this.scope(),
    facility:
      this.bookingOpen() &&
      this.patientId() &&
      (!this.bookingTarget() || this.bookingTarget()?.appointment.followUpId) &&
      !this.pass()
        ? this.scope().facility
        : '',
    patientId: this.patientId(),
  }));
  protected readonly bookingContext = facilityQuery(
    this.contextParams,
    ({ token, facility, patientId }) => this.api.bookingContext(token, facility, patientId),
  );
  protected readonly bookingWindow = computed(() => {
    const existing = this.bookingTarget()?.appointment.followUpId;
    const context = this.bookingContext();
    return (
      this.selectedFollowUp() ??
      (existing && context.state === 'ready'
        ? context.data.followUps.find((item) => item.id === existing)
        : undefined)
    );
  });
  protected readonly earliestBooking = computed(() => {
    const start = this.bookingWindow()?.startsOn;
    return start && start > this.today ? start : this.today;
  });
  protected readonly latestBooking = computed(() => this.bookingWindow()?.endsOn ?? this.latest);
  private readonly slotProvider = toSignal(this.booking.controls.practitionerId.valueChanges, {
    initialValue: '',
  });
  private readonly slotDay = toSignal(this.booking.controls.day.valueChanges, {
    initialValue: this.today,
  });
  private readonly slotParams = computed(() => ({
    ...this.scope(),
    facility:
      this.bookingOpen() && this.slotProvider() && this.slotDay() ? this.scope().facility : '',
    day: this.slotDay(),
    practitionerId: this.slotProvider(),
    appointmentId: this.bookingTarget()?.appointment.id ?? '',
    patientId: this.patientId(),
  }));
  protected readonly slots = facilityQuery(
    this.slotParams,
    ({ token, facility, day, practitionerId, appointmentId, patientId }) =>
      this.api.availableTimes(token, facility, day, practitionerId, appointmentId, patientId),
  );
  private readonly transferParams = computed(() => ({
    ...this.scope(),
    facility: this.transferTarget() ? this.scope().facility : '',
  }));
  protected readonly transferOptions = facilityQuery(this.transferParams, ({ token, facility }) =>
    this.api.patients('queue/options', token, facility, ''),
  );

  protected openBooking(dialog: HTMLDialogElement, row?: AppointmentRow) {
    this.pass.set('');
    this.qr.set('');
    this.dialogFailure.set('');
    this.selectedFollowUp.set(undefined);
    this.bookingTarget.set(row);
    this.booking.reset({
      patientId: row?.appointment.patientId ?? '',
      practitionerId: row?.appointment.practitionerId ?? '',
      day: row?.appointment.day ?? (this.day() < this.today ? this.today : this.day()),
      time: row?.appointment.time ?? '14:00',
      channel: row?.appointment.channel ?? 'Scheduled',
    });
    this.patientSearch.reset();
    this.bookingOpen.set(true);
    dialog.showModal();
  }

  protected choosePreviousClinician(id: string) {
    this.booking.controls.practitionerId.setValue(id);
    this.booking.controls.time.reset('');
  }

  protected chooseFollowUp(request: FollowUpSummary) {
    this.selectedFollowUp.set(request);
    this.booking.patchValue({
      practitionerId: request.clinician.id,
      day: this.earliestBooking(),
      time: '',
      channel: 'Scheduled',
    });
  }

  protected clearFollowUp() {
    if (!this.selectedFollowUp()) return;
    this.selectedFollowUp.set(undefined);
    this.booking.controls.time.reset('');
  }

  protected changeBookingPatient() {
    this.booking.controls.patientId.reset();
    this.clearFollowUp();
  }

  protected async saveBooking() {
    if (this.booking.invalid) {
      this.booking.markAllAsTouched();
      this.dialogFailure.set('Choose a patient, clinician and appointment time.');
      return;
    }
    const slot = this.booking.getRawValue();
    if (slot.day < this.earliestBooking() || slot.day > this.latestBooking()) {
      this.dialogFailure.set('Choose a date within the available booking window.');
      return;
    }
    const current = this.bookingTarget()?.appointment;
    const followUp = this.selectedFollowUp();
    const result = current
      ? await this.execute(
          'appointments/reschedule',
          { ...slot, appointmentId: current.id, version: String(current.version ?? 0) },
          'Appointment rescheduled.',
          true,
          'PATCH',
        )
      : followUp
        ? await this.runCommand(
            (token, facility) =>
              this.api.bookFollowUp(token, facility, followUp, {
                patientId: slot.patientId,
                day: slot.day,
                time: slot.time,
              }),
            'Follow-up booked.',
            true,
          )
        : await this.execute('appointments', slot, 'Appointment booked.', true);
    if (result?.pass) {
      this.day.set(slot.day);
      this.offset.set(0);
      this.pass.set(result.pass);
      const { toDataURL } = await import('qrcode');
      this.qr.set(await toDataURL(result.pass, { margin: 2, width: 192 }).catch(() => ''));
    }
  }

  protected offerCancellation(row: AppointmentRow, dialog: HTMLDialogElement) {
    this.cancellationTarget.set(row);
    this.dialogFailure.set('');
    dialog.showModal();
  }

  protected async cancelAppointment(dialog: HTMLDialogElement) {
    const current = this.cancellationTarget()?.appointment;
    if (!current) return;
    if (
      await this.execute(
        'appointments/cancel',
        { appointmentId: current.id, version: String(current.version ?? 0) },
        'Appointment cancelled.',
        true,
        'PATCH',
      )
    )
      dialog.close();
  }

  protected openTransfer(row: AppointmentRow, dialog: HTMLDialogElement) {
    this.transferTarget.set(row);
    this.destination.reset();
    this.dialogFailure.set('');
    dialog.showModal();
  }

  protected async transfer(dialog: HTMLDialogElement) {
    const row = this.transferTarget();
    if (!row || this.destination.invalid) return;
    if (
      await this.execute(
        'queue/transfer',
        {
          appointmentId: row.appointment.id,
          practitionerId: this.destination.value,
          fromPractitionerId: row.practitioner.id,
          expectedStatus: row.ticket?.status ?? '',
        },
        'Token transferred and returned to the waiting queue.',
        true,
      )
    )
      dialog.close();
  }

  protected async verify(dialog: HTMLDialogElement) {
    if (this.checkInCode.invalid) {
      this.dialogFailure.set('Enter the code shown on the appointment pass.');
      return;
    }
    if (
      await this.execute(
        'queue/check-in',
        { pass: this.checkInCode.value.trim() },
        'Arrival verified and a queue token issued.',
        true,
      )
    )
      dialog.close();
  }

  protected async readQr(event: Event) {
    const field = event.target as HTMLInputElement;
    const file = field.files?.[0];
    this.dialogFailure.set('');
    if (!file) return;
    field.value = '';
    try {
      if (file.size > 2_000_000 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
        throw new Error();
      const image = await createImageBitmap(file, { resizeWidth: 600 });
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      context?.drawImage(image, 0, 0);
      image.close();
      const pixels = context?.getImageData(0, 0, canvas.width, canvas.height);
      if (!pixels) throw new Error();
      const { default: decode } = await import('jsqr');
      const value = decode(pixels.data, pixels.width, pixels.height)?.data;
      if (!value || !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(value)) throw new Error();
      this.checkInCode.setValue(value);
    } catch {
      this.dialogFailure.set('The image did not contain a readable TrueCare appointment code.');
    }
  }

  protected openCheckIn(dialog: HTMLDialogElement) {
    this.checkInCode.reset();
    this.dialogFailure.set('');
    dialog.showModal();
  }

  protected openConsultation(row: AppointmentRow, dialog: HTMLDialogElement) {
    this.active.set(row);
    this.observation.reset(row.encounter?.observation ?? '');
    this.dialogFailure.set('');
    this.clinicalFeedback.set('');
    this.selectedTest.reset();
    dialog.showModal();
  }

  protected async orderLab() {
    const encounter = this.active()?.encounter;
    if (!encounter || this.selectedTest.invalid) {
      this.dialogFailure.set('Select a laboratory test.');
      return;
    }
    this.clinicalFeedback.set('');
    if (
      await this.execute(
        'clinical/lab-orders',
        { encounterId: encounter.id, test: this.selectedTest.value },
        'Laboratory order created.',
        true,
      )
    ) {
      this.clinicalFeedback.set('Laboratory order created.');
      this.selectedTest.reset();
    }
  }

  protected async complete(dialog: HTMLDialogElement) {
    const active = this.active();
    if (!active || this.observation.invalid) {
      this.dialogFailure.set('Select an observation before signing.');
      return;
    }
    if (
      await this.execute(
        'clinical/complete',
        { appointmentId: active.appointment.id, observation: this.observation.value },
        'Encounter signed and completed.',
        true,
      )
    )
      dialog.close();
  }

  protected action(path: string, row: AppointmentRow) {
    const messages: Record<string, string> = {
      'queue/call': 'Token called.',
      'queue/recall': 'Token recalled.',
      'queue/skip': 'Token skipped.',
      'queue/requeue': 'Token returned to the waiting queue.',
      'clinical/start': 'Consultation started.',
    };
    return this.execute(
      path,
      { appointmentId: row.appointment.id, expectedStatus: row.ticket?.status ?? '' },
      messages[path],
      false,
    );
  }

  private execute(
    path: string,
    body: Record<string, string>,
    message: string,
    inDialog: boolean,
    method: 'POST' | 'PATCH' = 'POST',
  ) {
    return this.runCommand(
      (token, facility) => this.api.execute(path, token, facility, body, method),
      message,
      inDialog,
    );
  }

  private async runCommand(
    command: (token: string, facility: string) => Promise<{ id: string; pass?: string }>,
    message: string,
    inDialog: boolean,
  ) {
    if (this.busy()) return;
    const { token, facility } = this.scope();
    this.busy.set(true);
    this.failure.set('');
    this.dialogFailure.set('');
    this.message.set('');
    try {
      const result = await command(token, facility);
      this.message.set(message);
      return result;
    } catch (error) {
      (inDialog ? this.dialogFailure : this.failure).set(errorMessage(error));
      return undefined;
    } finally {
      this.busy.set(false);
    }
  }
}
