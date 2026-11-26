import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { debounceTime, map } from 'rxjs';
import { Api, errorMessage } from '../core/api';
import { facilityQuery } from '../core/query';
import { SessionStore } from '../core/session';
import { StatusTone } from '../design-system/format';
import {
  arrivalModes,
  clinicalPriorities,
  procedureCategories,
  reviewFocuses,
  reviewOutcomes,
  theatreRooms,
  theatreTimes,
  type AcuteWorkspace,
  type EmergencyCase,
  type EmergencyRow,
  type IcuReviewFields,
  type IcuRow,
  type TheatreAction,
  type TheatreBooking,
  type TheatreRow,
} from '../domain/acute-care';
import { dayInIndia, shiftDay } from '../domain/operations';

type Editor =
  | { mode: 'arrival' | 'booking' }
  | { mode: 'assess' | 'admit' | 'close'; visit: EmergencyRow }
  | { mode: 'review' | 'step-down' | 'history'; patient: IcuRow }
  | { mode: 'stage'; record: TheatreRow; action: TheatreAction };

const workspaceLabels = {
  emergency: {
    heading: 'Emergency',
    description: 'Record arrivals, clinician-assigned priorities and admission handoffs.',
  },
  'critical-care': {
    heading: 'ICU & Critical Care',
    description: 'Review the critical-care census and coordinate step-down transfers.',
  },
  'operation-theatre': {
    heading: 'Operation Theatre',
    description: 'Schedule rooms and record each case from readiness through recovery.',
  },
};
const filters = {
  emergency: ['Awaiting assessment', 'Under care', 'Admission requested', 'Admitted', 'Closed'],
  'critical-care': ['In critical care', 'Step-down requested'],
  'operation-theatre': ['Scheduled', 'Ready', 'In theatre', 'Recovery', 'Completed', 'Cancelled'],
};
const titles = {
  arrival: 'Record emergency arrival',
  booking: 'Schedule theatre case',
  assess: 'Record clinical assessment',
  admit: 'Request inpatient admission',
  close: 'Close emergency visit',
  review: 'Record ICU review',
  'step-down': 'Request ICU step-down',
  history: 'ICU review history',
};
const stageLabels: Record<TheatreAction, string> = {
  ready: 'Mark ready',
  start: 'Start case',
  recovery: 'Move to recovery',
  complete: 'Complete case',
  cancel: 'Cancel booking',
};
const stageNotices: Record<TheatreAction, string> = {
  ready: 'Case marked ready.',
  start: 'Case marked in theatre.',
  recovery: 'Case moved to recovery.',
  complete: 'Theatre case completed.',
  cancel: 'Theatre booking cancelled.',
};

