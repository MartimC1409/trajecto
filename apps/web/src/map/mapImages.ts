import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec';
import type { Map as MapLibreMap, StyleImageMetadata } from 'maplibre-gl';
import { ICON_PATHS } from '../components/Icon';
import type { MapTheme } from './mapStyle';

/**
 * Ícones do mapa (locais e setas de sentido único), desenhados no próprio browser com Canvas 2D
 * a partir dos nossos desenhos 24×24. Não há ficheiro de sprite nem pedidos a outros servidores,
 * por isso a política de segurança de conteúdo (CSP) fica igual.
 */

/** Uma forma simples na grelha 24×24 (só usamos path, circle e rect). */
export type IconShape =
  | { readonly kind: 'path'; readonly d: string }
  | { readonly kind: 'circle'; readonly cx: number; readonly cy: number; readonly r: number }
  | {
      readonly kind: 'rect';
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      readonly rx: number;
    };

const ELEMENT = /<(path|circle|rect)\b([^>]*)\/>/gu;
const ATTRIBUTE = /([a-z-]+)="([^"]*)"/gu;

/** Lê um desenho (fragmento SVG nosso, constante). Função pura: testável sem browser. */
export function parseIconShapes(fragment: string): IconShape[] {
  const shapes: IconShape[] = [];
  for (const element of fragment.matchAll(ELEMENT)) {
    const tag = element[1];
    const attrs: Record<string, string> = {};
    for (const attribute of (element[2] ?? '').matchAll(ATTRIBUTE)) {
      const [, key, value] = attribute;
      if (key !== undefined && value !== undefined) attrs[key] = value;
    }
    const num = (key: string): number => Number(attrs[key] ?? 0);
    if (tag === 'path' && attrs.d) shapes.push({ kind: 'path', d: attrs.d });
    else if (tag === 'circle') {
      shapes.push({ kind: 'circle', cx: num('cx'), cy: num('cy'), r: num('r') });
    } else if (tag === 'rect') {
      shapes.push({
        kind: 'rect',
        x: num('x'),
        y: num('y'),
        width: num('width'),
        height: num('height'),
        rx: num('rx'),
      });
    }
  }
  return shapes;
}

/** Converte as formas num Path2D (só no browser). Cantos com arcTo: roundRect exige Safari 16. */
function shapesToPath(shapes: readonly IconShape[]): Path2D {
  const path = new Path2D();
  for (const shape of shapes) {
    if (shape.kind === 'path') {
      path.addPath(new Path2D(shape.d));
    } else if (shape.kind === 'circle') {
      path.moveTo(shape.cx + shape.r, shape.cy);
      path.arc(shape.cx, shape.cy, shape.r, 0, Math.PI * 2);
      path.closePath();
    } else {
      const { x, y, width: w, height: h } = shape;
      const r = Math.min(shape.rx, w / 2, h / 2);
      path.moveTo(x + r, y);
      path.arcTo(x + w, y, x + w, y + h, r);
      path.arcTo(x + w, y + h, x, y + h, r);
      path.arcTo(x, y + h, x, y, r);
      path.arcTo(x, y, x + w, y, r);
      path.closePath();
    }
  }
  return path;
}

/**
 * Desenhos dos locais, no mesmo estilo dos ícones da app (traço 2, pontas redondas).
 * Os que já existem na app são reutilizados.
 */
