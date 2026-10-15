// @vitest-environment node
import {
  ROUTING_AREAS,
  OPEN_METEO_HOURLY,
  MAX_WEATHER_POINTS,
  WEATHER_FORECAST_DAYS,
} from '@trajecto/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET, ROUTING_AREAS as PROXY_AREAS, handleWeatherRequest } from '../../api/weather';

const BASE = 'https://trajecto.example/api/weather';

function jsonUpstream(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    ...init,
  });
}

function setup(response: Response | (() => Promise<Response>) = jsonUpstream([])) {
  const fetchMock = vi.fn<typeof fetch>(
    typeof response === 'function' ? response : async () => response,
  );
  const call = (query: string, init: RequestInit = {}) =>
    handleWeatherRequest(new Request(`${BASE}?${query}`, init), {
      upstream: 'https://meteo.test/v1/forecast',
      fetch: fetchMock,
      timeoutMs: 50,
      maxResponseBytes: 1000,
    });
  return { fetchMock, call };
}

describe('função weather (proxy para o Open-Meteo)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('pede as variáveis fixas para os pontos, sem dados do visitante', async () => {
    const { fetchMock, call } = setup(jsonUpstream([{ hourly: { time: [] } }]));
    const response = await call('lat=38.723,41.158&lon=-9.141,-8.629&hourly=snowfall&apikey=x', {
      headers: { Cookie: 'a=1' },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, max-age=900');
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    const upstream = new URL(String(url));
    expect(upstream.origin + upstream.pathname).toBe('https://meteo.test/v1/forecast');
    expect(Object.fromEntries(upstream.searchParams)).toEqual({
      latitude: '38.723,41.158',
      longitude: '-9.141,-8.629',
      hourly: OPEN_METEO_HOURLY.join(','),
      timeformat: 'unixtime',
      timezone: 'GMT',
      forecast_days: String(WEATHER_FORECAST_DAYS),
      wind_speed_unit: 'kmh',
    });
    expect(init?.headers).toEqual({
      'User-Agent': 'Trajecto/0.1.0 (projeto pessoal)',
      Accept: 'application/json',
    });
  });

  it.each([
    [''],
    ['lat=38.7'],
    ['lat=38.7,38.8&lon=-9.1'],
    ['lat=abc&lon=-9.1'],
    ['lat=38.7&lon=-9.1e1'],
    ['lat=48.86&lon=2.35'],
    [
      `lat=${Array(MAX_WEATHER_POINTS + 1)
        .fill('38.7')
        .join(',')}&lon=${Array(MAX_WEATHER_POINTS + 1)
        .fill('-9.1')
        .join(',')}`,
    ],
  ])('recusa pedidos inválidos: %s', async (query) => {
    const { fetchMock, call } = setup();
    expect((await call(query)).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('aceita as Canárias e recusa outros métodos', async () => {
    const { call } = setup();
    expect((await call('lat=28.47&lon=-16.25')).status).toBe(200);
    const post = await call('lat=38.7&lon=-9.1', { method: 'POST' });
    expect(post.status).toBe(405);
    expect(post.headers.get('allow')).toBe('GET');
  });

  it('converte falhas do serviço', async () => {
    expect((await setup(new Response('', { status: 429 })).call('lat=38.7&lon=-9.1')).status).toBe(
      429,
    );
    expect((await setup(new Response('', { status: 500 })).call('lat=38.7&lon=-9.1')).status).toBe(
      502,
    );
    const html = new Response('<html>', { headers: { 'Content-Type': 'text/html' } });
    expect((await setup(html).call('lat=38.7&lon=-9.1')).status).toBe(502);
    const big = jsonUpstream({ data: 'x'.repeat(2000) });
    expect(await (await setup(big).call('lat=38.7&lon=-9.1')).json()).toEqual({
      error: 'upstream_too_large',
    });
    const declared = jsonUpstream(
      {},
      { headers: { 'Content-Type': 'application/json', 'Content-Length': '99999' } },
    );
    expect((await setup(declared).call('lat=38.7&lon=-9.1')).status).toBe(502);
    const offline = setup(() => Promise.reject(new TypeError('fetch failed')));
    expect((await offline.call('lat=38.7&lon=-9.1')).status).toBe(502);
    const slow = setup(() => Promise.reject(new DOMException('t', 'TimeoutError')));
    expect((await slow.call('lat=38.7&lon=-9.1')).status).toBe(504);
    const broken = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('['));
          controller.error(new DOMException('t', 'TimeoutError'));
        },
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
    expect((await setup(broken).call('lat=38.7&lon=-9.1')).status).toBe(504);
  });

  it('expõe GET para o Vercel e usa as mesmas áreas da aplicação', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonUpstream([]));
    vi.stubGlobal('fetch', fetchMock);
    expect((await GET(new Request(`${BASE}?lat=38.7&lon=-9.1`))).status).toBe(200);
    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(
      /^https:\/\/api\.open-meteo\.com\/v1\/forecast\?/u,
    );
    expect(PROXY_AREAS).toEqual(ROUTING_AREAS);
  });
});
