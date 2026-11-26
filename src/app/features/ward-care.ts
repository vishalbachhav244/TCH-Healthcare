import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { map } from 'rxjs';
import { Api, errorMessage } from '../core/api';
import { facilityQuery } from '../core/query';
import { SessionStore } from '../core/session';
import { StatusTone } from '../design-system/format';
import {
  observationKinds,
  observationResults,
  roundFocuses,
  roundSummaries,
  wardOrderCatalogue,
  type ObservationKind,
  type ObservationResult,
  type RoundFields,
  type WardDetail,
  type WardOrderKind,
  type WardOrderRow,
  type WardRecordVersion,
  type WardRole,
} from '../domain/ward-care';

type Editor = { context: WardRecordVersion } & (
  | { action: 'round' | 'order' | 'observation' }
  | { action: 'complete' | 'cancel'; order: WardOrderRow }
);

@Component({
  imports: [DatePipe, NgIcon, ReactiveFormsModule, RouterLink, StatusTone],
  templateUrl: './ward-care.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WardCare {
  private readonly api = inject(Api);
  private readonly route = inject(ActivatedRoute);
  private readonly forms = inject(NonNullableFormBuilder);
  protected readonly store = inject(SessionStore);
  protected readonly role = this.route.snapshot.data['resource'] as WardRole;
  protected readonly physician = this.role === 'inpatient-physician';
  protected readonly heading = this.physician ? 'Inpatient Physician' : 'Nursing Station';
  protected readonly admissionId = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('admission') ?? '')),
    {
      initialValue: this.route.snapshot.queryParamMap.get('admission') ?? '',
    },
  );
  protected readonly reload = signal(0);
  protected readonly notice = signal('');
  protected readonly error = signal('');
  protected readonly editorError = signal('');
  protected readonly busy = signal(false);
  protected readonly editor = signal<Editor | undefined>(undefined);
  protected readonly visible = signal(12);
  protected readonly search = this.forms.control('');
  protected readonly ward = this.forms.control('');
  protected readonly taskStatus = this.forms.control('');
  private readonly searchValue = toSignal(this.search.valueChanges, { initialValue: '' });
  private readonly wardValue = toSignal(this.ward.valueChanges, { initialValue: '' });
  private readonly taskStatusValue = toSignal(this.taskStatus.valueChanges, { initialValue: '' });
  protected readonly focuses = roundFocuses;
  protected readonly summaries = roundSummaries;
  protected readonly orderTypes = wardOrderCatalogue;
  protected readonly observationTypes = observationKinds;
  protected readonly results = observationResults;
  protected readonly round = this.forms.group({
    focus: this.forms.control<RoundFields['focus'] | ''>(''),
    summary: this.forms.control<RoundFields['summary'] | ''>(''),
  });
  protected readonly order = this.forms.control<WardOrderKind | ''>('');
  protected readonly observation = this.forms.control<ObservationKind | ''>('');
  protected readonly result = this.forms.control<ObservationResult | ''>('');
  private readonly scope = computed(() => ({
    token: this.store.session()?.token ?? '',
    facility: this.store.facility()?.id ?? '',
    reload: this.reload(),
  }));
  protected readonly worklist = facilityQuery(this.scope, ({ token, facility }) =>
    this.api.wardWorklist(token, facility, this.role),
  );
  private readonly detailParams = computed(() => ({
    ...this.scope(),
    facility: this.admissionId() ? this.scope().facility : '',
    admissionId: this.admissionId(),
  }));
  protected readonly detail = facilityQuery(this.detailParams, ({ token, facility, admissionId }) =>
    this.api.wardDetail(token, facility, this.role, admissionId),
  );
  protected readonly rows = computed(() => {
    const response = this.worklist();
    return response.state === 'ready' ? response.data : [];
  });
  protected readonly wards = computed(() => [...new Set(this.rows().map((row) => row.bed.ward))]);
  protected readonly openTasks = computed(() =>
    this.rows().reduce((total, row) => total + row.openTasks, 0),
  );
  protected readonly completedTasks = computed(() =>
    this.rows().reduce((total, row) => total + row.completedTasks, 0),
  );
  protected readonly filtered = computed(() => {
    const search = this.searchValue().trim().toLowerCase();
    const ward = this.wardValue();
    return this.rows().filter(
      (row) =>
        (!ward || row.bed.ward === ward) &&
        (!search ||
          [row.patient.id, row.patient.name, row.bed.label].some((value) =>
            value.toLowerCase().includes(search),
          )),
    );
  });
  protected readonly orders = computed(() => {
    const response = this.detail();
    return response.state === 'ready'
      ? response.data.orders.filter(
          (row) => !this.taskStatusValue() || row.task.status === this.taskStatusValue(),
        )
      : [];
  });
  protected readonly title = computed(() => {
    switch (this.editor()?.action) {
      case 'round':
        return 'Record physician round';
      case 'order':
        return 'Place ward order';
      case 'observation':
        return 'Record nursing observation';
      case 'complete':
        return 'Complete nursing task';
      case 'cancel':
        return 'Cancel ward order';
      default:
        return 'Ward care';
    }
  });

  protected open(
    dialog: HTMLDialogElement,
    detail: WardDetail,
    action: 'round' | 'order' | 'observation',
  ) {
    this.openEditor(dialog, { context: this.version(detail), action });
  }

  protected openTask(
    dialog: HTMLDialogElement,
    detail: WardDetail,
    order: WardOrderRow,
    action: 'complete' | 'cancel',
  ) {
    this.openEditor(dialog, { context: this.version(detail), order, action });
  }

  protected start(detail: WardDetail, order: WardOrderRow) {
    return this.save(
      (token, facility) =>
        this.api.updateWardTask(token, facility, this.version(detail), order.task, {
          action: 'start',
        }),
      'Task started.',
    );
  }

  protected async submit(dialog: HTMLDialogElement) {
    const editor = this.editor();
    if (!editor) return;
    const context = editor.context;
    let success = false;
    if (editor.action === 'round') {
      const { focus, summary } = this.round.getRawValue();
      if (!focus || !summary) return;
      success = await this.save(
        (token, facility) => this.api.recordWardRound(token, facility, context, { focus, summary }),
        'Physician round recorded.',
        true,
      );
    } else if (editor.action === 'order') {
      const kind = this.order.value;
      if (!kind) return;
      success = await this.save(
        (token, facility) => this.api.placeWardOrder(token, facility, context, kind),
        'Ward order placed and nursing task added.',
        true,
      );
    } else if (editor.action === 'observation') {
      const kind = this.observation.value;
      const result = this.result.value;
      if (!kind || !result) return;
      success = await this.save(
        (token, facility) =>
          this.api.recordWardObservation(token, facility, context, { kind, result }),
        'Nursing observation recorded.',
        true,
      );
    } else if (editor.action === 'complete') {
      const result = this.result.value;
      if (!result) return;
      success = await this.save(
        (token, facility) =>
          this.api.updateWardTask(token, facility, context, editor.order.task, {
            action: 'complete',
            result,
          }),
        'Task completed and observation recorded.',
        true,
      );
    } else if (editor.action === 'cancel') {
      success = await this.save(
        (token, facility) =>
          this.api.updateWardTask(token, facility, context, editor.order.task, {
            action: 'cancel',
          }),
        'Ward order cancelled.',
        true,
      );
    }
    if (success) dialog.close();
  }

  private openEditor(dialog: HTMLDialogElement, editor: Editor) {
    this.editor.set(editor);
    this.editorError.set('');
    this.round.reset();
    this.order.reset();
    this.observation.reset();
    this.result.reset();
    dialog.showModal();
  }

  private version(detail: WardDetail): WardRecordVersion {
    return {
      admissionId: detail.admission.id,
      admissionVersion: detail.admission.version,
      assignmentVersion: detail.team.version,
    };
  }

  private async save(
    command: (token: string, facility: string) => Promise<unknown>,
    notice: string,
    inEditor = false,
  ) {
    if (this.busy()) return false;
    const { token, facility } = this.scope();
    this.busy.set(true);
    this.notice.set('');
    this.error.set('');
    this.editorError.set('');
    try {
      await command(token, facility);
      this.notice.set(notice);
      return true;
    } catch (error) {
      (inEditor ? this.editorError : this.error).set(errorMessage(error));
      return false;
    } finally {
      this.busy.set(false);
    }
  }
}
