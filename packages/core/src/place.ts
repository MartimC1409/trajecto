// Tem de ser o primeiro import: desliga o `eval` do zod antes de criar esquemas (CSP).
import './csp';
import { z } from 'zod';
import type { BBox, LngLat } from './geo';
import { formatLngLat, roundTo } from './geo';
import { comparisonKey } from './text';

/** Tipo de local, segundo o formato GeocodeJSON usado pelo Photon. */
export const PLACE_KINDS = [
  'house',
  'street',
  'locality',
  'district',
  'city',
  'county',
  'state',
  'country',
  'other',
  'coordinate',
] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];

export interface PlaceAddress {
  readonly street?: string;
  readonly housenumber?: string;
  readonly postcode?: string;
  readonly locality?: string;
  readonly district?: string;
  readonly county?: string;
  readonly state?: string;
  readonly country?: string;
  readonly countryCode?: string;
}

export interface Place {
  /** Identificador estável, por exemplo "osm:N240109189" ou "coord:38.72230,-9.13930". */
  readonly id: string;
  /** Nome próprio do local (pode não existir, por exemplo numa morada). */
  readonly name?: string;
  readonly kind: PlaceKind;
  readonly lngLat: LngLat;
  readonly address: PlaceAddress;
  /** Categoria OSM, por exemplo "amenity:pharmacy". */
  readonly category?: string;
  readonly bbox?: BBox;
}

const optionalText = z.string().trim().min(1).max(300).optional();

/** Esquema usado para validar locais lidos do armazenamento local. */
export const placeSchema = z.object({
  id: z.string().min(1).max(200),
  name: optionalText,
  kind: z.enum(PLACE_KINDS),
  lngLat: z.object({
    lng: z.number().min(-180).max(180),
    lat: z.number().min(-90).max(90),
  }),
  address: z.object({
    street: optionalText,
    housenumber: optionalText,
    postcode: optionalText,
    locality: optionalText,
    district: optionalText,
    county: optionalText,
    state: optionalText,
    country: optionalText,
    countryCode: optionalText,
  }),
  category: optionalText,
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
});

/** Cria um local a partir de coordenadas (por exemplo, um clique no mapa sem morada). */
export function coordinatePlace(lngLat: LngLat): Place {
  const rounded = { lng: roundTo(lngLat.lng, 5), lat: roundTo(lngLat.lat, 5) };
  return {
    id: `coord:${formatLngLat(rounded).replace(' ', '')}`,
    kind: 'coordinate',
    lngLat: rounded,
    address: {},
  };
}

export interface FormattedPlace {
  /** Título principal; `null` quando não há nome nem rua (a UI usa um texto genérico). */
  readonly title: string | null;
  /** Linha secundária com a morada, por exemplo "1100-053 Lisboa". */
  readonly subtitle: string;
}

/** Linha "Rua, número" no formato habitual em Portugal. */
function streetLine(address: PlaceAddress): string | undefined {
  if (address.street && address.housenumber) return `${address.street}, ${address.housenumber}`;
  return address.street;
}

/**
 * Formata um local para mostrar ao utilizador, à maneira portuguesa:
 * "Museu X" / "Rua Y, 10, 1100-053 Lisboa".
 */
export function formatPlace(place: Place): FormattedPlace {
  const a = place.address;
  const street = streetLine(a);
  const title = place.name ?? street ?? a.housenumber ?? null;

  const locality = a.locality ?? a.district;
  const postcodeLine =
    a.postcode && locality ? `${a.postcode} ${locality}` : (a.postcode ?? locality);

  const parts: (string | undefined)[] = [
    street === title ? undefined : street,
    postcodeLine,
    a.county,
    a.state,
    a.countryCode?.toUpperCase() === 'PT' ? undefined : a.country,
  ];

  // Evita repetições como "1100-053 Lisboa, Lisboa" ou "Porto" no título e na morada.
  const seen = new Set<string>();
  if (title) seen.add(comparisonKey(title));
  if (locality) seen.add(comparisonKey(locality));
  const unique: string[] = [];
  parts.forEach((part, index) => {
    if (!part) return;
    const key = comparisonKey(part);
    // A linha "código postal + localidade" (índice 1) só é omitida se repetir o título.
    const isPostcodeLine = index === 1;
    const duplicate = isPostcodeLine
      ? title !== null && key === comparisonKey(title)
      : seen.has(key);
    if (duplicate) return;
    seen.add(key);
    unique.push(part);
  });

  return { title, subtitle: unique.join(', ') };
}
