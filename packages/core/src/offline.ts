// Tem de ser o primeiro import: desliga o `eval` do zod antes de criar esquemas (CSP).
import './csp';
import { z } from 'zod';
import type { BBox, LngLat } from './geo';
import type { KeyValueStorage, PersistentStore } from './persistent-store';
import { createPersistentStore } from './persistent-store';
import { ROUTING_AREAS } from './routing';

/**
 * Mapas offline (Fase 7): zonas do mapa transferidas para usar sem rede.
 *
 * Os termos do OpenFreeMap (verificados em 2026-10-16, "Offline Downloads") permitem que uma app
 * transfira zonas para uso offline se cada transferência tiver no máximo 3000 tiles ou 50 MB, usar
 * no máximo 4 pedidos em paralelo e enviar um User-Agent próprio que identifique a app (por isso os
 * pedidos passam pela função `/api/offline-tile`). Ver docs/adr/0016.
 */
export const OFFLINE_LIMITS = {
  maxTiles: 3000,
  maxBytes: 50_000_000,
  maxParallel: 4,
} as const;

/** Os tiles do OpenFreeMap vão do zoom 0 ao 14 (acima disso o mapa amplia os do 14). */
export const OFFLINE_MIN_ZOOM = 0;
export const OFFLINE_MAX_ZOOM = 14;
export const MAX_OFFLINE_AREAS = 20;
export const OFFLINE_AREAS_STORAGE_KEY = 'trajecto:v1:offline-areas';

export interface TileId {
  readonly z: number;
  readonly x: number;
  readonly y: number;
}