export const POI_GLYPHS = {
  fuel: '<path d="M5 20V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v15M3 20h13M5 10h9M14 9h2l3 3v6a1.5 1.5 0 0 1-3 0v-3h-2"/>',
  charging: '<path d="M13 2 5 13h6l-1 9 8-11h-6z"/>',
  parking: '<path d="M8 20V4h5a4.5 4.5 0 0 1 0 9H8"/>',
  hospital: '<path d="M7 4v16M17 4v16M7 12h10"/>',
  pharmacy: '<path d="M9.5 4h5v5.5H20v5h-5.5V20h-5v-5.5H4v-5h5.5z"/>',
  police: ICON_PATHS.police,
  fire: '<path d="M12 21a6 6 0 0 1-6-6c0-3 2-5 3-8 1 2 2 3 3 3 0-3 1-5 3-7 0 4 3 6 3 11a6 6 0 0 1-6 7z"/><path d="M12 21a2.5 2.5 0 0 1-2.5-2.5c0-1.5 1-2.5 2.5-4 1.5 1.5 2.5 2.5 2.5 4A2.5 2.5 0 0 1 12 21z"/>',
  restaurant: '<path d="M7 3v7a2 2 0 0 0 4 0V3M9 10v11M17 21V3c-2 1.5-3 4-3 7v3h3"/>',
  cafe: '<path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3v3M12 3v3"/>',
  bar: '<path d="M4 4h16l-8 9zM12 13v7M8 20h8"/>',
  cart: '<path d="M3 4h2.5l2.2 11h10.6L20.5 8H6.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>',
  shop: '<path d="M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2"/>',
  bed: '<path d="M3 19V5M3 15h18v4M21 15v-3a3 3 0 0 0-3-3h-7v6"/><circle cx="7" cy="11" r="2"/>',
  tent: '<path d="M2 20h20M12 4 3 20M12 4l9 16M12 13l-3 7M12 13l3 7"/>',
  bank: '<rect x="3" y="7" width="18" height="11" rx="2"/><circle cx="12" cy="12.5" r="2.5"/>',
  post: '<rect x="3" y="6" width="18" height="13" rx="1.5"/><path d="m3 7 9 7 9-7"/>',
  train:
    '<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 10h14M8 21l2-4M16 21l-2-4"/>',
  metro: '<path d="M5 19V5l7 9 7-9v14"/>',
  bus: '<rect x="4" y="3" width="16" height="14" rx="2"/><path d="M4 11h16M7 17v3M17 17v3"/>',
  ferry: ICON_PATHS.ferry,
  car: ICON_PATHS.car,
  bike: ICON_PATHS.bike,
  toll: '<circle cx="12" cy="12" r="8"/><path d="M15 9a3.5 3.5 0 1 0 0 6M8 11h5M8 13h5"/>',
  school: '<path d="M2 9l10-5 10 5-10 5zM6 11v5c3 2.5 9 2.5 12 0v-5M22 9v6"/>',
  library:
    '<rect x="4" y="4" width="4" height="16"/><rect x="10" y="4" width="4" height="16"/><path d="m16 5 3.5-1 2.5 15-3.5 1z"/>',
  townHall: '<path d="M3 20h18M5 20v-9h14v9M12 11V4l4 2-4 2M9 20v-5h6v5"/>',
  museum: '<path d="M3 9 12 4l9 5zM6 10v7M10 10v7M14 10v7M18 10v7M3 20h18"/>',
  worship: '<path d="M12 3v6M9.5 5.5h5M6 21v-8l6-4 6 4v8M10 21v-4h4v4"/>',
  castle: '<path d="M4 21V9h3V6h3v3h4V6h3v3h3v12zM10 21v-4a2 2 0 0 1 4 0v4"/>',
  park: '<path d="M12 21v-6M12 3 6 12h3l-3 4h12l-3-4h3z"/>',
  toilets:
    '<circle cx="6.5" cy="4.5" r="1.5"/><circle cx="17.5" cy="4.5" r="1.5"/><path d="M12 3v18M4.5 8h4v6h-1v7h-2v-7h-1zM17.5 8l3 8h-2v5h-2v-5h-2z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
  theatre:
    '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 6l2 4M12 6l2 4M17 6l2 4"/>',
  attraction: ICON_PATHS.star,
  pin: ICON_PATHS.pin,
} as const satisfies Record<string, string>;

export type PoiIcon = keyof typeof POI_GLYPHS;

/** Cor do círculo, por tipo de local (comida laranja, saúde vermelho, transportes azul…). */
type PoiColor = 'orange' | 'red' | 'navy' | 'blue' | 'purple' | 'teal' | 'brown' | 'green' | 'grey';

/** Cor de cada desenho. Farmácia com cruz verde, como em Portugal. */
const POI_COLOR: Record<PoiIcon, PoiColor> = {
  fuel: 'blue',
  charging: 'blue',
  parking: 'blue',
  hospital: 'red',
  pharmacy: 'green',
  police: 'navy',
  fire: 'red',
  restaurant: 'orange',
  cafe: 'orange',
  bar: 'orange',
  cart: 'purple',
  shop: 'purple',
  bed: 'teal',
  tent: 'teal',
  bank: 'grey',
  post: 'grey',
  train: 'blue',
  metro: 'blue',
  bus: 'blue',
  ferry: 'blue',
  car: 'blue',
  bike: 'blue',
  toll: 'blue',
  school: 'grey',
  library: 'grey',
  townHall: 'grey',
  museum: 'brown',
  worship: 'brown',
  castle: 'brown',
  park: 'green',
  toilets: 'grey',
  info: 'grey',
  theatre: 'brown',
  attraction: 'brown',
  pin: 'grey',
};

