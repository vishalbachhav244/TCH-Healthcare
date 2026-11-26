import { Subject } from 'rxjs';
import type { DomainEvent } from '../domain/operations';

// Broadcast only invalidation metadata. Typed audit payloads stay in the data adapter.
const invalidations = new Subject<string>();
const configurations = new Subject<string>();
const channel =
  typeof BroadcastChannel === 'undefined'
    ? undefined
    : new BroadcastChannel('truecare-evaluation-updates');
if (channel)
  channel.onmessage = (message: MessageEvent<unknown>) => {
    const data = message.data;
    if (
      !data ||
      typeof data !== 'object' ||
      !('facilityId' in data) ||
      typeof data.facilityId !== 'string'
    )
      return;
    invalidations.next(data.facilityId);
    if ('configuration' in data && data.configuration === true)
      configurations.next(data.facilityId);
  };

export const facilityChanges = invalidations.asObservable();
export const configurationChanges = configurations.asObservable();
export function notifyFacility(event: DomainEvent) {
  const configuration = event.type === 'ModuleConfigurationChanged';
  channel?.postMessage({ facilityId: event.facilityId, configuration });
  invalidations.next(event.facilityId);
  if (configuration) configurations.next(event.facilityId);
}
