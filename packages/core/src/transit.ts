// Tem de ser o primeiro import: desliga o `eval` do zod antes de criar esquemas (CSP).
import './csp';
import { z } from 'zod';
import type { BBox, LngLat } from './geo';
import { isValidLngLat, roundTo } from './geo';
import { decodePolyline } from './polyline';
import { isInsideRoutingArea } from './routing';

/**
 * Transportes públicos (Fase 6) pelo Transitous (MOTIS 2, API `/api/v6/plan`), através da função
 * própria `/api/transit`. Formato verificado na especificação do MOTIS v2.11.1, a versão que o
 * Transitous usa.
 */

/** Grupos de modos que a interface distingue (ícone e cor por omissão). */
export const TRANSIT_KINDS = [
  'walk',
  'bus',
  'coach',
  'tram',
  'subway',
  'rail',
  'ferry',
  'cable',
  'other',
] as const;
export type TransitKind = (typeof TRANSIT_KINDS)[number];

/** Modos do MOTIS → grupo. Modos desconhecidos (versões futuras) contam como "other". */
const MODE_KIND: Readonly<Record<string, TransitKind>> = {
  WALK: 'walk',
  BUS: 'bus',
  COACH: 'coach',
  TRAM: 'tram',
  SUBWAY: 'subway',
  METRO: 'subway',
  RAIL: 'rail',
  HIGHSPEED_RAIL: 'rail',
  LONG_DISTANCE: 'rail',
  NIGHT_RAIL: 'rail',
  REGIONAL_FAST_RAIL: 'rail',
  REGIONAL_RAIL: 'rail',
  SUBURBAN: 'rail',
  FERRY: 'ferry',
  FUNICULAR: 'cable',
  AERIAL_LIFT: 'cable',
  AREAL_LIFT: 'cable',
  CABLE_CAR: 'cable',
};

export function transitKind(mode: string): TransitKind {
  return MODE_KIND[mode] ?? 'other';
}

export interface TransitStop {
  readonly name: string;
  readonly lngLat: LngLat;
  /** Linha ou cais, quando o operador o publica. */
  readonly track?: string;
}

export interface TransitLeg {
  readonly kind: TransitKind;
  /** Modo original do MOTIS (por exemplo "SUBURBAN"). */
  readonly mode: string;
  readonly from: TransitStop;
  readonly to: TransitStop;
  /** Horas em milissegundos (UTC); `scheduled*` são as do horário, sem atrasos. */
  readonly start: number;
  readonly end: number;
  readonly scheduledStart: number;
  readonly scheduledEnd: number;
  /** Há dados em tempo real para este troço. */
  readonly realTime: boolean;
  readonly cancelled: boolean;
  readonly duration: number;
  /** Metros (só nos troços a pé). */
  readonly distance?: number;
  /** Nome curto da linha (por exemplo "736" ou "Linha Verde"). */
  readonly line?: string;
  readonly headsign?: string;
  readonly agency?: string;
  /** Cores da linha em "#rrggbb", quando o operador as publica. */
  readonly color?: string;
  readonly textColor?: string;
  /** Número de paragens intermédias. */
  readonly stops: number;
  readonly geometry: readonly LngLat[];
}

export interface TransitItinerary {
  readonly start: number;
  readonly end: number;
  readonly duration: number;
  readonly transfers: number;
  readonly legs: readonly TransitLeg[];
  /** Metros a pé no total. */
  readonly walkDistance: number;
  readonly bbox: BBox;
}

export interface TransitRequest {
  readonly from: LngLat;
  readonly to: LngLat;
  /** Hora em milissegundos; sem hora, parte agora. */
  readonly time?: number;
  /** A hora é de chegada (e não de partida). */
  readonly arriveBy?: boolean;
}

export type TransitErrorCode =
  'invalid_request' | 'no_route' | 'rate_limited' | 'unavailable' | 'network' | 'bad_response';

export class TransitError extends Error {
  readonly code: TransitErrorCode;
  constructor(code: TransitErrorCode, message: string) {
    super(message);
    this.name = 'TransitError';
    this.code = code;
  }
}

