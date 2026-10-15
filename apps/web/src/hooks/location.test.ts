import { describe, expect, it, vi } from 'vitest';
import { getCurrentLngLat, LocationError } from './location';

function geolocation(result: { ok: boolean; code?: number }) {
  return {
    getCurrentPosition: vi.fn((ok: PositionCallback, fail?: PositionErrorCallback | null) => {
      if (result.ok) {
        ok({ coords: { longitude: -9.1, latitude: 38.7 } } as GeolocationPosition);
      } else {
        fail?.({ code: result.code, PERMISSION_DENIED: 1 } as GeolocationPositionError);
      }
    }),
  } as unknown as Geolocation;
}

describe('getCurrentLngLat', () => {
  it('devolve a posição atual com alta precisão', async () => {
    const geo = geolocation({ ok: true });
    await expect(getCurrentLngLat(geo)).resolves.toEqual({ lng: -9.1, lat: 38.7 });
    expect(geo.getCurrentPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      {
        enableHighAccuracy: true,
        maximumAge: 30_000,
        timeout: 15_000,
      },
    );
  });

  it('distingue permissão negada de posição indisponível', async () => {
    await expect(getCurrentLngLat(geolocation({ ok: false, code: 1 }))).rejects.toMatchObject({
      code: 'location_denied',
    });
    await expect(getCurrentLngLat(geolocation({ ok: false, code: 3 }))).rejects.toMatchObject({
      code: 'location_unavailable',
    });
    await expect(getCurrentLngLat(undefined)).rejects.toBeInstanceOf(LocationError);
  });
});
