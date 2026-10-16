// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { buildServiceWorker, serviceWorkerPlugin } from '../../vite-sw-plugin';
import { createFakeCacheStorage } from '../test/fakeCaches';
import { registerServiceWorker } from './register';

const TEMPLATE_PATH = new URL('../../sw/service-worker.js', import.meta.url);
const ORIGIN = 'https://trajecto.test';
const PRECACHE = ['/index.html', '/assets/app-abc.js', '/icons/icon.svg'];

type Listener = (event: Record<string, unknown>) => void;

/** Corre o service worker real num contexto isolado, com Cache Storage e rede simuladas. */
async function loadWorker(network: (request: Request) => Promise<Response>) {
  const template = await readFile(TEMPLATE_PATH, 'utf8');
  const source = buildServiceWorker(template, PRECACHE, 'v2');
  const listeners = new Map<string, Listener>();
  const caches = createFakeCacheStorage();
  const self = {
    location: new URL(`${ORIGIN}/sw.js`),
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    skipWaiting: vi.fn(async () => undefined),
    clients: { claim: vi.fn(async () => undefined) },
  };
  const fetchMock = vi.fn(network);
  runInNewContext(source, {
    self,
    caches,
    fetch: fetchMock,
    URL,
    Response,
    Promise,
    setTimeout,
    Error,
  });

  async function dispatch(type: string, extra: Record<string, unknown> = {}) {
    let waited: Promise<unknown> | undefined;
    let responded: Promise<Response> | undefined;
    listeners.get(type)?.({
      ...extra,
      waitUntil: (p: Promise<unknown>) => {
        waited = p;
      },
      respondWith: (p: Promise<Response>) => {
        responded = p;
      },
    });
    await waited;
    return responded;
  }

  function request(path: string, init: { mode?: string; method?: string; origin?: string } = {}) {
    return {
      url: `${init.origin ?? ORIGIN}${path}`,
      method: init.method ?? 'GET',
      mode: init.mode ?? 'cors',
    };
  }

  return { dispatch, request, caches, self, fetchMock };
}

describe('service worker', () => {
  it('na instalação guarda os ficheiros da app e ativa-se logo', async () => {
    const sw = await loadWorker(async () => new Response('rede'));
    await sw.dispatch('install');
    const cache = await sw.caches.open('trajecto-app-v2');
    expect((await cache.keys()).map((r) => new URL(r.url, ORIGIN).pathname)).toEqual(PRECACHE);
    expect(sw.self.skipWaiting).toHaveBeenCalled();
  });

  it('ao ativar apaga só as versões antigas da app (nunca os mapas offline)', async () => {
    const sw = await loadWorker(async () => new Response('rede'));
    await sw.caches.open('trajecto-app-v1');
    await sw.caches.open('trajecto-app-v2');
    await sw.caches.open('trajecto-offline-tiles-v1');
    await sw.caches.open('trajecto-map-resources-v1');
    await sw.dispatch('activate');
    expect(await sw.caches.keys()).toEqual([
      'trajecto-app-v2',
      'trajecto-offline-tiles-v1',
      'trajecto-map-resources-v1',
    ]);
    expect(sw.self.clients.claim).toHaveBeenCalled();
  });

  it('página: da rede quando há; sem rede, a cópia guardada', async () => {
    let online = true;
    const sw = await loadWorker(async () => {
      if (!online) throw new TypeError('offline');
      return new Response('página nova');
    });
    await sw.dispatch('install');
    const cache = await sw.caches.open('trajecto-app-v2');
    await cache.put('/index.html', new Response('página guardada'));

    const fresh = await sw.dispatch('fetch', { request: sw.request('/', { mode: 'navigate' }) });
    expect(await fresh?.text()).toBe('página nova');
    online = false;
    const cached = await sw.dispatch('fetch', { request: sw.request('/', { mode: 'navigate' }) });
    expect(await cached?.text()).toBe('página guardada');
  });

  it('página: sem rede e sem cópia, o erro chega ao browser', async () => {
    const sw = await loadWorker(async () => {
      throw new TypeError('offline');
    });
    const response = sw.dispatch('fetch', { request: sw.request('/', { mode: 'navigate' }) });
    await expect(response).rejects.toThrow('offline');
  });

  it('página: rede lenta (mais de 4 s) usa a cópia guardada', async () => {
    vi.useFakeTimers();
    try {
      const sw = await loadWorker(() => new Promise<Response>(() => undefined));
      const cache = await sw.caches.open('trajecto-app-v2');
      await cache.put('/index.html', new Response('página guardada'));
      const pending = sw.dispatch('fetch', { request: sw.request('/', { mode: 'navigate' }) });
      await vi.advanceTimersByTimeAsync(4000);
      expect(await (await pending)?.text()).toBe('página guardada');
    } finally {
      vi.useRealTimers();
    }
  });

  it('código e ícones da cópia guardada; se faltarem, da rede', async () => {
    const sw = await loadWorker(async () => new Response('da rede'));
    const cache = await sw.caches.open('trajecto-app-v2');
    await cache.put('/assets/app-abc.js', new Response('guardado'));
    const js = await sw.dispatch('fetch', { request: sw.request('/assets/app-abc.js') });
    expect(await js?.text()).toBe('guardado');
    const icon = await sw.dispatch('fetch', { request: sw.request('/icons/icon.svg') });
    expect(await icon?.text()).toBe('da rede');
  });

  it.each([
    ['/api/route', {}],
    ['/geocoder/api?q=x', {}],
    ['/__offline/tiles/1/2/3', {}],
    ['/assets/app-abc.js', { method: 'POST' }],
    ['/assets/app-abc.js', { origin: 'https://tiles.openfreemap.org' }],
    ['/outro.txt', {}],
  ])('não interfere com %s %o', async (path, init) => {
    const sw = await loadWorker(async () => new Response('rede'));
    expect(await sw.dispatch('fetch', { request: sw.request(path, init) })).toBeUndefined();
  });
});

