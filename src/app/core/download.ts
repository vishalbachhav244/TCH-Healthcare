import type { DocumentFile } from '../domain/patient-documents';

export function downloadCsv(filename: string, content: string) {
  downloadBlob(filename, new Blob([content], { type: 'text/csv' }));
}

export function downloadBlob(filename: string, content: Blob) {
  const url = URL.createObjectURL(content);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadDocument(file: DocumentFile) {
  const bytes = Uint8Array.from(atob(file.data), (character) => character.charCodeAt(0));
  const type = file.format === 'PDF' ? 'application/pdf' : 'text/plain';
  downloadBlob(file.filename, new Blob([bytes], { type }));
}
