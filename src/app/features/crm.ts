import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { Api, errorMessage } from '../core/api';
import { facilityQuery } from '../core/query';
import { SessionStore } from '../core/session';
import { StatusTone } from '../design-system/format';
import {
  contactOutcomes,
  enquiryReasons,
  enquirySources,
  enquiryStatuses,
  type ContactOutcome,
  type EnquiryAction,
  type EnquiryReason,
  type EnquiryRow,
  type EnquirySource,
  type EnquiryUpdate,
} from '../domain/engagement';
import { dayInIndia, shiftDay, specialties, type Specialty } from '../domain/operations';

type Editor = { kind: 'capture' } | { kind: EnquiryAction | 'history'; row: EnquiryRow };
const labels = {
  capture: { title: 'Capture enquiry', save: 'Save enquiry', notice: 'Enquiry added.' },
  assign: { title: 'Assign follow-up', save: 'Save assignment', notice: 'Follow-up assigned.' },
  contact: {
    title: 'Record contact',
    save: 'Save contact outcome',
    notice: 'Contact outcome recorded.',
  },
  book: {
    title: 'Book appointment',
    save: 'Confirm booking',
    notice: 'Appointment booked from this enquiry.',
  },
  close: { title: 'Close enquiry', save: 'Confirm closure', notice: 'Enquiry closed.' },
  history: { title: 'Contact history', save: 'Close', notice: '' },
};

