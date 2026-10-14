import { describe, expect, it, vi } from 'vitest';
import type { LngLat } from './geo';
import { encodePolyline } from './polyline';
import type { RouteRequest } from './routing';
import { RouterError } from './routing';
import {
  LISBON_POINTS,
  lisbonTrip,
  twoLegTrip,
  valhallaResponse,
} from './testing/valhalla-fixtures';
import {
  buildValhallaRequest,
  createValhallaRouter,
  parseValhallaError,
  parseValhallaResponse,
} from './valhalla';

const BASE: RouteRequest = {
  mode: 'car',
  waypoints: [
    { lng: -9.1450001234, lat: 38.715 },
    { lng: -9.14, lat: 38.722 },
  ],
  language: 'pt-PT',
};

const [FROM, TO] = BASE.waypoints as [LngLat, LngLat];

/** Valor de um índice que existe de certeza nos dados de teste. */
function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Dados de teste incompletos.');
  return value;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('buildValhallaRequest', () => {
  it('cria um pedido simples de carro', () => {
    expect(buildValhallaRequest(BASE)).toEqual({
      locations: [
        { lat: 38.715, lon: -9.145, type: 'break' },
        { lat: 38.722, lon: -9.14, type: 'break' },
      ],
      costing: 'auto',
      costing_options: {},
      units: 'kilometers',
      language: 'pt-PT',
      directions_type: 'instructions',
      turn_lanes: true,
    });
  });

  it('traduz preferências para cada meio de transporte', () => {
    const preferences = {
      avoidTolls: true,
      avoidHighways: true,
      avoidFerries: true,
      shortest: true,
    };
    expect(buildValhallaRequest({ ...BASE, preferences }).costing_options).toEqual({
      auto: { use_ferry: 0, use_tolls: 0, use_highways: 0, shortest: true },
    });
    expect(buildValhallaRequest({ ...BASE, mode: 'motorcycle', preferences })).toMatchObject({
      costing: 'motorcycle',
      costing_options: { motorcycle: { use_tolls: 0, use_highways: 0, use_ferry: 0 } },
    });
    // A pé e de bicicleta não há portagens nem autoestradas.
    expect(buildValhallaRequest({ ...BASE, mode: 'walk', preferences })).toMatchObject({
      costing: 'pedestrian',
      costing_options: { pedestrian: { use_ferry: 0, shortest: true } },
    });
    expect(buildValhallaRequest({ ...BASE, mode: 'bike', preferences }).costing_options).toEqual({
      bicycle: { use_ferry: 0, shortest: true },
    });
  });

  it('pede alternativas só quando o Valhalla as suporta', () => {
    expect(buildValhallaRequest({ ...BASE, alternatives: 2 }).alternates).toBe(2);
    expect(buildValhallaRequest({ ...BASE, alternatives: 9 }).alternates).toBe(2);
    expect(buildValhallaRequest({ ...BASE, alternatives: -1 }).alternates).toBeUndefined();
    expect(buildValhallaRequest({ ...BASE, alternatives: Number.NaN }).alternates).toBeUndefined();
    const withStop = { ...BASE, waypoints: [...BASE.waypoints, { lng: -9.13, lat: 38.73 }] };
    expect(buildValhallaRequest({ ...withStop, alternatives: 2 }).alternates).toBeUndefined();
    const timed = { ...BASE, time: { kind: 'depart', value: '2026-10-14T08:00' } } as const;
    expect(buildValhallaRequest({ ...timed, alternatives: 2 }).alternates).toBeUndefined();
    expect(
      buildValhallaRequest({ ...BASE, time: { kind: 'now' }, alternatives: 1 }).alternates,
    ).toBe(1);
  });

  it('envia hora de partida ou de chegada', () => {
    expect(
      buildValhallaRequest({ ...BASE, time: { kind: 'depart', value: '2026-10-14T08:00' } })
        .date_time,
    ).toEqual({ type: 1, value: '2026-10-14T08:00' });
    expect(
      buildValhallaRequest({ ...BASE, time: { kind: 'arrive', value: '2026-10-14T09:15' } })
        .date_time,
    ).toEqual({ type: 2, value: '2026-10-14T09:15' });
    expect(() =>
      buildValhallaRequest({ ...BASE, time: { kind: 'arrive', value: 'amanhã' } }),
    ).toThrow(RouterError);
  });

  it('envia a direção atual na origem (recálculo em movimento)', () => {
    expect(buildValhallaRequest({ ...BASE, heading: -90.4 }).locations[0]).toEqual({
      lat: 38.715,
      lon: -9.145,
      type: 'break',
      heading: 270,
      heading_tolerance: 45,
    });
    expect(buildValhallaRequest({ ...BASE, heading: 359.7 }).locations[0]?.heading).toBe(0);
    expect(buildValhallaRequest({ ...BASE, heading: Number.NaN }).locations[0]).not.toHaveProperty(
      'heading',
    );
  });

  it('recusa pedidos inválidos', () => {
    const bad: RouteRequest[] = [
      { ...BASE, waypoints: [FROM] },
      { ...BASE, waypoints: Array.from({ length: 11 }, () => FROM) },
      { ...BASE, waypoints: [{ lng: 200, lat: 0 }, TO] },
      { ...BASE, waypoints: [{ lng: 2.35, lat: 48.86 }, TO] },
      { ...BASE, mode: 'plane' as never },
      { ...BASE, language: 'fr-FR' as never },
    ];
    for (const request of bad) {
      expect(() => buildValhallaRequest(request)).toThrow(
        expect.objectContaining({ code: 'invalid_request' }),
      );
    }
  });
});

