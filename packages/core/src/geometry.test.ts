import { describe, expect, it } from 'vitest';
import type { LngLat } from './geo';
import {
  bearingDegrees,
  cumulativeDistances,
  distanceMeters,
  interpolate,
  pointAlong,
  projectOnSegment,
} from './geometry';

const LISBOA = { lng: -9.1393, lat: 38.7223 };
const PORTO = { lng: -8.6291, lat: 41.1579 };

describe('geometry', () => {
  it('calcula a distância entre Lisboa e Porto (~274 km)', () => {
    const d = distanceMeters(LISBOA, PORTO);
    expect(d).toBeGreaterThan(272_000);
    expect(d).toBeLessThan(276_000);
    expect(distanceMeters(LISBOA, LISBOA)).toBe(0);
  });

  it('calcula rumos', () => {
    expect(bearingDegrees({ lng: 0, lat: 0 }, { lng: 0, lat: 1 })).toBeCloseTo(0);
    expect(bearingDegrees({ lng: 0, lat: 0 }, { lng: 1, lat: 0 })).toBeCloseTo(90);
    expect(bearingDegrees({ lng: 0, lat: 1 }, { lng: 0, lat: 0 })).toBeCloseTo(180);
    expect(bearingDegrees({ lng: 0, lat: 0 }, { lng: -1, lat: 0 })).toBeCloseTo(270);
  });

  it('interpola e acumula distâncias', () => {
    expect(interpolate({ lng: 0, lat: 0 }, { lng: 2, lat: 4 }, 0.5)).toEqual({ lng: 1, lat: 2 });
    const cumulative = cumulativeDistances([LISBOA, PORTO, PORTO]);
    expect(cumulative[0]).toBe(0);
    expect(cumulative[1]).toBeCloseTo(distanceMeters(LISBOA, PORTO));
    expect(cumulative[2]).toBe(cumulative[1]);
    expect(cumulativeDistances([])).toEqual([]);
  });

  it('projeta um ponto num segmento', () => {
    const a = { lng: -9.145, lat: 38.715 };
    const b = { lng: -9.145, lat: 38.72 };
    const middle = projectOnSegment({ lng: -9.144, lat: 38.7175 }, a, b);
    expect(middle.t).toBeCloseTo(0.5, 2);
    expect(middle.distance).toBeGreaterThan(80);
    expect(middle.distance).toBeLessThan(90);
    expect(projectOnSegment({ lng: -9.145, lat: 38.71 }, a, b).t).toBe(0);
    expect(projectOnSegment({ lng: -9.145, lat: 38.73 }, a, b).t).toBe(1);
    expect(projectOnSegment(a, a, a)).toMatchObject({ t: 0, distance: 0 });
  });

  it('encontra o ponto a uma distância ao longo da linha', () => {
    const line = [
      { lng: 0, lat: 0 },
      { lng: 0, lat: 0.001 },
      { lng: 0, lat: 0.002 },
    ];
    const cumulative = cumulativeDistances(line);
    const half = pointAlong(line, cumulative, (cumulative[2] ?? 0) / 2);
    expect(half.point.lat).toBeCloseTo(0.001, 6);
    expect(pointAlong(line, cumulative, -5)).toEqual({ point: line[0], segment: 0 });
    expect(pointAlong(line, cumulative, 1e9)).toEqual({ point: line[2], segment: 1 });
    expect(pointAlong(line, cumulative, (cumulative[1] ?? 0) * 1.5).segment).toBe(1);
    expect(pointAlong([line[0] as LngLat], [0], 10)).toEqual({ point: line[0], segment: 0 });
    expect(pointAlong([], [], 10).point).toEqual({ lng: 0, lat: 0 });
  });
});
