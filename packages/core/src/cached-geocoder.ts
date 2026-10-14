import type { LngLat } from './geo';
import { roundTo } from './geo';
import type { Geocoder, ReverseOptions, SearchOptions } from './geocoder';
import type { Place } from './place';
import { comparisonKey, normalizeQuery } from './text';

export interface CacheOptions {
  readonly maxEntries?: number;
  readonly ttlMs?: number;
  /** Relógio injetável para testes. */
  readonly now?: () => number;
}

interface Entry<T> {
  readonly value: T;
  readonly expiresAt: number;
}

/**
 * Cache LRU em memória à frente de um geocodificador.
 * Reduz pedidos repetidos ao servidor público (por exemplo, ao apagar e voltar a escrever).
 * Os erros não são guardados.
 */
export function createCachedGeocoder(inner: Geocoder, options: CacheOptions = {}): Geocoder {
  const maxEntries = options.maxEntries ?? 100;
  const ttlMs = options.ttlMs ?? 10 * 60 * 1000;
  const now = options.now ?? Date.now;
  const cache = new Map<string, Entry<unknown>>();

  function read<T>(key: string): T | undefined {
    const entry = cache.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= now()) {
      cache.delete(key);
      return undefined;
    }
    // Volta a inserir para marcar como usado recentemente (ordem de inserção do Map).
    cache.delete(key);
    cache.set(key, entry);
    return entry.value as T;
  }

  function write(key: string, value: unknown): void {
    cache.delete(key);
    cache.set(key, { value, expiresAt: now() + ttlMs });
    while (cache.size > maxEntries) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
  }

  function biasKey(options: SearchOptions): string {
    if (!options.bias) return '-';
    // ~1 km de precisão: mover ligeiramente o mapa continua a aproveitar a cache.
    const { lngLat, zoom } = options.bias;
    return `${roundTo(lngLat.lat, 2)},${roundTo(lngLat.lng, 2)},${Math.round(zoom)}`;
  }

  return {
    async search(query: string, searchOptions: SearchOptions = {}): Promise<Place[]> {
      const key = `s|${comparisonKey(normalizeQuery(query))}|${biasKey(searchOptions)}|${searchOptions.limit ?? ''}`;
      const cached = read<Place[]>(key);
      if (cached) return cached;
      const result = await inner.search(query, searchOptions);
      write(key, result);
      return result;
    },

    async reverse(lngLat: LngLat, reverseOptions: ReverseOptions = {}): Promise<Place | null> {
      // ~10 m de precisão.
      const key = `r|${roundTo(lngLat.lat, 4)},${roundTo(lngLat.lng, 4)}`;
      const cached = read<{ place: Place | null }>(key);
      if (cached) return cached.place;
      const place = await inner.reverse(lngLat, reverseOptions);
      write(key, { place });
      return place;
    },
  };
}
