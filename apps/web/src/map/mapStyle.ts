import type {
  ExpressionSpecification,
  LayerSpecification,
  StyleSpecification,
} from '@maplibre/maplibre-gl-style-spec';

export type MapTheme = 'light' | 'dark';

export interface MapStyleOptions {
  readonly tileJsonUrl: string;
  readonly glyphsUrl: string;
}

/**
 * Atribuições obrigatórias (ODbL do OpenStreetMap, CC-BY do esquema OpenMapTiles).
 * O crédito ao OpenFreeMap vem no próprio TileJSON do serviço e também está no painel "Sobre".
 */
export const MAP_ATTRIBUTION = [
  '<a href="https://www.openmaptiles.org/" target="_blank" rel="noopener noreferrer">© OpenMapTiles</a>',
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap</a>',
];

interface Palette {
  readonly background: string;
  readonly water: string;
  readonly waterLabel: string;
  readonly wood: string;
  readonly grass: string;
  readonly sand: string;
  readonly residential: string;
  readonly industrial: string;
  readonly institutional: string;
  readonly building: string;
  readonly roadCasing: string;
  readonly motorway: string;
  readonly trunk: string;
  readonly primary: string;
  readonly secondary: string;
  readonly minor: string;
  readonly path: string;
  readonly rail: string;
  readonly ferry: string;
  readonly boundary: string;
  readonly text: string;
  readonly textMuted: string;
  readonly halo: string;
}

const PALETTES: Record<MapTheme, Palette> = {
  light: {
    background: '#f4f1ea',
    water: '#a9cbe8',
    waterLabel: '#245b8f',
    wood: '#cfe3c1',
    grass: '#dcecc9',
    sand: '#f1e6c8',
    residential: '#ece8e0',
    industrial: '#e9e2ea',
    institutional: '#f0e4dc',
    building: '#ddd6cc',
    roadCasing: '#c9c1b5',
    motorway: '#f4a65c',
    trunk: '#f7c06b',
    primary: '#fbd98b',
    secondary: '#fdf1b8',
    minor: '#ffffff',
    path: '#9a8f80',
    rail: '#9b9b9b',
    ferry: '#5b8fc7',
    boundary: '#9c7fa6',
    text: '#2b2b2b',
    textMuted: '#555555',
    halo: '#ffffff',
  },
  dark: {
    background: '#1b2026',
    water: '#0f2b40',
    waterLabel: '#8fb9de',
    wood: '#1f3022',
    grass: '#23332a',
    sand: '#3a3426',
    residential: '#22272e',
    industrial: '#29252d',
    institutional: '#2c2626',
    building: '#2f353d',
    roadCasing: '#111418',
    motorway: '#b8733a',
    trunk: '#a77e3e',
    primary: '#8a7447',
    secondary: '#5f5a49',
    minor: '#3b424b',
    path: '#7f8994',
    rail: '#6b7280',
    ferry: '#4f7fae',
    boundary: '#8f7a98',
    text: '#eceff3',
    textMuted: '#c3c9d1',
    halo: '#1b2026',
  },
};

const SOURCE = 'openmaptiles';
const FONT_REGULAR = ['Noto Sans Regular'];
const FONT_BOLD = ['Noto Sans Bold'];
const FONT_ITALIC = ['Noto Sans Italic'];

/** Nome em português quando existir, senão o nome local. */
const NAME: ExpressionSpecification = ['coalesce', ['get', 'name:pt'], ['get', 'name']];

/** Largura de linha que cresce exponencialmente com o zoom. */
function width(stops: readonly (readonly [number, number])[]): ExpressionSpecification {
  return ['interpolate', ['exponential', 1.4], ['zoom'], ...stops.flat()];
}

function classIn(...classes: string[]): ExpressionSpecification {
  return ['in', ['get', 'class'], ['literal', classes]];
}

const NOT_TUNNEL: ExpressionSpecification = ['!=', ['get', 'brunnel'], 'tunnel'];

interface RoadClass {
  readonly id: string;
  readonly classes: string[];
  readonly color: (p: Palette) => string;
  readonly width: readonly (readonly [number, number])[];
  readonly minzoom: number;
}