/** "lat,lon" com 5 casas decimais (~1 m), o formato `fromPlace`/`toPlace` do MOTIS. */
export function formatTransitPlace(point: LngLat): string {
  return `${String(roundTo(point.lat, 5))},${String(roundTo(point.lng, 5))}`;
}

/** Parâmetros do pedido à função `/api/transit` (que os valida outra vez). */
export function transitQuery(request: TransitRequest): URLSearchParams {
  for (const point of [request.from, request.to]) {
    if (!isValidLngLat(point) || !isInsideRoutingArea(point)) {
      throw new TransitError('invalid_request', 'Ponto fora da área suportada.');
    }
  }
  const params = new URLSearchParams({
    fromPlace: formatTransitPlace(request.from),
    toPlace: formatTransitPlace(request.to),
  });
  if (request.time !== undefined) {
    if (!Number.isFinite(request.time)) throw new TransitError('invalid_request', 'Hora inválida.');
    params.set('time', new Date(request.time).toISOString());
    if (request.arriveBy) params.set('arriveBy', 'true');
  }
  return params;
}

const MAX_TEXT = 200;
const text = z
  .string()
  .transform((v) => v.trim().slice(0, MAX_TEXT) || undefined)
  .optional()
  .catch(undefined);
const HEX_COLOR = /^#?[0-9a-fA-F]{6}$/u;
const color = z
  .string()
  .transform((v) => (HEX_COLOR.test(v) ? `#${v.replace('#', '').toLowerCase()}` : undefined))
  .optional()
  .catch(undefined);
const isoTime = z.string().transform((v, ctx) => {
  const ms = Date.parse(v);
  if (!Number.isFinite(ms)) {
    ctx.addIssue({ code: 'custom', message: 'hora inválida' });
    return z.NEVER;
  }
  return ms;
});

const placeSchema = z.object({
  name: z.string().max(500),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  track: text,
});

const legSchema = z.object({
  mode: z.string().max(40),
  from: placeSchema,
  to: placeSchema,
  duration: z.number().min(0),
  startTime: isoTime,
  endTime: isoTime,
  scheduledStartTime: isoTime,
  scheduledEndTime: isoTime,
  realTime: z.boolean(),
  cancelled: z.boolean().optional().catch(undefined),
  distance: z.number().min(0).optional().catch(undefined),
  headsign: text,
  routeShortName: text,
  displayName: text,
  agencyName: text,
  routeColor: color,
  routeTextColor: color,
  intermediateStops: z.array(z.unknown()).max(500).optional().catch(undefined),
  legGeometry: z.object({
    points: z.string().max(2_000_000),
    precision: z.number().int().min(5).max(7),
  }),
});

const itinerarySchema = z.object({
  duration: z.number().min(0),
  startTime: isoTime,
  endTime: isoTime,
  transfers: z.number().int().min(0).max(50),
  legs: z.array(legSchema).min(1).max(60),
});

const responseSchema = z.object({
  itineraries: z.array(z.unknown()).max(50),
});

const errorSchema = z.object({ error: z.string().max(500) });

function toStop(place: z.infer<typeof placeSchema>): TransitStop {
  return {
    name: place.name.trim().slice(0, MAX_TEXT),
    lngLat: { lng: place.lon, lat: place.lat },
    ...(place.track ? { track: place.track } : {}),
  };
}

function bboxOf(points: readonly LngLat[]): BBox {
  let [west, south, east, north] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of points) {
    west = Math.min(west, p.lng);
    south = Math.min(south, p.lat);
    east = Math.max(east, p.lng);
    north = Math.max(north, p.lat);
  }
  return [west, south, east, north];
}

