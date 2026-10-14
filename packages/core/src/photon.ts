// Tem de ser o primeiro import: desliga o `eval` do zod antes de criar esquemas (CSP).
import './csp';
import { z } from 'zod';
import type { BBox, LngLat } from './geo';
import { isValidLngLat, roundTo } from './geo';
import type { Geocoder, ReverseOptions, SearchOptions } from './geocoder';
import { GeocoderError } from './geocoder';
import type { Place, PlaceAddress, PlaceKind } from './place';
import { PLACE_KINDS } from './place';
import { MAX_QUERY_LENGTH, normalizeQuery } from './text';

export const DEFAULT_SEARCH_LIMIT = 6;
export const MAX_SEARCH_LIMIT = 10;
/** Comprimento mínimo de uma pesquisa, para não sobrecarregar o servidor público. */
export const MIN_QUERY_LENGTH = 3;
/** Proteção contra respostas anormalmente grandes: nunca processamos mais do que isto. */
export const MAX_FEATURES = 50;

export interface PhotonGeocoderOptions {
  /** URL base, por exemplo "/geocoder" (proxy local) ou "http://localhost:2322". */
  readonly baseUrl: string;
  /** Códigos ISO 3166-1 alfa-2 para limitar os resultados (por omissão: Portugal). */
  readonly countryCodes?: readonly string[];
  /** Permite injetar `fetch` nos testes. */
  readonly fetch?: typeof fetch;
}

// Os dados vêm de um serviço externo: validamos tudo e ignoramos o que não for reconhecido.
const optionalText = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim().slice(0, 300) || undefined)
  .optional()
  .catch(undefined);

const photonFeatureSchema = z.object({
  geometry: z.object({
    type: z.literal('Point'),
    coordinates: z.tuple([z.number(), z.number()]).rest(z.number()),
  }),
  properties: z.object({
    osm_type: optionalText,
    osm_id: z.number().int().optional().catch(undefined),
    osm_key: optionalText,
    osm_value: optionalText,
    type: optionalText,
    name: optionalText,
    housenumber: optionalText,
    street: optionalText,
    postcode: optionalText,
    city: optionalText,
    locality: optionalText,
    district: optionalText,
    county: optionalText,
    state: optionalText,
    country: optionalText,
    countrycode: optionalText,
    extent: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional().catch(undefined),
  }),
});

const photonResponseSchema = z.object({
  features: z.array(z.unknown()),
});

type PhotonFeature = z.infer<typeof photonFeatureSchema>;

function toKind(type: string | undefined): PlaceKind {
  const kind = PLACE_KINDS.find((k) => k === type);
  return kind && kind !== 'coordinate' ? kind : 'other';
}

/** O Photon devolve `extent` como [oeste, norte, este, sul]; normalizamos sem depender da ordem. */
function toBBox(extent: readonly [number, number, number, number] | undefined): BBox | undefined {
  if (!extent) return undefined;
  const [lon1, lat1, lon2, lat2] = extent;
  const bbox: BBox = [
    Math.min(lon1, lon2),
    Math.min(lat1, lat2),
    Math.max(lon1, lon2),
    Math.max(lat1, lat2),
  ];
  const valid =
    isValidLngLat({ lng: bbox[0], lat: bbox[1] }) && isValidLngLat({ lng: bbox[2], lat: bbox[3] });
  return valid ? bbox : undefined;
}

function compact<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined && v !== ''),
  ) as T;
}

export function photonFeatureToPlace(feature: PhotonFeature): Place | null {
  const [lng, lat] = feature.geometry.coordinates;
  const lngLat = { lng, lat };
  if (!isValidLngLat(lngLat)) return null;

  const p = feature.properties;
  const osmType = p.osm_type?.toUpperCase();
  const id =
    osmType && /^[NWR]$/u.test(osmType) && p.osm_id !== undefined
      ? `osm:${osmType}${p.osm_id}`
      : `photon:${roundTo(lat, 6)},${roundTo(lng, 6)}:${p.name ?? ''}`;

  const address: PlaceAddress = compact({
    street: p.street,
    housenumber: p.housenumber,
    postcode: p.postcode,
    locality: p.city ?? p.locality,
    district: p.district,
    county: p.county,
    state: p.state,
    country: p.country,
    countryCode: p.countrycode?.toUpperCase(),
  });

  const bbox = toBBox(p.extent);
  return compact({
    id,
    name: p.name,
    kind: toKind(p.type),
    lngLat,
    address,
    category: p.osm_key && p.osm_value ? `${p.osm_key}:${p.osm_value}` : undefined,
    bbox,
  }) as Place;
}

