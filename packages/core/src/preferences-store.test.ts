import { describe, expect, it, vi } from 'vitest';
import { createMemoryStorage } from './persistent-store';
import {
  DEFAULT_PREFERENCES,
  PREFERENCES_STORAGE_KEY,
  createPreferencesStore,
} from './preferences-store';

describe('createPreferencesStore', () => {
  it('usa valores por omissão', () => {
    const store = createPreferencesStore(createMemoryStorage());
    expect(store.getSnapshot()).toEqual(DEFAULT_PREFERENCES);
  });

  it('corrige campos inválidos sem perder os válidos', () => {
    const storage = createMemoryStorage({
      [PREFERENCES_STORAGE_KEY]: JSON.stringify({
        version: 1,
        theme: 'roxo',
        language: 'en',
        historyEnabled: 'sim',
        lastView: { center: { lng: 0, lat: 99 }, zoom: 3 },
      }),
    });
    const prefs = createPreferencesStore(storage).getSnapshot();
    expect(prefs.theme).toBe('system');
    expect(prefs.language).toBe('en');
    expect(prefs.historyEnabled).toBe(true);
    expect(prefs.lastView).toEqual(DEFAULT_PREFERENCES.lastView);
  });

  it('acrescenta as preferências de rota a dados antigos e corrige valores fora dos limites', () => {
    const storage = createMemoryStorage({
      [PREFERENCES_STORAGE_KEY]: JSON.stringify({
        version: 1,
        theme: 'dark',
        language: 'pt-PT',
        historyEnabled: false,
        lastView: DEFAULT_PREFERENCES.lastView,
      }),
    });
    const old = createPreferencesStore(storage).getSnapshot();
    expect(old).toMatchObject({
      theme: 'dark',
      historyEnabled: false,
      travelMode: 'car',
      publicTransport: false,
      voiceGuidance: true,
      routePreferences: DEFAULT_PREFERENCES.routePreferences,
      fuel: DEFAULT_PREFERENCES.fuel,
    });
    storage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        ...DEFAULT_PREFERENCES,
        travelMode: 'bike',
        routePreferences: { avoidTolls: true },
        fuel: { carLitresPer100Km: 500, motorcycleLitresPer100Km: 4, pricePerLitre: 1.9 },
      }),
    );
    const store = createPreferencesStore(storage);
    expect(store.getSnapshot().travelMode).toBe('bike');
    expect(store.getSnapshot().routePreferences).toEqual(DEFAULT_PREFERENCES.routePreferences);
    expect(store.getSnapshot().fuel).toEqual(DEFAULT_PREFERENCES.fuel);
  });

  it('grava alterações e ignora valores iguais', () => {
    const storage = createMemoryStorage();
    const store = createPreferencesStore(storage);
    const listener = vi.fn();
    store.subscribe(listener);
    store.set('theme', 'dark');
    store.set('theme', 'dark');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(createPreferencesStore(storage).getSnapshot().theme).toBe('dark');
    store.reset();
    expect(store.getSnapshot()).toEqual(DEFAULT_PREFERENCES);
    store.reload();
    expect(store.getSnapshot()).toEqual(DEFAULT_PREFERENCES);
  });
});
