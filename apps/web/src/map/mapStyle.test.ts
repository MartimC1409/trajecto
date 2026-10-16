import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { describe, expect, it } from 'vitest';
import type { LayerSpecification } from '@maplibre/maplibre-gl-style-spec';
import { parseMapImageId } from './mapImages';
import {
  MAP_ATTRIBUTION,
  ONEWAY_LAYER,
  POI_LAYERS,
  RELIEF_SOURCE,
  buildMapStyle,
} from './mapStyle';

const options = {
  tileJsonUrl: 'https://tiles.openfreemap.org/planet',
  glyphsUrl: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
};

describe('buildMapStyle', () => {
  it.each(['light', 'dark'] as const)(
    'o estilo %s é válido segundo a especificação MapLibre',
    (theme) => {
      const style = buildMapStyle(theme, options);
      expect(validateStyleMin(style)).toEqual([]);
    },
  );

  it('os dois temas têm as mesmas camadas, só mudam as cores', () => {
    const light = buildMapStyle('light', options).layers.map((l) => l.id);
    const dark = buildMapStyle('dark', options).layers.map((l) => l.id);
    expect(dark).toEqual(light);
    expect(new Set(light).size).toBe(light.length);
  });

  it('usa os URLs configurados', () => {
    const style = buildMapStyle('light', options);
    expect(style.glyphs).toBe(options.glyphsUrl);
    expect(style.sources.openmaptiles).toEqual({ type: 'vector', url: options.tileJsonUrl });
  });

  it('inclui as atribuições obrigatórias', () => {
    const text = MAP_ATTRIBUTION.join(' ');
    expect(text).toContain('© OpenStreetMap');
    expect(text).toContain('openstreetmap.org/copyright');
    expect(text).toContain('© OpenMapTiles');
  });

  it.each(['light', 'dark'] as const)('com relevo, o estilo %s continua válido', (theme) => {
    const style = buildMapStyle(theme, {
      ...options,
      reliefTilesUrl: 'https://dem.example/{z}/{x}/{y}.webp',
    });
    expect(validateStyleMin(style)).toEqual([]);
    expect(style.sources[RELIEF_SOURCE]).toMatchObject({
      type: 'raster-dem',
      encoding: 'terrarium',
      maxzoom: 12,
      tiles: ['https://dem.example/{z}/{x}/{y}.webp'],
    });
    const ids = style.layers.map((l) => l.id);
    // O relevo fica por baixo da água e das estradas.
    expect(ids.indexOf('hillshade')).toBeLessThan(ids.indexOf('water'));
    expect(ids.indexOf('hillshade')).toBeGreaterThan(ids.indexOf('park'));
  });

  it('sem relevo não há pedidos ao serviço de altitude', () => {
    const style = buildMapStyle('light', { ...options, reliefTilesUrl: null });
    expect(style.sources[RELIEF_SOURCE]).toBeUndefined();
    expect(style.layers.some((l) => l.type === 'hillshade')).toBe(false);
  });

  it('as camadas de linha só desenham linhas (não contornam polígonos)', () => {
    const layers = buildMapStyle('light', options).layers as (LayerSpecification & {
      'source-layer'?: string;
      filter?: unknown;
    })[];
    const lines = layers.filter(
      (l) =>
        l.type === 'line' &&
        ['transportation', 'aeroway', 'waterway'].includes(l['source-layer'] ?? ''),
    );
    expect(lines.length).toBeGreaterThan(10);
    for (const layer of lines) expect(JSON.stringify(layer.filter)).toContain('geometry-type');
  });

  it('todas as imagens usadas pelo estilo são desenhadas pela app (não há sprite)', () => {
    for (const theme of ['light', 'dark'] as const) {
      const style = buildMapStyle(theme, options);
      expect(style.sprite).toBeUndefined();
      const text = JSON.stringify(style.layers.map((l) => (l as { layout?: unknown }).layout));
      const ids = new Set(text.match(/trajecto-(?:poi|oneway|shield)-[a-z-]+/gu) ?? []);
      expect(ids.size).toBeGreaterThan(3);
      for (const id of ids) {
        // Os ids dos locais são completados pela expressão (prefixo + nome do desenho).
        if (id.endsWith('-')) continue;
        expect(parseMapImageId(id), id).not.toBeNull();
      }
    }
  });

  it('as setas de sentido único e os locais tocáveis existem', () => {
    const ids = buildMapStyle('light', options).layers.map((l) => l.id);
    expect(ids).toContain(ONEWAY_LAYER);
    for (const id of POI_LAYERS) expect(ids).toContain(id);
    expect(ids.length).toBeLessThanOrEqual(75);
  });

  it('o texto das saídas segue a língua', () => {
    const style = buildMapStyle('light', { ...options, exitPrefix: 'Exit ' });
    const exit = style.layers.find((l) => l.id === 'label-exit') as {
      layout?: Record<string, unknown>;
    };
    expect(exit.layout?.['text-field']).toEqual(['concat', 'Exit ', ['get', 'ref']]);
  });
});
