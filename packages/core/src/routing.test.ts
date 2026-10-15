import { describe, expect, it } from 'vitest';
import {
  isArrivalManeuver,
  isInsideBBox,
  isValidLocalDateTime,
  RouterError,
  isInsideRoutingArea,
  toLocalDateTime,
} from './routing';

describe('routing', () => {
  it('valida datas locais', () => {
    expect(isValidLocalDateTime('2026-10-14T08:30')).toBe(true);
    expect(isValidLocalDateTime('2028-02-29T23:59')).toBe(true);
    expect(isValidLocalDateTime('2026-02-29T08:00')).toBe(false);
    expect(isValidLocalDateTime('2026-04-31T08:00')).toBe(false);
    expect(isValidLocalDateTime('2026-13-01T08:00')).toBe(false);
    expect(isValidLocalDateTime('2026-10-00T08:00')).toBe(false);
    expect(isValidLocalDateTime('2026-10-14T24:00')).toBe(false);
    expect(isValidLocalDateTime('2026-10-14T08:60')).toBe(false);
    expect(isValidLocalDateTime('2026-10-14 08:30')).toBe(false);
    expect(isValidLocalDateTime('2026-10-14T08:30:00')).toBe(false);
  });

  it('formata datas na hora local', () => {
    expect(toLocalDateTime(new Date(2026, 0, 5, 7, 3))).toBe('2026-01-05T07:03');
  });

  it('verifica a área suportada', () => {
    expect(isInsideRoutingArea({ lng: -9.14, lat: 38.72 })).toBe(true); // Lisboa
    expect(isInsideRoutingArea({ lng: -25.67, lat: 37.74 })).toBe(true); // Ponta Delgada
    expect(isInsideRoutingArea({ lng: -16.91, lat: 32.65 })).toBe(true); // Funchal
    expect(isInsideRoutingArea({ lng: 4.26, lat: 39.89 })).toBe(true); // Maó (Menorca)
    expect(isInsideRoutingArea({ lng: -16.25, lat: 28.47 })).toBe(true); // Santa Cruz de Tenerife
    expect(isInsideRoutingArea({ lng: 2.35, lat: 48.86 })).toBe(false); // Paris
    expect(isInsideRoutingArea({ lng: -8.0, lat: 31.63 })).toBe(false); // Marraquexe
    expect(isInsideBBox({ lng: 0, lat: 0 }, [-1, -1, 1, 1])).toBe(true);
  });

  it('identifica manobras de chegada', () => {
    expect([4, 5, 6].every(isArrivalManeuver)).toBe(true);
    expect(isArrivalManeuver(1)).toBe(false);
  });

  it('cria erros com código e estado HTTP', () => {
    const error = new RouterError('no_route', 'x', 400);
    expect(error).toMatchObject({ name: 'RouterError', code: 'no_route', status: 400 });
  });
});
