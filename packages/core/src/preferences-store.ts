import { z } from 'zod';
import { DEFAULT_CENTER, DEFAULT_ZOOM } from './geo';
import type { KeyValueStorage, PersistentStore } from './persistent-store';
import { createPersistentStore } from './persistent-store';

export const PREFERENCES_STORAGE_KEY = 'trajecto:v1:preferences';

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const LANGUAGES = ['pt-PT', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

export interface MapViewState {
  readonly center: { readonly lng: number; readonly lat: number };
  readonly zoom: number;
}

export interface Preferences {
  readonly version: 1;
  readonly theme: ThemePreference;
  readonly language: Language;
  readonly historyEnabled: boolean;
  readonly lastView: MapViewState;
}

const preferencesSchema: z.ZodType<Preferences> = z.object({
  version: z.literal(1),
  theme: z.enum(THEME_PREFERENCES).catch('system'),
  language: z.enum(LANGUAGES).catch('pt-PT'),
  historyEnabled: z.boolean().catch(true),
  lastView: z
    .object({
      center: z.object({
        lng: z.number().min(-180).max(180),
        lat: z.number().min(-85).max(85),
      }),
      zoom: z.number().min(0).max(22),
    })
    .catch({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM }),
});

export const DEFAULT_PREFERENCES: Preferences = {
  version: 1,
  theme: 'system',
  language: 'pt-PT',
  historyEnabled: true,
  lastView: { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM },
};

export interface PreferencesStore {
  getSnapshot(): Preferences;
  subscribe(listener: () => void): () => void;
  reload(): void;
  set<K extends Exclude<keyof Preferences, 'version'>>(key: K, value: Preferences[K]): void;
  reset(): void;
}

export function createPreferencesStore(storage: KeyValueStorage): PreferencesStore {
  const store: PersistentStore<Preferences> = createPersistentStore({
    storage,
    key: PREFERENCES_STORAGE_KEY,
    schema: preferencesSchema,
    defaults: DEFAULT_PREFERENCES,
  });
  return {
    getSnapshot: store.getSnapshot,
    subscribe: store.subscribe,
    reload: store.reload,
    set(key, value) {
      store.update((p) => (Object.is(p[key], value) ? p : { ...p, [key]: value }));
    },
    reset: store.reset,
  };
}
