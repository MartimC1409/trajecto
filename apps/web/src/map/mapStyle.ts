import type {
  ExpressionSpecification,
  FilterSpecification,
  LayerSpecification,
  StyleSpecification,
} from '@maplibre/maplibre-gl-style-spec';
import {
  POI_CLASSES,
  SHIELD_TEXT,
  onewayImage,
  poiIconImage,
  poiTextColor,
  shieldImage,
} from './mapImages';

export type MapTheme = 'light' | 'dark';

export interface MapStyleOptions {
  readonly tileJsonUrl: string;
  readonly glyphsUrl: string;
  /** Texto antes do número das saídas das autoestradas (por omissão "Saída "). */
  readonly exitPrefix?: string;
  /** Tiles de altitude (Terrarium) para o relevo; sem isto, o mapa não tem relevo. */
  readonly reliefTilesUrl?: string | null;
}

/** Fonte e atribuição do relevo (Mapterhorn, com dados da DGT para Portugal continental). */
export const RELIEF_SOURCE = 'relief-dem';
export const RELIEF_ATTRIBUTION =
  '<a href="https://mapterhorn.com/attribution" target="_blank" rel="noopener noreferrer">© Mapterhorn</a>';

/**
 * Atribuições obrigatórias (ODbL do OpenStreetMap, CC-BY do esquema OpenMapTiles).
 * O crédito ao OpenFreeMap vem no próprio TileJSON do serviço e também está no painel "Sobre".
 */
export const MAP_ATTRIBUTION = [
  '<a href="https://www.openmaptiles.org/" target="_blank" rel="noopener noreferrer">© OpenMapTiles</a>',
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap</a>',
];

/** Camada das setas de sentido único (as rotas ficam por cima dela). */
export const ONEWAY_LAYER = 'road-oneway';

/** Camadas de locais que se podem tocar para ver os detalhes. */
export const POI_LAYERS = ['poi', 'poi-transport'] as const;

interface Palette {
  readonly background: string;
  readonly water: string;
  readonly waterLabel: string;
  readonly wood: string;
  readonly grass: string;
  readonly sand: string;
  readonly farmland: string;
  readonly wetland: string;
  readonly rock: string;
  readonly residential: string;
  readonly industrial: string;
  readonly institutional: string;
  readonly cemetery: string;
  readonly hospital: string;
  readonly military: string;
  readonly sport: string;
  readonly parkOutline: string;
  readonly pedestrian: string;
  readonly aerodrome: string;
  readonly building: string;
  readonly roadCasing: string;
  readonly bridgeCasing: string;
  readonly motorway: string;
  readonly trunk: string;
  readonly primary: string;
  readonly secondary: string;
  readonly minor: string;
  readonly construction: string;
  readonly path: string;
  readonly cycleway: string;
  readonly rail: string;
  readonly railService: string;
  readonly transit: string;
  readonly ferry: string;
  readonly boundary: string;
  readonly text: string;
  readonly textMuted: string;
  readonly natureText: string;
  readonly peakText: string;
  readonly hillShadow: string;
  readonly hillHighlight: string;
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
    farmland: '#eef0d6',
    wetland: '#d5e7dc',
    rock: '#e6e1d8',
    residential: '#ece8e0',
    industrial: '#e9e2ea',
    institutional: '#f0e4dc',
    cemetery: '#d6e2cc',
    hospital: '#f5dcdc',
    military: '#eedfd8',
    sport: '#d2ebcf',
    parkOutline: '#8fbf7a',
    pedestrian: '#f7f4ee',
    aerodrome: '#e8e5ee',
    building: '#ddd6cc',
    roadCasing: '#c9c1b5',
    bridgeCasing: '#a69d90',
    motorway: '#f4a65c',
    trunk: '#f7c06b',
    primary: '#fbd98b',
    secondary: '#fdf1b8',
    minor: '#ffffff',
    construction: '#d9c9a8',
    path: '#9a8f80',
    cycleway: '#1f8a70',
    rail: '#9b9b9b',
    railService: '#bdbdbd',
    transit: '#8e5ea2',
    ferry: '#5b8fc7',
    boundary: '#9c7fa6',
    text: '#2b2b2b',
    textMuted: '#555555',
    natureText: '#2f6e2f',
    peakText: '#6b4f2a',
    hillShadow: '#473b24',
    hillHighlight: '#ffffff',
    halo: '#ffffff',
  },
  dark: {
    background: '#1b2026',
    water: '#0f2b40',
    waterLabel: '#8fb9de',
    wood: '#1f3022',
    grass: '#23332a',
    sand: '#3a3426',
    farmland: '#262b21',
    wetland: '#1d2e2b',
    rock: '#2d2c29',
    residential: '#22272e',
    industrial: '#29252d',
    institutional: '#2c2626',
    cemetery: '#243026',
    hospital: '#362426',
    military: '#30262a',
    sport: '#1f3527',
    parkOutline: '#3f6a45',
    pedestrian: '#262c33',
    aerodrome: '#262630',
    building: '#2f353d',
    roadCasing: '#111418',
    bridgeCasing: '#08090b',
    motorway: '#b8733a',
    trunk: '#a77e3e',
    primary: '#8a7447',
    secondary: '#5f5a49',
    minor: '#3b424b',
    construction: '#5a5242',
    path: '#7f8994',
    cycleway: '#4fc3a1',
    rail: '#6b7280',
    railService: '#4b5260',
    transit: '#b48ad0',
    ferry: '#4f7fae',
    boundary: '#8f7a98',
    text: '#eceff3',
    textMuted: '#c3c9d1',
    natureText: '#7fcf7f',
    peakText: '#d7bf98',
    hillShadow: '#000000',
    hillHighlight: '#3b424b',
    halo: '#1b2026',
  },
};