/** Cores dos círculos (desenho branco por cima; contraste ≥ 3:1 em ambos os temas). */
const COLOR_FILL: Record<MapTheme, Record<PoiColor, string>> = {
  light: {
    orange: '#c25e00',
    red: '#c62828',
    navy: '#1e4fa3',
    blue: '#1565c0',
    purple: '#7b3fb5',
    teal: '#00796b',
    brown: '#8d5524',
    green: '#2e7d32',
    grey: '#546270',
  },
  dark: {
    orange: '#b55a0a',
    red: '#b3302f',
    navy: '#2a5bb0',
    blue: '#2a6cc0',
    purple: '#7444a8',
    teal: '#0f7a6d',
    brown: '#8a5a2e',
    green: '#357a38',
    grey: '#5a6773',
  },
};

/** Cor do nome do local no mapa (legível com o contorno do tema). */
const COLOR_TEXT: Record<MapTheme, Record<PoiColor, string>> = {
  light: {
    orange: '#a14e00',
    red: '#b02020',
    navy: '#1e4fa3',
    blue: '#1558a8',
    purple: '#6d35a3',
    teal: '#00695c',
    brown: '#7a4a1f',
    green: '#25692a',
    grey: '#4a5663',
  },
  dark: {
    orange: '#f0a35e',
    red: '#ef8a8a',
    navy: '#9db8f2',
    blue: '#86b6ea',
    purple: '#c7a2e6',
    teal: '#6fd0c0',
    brown: '#dcc07a',
    green: '#86d486',
    grey: '#b4bdc8',
  },
};

const RING: Record<MapTheme, string> = { light: '#ffffff', dark: '#1b2026' };
const ONEWAY_COLOR: Record<MapTheme, string> = { light: '#7a7368', dark: '#9aa3ad' };

/** Tamanho (px CSS) dos ícones de locais e das setas. */
export const POI_ICON_SIZE = 20;
const ONEWAY_ICON_SIZE = 14;

/**
 * Classes da camada `poi` do OpenMapTiles → desenho. Só valores confirmados no esquema
 * (layers/poi/poi.yaml e mapping.yaml do OpenMapTiles).
 */
export const POI_CLASS_ICON = {
  fuel: 'fuel',
  parking: 'parking',
  hospital: 'hospital',
  pharmacy: 'pharmacy',
  police: 'police',
  fire_station: 'fire',
  restaurant: 'restaurant',
  fast_food: 'restaurant',
  cafe: 'cafe',
  bar: 'bar',
  beer: 'bar',
  grocery: 'cart',
  shop: 'shop',
  clothing_store: 'shop',
  lodging: 'bed',
  campsite: 'tent',
  bank: 'bank',
  atm: 'bank',
  post: 'post',
  railway: 'train',
  bus: 'bus',
  ferry_terminal: 'ferry',
  harbor: 'ferry',
  car: 'car',
  bicycle_rental: 'bike',
  toll_booth: 'toll',
  school: 'school',
  college: 'school',
  library: 'library',
  town_hall: 'townHall',
  museum: 'museum',
  place_of_worship: 'worship',
  attraction: 'attraction',
  castle: 'castle',
  park: 'park',
  toilets: 'toilets',
  information: 'info',
  cinema: 'theatre',
  theatre: 'theatre',
} as const satisfies Record<string, PoiIcon>;

export type PoiClass = keyof typeof POI_CLASS_ICON;

export const POI_CLASSES = Object.keys(POI_CLASS_ICON) as PoiClass[];

export const POI_IMAGE_PREFIX = 'trajecto-poi-';
export const ONEWAY_IMAGE_PREFIX = 'trajecto-oneway-';

/**
 * Expressão do nome do ícone a partir da classe (e da subclasse, para metro e carregadores),
 * já com o tema no nome da imagem.
 */
export function poiIconImage(theme: MapTheme): ExpressionSpecification {
  const groups = new Map<PoiIcon, string[]>();
  for (const [cls, icon] of Object.entries(POI_CLASS_ICON) as [PoiClass, PoiIcon][]) {
    groups.set(icon, [...(groups.get(icon) ?? []), cls]);
  }
  const [first, ...rest] = [...groups];
  const byClass: ExpressionSpecification = first
    ? [
        'match',
        ['get', 'class'],
        first[1],
        first[0],
        ...rest.flatMap(([icon, classes]) => [classes, icon]),
        'pin',
      ]
    : ['literal', 'pin'];
  return [
    'concat',
    `${POI_IMAGE_PREFIX}${theme}-`,
    [
      'case',
      ['==', ['get', 'subclass'], 'subway'],
      'metro',
      ['==', ['get', 'subclass'], 'charging_station'],
      'charging',
      byClass,
    ],
  ];
}

