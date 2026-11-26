import { dayInIndia, shiftDay, type DomainEvent, type Session } from '../domain/operations';
import { plans, type SubscriptionRow } from '../domain/platform';
import { ApiError, requireSubscriptions } from './access';
import { db } from './database';

export async function subscriptions(session: Session): Promise<SubscriptionRow[]> {
  requireSubscriptions(session);
  const [organisations, facilities, baseline] = await Promise.all([
    db.organisations.orderBy('name').toArray(),
    db.facilities.toArray(),
    db.metadata.get('referenceDay'),
  ]);
  return organisations.map((organisation) => {
    const sites = facilities.filter((facility) => facility.tenantId === organisation.id);
    const offset =
      ([...organisation.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 26) - 8;
    return {
      organisation,
      facilities: sites.length,
      activeFacilities: sites.filter((site) => site.active !== false).length,
      inpatientFacilities: sites.filter((site) => site.inpatient).length,
      nextReview: organisation.reviewedOn
        ? shiftDay(organisation.reviewedOn, 30)
        : shiftDay(baseline?.value ?? dayInIndia(), offset),
    };
  });
}

export async function updateSubscription(body: unknown, session: Session) {
  requireSubscriptions(session);
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new ApiError(422, 'Invalid subscription request.');
  const fields = body as Record<string, unknown>;
  return db.transaction('rw', [db.organisations, db.facilities, db.events], async () => {
    const id = fields['organisationId'];
    const organisation = typeof id === 'string' ? await db.organisations.get(id) : undefined;
    if (!organisation) throw new ApiError(404, 'Organization not found.');
    const version = organisation.subscriptionVersion ?? 0;
    if (String(version) !== fields['version'])
      throw new ApiError(409, 'This subscription has changed. Refresh before saving.');
    const action = fields['action'];
    if (action !== 'review' && action !== 'plan')
      throw new ApiError(422, 'Select a subscription action.');
    const update: Partial<typeof organisation> = { subscriptionVersion: version + 1 };
    if (action === 'review') update.reviewedOn = dayInIndia();
    else {
      const plan = plans.find((item) => item === fields['plan']);
      if (!plan) throw new ApiError(422, 'Select a subscription plan.');
      if (plan === organisation.plan) throw new ApiError(409, 'This plan is already assigned.');
      if (
        plan === 'Clinic' &&
        (await db.facilities
          .where('tenantId')
          .equals(organisation.id)
          .filter((facility) => facility.inpatient)
          .first())
      ) {
        throw new ApiError(
          409,
          'Disable inpatient operations at this organization’s facilities before moving to the Clinic plan.',
        );
      }
      update.plan = plan;
    }
    await db.organisations.update(organisation.id, update);
    const event: DomainEvent = {
      type: action === 'review' ? 'SubscriptionReviewed' : 'SubscriptionPlanChanged',
      facilityId: 'platform',
      entityId: organisation.id,
      actor: session.account,
      occurredAt: Date.now(),
    };
    await db.events.add({ ...event, id: crypto.randomUUID() });
    return { id: organisation.id, event };
  });
}
