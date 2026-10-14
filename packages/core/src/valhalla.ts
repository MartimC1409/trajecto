// Tem de ser o primeiro import: desliga o `eval` do zod antes de criar esquemas (CSP).
import './csp';
import { z } from 'zod';
import type { BBox, LngLat } from './geo';
import { isValidLngLat, roundTo } from './geo';
import { decodePolyline } from './polyline';
import type {
  Route,
  RouteLane,
  RouteLeg,
  RouteManeuver,
  RouteOptions,
  RoutePreferences,
  RouteRequest,
  Router,
  RouteSign,
  TravelMode,
} from './routing';
import {
  DEFAULT_ROUTE_PREFERENCES,
  isInsideBBox,
  isValidLocalDateTime,
  MAX_ALTERNATIVES,
  MAX_WAYPOINTS,
  ROUTE_LANGUAGES,
  RouterError,
  ROUTING_BBOX,
  TRAVEL_MODES,
} from './routing';

export const VALHALLA_COSTING = {
  car: 'auto',
  motorcycle: 'motorcycle',
  walk: 'pedestrian',
  bike: 'bicycle',
} as const satisfies Record<TravelMode, string>;
export type ValhallaCosting = (typeof VALHALLA_COSTING)[TravelMode];

/** Proteções contra respostas anormalmente grandes. */
export const MAX_MANEUVERS_PER_LEG = 3000;
export const MAX_ROUTE_POINTS = 200_000;
const MAX_SHAPE_CHARS = 4_000_000;
const MAX_TEXT = 500;

export interface ValhallaLocation {
  readonly lat: number;
  readonly lon: number;
  readonly type: 'break';
  readonly heading?: number;
  readonly heading_tolerance?: number;
}

export interface ValhallaRouteRequest {
  readonly locations: readonly ValhallaLocation[];
  readonly costing: ValhallaCosting;
  readonly costing_options: Partial<Record<ValhallaCosting, Record<string, number | boolean>>>;
  readonly units: 'kilometers';
  readonly language: RouteRequest['language'];
  readonly directions_type: 'instructions';
  readonly turn_lanes: true;
  readonly alternates?: number;
  readonly date_time?: { readonly type: 1 | 2; readonly value: string };
}

function invalid(message: string): RouterError {
  return new RouterError('invalid_request', message);
}

function costingOptions(mode: TravelMode, preferences: RoutePreferences) {
  const options: Record<string, number | boolean> = {};
  // Valores de 0 a 1: 0 tenta evitar, mas não garante (às vezes não há outro caminho).
  if (preferences.avoidFerries) options.use_ferry = 0;
  if (mode === 'car' || mode === 'motorcycle') {
    if (preferences.avoidTolls) options.use_tolls = 0;
    if (preferences.avoidHighways) options.use_highways = 0;
  }
  if (preferences.shortest) options.shortest = true;
  return options;
}

