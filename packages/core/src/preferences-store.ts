// Tem de ser o primeiro import: desliga o `eval` do zod antes de criar esquemas (CSP).
import './csp';
import { z } from 'zod';
import { DEFAULT_CENTER, DEFAULT_ZOOM } from './geo';
import type { KeyValueStorage, PersistentStore } from './persistent-store';
import { createPersistentStore } from './persistent-store';
import type { RoutePreferences, TravelMode } from './routing';
import { DEFAULT_ROUTE_PREFERENCES, TRAVEL_MODES } from './routing';

export const PREFERENCES_STORAGE_KEY = 'trajecto:v1:preferences';

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const LANGUAGES = ['pt-PT', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

export interface MapViewState {
  readonly center: { readonly lng: number; readonly lat: number };
  readonly zoom: number;
}

/** Valores para estimar o custo de combustível (editáveis pelo utilizador). */
export interface FuelPreferences {
  readonly carLitresPer100Km: number;
  readonly motorcycleLitresPer100Km: number;
  readonly pricePerLitre: number;
}

export interface Preferences {
  readonly version: 1;
  readonly theme: ThemePreference;
  readonly language: Language;
  readonly historyEnabled: boolean;
  readonly lastView: MapViewState;
  readonly travelMode: TravelMode;
  readonly routePreferences: RoutePreferences;
  readonly voiceGuidance: boolean;
  readonly fuel: FuelPreferences;
  /** Interruptor dos reportes de polícia (ADR 0008): ligado enquanto o uso for pessoal. */
  readonly policeReports: boolean;
  /** Avisos de radares fixos (dados do OpenStreetMap). */
  readonly speedCameras: boolean;
}

/**
 * Valores iniciais indicativos (não são dados oficiais): o utilizador deve ajustá-los ao seu
 * veículo e ao preço atual (consultável em precoscombustiveis.dgeg.gov.pt).
 */
export const DEFAULT_FUEL: FuelPreferences = {
  carLitresPer100Km: 6.5,
  motorcycleLitresPer100Km: 4.5,
  pricePerLitre: 1.75,
};

export const FUEL_LIMITS = {
  litresPer100Km: { min: 0.5, max: 40 },
  pricePerLitre: { min: 0.1, max: 10 },
} as const;

const litres = z.number().min(FUEL_LIMITS.litresPer100Km.min).max(FUEL_LIMITS.litresPer100Km.max);

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
  travelMode: z.enum(TRAVEL_MODES).catch('car'),
  routePreferences: z
    .object({
      avoidTolls: z.boolean(),
      avoidHighways: z.boolean(),
      avoidFerries: z.boolean(),
      shortest: z.boolean(),
    })
    .catch(DEFAULT_ROUTE_PREFERENCES),
  voiceGuidance: z.boolean().catch(true),
  policeReports: z.boolean().catch(true),
  speedCameras: z.boolean().catch(true),
  fuel: z
    .object({
      carLitresPer100Km: litres,
      motorcycleLitresPer100Km: litres,
      pricePerLitre: z
        .number()
        .min(FUEL_LIMITS.pricePerLitre.min)
        .max(FUEL_LIMITS.pricePerLitre.max),
    })
    .catch(DEFAULT_FUEL),
});

export const DEFAULT_PREFERENCES: Preferences = {
  version: 1,
  theme: 'system',
  language: 'pt-PT',
  historyEnabled: true,
  lastView: { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM },
  travelMode: 'car',
  routePreferences: DEFAULT_ROUTE_PREFERENCES,
  voiceGuidance: true,
  fuel: DEFAULT_FUEL,
  policeReports: true,
  speedCameras: true,
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
