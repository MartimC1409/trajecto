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
