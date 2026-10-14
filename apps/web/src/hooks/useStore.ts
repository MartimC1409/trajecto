import { useEffect, useSyncExternalStore } from 'react';

interface Subscribable<T> {
  getSnapshot(): T;
  subscribe(listener: () => void): () => void;
  reload(): void;
}

/** Liga um store do `@trajecto/core` ao React e sincroniza com outros separadores abertos. */
export function useStore<T>(store: Subscribable<T>): T {
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      // `key === null` significa que o armazenamento foi todo limpo.
      if (event.key === null || event.key.startsWith('trajecto:')) store.reload();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [store]);

  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
