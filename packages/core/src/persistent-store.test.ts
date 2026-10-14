import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { KeyValueStorage } from './persistent-store';
import { createMemoryStorage, createPersistentStore } from './persistent-store';

const schema = z.object({ count: z.number() });
const defaults = { count: 0 };

function make(storage: KeyValueStorage = createMemoryStorage()) {
  return createPersistentStore({ storage, key: 'k', schema, defaults });
}

describe('createPersistentStore', () => {
  it('lê valores guardados válidos', () => {
    const store = make(createMemoryStorage({ k: '{"count":3}' }));
    expect(store.getSnapshot()).toEqual({ count: 3 });
  });

  it.each(['não é json', '{"count":"x"}', '[]'])('ignora dados inválidos: %s', (raw) => {
    const store = make(createMemoryStorage({ k: raw }));
    expect(store.getSnapshot()).toBe(defaults);
  });

  it('grava, notifica e mantém a referência quando nada muda', () => {
    const storage = createMemoryStorage();
    const store = make(storage);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.update((s) => ({ count: s.count + 1 }));
    expect(storage.getItem('k')).toBe('{"count":1}');
    expect(listener).toHaveBeenCalledTimes(1);
    const before = store.getSnapshot();
    store.update((s) => s);
    expect(store.getSnapshot()).toBe(before);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.update(() => ({ count: 5 }));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('continua em memória quando gravar falha', () => {
    const storage = createMemoryStorage();
    storage.setItem = () => {
      throw new DOMException('Quota', 'QuotaExceededError');
    };
    const store = make(storage);
    store.update(() => ({ count: 2 }));
    expect(store.getSnapshot()).toEqual({ count: 2 });
    expect(store.isPersistent()).toBe(false);
  });

  it('funciona quando ler o armazenamento é proibido', () => {
    const storage = createMemoryStorage();
    storage.getItem = () => {
      throw new DOMException('Bloqueado', 'SecurityError');
    };
    storage.removeItem = () => {
      throw new DOMException('Bloqueado', 'SecurityError');
    };
    const store = make(storage);
    expect(store.getSnapshot()).toBe(defaults);
    expect(store.isPersistent()).toBe(false);
    store.reset();
    expect(store.isPersistent()).toBe(false);
  });

  it('reset apaga os dados e notifica', () => {
    const storage = createMemoryStorage({ k: '{"count":9}' });
    const store = make(storage);
    const listener = vi.fn();
    store.subscribe(listener);
    store.reset();
    expect(store.getSnapshot()).toBe(defaults);
    expect(storage.getItem('k')).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('reload só notifica quando os dados mudaram noutro separador', () => {
    const storage = createMemoryStorage({ k: '{"count":1}' });
    const store = make(storage);
    const listener = vi.fn();
    store.subscribe(listener);
    store.reload();
    expect(listener).not.toHaveBeenCalled();
    storage.setItem('k', '{"count":7}');
    store.reload();
    expect(store.getSnapshot()).toEqual({ count: 7 });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
