// Tem de ser o primeiro import: desliga o `eval` do zod antes de criar esquemas (CSP).
import './csp';
import { z } from 'zod';
import type { KeyValueStorage, PersistentStore } from './persistent-store';
import { createPersistentStore } from './persistent-store';
import type { Place } from './place';
import { placeSchema } from './place';

export const PLACES_STORAGE_KEY = 'trajecto:v1:places';
export const MAX_HISTORY = 20;
export const MAX_FAVORITES = 100;

export type FavoriteKind = 'home' | 'work' | 'other';

export interface Favorite {
  readonly id: string;
  readonly kind: FavoriteKind;
  readonly place: Place;
  readonly createdAt: number;
}

export interface HistoryEntry {
  readonly place: Place;
  readonly usedAt: number;
}

export interface PlacesState {
  readonly version: 1;
  readonly favorites: readonly Favorite[];
  readonly history: readonly HistoryEntry[];
}

const placesStateSchema: z.ZodType<PlacesState> = z.object({
  version: z.literal(1),
  favorites: z
    .array(
      z.object({
        id: z.string().min(1).max(200),
        kind: z.enum(['home', 'work', 'other']),
        place: placeSchema,
        createdAt: z.number().int().nonnegative(),
      }),
    )
    .max(MAX_FAVORITES + 2),
  history: z
    .array(z.object({ place: placeSchema, usedAt: z.number().int().nonnegative() }))
    .max(MAX_HISTORY),
});

const EMPTY: PlacesState = { version: 1, favorites: [], history: [] };

export type AddFavoriteResult = 'added' | 'already_exists' | 'limit_reached';

export interface PlacesStore {
  getSnapshot(): PlacesState;
  isPersistent(): boolean;
  subscribe(listener: () => void): () => void;
  reload(): void;
  /** Define Casa ou Trabalho (substitui o anterior). */
  setSpecial(kind: 'home' | 'work', place: Place): void;
  addFavorite(place: Place): AddFavoriteResult;
  removeFavorite(favoriteId: string): void;
  findFavorites(placeId: string): readonly Favorite[];
  addToHistory(place: Place): void;
  removeFromHistory(placeId: string): void;
  clearHistory(): void;
  /** Apaga favoritos e histórico deste dispositivo. */
  clearAll(): void;
}

export interface PlacesStoreOptions {
  readonly storage: KeyValueStorage;
  readonly now?: () => number;
  /** Gerador de identificadores (injetável para testes). */
  readonly createId?: () => string;
  readonly maxHistory?: number;
}

function defaultId(): string {
  return globalThis.crypto.randomUUID();
}

export function createPlacesStore(options: PlacesStoreOptions): PlacesStore {
  const now = options.now ?? Date.now;
  const createId = options.createId ?? defaultId;
  const maxHistory = Math.min(options.maxHistory ?? MAX_HISTORY, MAX_HISTORY);
  const store: PersistentStore<PlacesState> = createPersistentStore({
    storage: options.storage,
    key: PLACES_STORAGE_KEY,
    schema: placesStateSchema,
    defaults: EMPTY,
  });

  return {
    getSnapshot: store.getSnapshot,
    isPersistent: store.isPersistent,
    subscribe: store.subscribe,
    reload: store.reload,

    setSpecial(kind, place) {
      store.update((s) => ({
        ...s,
        favorites: [
          { id: createId(), kind, place, createdAt: now() },
          ...s.favorites.filter((f) => f.kind !== kind),
        ],
      }));
    },

    addFavorite(place) {
      const s = store.getSnapshot();
      if (s.favorites.some((f) => f.kind === 'other' && f.place.id === place.id)) {
        return 'already_exists';
      }
      if (s.favorites.filter((f) => f.kind === 'other').length >= MAX_FAVORITES) {
        return 'limit_reached';
      }
      store.update((current) => ({
        ...current,
        favorites: [
          ...current.favorites,
          { id: createId(), kind: 'other', place, createdAt: now() },
        ],
      }));
      return 'added';
    },

    removeFavorite(favoriteId) {
      store.update((s) =>
        s.favorites.some((f) => f.id === favoriteId)
          ? { ...s, favorites: s.favorites.filter((f) => f.id !== favoriteId) }
          : s,
      );
    },

    findFavorites(placeId) {
      return store.getSnapshot().favorites.filter((f) => f.place.id === placeId);
    },

    addToHistory(place) {
      store.update((s) => ({
        ...s,
        history: [
          { place, usedAt: now() },
          ...s.history.filter((h) => h.place.id !== place.id),
        ].slice(0, maxHistory),
      }));
    },

    removeFromHistory(placeId) {
      store.update((s) =>
        s.history.some((h) => h.place.id === placeId)
          ? { ...s, history: s.history.filter((h) => h.place.id !== placeId) }
          : s,
      );
    },

    clearHistory() {
      store.update((s) => (s.history.length === 0 ? s : { ...s, history: [] }));
    },

    clearAll() {
      store.reset();
    },
  };
}

/** Ordena para mostrar: Casa, Trabalho e depois os restantes por ordem de criação. */
export function sortFavorites(favorites: readonly Favorite[]): Favorite[] {
  const rank: Record<FavoriteKind, number> = { home: 0, work: 1, other: 2 };
  return [...favorites].sort((a, b) => rank[a.kind] - rank[b.kind] || a.createdAt - b.createdAt);
}
