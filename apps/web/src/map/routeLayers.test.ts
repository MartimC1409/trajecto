import type { Route } from '@trajecto/core';
import { parseValhallaResponse } from '@trajecto/core';
import { valhallaResponse } from '@trajecto/core/testing';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { describe, expect, it, vi } from 'vitest';
import {
  ROUTE_HIT_LAYER,
  ROUTE_SOURCE,
  addRouteLayers,
  routesBounds,
  routesToGeoJson,
} from './routeLayers';

const routes = parseValhallaResponse(valhallaResponse(1), 'car') as Route[];

describe('routeLayers', () => {
  it('converte as rotas em GeoJSON com a selecionada no fim', () => {
    const data = routesToGeoJson(routes, 0);
    expect(data.features.map((f) => f.properties)).toEqual([
      { index: 1, selected: false },
      { index: 0, selected: true },
    ]);
    expect(data.features[1]?.geometry.coordinates[0]).toEqual([-9.145, 38.715]);
  });

  it('calcula o retângulo de todas as rotas', () => {
    expect(routesBounds(routes)).toEqual([-9.1475, 38.715, -9.14, 38.722]);
  });

  it('cria a fonte e as camadas por baixo dos nomes das ruas, uma só vez', () => {
    const sources = new Map<string, unknown>();
    const map = {
      getSource: vi.fn((id: string) => sources.get(id)),
      addSource: vi.fn((id: string, source: unknown) => sources.set(id, source)),
      addLayer: vi.fn(),
      getStyle: () => ({
        layers: [
          { id: 'water', type: 'fill' },
          { id: 'road-label', type: 'symbol' },
        ],
      }),
    } as unknown as MapLibreMap & {
      addLayer: ReturnType<typeof vi.fn>;
      addSource: ReturnType<typeof vi.fn>;
    };
    addRouteLayers(map, routesToGeoJson(routes, 0));
    addRouteLayers(map, routesToGeoJson(routes, 0));
    expect(map.addSource).toHaveBeenCalledTimes(1);
    expect(sources.has(ROUTE_SOURCE)).toBe(true);
    const calls = map.addLayer.mock.calls;
    expect(calls.map(([layer]) => (layer as { id: string }).id)).toEqual([
      'trajecto-routes-alt',
      'trajecto-routes-casing',
      'trajecto-routes-main',
      ROUTE_HIT_LAYER,
    ]);
    expect(calls[0]?.[1]).toBe('road-label');
    expect(calls[3]?.[1]).toBeUndefined();
  });
});
