import type { OfflineArea, TileId } from '@trajecto/core';
import { isTileInArea, openFreeMapVersion } from '@trajecto/core';
import type { AddProtocolAction } from 'maplibre-gl';
import type { OfflineTileStore } from './tileStore';
import { MAP_RESOURCES_CACHE } from './tileStore';

/**
 * Recursos do mapa através de um protocolo próprio do MapLibre (`trajecto://`), para o mapa
 * funcionar sem rede nas zonas transferidas:
 * - `trajecto://tilejson`: o TileJSON do OpenFreeMap (rede; sem rede, a última cópia guardada);
 * - `trajecto://tiles/{z}/{x}/{y}`: tiles das zonas transferidas vêm do dispositivo (mesmo com
 *   rede, para poupar dados); os outros vêm da rede, como antes;
 * - `trajecto://glyphs/{fontstack}/{range}`: tipos de letra, guardados quando são usados.
 * Os pedidos à rede são os mesmos de antes (mesmos servidores; a CSP não muda).
 */
export const MAP_PROTOCOL = 'trajecto';
export const MAP_TILEJSON_URL = 'trajecto://tilejson';
export const MAP_GLYPHS_URL = 'trajecto://glyphs/{fontstack}/{range}';
const TILE_TEMPLATE = 'trajecto://tiles/{z}/{x}/{y}';

const TILE = /^trajecto:\/\/tiles\/(\d{1,2})\/(\d{1,7})\/(\d{1,7})$/u;
const GLYPHS = /^trajecto:\/\/glyphs\/([^/]{1,200})\/(\d{1,5}-\d{1,5})$/u;
const TILEJSON_TIMEOUT_MS = 6000;

/** Tipos de letra do estilo e intervalos de caracteres do português (guardados com as zonas). */
export const OFFLINE_FONTS = ['Noto Sans Regular', 'Noto Sans Bold', 'Noto Sans Italic'];
export const OFFLINE_GLYPH_RANGES = ['0-255', '256-511', '8192-8447'];

interface TileJson {
  readonly tiles: readonly string[];
  readonly [key: string]: unknown;
}

function isTileJson(value: unknown): value is TileJson {
  if (typeof value !== 'object' || value === null) return false;
  const tiles = (value as { tiles?: unknown }).tiles;
  return Array.isArray(tiles) && tiles.length > 0 && tiles.every((t) => typeof t === 'string');
}

export interface MapResourcesOptions {
  readonly tileJsonUrl: string;
  readonly glyphsUrl: string;
  readonly store: OfflineTileStore;
  /** Cache Storage do browser (sem ela, não se guarda TileJSON nem tipos de letra). */
  readonly caches?: CacheStorage;
  /** Zonas transferidas (só os seus tiles se procuram no dispositivo). */
  readonly areas: () => readonly OfflineArea[];
  readonly fetch?: typeof fetch;
  readonly origin?: string;
  readonly timeoutMs?: number;
}

export interface MapResources {
  /** Função a registar com `addProtocol('trajecto', …)`. */
  readonly load: AddProtocolAction;
  /** Versão dos tiles atual ("latest" se o TileJSON ainda não chegou ou não a indicar). */
  version(): string;
  /** Guarda os tipos de letra usados pelo mapa (para os nomes aparecerem sem rede). */
  prefetchGlyphs(signal?: AbortSignal): Promise<void>;
}

/** Junta o cancelamento do MapLibre a um tempo máximo (sem AbortSignal.any, que é recente). */
function withTimeout(signal: AbortSignal, ms: number): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, ms);
  signal.addEventListener('abort', abort, { once: true });
  return {
    signal: controller.signal,
    done: () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
    },
  };
}

