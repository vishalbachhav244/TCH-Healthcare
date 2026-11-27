import type { DocumentFile, DocumentFixture, DocumentSample } from '../domain/patient-documents';

const referralBody = [
  'Synthetic referral for a scheduled specialist visit.',
  'The referral identifies General Medicine as the requested service.',
  'Generated for the TrueCare evaluation workspace.',
];
const preparationBody = [
  'Synthetic attachment for the next appointment.',
  'Bring any documents requested on the appointment confirmation.',
  'Generated for the TrueCare evaluation workspace.',
];

function pdf(title: string, lines: readonly string[]) {
  const stream = [
    'BT /F1 20 Tf 53 730 Td (' + title + ') Tj /F1 11 Tf',
    ...lines.map((line) => '0 -25 Td (' + line.replace(/[()\\]/g, '\\$&') + ') Tj'),
    'ET',
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream',
  ];
  let content = '%PDF-1.4\n';
  const offsets = objects.map((object, index) => {
    const offset = content.length;
    content += index + 1 + ' 0 obj\n' + object + '\nendobj\n';
    return String(offset).padStart(10, '0') + ' 00000 n ';
  });
  const start = content.length;
  return btoa(
    content +
      [
        'xref',
        '0 ' + (objects.length + 1),
        '0000000000 65535 f ',
        ...offsets,
        'trailer',
        '<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>',
        'startxref',
        String(start),
        '%%EOF',
        '',
      ].join('\n'),
  );
}

function base64(text: string) {
  return btoa(
    Array.from(new TextEncoder().encode(text), (byte) => String.fromCharCode(byte)).join(''),
  );
}

export function textDocument(
  title: string,
  filename: string,
  body: readonly string[],
): DocumentFile {
  return { filename, format: 'TXT', data: base64([title, '', ...body, ''].join('\n')) };
}

interface DocumentFixtureData {
  sample: DocumentSample;
  body: readonly string[];
}

export const documentFixtures: Record<DocumentFixture, DocumentFixtureData> = {
  'synthetic-referral-v1': {
    sample: {
      title: 'Sample referral',
      filename: 'truecare-sample-referral.pdf',
      format: 'PDF',
      data: pdf('Sample referral', referralBody),
    },
    body: referralBody,
  },
  'synthetic-visit-preparation-v1': {
    sample: {
      title: 'Sample visit preparation',
      ...textDocument(
        'Sample visit preparation',
        'truecare-sample-visit-preparation.txt',
        preparationBody,
      ),
    },
    body: preparationBody,
  },
};
