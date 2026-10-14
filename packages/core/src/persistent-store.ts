import type { z } from 'zod';

/** Subconjunto da API `localStorage`, para poder injetar implementações nos testes. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Armazenamento só em memória (usado quando o browser bloqueia o `localStorage`). */
export function createMemoryStorage(initial: Record<string, string> = {}): KeyValueStorage {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

export interface PersistentStore<T> {
  /** Estado atual. A referência só muda quando o estado muda (requisito do React). */
  getSnapshot(): T;
  /** `false` se a última gravação falhou (quota cheia, modo privado, armazenamento bloqueado). */
  isPersistent(): boolean;
  update(updater: (current: T) => T): void;
  /** Volta ao estado inicial e apaga os dados guardados. */
  reset(): void;
  /** Relê o armazenamento (por exemplo, quando outro separador alterou os dados). */
  reload(): void;
  subscribe(listener: () => void): () => void;
}

export interface PersistentStoreOptions<T> {
  readonly storage: KeyValueStorage;
  readonly key: string;
  readonly schema: z.ZodType<T>;
  readonly defaults: T;
}

/**
 * Estado validado e guardado em JSON.
 * Dados corrompidos ou de versões desconhecidas são ignorados e substituídos pelos valores por omissão.
 */
export function createPersistentStore<T>(options: PersistentStoreOptions<T>): PersistentStore<T> {
  const { storage, key, schema, defaults } = options;
  const listeners = new Set<() => void>();
  let persistent = true;

  function load(): T {
    let raw: string | null;
    try {
      raw = storage.getItem(key);
    } catch {
      persistent = false;
      return defaults;
    }
    if (raw === null) return defaults;
    try {
      const parsed = schema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : defaults;
    } catch {
      return defaults;
    }
  }

  let state = load();

  function emit(): void {
    for (const listener of [...listeners]) listener();
  }

  function save(next: T): void {
    try {
      storage.setItem(key, JSON.stringify(next));
      persistent = true;
    } catch {
      // Mantemos o estado em memória: a app continua a funcionar até ser fechada.
      persistent = false;
    }
  }

  return {
    getSnapshot: () => state,
    isPersistent: () => persistent,
    update(updater) {
      const next = updater(state);
      if (Object.is(next, state)) return;
      state = next;
      save(next);
      emit();
    },
    reset() {
      state = defaults;
      try {
        storage.removeItem(key);
      } catch {
        persistent = false;
      }
      emit();
    },
    reload() {
      const next = load();
      if (JSON.stringify(next) === JSON.stringify(state)) return;
      state = next;
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