@Component({
  imports: [DatePipe, NgIcon, ReactiveFormsModule, StatusTone],
  templateUrl: './acute-workspace.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AcuteWorkspacePage {
  private readonly api = inject(Api);
  private readonly forms = inject(NonNullableFormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly store = inject(SessionStore);
  protected readonly workspace = this.route.snapshot.data['resource'] as AcuteWorkspace;
  protected readonly label = workspaceLabels[this.workspace];
  protected readonly statuses = filters[this.workspace];
  protected readonly today = dayInIndia();
  protected readonly latest = shiftDay(this.today, 90);
  protected readonly day = toSignal(
    this.route.queryParamMap.pipe(map((params) => this.scheduleDay(params.get('day')))),
    {
      initialValue: this.scheduleDay(this.route.snapshot.queryParamMap.get('day')),
    },
  );
  protected readonly reload = signal(0);
  protected readonly busy = signal(false);
  protected readonly notice = signal('');
  protected readonly error = signal('');
  protected readonly editor = signal<Editor | undefined>(undefined);
  protected readonly status = this.forms.control('');
  protected readonly search = this.forms.control('');
  protected readonly patientSearch = this.forms.control('');
  protected readonly admissionSearch = this.forms.control('');
  protected readonly visible = signal(12);
  private readonly statusValue = toSignal(this.status.valueChanges, { initialValue: '' });
  private readonly searchValue = toSignal(this.search.valueChanges, { initialValue: '' });
  private readonly patientSearchValue = toSignal(
    this.patientSearch.valueChanges.pipe(debounceTime(180)),
    { initialValue: '' },
  );
  protected readonly admissionSearchValue = toSignal(this.admissionSearch.valueChanges, {
    initialValue: '',
  });
  protected readonly arrivals = arrivalModes;
  protected readonly priorities = clinicalPriorities;
  protected readonly focuses = reviewFocuses;
  protected readonly outcomes = reviewOutcomes;
  protected readonly rooms = theatreRooms;
  protected readonly categories = procedureCategories;
  protected readonly times = theatreTimes;
  protected readonly arrival = this.forms.group({
    patientId: [''],
    arrival: this.forms.control<EmergencyCase['arrival'] | ''>(''),
  });
  protected readonly priority = this.forms.control<NonNullable<EmergencyCase['priority']> | ''>('');
  protected readonly review = this.forms.group({
    focus: this.forms.control<IcuReviewFields['focus'] | ''>(''),
    outcome: this.forms.control<IcuReviewFields['outcome'] | ''>(''),
  });
  protected readonly booking = this.forms.group({
    admissionId: [''],
    room: this.forms.control<TheatreBooking['room'] | ''>(''),
    category: this.forms.control<TheatreBooking['category'] | ''>(''),
    day: [this.today],
    startsAt: [''],
    endsAt: [''],
  });
  private readonly scope = computed(() => ({
    token: this.store.session()?.token ?? '',
    facility: this.store.facility()?.id ?? '',
    reload: this.reload(),
  }));
  private readonly params = computed(() => ({ ...this.scope(), day: this.day() }));
  protected readonly data = facilityQuery(this.params, ({ token, facility, day }) =>
    this.api.acuteView(token, facility, this.workspace, day),
  );
  private readonly patientParams = computed(() => ({
    ...this.scope(),
    facility: this.editor()?.mode === 'arrival' ? this.scope().facility : '',
    q: this.patientSearchValue(),
  }));
  protected readonly patients = facilityQuery(this.patientParams, ({ token, facility, q }) =>
    this.api.emergencyPatients(token, facility, q),
  );

  protected readonly title = computed(() => {
    const entry = this.editor();
    return entry
      ? entry.mode === 'stage'
        ? stageLabels[entry.action]
        : titles[entry.mode]
      : this.label.heading;
  });
  protected readonly metrics = computed(() => {
    const state = this.data();
    if (state.state !== 'ready') return [];
    const data = state.data;
    if (data.kind === 'emergency')
      return [
        {
          label: 'Awaiting assessment',
          value: data.cases.filter((row) => row.status === 'Awaiting assessment').length,
          icon: 'clock',
          tone: 'amber',
        },
        {
          label: 'Under care',
          value: data.cases.filter((row) => row.status === 'Under care').length,
          icon: 'activity',
          tone: 'teal',
        },
        {
          label: 'Awaiting bed allocation',
          value: data.cases.filter((row) => this.emergencyStatus(row) === 'Admission requested')
            .length,
          icon: 'bed',
          tone: 'teal',
        },
      ];
    if (data.kind === 'critical-care')
      return [
        { label: 'Occupied ICU beds', value: data.occupied, icon: 'bed', tone: 'teal' },
        { label: 'Available ICU beds', value: data.available, icon: 'check', tone: 'teal' },
        {
          label: 'Step-down requests',
          value: data.patients.filter((row) => row.stepDownRequestedAt !== undefined).length,
          icon: 'clipboard',
          tone: 'amber',
        },
      ];
    return [
      {
        label: 'Scheduled or ready',
        value: data.cases.filter((row) => ['Scheduled', 'Ready'].includes(row.status)).length,
        icon: 'calendar',
        tone: 'teal',
      },
      {
        label: 'In theatre or recovery',
        value: data.cases.filter((row) => ['In theatre', 'Recovery'].includes(row.status)).length,
        icon: 'activity',
        tone: 'amber',
      },
      {
        label: 'Completed cases',
        value: data.cases.filter((row) => row.status === 'Completed').length,
        icon: 'check',
        tone: 'teal',
      },
    ];
  });
  protected readonly emergencyRows = computed(() => {
    const state = this.data();
    return state.state === 'ready' && state.data.kind === 'emergency'
      ? state.data.cases.filter((row) => this.matches(row.patient, this.emergencyStatus(row)))
      : [];
  });
  protected readonly icuRows = computed(() => {
    const state = this.data();
    return state.state === 'ready' && state.data.kind === 'critical-care'
      ? state.data.patients.filter((row) =>
          this.matches(
            row.patient,
            row.stepDownRequestedAt === undefined ? 'In critical care' : 'Step-down requested',
            row.bed,
          ),
        )
      : [];
  });
  protected readonly theatreRows = computed(() => {
    const state = this.data();
    return state.state === 'ready' && state.data.kind === 'operation-theatre'
      ? state.data.cases.filter((row) => this.matches(row.patient, row.status, row.room))
      : [];
  });
  protected readonly admitted = computed(() => {
    const state = this.data();
    const search = this.admissionSearchValue().trim().toLowerCase();
    return state.state === 'ready' && state.data.kind === 'operation-theatre'
      ? state.data.admissions
          .filter(({ patient, bed }) =>
            `${patient.name} ${patient.id} ${bed}`.toLowerCase().includes(search),
          )
          .slice(0, 40)
      : [];
  });

  protected selectDay(value: string) {
    const day = this.scheduleDay(value);
    this.visible.set(12);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { day: day === this.today ? null : day },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private scheduleDay(value: string | null) {
    return this.workspace === 'operation-theatre' && value && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? value
      : this.today;
  }

  protected emergencyStatus(row: EmergencyRow) {
    return row.admissionStatus === 'Admitted'
      ? 'Admitted'
      : row.admissionStatus === 'Discharged'
        ? 'Closed'
        : row.status;
  }

  protected theatreNext(row: TheatreRow): TheatreAction | undefined {
    if (row.status === 'Scheduled') return 'ready';
    if (row.status === 'Ready' && row.day === this.today) return 'start';
    if (row.status === 'In theatre') return 'recovery';
    if (row.status === 'Recovery') return 'complete';
    return undefined;
  }

  protected readonly stageLabels = stageLabels;

  protected open(dialog: HTMLDialogElement, editor: Editor) {
    this.editor.set(editor);
    this.error.set('');
    this.patientSearch.reset();
    this.admissionSearch.reset();
    this.arrival.reset();
    this.priority.reset(editor.mode === 'assess' ? (editor.visit.priority ?? '') : '');
    this.review.reset();
    this.booking.reset({ day: this.day() < this.today ? this.today : this.day() });
    dialog.showModal();
  }

  protected async submit(dialog: HTMLDialogElement) {
    const entry = this.editor();
    if (!entry || entry.mode === 'history') return;
    let success = false;
    switch (entry.mode) {
      case 'arrival': {
        const { patientId, arrival } = this.arrival.getRawValue();
        if (!patientId || !arrival) return;
        success = await this.save(
          (token, facility) =>
            this.api.recordEmergencyArrival(token, facility, { patientId, arrival }),
          'Emergency arrival recorded.',
        );
        break;
      }
      case 'assess': {
        const priority = this.priority.value;
        if (!priority) return;
        success = await this.save(
          (token, facility) =>
            this.api.updateEmergencyVisit(token, facility, entry.visit, {
              action: 'assess',
              priority,
            }),
          'Clinician assessment recorded.',
        );
        break;
      }
      case 'admit':
      case 'close': {
        const action = entry.mode;
        success = await this.save(
          (token, facility) =>
            this.api.updateEmergencyVisit(token, facility, entry.visit, { action }),
          action === 'admit' ? 'Admission requested.' : 'Emergency visit closed.',
        );
        break;
      }
      case 'review': {
        const { focus, outcome } = this.review.getRawValue();
        if (!focus || !outcome) return;
        success = await this.save(
          (token, facility) =>
            this.api.recordIcuReview(token, facility, entry.patient, { focus, outcome }),
          'ICU review recorded.',
        );
        break;
      }
      case 'step-down':
        success = await this.save(
          (token, facility) => this.api.requestIcuStepDown(token, facility, entry.patient),
          'Step-down requested.',
        );
        break;
      case 'booking': {
        const { room, category, ...fields } = this.booking.getRawValue();
        if (
          !room ||
          !category ||
          !fields.admissionId ||
          !fields.day ||
          !fields.startsAt ||
          !fields.endsAt
        )
          return;
        success = await this.save(
          (token, facility) =>
            this.api.bookTheatreCase(token, facility, { ...fields, room, category }),
          'Theatre case scheduled.',
        );
        if (success) this.selectDay(fields.day);
        break;
      }
      case 'stage':
        success = await this.save(
          (token, facility) =>
            this.api.updateTheatreCase(token, facility, entry.record, entry.action),
          stageNotices[entry.action],
        );
        break;
    }
    if (success) dialog.close();
  }

  private matches(patient: { id: string; name: string }, status: string, location = '') {
    return (
      (!this.statusValue() || status === this.statusValue()) &&
      `${patient.name} ${patient.id} ${location}`
        .toLowerCase()
        .includes(this.searchValue().trim().toLowerCase())
    );
  }

  private async save(
    command: (token: string, facility: string) => Promise<unknown>,
    notice: string,
  ) {
    if (this.busy()) return false;
    const { token, facility } = this.scope();
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await command(token, facility);
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
