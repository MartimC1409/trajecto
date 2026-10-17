// @vitest-environment node
import { gzipSync } from 'node:zlib';
import type { BBox, OfflineArea } from '@trajecto/core';
import { countTiles } from '@trajecto/core';
import { describe, expect, it, vi } from 'vitest';
import { createFakeCacheStorage } from '../test/fakeCaches';
import { downloadArea } from './download';
import { MAP_GLYPHS_URL, MAP_TILEJSON_URL, createMapResources } from './mapResources';
import {
  MAP_RESOURCES_CACHE,
  OFFLINE_TILES_CACHE,
  createCacheTileStore,
  gunzip,
  isOfflineSupported,
  requestPersistentStorage,
  storageInfo,
} from './tileStore';

const ORIGIN = 'https://trajecto.test';
const TILE = { z: 14, x: 7776, y: 6277 };
const RAW = new TextEncoder().encode('tile vetorial '.repeat(50));
const GZ = new Uint8Array(gzipSync(RAW));
/** Zona pequena (alguns quarteirões da Baixa): 18 tiles do zoom 0 ao 14. */
const SMALL: BBox = [-9.14, 38.708, -9.135, 38.712];

function toBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function area(overrides: Partial<OfflineArea> = {}): OfflineArea {
  return {
    id: 'a',
    name: 'Baixa',
    bbox: SMALL,
    minZoom: 0,
    maxZoom: 14,
    tiles: 0,
    bytes: 0,
    version: '20261011_080001_pt',
    createdAt: 0,
    complete: true,
    ...overrides,
  };
}

