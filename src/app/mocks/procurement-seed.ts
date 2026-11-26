import type { Facility } from '../domain/operations';
import type { Supplier } from '../domain/procurement';

export function initialSuppliers(facilities: readonly Facility[]): Supplier[] {
  return facilities.flatMap((facility) => [
    {
      id: facility.id + '-supplier-1',
      facilityId: facility.id,
      name: 'Fieldstone Medical Supply',
      items: [
        { productId: 'hydration', unitMinor: 2100 },
        { productId: 'saline', unitMinor: 6200 },
        { productId: 'dressing', unitMinor: 5400 },
      ],
    },
    {
      id: facility.id + '-supplier-2',
      facilityId: facility.id,
      name: 'Harbor Care Supplies',
      items: [
        { productId: 'tears', unitMinor: 8700 },
        { productId: 'saline', unitMinor: 6500 },
      ],
    },
  ]);
}