@Component({
  imports: [DatePipe, ReactiveFormsModule, NgIcon, StatusTone],
  templateUrl: './crm.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Crm {
  private readonly api = inject(Api);
  private readonly forms = inject(NonNullableFormBuilder);
  private editorFacility = '';
  protected readonly store = inject(SessionStore);
  protected readonly today = dayInIndia();
  protected readonly lastDay = shiftDay(this.today, 90);
  protected readonly search = signal('');
  protected readonly patientSearch = signal('');
  protected readonly status = signal('');
  protected readonly limit = signal(12);
  protected readonly reload = signal(0);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly busy = signal(false);
  protected readonly editor = signal<Editor | undefined>(undefined);
  protected readonly labels = labels;
  protected readonly specialties = specialties;
  protected readonly sources = enquirySources;
  protected readonly statuses = enquiryStatuses;
  protected readonly outcomes = contactOutcomes;
  protected readonly reasons = enquiryReasons;
  protected readonly canAssign = computed(
    () => this.store.writeAllowed('crm') && this.store.canPerform('crm/assign'),
  );
  protected readonly form = this.forms.group({
    patientId: [''],
    specialty: this.forms.control<Specialty | ''>(''),
    source: this.forms.control<EnquirySource | ''>(''),
    assignee: [''],
    followUpOn: [this.today],
    outcome: this.forms.control<ContactOutcome | ''>(''),
    reason: this.forms.control<EnquiryReason | ''>(''),
    practitionerId: [''],
    day: [this.today],
    time: [''],
  });
  private readonly clinician = toSignal(this.form.controls.practitionerId.valueChanges, {
    initialValue: '',
  });
  private readonly day = toSignal(this.form.controls.day.valueChanges, {
    initialValue: this.today,
  });
  private readonly scope = computed(() => ({
    token: this.store.session()?.token ?? '',
    facility: this.store.facility()?.id ?? '',
    reload: this.reload(),
  }));
  protected readonly data = facilityQuery(this.scope, ({ token, facility }) =>
    this.api.crm(token, facility),
  );
  private readonly patientScope = computed(() => {
    const q = this.patientSearch().trim();
    return {
      ...this.scope(),
      q,
      facility: this.editor()?.kind === 'capture' && q.length >= 2 ? this.editorFacility : '',
    };
  });
  protected readonly patients = facilityQuery(this.patientScope, ({ token, facility, q }) =>
    this.api.crmPatients(token, facility, q),
  );
  private readonly timeScope = computed(() => {
    const editor = this.editor();
    const enquiryId = editor?.kind === 'book' ? editor.row.id : '';
    return {
      ...this.scope(),
      enquiryId,
      practitioner: this.clinician(),
      day: this.day(),
      facility: enquiryId && this.clinician() && this.day() ? this.editorFacility : '',
    };
  });
  protected readonly times = facilityQuery(
    this.timeScope,
    ({ token, facility, enquiryId, practitioner, day }) =>
      this.api.crmTimes(token, facility, enquiryId, practitioner, day),
  );
  protected readonly value = computed(() => {
    const result = this.data();
    return result.state === 'ready' ? result.data : undefined;
  });
  protected readonly clinicians = computed(() => {
    const edit = this.editor();
    return edit?.kind === 'book'
      ? (this.value()?.practitioners.filter((person) => person.specialty === edit.row.specialty) ??
          [])
      : [];
  });
  protected readonly rows = computed(() => {
    const q = this.search().trim().toLowerCase();
    return (
      this.value()?.enquiries.filter(
        (row) =>
          (!this.status() || row.status === this.status()) &&
          [row.patient.name, row.patient.id, row.specialty, row.source, row.assigneeName]
            .join(' ')
            .toLowerCase()
            .includes(q),
      ) ?? []
    );
  });
  protected readonly metrics = computed(() => {
    const rows = this.value()?.enquiries ?? [];
    return [
      { label: 'New enquiries', count: rows.filter((row) => row.status === 'New').length },
      {
        label: 'Follow-ups due',
        count: rows.filter(
          (row) => row.status === 'Assigned' && row.followUpOn && row.followUpOn <= this.today,
        ).length,
      },
      { label: 'Linked bookings', count: rows.filter((row) => row.status === 'Booked').length },
    ];
  });

  protected actions(row: EnquiryRow): (EnquiryAction | 'history')[] {
    const actions: (EnquiryAction | 'history')[] = [];
    if (row.status !== 'Booked' && row.status !== 'Closed' && this.store.writeAllowed('crm')) {
      if (this.canAssign()) actions.push('assign');
      if (row.assignee === this.store.session()?.account) {
        actions.push('contact');
        if (row.status === 'Contacted') actions.push('book');
      }
      actions.push('close');
    }
    if (row.attempts.length) actions.push('history');
    return actions;
  }

  protected open(dialog: HTMLDialogElement, editor: Editor) {
    this.editorFacility = this.scope().facility;
    this.error.set('');
    this.patientSearch.set('');
    this.editor.set(editor);
    this.form.reset({
      assignee: editor.kind === 'assign' ? (editor.row.assignee ?? '') : '',
      followUpOn:
        editor.kind === 'assign' && editor.row.followUpOn && editor.row.followUpOn >= this.today
          ? editor.row.followUpOn
          : this.today,
      day: this.today,
    });
    dialog.showModal();
  }

  protected async save(dialog: HTMLDialogElement) {
    const edit = this.editor();
    if (!edit || edit.kind === 'history' || this.busy()) return;
    const { token, facility } = this.scope();
    if (facility !== this.editorFacility) {
      this.error.set('The active facility changed. Open this form again.');
      return;
    }
    const fields = this.form.getRawValue();
    this.error.set('');
    this.notice.set('');
    this.busy.set(true);
    try {
      if (edit.kind === 'capture') {
        if (!fields.patientId || !fields.source || !fields.specialty) {
          this.error.set('Choose a patient, source and specialty.');
          return;
        }
        await this.api.captureEnquiry(token, facility, {
          patientId: fields.patientId,
          source: fields.source,
          specialty: fields.specialty,
        });
      } else {
        const change = this.updateFields(edit.kind, fields);
        if (!change) {
          this.error.set('Complete the required fields to continue.');
          return;
        }
        await this.api.updateEnquiry(token, facility, edit.row, change);
      }
      this.status.set('');
      if (edit.kind === 'capture') this.search.set('');
      this.notice.set(labels[edit.kind].notice);
      dialog.close();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  private updateFields(
    action: EnquiryAction,
    fields: ReturnType<typeof this.form.getRawValue>,
  ): EnquiryUpdate | undefined {
    switch (action) {
      case 'assign':
        return fields.assignee && fields.followUpOn
          ? { action, assignee: fields.assignee, followUpOn: fields.followUpOn }
          : undefined;
      case 'contact':
        return fields.outcome ? { action, outcome: fields.outcome } : undefined;
      case 'book':
        return fields.practitionerId && fields.day && fields.time
          ? { action, practitionerId: fields.practitionerId, day: fields.day, time: fields.time }
          : undefined;
      case 'close':
        return fields.reason ? { action, reason: fields.reason } : undefined;
    }
  }
}
