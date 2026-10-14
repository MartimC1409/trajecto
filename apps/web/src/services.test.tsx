import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getBrowserStorage, useServices } from './services';

describe('getBrowserStorage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('usa o localStorage quando está disponível', () => {
    expect(getBrowserStorage()).toEqual({ storage: window.localStorage, persistent: true });
  });

  it('usa memória quando o browser bloqueia o armazenamento', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Bloqueado', 'SecurityError');
    });
    const { storage, persistent } = getBrowserStorage();
    expect(persistent).toBe(false);
    expect(storage).not.toBe(window.localStorage);
    storage.setItem('a', '1');
    expect(storage.getItem('a')).toBe('1');
  });
});

describe('useServices', () => {
  it('falha com mensagem clara fora do ServicesProvider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function Probe() {
      useServices();
      return null;
    }
    expect(() => render(<Probe />)).toThrow('ServicesProvider');
  });
});
