import type { LngLat } from '@trajecto/core';

export type LocationErrorCode = 'location_denied' | 'location_unavailable';

export class LocationError extends Error {
  readonly code: LocationErrorCode;
  constructor(code: LocationErrorCode) {
    super(code);
    this.name = 'LocationError';
    this.code = code;
  }
}

/** Posição atual (aceita uma leitura com até 30 s, para responder mais depressa). */
export function getCurrentLngLat(
  geolocation: Geolocation | undefined = typeof navigator === 'undefined'
    ? undefined
    : navigator.geolocation,
): Promise<LngLat> {
  return new Promise((resolve, reject) => {
    if (!geolocation) {
      reject(new LocationError('location_unavailable'));
      return;
    }
    geolocation.getCurrentPosition(
      (position) => resolve({ lng: position.coords.longitude, lat: position.coords.latitude }),
      (error) =>
        reject(
          new LocationError(
            error.code === error.PERMISSION_DENIED ? 'location_denied' : 'location_unavailable',
          ),
        ),
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 15_000 },
    );
  });
}
