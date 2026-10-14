import type { Geocoder, KeyValueStorage, PlacesStore, PreferencesStore } from '@trajecto/core';
import {
  createCachedGeocoder,
  createMemoryStorage,
  createPhotonGeocoder,
  createPlacesStore,
  createPreferencesStore,
} from '@trajecto/core';
import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';
import type { AppConfig } from './config';

export interface Services {
  readonly geocoder: Geocoder;
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
