import type { Map as MapLibreMap } from 'maplibre-gl';
import { describe, expect, it, vi } from 'vitest';
import { TRANSIT_ITINERARIES } from '../test/transit';
import {
  TRANSIT_KIND_COLOR,
  TRANSIT_SOURCE,
  addTransitLayers,
  contrastRatio,
  legColors,
  transitToGeoJson,
} from './transitLayers';

describe('transitLayers', () => {
  it('calcula o contraste WCAG', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBe(1);
  });

  it('usa as cores do operador só quando o texto se lê bem', () => {
    expect(legColors({ kind: 'subway', color: '#00a651', textColor: '#000000' })).toEqual({
      background: '#00a651',
      text: '#000000',
    });
    // Branco em amarelo não se lê: o texto passa a preto.
    expect(legColors({ kind: 'bus', color: '#ffcc00', textColor: '#ffffff' })).toEqual({
      background: '#ffcc00',
      text: '#000000',
    });
    // Sem cores do operador: a cor do tipo de transporte, com texto branco.
    expect(legColors({ kind: 'rail' })).toEqual({
      background: TRANSIT_KIND_COLOR.rail,
      text: '#ffffff',
    });
    for (const kind of Object.keys(TRANSIT_KIND_COLOR) as (keyof typeof TRANSIT_KIND_COLOR)[]) {
      const colors = legColors({ kind });
      expect(contrastRatio(colors.background, colors.text)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('converte o itinerário em linhas (a pé por baixo) e paragens de entrada e saída', () => {
    const data = transitToGeoJson(TRANSIT_ITINERARIES[0] ?? null);
    expect(
      data.features.map((f) => [f.geometry.type, (f.properties as { walk?: boolean }).walk]),
    ).toEqual([
      ['LineString', true],
      ['LineString', true],
      ['LineString', false],
      ['Point', undefined],
      ['Point', undefined],
    ]);
    expect(data.features[2]?.properties.color).toBe('#00a651');
    expect(data.features[0]?.properties.color).toBe(TRANSIT_KIND_COLOR.walk);
    expect(data.features[4]?.geometry.coordinates).toEqual([-9.1442, 38.7533]);
    expect(transitToGeoJson(null).features).toEqual([]);
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
          { id: 'road-oneway', type: 'symbol' },
          { id: 'road-label', type: 'symbol' },
        ],
      }),
    } as unknown as MapLibreMap & { addLayer: ReturnType<typeof vi.fn> };
    addTransitLayers(map, transitToGeoJson(TRANSIT_ITINERARIES[0] ?? null));
    addTransitLayers(map, transitToGeoJson(null));
    expect(sources.has(TRANSIT_SOURCE)).toBe(true);
    const calls = map.addLayer.mock.calls;
    expect(calls.map(([layer]) => (layer as { id: string }).id)).toEqual([
      'trajecto-transit-walk',
      'trajecto-transit-casing',
      'trajecto-transit-line',
      'trajecto-transit-stops',
    ]);
    expect(calls.every((call) => call[1] === 'road-label')).toBe(true);
  });
});
