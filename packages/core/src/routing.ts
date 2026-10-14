import type { BBox, LngLat } from './geo';

/** Meios de transporte suportados. */
export const TRAVEL_MODES = ['car', 'motorcycle', 'walk', 'bike'] as const;
export type TravelMode = (typeof TRAVEL_MODES)[number];

/** Línguas das instruções de navegação (etiquetas aceites pelo Valhalla). */
export const ROUTE_LANGUAGES = ['pt-PT', 'en-US'] as const;
export type RouteLanguage = (typeof ROUTE_LANGUAGES)[number];

/** Origem + até 8 paragens + destino. */
export const MAX_WAYPOINTS = 10;
export const MAX_ALTERNATIVES = 2;

/**
 * Área onde aceitamos pedidos de rota: Portugal continental, Açores, Madeira e Espanha.
 * Serve para não usar o servidor público para fins alheios ao projeto.
 */
export const ROUTING_BBOX: BBox = [-31.5, 32, 4.5, 44];

export interface RoutePreferences {
  readonly avoidTolls: boolean;
  readonly avoidHighways: boolean;
  readonly avoidFerries: boolean;
  /** Caminho mais curto em distância (ignora as outras preferências). */
  readonly shortest: boolean;
}

export const DEFAULT_ROUTE_PREFERENCES: RoutePreferences = {
  avoidTolls: false,
  avoidHighways: false,
  avoidFerries: false,
  shortest: false,
};

/** Data e hora locais, no formato "AAAA-MM-DDThh:mm". */
export type LocalDateTime = string;

export type RouteTime =
  | { readonly kind: 'now' }
  | { readonly kind: 'depart'; readonly value: LocalDateTime }
  | { readonly kind: 'arrive'; readonly value: LocalDateTime };

export interface RouteRequest {
  readonly mode: TravelMode;
  /** Origem, paragens intermédias e destino, por esta ordem. */
  readonly waypoints: readonly LngLat[];
  readonly preferences?: Partial<RoutePreferences>;
  readonly time?: RouteTime;
  /** Número de alternativas pedidas (0 a 2). Só possível com 2 pontos e partida "agora". */
  readonly alternatives?: number;
  readonly language: RouteLanguage;
  /** Direção atual (graus a partir do norte), para recalcular a rota sem inversões de marcha. */
  readonly heading?: number;
}

/** Faixa de rodagem; os campos são máscaras de bits (ver LANE_DIRECTION). */
export interface RouteLane {
  readonly directions: number;
  /** Direções em que esta faixa é a mais indicada. */
  readonly active: number;
  /** Direções em que esta faixa pode ser usada. */
  readonly valid: number;
}

export const LANE_DIRECTION = {
  through: 2,
  sharpLeft: 4,
  left: 8,
  slightLeft: 16,
  slightRight: 32,
  right: 64,
  sharpRight: 128,
  reverse: 256,
  mergeToLeft: 512,
  mergeToRight: 1024,
} as const;

/** Placa de saída numa autoestrada ou via rápida. */
export interface RouteSign {
  readonly exitNumber?: string;
  readonly branch: readonly string[];
  readonly toward: readonly string[];
}

/** Códigos de manobra do Valhalla usados pela interface. */
export const MANEUVER = {
  start: 1,
  startRight: 2,
  startLeft: 3,
  destination: 4,
  destinationRight: 5,
  destinationLeft: 6,
  becomes: 7,
  continue: 8,
  slightRight: 9,
  right: 10,
  sharpRight: 11,
  uturnRight: 12,
  uturnLeft: 13,
  sharpLeft: 14,
  left: 15,
  slightLeft: 16,
  rampStraight: 17,
  rampRight: 18,
  rampLeft: 19,
  exitRight: 20,
  exitLeft: 21,
  stayStraight: 22,
  stayRight: 23,
  stayLeft: 24,
  merge: 25,
  roundaboutEnter: 26,
  roundaboutExit: 27,
  ferryEnter: 28,
  ferryExit: 29,
  mergeRight: 37,
  mergeLeft: 38,
} as const;

export function isArrivalManeuver(type: number): boolean {
  return (
    type === MANEUVER.destination ||
    type === MANEUVER.destinationRight ||
    type === MANEUVER.destinationLeft
  );
}

export interface RouteManeuver {
  /** Código de manobra do Valhalla (ver MANEUVER). */
  readonly type: number;
  /** Instrução escrita, já na língua pedida. */
  readonly instruction: string;
  /** Aviso falado antecipado (por exemplo, "Vire à direita na Rua X."). */
  readonly verbalAlert?: string;
  /** Instrução falada imediatamente antes da manobra. */
  readonly verbalPre?: string;
  /** Instrução falada depois da manobra (por exemplo, "Continue durante 2 km."). */
  readonly verbalPost?: string;
  readonly streetNames: readonly string[];
  /** Distância desta manobra até à seguinte, em metros. */
  readonly distance: number;
  /** Duração estimada desta manobra, em segundos. */
  readonly duration: number;
  /** Índices na geometria completa da rota (não na da etapa). */
  readonly beginIndex: number;
  readonly endIndex: number;
  /** Etapa a que pertence (0 = da origem à primeira paragem). */
  readonly leg: number;
  readonly toll: boolean;
  readonly highway: boolean;
  readonly ferry: boolean;
  readonly roundaboutExit?: number;
  readonly lanes?: readonly RouteLane[];
  readonly sign?: RouteSign;
}

export interface RouteLeg {
  readonly distance: number;
  readonly duration: number;
  /** Índice, na geometria completa, do ponto de chegada desta etapa. */
  readonly endIndex: number;
}

export interface Route {
  readonly mode: TravelMode;
  readonly geometry: readonly LngLat[];
  /** Metros. */
  readonly distance: number;
  /** Segundos. */
  readonly duration: number;
  readonly bbox: BBox;
  readonly hasToll: boolean;
  readonly hasHighway: boolean;
  readonly hasFerry: boolean;
  readonly legs: readonly RouteLeg[];
  readonly maneuvers: readonly RouteManeuver[];
}

export interface RouteOptions {
  readonly signal?: AbortSignal;
}

/** Contrato comum a qualquer serviço de rotas (Valhalla público, Valhalla próprio…). */
export interface Router {
  /** Devolve a rota principal seguida das alternativas (pode não haver alternativas). */
  route(request: RouteRequest, options?: RouteOptions): Promise<Route[]>;
}

export type RouterErrorCode =
  | 'invalid_request'
  | 'no_route'
  | 'too_far'
  | 'rate_limited'
  | 'unavailable'
  | 'bad_response'
  | 'network';

export class RouterError extends Error {
  readonly code: RouterErrorCode;
  readonly status: number | undefined;

  constructor(code: RouterErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'RouterError';
    this.code = code;
    this.status = status;
  }
}

export function isInsideBBox(point: LngLat, bbox: BBox): boolean {
  return (
    point.lng >= bbox[0] && point.lng <= bbox[2] && point.lat >= bbox[1] && point.lat <= bbox[3]
  );
}

const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/u;

/** Valida "AAAA-MM-DDThh:mm" (incluindo dias que não existem, como 31 de abril). */
export function isValidLocalDateTime(value: string): boolean {
  const match = LOCAL_DATE_TIME.exec(value);
  if (!match) return false;
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || day < 1) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

/** Converte uma data do browser para "AAAA-MM-DDThh:mm" na hora local. */
export function toLocalDateTime(date: Date): LocalDateTime {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}
