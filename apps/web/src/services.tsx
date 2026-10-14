import type {
  Geocoder,
  KeyValueStorage,
  LngLat,
  PlacesStore,
  PreferencesStore,
  Router,
} from '@trajecto/core';
import {
  createCachedGeocoder,
  createMemoryStorage,
  createPhotonGeocoder,
  createPlacesStore,
  createPreferencesStore,
  createValhallaRouter,
} from '@trajecto/core';
import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';
import type { AppConfig } from './config';
import { getCurrentLngLat } from './hooks/location';

export interface Services {
  readonly geocoder: Geocoder;
  readonly router: Router;
  /** Posição atual do dispositivo (pede autorização ao utilizador na primeira vez). */
  readonly locate: () => Promise<LngLat>;
  /** API de geolocalização do browser (para seguir a posição durante a navegação). */
  readonly geolocation: Geolocation | undefined;
  readonly places: PlacesStore;
  readonly preferences: PreferencesStore;
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

export function createServices(config: AppConfig, browserStorage: BrowserStorage): Services {
  const { storage, persistent } = browserStorage;
  return {
    geocoder: createCachedGeocoder(createPhotonGeocoder({ baseUrl: config.geocoderUrl })),
    router: createValhallaRouter({ url: config.routerUrl }),
    locate: () => getCurrentLngLat(),
    geolocation: typeof navigator === 'undefined' ? undefined : navigator.geolocation,
    places: createPlacesStore({ storage }),
    preferences: createPreferencesStore(storage),
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