const SOURCE = 'openmaptiles';
const FONT_REGULAR = ['Noto Sans Regular'];
const FONT_BOLD = ['Noto Sans Bold'];
const FONT_ITALIC = ['Noto Sans Italic'];

/** Nome em português quando existir, senão o nome local. */
const NAME: ExpressionSpecification = ['coalesce', ['get', 'name:pt'], ['get', 'name']];

/**
 * Tipo de geometria. As camadas de linha só desenham linhas: sem isto, também contornavam
 * polígonos da mesma camada (pistas de aeroporto, praças pedonais).
 */
const LINE: ExpressionSpecification = ['==', ['geometry-type'], 'LineString'];
const POINT: ExpressionSpecification = ['==', ['geometry-type'], 'Point'];
const POLYGON: ExpressionSpecification = ['==', ['geometry-type'], 'Polygon'];

/** Largura de linha que cresce exponencialmente com o zoom. */
function width(stops: readonly (readonly [number, number])[]): ExpressionSpecification {
  return ['interpolate', ['exponential', 1.4], ['zoom'], ...stops.flat()];
}

function classIn(...classes: string[]): ExpressionSpecification {
  return ['in', ['get', 'class'], ['literal', classes]];
}

function subclassIn(...subclasses: string[]): ExpressionSpecification {
  return ['in', ['get', 'subclass'], ['literal', subclasses]];
}

/** Classificação (rank) até à qual se mostram locais, conforme o zoom (menos sobreposição). */
function rankUpTo(stops: ExpressionSpecification): ExpressionSpecification {
  return ['<=', ['coalesce', ['get', 'rank'], 99], stops];
}

const NOT_TUNNEL: ExpressionSpecification = ['!=', ['get', 'brunnel'], 'tunnel'];
const IS_TUNNEL: ExpressionSpecification = ['==', ['get', 'brunnel'], 'tunnel'];
const IS_BRIDGE: ExpressionSpecification = ['==', ['get', 'brunnel'], 'bridge'];

const ROAD_NETWORK = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service'];

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
    filter: ['all', LINE, classIn(...road.classes), NOT_TUNNEL],
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
    filter: ['all', LINE, classIn(...road.classes), NOT_TUNNEL],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': road.color(p), 'line-width': width(road.width) },
  }));
  return [...casings, ...fills];
}

