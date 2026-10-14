import { describe, expect, it } from 'vitest';
import { DEFAULT_CENTER, formatLngLat, isValidLngLat, roundTo } from './geo';

describe('geo', () => {
  it('valida coordenadas dentro dos limites', () => {
    expect(isValidLngLat(DEFAULT_CENTER)).toBe(true);
    expect(isValidLngLat({ lng: 180, lat: -90 })).toBe(true);
    expect(isValidLngLat({ lng: 181, lat: 0 })).toBe(false);
    expect(isValidLngLat({ lng: 0, lat: -91 })).toBe(false);
    expect(isValidLngLat({ lng: Number.NaN, lat: 0 })).toBe(false);
    expect(isValidLngLat({ lng: 0, lat: Number.POSITIVE_INFINITY })).toBe(false);
  });

  it('arredonda com o número de casas pedido', () => {
    expect(roundTo(38.7223456, 4)).toBe(38.7223);
    expect(roundTo(-9.13935, 4)).toBe(-9.1393);
  });

  it('formata latitude primeiro, com 5 casas por omissão', () => {
    expect(formatLngLat({ lng: -9.1393, lat: 38.7223 })).toBe('38.72230, -9.13930');
    expect(formatLngLat({ lng: -9.1393, lat: 38.7223 }, 2)).toBe('38.72, -9.14');
  });
});
