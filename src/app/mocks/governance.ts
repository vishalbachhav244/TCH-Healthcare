import type { LabOrder } from '../domain/diagnostics';
import {
  dispositions,
  qualityCategories,
  qualityPriorities,
  type GovernanceData,
  type GovernanceItem,
  type QualityCase,
  type QualityView,
} from '../domain/governance';
import { shiftDay, type DomainEvent, type Facility, type Session } from '../domain/operations';
import { ApiError } from './access';
import { db } from './database';
import { checkedDay } from './queries';

function flagged(report: LabOrder) {
  return (
    report.status === 'Published' &&
    report.finding === 'Result flagged for clinician review' &&
    !!report.accession &&
    !!report.authorisedBy
  );
}

export async function clinicalGovernance(
  facility: Facility,
  params: URLSearchParams,
): Promise<GovernanceData> {
  const day = checkedDay(params.get('day'));
  const from = Date.parse(shiftDay(day, -6) + 'T00:00:00+05:30');
  const before = Date.parse(shiftDay(day, 1) + 'T00:00:00+05:30');
  const inPeriod = (time: number) => time >= from && time < before;
  const [encounters, reports] = await Promise.all([
    db.encounters
      .where('facilityId')
      .equals(facility.id)
      .filter((row) => inPeriod(row.startedAt))
      .toArray(),
    db.labOrders
      .where('facilityId')
      .equals(facility.id)
      .filter((row) => flagged(row) && inPeriod(row.changedAt))
      .toArray(),
  ]);
  reports.sort((a, b) => b.changedAt - a.changedAt);
  const reviews = await db.clinicalReviews.bulkGet(reports.map((report) => report.id));
  const requestedStatus = params.get('status');
  const items = reports.flatMap((report, i): (GovernanceItem & { caseId?: string })[] => {
    const review = reviews[i];
    if (requestedStatus && (review?.status ?? 'Needs review') !== requestedStatus) return [];
    if (!report.accession || !report.finding) return [];
    return [
      {
        id: report.id,
        accession: report.accession,
        test: report.test,
        finding: report.finding,
        publishedAt: report.changedAt,
        version: report.version,
        review: review?.status,
        caseId: review?.caseId,
      },
    ];
  });
  const offset = Math.max(0, Math.floor(Number(params.get('offset')) || 0));
  const page = items.slice(offset, offset + 12);
  const linkedCases = await db.qualityCases.bulkGet(
    page.flatMap((row) => (row.caseId ? [row.caseId] : [])),
  );
  const cases = new Map(
    linkedCases.flatMap((item) =>
      item?.facilityId === facility.id ? [[item.id, item.status] as const] : [],
    ),
  );
  return {
    encounters: encounters.length,
    signedNotes: encounters.filter((row) => row.signedAt !== undefined).length,
    flaggedReports: reports.length,
    pendingReviews: reviews.filter((record) => !record).length,
    total: items.length,
    items: page.map(({ caseId, ...item }) => ({
      ...item,
      caseStatus: caseId ? cases.get(caseId) : undefined,
    })),
  };
}

export async function qualityRegister(
  facility: Facility,
  session: Session,
): Promise<QualityView[]> {
  const rows = await db.qualityCases.where('facilityId').equals(facility.id).toArray();
  return rows
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(({ facilityId: _facility, owner, ...row }) => ({
      ...row,
      ownedByCurrentUser: owner === session.account,
    }));
}

function openCase(
  facility: Facility,
  session: Session,
  fields: Pick<QualityCase, 'title' | 'category' | 'priority' | 'origin'>,
  now: number,
) {
  const id = crypto.randomUUID();
  return db.qualityCases.add({
    id,
    facilityId: facility.id,
    ...fields,
    status: 'Open',
    version: 1,
    createdAt: now,
    timeline: [{ status: 'Open', at: now, actor: session.account }],
  });
}

export async function governanceCommand(
  path: string,
  facility: Facility,
  session: Session,
  body: Record<string, unknown>,
): Promise<DomainEvent> {
  const now = Date.now();
  function event(type: DomainEvent['type'], entityId: string): DomainEvent {
    return { type, entityId, facilityId: facility.id, occurredAt: now, actor: session.account };
  }
  if (path === 'clinical-governance/reviews') {
    const reportId = body['reportId'];
    const report = typeof reportId === 'string' ? await db.labOrders.get(reportId) : undefined;
    if (!report || report.facilityId !== facility.id || !flagged(report))
      throw new ApiError(404, 'An eligible report was not found.');
    if (String(report.version) !== body['version'])
      throw new ApiError(409, 'This report changed. Reload before recording a review.');
    if (await db.clinicalReviews.get(report.id))
      throw new ApiError(409, 'This report has already been reviewed.');
    const action = body['action'];
    if (action !== 'acknowledge' && action !== 'refer')
      throw new ApiError(422, 'Choose a review outcome.');
    const encounter = await db.encounters.get(report.encounterId);
    if (encounter?.facilityId !== facility.id || encounter.patientId !== report.patientId) {
      throw new ApiError(409, 'The source encounter could not be verified.');
    }
    const caseId =
      action === 'refer'
        ? await openCase(
            facility,
            session,
            {
              title: 'Review diagnostic follow-up',
              category: 'Diagnostic follow-up',
              priority: 'Elevated',
              origin: 'Clinical referral',
            },
            now,
          )
        : undefined;
    await db.clinicalReviews.add({
      reportId: report.id,
      facilityId: facility.id,
      status: caseId ? 'Referred' : 'Acknowledged',
      reviewedAt: now,
      reviewer: session.account,
      caseId,
    });
    return event(caseId ? 'QualityCaseOpened' : 'ClinicalReviewRecorded', caseId ?? report.id);
  }
  if (path === 'quality/cases') {
    const title = typeof body['title'] === 'string' ? body['title'].trim() : '';
    const category = qualityCategories.find((value) => value === body['category']);
    const priority = qualityPriorities.find((value) => value === body['priority']);
    if (title.length < 4 || title.length > 100 || !category || !priority)
      throw new ApiError(422, 'Enter a title, category and priority.');
    const id = await openCase(
      facility,
      session,
      { title, category, priority, origin: 'Facility report' },
      now,
    );
    return event('QualityCaseOpened', id);
  }
  const id = body['caseId'];
  const item = typeof id === 'string' ? await db.qualityCases.get(id) : undefined;
  if (item?.facilityId !== facility.id) throw new ApiError(404, 'Quality case not found.');
  if (String(item.version) !== body['version'])
    throw new ApiError(409, 'This case changed. Reload and try again.');
  if (body['action'] === 'claim' && item.status === 'Open') {
    await db.qualityCases.update(item.id, {
      status: 'Investigating',
      owner: session.account,
      version: item.version + 1,
      timeline: [...item.timeline, { status: 'Investigating', at: now, actor: session.account }],
    });
    return event('QualityCaseClaimed', item.id);
  }
  if (body['action'] === 'resolve' && item.status === 'Investigating') {
    if (item.owner !== session.account)
      throw new ApiError(403, 'Only the assigned coordinator can resolve this case.');
    const disposition = dispositions.find((value) => value === body['disposition']);
    if (!disposition) throw new ApiError(422, 'Select a resolution.');
    await db.qualityCases.update(item.id, {
      status: 'Resolved',
      version: item.version + 1,
      timeline: [
        ...item.timeline,
        { status: 'Resolved', at: now, actor: session.account, disposition },
      ],
    });
    return event('QualityCaseResolved', item.id);
  }
  throw new ApiError(409, 'This action is unavailable for the current case status.');
}