/** Pontes por cima das estradas e linhas que passam por baixo. */
function bridgeLayers(p: Palette): LayerSpecification[] {
  const filter: FilterSpecification = ['all', LINE, IS_BRIDGE, classIn(...ROAD_NETWORK)];
  return [
    {
      id: 'road-bridge-casing',
      type: 'line',
      source: SOURCE,
      'source-layer': 'transportation',
      minzoom: 12,
      filter,
      layout: { 'line-join': 'round' },
      paint: {
        'line-color': p.bridgeCasing,
        'line-width': width([
          [12, 3],
          [14, 8],
          [18, 30],
        ]),
      },
    },
    {
      id: 'road-bridge',
      type: 'line',
      source: SOURCE,
      'source-layer': 'transportation',
      minzoom: 12,
      filter,
      layout: { 'line-join': 'round' },
      paint: {
        'line-color': [
          'match',
          ['get', 'class'],
          'motorway',
          p.motorway,
          'trunk',
          p.trunk,
          'primary',
          p.primary,
          ['secondary', 'tertiary'],
          p.secondary,
          p.minor,
        ],
        'line-width': [
          'interpolate',
          ['exponential', 1.4],
          ['zoom'],
          12,
          ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 2.2, 1.2],
          14,
          [
            'match',
            ['get', 'class'],
            ['motorway', 'trunk', 'primary'],
            6,
            ['secondary', 'tertiary'],
            4,
            2,
          ],
          18,
          [
            'match',
            ['get', 'class'],
            ['motorway', 'trunk', 'primary'],
            24,
            ['secondary', 'tertiary'],
            18,
            14,
          ],
        ],
      },
    },
  ];
}

function areaLayers(p: Palette): LayerSpecification[] {
  return [
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
      filter: classIn('grass'),
      paint: { 'fill-color': p.grass, 'fill-opacity': 0.8 },
    },
    {
      // Campos, vinhas e pomares.
      id: 'landcover-farmland',
      type: 'fill',
      source: SOURCE,
      'source-layer': 'landcover',
      minzoom: 9,
      filter: classIn('farmland'),
      paint: { 'fill-color': p.farmland },
    },
    {
      id: 'landcover-wetland',
      type: 'fill',
      source: SOURCE,
      'source-layer': 'landcover',
      minzoom: 10,
      filter: classIn('wetland'),
      paint: { 'fill-color': p.wetland },
    },
    {
      id: 'landcover-rock',
      type: 'fill',
      source: SOURCE,
      'source-layer': 'landcover',
      minzoom: 9,
      filter: classIn('rock', 'ice'),
      paint: { 'fill-color': p.rock },
    },
    {
      // Praias e dunas.
      id: 'landcover-sand',
      type: 'fill',
      source: SOURCE,
      'source-layer': 'landcover',
      filter: classIn('sand'),
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
      filter: classIn('school', 'university', 'college', 'kindergarten', 'library'),
      paint: { 'fill-color': p.institutional },
    },
    {
      // Cemitérios, hospitais, campos de jogos, pedreiras… (só com mais zoom).
      id: 'landuse-detail',
      type: 'fill',
      source: SOURCE,
      'source-layer': 'landuse',
      minzoom: 12,
      filter: classIn(
        'cemetery',
        'hospital',
        'military',
        'pitch',
        'playground',
        'track',
        'stadium',
        'theme_park',
        'zoo',
        'quarry',
        'bus_station',
        'dam',
      ),
      paint: {
        'fill-color': [
          'match',
          ['get', 'class'],
          'cemetery',
          p.cemetery,
          'hospital',
          p.hospital,
          'military',
          p.military,
          ['pitch', 'playground', 'track', 'stadium', 'theme_park', 'zoo'],
          p.sport,
          'quarry',
          p.rock,
          'bus_station',
          p.industrial,
          p.roadCasing,
        ],
        'fill-outline-color': p.roadCasing,
        'fill-opacity': 0.9,
      },
    },
    {
      id: 'park',
      type: 'fill',
      source: SOURCE,
      'source-layer': 'park',
      paint: { 'fill-color': p.grass, 'fill-opacity': 0.7 },
    },
    {
      id: 'park-outline',
      type: 'line',
      source: SOURCE,
      'source-layer': 'park',
      minzoom: 9,
      filter: POLYGON,
      paint: {
        'line-color': p.parkOutline,
        'line-width': width([
          [9, 0.5],
          [16, 1.5],
        ]),
        'line-dasharray': [3, 2],
        'line-opacity': 0.8,
      },
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
      filter: ['all', LINE, NOT_TUNNEL],
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
      id: 'aeroway-area',
      type: 'fill',
      source: SOURCE,
      'source-layer': 'aeroway',
      minzoom: 10,
      filter: [
        'all',
        POLYGON,
        classIn('aerodrome', 'apron', 'runway', 'taxiway', 'helipad', 'heliport'),
      ],
      paint: {
        'fill-color': [
          'match',
          ['get', 'class'],
          ['runway', 'taxiway', 'helipad'],
          p.minor,
          p.aerodrome,
        ],
      },
    },
    {
      id: 'aeroway-runway',
      type: 'line',
      source: SOURCE,
      'source-layer': 'aeroway',
      minzoom: 11,
      filter: ['all', LINE, classIn('runway', 'taxiway')],
      paint: {
        'line-color': p.minor,
        'line-width': width([
          [11, 2],
          [17, 40],
        ]),
      },
    },
    {
      // Praças pedonais e cais.
      id: 'transportation-area',
      type: 'fill',
      source: SOURCE,
      'source-layer': 'transportation',
      minzoom: 13,
      filter: ['all', POLYGON, classIn('path', 'pier')],
      paint: { 'fill-color': p.pedestrian, 'fill-outline-color': p.roadCasing },
    },
  ];
}

