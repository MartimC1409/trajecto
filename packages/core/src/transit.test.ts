import { describe, expect, it, vi } from 'vitest';
import { encodePolyline } from './polyline';
import {
  TransitError,
  createTransitPlanner,
  parseTransitResponse,
  transitKind,
  transitQuery,
} from './transit';

const ROSSIO = { lng: -9.1404, lat: 38.7139 };
const ALVALADE = { lng: -9.1442, lat: 38.7533 };

function place(name: string, lat: number, lon: number, extra: Record<string, unknown> = {}) {
  return { name, lat, lon, ...extra };
}

function leg(overrides: Record<string, unknown> = {}) {
  return {
    mode: 'WALK',
    from: place('Partida', 38.7139, -9.1404),
    to: place('Rossio', 38.7142, -9.1395),
    duration: 120,
    startTime: '2026-10-16T08:00:00Z',
    endTime: '2026-10-16T08:02:00Z',
    scheduledStartTime: '2026-10-16T08:00:00Z',
    scheduledEndTime: '2026-10-16T08:02:00Z',
    realTime: false,
    scheduled: true,
    distance: 150,
    legGeometry: {
      points: encodePolyline([ROSSIO, { lng: -9.1395, lat: 38.7142 }], 6),
      precision: 6,
      length: 2,
    },
    ...overrides,
  };
}

/** Itinerário no formato do MOTIS v2.11.1 (`/api/v6/plan`): a pé, metro, a pé. */
function itinerary(overrides: Record<string, unknown> = {}) {
  return {
    duration: 1500,
    startTime: '2026-10-16T08:00:00Z',
    endTime: '2026-10-16T08:25:00Z',
    transfers: 0,
    id: 'x',
    legs: [
      leg(),
      leg({
        mode: 'SUBWAY',
        from: place('Rossio', 38.7142, -9.1395, { track: '1' }),
        to: place('Alvalade', 38.7533, -9.1442),
        duration: 1080,
        startTime: '2026-10-16T08:04:00Z',
        endTime: '2026-10-16T08:22:00Z',
        scheduledStartTime: '2026-10-16T08:03:00Z',
        scheduledEndTime: '2026-10-16T08:21:00Z',
        realTime: true,
        distance: undefined,
        routeShortName: 'Verde',
        headsign: 'Telheiras',
        agencyName: 'Metropolitano de Lisboa',
        routeColor: '00A651',
        routeTextColor: 'FFFFFF',
        intermediateStops: [place('a', 38.72, -9.14), place('b', 38.73, -9.14)],
        legGeometry: {
          points: encodePolyline([{ lng: -9.1395, lat: 38.7142 }, ALVALADE], 7),
          precision: 7,
          length: 2,
        },
      }),
      leg({
        from: place('Alvalade', 38.7533, -9.1442),
        to: place('Destino', 38.754, -9.145),
        distance: 120,
        startTime: '2026-10-16T08:22:00Z',
        endTime: '2026-10-16T08:25:00Z',
        scheduledStartTime: '2026-10-16T08:22:00Z',
        scheduledEndTime: '2026-10-16T08:25:00Z',
        legGeometry: { points: '', precision: 6, length: 0 },
      }),
    ],
    ...overrides,
  };
}

function response(itineraries: unknown[]) {
  return {
    requestParameters: {},
    debugOutput: {},
    from: place('Partida', 38.7139, -9.1404),
    to: place('Destino', 38.754, -9.145),
    direct: [],
    itineraries,
    previousPageCursor: '',
    nextPageCursor: '',
  };
}

describe('transitQuery', () => {
  it('envia "lat,lon" com 5 casas decimais e só a hora quando foi escolhida', () => {
    expect(
      Object.fromEntries(transitQuery({ from: ROSSIO, to: { lng: -9.123456789, lat: 38.7 } })),
    ).toEqual({ fromPlace: '38.7139,-9.1404', toPlace: '38.7,-9.12346' });
    const at = Date.UTC(2026, 9, 16, 7, 30);
    const params = transitQuery({ from: ROSSIO, to: ALVALADE, time: at, arriveBy: true });
    expect(params.get('time')).toBe('2026-10-16T07:30:00.000Z');
    expect(params.get('arriveBy')).toBe('true');
  });

  it('recusa pontos fora da área e horas inválidas', () => {
    expect(() => transitQuery({ from: { lng: 2.35, lat: 48.85 }, to: ALVALADE })).toThrow(
      TransitError,
    );
    expect(() => transitQuery({ from: ROSSIO, to: ALVALADE, time: Number.NaN })).toThrow(
      TransitError,
    );
  });
});

