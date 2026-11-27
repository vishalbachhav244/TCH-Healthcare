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
    if ('exchange' in data && data.exchange === true) invalidations.next('integrations');
    if ('configuration' in data && data.configuration === true) {
      if (data.facilityId !== 'platform') invalidations.next('platform');
      configurations.next(data.facilityId);
    }
  };

export const facilityChanges = invalidations.asObservable();
export const configurationChanges = configurations.asObservable();
export function notifyFacility(event: DomainEvent) {
  const configuration = [
    'ModuleConfigurationChanged',
    'EngagementConfigurationChanged',
    'FacilityActivationChanged',
    'StaffAccessChanged',
    'FacilityCreated',
  ].includes(event.type);
  const exchange = [
    'ConnectorConfigured',
    'RecordRequested',
    'ConsentChanged',
    'RecordAccessed',
    'FacilityActivationChanged',
  ].includes(event.type);
  channel?.postMessage({ facilityId: event.facilityId, configuration, exchange });
  invalidations.next(event.facilityId);
  if (exchange) invalidations.next('integrations');
  if (configuration) {
    if (event.facilityId !== 'platform') invalidations.next('platform');
    configurations.next(event.facilityId);
  }
}
