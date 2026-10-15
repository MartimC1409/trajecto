/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL base do serviço de pesquisa (por omissão, o proxy local "/geocoder"). */
  readonly VITE_GEOCODER_URL?: string;
  /** TileJSON dos tiles vetoriais (esquema OpenMapTiles). */
  readonly VITE_MAP_TILEJSON_URL?: string;
  /** Modelo de URL das fontes do mapa. */
  readonly VITE_MAP_GLYPHS_URL?: string;
  readonly VITE_MAP_RELIEF_TILES_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