/** Expressão da cor do nome do local, pela mesma categoria do ícone. */
export function poiTextColor(theme: MapTheme): ExpressionSpecification {
  const byColor = new Map<PoiColor, string[]>();
  for (const [cls, icon] of Object.entries(POI_CLASS_ICON) as [PoiClass, PoiIcon][]) {
    const color = POI_COLOR[icon];
    byColor.set(color, [...(byColor.get(color) ?? []), cls]);
  }
  const [first, ...rest] = [...byColor];
  const fallback = COLOR_TEXT[theme].grey;
  if (!first) return ['literal', fallback];
  return [
    'match',
    ['get', 'class'],
    first[1],
    COLOR_TEXT[theme][first[0]],
    ...rest.flatMap(([color, classes]) => [classes, COLOR_TEXT[theme][color]]),
    fallback,
  ];
}

/** Escudo das estradas: autoestradas em azul (como nas placas), as outras em branco. */
export type ShieldKind = 'motorway' | 'road';
export const SHIELD_IMAGE_PREFIX = 'trajecto-shield-';

export function shieldImage(theme: MapTheme, kind: ShieldKind): string {
  return `${SHIELD_IMAGE_PREFIX}${theme}-${kind}`;
}

const SHIELD_COLORS: Record<MapTheme, Record<ShieldKind, { fill: string; border: string }>> = {
  light: {
    motorway: { fill: '#1f5fa8', border: '#ffffff' },
    road: { fill: '#ffffff', border: '#8a8173' },
  },
  dark: {
    motorway: { fill: '#2a63ab', border: '#0f1216' },
    road: { fill: '#2b313a', border: '#7f8994' },
  },
};

/** Cor do número da estrada dentro do escudo. */
export const SHIELD_TEXT: Record<MapTheme, Record<ShieldKind, string>> = {
  light: { motorway: '#ffffff', road: '#2b2b2b' },
  dark: { motorway: '#ffffff', road: '#eceff3' },
};

export function onewayImage(theme: MapTheme): string {
  return `${ONEWAY_IMAGE_PREFIX}${theme}`;
}

function isTheme(value: string): value is MapTheme {
  return value === 'light' || value === 'dark';
}

function isPoiIcon(value: string): value is PoiIcon {
  return Object.hasOwn(POI_GLYPHS, value);
}

const pathCache = new Map<string, Path2D>();
function glyphPath(fragment: string): Path2D {
  let path = pathCache.get(fragment);
  if (!path) {
    path = shapesToPath(parseIconShapes(fragment));
    pathCache.set(fragment, path);
  }
  return path;
}