/** Latitude máxima da projeção Web Mercator. */
const MAX_LAT = 85.0511287798066;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Tile (x, y) que contém um ponto, no zoom `z` (esquema XYZ, y a crescer para sul). */
export function lngLatToTile(point: LngLat, zoom: number): { x: number; y: number } {
  const n = 2 ** zoom;
  const lat = (clamp(point.lat, -MAX_LAT, MAX_LAT) * Math.PI) / 180;
  const x = Math.floor(((point.lng + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * n);
  return { x: clamp(x, 0, n - 1), y: clamp(y, 0, n - 1) };
}

/** Retângulo geográfico de um tile. */
export function tileBBox(tile: TileId): BBox {
  const n = 2 ** tile.z;
  const lat = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  return [(tile.x / n) * 360 - 180, lat(tile.y + 1), ((tile.x + 1) / n) * 360 - 180, lat(tile.y)];
}

export function isValidTile(tile: TileId): boolean {
  if (![tile.z, tile.x, tile.y].every(Number.isInteger)) return false;
  if (tile.z < 0 || tile.z > 22) return false;
  const n = 2 ** tile.z;
  return tile.x >= 0 && tile.x < n && tile.y >= 0 && tile.y < n;
}

export function tileKey(tile: TileId): string {
  return `${String(tile.z)}/${String(tile.x)}/${String(tile.y)}`;
}

export function isValidBBox(bbox: BBox): boolean {
  const [west, south, east, north] = bbox;
  return (
    bbox.every(Number.isFinite) &&
    west >= -180 &&
    east <= 180 &&
    south >= -90 &&
    north <= 90 &&
    west < east &&
    south < north
  );
}

export function bboxesIntersect(a: BBox, b: BBox): boolean {
  return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
}

/** O tile toca na área suportada pela app (Portugal, Espanha, ilhas e Canárias). */
export function isTileInsideSupportedArea(tile: TileId): boolean {
  const bbox = tileBBox(tile);
  return ROUTING_AREAS.some((area) => bboxesIntersect(bbox, area));
}

interface TileRange {
  readonly z: number;
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

function tileRanges(bbox: BBox, minZoom: number, maxZoom: number): TileRange[] {
  const ranges: TileRange[] = [];
  for (let zoom = minZoom; zoom <= maxZoom; zoom += 1) {
    const northWest = lngLatToTile({ lng: bbox[0], lat: bbox[3] }, zoom);
    // O canto sudeste fica dentro do último tile (o limite exato pertence ao tile seguinte).
    const southEast = lngLatToTile({ lng: bbox[2] - 1e-9, lat: bbox[1] + 1e-9 }, zoom);
    ranges.push({
      z: zoom,
      minX: northWest.x,
      maxX: Math.max(northWest.x, southEast.x),
      minY: northWest.y,
      maxY: Math.max(northWest.y, southEast.y),
    });
  }
  return ranges;
}

/** Número de tiles de uma zona entre dois zooms (inclusive). */
export function countTiles(
  bbox: BBox,
  minZoom = OFFLINE_MIN_ZOOM,
  maxZoom = OFFLINE_MAX_ZOOM,
): number {
  return tileRanges(bbox, minZoom, maxZoom).reduce(
    (sum, r) => sum + (r.maxX - r.minX + 1) * (r.maxY - r.minY + 1),
    0,
  );
}

/** Tiles de uma zona, dos zooms baixos para os altos (uma transferência a meio já serve). */
export function* iterateTiles(
  bbox: BBox,
  minZoom = OFFLINE_MIN_ZOOM,
  maxZoom = OFFLINE_MAX_ZOOM,
): Generator<TileId> {
  for (const r of tileRanges(bbox, minZoom, maxZoom)) {
    for (let x = r.minX; x <= r.maxX; x += 1) {
      for (let y = r.minY; y <= r.maxY; y += 1) yield { z: r.z, x, y };
    }
  }
}

/** Versão dos tiles do OpenFreeMap no modelo de URL do TileJSON (por exemplo "20231227_043106_pt"). */
export const OPENFREEMAP_VERSION = /^\d{8}_\d{6}_pt$/u;

export function openFreeMapVersion(tileUrlTemplate: string): string | null {
  const match = /\/planet\/(\d{8}_\d{6}_pt)\/\{z\}\/\{x\}\/\{y\}\.pbf$/u.exec(tileUrlTemplate);
  return match?.[1] ?? null;
}

export type OfflineAreaCheck =
  | { readonly ok: true; readonly bbox: BBox; readonly tiles: number }
  | {
      readonly ok: false;
      readonly reason: 'invalid' | 'outside_area' | 'too_many_tiles';
      readonly tiles: number;
    };

/**
 * Verifica se a zona visível pode ser transferida: corta-a à área suportada (a função só aceita
 * tiles dessa área) e conta os tiles do zoom 0 ao 14.
 */
export function checkOfflineArea(bbox: BBox): OfflineAreaCheck {
  if (!isValidBBox(bbox)) return { ok: false, reason: 'invalid', tiles: 0 };
  const center = { lng: (bbox[0] + bbox[2]) / 2, lat: (bbox[1] + bbox[3]) / 2 };
  const area = ROUTING_AREAS.find(
    (a) => center.lng >= a[0] && center.lng <= a[2] && center.lat >= a[1] && center.lat <= a[3],
  );
  if (!area) return { ok: false, reason: 'outside_area', tiles: 0 };
  const clipped: BBox = [
    Math.max(bbox[0], area[0]),
    Math.max(bbox[1], area[1]),
    Math.min(bbox[2], area[2]),
    Math.min(bbox[3], area[3]),
  ];
  const tiles = countTiles(clipped);
  if (tiles > OFFLINE_LIMITS.maxTiles) return { ok: false, reason: 'too_many_tiles', tiles };
  return { ok: true, bbox: clipped, tiles };
}

const bboxSchema = z
  .tuple([z.number(), z.number(), z.number(), z.number()])
  .refine((b) => isValidBBox(b))
  .readonly();

const areaSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().max(200),
  bbox: bboxSchema,
  minZoom: z.number().int().min(0).max(OFFLINE_MAX_ZOOM),
  maxZoom: z.number().int().min(0).max(OFFLINE_MAX_ZOOM),
  /** Tiles guardados e bytes recebidos (comprimidos). */
  tiles: z.number().int().min(0),
  bytes: z.number().int().min(0),
  /** Versão dos tiles do OpenFreeMap ("latest" se o TileJSON não a indicar). */
  version: z.string().max(40),
  createdAt: z.number(),
  /** `false` se a transferência parou a meio (cancelada, sem rede, limite de tamanho). */
  complete: z.boolean(),
});
export type OfflineArea = z.infer<typeof areaSchema>;

const stateSchema = z.object({
  version: z.literal(1),
  areas: z.array(areaSchema).max(MAX_OFFLINE_AREAS),
});
export type OfflineAreasState = z.infer<typeof stateSchema>;

const EMPTY: OfflineAreasState = { version: 1, areas: [] };

/** O tile pertence à zona (mesmo intervalo de zoom e dentro do retângulo nesse zoom). */
export function isTileInArea(
  tile: TileId,
  area: Pick<OfflineArea, 'bbox' | 'minZoom' | 'maxZoom'>,
): boolean {
  if (tile.z < area.minZoom || tile.z > area.maxZoom) return false;
  const [range] = tileRanges(area.bbox, tile.z, tile.z);
  return (
    range !== undefined &&
    tile.x >= range.minX &&
    tile.x <= range.maxX &&
    tile.y >= range.minY &&
    tile.y <= range.maxY
  );
}

/** Tiles de `area` que nenhuma das `others` usa (os que se podem apagar ao remover a zona). */
export function* tilesOnlyIn(
  area: Pick<OfflineArea, 'bbox' | 'minZoom' | 'maxZoom'>,
  others: readonly Pick<OfflineArea, 'bbox' | 'minZoom' | 'maxZoom'>[],
): Generator<TileId> {
  for (const tile of iterateTiles(area.bbox, area.minZoom, area.maxZoom)) {
    if (!others.some((other) => isTileInArea(tile, other))) yield tile;
  }
}

export interface OfflineAreasStore {
  getSnapshot(): OfflineAreasState;
  isPersistent(): boolean;
  subscribe(listener: () => void): () => void;
  /** Regista uma zona nova (ainda vazia); `null` se já há o máximo de zonas. */
  add(input: Pick<OfflineArea, 'name' | 'bbox' | 'version'>): OfflineArea | null;
  /** Atualiza o progresso de uma zona (tiles, bytes, concluída). */
  update(id: string, patch: Partial<Pick<OfflineArea, 'tiles' | 'bytes' | 'complete'>>): void;
  remove(id: string): void;
  clear(): void;
}

export interface OfflineAreasStoreOptions {
  readonly storage: KeyValueStorage;
  readonly now?: () => number;
  readonly createId?: () => string;
}

export function createOfflineAreasStore(options: OfflineAreasStoreOptions): OfflineAreasStore {
  const now = options.now ?? Date.now;
  const createId = options.createId ?? (() => globalThis.crypto.randomUUID());
  const store: PersistentStore<OfflineAreasState> = createPersistentStore({
    storage: options.storage,
    key: OFFLINE_AREAS_STORAGE_KEY,
    schema: stateSchema,
    defaults: EMPTY,
  });

  return {
    getSnapshot: store.getSnapshot,
    isPersistent: store.isPersistent,
    subscribe: store.subscribe,
    add(input) {
      if (store.getSnapshot().areas.length >= MAX_OFFLINE_AREAS) return null;
      const area: OfflineArea = {
        id: createId(),
        name: input.name.trim().slice(0, 200),
        bbox: input.bbox,
        minZoom: OFFLINE_MIN_ZOOM,
        maxZoom: OFFLINE_MAX_ZOOM,
        tiles: 0,
        bytes: 0,
        version: input.version.slice(0, 40),
        createdAt: now(),
        complete: false,
      };
      store.update((state) => ({ ...state, areas: [...state.areas, area] }));
      return area;
    },
    update(id, patch) {
      store.update((state) => {
        const index = state.areas.findIndex((a) => a.id === id);
        const current = state.areas[index];
        if (!current) return state;
        const areas = [...state.areas];
        areas[index] = { ...current, ...patch };
        return { ...state, areas };
      });
    },
    remove(id) {
      store.update((state) =>
        state.areas.some((a) => a.id === id)
          ? { ...state, areas: state.areas.filter((a) => a.id !== id) }
          : state,
      );
    },
    clear: store.reset,
  };
}