describe('armazenamento dos tiles (Cache Storage)', () => {
  it('guarda comprimido, devolve descomprimido e trata tiles vazios', async () => {
    const caches = createFakeCacheStorage();
    const store = createCacheTileStore(caches, ORIGIN);
    expect(await store.has(TILE)).toBe(false);
    expect(await store.get(TILE)).toBeNull();
    await store.put(TILE, toBuffer(GZ));
    expect(await store.has(TILE)).toBe(true);
    expect(new Uint8Array((await store.get(TILE)) ?? new ArrayBuffer(0))).toEqual(RAW);
    const cache = await caches.open(OFFLINE_TILES_CACHE);
    const stored = await cache.match(`${ORIGIN}/__offline/tiles/14/7776/6277`);
    expect((await stored?.arrayBuffer())?.byteLength).toBe(GZ.byteLength);

    await store.put({ z: 3, x: 3, y: 3 }, null);
    expect((await store.get({ z: 3, x: 3, y: 3 }))?.byteLength).toBe(0);

    await store.delete([TILE]);
    expect(await store.has(TILE)).toBe(false);
    await caches.open(MAP_RESOURCES_CACHE);
    await store.clear();
    expect(await caches.has(OFFLINE_TILES_CACHE)).toBe(false);
    expect(await caches.has(MAP_RESOURCES_CACHE)).toBe(false);
  });

  it('descomprime gzip e deteta o suporte do browser', async () => {
    expect(new Uint8Array(await gunzip(toBuffer(GZ)))).toEqual(RAW);
    vi.stubGlobal('caches', createFakeCacheStorage());
    try {
      expect(isOfflineSupported()).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
    expect(isOfflineSupported()).toBe(false);
  });

  it('lê o espaço usado e pede armazenamento persistente', async () => {
    expect(await storageInfo(undefined)).toEqual({ persisted: false });
    const manager = {
      estimate: async () => ({ usage: 1000, quota: 5000 }),
      persisted: async () => true,
      persist: async () => true,
    } as unknown as StorageManager;
    expect(await storageInfo(manager)).toEqual({ usage: 1000, quota: 5000, persisted: true });
    expect(await requestPersistentStorage(manager)).toBe(true);
    expect(await requestPersistentStorage(undefined)).toBe(false);
    const failing = {
      estimate: async () => Promise.reject(new Error('x')),
      persisted: async () => Promise.reject(new Error('x')),
      persist: async () => Promise.reject(new Error('x')),
    } as unknown as StorageManager;
    expect(await storageInfo(failing)).toEqual({ persisted: false });
    expect(await requestPersistentStorage(failing)).toBe(false);
  });
});

describe('downloadArea', () => {
  function tileServer(reply: (url: URL, call: number) => Response | Promise<Response>) {
    let calls = 0;
    let active = 0;
    let maxActive = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      calls += 1;
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return reply(new URL(String(input), ORIGIN), calls);
    });
    return { fetchMock, maxActive: () => maxActive };
  }

  it('transfere todos os tiles com no máximo 4 pedidos em paralelo e guarda-os', async () => {
    const store = createCacheTileStore(createFakeCacheStorage(), ORIGIN);
    const server = tileServer((url) =>
      url.searchParams.get('z') === '0'
        ? new Response(null, { status: 204 })
        : new Response(toBuffer(GZ)),
    );
    const progress: number[] = [];
    const result = await downloadArea({
      area: area(),
      store,
      signal: new AbortController().signal,
      fetch: server.fetchMock,
      onProgress: (p) => progress.push(p.done),
    });
    const total = countTiles(SMALL);
    expect(result).toEqual({
      status: 'complete',
      done: total,
      total,
      bytes: (total - 1) * GZ.byteLength,
    });
    expect(server.fetchMock).toHaveBeenCalledTimes(total);
    expect(server.maxActive()).toBeLessThanOrEqual(4);
    expect(progress.at(-1)).toBe(total);
    const first = new URL(String(server.fetchMock.mock.calls[0]?.[0]), ORIGIN);
    expect(first.pathname).toBe('/api/offline-tile');
    expect(Object.fromEntries(first.searchParams)).toEqual({
      v: '20261011_080001_pt',
      z: '0',
      x: '0',
      y: '0',
    });
    expect(await store.has({ z: 0, x: 0, y: 0 })).toBe(true);

    // Uma segunda transferência da mesma zona não pede nada à rede.
    const again = tileServer(() => new Response(toBuffer(GZ)));
    const second = await downloadArea({
      area: area(),
      store,
      signal: new AbortController().signal,
      fetch: again.fetchMock,
    });
    expect(second).toMatchObject({ status: 'complete', done: total, bytes: 0 });
    expect(again.fetchMock).not.toHaveBeenCalled();
  });

  it('para no limite de bytes, sem o ultrapassar', async () => {
    const store = createCacheTileStore(createFakeCacheStorage(), ORIGIN);
    const server = tileServer(() => new Response(toBuffer(GZ)));
    const result = await downloadArea({
      area: area(),
      store,
      signal: new AbortController().signal,
      fetch: server.fetchMock,
      maxBytes: GZ.byteLength * 5,
    });
    expect(result.status).toBe('too_large');
    expect(result.bytes).toBeLessThanOrEqual(GZ.byteLength * 5);
  });

  it('espera quando o serviço pede (429) e tenta de novo; falha depois de 3 tentativas', async () => {
    const store = createCacheTileStore(createFakeCacheStorage(), ORIGIN);
    const sleep = vi.fn(async () => undefined);
    const server = tileServer((_url, call) =>
      call === 1
        ? new Response('', { status: 429, headers: { 'Retry-After': '120' } })
        : new Response(toBuffer(GZ)),
    );
    const ok = await downloadArea({
      area: area(),
      store,
      signal: new AbortController().signal,
      fetch: server.fetchMock,
      maxParallel: 1,
      sleep,
    });
    expect(ok.status).toBe('complete');
    // Retry-After de 120 s fica limitado a 60 s.
    expect(sleep).toHaveBeenCalledWith(60_000);

    const broken = tileServer(() => new Response('erro', { status: 502 }));
    const failed = await downloadArea({
      area: area(),
      store: createCacheTileStore(createFakeCacheStorage(), ORIGIN),
      signal: new AbortController().signal,
      fetch: broken.fetchMock,
      maxParallel: 1,
      retryDelayMs: 0,
      sleep,
    });
    expect(failed).toMatchObject({ status: 'failed', done: 0 });
    expect(broken.fetchMock).toHaveBeenCalledTimes(3);

    const refused = tileServer(() => new Response('', { status: 400 }));
    expect(
      (
        await downloadArea({
          area: area(),
          store: createCacheTileStore(createFakeCacheStorage(), ORIGIN),
          signal: new AbortController().signal,
          fetch: refused.fetchMock,
          maxParallel: 1,
        })
      ).status,
    ).toBe('failed');
    expect(refused.fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sem rede tenta 3 vezes; cancelado pára; espaço cheio pára', async () => {
    const offline = vi.fn(async () => {
      throw new TypeError('failed to fetch');
    });
    const failed = await downloadArea({
      area: area(),
      store: createCacheTileStore(createFakeCacheStorage(), ORIGIN),
      signal: new AbortController().signal,
      fetch: offline,
      maxParallel: 1,
      retryDelayMs: 0,
    });
    expect(failed.status).toBe('failed');
    expect(offline).toHaveBeenCalledTimes(3);

    const controller = new AbortController();
    const server = tileServer(() => {
      controller.abort();
      return new Response(toBuffer(GZ));
    });
    const cancelled = await downloadArea({
      area: area(),
      store: createCacheTileStore(createFakeCacheStorage(), ORIGIN),
      signal: controller.signal,
      fetch: server.fetchMock,
    });
    expect(cancelled.status).toBe('cancelled');

    const aborted = new AbortController();
    aborted.abort();
    const abortedFetch = vi.fn(async () => {
      throw new DOMException('x', 'AbortError');
    });
    expect(
      (
        await downloadArea({
          area: area(),
          store: createCacheTileStore(createFakeCacheStorage(), ORIGIN),
          signal: aborted.signal,
          fetch: abortedFetch,
        })
      ).status,
    ).toBe('cancelled');

    const caches = createFakeCacheStorage();
    caches.failNextPut = new DOMException('cheio', 'QuotaExceededError');
    const full = await downloadArea({
      area: area(),
      store: createCacheTileStore(caches, ORIGIN),
      signal: new AbortController().signal,
      fetch: tileServer(() => new Response(toBuffer(GZ))).fetchMock,
      maxParallel: 1,
    });
    expect(full.status).toBe('storage_full');

    const broken = createFakeCacheStorage();
    broken.failNextPut = new Error('outro erro');
    expect(
      (
        await downloadArea({
          area: area(),
          store: createCacheTileStore(broken, ORIGIN),
          signal: new AbortController().signal,
          fetch: tileServer(() => new Response(toBuffer(GZ))).fetchMock,
          maxParallel: 1,
        })
      ).status,
    ).toBe('failed');
  });
});

