import type { OfflineArea, TileId } from '@trajecto/core';
import { OFFLINE_LIMITS, iterateTiles } from '@trajecto/core';
import type { OfflineTileStore } from './tileStore';

export interface DownloadProgress {
  /** Tiles tratados (transferidos ou já guardados por outra zona) e total da zona. */
  readonly done: number;
  readonly total: number;
  /** Bytes transferidos nesta transferência (comprimidos). */
  readonly bytes: number;
}

export type DownloadStatus = 'complete' | 'cancelled' | 'too_large' | 'failed' | 'storage_full';

export interface DownloadResult extends DownloadProgress {
  readonly status: DownloadStatus;
}

export interface DownloadOptions {
  readonly area: Pick<OfflineArea, 'bbox' | 'minZoom' | 'maxZoom' | 'version'>;
  readonly store: OfflineTileStore;
  readonly signal: AbortSignal;
  readonly onProgress?: (progress: DownloadProgress) => void;
  readonly fetch?: typeof fetch;
  /** Função própria que transfere um tile (com o User-Agent da app). */
  readonly url?: string;
  /** Bytes que esta transferência ainda pode usar (os termos do OpenFreeMap: 50 MB). */
  readonly maxBytes?: number;
  readonly maxParallel?: number;
  /** Espera entre tentativas (os testes usam 0). */
  readonly retryDelayMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
}

const MAX_ATTEMPTS = 3;
const MAX_RETRY_AFTER_S = 60;

class StopDownload extends Error {
  constructor(readonly status: DownloadStatus) {
    super(status);
  }
}

function isQuotaError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'QuotaExceededError';
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Transfere os tiles de uma zona (do zoom mais baixo para o mais alto) e guarda-os.
 * Respeita os termos do OpenFreeMap: no máximo 4 pedidos em paralelo e 50 MB por transferência.
 * Tiles já guardados (por exemplo, de uma zona vizinha) não voltam a ser pedidos.
 */
export async function downloadArea(options: DownloadOptions): Promise<DownloadResult> {
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  const url = options.url ?? '/api/offline-tile';
  const maxBytes = options.maxBytes ?? OFFLINE_LIMITS.maxBytes;
  const parallel = Math.min(options.maxParallel ?? OFFLINE_LIMITS.maxParallel, 4);
  const sleep = options.sleep ?? defaultSleep;
  const retryDelay = options.retryDelayMs ?? 1000;
  const { area, store, signal } = options;

  const tiles = [...iterateTiles(area.bbox, area.minZoom, area.maxZoom)];
  let next = 0;
  let done = 0;
  let bytes = 0;
  let stop: DownloadStatus | null = null;

  const report = () => options.onProgress?.({ done, total: tiles.length, bytes });

  async function fetchTile(tile: TileId): Promise<ArrayBuffer | null> {
    const query = new URLSearchParams({
      v: area.version,
      z: String(tile.z),
      x: String(tile.x),
      y: String(tile.y),
    });
    for (let attempt = 1; ; attempt += 1) {
      let response: Response;
      try {
        response = await fetchImpl(`${url}?${query.toString()}`, { signal });
      } catch {
        if (signal.aborted) throw new StopDownload('cancelled');
        if (attempt >= MAX_ATTEMPTS) throw new StopDownload('failed');
        await sleep(retryDelay * 2 ** (attempt - 1));
        continue;
      }
      if (response.status === 200) return response.arrayBuffer();
      if (response.status === 204) return null;
      await response.body?.cancel();
      if (attempt >= MAX_ATTEMPTS || (response.status !== 429 && response.status < 500)) {
        throw new StopDownload('failed');
      }
      const retryAfter = Number(response.headers.get('retry-after'));
      const wait =
        response.status === 429 && Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter, MAX_RETRY_AFTER_S) * 1000
          : retryDelay * 2 ** (attempt - 1);
      await sleep(wait);
    }
  }

  async function worker(): Promise<void> {
    while (stop === null) {
      if (signal.aborted) throw new StopDownload('cancelled');
      const tile = tiles[next];
      if (!tile) return;
      next += 1;
      if (!(await store.has(tile))) {
        const body = await fetchTile(tile);
        if (signal.aborted) throw new StopDownload('cancelled');
        const size = body?.byteLength ?? 0;
        // Verificar e somar sem "await" pelo meio: os pedidos em paralelo não passam do limite.
        if (bytes + size > maxBytes) throw new StopDownload('too_large');
        bytes += size;
        try {
          await store.put(tile, body);
        } catch (error) {
          throw new StopDownload(isQuotaError(error) ? 'storage_full' : 'failed');
        }
      }
      done += 1;
      report();
    }
  }

  const workers = Array.from({ length: parallel }, () =>
    worker().catch((error: unknown) => {
      // O primeiro motivo de paragem fica; os outros "trabalhadores" terminam a seguir.
      stop ??= error instanceof StopDownload ? error.status : 'failed';
    }),
  );
  await Promise.all(workers);
  report();
  return { status: stop ?? 'complete', done, total: tiles.length, bytes };
}
