import { describe, expect, it } from 'vitest';
import type { BBox } from './geo';
import {
  MAX_OFFLINE_AREAS,
  OFFLINE_AREAS_STORAGE_KEY,
  OFFLINE_LIMITS,
  checkOfflineArea,
  countTiles,
  createOfflineAreasStore,
  isTileInArea,
  isTileInsideSupportedArea,
  isValidTile,
  iterateTiles,
  lngLatToTile,
  openFreeMapVersion,
  tileBBox,
  tileKey,
  tilesOnlyIn,
} from './offline';
import { createMemoryStorage } from './persistent-store';

const LISBOA = { lng: -9.1393, lat: 38.7223 };
/** ~10 km × 10 km à volta da Baixa de Lisboa. */
const BAIXA: BBox = [-9.2, 38.68, -9.08, 38.77];

describe('tiles', () => {
  it('converte coordenadas em tiles (esquema XYZ) e de volta', () => {
    expect(lngLatToTile(LISBOA, 0)).toEqual({ x: 0, y: 0 });
    expect(lngLatToTile(LISBOA, 1)).toEqual({ x: 0, y: 0 });
    expect(lngLatToTile(LISBOA, 14)).toEqual({ x: 7776, y: 6277 });
    const [west, south, east, north] = tileBBox({ z: 14, x: 7776, y: 6277 });
    expect(west).toBeLessThanOrEqual(LISBOA.lng);
    expect(east).toBeGreaterThan(LISBOA.lng);
    expect(south).toBeLessThanOrEqual(LISBOA.lat);
    expect(north).toBeGreaterThan(LISBOA.lat);
    // Fora da projeção: fica no último tile.
    expect(lngLatToTile({ lng: 180, lat: 89 }, 3)).toEqual({ x: 7, y: 0 });
  });

  it('valida tiles e gera chaves', () => {
    expect(isValidTile({ z: 14, x: 7776, y: 6277 })).toBe(true);
    expect(isValidTile({ z: 1, x: 2, y: 0 })).toBe(false);
    expect(isValidTile({ z: -1, x: 0, y: 0 })).toBe(false);
    expect(isValidTile({ z: 3, x: 1.5, y: 0 })).toBe(false);
    expect(isValidTile({ z: 23, x: 0, y: 0 })).toBe(false);
    expect(tileKey({ z: 14, x: 7776, y: 6277 })).toBe('14/7776/6277');
  });

  it('conta e percorre os tiles de uma zona, dos zooms baixos para os altos', () => {
    const tiles = [...iterateTiles(BAIXA)];
    expect(tiles).toHaveLength(countTiles(BAIXA));
    expect(tiles[0]).toEqual({ z: 0, x: 0, y: 0 });
    expect(tiles.at(-1)?.z).toBe(14);
    expect(new Set(tiles.map(tileKey)).size).toBe(tiles.length);
    // Um ponto da zona está num dos tiles do zoom 14.
    const here = lngLatToTile(LISBOA, 14);
    expect(tiles.some((t) => t.z === 14 && t.x === here.x && t.y === here.y)).toBe(true);
  });

  it('só aceita tiles que tocam na área suportada', () => {
    expect(isTileInsideSupportedArea({ z: 14, x: 7776, y: 6277 })).toBe(true);
    expect(isTileInsideSupportedArea({ z: 0, x: 0, y: 0 })).toBe(true);
    expect(isTileInsideSupportedArea({ z: 14, x: 8298, y: 5637 })).toBe(false); // Paris
  });

  it('lê a versão dos tiles do TileJSON do OpenFreeMap', () => {
    expect(
      openFreeMapVersion('https://tiles.openfreemap.org/planet/20231227_043106_pt/{z}/{x}/{y}.pbf'),
    ).toBe('20231227_043106_pt');
    expect(openFreeMapVersion('https://tiles.openfreemap.org/planet/latest/{z}/{x}/{y}.pbf')).toBe(
      null,
    );
    expect(openFreeMapVersion('https://example.com/{z}/{x}/{y}.pbf')).toBe(null);
  });
});

