import type { Geocoder, Place } from '@trajecto/core';
import { vi } from 'vitest';

export function makePlace(overrides: Partial<Place> & { id: string }): Place {
  return {
    kind: 'other',
    lngLat: { lng: -9.1393, lat: 38.7107 },
    address: {},
    ...overrides,
  };
}

export const RUA_AUGUSTA = makePlace({
  id: 'osm:W1',
  kind: 'street',
  name: 'Rua Augusta',
  address: { postcode: '1100-053', locality: 'Lisboa' },
  bbox: [-9.1385, 38.7085, -9.1365, 38.7125],
});

export const SE_LISBOA = makePlace({
  id: 'osm:N2',
  name: 'Sé de Lisboa',
  address: { street: 'Largo da Sé', locality: 'Lisboa' },
});

export function fakeGeocoder(results: Place[] = [RUA_AUGUSTA, SE_LISBOA]) {
  return {
    search: vi.fn<Geocoder['search']>(async () => results),
    reverse: vi.fn<Geocoder['reverse']>(async () => SE_LISBOA),
  };
}
