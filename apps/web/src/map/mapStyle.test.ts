import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { describe, expect, it } from 'vitest';
import { MAP_ATTRIBUTION, buildMapStyle } from './mapStyle';

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
});
