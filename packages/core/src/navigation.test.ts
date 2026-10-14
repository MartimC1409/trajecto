import { describe, expect, it } from 'vitest';
import type { LngLat } from './geo';
import { cumulativeDistances, pointAlong } from './geometry';
import type { NavigatorOptions } from './navigation';
import { createNavigator } from './navigation';
import type { Route, TravelMode } from './routing';
import { twoLegTrip, valhallaResponse } from './testing/valhalla-fixtures';
import { parseValhallaResponse } from './valhalla';

const OPTIONS: NavigatorOptions = {
  formatAlert: (meters, text) => `Daqui a ${meters} metros, ${text}`,
};

function makeRoute(mode: TravelMode = 'car', body: unknown = valhallaResponse()): Route {
  const route = parseValhallaResponse(body, mode)[0];
  if (!route) throw new Error('fixture');
  return route;
}

/** Ponto a `meters` do início da rota, deslocado `east` metros para este. */
function at(route: Route, meters: number, east = 0): LngLat {
  const cumulative = cumulativeDistances(route.geometry);
  const { point } = pointAlong(route.geometry, cumulative, meters);
  return {
    lng: point.lng + east / (111_320 * Math.cos((point.lat * Math.PI) / 180)),
    lat: point.lat,
  };
}

function drive(route: Route, distances: readonly number[], options: NavigatorOptions = OPTIONS) {
  const navigator = createNavigator(route, options);
  return distances.map((d, i) =>
    navigator.update({ lngLat: at(route, d), accuracy: 5, speed: 13.9, timestamp: i * 1000 }),
  );
}