function networkLayers(p: Palette): LayerSpecification[] {
  return [
    {
      id: 'road-tunnel',
      type: 'line',
      source: SOURCE,
      'source-layer': 'transportation',
      minzoom: 12,
      filter: [
        'all',
        LINE,
        IS_TUNNEL,
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
      // Metro e comboio em túnel (por exemplo, o Metro de Lisboa e do Porto).
      id: 'rail-tunnel',
      type: 'line',
      source: SOURCE,
      'source-layer': 'transportation',
      minzoom: 13,
      filter: ['all', LINE, classIn('rail', 'transit'), IS_TUNNEL],
      paint: {
        'line-color': ['match', ['get', 'class'], 'transit', p.transit, p.rail],
        'line-width': width([
          [13, 1],
          [18, 3],
        ]),
        'line-dasharray': [1, 1],
        'line-opacity': 0.5,
      },
    },
    {
      id: 'path',
      type: 'line',
      source: SOURCE,
      'source-layer': 'transportation',
      minzoom: 14,
      filter: [
        'all',
        LINE,
        classIn('path'),
        NOT_TUNNEL,
        ['!', subclassIn('cycleway')],
        ['!=', ['get', 'bicycle'], 'designated'],
      ],
      paint: {
        'line-color': p.path,
        'line-width': width([
          [14, 0.6],
          [18, 2.5],
        ]),
        'line-dasharray': [2, 1.5],
      },
    },
    {
      // Ciclovias, numa cor diferente da rota (azul) para não se confundirem.
      id: 'path-cycleway',
      type: 'line',
      source: SOURCE,
      'source-layer': 'transportation',
      minzoom: 13,
      filter: [
        'all',
        LINE,
        classIn('path'),
        NOT_TUNNEL,
        ['any', subclassIn('cycleway'), ['==', ['get', 'bicycle'], 'designated']],
      ],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': p.cycleway,
        'line-width': width([
          [13, 1],
          [18, 3.5],
        ]),
      },
    },
    {
      id: 'road-construction',
      type: 'line',
      source: SOURCE,
      'source-layer': 'transportation',
      minzoom: 13,
      filter: [
        'all',
        LINE,
        classIn(
          'motorway_construction',
          'trunk_construction',
          'primary_construction',
          'secondary_construction',
          'tertiary_construction',
          'minor_construction',
        ),
      ],
      paint: {
        'line-color': p.construction,
        'line-width': width([
          [13, 1],
          [18, 8],
        ]),
        'line-dasharray': [2, 2],
      },
    },
    ...roadLayers(p),
    {
      id: 'rail',
      type: 'line',
      source: SOURCE,
      'source-layer': 'transportation',
      minzoom: 9,
      filter: ['all', LINE, classIn('rail'), NOT_TUNNEL, ['!', ['has', 'service']]],
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
      // Linhas de manobra e ramais, mais discretos.
      id: 'rail-service',
      type: 'line',
      source: SOURCE,
      'source-layer': 'transportation',
      minzoom: 14,
      filter: ['all', LINE, classIn('rail'), ['has', 'service'], NOT_TUNNEL],
      paint: {
        'line-color': p.railService,
        'line-width': width([
          [14, 0.5],
          [18, 1.5],
        ]),
      },
    },
    {
      // Metro de superfície, elétricos e metro ligeiro.
      id: 'rail-transit',
      type: 'line',
      source: SOURCE,
      'source-layer': 'transportation',
      minzoom: 11,
      filter: ['all', LINE, classIn('transit'), NOT_TUNNEL],
      paint: {
        'line-color': p.transit,
        'line-width': width([
          [11, 0.8],
          [18, 3],
        ]),
      },
    },
    {
      // Teleféricos e elevadores.
      id: 'aerialway',
      type: 'line',
      source: SOURCE,
      'source-layer': 'transportation',
      minzoom: 12,
      filter: ['all', LINE, classIn('aerialway')],
      paint: { 'line-color': p.textMuted, 'line-width': 1.2, 'line-dasharray': [6, 2] },
    },
    {
      id: 'ferry',
      type: 'line',
      source: SOURCE,
      'source-layer': 'transportation',
      minzoom: 8,
      filter: ['all', LINE, classIn('ferry')],
      paint: { 'line-color': p.ferry, 'line-width': 1.2, 'line-dasharray': [4, 3] },
    },
    ...bridgeLayers(p),
  ];
}