const ROAD_CLASSES: readonly RoadClass[] = [
  {
    id: 'minor',
    classes: ['minor', 'service', 'track'],
    color: (p) => p.minor,
    width: [
      [12, 0.5],
      [14, 2],
      [18, 14],
    ],
    minzoom: 12,
  },
  {
    id: 'secondary',
    classes: ['secondary', 'tertiary'],
    color: (p) => p.secondary,
    width: [
      [8, 0.5],
      [12, 1.5],
      [14, 4],
      [18, 18],
    ],
    minzoom: 8,
  },
  {
    id: 'primary',
    classes: ['primary'],
    color: (p) => p.primary,
    width: [
      [7, 0.5],
      [12, 2],
      [14, 5],
      [18, 22],
    ],
    minzoom: 7,
  },
  {
    id: 'trunk',
    classes: ['trunk'],
    color: (p) => p.trunk,
    width: [
      [5, 0.5],
      [10, 1.8],
      [14, 6],
      [18, 24],
    ],
    minzoom: 5,
  },
  {
    id: 'motorway',
    classes: ['motorway'],
    color: (p) => p.motorway,
    width: [
      [5, 0.6],
      [10, 2],
      [14, 6.5],
      [18, 26],
    ],
    minzoom: 5,
  },
];

function roadLayers(p: Palette): LayerSpecification[] {
  const casings: LayerSpecification[] = ROAD_CLASSES.map((road) => ({
    id: `road-${road.id}-casing`,
    type: 'line',
    source: SOURCE,
    'source-layer': 'transportation',
    minzoom: Math.max(road.minzoom, 10),
    filter: ['all', classIn(...road.classes), NOT_TUNNEL],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': p.roadCasing,
      'line-width': width(road.width.map(([z, w]) => [z, w + Math.min(2, w * 0.35)] as const)),
    },
  }));
  const fills: LayerSpecification[] = ROAD_CLASSES.map((road) => ({
    id: `road-${road.id}`,
    type: 'line',
    source: SOURCE,
    'source-layer': 'transportation',
    minzoom: road.minzoom,
    filter: ['all', classIn(...road.classes), NOT_TUNNEL],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': road.color(p), 'line-width': width(road.width) },
  }));
  return [...casings, ...fills];
}

