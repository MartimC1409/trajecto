import { describe, expect, it, vi } from 'vitest';
import { GeocoderError, isAbortError } from './geocoder';
import {
  MAX_FEATURES,
  buildReverseUrl,
  buildSearchUrl,
  createPhotonGeocoder,
  parsePhotonResponse,
} from './photon';

function feature(properties: Record<string, unknown>, coordinates: unknown = [-9.14, 38.71]) {
  return { type: 'Feature', geometry: { type: 'Point', coordinates }, properties };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('parsePhotonResponse', () => {
  it('converte features em locais', () => {
    const places = parsePhotonResponse({
      type: 'FeatureCollection',
      features: [
        feature({
          osm_type: 'W',
          osm_id: 38862723,
          osm_key: 'leisure',
          osm_value: 'stadium',
          type: 'house',
          name: '  Estádio  ',
          street: 'Avenida X',
          housenumber: 3,
          postcode: '1500-000',
          city: 'Lisboa',
          countrycode: 'pt',
          extent: [-9.2, 38.8, -9.1, 38.7],
        }),
      ],
    });
    expect(places).toEqual([
      {
        id: 'osm:W38862723',
        name: 'Estádio',
        kind: 'house',
        lngLat: { lng: -9.14, lat: 38.71 },
        address: {
          street: 'Avenida X',
          housenumber: '3',
          postcode: '1500-000',
          locality: 'Lisboa',
          countryCode: 'PT',
        },
        category: 'leisure:stadium',
        bbox: [-9.2, 38.7, -9.1, 38.8],
      },
    ]);
  });

  it('ignora features inválidas e duplicadas, e campos com tipo errado', () => {
    const places = parsePhotonResponse({
      features: [
        feature({ osm_type: 'N', osm_id: 1, name: 'A' }),
        feature({ osm_type: 'N', osm_id: 1, name: 'A (duplicado)' }),
        feature({ name: 'Fora do mundo' }, [500, 10]),
        { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} },
        'lixo',
        feature({ osm_type: 'X', osm_id: 5, name: { malicioso: true }, type: 'planeta' }),
      ],
    });
    expect(places.map((p) => p.id)).toEqual(['osm:N1', 'photon:38.71,-9.14:']);
    expect(places[1]?.kind).toBe('other');
    expect(places[1]?.name).toBeUndefined();
  });

  it('processa no máximo MAX_FEATURES elementos', () => {
    const features = Array.from({ length: MAX_FEATURES + 25 }, (_, i) =>
      feature({ osm_type: 'N', osm_id: i, name: `L${i}` }),
    );
    expect(parsePhotonResponse({ features })).toHaveLength(MAX_FEATURES);
  });

  it('descarta bbox com coordenadas impossíveis', () => {
    const [place] = parsePhotonResponse({
      features: [feature({ osm_type: 'N', osm_id: 2, extent: [-9, 95, -8, 38] })],
    });
    expect(place?.bbox).toBeUndefined();
  });

  it('lança erro para respostas sem features', () => {
    expect(() => parsePhotonResponse({ erro: 'x' })).toThrow(GeocoderError);
  });
});

describe('URLs', () => {
  it('pesquisa com foco, limite e país', () => {
    const url = buildSearchUrl('/geocoder/', '  Rua  Augusta ', {
      limit: 50,
      bias: { lngLat: { lng: -9.139312, lat: 38.722345 }, zoom: 12.6 },
      countryCodes: ['PT'],
    });
    expect(url).toBe(
      '/geocoder/api?q=Rua+Augusta&limit=10&lat=38.7223&lon=-9.1393&zoom=13&countrycode=PT',
    );
  });

  it('ignora foco inválido e usa o limite por omissão', () => {
    const url = buildSearchUrl('http://localhost:2322', 'Porto', {
      limit: Number.NaN,
      bias: { lngLat: { lng: 999, lat: 0 }, zoom: 3 },
    });
    expect(url).toBe('http://localhost:2322/api?q=Porto&limit=6');
  });

  it('limite mínimo é 1', () => {
    expect(buildSearchUrl('', 'abc', { limit: 0 })).toContain('limit=1');
  });

  it('geocodificação inversa', () => {
    expect(buildReverseUrl('/geocoder', { lng: -9.1393123, lat: 38.7223456 })).toBe(
      '/geocoder/reverse?lat=38.722346&lon=-9.139312&limit=1',
    );
  });
});