export function createMapResources(options: MapResourcesOptions): MapResources {
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  const origin = options.origin ?? globalThis.location.origin;
  const tileJsonKey = `${origin}/__offline/tilejson`;
  let template: string | null = null;

  async function resourcesCache(): Promise<Cache | null> {
    try {
      return options.caches ? await options.caches.open(MAP_RESOURCES_CACHE) : null;
    } catch {
      return null;
    }
  }

  async function loadTileJson(signal: AbortSignal): Promise<TileJson> {
    const limited = withTimeout(signal, options.timeoutMs ?? TILEJSON_TIMEOUT_MS);
    let networkError: unknown;
    try {
      const response = await fetchImpl(options.tileJsonUrl, { signal: limited.signal });
      if (!response.ok) throw new Error(`TileJSON: HTTP ${String(response.status)}`);
      const body: unknown = await response.json();
      if (!isTileJson(body)) throw new Error('TileJSON inválido');
      const cache = await resourcesCache();
      await cache?.put(tileJsonKey, Response.json(body)).catch(() => undefined);
      return body;
    } catch (error) {
      networkError = error;
    } finally {
      limited.done();
    }
    // Sem rede (ou o serviço falhou): a última cópia guardada.
    const cached = await (await resourcesCache())?.match(tileJsonKey);
    const body: unknown = cached ? await cached.json() : undefined;
    if (isTileJson(body)) return body;
    throw networkError;
  }

  async function loadTile(tile: TileId, signal: AbortSignal): Promise<ArrayBuffer> {
    if (options.areas().some((area) => isTileInArea(tile, area))) {
      const stored = await options.store.get(tile).catch(() => null);
      if (stored) return stored;
    }
    if (!template) throw new Error('Mapa: o TileJSON ainda não foi carregado.');
    const url = template
      .replace('{z}', String(tile.z))
      .replace('{x}', String(tile.x))
      .replace('{y}', String(tile.y));
    const response = await fetchImpl(url, { signal });
    if (response.status === 204) return new ArrayBuffer(0);
    if (!response.ok) throw new Error(`Tile: HTTP ${String(response.status)}`);
    return response.arrayBuffer();
  }

  async function loadGlyphs(fontstack: string, range: string, signal?: AbortSignal) {
    let name: string;
    try {
      name = decodeURIComponent(fontstack);
    } catch {
      name = fontstack;
    }
    const key = `${origin}/__offline/glyphs/${encodeURIComponent(name)}/${range}`;
    const cache = await resourcesCache();
    const cached = await cache?.match(key);
    if (cached) return cached.arrayBuffer();
    const url = options.glyphsUrl.replace('{fontstack}', encodeURI(name)).replace('{range}', range);
    const response = await fetchImpl(url, signal ? { signal } : {});
    if (response.status === 204) return new ArrayBuffer(0);
    if (!response.ok) throw new Error(`Tipos de letra: HTTP ${String(response.status)}`);
    const body = await response.arrayBuffer();
    await cache?.put(key, new Response(body.slice(0))).catch(() => undefined);
    return body;
  }

  const load: AddProtocolAction = async (params, abortController) => {
    const { signal } = abortController;
    if (params.url === MAP_TILEJSON_URL) {
      const tileJson = await loadTileJson(signal);
      template = tileJson.tiles[0] ?? null;
      return { data: { ...tileJson, tiles: [TILE_TEMPLATE] } };
    }
    const tile = TILE.exec(params.url);
    if (tile) {
      const [z, x, y] = tile.slice(1).map(Number) as [number, number, number];
      return { data: await loadTile({ z, x, y }, signal) };
    }
    const glyphs = GLYPHS.exec(params.url);
    if (glyphs?.[1] && glyphs[2]) {
      return { data: await loadGlyphs(glyphs[1], glyphs[2], signal) };
    }
    throw new Error(`Recurso do mapa desconhecido: ${params.url}`);
  };

  return {
    load,
    version: () => (template ? (openFreeMapVersion(template) ?? 'latest') : 'latest'),
    async prefetchGlyphs(signal) {
      for (const font of OFFLINE_FONTS) {
        for (const range of OFFLINE_GLYPH_RANGES) {
          if (signal?.aborted) return;
          await loadGlyphs(font, range, signal).catch(() => undefined);
        }
      }
    },
  };
}