describe('createNavigator', () => {
  it('anuncia a partida, os avisos antecipados, as manobras e a chegada', () => {
    const route = makeRoute();
    const updates = drive(route, [0, 30, 200, 480, 580, 700, 900, 1000, 1150, 1200]);
    expect(updates.flatMap((u) => u.announcements)).toEqual([
      'Siga para norte na Avenida da Liberdade.',
      'Continue durante 600 metros.',
      'Daqui a 350 metros, vire à direita na Rua Alexandre Herculano.',
      'Vire à direita na Rua Alexandre Herculano.',
      'Daqui a 300 metros, vire à esquerda na Rua Castilho.',
      'Vire à esquerda na Rua Castilho.',
      'Daqui a 200 metros, chegará ao seu destino.',
      'Chegou ao seu destino.',
    ]);
    expect(updates.at(-1)?.snapshot).toMatchObject({
      status: 'arrived',
      distanceRemaining: 0,
      durationRemaining: 0,
    });
    expect(updates.some((u) => u.reroute)).toBe(false);
  });

  it('calcula distância e tempo restantes e a próxima manobra', () => {
    const route = makeRoute();
    const [start, middle] = drive(route, [0, 300]);
    expect(start?.snapshot.nextManeuverIndex).toBe(1);
    expect(start?.snapshot.durationRemaining).toBeCloseTo(140, 0);
    expect(middle?.snapshot.distanceToNextManeuver).toBeCloseTo(
      (route.legs[0]?.distance ?? 0) - 300 - 434 - 222,
      -1,
    );
    expect(middle?.snapshot.distanceRemaining).toBeGreaterThan(900);
    expect(middle?.snapshot.durationRemaining).toBeLessThan(140);
    expect(middle?.snapshot.durationRemaining).toBeGreaterThan(80);
    expect(middle?.snapshot.bearing).toBeCloseTo(0, 0);
    expect(middle?.snapshot.distanceFromRoute).toBeLessThan(1);
  });

  it('pede recálculo depois de várias posições fora da rota, com intervalo mínimo', () => {
    const route = makeRoute();
    const navigator = createNavigator(route, { ...OPTIONS, rerouteCooldownMs: 10_000 });
    navigator.update({ lngLat: at(route, 100), timestamp: 0 });
    const away = (t: number) => navigator.update({ lngLat: at(route, 150, 120), timestamp: t });
    expect(away(1000).reroute).toBe(false);
    expect(away(2000).snapshot.status).toBe('navigating');
    const third = away(3000);
    expect(third).toMatchObject({ reroute: true, snapshot: { status: 'off_route' } });
    expect(third.snapshot.distanceFromRoute).toBeGreaterThan(100);
    expect(away(4000)).toMatchObject({ reroute: false, snapshot: { status: 'off_route' } });
    expect(away(13_000).reroute).toBe(true);
    const back = navigator.update({ lngLat: at(route, 200), timestamp: 14_000 });
    expect(back.snapshot.status).toBe('navigating');
  });

  it('deteta a circulação em sentido contrário', () => {
    const route = makeRoute();
    const navigator = createNavigator(route, OPTIONS);
    const statuses = [300, 280, 260, 240, 220, 200].map(
      (d, i) =>
        navigator.update({ lngLat: at(route, d), heading: 180, speed: 10, timestamp: i * 1000 })
          .snapshot.status,
    );
    // A primeira posição já conta: 3 + 2 posições seguidas em sentido contrário.
    expect(statuses.slice(0, 4)).not.toContain('off_route');
    expect(statuses[4]).toBe('off_route');
  });

  it('não recalcula enquanto se aproxima da rota pela primeira vez', () => {
    const route = makeRoute();
    const navigator = createNavigator(route, OPTIONS);
    const first = navigator.update({ lngLat: at(route, 0, 100), timestamp: 0 });
    expect(first.snapshot.distanceFromRoute).toBeGreaterThan(90);
    for (let t = 1; t <= 5; t++) {
      expect(navigator.update({ lngLat: at(route, 0, 120), timestamp: t * 1000 }).reroute).toBe(
        false,
      );
    }
    // Afastou-se muito do ponto inicial: segue noutra direção.
    const results = [6, 7, 8].map((t) =>
      navigator.update({ lngLat: at(route, 0, 400), timestamp: t * 1000 }),
    );
    expect(results.at(-1)?.reroute).toBe(true);
  });

  it('ignora posições imprecisas ou inválidas', () => {
    const route = makeRoute();
    const navigator = createNavigator(route, OPTIONS);
    const first = navigator.update({ lngLat: at(route, 0), accuracy: 500, timestamp: 0 });
    expect(first).toMatchObject({ ignored: true, announcements: [], reroute: false });
    const good = navigator.update({ lngLat: at(route, 100), accuracy: 10, timestamp: 1000 });
    expect(good.ignored).toBe(false);
    const bad = navigator.update({ lngLat: { lng: Number.NaN, lat: 0 }, timestamp: 2000 });
    expect(bad).toMatchObject({ ignored: true, snapshot: good.snapshot });
  });

  it('não volta atrás com o ruído do GPS', () => {
    const route = makeRoute();
    const [, ahead, behind] = drive(route, [0, 300, 280]);
    expect(behind?.snapshot.distanceTraveled).toBe(ahead?.snapshot.distanceTraveled);
  });

  it('apanha a rota mais à frente (atalho)', () => {
    const route = makeRoute();
    const [, , shortcut] = drive(route, [0, 50, 1000]);
    expect(shortcut?.snapshot.distanceTraveled).toBeCloseTo(1000, -1);
    expect(shortcut?.snapshot.status).toBe('navigating');
  });

  it('estima a velocidade quando o GPS não a indica', () => {
    const route = makeRoute('walk');
    const navigator = createNavigator(route, OPTIONS);
    navigator.update({ lngLat: at(route, 0), timestamp: 0 });
    const second = navigator.update({ lngLat: at(route, 20), speed: null, timestamp: 10_000 });
    expect(second.snapshot.speed).toBeGreaterThan(1);
    expect(second.snapshot.speed).toBeLessThan(2);
  });

  it('passa paragens intermédias e muda de etapa', () => {
    const route = makeRoute('car', { trip: twoLegTrip() });
    const updates = drive(route, [0, 500, 560, 600, 1212]);
    expect(updates.map((u) => u.snapshot.legIndex)).toEqual([0, 0, 1, 1, 1]);
    const spoken = updates.flatMap((u) => u.announcements);
    expect(spoken).toContain('Chegou ao seu destino.');
    expect(spoken).toContain('Siga para este na Rua Alexandre Herculano.');
    expect(updates.at(-1)?.snapshot.status).toBe('arrived');
  });

  it('não confunde partida e chegada num percurso circular', () => {
    const route = makeRoute();
    const loop: Route = { ...route, geometry: [...route.geometry, route.geometry[0] as LngLat] };
    const navigator = createNavigator(loop, OPTIONS);
    expect(
      navigator.update({ lngLat: loop.geometry[0] as LngLat, timestamp: 0 }).snapshot.status,
    ).toBe('navigating');
  });
});
