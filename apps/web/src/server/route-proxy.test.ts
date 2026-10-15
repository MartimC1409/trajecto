// @vitest-environment node
import { ROUTING_AREAS as CORE_AREAS, buildValhallaRequest } from '@trajecto/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST, ROUTING_AREAS, handleRouteRequest, sanitizeRouteRequest } from '../../api/route';

const URL = 'https://trajecto.example/api/route';

const VALID = {
  locations: [
    { lat: 38.715, lon: -9.145, type: 'break', heading: 90, heading_tolerance: 45 },
    { lat: 41.1579, lon: -8.6291, type: 'break' },
  ],
  costing: 'auto',
  costing_options: { auto: { use_tolls: 0, use_highways: 0, use_ferry: 0, shortest: true } },
  units: 'kilometers',
  language: 'pt-PT',
  directions_type: 'instructions',
  turn_lanes: true,
  alternates: 2,
};

function jsonUpstream(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json;charset=utf-8' },
    ...init,
  });
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function setup(response: Response | (() => Promise<Response>) = jsonUpstream({ trip: {} })) {
  const fetchMock = vi.fn<typeof fetch>(
    typeof response === 'function' ? response : async () => response,
  );
  const call = (request: Request) =>
    handleRouteRequest(request, {
      upstream: 'https://valhalla.test/route',
      fetch: fetchMock,
      timeoutMs: 50,
      maxResponseBytes: 1_000,
    });
  return { fetchMock, call };
}

describe('sanitizeRouteRequest', () => {
  it('aceita exatamente o que a aplicação envia', () => {
    const request = buildValhallaRequest({
      mode: 'motorcycle',
      waypoints: [
        { lng: -9.145, lat: 38.715 },
        { lng: -8.6291, lat: 41.1579 },
      ],
      preferences: { avoidTolls: true, avoidHighways: true, avoidFerries: true, shortest: true },
      alternatives: 2,
      heading: 123,
      language: 'en-US',
    });
    expect(sanitizeRouteRequest(JSON.parse(JSON.stringify(request)))).toEqual(request);
    const timed = buildValhallaRequest({
      mode: 'walk',
      waypoints: [
        { lng: -9.145, lat: 38.715 },
        { lng: -9.14, lat: 38.72 },
        { lng: -9.13, lat: 38.73 },
      ],
      time: { kind: 'arrive', value: '2026-10-14T09:00' },
      language: 'pt-PT',
    });
    expect(sanitizeRouteRequest(JSON.parse(JSON.stringify(timed)))).toEqual(timed);
  });

  it('usa as mesmas áreas que a aplicação, incluindo as Canárias', () => {
    expect(ROUTING_AREAS).toEqual(CORE_AREAS);
    const tenerife = [
      { lat: 28.4636, lon: -16.2518 },
      { lat: 28.4874, lon: -16.3159 },
    ];
    expect(sanitizeRouteRequest({ ...VALID, locations: tenerife }).locations).toEqual(
      tenerife.map((l) => ({ ...l, type: 'break' })),
    );
  });

  it('descarta campos desconhecidos e força unidades e formato', () => {
    const result = sanitizeRouteRequest({
      ...VALID,
      units: 'miles',
      directions_type: 'none',
      format: 'osrm',
      id: 'x',
      exclude_polygons: [[[0, 0]]],
      locations: [{ ...VALID.locations[0], street: 'x' }, VALID.locations[1]],
    });
    expect(result).toEqual(VALID);
  });

  it('remove alternativas com paragens ou hora marcada', () => {
    const third = { lat: 38.8, lon: -9.1 };
    expect(
      sanitizeRouteRequest({ ...VALID, locations: [...VALID.locations, third] }),
    ).not.toHaveProperty('alternates');
    expect(
      sanitizeRouteRequest({ ...VALID, date_time: { type: 1, value: '2026-10-14T08:00' } }),
    ).not.toHaveProperty('alternates');
  });

  it.each([
    ['body', null],
    ['body', []],
    ['locations', { ...VALID, locations: [VALID.locations[0]] }],
    ['locations', { ...VALID, locations: Array.from({ length: 11 }, () => VALID.locations[1]) }],
    ['locations', { ...VALID, locations: [{ lat: 48.86, lon: 2.35 }, VALID.locations[1]] }],
    ['locations', { ...VALID, locations: [{ lat: '38', lon: -9 }, VALID.locations[1]] }],
    ['locations', { ...VALID, locations: ['x', VALID.locations[1]] }],
    [
      'locations',
      { ...VALID, locations: [{ ...VALID.locations[1], type: 'via' }, VALID.locations[1]] },
    ],
    [
      'heading',
      { ...VALID, locations: [{ ...VALID.locations[1], heading: 400 }, VALID.locations[1]] },
    ],
    ['costing', { ...VALID, costing: 'truck' }],
    ['language', { ...VALID, language: 'fr-FR' }],
    ['costing_options', { ...VALID, costing_options: 'x' }],
    ['costing_options', { ...VALID, costing_options: { bicycle: {} } }],
    ['costing_options', { ...VALID, costing_options: { auto: { top_speed: 300 } } }],
    ['costing_options', { ...VALID, costing_options: { auto: { use_tolls: 7 } } }],
    ['costing_options', { ...VALID, costing_options: { auto: { constructor: { a: 1 } } } }],
    ['costing_options', { ...VALID, costing_options: { auto: { toString: 1 } } }],
    ['locations', { ...VALID, locations: [{ lat: 31.63, lon: -8 }, VALID.locations[1]] }],
    ['date_time', { ...VALID, date_time: { type: 0, value: '2026-10-14T08:00' } }],
    ['date_time', { ...VALID, date_time: { type: 1, value: '2026-10-14 08:00' } }],
    ['alternates', { ...VALID, alternates: 3 }],
    ['alternates', { ...VALID, alternates: 1.5 }],
  ])('recusa %s inválido', (field, body) => {
    expect(() => sanitizeRouteRequest(body)).toThrow(field);
  });
});