describe('parseValhallaResponse', () => {
  it('converte a viagem em rota com distâncias em metros', () => {
    const [route, ...rest] = parseValhallaResponse(valhallaResponse(), 'car');
    expect(rest).toHaveLength(0);
    expect(route).toMatchObject({
      mode: 'car',
      distance: 1212,
      duration: 140,
      hasToll: true,
      hasHighway: false,
      hasFerry: false,
      bbox: [-9.145, 38.715, -9.14, 38.722],
      legs: [{ distance: 1212, duration: 140, endIndex: 5 }],
    });
    expect(route?.geometry).toEqual(LISBON_POINTS);
    expect(route?.maneuvers).toHaveLength(4);
    expect(route?.maneuvers[1]).toEqual({
      type: 10,
      instruction: 'Vire à direita na Rua Alexandre Herculano.',
      verbalAlert: 'Vire à direita na Rua Alexandre Herculano.',
      verbalPre: 'Vire à direita na Rua Alexandre Herculano.',
      verbalPost: 'Continue durante 400 metros.',
      streetNames: ['Rua Alexandre Herculano'],
      distance: 434,
      duration: 50,
      beginIndex: 2,
      endIndex: 4,
      leg: 0,
      toll: true,
      highway: false,
      ferry: false,
      lanes: [
        { directions: 2, active: 0, valid: 0 },
        { directions: 66, active: 64, valid: 64 },
      ],
      sign: { exitNumber: '3', branch: [], toward: ['Rato'] },
    });
    expect(route?.maneuvers[0]).not.toHaveProperty('verbalAlert');
  });

  it('inclui as alternativas válidas (no máximo 2)', () => {
    const routes = parseValhallaResponse(valhallaResponse(3), 'car');
    expect(routes).toHaveLength(3);
    expect(routes[1]?.geometry[1]).toEqual({ lng: -9.1475, lat: 38.7175 });
    const broken = {
      ...valhallaResponse(),
      alternates: [{ trip: { legs: [] } }, { trip: lisbonTrip() }],
    };
    expect(parseValhallaResponse(broken, 'car')).toHaveLength(2);
  });

  it('junta etapas sem repetir o ponto da paragem e ajusta os índices', () => {
    const [route] = parseValhallaResponse({ trip: twoLegTrip() }, 'car');
    expect(route?.geometry).toEqual(LISBON_POINTS);
    expect(route?.legs.map((l) => l.endIndex)).toEqual([2, 5]);
    expect(route?.maneuvers.map((m) => [m.leg, m.beginIndex, m.endIndex])).toEqual([
      [0, 0, 2],
      [0, 2, 2],
      [1, 2, 4],
      [1, 4, 5],
      [1, 5, 5],
    ]);
  });

  it('mantém etapas que não começam no fim da anterior', () => {
    const trip = twoLegTrip();
    must(trip.legs[1]).shape = encodePolyline([
      { lng: -9.1449, lat: 38.7201 },
      ...LISBON_POINTS.slice(3),
    ]);
    const [route] = parseValhallaResponse({ trip }, 'car');
    expect(route?.geometry).toHaveLength(7);
    expect(route?.maneuvers[2]?.beginIndex).toBe(3);
  });

  it('converte milhas e protege índices fora da geometria', () => {
    const trip = lisbonTrip();
    trip.units = 'miles';
    must(must(trip.legs[0]).maneuvers[3]).begin_shape_index = 99;
    must(must(trip.legs[0]).maneuvers[3]).end_shape_index = 2;
    const [route] = parseValhallaResponse({ trip }, 'walk');
    expect(route?.distance).toBeCloseTo(1.212 * 1609.344);
    expect(route?.maneuvers[3]).toMatchObject({ beginIndex: 5, endIndex: 5 });
  });

  it('aceita uma etapa com um só ponto (origem igual ao destino)', () => {
    const trip = lisbonTrip([must(LISBON_POINTS[0])]);
    const [route] = parseValhallaResponse({ trip }, 'car');
    expect(route?.geometry).toEqual([LISBON_POINTS[0], LISBON_POINTS[0]]);
  });

  it('ignora campos opcionais malformados', () => {
    const trip = lisbonTrip();
    Object.assign(must(must(trip.legs[0]).maneuvers[1]), {
      lanes: 'x',
      sign: { exit_toward_elements: [] },
      street_names: [42],
      verbal_post_transition_instruction: '   ',
      roundabout_exit_count: -3,
    });
    const [route] = parseValhallaResponse({ trip }, 'car');
    const maneuver = route?.maneuvers[1];
    expect(maneuver).not.toHaveProperty('lanes');
    expect(maneuver).not.toHaveProperty('sign');
    expect(maneuver).not.toHaveProperty('verbalPost');
    expect(maneuver).not.toHaveProperty('roundaboutExit');
    expect(maneuver?.streetNames).toEqual([]);
  });

  it('recusa respostas sem viagem válida', () => {
    const invalid: unknown[] = [
      null,
      {},
      { trip: {} },
      { trip: { ...lisbonTrip(), legs: [] } },
      { trip: { ...lisbonTrip(), legs: [{ ...lisbonTrip().legs[0], shape: '_p~iF' }] } },
      {
        trip: {
          ...lisbonTrip(),
          legs: [{ ...lisbonTrip().legs[0], shape: encodePolyline([{ lng: 0, lat: 95 }]) }],
        },
      },
    ];
    for (const body of invalid) {
      expect(() => parseValhallaResponse(body, 'car')).toThrow(
        expect.objectContaining({ code: 'bad_response' }),
      );
    }
  });
});

