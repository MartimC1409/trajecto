// @vitest-environment node
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import type { Plugin } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiPlugin } from '../../vite-api-plugin';

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

function mount(
  plugin: Plugin,
  hook: 'configureServer' | 'configurePreviewServer',
  path = '/api/route',
): Handler {
  const handlers = new Map<string, Handler>();
  const server = { middlewares: { use: (p: string, fn: Handler) => handlers.set(p, fn) } };
  (plugin[hook] as (s: unknown) => void)(server);
  const handler = handlers.get(path);
  if (!handler) throw new Error('sem middleware');
  return handler;
}

function request(method: string, body: string, headers: Record<string, string> = {}) {
  const req = Readable.from(body ? [Buffer.from(body)] : []) as unknown as IncomingMessage;
  Object.assign(req, { method, headers: { 'content-type': 'application/json', ...headers } });
  return req;
}

function response() {
  const headers = new Map<string, string>();
  let resolve: (body: string) => void = () => undefined;
  const done = new Promise<string>((r) => (resolve = r));
  const res = {
    statusCode: 0,
    setHeader: (name: string, value: string) => headers.set(name, value),
    end: (chunk?: Buffer) => resolve(chunk ? chunk.toString() : ''),
  } as unknown as ServerResponse;
  return { res, headers, done };
}

const BODY = JSON.stringify({
  locations: [
    { lat: 38.7, lon: -9.1 },
    { lat: 38.8, lon: -9.2 },
  ],
  costing: 'auto',
  language: 'pt-PT',
});

describe('apiPlugin', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('serve /api/route com a mesma função do Vercel, em dev e em preview', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response('{"trip":{}}', { headers: { 'Content-Type': 'application/json' } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const plugin = apiPlugin({ routeUpstream: 'http://localhost:8002/route' });
    for (const hook of ['configureServer', 'configurePreviewServer'] as const) {
      const { res, headers, done } = response();
      mount(plugin, hook)(request('POST', BODY, { cookie: 'x=1' }), res);
      expect(await done).toBe('{"trip":{}}');
      expect(res.statusCode).toBe(200);
      expect(headers.get('cache-control')).toBe('no-store');
    }
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:8002/route');
  });

  it('serve /api/weather com a query string original', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response('[]', { headers: { 'Content-Type': 'application/json' } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { res, done } = response();
    const req = request('GET', '');
    Object.assign(req, { url: '/?lat=38.7,38.8&lon=-9.1,-9.2' });
    mount(apiPlugin(), 'configureServer', '/api/weather')(req, res);
    expect(await done).toBe('[]');
    const upstream = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(upstream.searchParams.get('latitude')).toBe('38.7,38.8');
  });

  it('serve /api/transit com a query string original', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response('{"itineraries":[]}', { headers: { 'Content-Type': 'application/json' } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { res, done } = response();
    const req = request('GET', '');
    Object.assign(req, { url: '/?fromPlace=38.7,-9.1&toPlace=38.8,-9.2' });
    mount(apiPlugin(), 'configurePreviewServer', '/api/transit')(req, res);
    expect(await done).toBe('{"itineraries":[]}');
    const upstream = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(upstream.searchParams.get('toPlace')).toBe('38.8,-9.2');
  });

  it('serve /api/offline-tile (tiles para os mapas offline)', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const { res, done } = response();
    const req = request('GET', '');
    Object.assign(req, {
      url: '/?v=latest&z=0&x=0&y=0',
      headers: { ...req.headers, 'sec-fetch-site': 'same-origin' },
    });
    mount(apiPlugin(), 'configureServer', '/api/offline-tile')(req, res);
    expect(await done).toBe('');
    expect(res.statusCode).toBe(204);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://tiles.openfreemap.org/planet/latest/0/0/0.pbf',
    );
  });

  it('recusa corpos grandes e outros métodos, e trata erros internos', async () => {
    const handler = mount(apiPlugin(), 'configureServer');
    const big = response();
    handler(request('POST', 'x'.repeat(70_000)), big.res);
    await big.done;
    expect(big.res.statusCode).toBe(413);

    const get = response();
    handler(request('GET', ''), get.res);
    await get.done;
    expect(get.res.statusCode).toBe(405);

    const broken = response();
    const req = request('POST', BODY);
    Object.assign(req, { headers: null });
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    handler(req, broken.res);
    await broken.done;
    expect(broken.res.statusCode).toBe(500);
    error.mockRestore();
  });
});
