import { describe, expect, it, vi } from 'vitest';
import { createCachedGeocoder } from './cached-geocoder';
import type { Geocoder } from './geocoder';
import type { Place } from './place';

const place = (id: string): Place => ({
  id,
  kind: 'other',
  lngLat: { lng: -9, lat: 38 },
  address: {},
});

function fakeGeocoder() {
  return {
    search: vi.fn<Geocoder['search']>(async (q) => [place(q)]),
    reverse: vi.fn<Geocoder['reverse']>(async () => null),
  };
}

describe('createCachedGeocoder', () => {
  it('reutiliza resultados para pesquisas equivalentes', async () => {
    const inner = fakeGeocoder();
    const geocoder = createCachedGeocoder(inner);
    const bias = { lngLat: { lng: -9.1393, lat: 38.7223 }, zoom: 12 };
    await geocoder.search('Évora', { bias });
    await geocoder.search('  evora ', {
      bias: { ...bias, lngLat: { lng: -9.1401, lat: 38.7219 } },
    });
    expect(inner.search).toHaveBeenCalledTimes(1);
    await geocoder.search('Évora');
    expect(inner.search).toHaveBeenCalledTimes(2);
  });

  it('expira entradas antigas', async () => {
    let time = 0;
    const inner = fakeGeocoder();
    const geocoder = createCachedGeocoder(inner, { ttlMs: 1000, now: () => time });
    await geocoder.search('Faro');
    time = 999;
    await geocoder.search('Faro');
    expect(inner.search).toHaveBeenCalledTimes(1);
    time = 1000;
    await geocoder.search('Faro');
    expect(inner.search).toHaveBeenCalledTimes(2);
  });

  it('remove a entrada menos usada quando está cheia', async () => {
    const inner = fakeGeocoder();
    const geocoder = createCachedGeocoder(inner, { maxEntries: 2 });
    await geocoder.search('aaa');
    await geocoder.search('bbb');
    await geocoder.search('aaa'); // "aaa" passa a ser a mais recente
    await geocoder.search('ccc'); // remove "bbb"
    await geocoder.search('aaa');
    expect(inner.search).toHaveBeenCalledTimes(3);
    await geocoder.search('bbb');
    expect(inner.search).toHaveBeenCalledTimes(4);
  });

  it('não guarda erros', async () => {
    const inner = fakeGeocoder();
    inner.search.mockRejectedValueOnce(new Error('falhou'));
    const geocoder = createCachedGeocoder(inner);
    await expect(geocoder.search('Braga')).rejects.toThrow('falhou');
    await expect(geocoder.search('Braga')).resolves.toHaveLength(1);
    expect(inner.search).toHaveBeenCalledTimes(2);
  });

  it('guarda também resultados vazios da geocodificação inversa', async () => {
    const inner = fakeGeocoder();
    const geocoder = createCachedGeocoder(inner);
    await expect(geocoder.reverse({ lng: -9.13931, lat: 38.72231 })).resolves.toBeNull();
    await expect(geocoder.reverse({ lng: -9.13934, lat: 38.72234 })).resolves.toBeNull();
    expect(inner.reverse).toHaveBeenCalledTimes(1);
  });
});