describe('parseTransitResponse', () => {
  it('lê itinerários, linhas, cores, tempo real e geometrias (precisão 6 e 7)', () => {
    const [it] = parseTransitResponse(response([itinerary()]));
    expect(it).toMatchObject({
      duration: 1500,
      transfers: 0,
      start: Date.UTC(2026, 9, 16, 8, 0),
      end: Date.UTC(2026, 9, 16, 8, 25),
      walkDistance: 270,
    });
    const metro = it?.legs[1];
    expect(metro).toMatchObject({
      kind: 'subway',
      line: 'Verde',
      headsign: 'Telheiras',
      agency: 'Metropolitano de Lisboa',
      color: '#00a651',
      textColor: '#ffffff',
      realTime: true,
      stops: 2,
      from: { name: 'Rossio', track: '1' },
    });
    // Atraso: hora real e hora do horário.
    expect((metro?.start ?? 0) - (metro?.scheduledStart ?? 0)).toBe(60_000);
    expect(metro?.geometry.at(-1)).toEqual(ALVALADE);
    // Troço a pé sem geometria: linha reta entre os dois pontos.
    expect(it?.legs[2]?.geometry).toHaveLength(2);
    expect(it?.legs[0]).not.toHaveProperty('line');
    expect(it?.bbox[0]).toBeLessThan(it?.bbox[2] ?? 0);
  });

  it('ignora itinerários incoerentes e cores inválidas', () => {
    const bad = itinerary({ startTime: 'ontem' });
    const badLine = itinerary({ legs: [leg({ legGeometry: { points: '~', precision: 6 } })] });
    const strange = itinerary({
      legs: [leg({ mode: 'HOVERCRAFT', routeColor: 'red' })],
    });
    const result = parseTransitResponse(response([bad, badLine, strange]));
    expect(result).toHaveLength(1);
    expect(result[0]?.legs[0]).toMatchObject({ kind: 'other', mode: 'HOVERCRAFT' });
    expect(result[0]?.legs[0]).not.toHaveProperty('color');
  });

  it('recusa respostas sem lista de itinerários', () => {
    expect(() => parseTransitResponse({ error: 'x' })).toThrow(TransitError);
  });

  it('agrupa os modos do MOTIS', () => {
    expect(transitKind('SUBURBAN')).toBe('rail');
    expect(transitKind('REGIONAL_RAIL')).toBe('rail');
    expect(transitKind('FUNICULAR')).toBe('cable');
    expect(transitKind('COACH')).toBe('coach');
    expect(transitKind('FERRY')).toBe('ferry');
  });
});

describe('createTransitPlanner', () => {
  const request = { from: ROSSIO, to: ALVALADE };

  function planner(reply: () => Promise<Response> | Response) {
    const fetchMock = vi.fn(async () => reply());
    return { fetchMock, planner: createTransitPlanner({ url: '/api/transit', fetch: fetchMock }) };
  }

  it('pede à função própria e devolve os itinerários', async () => {
    const { fetchMock, planner: p } = planner(() => Response.json(response([itinerary()])));
    const result = await p.plan(request);
    expect(result).toHaveLength(1);
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe(
      '/api/transit?fromPlace=38.7139%2C-9.1404&toPlace=38.7533%2C-9.1442',
    );
  });

  it.each([
    [() => new Response('', { status: 429 }), 'rate_limited'],
    [() => Response.json({ error: 'bad place' }, { status: 400 }), 'invalid_request'],
    [() => new Response('x', { status: 404 }), 'unavailable'],
    [() => new Response('x', { status: 502 }), 'unavailable'],
    [() => Response.json(response([])), 'no_route'],
    [() => new Response('não é json', { status: 200 }), 'bad_response'],
  ] as const)('erros com código próprio (%#)', async (reply, code) => {
    const { planner: p } = planner(reply);
    await expect(p.plan(request)).rejects.toMatchObject({ code });
  });

  it('sem rede, erro de rede; cancelado, propaga o cancelamento', async () => {
    const offline = createTransitPlanner({
      url: '/t',
      fetch: async () => {
        throw new TypeError('failed');
      },
    });
    await expect(offline.plan(request)).rejects.toMatchObject({ code: 'network' });
    const aborted = createTransitPlanner({
      url: '/t',
      fetch: async () => {
        throw new DOMException('x', 'AbortError');
      },
    });
    await expect(aborted.plan(request)).rejects.toMatchObject({ name: 'AbortError' });
  });
});
