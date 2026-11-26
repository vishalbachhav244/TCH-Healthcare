import { Pipe, type PipeTransform } from '@angular/core';

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});
const wholeInr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

@Pipe({ name: 'rupees' })
export class Rupees implements PipeTransform {
  transform(minor: number, exact = true) {
    return (exact ? inr : wholeInr).format(minor / 100);
  }
}

@Pipe({ name: 'statusTone' })
export class StatusTone implements PipeTransform {
  transform(status: string) {
    if (status === 'Enabled') return 'status positive';
    if (
      [
        'Paid',
        'Completed',
        'Available',
        'Acknowledged',
        'Published',
        'Discharged',
        'Issued',
      ].includes(status)
    )
      return 'status positive';
    if (
      [
        'In consultation',
        'Called',
        'Occupied',
        'Information',
        'Collected',
        'Authorised',
        'Admitted',
        'Scheduled',
        'Reserved',
      ].includes(status)
    )
      return 'status information';
    if (
      [
        'Waiting',
        'Checked in',
        'Cleaning',
        'Attention',
        'Outstanding',
        'Ordered',
        'Processing',
        'Requested',
        'Acquired',
        'Report ready',
      ].includes(status)
    )
      return 'status attention';
    if (['Priority', 'Maintenance', 'Cancelled', 'Declined', 'Expired'].includes(status))
      return 'status priority';
    return 'status';
  }
}
