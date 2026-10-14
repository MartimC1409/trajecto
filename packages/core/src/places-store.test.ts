import { describe, expect, it } from 'vitest';
import { createMemoryStorage } from './persistent-store';
import type { Place } from './place';
import type { Favorite } from './places-store';
import {
  MAX_FAVORITES,
  PLACES_STORAGE_KEY,
  createPlacesStore,
  sortFavorites,
} from './places-store';

const place = (id: string): Place => ({
  id,
  name: id,
  kind: 'other',
  lngLat: { lng: -9, lat: 38 },
  address: {},
});

function setup(maxHistory?: number) {
  let time = 1000;
  let n = 0;
  const storage = createMemoryStorage();
  const store = createPlacesStore({
    storage,
    now: () => (time += 1),
    createId: () => `f${++n}`,
    ...(maxHistory === undefined ? {} : { maxHistory }),
  });
  return { store, storage };
}

describe('favoritos', () => {
  it('Casa e Trabalho são únicos e substituem o anterior', () => {
    const { store } = setup();
    store.setSpecial('home', place('a'));
    store.setSpecial('work', place('b'));
    store.setSpecial('home', place('c'));
    const favorites = store.getSnapshot().favorites;
    expect(favorites.filter((f) => f.kind === 'home').map((f) => f.place.id)).toEqual(['c']);
    expect(favorites).toHaveLength(2);
  });

  it('não duplica favoritos e respeita o limite', () => {
    const { store } = setup();
    expect(store.addFavorite(place('a'))).toBe('added');
    expect(store.addFavorite(place('a'))).toBe('already_exists');
    for (let i = 1; i < MAX_FAVORITES; i++) store.addFavorite(place(`p${i}`));
    expect(store.addFavorite(place('excesso'))).toBe('limit_reached');
  });

  it('remove favoritos e encontra-os por local', () => {
    const { store } = setup();
    store.addFavorite(place('a'));
    store.setSpecial('home', place('a'));
    expect(
      store
        .findFavorites('a')
        .map((f) => f.kind)
        .sort(),
    ).toEqual(['home', 'other']);
    const before = store.getSnapshot();
    store.removeFavorite('inexistente');
    expect(store.getSnapshot()).toBe(before);
    store.removeFavorite('f1');
    expect(store.findFavorites('a').map((f) => f.kind)).toEqual(['home']);
  });

  it('ordena Casa, Trabalho e depois por data', () => {
    const fav = (id: string, kind: Favorite['kind'], createdAt: number): Favorite => ({
      id,
      kind,
      createdAt,
      place: place(id),
    });
    const sorted = sortFavorites([
      fav('x', 'other', 5),
      fav('w', 'work', 9),
      fav('y', 'other', 1),
      fav('h', 'home', 7),
    ]);
    expect(sorted.map((f) => f.id)).toEqual(['h', 'w', 'y', 'x']);
  });
});

describe('histórico', () => {
  it('mantém o mais recente primeiro, sem duplicados e com limite', () => {
    const { store } = setup(3);
    for (const id of ['a', 'b', 'c', 'a', 'd']) store.addToHistory(place(id));
    expect(store.getSnapshot().history.map((h) => h.place.id)).toEqual(['d', 'a', 'c']);
  });

  it('apaga entradas, todo o histórico e tudo', () => {
    const { store, storage } = setup();
    store.addToHistory(place('a'));
    store.addToHistory(place('b'));
    store.addFavorite(place('c'));
    const before = store.getSnapshot();
    store.removeFromHistory('zzz');
    expect(store.getSnapshot()).toBe(before);
    store.removeFromHistory('a');
    expect(store.getSnapshot().history.map((h) => h.place.id)).toEqual(['b']);
    store.clearHistory();
    expect(store.getSnapshot().history).toEqual([]);
    const afterClear = store.getSnapshot();
    store.clearHistory();
    expect(store.getSnapshot()).toBe(afterClear);
    store.clearAll();
    expect(store.getSnapshot().favorites).toEqual([]);
    expect(storage.getItem(PLACES_STORAGE_KEY)).toBeNull();
  });

  it('sobrevive a recarregar a página', () => {
    const { store, storage } = setup();
    store.addToHistory(place('a'));
    store.setSpecial('work', place('b'));
    const reopened = createPlacesStore({ storage });
    expect(reopened.getSnapshot()).toEqual(store.getSnapshot());
    expect(reopened.isPersistent()).toBe(true);
  });

  it('usa crypto.randomUUID por omissão', () => {
    const store = createPlacesStore({ storage: createMemoryStorage() });
    store.addFavorite(place('a'));
    expect(store.getSnapshot().favorites[0]?.id).toMatch(/^[0-9a-f-]{36}$/u);
  });
});
