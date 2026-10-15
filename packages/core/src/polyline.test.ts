import { describe, expect, it } from 'vitest';
import { decodePolyline, encodePolyline } from './polyline';

describe('polyline', () => {
  it('descodifica o exemplo oficial da Google (precisão 5)', () => {
    const points = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@', 5);
    expect(points).toEqual([
      { lat: 38.5, lng: -120.2 },
      { lat: 40.7, lng: -120.95 },
      { lat: 43.252, lng: -126.453 },
    ]);
  });

  it('codifica e descodifica com precisão 6 (formato do Valhalla)', () => {
    const original = [
      { lng: -9.139337, lat: 38.722252 },
      { lng: -8.629105, lat: 41.157944 },
      { lng: -9.14, lat: 38.7 },
    ];
    expect(decodePolyline(encodePolyline(original))).toEqual(original);
  });

  it('devolve lista vazia para texto vazio', () => {
    expect(decodePolyline('')).toEqual([]);
  });

  it('recusa geometrias truncadas ou com caracteres inválidos', () => {
    expect(() => decodePolyline('_p~iF~ps|U_')).toThrow();
    expect(() => decodePolyline('_p~iF')).toThrow();
    expect(() => decodePolyline(' !!')).toThrow();
    expect(() => decodePolyline('~~~~~~~~~~~~')).toThrow();
  });
});