describe('createPhotonGeocoder', () => {
  it('não faz pedidos para textos curtos', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const geocoder = createPhotonGeocoder({ baseUrl: '/g', fetch: fetchMock });
    await expect(geocoder.search(' ab ')).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('pesquisa e envia o sinal de cancelamento', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse({ features: [feature({ osm_type: 'N', osm_id: 9, name: 'Sé' })] }),
      );
    const geocoder = createPhotonGeocoder({ baseUrl: '/g', fetch: fetchMock });
    const controller = new AbortController();
    const places = await geocoder.search('Sé de Lisboa', { signal: controller.signal });
    expect(places[0]?.name).toBe('Sé');
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toContain('countrycode=PT');
    expect(init?.signal).toBe(controller.signal);
  });

  it('permite outros países', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ features: [] }));
    const geocoder = createPhotonGeocoder({ baseUrl: '/g', fetch: fetchMock, countryCodes: [] });
    await geocoder.search('Madrid');
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain('countrycode');
  });

  it('geocodificação inversa devolve o primeiro local ou null', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ features: [feature({ osm_type: 'N', osm_id: 3 })] }))
      .mockResolvedValueOnce(jsonResponse({ features: [] }));
    const geocoder = createPhotonGeocoder({ baseUrl: '/g', fetch: fetchMock });
    await expect(geocoder.reverse({ lng: -9.1, lat: 38.7 })).resolves.toMatchObject({
      id: 'osm:N3',
    });
    await expect(geocoder.reverse({ lng: -9.1, lat: 38.7 })).resolves.toBeNull();
    await expect(geocoder.reverse({ lng: 300, lat: 0 })).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    [429, 'rate_limited'],
    [503, 'unavailable'],
  ])('HTTP %i resulta no erro %s', async (status, code) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('x', { status }));
    const geocoder = createPhotonGeocoder({ baseUrl: '/g', fetch: fetchMock });
    await expect(geocoder.search('Lisboa')).rejects.toMatchObject({ code, status });
  });

  it('falha de rede', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'));
    const geocoder = createPhotonGeocoder({ baseUrl: '/g', fetch: fetchMock });
    await expect(geocoder.search('Lisboa')).rejects.toMatchObject({ code: 'network' });
  });

  it('JSON inválido', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('<html>', { status: 200 }));
    const geocoder = createPhotonGeocoder({ baseUrl: '/g', fetch: fetchMock });
    await expect(geocoder.search('Lisboa')).rejects.toMatchObject({ code: 'bad_response' });
  });

  it('propaga o cancelamento sem o converter em erro de rede', async () => {
    const abort = new DOMException('Cancelado', 'AbortError');
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(abort);
    const geocoder = createPhotonGeocoder({ baseUrl: '/g', fetch: fetchMock });
    const error: unknown = await geocoder.search('Lisboa').catch((e: unknown) => e);
    expect(isAbortError(error)).toBe(true);
  });

  it('propaga o cancelamento durante a leitura da resposta', async () => {
    const response = jsonResponse({ features: [] });
    vi.spyOn(response, 'json').mockRejectedValue(new DOMException('Cancelado', 'AbortError'));
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response);
    const geocoder = createPhotonGeocoder({ baseUrl: '/g', fetch: fetchMock });
    const error: unknown = await geocoder.search('Lisboa').catch((e: unknown) => e);
    expect(isAbortError(error)).toBe(true);
  });
});