describe('recursos do mapa (protocolo trajecto://)', () => {
  const TILEJSON = {
    tilejson: '3.0.0',
    tiles: ['https://ofm.test/planet/20261011_080001_pt/{z}/{x}/{y}.pbf'],
    maxzoom: 14,
    attribution: 'OpenFreeMap',
  };

  function setup(areas: OfflineArea[] = []) {
    const caches = createFakeCacheStorage();
    const store = createCacheTileStore(caches, ORIGIN);
    let online = true;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (!online) throw new TypeError('offline');
      const url = String(input);
      if (url === 'https://ofm.test/planet') return Response.json(TILEJSON);
      if (url.startsWith('https://ofm.test/fonts/')) return new Response(new Uint8Array([1, 2, 3]));
      if (url.endsWith('/0/0/0.pbf')) return new Response(null, { status: 204 });
      if (url.includes('/planet/')) return new Response(RAW);
      return new Response('não', { status: 404 });
    });
    const resources = createMapResources({
      tileJsonUrl: 'https://ofm.test/planet',
      glyphsUrl: 'https://ofm.test/fonts/{fontstack}/{range}.pbf',
      store,
      caches,
      areas: () => areas,
      fetch: fetchMock,
      origin: ORIGIN,
      timeoutMs: 50,
    });
    const load = (url: string) =>
      resources.load({ url, type: 'arrayBuffer' }, new AbortController());
    return {
      store,
      fetchMock,
      resources,
      load,
      goOffline: () => {
        online = false;
      },
    };
  }

  it('o TileJSON aponta os tiles para o protocolo e fica guardado para usar sem rede', async () => {
    const { load, resources, goOffline } = setup();
    expect(resources.version()).toBe('latest');
    const { data } = await load(MAP_TILEJSON_URL);
    expect(data).toEqual({ ...TILEJSON, tiles: ['trajecto://tiles/{z}/{x}/{y}'] });
    expect(resources.version()).toBe('20261011_080001_pt');
    goOffline();
    expect((await load(MAP_TILEJSON_URL)).data).toEqual(data);
  });

  it('sem rede e sem cópia guardada, o TileJSON falha', async () => {
    const { load, goOffline } = setup();
    goOffline();
    await expect(load(MAP_TILEJSON_URL)).rejects.toThrow('offline');
  });

  it('tiles das zonas guardadas vêm do dispositivo; os outros, da rede', async () => {
    // Zona dentro do tile 14/7776/6277 (Avenida da Liberdade).
    const { load, store, fetchMock, goOffline } = setup([
      area({ bbox: [-9.139, 38.722, -9.12, 38.735] }),
    ]);
    await load(MAP_TILEJSON_URL);
    await expect(load('trajecto://tiles/14/7776/6277')).resolves.toBeDefined();
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://ofm.test/planet/20261011_080001_pt/14/7776/6277.pbf',
      expect.anything(),
    );
    // 204 do servidor: tile vazio.
    expect(((await load('trajecto://tiles/0/0/0')).data as ArrayBuffer).byteLength).toBe(0);

    // Guardado (dentro da zona): vem do dispositivo, sem pedido à rede.
    await store.put(TILE, toBuffer(GZ));
    fetchMock.mockClear();
    const local = await load('trajecto://tiles/14/7776/6277');
    expect(new Uint8Array(local.data as ArrayBuffer)).toEqual(RAW);
    expect(fetchMock).not.toHaveBeenCalled();

    goOffline();
    await expect(load('trajecto://tiles/14/7000/6000')).rejects.toThrow();
  });

  it('sem TileJSON não se pedem tiles à rede; recursos desconhecidos dão erro', async () => {
    const { load } = setup();
    await expect(load('trajecto://tiles/14/1/1')).rejects.toThrow('TileJSON');
    await expect(load('trajecto://outro')).rejects.toThrow('desconhecido');
    await expect(load('trajecto://tiles/1/x/1')).rejects.toThrow('desconhecido');
  });

  it('erros HTTP do serviço de tiles e de tipos de letra dão erro', async () => {
    const { load, fetchMock } = setup();
    await load(MAP_TILEJSON_URL);
    fetchMock.mockImplementationOnce(async () => new Response('x', { status: 500 }));
    await expect(load('trajecto://tiles/14/1/1')).rejects.toThrow('HTTP 500');
    fetchMock.mockImplementationOnce(async () => new Response('x', { status: 500 }));
    await expect(load('trajecto://glyphs/Noto Sans Regular/0-255')).rejects.toThrow('HTTP 500');
    fetchMock.mockImplementationOnce(async () => new Response(null, { status: 204 }));
    expect(
      ((await load('trajecto://glyphs/Noto Sans Regular/0-255')).data as ArrayBuffer).byteLength,
    ).toBe(0);
  });

  it('TileJSON inválido ou com erro HTTP usa a cópia guardada', async () => {
    const { load, fetchMock } = setup();
    await load(MAP_TILEJSON_URL);
    fetchMock.mockImplementationOnce(async () => Response.json({ tiles: [] }));
    expect((await load(MAP_TILEJSON_URL)).data).toMatchObject({ maxzoom: 14 });
    fetchMock.mockImplementationOnce(async () => new Response('x', { status: 503 }));
    expect((await load(MAP_TILEJSON_URL)).data).toMatchObject({ maxzoom: 14 });
  });

  it('tipos de letra: pedidos com o nome codificado e guardados para usar sem rede', async () => {
    const { load, fetchMock, resources, goOffline } = setup();
    const url = MAP_GLYPHS_URL.replace('{fontstack}', 'Noto Sans Bold').replace('{range}', '0-255');
    const first = await load(url);
    expect(new Uint8Array(first.data as ArrayBuffer)).toEqual(new Uint8Array([1, 2, 3]));
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://ofm.test/fonts/Noto%20Sans%20Bold/0-255.pbf',
      expect.anything(),
    );
    await resources.prefetchGlyphs();
    goOffline();
    expect(new Uint8Array((await load(url)).data as ArrayBuffer)).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    expect(
      (await load('trajecto://glyphs/Noto%20Sans%20Italic/8192-8447')).data as ArrayBuffer,
    ).toBeInstanceOf(ArrayBuffer);
    // Nome com "%" inválido: usa-se tal como está.
    await expect(load('trajecto://glyphs/%E0/0-255')).rejects.toThrow();
    const cancelled = new AbortController();
    cancelled.abort();
    await resources.prefetchGlyphs(cancelled.signal);
  });
});
