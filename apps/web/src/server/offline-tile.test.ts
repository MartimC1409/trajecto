// @vitest-environment node
import { gunzipSync } from 'node:zlib';
import { ROUTING_AREAS, isTileInsideSupportedArea } from '@trajecto/core';
import { describe, expect, it, vi } from 'vitest';
import {
  GET,
  ROUTING_AREAS as PROXY_AREAS,
  handleOfflineTileRequest,
  isTileAllowed,
} from '../../api/offline-tile';
import { USER_AGENT as TRANSIT_USER_AGENT } from '../../api/transit';

const BASE = 'https://trajecto.example/api/offline-tile';
const LISBOA = 'v=20231227_043106_pt&z=14&x=7776&y=6277';
const TILE = new Uint8Array(Array.from({ length: 4000 }, (_, i) => i % 7));

function setup(response: Response | (() => Promise<Response>) = new Response(TILE)) {
  const fetchMock = vi.fn<typeof fetch>(
    typeof response === 'function' ? response : async () => response,
  );
  const call = (query: string, init: RequestInit = {}) =>
    handleOfflineTileRequest(new Request(`${BASE}?${query}`, init), {
      upstream: 'https://ofm.test/planet',
      fetch: fetchMock,
      timeoutMs: 50,
      maxResponseBytes: 10_000,
    });
  return { fetchMock, call };
}

describe('função offline-tile (transferências para mapas offline)', () => {
  it('usa a mesma área suportada que o core', () => {
    expect(PROXY_AREAS).toEqual(ROUTING_AREAS);
    for (const [z, x, y] of [
      [0, 0, 0],
      [5, 15, 12],
      [14, 7776, 6277],
      [14, 8298, 5637],
      [10, 900, 300],
      [8, 60, 110],
    ] as const) {
      expect(isTileAllowed(z, x, y)).toBe(isTileInsideSupportedArea({ z, x, y }));
    }
  });

  it('pede o tile da versão indicada, com o User-Agent da app, e devolve-o comprimido', async () => {
    const { fetchMock, call } = setup();
    const response = await call(LISBOA, {
      headers: { Cookie: 'segredo=1', 'Sec-Fetch-Site': 'same-origin' },
    });
    expect(response.status).toBe(200);
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe(
      'https://ofm.test/planet/20231227_043106_pt/14/7776/6277.pbf',
    );
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get('user-agent')).toBe(TRANSIT_USER_AGENT);
    expect(headers.has('cookie')).toBe(false);
    expect(init.redirect).toBe('error');
    // Comprimido mas sem Content-Encoding: o browser entrega-o à app tal como está.
    expect(response.headers.has('content-encoding')).toBe(false);
    expect(response.headers.get('content-type')).toBe('application/octet-stream');
    expect(response.headers.get('x-tile-encoding')).toBe('gzip');
    const body = new Uint8Array(await response.arrayBuffer());
    expect(Number(response.headers.get('x-tile-bytes'))).toBe(body.byteLength);
    expect(body.byteLength).toBeLessThan(TILE.byteLength);
    expect(new Uint8Array(gunzipSync(body))).toEqual(TILE);
  });

  it('aceita a versão "latest" e devolve 204 para tiles vazios', async () => {
    const { fetchMock, call } = setup(new Response(null, { status: 204 }));
    const response = await call('v=latest&z=0&x=0&y=0');
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe(
      'https://ofm.test/planet/latest/0/0/0.pbf',
    );
    expect(response.status).toBe(204);
    expect(response.headers.get('x-tile-bytes')).toBe('0');
    expect((await setup(new Response(new Uint8Array())).call(LISBOA)).status).toBe(204);
  });

  it.each([
    ['v=../x&z=14&x=7776&y=6277', 400],
    ['v=20231227_043106&z=14&x=7776&y=6277', 400],
    ['v=latest&z=15&x=0&y=0', 400],
    ['v=latest&z=14&x=-1&y=0', 400],
    ['v=latest&z=1&x=2&y=0', 400],
    ['v=latest&z=14&x=8298&y=5637', 400],
    ['v=latest&z=14&x=7776', 400],
    ['v=latest&z=1.5&x=0&y=0', 400],
  ])('recusa pedidos inválidos ou fora da área: %s', async (query, status) => {
    const { fetchMock, call } = setup();
    expect((await call(query)).status).toBe(status);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('recusa outros métodos e pedidos de outros sites', async () => {
    const { call } = setup();
    expect((await call(LISBOA, { method: 'POST' })).status).toBe(405);
    expect((await call(LISBOA, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status).toBe(403);
  });

  it('passa o limite (429) com Retry-After', async () => {
    const { call } = setup(new Response('', { status: 429, headers: { 'Retry-After': '60' } }));
    const response = await call(LISBOA);
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('60');
  });

  it.each([
    [() => Promise.resolve(new Response('não', { status: 404 })), 502],
    [() => Promise.resolve(new Response('erro', { status: 500 })), 502],
    [() => Promise.resolve(new Response(new Uint8Array(20_000))), 502],
    [() => Promise.reject(new TypeError('offline')), 502],
    [() => Promise.reject(new DOMException('t', 'TimeoutError')), 504],
  ])('falhas do serviço dão 502/504 (%#)', async (reply, status) => {
    const { call } = setup(reply);
    expect((await call(LISBOA)).status).toBe(status);
  });

  it('o ponto de entrada do Vercel usa o OpenFreeMap real', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(TILE));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const response = await GET(new Request(`${BASE}?${LISBOA}`));
      expect(response.status).toBe(200);
      expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe(
        'https://tiles.openfreemap.org/planet/20231227_043106_pt/14/7776/6277.pbf',
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