/** Converte um pedido do Trajecto no formato JSON do serviço /route do Valhalla. */
export function buildValhallaRequest(request: RouteRequest): ValhallaRouteRequest {
  if (!TRAVEL_MODES.includes(request.mode)) throw invalid('Meio de transporte desconhecido.');
  if (!ROUTE_LANGUAGES.includes(request.language)) throw invalid('Língua não suportada.');
  const { waypoints } = request;
  if (waypoints.length < 2) throw invalid('São precisos pelo menos uma origem e um destino.');
  if (waypoints.length > MAX_WAYPOINTS) throw invalid('Demasiadas paragens.');
  for (const point of waypoints) {
    if (!isValidLngLat(point)) throw invalid('Coordenadas inválidas.');
    if (!isInsideBBox(point, ROUTING_BBOX)) throw invalid('Ponto fora da área suportada.');
  }

  const heading =
    request.heading !== undefined && Number.isFinite(request.heading)
      ? Math.round(((request.heading % 360) + 360) % 360) % 360
      : undefined;
  const locations: ValhallaLocation[] = waypoints.map((point, index) => ({
    lat: roundTo(point.lat, 6),
    lon: roundTo(point.lng, 6),
    type: 'break',
    ...(index === 0 && heading !== undefined ? { heading, heading_tolerance: 45 } : {}),
  }));

  const preferences = { ...DEFAULT_ROUTE_PREFERENCES, ...request.preferences };
  const costing = VALHALLA_COSTING[request.mode];
  const options = costingOptions(request.mode, preferences);

  let dateTime: ValhallaRouteRequest['date_time'];
  const time = request.time;
  if (time && time.kind !== 'now') {
    if (!isValidLocalDateTime(time.value)) throw invalid('Data e hora inválidas.');
    dateTime = { type: time.kind === 'depart' ? 1 : 2, value: time.value };
  }

  // O Valhalla não calcula alternativas com paragens nem com hora marcada.
  const requested = Math.trunc(request.alternatives ?? 0);
  const alternates =
    waypoints.length === 2 && !dateTime && Number.isFinite(requested)
      ? Math.min(MAX_ALTERNATIVES, Math.max(0, requested))
      : 0;

  return {
    locations,
    costing,
    costing_options: Object.keys(options).length > 0 ? { [costing]: options } : {},
    units: 'kilometers',
    language: request.language,
    directions_type: 'instructions',
    turn_lanes: true,
    ...(alternates > 0 ? { alternates } : {}),
    ...(dateTime ? { date_time: dateTime } : {}),
  };
}

// --- Leitura da resposta -------------------------------------------------------------------
// Os dados vêm de um serviço externo: validamos tudo e ignoramos o que não for reconhecido.

const optionalText = z
  .string()
  .transform((v) => v.trim().slice(0, MAX_TEXT) || undefined)
  .optional()
  .catch(undefined);
const flag = z.boolean().optional().catch(undefined);
const bitmask = z.number().int().min(0).max(0xffff);

const signElements = z
  .array(z.object({ text: z.string() }))
  .max(20)
  .optional()
  .catch(undefined);

const maneuverSchema = z.object({
  type: z.number().int().min(0).max(255),
  instruction: z.string().max(5000),
  verbal_transition_alert_instruction: optionalText,
  verbal_pre_transition_instruction: optionalText,
  verbal_post_transition_instruction: optionalText,
  street_names: z.array(z.string()).max(20).optional().catch(undefined),
  time: z.number().min(0),
  length: z.number().min(0),
  begin_shape_index: z.number().int().min(0),
  end_shape_index: z.number().int().min(0),
  toll: flag,
  highway: flag,
  ferry: flag,
  roundabout_exit_count: z.number().int().min(1).max(50).optional().catch(undefined),
  lanes: z
    .array(
      z.object({
        directions: bitmask,
        active: bitmask.optional().catch(undefined),
        valid: bitmask.optional().catch(undefined),
      }),
    )
    .max(30)
    .optional()
    .catch(undefined),
  sign: z
    .object({
      exit_number_elements: signElements,
      exit_branch_elements: signElements,
      exit_toward_elements: signElements,
    })
    .optional()
    .catch(undefined),
});

const summarySchema = z.object({
  time: z.number().min(0),
  length: z.number().min(0),
  has_toll: flag,
  has_highway: flag,
  has_ferry: flag,
});

const legSchema = z.object({
  maneuvers: z.array(maneuverSchema).min(1).max(MAX_MANEUVERS_PER_LEG),
  summary: summarySchema,
  shape: z.string().min(1).max(MAX_SHAPE_CHARS),
});

const tripSchema = z.object({
  legs: z
    .array(legSchema)
    .min(1)
    .max(MAX_WAYPOINTS - 1),
  summary: summarySchema,
  units: z.enum(['kilometers', 'miles']).optional().catch(undefined),
});

const responseSchema = z.object({
  trip: z.unknown(),
  alternates: z
    .array(z.object({ trip: z.unknown() }))
    .max(10)
    .optional()
    .catch(undefined),
});

const errorSchema = z.object({
  error_code: z.number().int().optional().catch(undefined),
  error: z.string().optional().catch(undefined),
});

type Trip = z.infer<typeof tripSchema>;
type Maneuver = z.infer<typeof maneuverSchema>;

