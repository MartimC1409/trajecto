import type {
  Geocoder,
  KeyValueStorage,
  LngLat,
  OfflineAreasStore,
  PlacesStore,
  PreferencesStore,
  ReportsStore,
  Router,
  TransitPlanner,
  WeatherProvider,
} from '@trajecto/core';
import {
  createCachedGeocoder,
  createMemoryStorage,
  createOfflineAreasStore,
  createPhotonGeocoder,
  createPlacesStore,
  createPreferencesStore,
  createReportsStore,
  createTransitPlanner,
  createValhallaRouter,
  createWeatherProvider,
} from '@trajecto/core';
import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';
import type { AppConfig } from './config';
import { getCurrentLngLat } from './hooks/location';
import type { MapResources } from './offline/mapResources';
import { createMapResources } from './offline/mapResources';
import type { OfflineTileStore } from './offline/tileStore';
import { createCacheTileStore, isOfflineSupported } from './offline/tileStore';

export interface Services {
  readonly geocoder: Geocoder;
  readonly router: Router;
  readonly weather: WeatherProvider;
  readonly transit: TransitPlanner;
  /** Posição atual do dispositivo (pede autorização ao utilizador na primeira vez). */
  readonly locate: () => Promise<LngLat>;
  /** API de geolocalização do browser (para seguir a posição durante a navegação). */
  readonly geolocation: Geolocation | undefined;
  readonly places: PlacesStore;
  readonly reports: ReportsStore;
  readonly preferences: PreferencesStore;
  /** Zonas do mapa transferidas para usar sem rede. */
  readonly offlineAreas: OfflineAreasStore;
  /** Tiles guardados; `null` se o browser não suporta mapas offline. */
  readonly offlineTiles: OfflineTileStore | null;
  /** Recursos do mapa (TileJSON, tiles, tipos de letra) com as zonas guardadas. */
  readonly mapResources: MapResources;
  /** `false` quando o browser bloqueia o armazenamento e os dados só existem em memória. */
  readonly storagePersistent: boolean;
}

export interface BrowserStorage {
  readonly storage: KeyValueStorage;
  readonly persistent: boolean;
}

/**
 * Devolve o `localStorage` se o browser o permitir.
 * Alguns modos de privacidade lançam erro só por aceder-lhe; nesse caso usamos memória.
 */
export function getBrowserStorage(): BrowserStorage {
  try {
    const storage = window.localStorage;
    const probe = '__trajecto_probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return { storage, persistent: true };
  } catch {
    return { storage: createMemoryStorage(), persistent: false };
  }
}

/** Armazenamento de tiles vazio, para browsers sem suporte de mapas offline. */
const NO_TILES: OfflineTileStore = {
  has: async () => false,
  get: async () => null,
  put: async () => undefined,
  delete: async () => undefined,
  clear: async () => undefined,
};

export function createServices(config: AppConfig, browserStorage: BrowserStorage): Services {
  const { storage, persistent } = browserStorage;
  const caches = typeof globalThis.caches === 'undefined' ? undefined : globalThis.caches;
  const offlineAreas = createOfflineAreasStore({ storage });
  const offlineTiles = caches && isOfflineSupported() ? createCacheTileStore(caches) : null;
  return {
    geocoder: createCachedGeocoder(createPhotonGeocoder({ baseUrl: config.geocoderUrl })),
    router: createValhallaRouter({ url: config.routerUrl }),
    weather: createWeatherProvider({ url: config.weatherUrl }),
    transit: createTransitPlanner({ url: config.transitUrl }),
    locate: () => getCurrentLngLat(),
    geolocation: typeof navigator === 'undefined' ? undefined : navigator.geolocation,
    places: createPlacesStore({ storage }),
    reports: createReportsStore({ storage }),
    preferences: createPreferencesStore(storage),
    offlineAreas,
    offlineTiles,
    mapResources: createMapResources({
      tileJsonUrl: config.tileJsonUrl,
      glyphsUrl: config.glyphsUrl,
      store: offlineTiles ?? NO_TILES,
      ...(caches ? { caches } : {}),
      areas: () => (offlineTiles ? offlineAreas.getSnapshot().areas : []),
    }),
    storagePersistent: persistent,
  };
}

const ServicesContext = createContext<Services | null>(null);

export function ServicesProvider({
  services,
  children,
}: {
  services: Services;
  children: ReactNode;
}) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) throw new Error('useServices tem de ser usado dentro de <ServicesProvider>.');
  return services;
}
