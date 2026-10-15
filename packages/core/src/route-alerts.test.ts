import { describe, expect, it } from 'vitest';
import type { LngLat } from './geo';
import { cumulativeDistances, pointAlong } from './geometry';
import { alertsAlongRoute, nextAlert } from './route-alerts';
import type { Route } from './routing';
import { valhallaResponse } from './testing/valhalla-fixtures';
import { parseValhallaResponse } from './valhalla';

const route = parseValhallaResponse(valhallaResponse(), 'car')[0] as Route;

function at(meters: number, east = 0): LngLat {
  const { point } = pointAlong(route.geometry, cumulativeDistances(route.geometry), meters);
  return {
    lng: point.lng + east / (111_320 * Math.cos((point.lat * Math.PI) / 180)),
    lat: point.lat,
  };
}

describe('alertsAlongRoute', () => {
  it('ordena os avisos em cima da rota e ignora os afastados', () => {
    const alerts = alertsAlongRoute(route, [
      { id: 'b', kind: 'hazard', lngLat: at(900, 5) },
      { id: 'a', kind: 'police', lngLat: at(300, -10) },
      { id: 'far', kind: 'police', lngLat: at(300, 80) },
      { id: 'out', kind: 'police', lngLat: { lng: -8, lat: 41 } },
    ]);
    expect(alerts.map((a) => a.id)).toEqual(['a', 'b']);
    expect(alerts[0]?.progress).toBeCloseTo(300, -1);
    expect(alerts[1]?.progress).toBeGreaterThan(880);
  });

  it('só conta avisos com direção quando a rota passa nesse sentido', () => {
    const alerts = alertsAlongRoute(route, [
      { id: 'same', kind: 'police', lngLat: at(200), bearing: 5 },
      { id: 'opposite', kind: 'police', lngLat: at(250), bearing: 180 },
    ]);
    expect(alerts.map((a) => a.id)).toEqual(['same']);
  });

  it('lida com rotas sem geometria', () => {
    expect(
      alertsAlongRoute({ ...route, geometry: [] }, [{ id: 'x', kind: 'k', lngLat: at(0) }]),
    ).toEqual([]);
  });
});

describe('nextAlert', () => {
  it('devolve o primeiro aviso à frente dentro da distância', () => {
    const alerts = alertsAlongRoute(route, [
      { id: 'a', kind: 'police', lngLat: at(300) },
      { id: 'b', kind: 'hazard', lngLat: at(900) },
    ]);
    expect(nextAlert(alerts, 0, 500)?.id).toBe('a');
    expect(nextAlert(alerts, 350, 500)).toBeUndefined();
    expect(nextAlert(alerts, 350, 600)?.id).toBe('b');
    expect(nextAlert(alerts, 950, 5000)).toBeUndefined();
  });
});
