import type { QualityCase } from '../domain/governance';

export function initialQualityCases(day: string): QualityCase[] {
  const opened = Date.parse(day + 'T08:30:00+05:30');
  return [
    {
      id: 'quality-handover-12',
      facilityId: 'mer-central',
      title: 'Review the outpatient handover checklist',
      category: 'Service process',
      origin: 'Facility report',
      priority: 'Routine',
      status: 'Open',
      version: 1,
      createdAt: opened,
      timeline: [{ status: 'Open', at: opened, actor: 'quality' }],
    },
    {
      id: 'quality-notes-19',
      facilityId: 'mer-central',
      title: 'Document completion review',
      category: 'Documentation',
      origin: 'Facility report',
      priority: 'Routine',
      status: 'Resolved',
      version: 3,
      createdAt: opened - 86_400_000,
      owner: 'quality',
      timeline: [
        { status: 'Open', at: opened - 86_400_000, actor: 'quality' },
        { status: 'Investigating', at: opened - 43_200_000, actor: 'quality' },
        { status: 'Resolved', at: opened, actor: 'quality', disposition: 'Policy reviewed' },
      ],
    },
  ];
}
