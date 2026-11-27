import {
  campaignTemplates,
  engagementChannels,
  enquirySources,
  enquiryStatus,
  type ContactPreferences,
  type MarketingData,
} from '../domain/engagement';
import type { DomainEvent, Facility, Session } from '../domain/operations';
import { ApiError, patientSubject } from './access';
import { patientAt } from './admission-records';
import { enquiryBookings } from './crm';
import { db } from './database';

export async function contactPreferences(
  facility: Facility,
  session: Session,
): Promise<ContactPreferences> {
  const patientId = patientSubject(session);
  await patientAt(facility, patientId);
  const current = await db.engagementPermissions.get(facility.id + ':' + patientId);
  if (!current || current.patientId !== patientId || current.facilityId !== facility.id)
    return { email: false, sms: false, version: 0 };
  const { email, sms, version } = current;
  return { email, sms, version };
}

export async function updateContactPreferences(
  facility: Facility,
  session: Session,
  body: Record<string, unknown>,
): Promise<DomainEvent> {
  const patientId = patientSubject(session);
  const current = await contactPreferences(facility, session);
  if (body['version'] !== String(current.version))
    throw new ApiError(
      409,
      'Your preferences changed in another tab. Review the current settings.',
    );
  const email = body['email'];
  const sms = body['sms'];
  if ((email !== 'true' && email !== 'false') || (sms !== 'true' && sms !== 'false'))
    throw new ApiError(422, 'Choose a preference for each channel.');
  const id = facility.id + ':' + patientId;
  const now = Date.now();
  await db.engagementPermissions.put({
    id,
    facilityId: facility.id,
    patientId,
    email: email === 'true',
    sms: sms === 'true',
    version: current.version + 1,
    changedAt: now,
  });
  return {
    type: 'ContactPreferencesChanged',
    entityId: id,
    facilityId: facility.id,
    occurredAt: now,
    actor: session.account,
  };
}

async function audienceCounts(facility: Facility) {
  const permissions = await db.engagementPermissions
    .where('facilityId')
    .equals(facility.id)
    .filter((row) => row.email || row.sms)
    .toArray();
  const patients = await db.patients.bulkGet(permissions.map((row) => row.patientId));
  const counts = { Email: 0, SMS: 0 };
  permissions.forEach((row, index) => {
    if (
      patients[index]?.tenantId !== facility.tenantId ||
      row.id !== facility.id + ':' + row.patientId
    )
      return;
    if (row.email) counts.Email++;
    if (row.sms) counts.SMS++;
  });
  return counts;
}

export async function marketingData(facility: Facility): Promise<MarketingData> {
  const [campaigns, records, audience] = await Promise.all([
    db.campaigns.where('facilityId').equals(facility.id).toArray(),
    db.enquiries.where('facilityId').equals(facility.id).toArray(),
    audienceCounts(facility),
  ]);
  const [patients, bookings] = await Promise.all([
    db.patients.bulkGet(records.map((record) => record.patientId)),
    enquiryBookings(records),
  ]);
  const conversions = enquirySources.map((source) => ({ source, enquiries: 0, bookings: 0 }));
  records.forEach((record, index) => {
    if (patients[index]?.tenantId !== facility.tenantId) return;
    const row = conversions.find((item) => item.source === record.source);
    if (!row) return;
    row.enquiries++;
    if (enquiryStatus(record, bookings[index]) === 'Booked') row.bookings++;
  });
  return { campaigns: campaigns.sort((a, b) => b.changedAt - a.changedAt), conversions, audience };
}

export async function campaignCommand(
  facility: Facility,
  session: Session,
  body: Record<string, unknown>,
  create: boolean,
): Promise<DomainEvent> {
  const now = Date.now();
  const event = (type: DomainEvent['type'], entityId: string) => ({
    type,
    entityId,
    facilityId: facility.id,
    occurredAt: now,
    actor: session.account,
  });
  if (create) {
    const channel = engagementChannels.find((value) => value === body['channel']);
    const template = campaignTemplates.find((value) => value === body['template']);
    if (!channel || !template) throw new ApiError(422, 'Choose a campaign template and channel.');
    const id = crypto.randomUUID();
    await db.campaigns.add({
      id,
      facilityId: facility.id,
      channel,
      template,
      status: 'Draft',
      version: 1,
      createdAt: now,
      changedAt: now,
    });
    return event('CampaignDrafted', id);
  }
  const campaign =
    typeof body['campaignId'] === 'string' ? await db.campaigns.get(body['campaignId']) : undefined;
  if (campaign?.facilityId !== facility.id)
    throw new ApiError(404, 'Campaign unavailable at this facility.');
  if (campaign.status !== 'Draft' || body['version'] !== String(campaign.version))
    throw new ApiError(409, 'This campaign is no longer the current draft.');
  const action = body['action'];
  const next = { version: campaign.version + 1, changedAt: now };
  if (action === 'cancel') {
    await db.campaigns.update(campaign.id, { ...next, status: 'Cancelled' });
  } else if (action === 'simulate') {
    const count = (await audienceCounts(facility))[campaign.channel];
    if (!count) throw new ApiError(409, 'No patients currently allow this channel.');
    await db.campaigns.update(campaign.id, { ...next, status: 'Simulated', simulatedCount: count });
  } else throw new ApiError(422, 'Choose a campaign action.');
  return event('CampaignUpdated', campaign.id);
}