const SAME_POINT_DEGREES = 1e-6;

function samePoint(a: LngLat, b: LngLat): boolean {
  return (
    Math.abs(a.lng - b.lng) < SAME_POINT_DEGREES && Math.abs(a.lat - b.lat) < SAME_POINT_DEGREES
  );
}

function texts(elements: readonly { text: string }[] | undefined): string[] {
  return (elements ?? [])
    .map((e) => e.text.trim().slice(0, MAX_TEXT))
    .filter((t) => t.length > 0)
    .slice(0, 5);
}

function toSign(sign: Maneuver['sign']): RouteSign | undefined {
  if (!sign) return undefined;
  const exitNumber = texts(sign.exit_number_elements)[0];
  const branch = texts(sign.exit_branch_elements);
  const toward = texts(sign.exit_toward_elements);
  if (!exitNumber && branch.length === 0 && toward.length === 0) return undefined;
  return { ...(exitNumber ? { exitNumber } : {}), branch, toward };
}

function toLanes(lanes: Maneuver['lanes']): RouteLane[] | undefined {
  if (!lanes || lanes.length === 0) return undefined;
  return lanes.map((lane) => ({
    directions: lane.directions,
    active: lane.active ?? 0,
    valid: lane.valid ?? 0,
  }));
}

function computeBBox(points: readonly LngLat[]): BBox {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const p of points) {
    west = Math.min(west, p.lng);
    south = Math.min(south, p.lat);
    east = Math.max(east, p.lng);
    north = Math.max(north, p.lat);
  }
  return [west, south, east, north];
}

/** Converte uma viagem do Valhalla numa rota; devolve `null` se os dados forem incoerentes. */
function tripToRoute(trip: Trip, mode: TravelMode): Route | null {
  const unitToMeters = trip.units === 'miles' ? 1609.344 : 1000;
  const geometry: LngLat[] = [];
  const maneuvers: RouteManeuver[] = [];
  const legs: RouteLeg[] = [];

  for (const [legIndex, leg] of trip.legs.entries()) {
    let points: LngLat[];
    try {
      points = decodePolyline(leg.shape);
    } catch {
      return null;
    }
    if (points.length === 0 || points.some((p) => !isValidLngLat(p))) return null;
    if (points.length === 1) points.push(points[0] as LngLat);
    if (geometry.length + points.length > MAX_ROUTE_POINTS) return null;

    // Cada etapa começa no ponto onde a anterior acabou: não repetimos esse ponto.
    const last = geometry.at(-1);
    const dropFirst = last !== undefined && samePoint(last, points[0] as LngLat);
    const offset = dropFirst ? geometry.length - 1 : geometry.length;
    for (const point of dropFirst ? points.slice(1) : points) geometry.push(point);
    const maxLocal = points.length - 1;

    for (const m of leg.maneuvers) {
      const begin = Math.min(m.begin_shape_index, maxLocal) + offset;
      const end = Math.max(begin, Math.min(m.end_shape_index, maxLocal) + offset);
      const lanes = toLanes(m.lanes);
      const sign = toSign(m.sign);
      maneuvers.push({
        type: m.type,
        instruction: m.instruction.trim().slice(0, MAX_TEXT),
        ...(m.verbal_transition_alert_instruction
          ? { verbalAlert: m.verbal_transition_alert_instruction }
          : {}),
        ...(m.verbal_pre_transition_instruction
          ? { verbalPre: m.verbal_pre_transition_instruction }
          : {}),
        ...(m.verbal_post_transition_instruction
          ? { verbalPost: m.verbal_post_transition_instruction }
          : {}),
        streetNames: (m.street_names ?? [])
          .map((s) => s.trim().slice(0, MAX_TEXT))
          .filter(Boolean)
          .slice(0, 5),
        distance: m.length * unitToMeters,
        duration: m.time,
        beginIndex: begin,
        endIndex: end,
        leg: legIndex,
        toll: m.toll ?? false,
        highway: m.highway ?? false,
        ferry: m.ferry ?? false,
        ...(m.roundabout_exit_count !== undefined
          ? { roundaboutExit: m.roundabout_exit_count }
          : {}),
        ...(lanes ? { lanes } : {}),
        ...(sign ? { sign } : {}),
      });
    }
    legs.push({
      distance: leg.summary.length * unitToMeters,
      duration: leg.summary.time,
      endIndex: geometry.length - 1,
    });
  }

  return {
    mode,
    geometry,
    distance: trip.summary.length * unitToMeters,
    duration: trip.summary.time,
    bbox: computeBBox(geometry),
    hasToll: trip.summary.has_toll ?? false,
    hasHighway: trip.summary.has_highway ?? false,
    hasFerry: trip.summary.has_ferry ?? false,
    legs,
    maneuvers,
  };
}

