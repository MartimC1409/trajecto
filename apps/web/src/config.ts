export interface AppConfig {
  readonly geocoderUrl: string;
  readonly routerUrl: string;
  readonly weatherUrl: string;
  /** Ficheiro de radares fixos gerado a partir do OpenStreetMap. */
  readonly speedCamerasUrl: string;
  readonly tileJsonUrl: string;
  readonly glyphsUrl: string;
  /** Tiles de altitude (formato Terrarium) para o relevo do terreno. */
  readonly reliefTilesUrl: string;
}

export const config: AppConfig = {
  geocoderUrl: import.meta.env.VITE_GEOCODER_URL || '/geocoder',
  routerUrl: import.meta.env.VITE_ROUTER_URL || '/api/route',
  weatherUrl: import.meta.env.VITE_WEATHER_URL || '/api/weather',
  speedCamerasUrl: '/data/speed-cameras.json',
  tileJsonUrl: import.meta.env.VITE_MAP_TILEJSON_URL || 'https://tiles.openfreemap.org/planet',
  glyphsUrl:
    import.meta.env.VITE_MAP_GLYPHS_URL ||
    'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  reliefTilesUrl:
    import.meta.env.VITE_MAP_RELIEF_TILES_URL || 'https://tiles.mapterhorn.com/{z}/{x}/{y}.webp',
};
