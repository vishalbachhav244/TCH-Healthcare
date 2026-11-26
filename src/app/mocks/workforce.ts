import type { StaffMembership } from '../domain/access';
import {
  dayInIndia,
  shiftDay,
  type DomainEvent,
  type Facility,
  type Session,
} from '../domain/operations';
import { shiftTimes, type StaffShift, type WorkforceData } from '../domain/workforce';
import { ApiError } from './access';
import { accountNames } from './accounts';
import { db } from './database';
import { checkedDay } from './queries';

function currentAssignment(shift: StaffShift, member: StaffMembership | undefined) {
  return (
    member?.active === true &&
    member.facilityId === shift.facilityId &&
    member.account === shift.account &&
    member.role === shift.role &&
    member.version === shift.membershipVersion
  );
}

export async function workforceData(facility: Facility, day: string): Promise<WorkforceData> {
  const [memberships, shifts] = await Promise.all([
    db.memberships.where('facilityId').equals(facility.id).toArray(),
    db.staffShifts.where('[facilityId+day]').equals([facility.id, day]).toArray(),
  ]);
  const members = new Map(memberships.map((member) => [member.id, member]));
  return {
    members: memberships
      .flatMap((member) => {
        const name = accountNames[member.account];
        if (!member.active || !name) return [];
        return [
          {
            id: member.id,
            account: member.account,
            name,
            role: member.role,
            version: member.version,
          },
        ];
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
    shifts: shifts
      .map((shift) => ({
        ...shift,
        assignmentCurrent: currentAssignment(shift, members.get(shift.membershipId)),
      }))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.name.localeCompare(b.name)),
  };
}

export async function workforceCommand(
  facility: Facility,
  session: Session,
  body: Record<string, unknown>,
  create: boolean,
): Promise<DomainEvent> {
  const now = Date.now();
  const today = dayInIndia(now);
  if (create) {
    const member =
      typeof body['membershipId'] === 'string'
        ? await db.memberships.get(body['membershipId'])
        : undefined;
    if (member?.facilityId !== facility.id || !member.active || !accountNames[member.account])
      throw new ApiError(404, 'This staff assignment is unavailable at the selected facility.');
    if (body['membershipVersion'] !== String(member.version))
      throw new ApiError(409, 'The staff assignment changed. Select it again.');
    if (typeof body['day'] !== 'string' || !body['day'])
      throw new ApiError(422, 'Choose the shift date.');
    const day = checkedDay(body['day']);
    const start = body['startsAt'];
    const end = body['endsAt'];
    if (
      day < today ||
      day > shiftDay(today, 90) ||
      typeof start !== 'string' ||
      typeof end !== 'string' ||
      !shiftTimes.includes(start) ||
      !shiftTimes.includes(end) ||
      start >= end
    )
      throw new ApiError(
        422,
        'Choose a shift within the next 90 days and an end time after the start.',
      );
    const clash = await db.staffShifts
      .where('[account+day]')
      .equals([member.account, day])
      .filter(
        (row) =>
          row.status !== 'Cancelled' &&
          row.status !== 'Absent' &&
          start < row.endsAt &&
          row.startsAt < end,
      )
      .first();
    if (clash) throw new ApiError(409, 'This staff member already has an overlapping shift.');
    const id = crypto.randomUUID();
    await db.staffShifts.add({
      id,
      facilityId: facility.id,
      membershipId: member.id,
      membershipVersion: member.version,
      account: member.account,
      name: accountNames[member.account],
      role: member.role,
      day,
      startsAt: start,
      endsAt: end,
      status: 'Scheduled',
      version: 1,
      changedAt: now,
      changedBy: session.account,
    });
    return {
      type: 'StaffShiftScheduled',
      entityId: id,
      facilityId: facility.id,
      occurredAt: now,
      actor: session.account,
    };
  }
  const shift =
    typeof body['shiftId'] === 'string' ? await db.staffShifts.get(body['shiftId']) : undefined;
  if (shift?.facilityId !== facility.id)
    throw new ApiError(404, 'Shift unavailable at this facility.');
  if (body['version'] !== String(shift.version))
    throw new ApiError(409, 'This shift changed. Reopen it and try again.');
  const action = body['action'];
  const next: Partial<StaffShift> = {
    changedAt: now,
    changedBy: session.account,
    version: shift.version + 1,
  };
  switch (action) {
    case 'check-in':
      if (shift.status !== 'Scheduled' || shift.day !== today)
        throw new ApiError(409, 'Check-in requires a scheduled shift for today.');
      if (!currentAssignment(shift, await db.memberships.get(shift.membershipId)))
        throw new ApiError(409, 'This shift needs a current staff assignment.');
      next.status = 'Checked in';
      next.checkedInAt = now;
      break;
    case 'check-out':
      if (shift.status !== 'Checked in' || shift.checkedInAt === undefined)
        throw new ApiError(409, 'Check in before recording check-out.');
      next.status = 'Completed';
      next.checkedOutAt = now;
      break;
    case 'absent':
      if (shift.status !== 'Scheduled' || shift.day > today)
        throw new ApiError(
          409,
          'Only a scheduled shift for today or earlier can be marked absent.',
        );
      next.status = 'Absent';
      break;
    case 'cancel':
      if (shift.status !== 'Scheduled')
        throw new ApiError(409, 'Only a scheduled shift can be cancelled.');
      next.status = 'Cancelled';
      break;
    default:
      throw new ApiError(422, 'Choose an attendance action.');
  }
  await db.staffShifts.update(shift.id, next);
  return {
    type: 'StaffAttendanceUpdated',
    entityId: shift.id,
    facilityId: facility.id,
    occurredAt: now,
    actor: session.account,
  };
}