describe('checkOfflineArea', () => {
  it('aceita uma zona de cidade dentro do limite de tiles', () => {
    const check = checkOfflineArea(BAIXA);
    expect(check).toMatchObject({ ok: true, bbox: BAIXA });
    // 10 km × 10 km do zoom 0 ao 14: 75 tiles (o limite de 3000 dá para ~80 km × 80 km).
    expect(check.tiles).toBe(75);
    expect(check.tiles).toBeLessThanOrEqual(OFFLINE_LIMITS.maxTiles);
  });

  it('recusa zonas grandes demais, fora da área suportada e inválidas', () => {
    expect(checkOfflineArea([-9.6, 36.9, -6.1, 42.2])).toMatchObject({
      ok: false,
      reason: 'too_many_tiles',
    });
    expect(checkOfflineArea([2.2, 48.8, 2.5, 48.9])).toMatchObject({
      ok: false,
      reason: 'outside_area',
    });
    expect(checkOfflineArea([-9, 38, -10, 39])).toMatchObject({ ok: false, reason: 'invalid' });
    expect(checkOfflineArea([Number.NaN, 38, -9, 39])).toMatchObject({ reason: 'invalid' });
  });

  it('corta a zona à área suportada', () => {
    const check = checkOfflineArea([-8.3, 43.95, -8.2, 44.05]);
    expect(check).toMatchObject({ ok: true, bbox: [-8.3, 43.95, -8.2, 44] });
  });
});

describe('zonas que se sobrepõem', () => {
  const a = { bbox: [-9.2, 38.7, -9.1, 38.75] as BBox, minZoom: 0, maxZoom: 14 };
  const b = { bbox: [-9.15, 38.7, -9.05, 38.75] as BBox, minZoom: 0, maxZoom: 14 };

  it('ao apagar uma zona, ficam os tiles que a outra usa', () => {
    const onlyA = [...tilesOnlyIn(a, [b])];
    expect(onlyA.length).toBeGreaterThan(0);
    expect(onlyA.length).toBeLessThan(countTiles(a.bbox));
    expect(onlyA.every((t) => !isTileInArea(t, b))).toBe(true);
    // Os zooms baixos são partilhados: não se apagam.
    expect(onlyA.some((t) => t.z < 8)).toBe(false);
    expect([...tilesOnlyIn(a, [])]).toHaveLength(countTiles(a.bbox));
  });

  it('fora do intervalo de zoom, o tile não pertence à zona', () => {
    expect(isTileInArea({ z: 14, x: 7776, y: 6277 }, { ...a, maxZoom: 13 })).toBe(false);
  });
});

describe('createOfflineAreasStore', () => {
  function setup(storage = createMemoryStorage()) {
    let id = 0;
    const store = createOfflineAreasStore({
      storage,
      now: () => 1_000,
      createId: () => `z${String((id += 1))}`,
    });
    return { store, storage };
  }

  it('regista, atualiza e apaga zonas, guardando no armazenamento', () => {
    const { store, storage } = setup();
    const area = store.add({ name: '  Baixa  ', bbox: BAIXA, version: '20231227_043106_pt' });
    expect(area).toMatchObject({
      id: 'z1',
      name: 'Baixa',
      tiles: 0,
      bytes: 0,
      minZoom: 0,
      maxZoom: 14,
      createdAt: 1_000,
      complete: false,
    });
    store.update('z1', { tiles: 10, bytes: 2048, complete: true });
    store.update('nao-existe', { tiles: 1 });
    expect(store.getSnapshot().areas[0]).toMatchObject({ tiles: 10, bytes: 2048, complete: true });

    // Outra instância lê o mesmo estado.
    const again = createOfflineAreasStore({ storage });
    expect(again.getSnapshot().areas).toHaveLength(1);

    store.remove('z1');
    expect(store.getSnapshot().areas).toEqual([]);
    expect(JSON.parse(storage.getItem(OFFLINE_AREAS_STORAGE_KEY) ?? '{}')).toEqual({
      version: 1,
      areas: [],
    });
  });

  it('limita o número de zonas e ignora dados inválidos', () => {
    const { store } = setup();
    for (let i = 0; i < MAX_OFFLINE_AREAS; i += 1) {
      expect(store.add({ name: `Z${String(i)}`, bbox: BAIXA, version: 'latest' })).not.toBeNull();
    }
    expect(store.add({ name: 'mais', bbox: BAIXA, version: 'latest' })).toBeNull();
    store.clear();
    expect(store.getSnapshot().areas).toEqual([]);

    const corrupt = createMemoryStorage({
      [OFFLINE_AREAS_STORAGE_KEY]: JSON.stringify({ version: 1, areas: [{ id: 'x' }] }),
    });
    expect(createOfflineAreasStore({ storage: corrupt }).getSnapshot().areas).toEqual([]);
  });
});
