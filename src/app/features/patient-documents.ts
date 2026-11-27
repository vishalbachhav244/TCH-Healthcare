import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { Api, errorMessage } from '../core/api';
import { downloadDocument } from '../core/download';
import { facilityQuery } from '../core/query';
import { SessionStore } from '../core/session';
import { StatusTone } from '../design-system/format';
import type { DocumentDetail, DocumentFile, DocumentSummary } from '../domain/patient-documents';

type Editor = { kind: 'upload' } | { kind: 'withdraw'; record: DocumentSummary };

@Component({
  selector: 'tc-patient-documents',
  imports: [DatePipe, NgIcon, StatusTone],
  templateUrl: './patient-documents.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatientDocumentLibrary {
  private readonly api = inject(Api);
  private readonly store = inject(SessionStore);
  private editorFacility = '';
  protected readonly filter = signal('');
  protected readonly reload = signal(0);
  protected readonly more = signal(10);
  protected readonly busy = signal(false);
  protected readonly status = signal('');
  protected readonly error = signal('');
  protected readonly dialogError = signal('');
  protected readonly editor = signal<Editor | undefined>(undefined);
  protected readonly viewed = signal<DocumentDetail | undefined>(undefined);
  private readonly scope = computed(() => ({
    token: this.store.session()?.token ?? '',
    facility: this.store.facility()?.id ?? '',
    reload: this.reload(),
  }));
  protected readonly data = facilityQuery(this.scope, ({ token, facility }) =>
    this.api.patientDocuments(token, facility),
  );
  protected readonly records = computed(() => {
    const data = this.data();
    return data.state === 'ready'
      ? data.data.documents.filter((row) => !this.filter() || row.status === this.filter())
      : [];
  });

  constructor() {
    effect(() => {
      const viewed = this.viewed();
      const data = this.data();
      if (
        viewed &&
        (data.state === 'error' ||
          (data.state === 'ready' &&
            !data.data.documents.some(
              (row) =>
                row.id === viewed.id &&
                row.status === 'Available' &&
                row.version === viewed.version,
            )))
      )
        this.viewed.set(undefined);
    });
  }

  protected open(dialog: HTMLDialogElement, editor: Editor) {
    this.editorFacility = this.scope().facility;
    this.dialogError.set('');
    this.editor.set(editor);
    dialog.showModal();
  }

  protected async save(dialog: HTMLDialogElement, file?: File) {
    const editor = this.editor();
    if (!editor || this.busy()) return;
    const { token, facility } = this.scope();
    if (facility !== this.editorFacility) {
      this.dialogError.set('The active facility changed. Open this form again.');
      return;
    }
    this.status.set('');
    this.dialogError.set('');
    this.busy.set(true);
    try {
      if (editor.kind === 'withdraw') {
        await this.api.withdrawDocument(token, facility, 'portal', editor.record);
        this.status.set('Document withdrawn.');
      } else {
        const suffix = file?.name.split('.').at(-1)?.toLowerCase();
        if (
          !file ||
          !file.size ||
          file.size > 64 * 1024 ||
          (suffix !== 'pdf' && suffix !== 'txt')
        ) {
          this.dialogError.set('Choose a TrueCare PDF or TXT sample under 64 KB.');
          return;
        }
        const bytes = new Uint8Array(await file.arrayBuffer());
        const data = btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));
        await this.api.uploadPatientDocument(
          token,
          facility,
          suffix === 'pdf' ? 'PDF' : 'TXT',
          data,
        );
        this.status.set('Sample document uploaded.');
        this.filter.set('');
      }
      dialog.close();
    } catch (error) {
      this.dialogError.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected async view(dialog: HTMLDialogElement, record: DocumentSummary) {
    if (this.busy()) return;
    const { token, facility } = this.scope();
    this.error.set('');
    this.busy.set(true);
    try {
      const detail = await this.api.portalDocument(token, facility, record);
      this.viewed.set(detail);
      dialog.showModal();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected download(file: DocumentFile) {
    downloadDocument(file);
  }
}
