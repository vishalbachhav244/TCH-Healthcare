import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { Api, errorMessage } from '../core/api';
import { facilityQuery } from '../core/query';
import { SessionStore } from '../core/session';
import { StatusTone } from '../design-system/format';
import { staffRoles } from '../domain/access';
import { dayInIndia, shiftDay } from '../domain/operations';
import { shiftStatuses, shiftTimes, type ShiftAction, type ShiftRow } from '../domain/workforce';

type View = 'roster' | 'staff';
type Editor = { kind: 'schedule' } | { kind: ShiftAction; row: ShiftRow };
const attendance = {
  'check-in': { label: 'Check in', confirm: 'Confirm check-in', notice: 'Check-in recorded.' },
  'check-out': { label: 'Check out', confirm: 'Confirm check-out', notice: 'Shift completed.' },
  absent: { label: 'Mark absent', confirm: 'Confirm absence', notice: 'Absence recorded.' },
  cancel: { label: 'Cancel shift', confirm: 'Confirm cancellation', notice: 'Shift cancelled.' },
};

@Component({
  imports: [DatePipe, ReactiveFormsModule, NgIcon, StatusTone],
  templateUrl: './workforce.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Workforce {
  private readonly api = inject(Api);
  protected readonly store = inject(SessionStore);
  protected readonly today = dayInIndia();
  protected readonly lastDay = shiftDay(this.today, 90);
  protected readonly day = signal(this.today);
  protected readonly view = signal<View>('roster');
  protected readonly search = signal('');
  protected readonly status = signal('');
  protected readonly limit = signal(12);
  protected readonly reload = signal(0);
  protected readonly notice = signal('');
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly editor = signal<Editor | undefined>(undefined);
  protected readonly roles = staffRoles;
  protected readonly statuses = shiftStatuses;
  protected readonly startTimes = shiftTimes.slice(0, -1);
  protected readonly endTimes = shiftTimes.slice(1);
  protected readonly attendance = attendance;
  protected readonly form = inject(NonNullableFormBuilder).group({
    membershipId: [''],
    day: [this.today],
    startsAt: ['08:00'],
    endsAt: ['16:00'],
  });
  private readonly scope = computed(() => ({
    token: this.store.session()?.token ?? '',
    facility: this.store.facility()?.id ?? '',
    day: this.day(),
    reload: this.reload(),
  }));
  protected readonly data = facilityQuery(this.scope, ({ token, facility, day }) =>
    this.api.workforce(token, facility, day),
  );
  protected readonly value = computed(() => {
    const result = this.data();
    return result.state === 'ready' ? result.data : undefined;
  });
  protected readonly metrics = computed(() =>
    ['Scheduled', 'Checked in', 'Completed'].map((label) => ({
      label,
      count: this.value()?.shifts.filter((shift) => shift.status === label).length ?? 0,
    })),
  );
  protected readonly shifts = computed(
    () =>
      this.value()?.shifts.filter(
        (shift) =>
          this.matches(shift.name, this.roles[shift.role].label) &&
          (!this.status() || this.status() === shift.status),
      ) ?? [],
  );
  protected readonly members = computed(
    () =>
      this.value()?.members.filter((member) =>
        this.matches(member.name, this.roles[member.role].label),
      ) ?? [],
  );

  protected show(view: View) {
    this.view.set(view);
    this.search.set('');
    this.status.set('');
    this.limit.set(12);
  }

  protected actions(shift: ShiftRow): ShiftAction[] {
    if (shift.status === 'Checked in') return ['check-out'];
    if (shift.status !== 'Scheduled') return [];
    const actions: ShiftAction[] = [];
    if (shift.day === this.today && shift.assignmentCurrent) actions.push('check-in');
    if (shift.day <= this.today) actions.push('absent');
    actions.push('cancel');
    return actions;
  }

  protected open(dialog: HTMLDialogElement, edit: Editor) {
    this.error.set('');
    this.editor.set(edit);
    this.form.reset({
      membershipId: '',
      day: this.day() >= this.today && this.day() <= this.lastDay ? this.day() : this.today,
      startsAt: '08:00',
      endsAt: '16:00',
    });
    dialog.showModal();
  }

  protected async save(dialog: HTMLDialogElement) {
    const edit = this.editor();
    if (!edit || this.busy()) return;
    this.error.set('');
    this.notice.set('');
    this.busy.set(true);
    const { token, facility } = this.scope();
    try {
      if (edit.kind === 'schedule') {
        const fields = this.form.getRawValue();
        const member = this.value()?.members.find((item) => item.id === fields.membershipId);
        if (!member || !fields.day || fields.startsAt >= fields.endsAt) {
          this.error.set('Choose an active staff member, a date and an end time after the start.');
          return;
        }
        await this.api.scheduleShift(token, facility, {
          ...fields,
          membershipVersion: member.version,
        });
        this.day.set(fields.day);
        this.show('roster');
        this.notice.set('Shift added to the roster.');
      } else {
        await this.api.recordAttendance(token, facility, edit.row, edit.kind);
        this.notice.set(attendance[edit.kind].notice);
      }
      dialog.close();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  private matches(name: string, role: string) {
    return (name + ' ' + role).toLowerCase().includes(this.search().trim().toLowerCase());
  }
}