function buildingLayers(p: Palette): LayerSpecification[] {
  return [
    {
      // Até ao zoom 15 os edifícios são planos (menos trabalho para a placa gráfica do telemóvel).
      id: 'building-flat',
      type: 'fill',
      source: SOURCE,
      'source-layer': 'building',
      minzoom: 13,
      maxzoom: 15,
      paint: { 'fill-color': p.building, 'fill-outline-color': p.roadCasing },
    },
    {
      id: 'building',
      type: 'fill-extrusion',
      source: SOURCE,
      'source-layer': 'building',
      minzoom: 15,
      filter: ['!=', ['get', 'hide_3d'], true],
      paint: {
        'fill-extrusion-color': p.building,
        // Os edifícios "crescem" entre o zoom 15 e 15,5.
        'fill-extrusion-height': [
          'interpolate',
          ['linear'],
          ['zoom'],
          15,
          0,
          15.5,
          ['coalesce', ['get', 'render_height'], 0],
        ],
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
  ];
}

function textPaint(p: Palette, color: string | ExpressionSpecification, halo = 1.5) {
  return { 'text-color': color, 'text-halo-color': p.halo, 'text-halo-width': halo };
}

function labelLayers(p: Palette, theme: MapTheme, options: MapStyleOptions): LayerSpecification[] {
  const exitPrefix = options.exitPrefix ?? 'Saída ';
  // Estações e cais: aparecem mais cedo do que os outros locais.
  const station: ExpressionSpecification = [
    'any',
    ['all', classIn('railway'), subclassIn('station', 'halt', 'subway')],
    subclassIn('ferry_terminal'),
  ];
  return [
    {
      // Setas de sentido único. Rodam com a via (a imagem aponta para cima).
      id: ONEWAY_LAYER,
      type: 'symbol',
      source: SOURCE,
      'source-layer': 'transportation',
      minzoom: 15,
      filter: [
        'all',
        LINE,
        ['in', ['get', 'oneway'], ['literal', [1, -1]]],
        classIn(...ROAD_NETWORK),
      ],
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 120,
        'icon-image': onewayImage(theme),
        'icon-rotate': ['match', ['get', 'oneway'], -1, -90, 90],
        'icon-rotation-alignment': 'map',
        'icon-size': ['interpolate', ['linear'], ['zoom'], 15, 0.6, 18, 1],
        'icon-padding': 2,
      },
      paint: { 'icon-opacity': 0.75 },
    },
    {
      // Nomes dos rios (Tejo, Douro…) ao longo do rio.
      id: 'label-waterway',
      type: 'symbol',
      source: SOURCE,
      'source-layer': 'waterway',
      minzoom: 11,
      filter: ['all', LINE, ['has', 'name'], classIn('river', 'canal')],
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 400,
        'text-field': NAME,
        'text-font': FONT_ITALIC,
        'text-size': ['interpolate', ['linear'], ['zoom'], 11, 11, 16, 14],
        'text-letter-spacing': 0.1,
        'text-max-angle': 30,
      },
      paint: textPaint(p, p.waterLabel, 1.2),
    },
    {
      id: 'label-water-point',
      type: 'symbol',
      source: SOURCE,
      'source-layer': 'water_name',
      filter: POINT,
      layout: {
        'text-field': NAME,
        'text-font': FONT_ITALIC,
        'text-size': ['interpolate', ['linear'], ['zoom'], 4, 11, 12, 14],
        'text-max-width': 6,
      },
      paint: textPaint(p, p.waterLabel, 1.2),
    },
    {
      // Lagos e baías chegam como linhas ao centro: o nome segue a linha (e não fica na margem).
      id: 'label-water-line',
      type: 'symbol',
      source: SOURCE,
      'source-layer': 'water_name',
      filter: LINE,
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 350,
        'text-field': NAME,
        'text-font': FONT_ITALIC,
        'text-size': 13,
        'text-letter-spacing': 0.1,
      },
      paint: textPaint(p, p.waterLabel, 1.2),
    },
    {
      id: 'label-road',
      type: 'symbol',
      source: SOURCE,
      'source-layer': 'transportation_name',
      minzoom: 13,
      filter: ['all', LINE, ['has', 'name']],
      layout: {
        'symbol-placement': 'line',
        'text-field': NAME,
        'text-font': FONT_REGULAR,
        'text-size': ['interpolate', ['linear'], ['zoom'], 13, 11, 18, 14],
        'text-max-angle': 30,
      },
      paint: textPaint(p, p.text),
    },
    {
      // Número da estrada (A1, IP3, N125…) num escudo: autoestradas a azul.
      id: 'road-shield',
      type: 'symbol',
      source: SOURCE,
      'source-layer': 'transportation_name',
      minzoom: 8,
      filter: [
        'all',
        LINE,
        ['has', 'ref'],
        ['<=', ['coalesce', ['get', 'ref_length'], 99], 6],
        classIn('motorway', 'trunk', 'primary'),
      ],
      layout: {
        'symbol-placement': ['step', ['zoom'], 'point', 11, 'line'],
        'symbol-spacing': 300,
        'symbol-sort-key': ['match', ['get', 'class'], 'motorway', 0, 'trunk', 1, 2],
        'icon-image': [
          'match',
          ['get', 'class'],
          'motorway',
          shieldImage(theme, 'motorway'),
          shieldImage(theme, 'road'),
        ],
        'icon-text-fit': 'both',
        'icon-text-fit-padding': [2, 4, 2, 4],
        'icon-rotation-alignment': 'viewport',
        'text-field': ['get', 'ref'],
        'text-font': FONT_BOLD,
        'text-size': 10,
        'text-rotation-alignment': 'viewport',
      },
      paint: {
        'text-color': [
          'match',
          ['get', 'class'],
          'motorway',
          SHIELD_TEXT[theme].motorway,
          SHIELD_TEXT[theme].road,
        ],
      },
    },
    {
      // Saídas das autoestradas (o número vem do OpenStreetMap).
      id: 'label-exit',
      type: 'symbol',
      source: SOURCE,
      'source-layer': 'transportation_name',
      minzoom: 13,
      filter: ['all', POINT, ['==', ['get', 'subclass'], 'junction'], ['has', 'ref']],
      layout: {
        'text-field': ['concat', exitPrefix, ['get', 'ref']],
        'text-font': FONT_BOLD,
        'text-size': 10,
        'text-anchor': 'left',
        'text-offset': [0.6, 0],
      },
      paint: textPaint(p, p.text),
    },
    {
      id: 'label-housenumber',
      type: 'symbol',
      source: SOURCE,
      'source-layer': 'housenumber',
      minzoom: 17,
      layout: { 'text-field': ['get', 'housenumber'], 'text-font': FONT_REGULAR, 'text-size': 10 },
      paint: textPaint(p, p.textMuted, 1),
    },
    {
      id: 'label-park',
      type: 'symbol',
      source: SOURCE,
      'source-layer': 'park',
      minzoom: 9,
      filter: ['all', POINT, ['has', 'name'], rankUpTo(['step', ['zoom'], 1, 13, 3, 15, 99])],
      layout: {
        'text-field': NAME,
        'text-font': FONT_ITALIC,
        'text-size': ['interpolate', ['linear'], ['zoom'], 9, 10, 15, 13],
        'text-max-width': 8,
        'symbol-sort-key': ['coalesce', ['get', 'rank'], 99],
      },
      paint: textPaint(p, p.natureText, 1.2),
    },
    {
      // Serras e picos, com a altitude.
      id: 'label-peak',
      type: 'symbol',
      source: SOURCE,
      'source-layer': 'mountain_peak',
      minzoom: 10,
      filter: ['all', POINT, ['has', 'name'], classIn('peak', 'volcano'), rankUpTo(['literal', 3])],
      layout: {
        'text-field': [
          'case',
          ['has', 'ele'],
          ['concat', NAME, '\n', ['to-string', ['get', 'ele']], ' m'],
          NAME,
        ],
        'text-font': FONT_ITALIC,
        'text-size': 11,
        'text-max-width': 8,
        'symbol-sort-key': ['-', 0, ['coalesce', ['get', 'ele'], 0]],
      },
      paint: textPaint(p, p.peakText, 1.2),
    },
    {
      id: 'label-aerodrome',
      type: 'symbol',
      source: SOURCE,
      'source-layer': 'aerodrome_label',
      minzoom: 9,
      filter: ['any', ['has', 'iata'], classIn('international', 'public', 'regional')],
      layout: {
        'text-field': ['case', ['has', 'iata'], ['concat', NAME, ' (', ['get', 'iata'], ')'], NAME],
        'text-font': FONT_REGULAR,
        'text-size': 11,
        'text-max-width': 9,
      },
      paint: textPaint(p, p.textMuted),
    },
    {
      // Estações de comboio e metro e cais, já a partir do zoom 12.
      id: 'poi-transport',
      type: 'symbol',
      source: SOURCE,
      'source-layer': 'poi',
      minzoom: 12,
      maxzoom: 14,
      filter: ['all', POINT, ['has', 'name'], station],
      layout: {
        'icon-image': poiIconImage(theme),
        'icon-size': 0.85,
        'text-field': NAME,
        'text-font': FONT_REGULAR,
        'text-size': 11,
        'text-variable-anchor': ['right', 'left', 'top', 'bottom'],
        'text-radial-offset': 0.9,
        'text-max-width': 8,
        'text-optional': true,
        'symbol-sort-key': ['coalesce', ['get', 'rank'], 99],
      },
      paint: textPaint(p, poiTextColor(theme), 1.2),
    },
    {
      // Locais com ícone: mais locais à medida que se aproxima (por ordem de importância).
      id: 'poi',
      type: 'symbol',
      source: SOURCE,
      'source-layer': 'poi',
      minzoom: 14,
      filter: [
        'all',
        POINT,
        ['has', 'name'],
        ['any', station, rankUpTo(['step', ['zoom'], 1, 15, 3, 16, 8, 17, 99])],
      ],
      layout: {
        'icon-image': poiIconImage(theme),
        'icon-size': ['interpolate', ['linear'], ['zoom'], 14, 0.8, 17, 1],
        'text-field': NAME,
        'text-font': FONT_REGULAR,
        'text-size': 11,
        'text-variable-anchor': ['top', 'bottom', 'right', 'left'],
        'text-radial-offset': 0.95,
        'text-max-width': 8,
        'text-optional': true,
        // Hospitais, estações e combustível primeiro; depois a classificação do OpenStreetMap.
        'symbol-sort-key': [
          '+',
          [
            '*',
            100,
            [
              'case',
              ['==', ['get', 'class'], 'hospital'],
              0,
              classIn('railway', 'bus', 'ferry_terminal'),
              1,
              ['==', ['get', 'class'], 'fuel'],
              2,
              classIn('pharmacy', 'police', 'town_hall'),
              3,
              classIn(...POI_CLASSES),
              4,
              5,
            ],
          ],
          ['coalesce', ['get', 'rank'], 99],
        ],
      },
      paint: textPaint(p, poiTextColor(theme), 1.2),
    },
    {
      id: 'label-place-suburb',
      type: 'symbol',
      source: SOURCE,
      'source-layer': 'place',
      minzoom: 11,
      filter: classIn('suburb'),
      layout: {
        'text-field': NAME,
        'text-font': FONT_REGULAR,
        'text-size': 12,
        'text-transform': 'uppercase',
        'text-letter-spacing': 0.05,
        'symbol-sort-key': ['coalesce', ['get', 'rank'], 99],
      },
      paint: textPaint(p, p.textMuted),
    },
    {
      id: 'label-place-hamlet',
      type: 'symbol',
      source: SOURCE,
      'source-layer': 'place',
      minzoom: 13,
      filter: classIn('hamlet'),
      layout: { 'text-field': NAME, 'text-font': FONT_REGULAR, 'text-size': 11 },
      paint: textPaint(p, p.textMuted),
    },
    {
      id: 'label-place-neighbourhood',
      type: 'symbol',
      source: SOURCE,
      'source-layer': 'place',
      minzoom: 14,
      filter: classIn('quarter', 'neighbourhood', 'isolated_dwelling'),
      layout: {
        'text-field': NAME,
        'text-font': FONT_REGULAR,
        'text-size': 11,
        'text-transform': 'uppercase',
        'text-letter-spacing': 0.05,
      },
      paint: textPaint(p, p.textMuted),
    },
    {
      id: 'label-place-village',
      type: 'symbol',
      source: SOURCE,
      'source-layer': 'place',
      minzoom: 10,
      filter: classIn('village'),
      layout: { 'text-field': NAME, 'text-font': FONT_REGULAR, 'text-size': 12 },
      paint: textPaint(p, p.text),
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
      paint: textPaint(p, p.text),
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
        // A capital (Lisboa) um pouco maior.
        'text-size': [
          'interpolate',
          ['linear'],
          ['zoom'],
          4,
          ['case', ['==', ['get', 'capital'], 2], 13, 11],
          12,
          ['case', ['==', ['get', 'capital'], 2], 22, 20],
        ],
        'symbol-sort-key': ['coalesce', ['get', 'rank'], 99],
      },
      paint: textPaint(p, p.text, 2),
    },
    {
      // Ilhas (Madeira, Açores, Berlengas…).
      id: 'label-island',
      type: 'symbol',
      source: SOURCE,
      'source-layer': 'place',
      minzoom: 8,
      filter: classIn('island'),
      layout: {
        'text-field': NAME,
        'text-font': FONT_ITALIC,
        'text-size': ['interpolate', ['linear'], ['zoom'], 8, 11, 12, 14],
        'symbol-sort-key': ['coalesce', ['get', 'rank'], 99],
      },
      paint: textPaint(p, p.textMuted),
    },
    {
      id: 'label-country',
      type: 'symbol',
      source: SOURCE,
      'source-layer': 'place',
      maxzoom: 7,
      filter: classIn('country'),
      layout: { 'text-field': NAME, 'text-font': FONT_BOLD, 'text-size': 14 },
      paint: textPaint(p, p.textMuted, 2),
    },
  ];
}