export function buildMapStyle(theme: MapTheme, options: MapStyleOptions): StyleSpecification {
  const p = PALETTES[theme];

  const layers: LayerSpecification[] = [
    { id: 'background', type: 'background', paint: { 'background-color': p.background } },
    {
      id: 'landcover-wood',
      type: 'fill',
      source: SOURCE,
      'source-layer': 'landcover',
      filter: classIn('wood'),
      paint: { 'fill-color': p.wood },
    },
    {
      id: 'landcover-grass',
      type: 'fill',
      source: SOURCE,
      'source-layer': 'landcover',
      filter: classIn('grass', 'farmland', 'wetland'),
      paint: { 'fill-color': p.grass, 'fill-opacity': 0.8 },
    },
    {
      id: 'landcover-sand',
      type: 'fill',
      source: SOURCE,
      'source-layer': 'landcover',
      filter: classIn('sand', 'rock', 'ice'),
      paint: { 'fill-color': p.sand },
    },
    {
      id: 'landuse-residential',
      type: 'fill',
      source: SOURCE,
      'source-layer': 'landuse',
      filter: classIn('residential', 'suburb', 'quarter', 'neighbourhood'),
      paint: { 'fill-color': p.residential, 'fill-opacity': 0.8 },
    },
    {
      id: 'landuse-industrial',
      type: 'fill',
      source: SOURCE,
      'source-layer': 'landuse',
      filter: classIn('industrial', 'commercial', 'retail', 'railway', 'garages'),
      paint: { 'fill-color': p.industrial },
    },
    {
      id: 'landuse-institutional',
      type: 'fill',
      source: SOURCE,
      'source-layer': 'landuse',
      filter: classIn('school', 'university', 'college', 'kindergarten', 'hospital', 'stadium'),
      paint: { 'fill-color': p.institutional },
    },
    {
      id: 'park',
      type: 'fill',
      source: SOURCE,
      'source-layer': 'park',
      paint: { 'fill-color': p.grass, 'fill-opacity': 0.7 },
    },
    {
      id: 'water',
      type: 'fill',
      source: SOURCE,
      'source-layer': 'water',
      filter: NOT_TUNNEL,
      paint: { 'fill-color': p.water },
    },
    {
      id: 'waterway',
      type: 'line',
      source: SOURCE,
      'source-layer': 'waterway',
      filter: NOT_TUNNEL,
      paint: {
        'line-color': p.water,
        // A expressão de zoom tem de estar no topo; a classe decide a largura em cada nível.
        'line-width': [
          'interpolate',
          ['exponential', 1.4],
          ['zoom'],
          8,
          ['match', ['get', 'class'], ['river', 'canal'], 0.5, 0.1],
          14,
          ['match', ['get', 'class'], ['river', 'canal'], 3, 0.8],
          18,
          ['match', ['get', 'class'], ['river', 'canal'], 10, 3],
        ],
      },
    },
    {
      id: 'aeroway-runway',
      type: 'line',
      source: SOURCE,
      'source-layer': 'aeroway',
      minzoom: 11,
      filter: classIn('runway', 'taxiway'),
      paint: {
        'line-color': p.minor,
        'line-width': width([
          [11, 2],
          [17, 40],
        ]),
      },
    },
    {
      id: 'road-tunnel',
      type: 'line',
      source: SOURCE,
      'source-layer': 'transportation',
      minzoom: 12,
      filter: [
        'all',
        ['==', ['get', 'brunnel'], 'tunnel'],
        classIn('motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor'),
      ],
      paint: {
        'line-color': p.roadCasing,
        'line-width': width([
          [12, 1],
          [18, 12],
        ]),
        'line-dasharray': [1, 0.5],
        'line-opacity': 0.6,
      },
    },
    {
      id: 'path',
      type: 'line',
      source: SOURCE,
      'source-layer': 'transportation',
      minzoom: 14,
      filter: ['all', classIn('path'), NOT_TUNNEL],
      paint: {
        'line-color': p.path,
        'line-width': width([
          [14, 0.6],
          [18, 2.5],
        ]),
        'line-dasharray': [2, 1.5],
      },
    },
    ...roadLayers(p),
    {
      id: 'rail',
      type: 'line',
      source: SOURCE,
      'source-layer': 'transportation',
      minzoom: 9,
      filter: ['all', classIn('rail', 'transit'), NOT_TUNNEL],
      paint: {
        'line-color': p.rail,
        'line-width': width([
          [9, 0.6],
          [18, 3],
        ]),
        'line-dasharray': [3, 2],
      },
    },
    {
      id: 'ferry',
      type: 'line',
      source: SOURCE,
      'source-layer': 'transportation',
      minzoom: 8,
      filter: classIn('ferry'),
      paint: { 'line-color': p.ferry, 'line-width': 1.2, 'line-dasharray': [4, 3] },
    },
    {
      id: 'building',
      type: 'fill-extrusion',
      source: SOURCE,
      'source-layer': 'building',
      minzoom: 14,
      filter: ['!=', ['get', 'hide_3d'], true],
      paint: {
        'fill-extrusion-color': p.building,
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 0],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': 0.75,
      },
    },
    {
      id: 'boundary',
      type: 'line',
      source: SOURCE,
      'source-layer': 'boundary',
      filter: [
        'all',
        ['<=', ['coalesce', ['get', 'admin_level'], 99], 4],
        ['!=', ['get', 'maritime'], 1],
      ],
      paint: {
        'line-color': p.boundary,
        'line-width': ['match', ['get', 'admin_level'], 2, 1.5, 0.8],
        'line-dasharray': [3, 2],
      },
    },
    {
      id: 'label-water',
      type: 'symbol',
      source: SOURCE,
      'source-layer': 'water_name',
      layout: { 'text-field': NAME, 'text-font': FONT_ITALIC, 'text-size': 13 },
      paint: { 'text-color': p.waterLabel, 'text-halo-color': p.halo, 'text-halo-width': 1.2 },
    },
    {
      id: 'label-road',
      type: 'symbol',
      source: SOURCE,
      'source-layer': 'transportation_name',
      minzoom: 13,
      filter: ['has', 'name'],
      layout: {
        'symbol-placement': 'line',
        'text-field': NAME,
        'text-font': FONT_REGULAR,
        'text-size': ['interpolate', ['linear'], ['zoom'], 13, 11, 18, 14],
        'text-max-angle': 30,
      },
      paint: { 'text-color': p.text, 'text-halo-color': p.halo, 'text-halo-width': 1.5 },
    },
    {
      id: 'label-road-ref',
      type: 'symbol',
      source: SOURCE,
      'source-layer': 'transportation_name',
      minzoom: 8,
      maxzoom: 15,
      filter: ['all', ['has', 'ref'], classIn('motorway', 'trunk')],
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 400,
        'text-field': ['get', 'ref'],
        'text-font': FONT_BOLD,
        'text-size': 11,
        'text-rotation-alignment': 'viewport',
      },
      paint: { 'text-color': p.text, 'text-halo-color': p.halo, 'text-halo-width': 2 },
    },
    {
      id: 'label-poi',
      type: 'symbol',
      source: SOURCE,
      'source-layer': 'poi',
      minzoom: 15,
      filter: ['all', ['has', 'name'], ['<=', ['coalesce', ['get', 'rank'], 99], 20]],
      layout: {
        'text-field': NAME,
        'text-font': FONT_REGULAR,
        'text-size': 11,
        'text-max-width': 8,
        'symbol-sort-key': ['coalesce', ['get', 'rank'], 99],
      },
      paint: { 'text-color': p.textMuted, 'text-halo-color': p.halo, 'text-halo-width': 1.2 },
    },
    {
      id: 'label-housenumber',
      type: 'symbol',
      source: SOURCE,
      'source-layer': 'housenumber',
      minzoom: 17,
      layout: { 'text-field': ['get', 'housenumber'], 'text-font': FONT_REGULAR, 'text-size': 10 },
      paint: { 'text-color': p.textMuted, 'text-halo-color': p.halo, 'text-halo-width': 1 },
    },
    {
      id: 'label-place-minor',
      type: 'symbol',
      source: SOURCE,
      'source-layer': 'place',
      minzoom: 12,
      filter: classIn('suburb', 'quarter', 'neighbourhood', 'hamlet', 'isolated_dwelling'),
      layout: {
        'text-field': NAME,
        'text-font': FONT_REGULAR,
        'text-size': 12,
        'text-transform': 'uppercase',
        'text-letter-spacing': 0.05,
      },
      paint: { 'text-color': p.textMuted, 'text-halo-color': p.halo, 'text-halo-width': 1.5 },
    },
    {
      id: 'label-place-village',
      type: 'symbol',
      source: SOURCE,
      'source-layer': 'place',
      minzoom: 10,
      filter: classIn('village'),
      layout: { 'text-field': NAME, 'text-font': FONT_REGULAR, 'text-size': 12 },
      paint: { 'text-color': p.text, 'text-halo-color': p.halo, 'text-halo-width': 1.5 },
    },
    {
      id: 'label-place-town',
      type: 'symbol',
      source: SOURCE,
      'source-layer': 'place',
      minzoom: 7,
      filter: classIn('town'),
      layout: {
        'text-field': NAME,
        'text-font': FONT_REGULAR,
        'text-size': ['interpolate', ['linear'], ['zoom'], 7, 11, 14, 16],
      },
      paint: { 'text-color': p.text, 'text-halo-color': p.halo, 'text-halo-width': 1.5 },
    },
    {
      id: 'label-place-city',
      type: 'symbol',
      source: SOURCE,
      'source-layer': 'place',
      minzoom: 4,
      filter: classIn('city'),
      layout: {
        'text-field': NAME,
        'text-font': FONT_BOLD,
        'text-size': ['interpolate', ['linear'], ['zoom'], 4, 11, 12, 20],
        'symbol-sort-key': ['coalesce', ['get', 'rank'], 99],
      },
      paint: { 'text-color': p.text, 'text-halo-color': p.halo, 'text-halo-width': 2 },
    },
    {
      id: 'label-country',
      type: 'symbol',
      source: SOURCE,
      'source-layer': 'place',
      maxzoom: 7,
      filter: classIn('country'),
      layout: { 'text-field': NAME, 'text-font': FONT_BOLD, 'text-size': 14 },
      paint: { 'text-color': p.textMuted, 'text-halo-color': p.halo, 'text-halo-width': 2 },
    },
  ];

  return {
    version: 8,
    name: `Trajecto ${theme === 'light' ? 'claro' : 'escuro'}`,
    glyphs: options.glyphsUrl,
    sources: {
      [SOURCE]: { type: 'vector', url: options.tileJsonUrl },
    },
    layers,
  };
}
