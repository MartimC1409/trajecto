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

/** Percorre a rota a 13,9 m/s (50 km/h): o tempo entre posições segue a distância percorrida. */
function drive(route: Route, distances: readonly number[], options: NavigatorOptions = OPTIONS) {
  const navigator = createNavigator(route, options);
  let time = 0;
  let last = 0;
  return distances.map((d) => {
    time += Math.max(1000, (Math.abs(d - last) / 13.9) * 1000);
    last = d;
    return navigator.update({ lngLat: at(route, d), accuracy: 5, speed: 13.9, timestamp: time });
  });
}

const METERS_PER_DEGREE = 111_320;

/** Rota sintética a partir de pontos, com uma manobra por troço indicado. */
function syntheticRoute(
  points: LngLat[],
  maneuvers: { type: number; instruction: string; begin: number; end: number }[],
): Route {
  const cumulative = cumulativeDistances(points);
  const total = cumulative.at(-1) ?? 0;
  return {
    mode: 'car',
    geometry: points,
    distance: total,
    duration: total / 10,
    bbox: [-180, -90, 180, 90],
    hasToll: false,
    hasHighway: false,
    hasFerry: false,
    legs: [{ distance: total, duration: total / 10, endIndex: points.length - 1 }],
    maneuvers: maneuvers.map((m) => {
      const distance = (cumulative[m.end] ?? 0) - (cumulative[m.begin] ?? 0);
      return {
        type: m.type,
        instruction: m.instruction,
        verbalPre: m.instruction,
        streetNames: [],
        distance,
        duration: distance / 10,
        beginIndex: m.begin,
        endIndex: m.end,
        leg: 0,
        toll: false,
        highway: false,
        ferry: false,
      };
    }),
  };
}

/** Ponto a `north` e `east` metros de Lisboa. */
function offset(north: number, east: number): LngLat {
  const lat = 38.7 + north / METERS_PER_DEGREE;
  return { lng: -9.1 + east / (METERS_PER_DEGREE * Math.cos((38.7 * Math.PI) / 180)), lat };
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

  describe('rotas que passam duas vezes pela mesma estrada', () => {
    // Ida 300 m para norte, inversão de marcha e volta pelo mesmo caminho até ao início.
    const out = Array.from({ length: 13 }, (_, i) => offset(i * 25, 0));
    const back = out.slice(0, -1).reverse();
    const route = syntheticRoute(
      [...out, ...back],
      [
        { type: 1, instruction: 'Siga para norte.', begin: 0, end: 12 },
        { type: 13, instruction: 'Faça inversão de marcha.', begin: 12, end: 24 },
        { type: 4, instruction: 'Chegou ao seu destino.', begin: 24, end: 24 },
      ],
    );

    function goAndBack(withHeading: boolean) {
      const navigator = createNavigator(route, OPTIONS);
      const results = [];
      let t = 0;
      for (let north = 0; north <= 300; north += 10) {
        t += 1000;
        results.push(
          navigator.update({
            lngLat: offset(north, 2),
            accuracy: 5,
            speed: withHeading ? 10 : null,
            heading: withHeading ? 0 : null,
            timestamp: t,
          }),
        );
      }
      for (let north = 290; north >= 0; north -= 10) {
        t += 1000;
        results.push(
          navigator.update({
            lngLat: offset(north, -2),
            accuracy: 5,
            speed: withHeading ? 10 : null,
            heading: withHeading ? 180 : null,
            timestamp: t,
          }),
        );
      }
      return results;
    }

    it.each([true, false])(
      'segue a ida e a volta sem saltar nem recalcular (direção do GPS: %s)',
      (withHeading) => {
        const results = goAndBack(withHeading);
        const traveled = results.map((r) => r.snapshot.distanceTraveled);
        // Na ida, o progresso acompanha a posição real (não salta para a volta).
        expect(traveled[16]).toBeGreaterThan(140);
        expect(traveled[16]).toBeLessThan(180);
        expect(results.some((r) => r.reroute)).toBe(false);
        expect(results.map((r) => r.snapshot.status)).not.toContain('off_route');
        const spoken = results.flatMap((r) => r.announcements);
        expect(spoken).toContain('Faça inversão de marcha.');
        expect(spoken.indexOf('Faça inversão de marcha.')).toBeLessThan(
          spoken.indexOf('Chegou ao seu destino.'),
        );
        expect(results.at(-1)?.snapshot.status).toBe('arrived');
        // Só chega no fim da volta.
        expect(results.findIndex((r) => r.snapshot.status === 'arrived')).toBeGreaterThan(50);
      },
    );
  });

  it('não dá a chegada por passar perto do destino na outra faixa antes de dar a volta', () => {
    // 4 km para este, volta 35 m a norte e 500 m para oeste: o destino fica em frente ao km 3,5.
    const out = Array.from({ length: 41 }, (_, i) => offset(0, i * 100));
    const back = Array.from({ length: 6 }, (_, i) => offset(35, 4000 - i * 100));
    const route = syntheticRoute(
      [...out, ...back],
      [
        { type: 1, instruction: 'Siga para este.', begin: 0, end: 40 },
        { type: 13, instruction: 'Faça inversão de marcha.', begin: 40, end: 46 },
        { type: 4, instruction: 'Chegou ao seu destino.', begin: 46, end: 46 },
      ],
    );
    const navigator = createNavigator(route, OPTIONS);
    let t = 0;
    const statuses = [];
    for (let east = 0; east <= 3600; east += 100) {
      t += 5000;
      statuses.push(
        navigator.update({
          lngLat: offset(0, east),
          accuracy: 8,
          speed: 20,
          heading: 90,
          timestamp: t,
        }).snapshot.status,
      );
    }
    expect(statuses).not.toContain('arrived');
    t += 30_000;
    const end = navigator.update({
      lngLat: offset(35, 3500),
      accuracy: 8,
      speed: 5,
      heading: 270,
      timestamp: t,
    });
    expect(end.snapshot.status).toBe('arrived');
  });

  it('não estima uma velocidade enorme ao voltar à rota depois de um desvio', () => {
    const route = makeRoute();
    const navigator = createNavigator(route, OPTIONS);
    let t = 0;
    const step = (d: number, east = 0) => {
      t += 1000;
      return navigator.update({
        lngLat: at(route, d, east),
        accuracy: 5,
        speed: null,
        timestamp: t,
      });
    };
    for (let d = 0; d <= 100; d += 10) step(d);
    // Desvio por uma rua paralela, longe da rota, e regresso mais à frente.
    for (let i = 0; i < 2; i++) step(150, 150);
    const back = step(400);
    expect(back.snapshot.speed).toBeLessThan(20);
    expect(back.announcements).not.toContain('Vire à direita na Rua Alexandre Herculano.');
  });
});
