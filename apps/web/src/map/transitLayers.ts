import type { TransitItinerary, TransitKind, TransitLeg } from '@trajecto/core';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { ONEWAY_LAYER } from './mapStyle';

export const TRANSIT_SOURCE = 'trajecto-transit';

/** Cor de cada tipo de transporte quando o operador não publica a cor da linha. */
export const TRANSIT_KIND_COLOR: Readonly<Record<TransitKind, string>> = {
  walk: '#7d8fa3',
  bus: '#1565c0',
  coach: '#6a1b9a',
  tram: '#e65100',
  subway: '#c62828',
  rail: '#2e7d32',
  ferry: '#00838f',
  cable: '#795548',
  other: '#546e7a',
};

function luminance(hex: string): number {
  const channel = (offset: number) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** Contraste WCAG entre duas cores "#rrggbb" (1 a 21). */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** Contraste mínimo do texto normal (WCAG 1.4.3, AA). */
const MIN_TEXT_CONTRAST = 4.5;

/**
 * Cores da etiqueta de uma linha: as do operador quando se leem bem; senão, o texto passa a
 * branco ou preto (o que tiver mais contraste com o fundo).
 */
export function legColors(leg: Pick<TransitLeg, 'kind' | 'color' | 'textColor'>): {
  readonly background: string;
  readonly text: string;
} {
  const background = leg.color ?? TRANSIT_KIND_COLOR[leg.kind];
  if (leg.textColor && contrastRatio(background, leg.textColor) >= MIN_TEXT_CONTRAST) {
    return { background, text: leg.textColor };
  }
  const text =
    contrastRatio(background, '#ffffff') >= contrastRatio(background, '#000000')
      ? '#ffffff'
      : '#000000';
  return { background, text };
}

type Position = [number, number];

export interface TransitFeatures {
  readonly type: 'FeatureCollection';
  readonly features: (
    | {
        readonly type: 'Feature';
        readonly properties: { readonly walk: boolean; readonly color: string };
        readonly geometry: { readonly type: 'LineString'; readonly coordinates: Position[] };
      }
    | {
        readonly type: 'Feature';
        readonly properties: { readonly color: string };
        readonly geometry: { readonly type: 'Point'; readonly coordinates: Position };
      }
  )[];
}

/** Troços do itinerário em GeoJSON (linhas) e as paragens onde se entra e sai (pontos). */
export function transitToGeoJson(itinerary: TransitItinerary | null): TransitFeatures {
  if (!itinerary) return { type: 'FeatureCollection', features: [] };
  const walks: TransitFeatures['features'] = [];
  const rides: TransitFeatures['features'] = [];
  const stops: TransitFeatures['features'] = [];
  for (const leg of itinerary.legs) {
    const walk = leg.kind === 'walk';
    const color = walk ? TRANSIT_KIND_COLOR.walk : legColors(leg).background;
    (walk ? walks : rides).push({
      type: 'Feature',
      properties: { walk, color },
      geometry: { type: 'LineString', coordinates: leg.geometry.map((p) => [p.lng, p.lat]) },
    });
    if (walk) continue;
    for (const stop of [leg.from, leg.to]) {
      stops.push({
        type: 'Feature',
        properties: { color },
        geometry: { type: 'Point', coordinates: [stop.lngLat.lng, stop.lngLat.lat] },
      });
    }
  }
  // Os troços a pé ficam por baixo dos transportes; as paragens por cima de tudo.
  return { type: 'FeatureCollection', features: [...walks, ...rides, ...stops] };
}

/**
 * Cria a fonte e as camadas do itinerário, por baixo dos nomes das ruas (como as rotas).
 * Não faz nada se já existirem.
 */
export function addTransitLayers(map: MapLibreMap, data: TransitFeatures): void {
  if (map.getSource(TRANSIT_SOURCE)) return;
  map.addSource(TRANSIT_SOURCE, { type: 'geojson', data });
  const beforeId = map
    .getStyle()
    .layers.find((layer) => layer.type === 'symbol' && layer.id !== ONEWAY_LAYER)?.id;
  const round = { 'line-join': 'round', 'line-cap': 'round' } as const;
  map.addLayer(
    {
      id: 'trajecto-transit-walk',
      type: 'line',
      source: TRANSIT_SOURCE,
      filter: ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'walk'], true]],
      layout: round,
      // Pontos (traço de comprimento quase nulo com pontas redondas).
      paint: { 'line-color': ['get', 'color'], 'line-width': 5, 'line-dasharray': [0.1, 2] },
    },
    beforeId,
  );
  map.addLayer(
    {
      id: 'trajecto-transit-casing',
      type: 'line',
      source: TRANSIT_SOURCE,
      filter: ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'walk'], false]],
      layout: round,
      paint: { 'line-color': '#ffffff', 'line-width': 10 },
    },
    beforeId,
  );
  map.addLayer(
    {
      id: 'trajecto-transit-line',
      type: 'line',
      source: TRANSIT_SOURCE,
      filter: ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'walk'], false]],
      layout: round,
      paint: { 'line-color': ['get', 'color'], 'line-width': 6 },
    },
    beforeId,
  );
  map.addLayer(
    {
      id: 'trajecto-transit-stops',
      type: 'circle',
      source: TRANSIT_SOURCE,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-radius': 5,
        'circle-color': '#ffffff',
        'circle-stroke-color': ['get', 'color'],
        'circle-stroke-width': 3,
      },
    },
    beforeId,
  );
}