describe('função route (proxy para o Valhalla)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reencaminha o pedido limpo, sem cabeçalhos do visitante', async () => {
    const { fetchMock, call } = setup(jsonUpstream({ trip: { legs: [] } }));
    const response = await call(post({ ...VALID, extra: 1 }, { Cookie: 'segredo=1' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ trip: { legs: [] } });
    expect(response.headers.get('cache-control')).toBe('no-store');
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('https://valhalla.test/route');
    expect(init?.method).toBe('POST');
    expect(init?.redirect).toBe('error');
    expect(init?.headers).toEqual({
      'User-Agent': 'Trajecto/0.1.0 (projeto pessoal)',
      Accept: 'application/json',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(String(init?.body))).toEqual(VALID);
  });

  it('aceita pedidos sem Sec-Fetch-Site (browsers antigos e testes)', async () => {
    const { call } = setup();
    const request = new Request(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID),
    });
    expect((await call(request)).status).toBe(200);
  });

  it('recusa métodos, origens, tipos e tamanhos não permitidos', async () => {
    const { fetchMock, call } = setup();
    const get = await call(new Request(URL));
    expect(get.status).toBe(405);
    expect(get.headers.get('allow')).toBe('POST');
    expect((await call(post(VALID, { 'Sec-Fetch-Site': 'cross-site' }))).status).toBe(403);
    expect((await call(post(VALID, { 'Content-Type': 'text/plain' }))).status).toBe(415);
    expect((await call(post('x'.repeat(20_000)))).status).toBe(413);
    const declared = post(VALID, { 'Content-Length': '999999' });
    expect((await call(declared)).status).toBe(413);
    const invalid = await call(post('{nope'));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: 'bad_request', field: 'body' });
    const badField = await call(post({ ...VALID, costing: 'truck' }));
    expect(await badField.json()).toEqual({ error: 'bad_request', field: 'costing' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('devolve só o código e a mensagem dos erros 400 do Valhalla', async () => {
    const upstreamError = {
      error_code: 442,
      error: 'No path could be found for input',
      status_code: 400,
      status: 'Bad Request',
    };
    const { call } = setup(jsonUpstream(upstreamError, { status: 400 }));
    const response = await call(post(VALID));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'No path could be found for input',
      error_code: 442,
    });
    const { call: callText } = setup(new Response('erro', { status: 400 }));
    expect(await (await callText(post(VALID))).json()).toEqual({ error: 'route_error' });
    const { call: callOdd } = setup(jsonUpstream({ error_code: 'x', error: 3 }, { status: 400 }));
    expect(await (await callOdd(post(VALID))).json()).toEqual({ error: 'route_error' });
  });

  it('passa o limite de pedidos com Retry-After válido', async () => {
    const { call } = setup(new Response('', { status: 429, headers: { 'Retry-After': '2' } }));
    const response = await call(post(VALID));
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('2');
    const { call: callBad } = setup(
      new Response('', { status: 429, headers: { 'Retry-After': 'x' } }),
    );
    expect((await callBad(post(VALID))).headers.get('retry-after')).toBeNull();
  });

  it('converte falhas do serviço em 502/504', async () => {
    expect((await setup(new Response('', { status: 503 })).call(post(VALID))).status).toBe(502);
    const html = new Response('<html>', { headers: { 'Content-Type': 'text/html' } });
    expect((await setup(html).call(post(VALID))).status).toBe(502);
    const big = jsonUpstream({ data: 'x'.repeat(2_000) });
    expect(await (await setup(big).call(post(VALID))).json()).toEqual({
      error: 'upstream_too_large',
    });
    const offline = setup(() => Promise.reject(new TypeError('fetch failed')));
    expect((await offline.call(post(VALID))).status).toBe(502);
    const slow = setup(() => Promise.reject(new DOMException('timeout', 'TimeoutError')));
    expect((await slow.call(post(VALID))).status).toBe(504);
  });

  it('responde com erro quando a ligação cai a meio do corpo da resposta', async () => {
    const failing = (error: Error, status = 200) =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{"trip":'));
            controller.error(error);
          },
        }),
        { status, headers: { 'Content-Type': 'application/json' } },
      );
    const timeout = setup(failing(new DOMException('timeout', 'TimeoutError')));
    expect((await timeout.call(post(VALID))).status).toBe(504);
    const reset = setup(failing(new TypeError('terminated')));
    expect(await (await reset.call(post(VALID))).json()).toEqual({ error: 'upstream_unreachable' });
    const brokenError = setup(failing(new TypeError('terminated'), 400));
    const response = await brokenError.call(post(VALID));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'route_error' });
  });

  it('expõe POST para o Vercel, com destino configurável', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonUpstream({ trip: {} }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('ROUTER_UPSTREAM', 'https://meu-valhalla.test/route');
    expect((await POST(post(VALID))).status).toBe(200);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://meu-valhalla.test/route');
    vi.unstubAllEnvs();
    await POST(post(VALID));
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://valhalla1.openstreetmap.de/route');
  });
});