describe('parseValhallaError', () => {
  it('identifica a falta de caminho e distâncias excessivas', () => {
    expect(
      parseValhallaError({ error_code: 442, error: 'No path could be found for input' }, 400).code,
    ).toBe('no_route');
    expect(parseValhallaError({ error_code: 171 }, 400).code).toBe('no_route');
    expect(parseValhallaError({ error_code: 154 }, 400).code).toBe('too_far');
    expect(parseValhallaError({ error_code: 100 }, 400).code).toBe('invalid_request');
    expect(parseValhallaError('x', 400)).toMatchObject({ code: 'invalid_request', status: 400 });
  });
});

describe('createValhallaRouter', () => {
  it('faz um POST com o pedido em JSON e devolve as rotas', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(valhallaResponse(1)));
    const router = createValhallaRouter({ url: '/api/route', fetch: fetchMock });
    const routes = await router.route({ ...BASE, alternatives: 1 });
    expect(routes).toHaveLength(2);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/route');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toMatchObject({ costing: 'auto', alternates: 1 });
  });

  it('não contacta o serviço se o pedido for inválido', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const router = createValhallaRouter({ url: '/api/route', fetch: fetchMock });
    await expect(router.route({ ...BASE, waypoints: [] })).rejects.toThrow(RouterError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [429, 'rate_limited'],
    [500, 'unavailable'],
    [502, 'unavailable'],
  ])('converte HTTP %i em %s', async (status, code) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('x', { status }));
    const router = createValhallaRouter({ url: '/r', fetch: fetchMock });
    await expect(router.route(BASE)).rejects.toMatchObject({ code, status });
  });

  it('lê o motivo de um erro 400', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error_code: 442, error: 'No path' }, 400))
      .mockResolvedValueOnce(new Response('not json', { status: 400 }));
    const router = createValhallaRouter({ url: '/r', fetch: fetchMock });
    await expect(router.route(BASE)).rejects.toMatchObject({ code: 'no_route' });
    await expect(router.route(BASE)).rejects.toMatchObject({ code: 'invalid_request' });
  });

  it('distingue falhas de rede, respostas inválidas e cancelamentos', async () => {
    const abort = new DOMException('cancelado', 'AbortError');
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response('{', { status: 200 }))
      .mockRejectedValueOnce(abort)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.reject(abort),
      } as Response);
    const router = createValhallaRouter({ url: '/r', fetch: fetchMock });
    await expect(router.route(BASE)).rejects.toMatchObject({ code: 'network' });
    await expect(router.route(BASE)).rejects.toMatchObject({ code: 'bad_response' });
    await expect(router.route(BASE, { signal: new AbortController().signal })).rejects.toBe(abort);
    await expect(router.route(BASE)).rejects.toBe(abort);
  });
});
