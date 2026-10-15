import type { BBox, Route } from '@trajecto/core';
import type { Map as MapLibreMap } from 'maplibre-gl';

export const ROUTE_SOURCE = 'trajecto-routes';
export const ROUTE_HIT_LAYER = 'trajecto-routes-hit';

/** GeoJSON das rotas (FeatureCollection de LineString). */
export interface RouteFeatures {
  readonly type: 'FeatureCollection';
  readonly features: {
    readonly type: 'Feature';
    readonly properties: { readonly index: number; readonly selected: boolean };
    readonly geometry: { readonly type: 'LineString'; readonly coordinates: number[][] };
  }[];
}

/** Rotas em GeoJSON; a selecionada vai no fim para ser desenhada por cima das outras. */
export function routesToGeoJson(routes: readonly Route[], selected: number): RouteFeatures {
  const features = routes.map((route, index) => ({
    type: 'Feature' as const,
    properties: { index, selected: index === selected },
    geometry: {
      type: 'LineString' as const,
      coordinates: route.geometry.map((p) => [p.lng, p.lat]),
    },
  }));
  features.sort((a, b) => Number(a.properties.selected) - Number(b.properties.selected));
  return { type: 'FeatureCollection', features };
}

/** Retângulo que contém todas as rotas. */
export function routesBounds(routes: readonly Route[]): BBox {
  return routes.reduce<BBox>(
    (acc, route) => [
      Math.min(acc[0], route.bbox[0]),
      Math.min(acc[1], route.bbox[1]),
      Math.max(acc[2], route.bbox[2]),
      Math.max(acc[3], route.bbox[3]),
    ],
    [Infinity, Infinity, -Infinity, -Infinity],
  );
}

/**
 * Cria a fonte e as camadas das rotas, por baixo dos nomes das ruas (para continuarem legíveis).
 * Não faz nada se já existirem.
 */
export function addRouteLayers(map: MapLibreMap, data: RouteFeatures): void {
  if (map.getSource(ROUTE_SOURCE)) return;
  map.addSource(ROUTE_SOURCE, { type: 'geojson', data });
  const beforeId = map.getStyle().layers.find((layer) => layer.type === 'symbol')?.id;
  const round = { 'line-join': 'round', 'line-cap': 'round' } as const;
  map.addLayer(
    {
      id: 'trajecto-routes-alt',
      type: 'line',
      source: ROUTE_SOURCE,
      filter: ['==', ['get', 'selected'], false],
      layout: round,
      paint: { 'line-color': '#7d8fa3', 'line-width': 7, 'line-opacity': 0.9 },
    },
    beforeId,
  );
  map.addLayer(
    {
      id: 'trajecto-routes-casing',
      type: 'line',
      source: ROUTE_SOURCE,
      filter: ['==', ['get', 'selected'], true],
      layout: round,
      paint: { 'line-color': '#0a3d91', 'line-width': 10 },
    },
    beforeId,
  );
  map.addLayer(
    {
      id: 'trajecto-routes-main',
      type: 'line',
      source: ROUTE_SOURCE,
      filter: ['==', ['get', 'selected'], true],
      layout: round,
      paint: { 'line-color': '#1a73e8', 'line-width': 6 },
    },
    beforeId,
  );
  // Camada invisível e larga, para facilitar tocar numa rota com o dedo.
  map.addLayer({
    id: ROUTE_HIT_LAYER,
    type: 'line',
    source: ROUTE_SOURCE,
    layout: round,
    paint: { 'line-color': '#000000', 'line-width': 24, 'line-opacity': 0 },
  });
}
