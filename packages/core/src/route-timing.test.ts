import { describe, expect, it } from 'vitest';
import type { Route } from './routing';
import { routeTimeAt, sampleAlongRoute } from './route-timing';
import { valhallaResponse } from './testing/valhalla-fixtures';
import { parseValhallaResponse } from './valhalla';

const route = parseValhallaResponse(valhallaResponse(), 'car')[0] as Route;

describe('routeTimeAt', () => {
  it('distribui a duração de cada manobra pela sua distância', () => {
    const timeAt = routeTimeAt(route);
    expect(timeAt(0)).toBe(0);
    expect(timeAt(-5)).toBe(0);
    // Primeira manobra: ~556 m em 60 s.
    expect(timeAt(278)).toBeCloseTo(30, 0);
    expect(timeAt(1e9)).toBeCloseTo(140, 0);
    const end = route.geometry.length > 0 ? timeAt(1212) : 0;
    expect(end).toBeGreaterThan(135);
  });

  it('usa a duração total quando as manobras não chegam ao fim da geometria', () => {
    const short: Route = { ...route, maneuvers: route.maneuvers.slice(0, 1) };
    expect(routeTimeAt(short)(1e9)).toBe(140);
    const none: Route = { ...route, maneuvers: [] };
    expect(routeTimeAt(none)(606)).toBeCloseTo(70, 0);
  });
});

describe('sampleAlongRoute', () => {
  it('inclui sempre a partida e o destino', () => {
    const samples = sampleAlongRoute(route, { intervalMeters: 15_000, maxSamples: 12 });
    expect(samples).toHaveLength(2);
    expect(samples[0]).toMatchObject({ distance: 0, seconds: 0, lngLat: route.geometry[0] });
    expect(samples[1]?.lngLat).toEqual(route.geometry.at(-1));
    expect(samples[1]?.seconds).toBeCloseTo(140, 0);
  });

  it('espaça os pontos e respeita o máximo', () => {
    const samples = sampleAlongRoute(route, { intervalMeters: 300, maxSamples: 12 });
    expect(samples.map((s) => Math.round(s.distance))).toEqual([0, 300, 600, 900, 1212]);
    const few = sampleAlongRoute(route, { intervalMeters: 100, maxSamples: 3 });
    expect(few).toHaveLength(3);
    expect(few[1]?.distance).toBeCloseTo(606, 0);
    // Não há um ponto quase em cima do destino.
    const close = sampleAlongRoute(route, { intervalMeters: 400, maxSamples: 12 });
    expect(close.map((s) => Math.round(s.distance))).toEqual([0, 400, 800, 1212]);
  });

  it('lida com rotas vazias ou de comprimento zero', () => {
    expect(
      sampleAlongRoute({ ...route, geometry: [] }, { intervalMeters: 1, maxSamples: 5 }),
    ).toEqual([]);
    const point = route.geometry[0];
    const still = sampleAlongRoute(
      { ...route, geometry: point ? [point, point] : [] },
      { intervalMeters: 1, maxSamples: 5 },
    );
    expect(still).toHaveLength(1);
  });
});
