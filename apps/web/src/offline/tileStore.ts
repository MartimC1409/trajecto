import type { TileId } from '@trajecto/core';
import { tileKey } from '@trajecto/core';

/** Cache Storage dos tiles transferidos (o service worker da app não lhe mexe). */
export const OFFLINE_TILES_CACHE = 'trajecto-offline-tiles-v1';
/** Cache Storage dos tipos de letra e do último TileJSON (para o mapa abrir sem rede). */
export const MAP_RESOURCES_CACHE = 'trajecto-map-resources-v1';

/** Os tiles ficam guardados comprimidos (gzip), como vieram da função /api/offline-tile. */
const ENCODING_HEADER = 'X-Trajecto-Encoding';

export interface OfflineTileStore {
  has(tile: TileId): Promise<boolean>;
  /** Tile descomprimido (vazio para tiles sem dados), ou `null` se não está guardado. */
  get(tile: TileId): Promise<ArrayBuffer | null>;
  /** Guarda o tile comprimido (gzip); `null` para um tile vazio (por exemplo, mar). */
  put(tile: TileId, gzipped: ArrayBuffer | null): Promise<void>;
  delete(tiles: Iterable<TileId>): Promise<void>;
  clear(): Promise<void>;
}

/** O browser consegue guardar e ler mapas offline (Cache Storage e descompressão gzip). */
export function isOfflineSupported(): boolean {
  return (
    typeof globalThis.caches !== 'undefined' && typeof globalThis.DecompressionStream === 'function'
  );
}

export async function gunzip(data: ArrayBuffer): Promise<ArrayBuffer> {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

/**
 * Tiles guardados na Cache Storage. As chaves são URLs do próprio site que nunca são pedidas à
 * rede (servem só de nome), independentes da versão dos tiles.
 */
export function createCacheTileStore(
  storage: CacheStorage,
  origin: string = globalThis.location.origin,
): OfflineTileStore {
  const keyOf = (tile: TileId) => `${origin}/__offline/tiles/${tileKey(tile)}`;
  const open = () => storage.open(OFFLINE_TILES_CACHE);

  return {
    async has(tile) {
      return (await (await open()).match(keyOf(tile))) !== undefined;
    },
    async get(tile) {
      const response = await (await open()).match(keyOf(tile));
      if (!response) return null;
      const body = await response.arrayBuffer();
      if (body.byteLength === 0 || response.headers.get(ENCODING_HEADER) !== 'gzip') return body;
      return gunzip(body);
    },
    async put(tile, gzipped) {
      const headers = gzipped ? { [ENCODING_HEADER]: 'gzip' } : undefined;
      await (await open()).put(keyOf(tile), new Response(gzipped, { headers }));
    },
    async delete(tiles) {
      const cache = await open();
      const pending: Promise<boolean>[] = [];
      for (const tile of tiles) pending.push(cache.delete(keyOf(tile)));
      await Promise.all(pending);
    },
    async clear() {
      await storage.delete(OFFLINE_TILES_CACHE);
      await storage.delete(MAP_RESOURCES_CACHE);
    },
  };
}

export interface StorageInfo {
  /** Bytes usados e disponíveis para o site (estimativa do browser), se o browser os indicar. */
  readonly usage?: number;
  readonly quota?: number;
  /** O browser não apaga os dados sozinho quando falta espaço. */
  readonly persisted: boolean;
}

export async function storageInfo(manager: StorageManager | undefined): Promise<StorageInfo> {
  if (!manager) return { persisted: false };
  const [estimate, persisted] = await Promise.all([
    manager.estimate ? manager.estimate().catch(() => undefined) : undefined,
    manager.persisted ? manager.persisted().catch(() => false) : false,
  ]);
  return {
    ...(estimate?.usage !== undefined ? { usage: estimate.usage } : {}),
    ...(estimate?.quota !== undefined ? { quota: estimate.quota } : {}),
    persisted,
  };
}

/** Pede ao browser para não apagar os mapas guardados (o Safari e o Chrome decidem sem perguntar). */
export async function requestPersistentStorage(manager: StorageManager | undefined) {
  if (!manager?.persist) return false;
  try {
    return await manager.persist();
  } catch {
    return false;
  }
}
