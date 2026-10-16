// @vitest-environment node
import { ROUTING_AREAS } from '@trajecto/core';
import { describe, expect, it, vi } from 'vitest';
import { GET, ROUTING_AREAS as PROXY_AREAS, handleTransitRequest } from '../../api/transit';

const BASE = 'https://trajecto.example/api/transit';
const NOW = Date.UTC(2026, 9, 16, 7, 0);
const OK_QUERY = 'fromPlace=38.7139,-9.1404&toPlace=38.7533,-9.1442';

function jsonUpstream(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    ...init,
  });
}

function setup(response: Response | (() => Promise<Response>) = jsonUpstream({ itineraries: [] })) {
  const fetchMock = vi.fn<typeof fetch>(
    typeof response === 'function' ? response : async () => response,
  );
  const call = (query: string, init: RequestInit = {}) =>
    handleTransitRequest(new Request(`${BASE}?${query}`, init), {
      upstream: 'https://motis.test/api/v6/plan',
      fetch: fetchMock,
      timeoutMs: 50,
      maxResponseBytes: 1000,
      now: () => NOW,
    });
  return { fetchMock, call };
}

function upstreamUrl(fetchMock: ReturnType<typeof vi.fn>): URL {
  return new URL(String((fetchMock.mock.calls[0] as unknown[])[0]));
}

describe('função transit (proxy para o Transitous)', () => {
  it('usa a mesma área suportada que o core', () => {
    expect(PROXY_AREAS).toEqual(ROUTING_AREAS);
  });

  it('reconstrói o pedido só com os campos conhecidos e identifica a app', async () => {
    const { fetchMock, call } = setup();
    const response = await call(
      `${OK_QUERY}&time=2026-10-16T08:30:00.000Z&arriveBy=true&maxTransfers=0&debug=1`,
      { headers: { Cookie: 'segredo=1', 'Sec-Fetch-Site': 'same-origin' } },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, max-age=60');
    const url = upstreamUrl(fetchMock);
    expect(url.origin + url.pathname).toBe('https://motis.test/api/v6/plan');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      fromPlace: '38.7139,-9.1404',
      toPlace: '38.7533,-9.1442',
      language: 'pt',
      time: '2026-10-16T08:30:00.000Z',
      arriveBy: 'true',
    });
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get('user-agent')).toMatch(/^Trajecto\/\d+\.\d+\.\d+ \(\+https:\/\//u);
    expect(headers.has('cookie')).toBe(false);
    expect(init.redirect).toBe('error');
  });

  it('sem hora, não envia "time" nem "arriveBy"', async () => {
    const { fetchMock, call } = setup();
    await call(`${OK_QUERY}&arriveBy=true`);
    expect(upstreamUrl(fetchMock).searchParams.has('time')).toBe(false);
    expect(upstreamUrl(fetchMock).searchParams.has('arriveBy')).toBe(false);
  });

  it.each([
    ['fromPlace=38.7,-9.1', 'place'],
    ['fromPlace=48.85,2.35&toPlace=38.7,-9.1', 'place'],
    ['fromPlace=38.7;-9.1&toPlace=38.7,-9.1', 'place'],
    ['fromPlace=abc&toPlace=38.7,-9.1', 'place'],
    [`${OK_QUERY}&time=amanha`, 'time'],
    [`${OK_QUERY}&time=2026-10-16T08:30:00+01:00`, 'time'],
    [`${OK_QUERY}&time=2027-10-16T08:30:00Z`, 'time'],
    [`${OK_QUERY}&time=2026-10-10T08:30:00Z`, 'time'],
  ])('recusa pedidos inválidos: %s', async (query, field) => {
    const { fetchMock, call } = setup();
    const response = await call(query);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'bad_request', field });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('recusa outros métodos e pedidos de outros sites', async () => {
    const { call } = setup();
    expect((await call(OK_QUERY, { method: 'POST' })).status).toBe(405);
    expect((await call(OK_QUERY, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status).toBe(
      403,
    );
  });

  it('passa o limite (429) com Retry-After e a mensagem curta de pedidos recusados', async () => {
    let { call } = setup(new Response('', { status: 429, headers: { 'Retry-After': '30' } }));
    let response = await call(OK_QUERY);
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('30');

    ({ call } = setup(jsonUpstream({ error: 'x'.repeat(500) }, { status: 422 })));
    response = await call(OK_QUERY);
    expect(response.status).toBe(422);
    expect(((await response.json()) as { error: string }).error).toHaveLength(200);
  });

  it.each([
    [() => Promise.resolve(new Response('não', { status: 404 })), 502],
    [() => Promise.resolve(new Response('<html>', { status: 200 })), 502],
    [() => Promise.resolve(jsonUpstream({ big: 'x'.repeat(2000) })), 502],
    [() => Promise.reject(new TypeError('offline')), 502],
    [() => Promise.reject(new DOMException('t', 'TimeoutError')), 504],
  ])('falhas do serviço dão 502/504 (%#)', async (reply, status) => {
    const { call } = setup(reply);
    expect((await call(OK_QUERY)).status).toBe(status);
  });

  it('o ponto de entrada do Vercel usa o Transitous real', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonUpstream({ itineraries: [] }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const response = await GET(new Request(`${BASE}?${OK_QUERY}`));
      expect(response.status).toBe(200);
      expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toMatch(
        /^https:\/\/api\.transitous\.org\/api\/v6\/plan\?/u,
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