describe('plugin do service worker (build)', () => {
  it('escreve a versão e a lista e recusa modelos sem os marcadores', () => {
    const out = buildServiceWorker(
      'const V = self.__TRAJECTO_VERSION__; const P = self.__TRAJECTO_PRECACHE__;',
      ['/a.js'],
      'abc',
    );
    expect(out).toBe('const V = "abc"; const P = ["/a.js"];');
    expect(() => buildServiceWorker('nada', [], 'x')).toThrow('tem de aparecer');
  });

  it('lista os ficheiros da build e de public/, sem os .map, com uma versão do conteúdo', async () => {
    const root = await mkdtemp(join(tmpdir(), 'trajecto-sw-'));
    try {
      await mkdir(join(root, 'public', 'icons'), { recursive: true });
      await writeFile(join(root, 'public', 'icons', 'a.svg'), '<svg/>');
      await writeFile(join(root, 'public', 'manifest.webmanifest'), '{}');
      const plugin = serviceWorkerPlugin({
        template: 'V=self.__TRAJECTO_VERSION__;P=self.__TRAJECTO_PRECACHE__;',
      });
      (plugin.configResolved as (c: unknown) => void)({ root, publicDir: join(root, 'public') });
      const emitted: { fileName: string; source: string }[] = [];
      const bundle = {
        'assets/app-1.js': { type: 'chunk', code: 'console.log(1)' },
        'assets/app-1.js.map': { type: 'asset', source: '{}' },
        'assets/app.css': { type: 'asset', source: 'body{}' },
      };
      await (plugin.generateBundle as (o: unknown, b: unknown) => Promise<void>).call(
        { emitFile: (file: { fileName: string; source: string }) => emitted.push(file) },
        {},
        bundle,
      );
      const sw = emitted[0];
      expect(sw?.fileName).toBe('sw.js');
      expect(sw?.source).toMatch(/^V="[0-9a-f]{16}";P=/u);
      expect(JSON.parse(sw?.source.split('P=')[1]?.replace(/;$/u, '') ?? '[]')).toEqual([
        '/assets/app-1.js',
        '/assets/app.css',
        '/icons/a.svg',
        '/index.html',
        '/manifest.webmanifest',
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('registerServiceWorker', () => {
  it('regista /sw.js depois do carregamento, só na versão de produção', async () => {
    const listeners: Record<string, () => void> = {};
    const target = { addEventListener: (type: string, fn: () => void) => (listeners[type] = fn) };
    const register = vi.fn(async () => ({}) as ServiceWorkerRegistration);
    const container = { register } as unknown as ServiceWorkerContainer;
    registerServiceWorker({ enabled: false, container, target: target as unknown as Window });
    expect(listeners.load).toBeUndefined();
    registerServiceWorker({ enabled: true, container, target: target as unknown as Window });
    listeners.load?.();
    expect(register).toHaveBeenCalledWith('/sw.js');

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    register.mockRejectedValueOnce(new Error('bloqueado'));
    listeners.load?.();
    await vi.waitFor(() => expect(warn).toHaveBeenCalled());
    warn.mockRestore();
    // Sem suporte no browser: não faz nada.
    registerServiceWorker({ enabled: true, target: target as unknown as Window });
  });
});
