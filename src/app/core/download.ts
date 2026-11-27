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
