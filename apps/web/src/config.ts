export interface AppConfig {
  readonly geocoderUrl: string;
  readonly tileJsonUrl: string;
  readonly glyphsUrl: string;
}

export const config: AppConfig = {
  geocoderUrl: import.meta.env.VITE_GEOCODER_URL || '/geocoder',
  tileJsonUrl: import.meta.env.VITE_MAP_TILEJSON_URL || 'https://tiles.openfreemap.org/planet',
  glyphsUrl:
    import.meta.env.VITE_MAP_GLYPHS_URL ||
    'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
};
