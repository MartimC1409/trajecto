import type { ThemePreference } from '@trajecto/core';
import { useEffect, useSyncExternalStore } from 'react';
import type { MapTheme } from '../map/mapStyle';

const QUERY = '(prefers-color-scheme: dark)';

function subscribe(listener: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const media = window.matchMedia(QUERY);
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}

function systemIsDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(QUERY).matches;
}

/** Tema efetivo ("claro" ou "escuro"), seguindo o sistema quando a preferência é "system". */
export function useResolvedTheme(preference: ThemePreference): MapTheme {
  const dark = useSyncExternalStore(subscribe, systemIsDark, () => false);
  const theme: MapTheme = preference === 'system' ? (dark ? 'dark' : 'light') : preference;

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute('content', theme === 'dark' ? '#1b2026' : '#f4f1ea');
  }, [theme]);

  return theme;
}
