import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { Api, errorMessage } from '../core/api';
import { facilityQuery } from '../core/query';
import { SessionStore } from '../core/session';
import { StatusTone } from '../design-system/format';
import type { DocumentSummary } from '../domain/patient-documents';

type Action = { kind: 'release' } | { kind: 'withdraw'; record: DocumentSummary };

@Component({
  selector: 'tc-clinical-visit-documents',
  imports: [NgIcon, StatusTone],
  template: `
    <section class="clinical-orders fields" aria-labelledby="visit-documents-heading">
      <h3 id="visit-documents-heading">Visit documents</h3>
      @if (notice()) {
        <p class="inline-notice success" role="status">{{ notice() }}</p>
      }
      @let state = data();
      @if (state.state === 'loading') {
        <p role="status">Loading visit documents…</p>
      } @else if (state.state === 'error') {
        <p role="alert">{{ state.message }}</p>
        <button type="button" class="button secondary" (click)="reload.set(reload() + 1)">
          Retry
        </button>
      } @else {
        @for (record of state.data; track record.id) {
          <div class="page-actions">
            <span>{{ record.title }}</span>
            <span [class]="record.status | statusTone">{{
              record.status === 'Available' ? 'Released' : record.status
            }}</span>
            @if (record.status === 'Available') {
              <button
                type="button"
                class="text-button"
                (click)="open(editor, { kind: 'withdraw', record })"
              >
                Withdraw attendance note
              </button>
            }
          </div>
        } @empty {
          <p class="subtle">No documents have been released for this visit.</p>
        }
        @if (!hasActive()) {
          <button
            type="button"
            class="button secondary"
            (click)="open(editor, { kind: 'release' })"
          >
            Release attendance note
          </button>
        }
      }
    </section>
    <dialog #editor aria-labelledby="visit-document-editor" (close)="action.set(undefined)">
      <div class="dialog-head">
        <h2 id="visit-document-editor">
          {{
            action()?.kind === 'withdraw' ? 'Withdraw attendance note' : 'Release attendance note'
          }}
        </h2>
        <button class="icon-button" type="button" aria-label="Close" (click)="editor.close()">
          <ng-icon name="close" />
        </button>
      </div>
      <form class="dialog-body fields" (submit)="$event.preventDefault(); save(editor)">
        @if (action()?.kind === 'withdraw') {
          <p>The patient and any recipient will lose access to this version.</p>
        } @else {
          <p>
            The attendance note lists the signed visit date, specialty and clinician. The patient
            can open it in Documents.
          </p>
        }
        @if (error()) {
          <p class="field-error" role="alert">{{ error() }}</p>
        }
        <button class="button primary" type="submit" [disabled]="busy()">
          {{ action()?.kind === 'withdraw' ? 'Confirm withdrawal' : 'Confirm release' }}
        </button>
      </form>
    </dialog>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClinicalVisitDocuments {
  readonly encounterId = input.required<string>();
  private readonly api = inject(Api);
  private readonly store = inject(SessionStore);
  protected readonly action = signal<Action | undefined>(undefined);
  protected readonly notice = signal('');
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly reload = signal(0);
  private readonly scope = computed(() => ({
    token: this.store.session()?.token ?? '',
    facility: this.store.facility()?.id ?? '',
    encounterId: this.encounterId(),
    reload: this.reload(),
  }));
  protected readonly data = facilityQuery(this.scope, ({ token, facility, encounterId }) =>
    this.api.clinicalDocuments(token, facility, encounterId),
  );
  protected readonly hasActive = computed(() => {
    const state = this.data();
    return state.state === 'ready' && state.data.some((row) => row.status === 'Available');
  });

  protected open(dialog: HTMLDialogElement, action: Action) {
    this.error.set('');
    this.action.set(action);
    dialog.showModal();
  }

  protected async save(dialog: HTMLDialogElement) {
    const action = this.action();
    if (!action || this.busy()) return;
    const { token, facility, encounterId } = this.scope();
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      if (action.kind === 'release') {
        await this.api.releaseVisitDocument(token, facility, encounterId);
        this.notice.set('Attendance note released.');
      } else {
        await this.api.withdrawDocument(token, facility, 'clinical', action.record);
        this.notice.set('Attendance note withdrawn.');
      }
      dialog.close();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