/** Sombreado do relevo, por cima das áreas e por baixo da água e das estradas. */
function reliefLayer(p: Palette): LayerSpecification {
  return {
    id: 'hillshade',
    type: 'hillshade',
    source: RELIEF_SOURCE,
    paint: {
      'hillshade-illumination-anchor': 'map',
      'hillshade-exaggeration': ['interpolate', ['linear'], ['zoom'], 6, 0.45, 14, 0.3, 17, 0.15],
      'hillshade-shadow-color': p.hillShadow,
      'hillshade-highlight-color': p.hillHighlight,
      'hillshade-accent-color': p.hillShadow,
    },
  };
}

export function buildMapStyle(theme: MapTheme, options: MapStyleOptions): StyleSpecification {
  const p = PALETTES[theme];
  const areas = areaLayers(p);
  if (options.reliefTilesUrl) {
    const water = areas.findIndex((layer) => layer.id === 'water');
    areas.splice(water, 0, reliefLayer(p));
  }
  const layers: LayerSpecification[] = [
    { id: 'background', type: 'background', paint: { 'background-color': p.background } },
    ...areas,
    ...networkLayers(p),
    ...buildingLayers(p),
    ...labelLayers(p, theme, options),
  ];
  return {
    version: 8,
    name: `Trajecto ${theme === 'light' ? 'claro' : 'escuro'}`,
    glyphs: options.glyphsUrl,
    sources: {
      [SOURCE]: { type: 'vector', url: options.tileJsonUrl },
      // O Mapterhorn tem todo o mundo até ao zoom 12; acima disso o MapLibre amplia.
      ...(options.reliefTilesUrl
        ? {
            [RELIEF_SOURCE]: {
              type: 'raster-dem' as const,
              tiles: [options.reliefTilesUrl],
              encoding: 'terrarium' as const,
              tileSize: 512,
              maxzoom: 12,
              attribution: RELIEF_ATTRIBUTION,
            },
          }
        : {}),
    },
    layers,
  };
}