/** Converte uma resposta do Photon em locais, ignorando elementos inválidos. */
export function parsePhotonResponse(body: unknown): Place[] {
  const parsed = photonResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new GeocoderError(
      'bad_response',
      'Resposta do serviço de pesquisa em formato inesperado.',
    );
  }
  const places: Place[] = [];
  const ids = new Set<string>();
  for (const raw of parsed.data.features.slice(0, MAX_FEATURES)) {
    const feature = photonFeatureSchema.safeParse(raw);
    if (!feature.success) continue;
    const place = photonFeatureToPlace(feature.data);
    if (place && !ids.has(place.id)) {
      ids.add(place.id);
      places.push(place);
    }
  }
  return places;
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_SEARCH_LIMIT;
  return Math.min(MAX_SEARCH_LIMIT, Math.max(1, Math.trunc(limit)));
}

export function buildSearchUrl(
  baseUrl: string,
  query: string,
  options: SearchOptions & { countryCodes?: readonly string[] } = {},
): string {
  const params = new URLSearchParams();
  params.set('q', normalizeQuery(query).slice(0, MAX_QUERY_LENGTH));
  params.set('limit', String(clampLimit(options.limit)));
  if (options.bias && isValidLngLat(options.bias.lngLat)) {
    params.set('lat', String(roundTo(options.bias.lngLat.lat, 4)));
    params.set('lon', String(roundTo(options.bias.lngLat.lng, 4)));
    params.set('zoom', String(Math.min(18, Math.max(0, Math.round(options.bias.zoom)))));
  }
  for (const code of options.countryCodes ?? []) params.append('countrycode', code);
  return `${baseUrl.replace(/\/+$/u, '')}/api?${params.toString()}`;
}

export function buildReverseUrl(baseUrl: string, lngLat: LngLat): string {
  const params = new URLSearchParams({
    lat: String(roundTo(lngLat.lat, 6)),
    lon: String(roundTo(lngLat.lng, 6)),
    limit: '1',
  });
  return `${baseUrl.replace(/\/+$/u, '')}/reverse?${params.toString()}`;
}

async function getJson(
  fetchImpl: typeof fetch,
  url: string,
  signal?: AbortSignal,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { Accept: 'application/json' },
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new GeocoderError('network', 'Sem ligação ao serviço de pesquisa.');
  }
  if (response.status === 429) {
    throw new GeocoderError('rate_limited', 'Demasiados pedidos ao serviço de pesquisa.', 429);
  }
  if (!response.ok) {
    throw new GeocoderError(
      'unavailable',
      `Serviço de pesquisa indisponível (HTTP ${response.status}).`,
      response.status,
    );
  }
  try {
    return await response.json();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new GeocoderError('bad_response', 'Resposta do serviço de pesquisa inválida.');
  }
}

export function createPhotonGeocoder(options: PhotonGeocoderOptions): Geocoder {
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  const countryCodes = options.countryCodes ?? ['PT'];

  return {
    async search(query: string, searchOptions: SearchOptions = {}): Promise<Place[]> {
      if (normalizeQuery(query).length < MIN_QUERY_LENGTH) return [];
      const url = buildSearchUrl(options.baseUrl, query, { ...searchOptions, countryCodes });
      return parsePhotonResponse(await getJson(fetchImpl, url, searchOptions.signal));
    },

    async reverse(lngLat: LngLat, reverseOptions: ReverseOptions = {}): Promise<Place | null> {
      if (!isValidLngLat(lngLat)) return null;
      const url = buildReverseUrl(options.baseUrl, lngLat);
      const places = parsePhotonResponse(await getJson(fetchImpl, url, reverseOptions.signal));
      return places[0] ?? null;
    },
  };
}