function toLeg(leg: z.infer<typeof legSchema>): TransitLeg | null {
  let geometry: LngLat[];
  try {
    geometry = decodePolyline(leg.legGeometry.points, leg.legGeometry.precision);
  } catch {
    return null;
  }
  if (geometry.some((p) => !isValidLngLat(p))) return null;
  const from = toStop(leg.from);
  const to = toStop(leg.to);
  // Sem geometria (por exemplo, transbordos sem detalhe): linha reta entre as paragens.
  if (geometry.length < 2) geometry = [from.lngLat, to.lngLat];
  const kind = transitKind(leg.mode);
  const line = leg.routeShortName ?? leg.displayName;
  return {
    kind,
    mode: leg.mode,
    from,
    to,
    start: leg.startTime,
    end: leg.endTime,
    scheduledStart: leg.scheduledStartTime,
    scheduledEnd: leg.scheduledEndTime,
    realTime: leg.realTime,
    cancelled: leg.cancelled ?? false,
    duration: leg.duration,
    ...(leg.distance !== undefined ? { distance: leg.distance } : {}),
    ...(kind !== 'walk' && line ? { line } : {}),
    ...(kind !== 'walk' && leg.headsign ? { headsign: leg.headsign } : {}),
    ...(kind !== 'walk' && leg.agencyName ? { agency: leg.agencyName } : {}),
    ...(leg.routeColor ? { color: leg.routeColor } : {}),
    ...(leg.routeTextColor ? { textColor: leg.routeTextColor } : {}),
    stops: leg.intermediateStops?.length ?? 0,
    geometry,
  };
}

/** Lê a resposta do `/api/v6/plan`; ignora itinerários incoerentes. */
export function parseTransitResponse(body: unknown): TransitItinerary[] {
  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) {
    throw new TransitError('bad_response', 'Resposta dos transportes em formato inesperado.');
  }
  const itineraries: TransitItinerary[] = [];
  for (const raw of parsed.data.itineraries) {
    const it = itinerarySchema.safeParse(raw);
    if (!it.success) continue;
    const legs = it.data.legs.map(toLeg);
    if (legs.some((leg) => leg === null)) continue;
    const valid = legs as TransitLeg[];
    itineraries.push({
      start: it.data.startTime,
      end: it.data.endTime,
      duration: it.data.duration,
      transfers: it.data.transfers,
      legs: valid,
      walkDistance: valid
        .filter((leg) => leg.kind === 'walk')
        .reduce((sum, leg) => sum + (leg.distance ?? 0), 0),
      bbox: bboxOf(valid.flatMap((leg) => leg.geometry)),
    });
  }
  return itineraries;
}

export interface TransitPlanner {
  plan(request: TransitRequest, options?: { signal?: AbortSignal }): Promise<TransitItinerary[]>;
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export function createTransitPlanner(options: {
  readonly url: string;
  readonly fetch?: typeof fetch;
}): TransitPlanner {
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  return {
    async plan(request, planOptions = {}) {
      const query = transitQuery(request);
      let response: Response;
      try {
        response = await fetchImpl(`${options.url}?${query.toString()}`, {
          headers: { Accept: 'application/json' },
          ...(planOptions.signal ? { signal: planOptions.signal } : {}),
        });
      } catch (error) {
        if (isAbort(error)) throw error;
        throw new TransitError('network', 'Sem ligação ao serviço de transportes.');
      }
      if (response.status === 429) {
        await response.body?.cancel();
        throw new TransitError('rate_limited', 'Demasiados pedidos ao serviço de transportes.');
      }
      let body: unknown;
      try {
        body = await response.json();
      } catch (error) {
        if (isAbort(error)) throw error;
        body = undefined;
      }
      // 400/422: pedido recusado. Um 404 não significa "sem ligações" (essas vêm como lista
      // vazia): pode ser o serviço que mudou, por isso conta como indisponível.
      if (response.status === 400 || response.status === 422) {
        const message = errorSchema.safeParse(body);
        throw new TransitError(
          'invalid_request',
          message.success ? message.data.error : 'Pedido recusado pelo serviço de transportes.',
        );
      }
      if (!response.ok) {
        throw new TransitError(
          'unavailable',
          `Serviço de transportes indisponível (HTTP ${String(response.status)}).`,
        );
      }
      const itineraries = parseTransitResponse(body);
      if (itineraries.length === 0) {
        throw new TransitError('no_route', 'Não foram encontradas ligações.');
      }
      return itineraries;
    },
  };
}