/** Converte a resposta do Valhalla na rota principal seguida das alternativas válidas. */
export function parseValhallaResponse(body: unknown, mode: TravelMode): Route[] {
  const parsed = responseSchema.safeParse(body);
  const main = parsed.success ? tripSchema.safeParse(parsed.data.trip) : undefined;
  const mainRoute = main?.success ? tripToRoute(main.data, mode) : null;
  if (!parsed.success || !mainRoute) {
    throw new RouterError('bad_response', 'Resposta do serviço de rotas em formato inesperado.');
  }
  const routes = [mainRoute];
  for (const alternate of parsed.data.alternates ?? []) {
    if (routes.length > MAX_ALTERNATIVES) break;
    const trip = tripSchema.safeParse(alternate.trip);
    const route = trip.success ? tripToRoute(trip.data, mode) : null;
    if (route) routes.push(route);
  }
  return routes;
}

/** Códigos de erro do Valhalla que significam "não há caminho" (ver a documentação da API). */
const NO_ROUTE_CODES = new Set([170, 171, 441, 442, 443]);
const TOO_FAR_CODES = new Set([154]);

/** Converte o corpo de um erro HTTP 400 do Valhalla num erro do Trajecto. */
export function parseValhallaError(body: unknown, status: number): RouterError {
  const parsed = errorSchema.safeParse(body);
  const code = parsed.success ? parsed.data.error_code : undefined;
  if (code !== undefined && NO_ROUTE_CODES.has(code)) {
    return new RouterError('no_route', 'Não foi encontrado um caminho entre os pontos.', status);
  }
  if (code !== undefined && TOO_FAR_CODES.has(code)) {
    return new RouterError(
      'too_far',
      'A distância excede o limite deste meio de transporte.',
      status,
    );
  }
  return new RouterError('invalid_request', 'O serviço de rotas recusou o pedido.', status);
}

export interface ValhallaRouterOptions {
  /** URL completo do serviço, por exemplo "/api/route" (função própria) ou "http://localhost:8002/route". */
  readonly url: string;
  /** Permite injetar `fetch` nos testes. */
  readonly fetch?: typeof fetch;
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    if (isAbort(error)) throw error;
    return undefined;
  }
}

export function createValhallaRouter(options: ValhallaRouterOptions): Router {
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);

  return {
    async route(request: RouteRequest, routeOptions: RouteOptions = {}): Promise<Route[]> {
      const body = JSON.stringify(buildValhallaRequest(request));
      let response: Response;
      try {
        response = await fetchImpl(options.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body,
          ...(routeOptions.signal ? { signal: routeOptions.signal } : {}),
        });
      } catch (error) {
        if (isAbort(error)) throw error;
        throw new RouterError('network', 'Sem ligação ao serviço de rotas.');
      }

      if (response.status === 429) {
        await response.body?.cancel();
        throw new RouterError('rate_limited', 'Demasiados pedidos ao serviço de rotas.', 429);
      }
      if (response.status === 400) {
        throw parseValhallaError(await readJson(response), 400);
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new RouterError(
          'unavailable',
          `Serviço de rotas indisponível (HTTP ${response.status}).`,
          response.status,
        );
      }
      const json = await readJson(response);
      if (json === undefined) {
        throw new RouterError('bad_response', 'Resposta do serviço de rotas inválida.');
      }
      return parseValhallaResponse(json, request.mode);
    },
  };
}