function createContext(size: number): CanvasRenderingContext2D | null {
  if (typeof Path2D === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  try {
    return canvas.getContext('2d', { willReadFrequently: true });
  } catch {
    return null;
  }
}

/** Círculo de cor com o desenho branco por cima; devolve os píxeis (RGBA) para o MapLibre. */
function drawBadge(icon: PoiIcon, theme: MapTheme, pixelRatio: number): ImageData | null {
  const size = Math.ceil(POI_ICON_SIZE * pixelRatio);
  const ctx = createContext(size);
  if (!ctx) return null;
  ctx.scale(size / 24, size / 24);
  ctx.beginPath();
  ctx.arc(12, 12, 11, 0, Math.PI * 2);
  ctx.fillStyle = COLOR_FILL[theme][POI_COLOR[icon]];
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = RING[theme];
  ctx.stroke();
  // O desenho ocupa ~60 % do círculo.
  ctx.translate(12, 12);
  ctx.scale(0.6, 0.6);
  ctx.translate(-12, -12);
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#ffffff';
  ctx.stroke(glyphPath(POI_GLYPHS[icon]));
  return ctx.getImageData(0, 0, size, size);
}

/** Seta de sentido único (aponta para cima; o estilo roda-a para o sentido da via). */
function drawOnewayArrow(theme: MapTheme, pixelRatio: number): ImageData | null {
  const size = Math.ceil(ONEWAY_ICON_SIZE * pixelRatio);
  const ctx = createContext(size);
  if (!ctx) return null;
  ctx.scale(size / 24, size / 24);
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = ONEWAY_COLOR[theme];
  ctx.stroke(glyphPath(ICON_PATHS.arrow));
  return ctx.getImageData(0, 0, size, size);
}

/** Tamanho (px CSS) do escudo antes de esticar à volta do texto. */
const SHIELD_SIZE = 20;

/**
 * Retângulo de cantos redondos que estica à volta do número da estrada (icon-text-fit).
 * As zonas de esticar e o conteúdo são em píxeis da imagem.
 */
function drawShield(
  theme: MapTheme,
  kind: ShieldKind,
  pixelRatio: number,
): {
  image: ImageData;
  options: {
    stretchX: [number, number][];
    stretchY: [number, number][];
    content: [number, number, number, number];
  };
} | null {
  const size = Math.ceil(SHIELD_SIZE * pixelRatio);
  const ctx = createContext(size);
  if (!ctx) return null;
  const unit = size / SHIELD_SIZE;
  const { fill, border } = SHIELD_COLORS[theme][kind];
  ctx.scale(unit, unit);
  const path = new Path2D();
  const [x, y, w, h, r] = [1, 1, SHIELD_SIZE - 2, SHIELD_SIZE - 2, 4];
  path.moveTo(x + r, y);
  path.arcTo(x + w, y, x + w, y + h, r);
  path.arcTo(x + w, y + h, x, y + h, r);
  path.arcTo(x, y + h, x, y, r);
  path.arcTo(x, y, x + w, y, r);
  path.closePath();
  ctx.fillStyle = fill;
  ctx.fill(path);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = border;
  ctx.stroke(path);
  const a = Math.round(6 * unit);
  const b = Math.round(14 * unit);
  const c = Math.round(4 * unit);
  const d = Math.round(16 * unit);
  return {
    image: ctx.getImageData(0, 0, size, size),
    options: { stretchX: [[a, b]], stretchY: [[a, b]], content: [c, c, d, d] },
  };
}

/** O que um nome de imagem pedido pelo estilo representa (ou `null` se não for nosso). */
export function parseMapImageId(
  id: string,
):
  | { readonly kind: 'poi'; readonly theme: MapTheme; readonly icon: PoiIcon }
  | { readonly kind: 'oneway'; readonly theme: MapTheme }
  | { readonly kind: 'shield'; readonly theme: MapTheme; readonly shield: ShieldKind }
  | null {
  if (id.startsWith(SHIELD_IMAGE_PREFIX)) {
    const [theme = '', shield = ''] = id.slice(SHIELD_IMAGE_PREFIX.length).split('-');
    return isTheme(theme) && (shield === 'motorway' || shield === 'road')
      ? { kind: 'shield', theme, shield }
      : null;
  }
  if (id.startsWith(ONEWAY_IMAGE_PREFIX)) {
    const theme = id.slice(ONEWAY_IMAGE_PREFIX.length);
    return isTheme(theme) ? { kind: 'oneway', theme } : null;
  }
  if (id.startsWith(POI_IMAGE_PREFIX)) {
    const rest = id.slice(POI_IMAGE_PREFIX.length);
    const dash = rest.indexOf('-');
    if (dash < 0) return null;
    const theme = rest.slice(0, dash);
    const icon = rest.slice(dash + 1);
    return isTheme(theme) && isPoiIcon(icon) ? { kind: 'poi', theme, icon } : null;
  }
  return null;
}

export interface MapImage {
  readonly image: ImageData;
  readonly options: Partial<StyleImageMetadata>;
}

/** Desenha a imagem pedida pelo estilo; `null` se o id não for nosso ou não houver canvas. */
export function createMapImage(id: string, pixelRatio: number): MapImage | null {
  const parsed = parseMapImageId(id);
  if (!parsed) return null;
  if (parsed.kind === 'shield') {
    const shield = drawShield(parsed.theme, parsed.shield, pixelRatio);
    return shield ? { image: shield.image, options: { ...shield.options, pixelRatio } } : null;
  }
  const image =
    parsed.kind === 'oneway'
      ? drawOnewayArrow(parsed.theme, pixelRatio)
      : drawBadge(parsed.icon, parsed.theme, pixelRatio);
  return image ? { image, options: { pixelRatio } } : null;
}

/**
 * Instala uma vez, logo a seguir a `new Map(...)`. O MapLibre pede cada imagem quando a vai
 * usar e guarda o pedido nos estilos seguintes (mudança de tema).
 */
export function installMapImages(map: MapLibreMap): void {
  map.setMissingStyleImageResolver((id) => {
    if (map.hasImage(id)) return;
    const created = createMapImage(id, map.getPixelRatio());
    if (created) map.addImage(id, created.image, created.options);
  });
}
