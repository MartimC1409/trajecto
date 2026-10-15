import { describe, expect, it } from 'vitest';
import type { LngLat } from './geo';
import type { Route } from './routing';
import { createRouteSimulator } from './simulation';
import { valhallaResponse } from './testing/valhalla-fixtures';
import { parseValhallaResponse } from './valhalla';

const route = parseValhallaResponse(valhallaResponse(), 'car')[0] as Route;

describe('createRouteSimulator', () => {
  it('percorre a rota à velocidade de cada manobra', () => {
    const simulator = createRouteSimulator(route);
    expect(simulator.durationMs).toBeCloseTo(140_000, -3);
    expect(simulator.positionAt(0, 5)).toMatchObject({ lngLat: route.geometry[0], timestamp: 5 });
    const halfFirst = simulator.positionAt(30_000, 0);
    expect(halfFirst?.lngLat.lat).toBeCloseTo(38.7175, 3);
    expect(halfFirst?.heading).toBeCloseTo(0, 0);
    expect(halfFirst?.speed).toBeCloseTo(556 / 60, 0);
    const turning = simulator.positionAt(80_000, 0);
    expect(turning?.heading).toBeCloseTo(90, 0);
    expect(simulator.positionAt(simulator.durationMs + 1000, 0)).toBeNull();
  });

  it('acelera com o multiplicador e ignora multiplicadores inválidos', () => {
    expect(createRouteSimulator(route, 4).durationMs).toBeCloseTo(35_000, -3);
    expect(createRouteSimulator(route, 0).durationMs).toBeCloseTo(140_000, -3);
  });

  it('funciona sem manobras e com manobras sem duração', () => {
    const noManeuvers = createRouteSimulator({ ...route, maneuvers: [] });
    expect(noManeuvers.durationMs).toBeGreaterThan(100_000);
    const zero = createRouteSimulator({
      ...route,
      maneuvers: route.maneuvers.map((m) => ({ ...m, duration: 0 })),
    });
    expect(zero.positionAt(10_000, 0)?.speed).toBe(10);
  });

  it('devolve o último ponto sem direção quando a rota é um só ponto', () => {
    const point = route.geometry[0] as LngLat;
    const simulator = createRouteSimulator({ ...route, geometry: [point, point] });
    expect(simulator.positionAt(0, 0)).toMatchObject({ lngLat: point, heading: null });
  });
});
