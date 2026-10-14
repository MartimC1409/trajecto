import { roundSpokenDistance } from './cost';
import type { LngLat } from './geo';
import { isValidLngLat } from './geo';
import {
  bearingDegrees,
  cumulativeDistances,
  distanceMeters,
  pointAlong,
  projectOnSegment,
} from './geometry';
import type { Route, RouteManeuver, TravelMode } from './routing';
import { isArrivalManeuver, MANEUVER } from './routing';

/** Posição recebida do GPS (ou do simulador). */
export interface NavigationFix {
  readonly lngLat: LngLat;
  /** Precisão horizontal em metros. */
  readonly accuracy?: number | null;
  /** Direção de deslocação em graus (0 = norte); `null` quando parado ou desconhecida. */
  readonly heading?: number | null;
  /** Velocidade em m/s. */
  readonly speed?: number | null;
  /** Instante em milissegundos. */
  readonly timestamp: number;
}

export type NavigationStatus = 'navigating' | 'off_route' | 'arrived';

export interface NavigationSnapshot {
  readonly status: NavigationStatus;
  /** Posição projetada na rota. */
  readonly snapped: LngLat;
  /** Direção da rota no ponto projetado (graus). */
  readonly bearing: number;
  readonly distanceFromRoute: number;
  readonly distanceTraveled: number;
  readonly distanceRemaining: number;
  /** Segundos até ao destino, pelas estimativas do serviço de rotas. */
  readonly durationRemaining: number;
  /** Índice da próxima manobra (a que ainda não foi feita). */
  readonly nextManeuverIndex: number;
  readonly distanceToNextManeuver: number;
  /** Etapa atual (0 = até à primeira paragem). */
  readonly legIndex: number;
  /** Velocidade estimada (m/s). */
  readonly speed: number;
}

export interface NavigatorUpdate {
  readonly snapshot: NavigationSnapshot;
  /** Frases para dizer em voz alta, por ordem. */
  readonly announcements: readonly string[];
  /** Verdadeiro quando a rota deve ser recalculada a partir da posição atual. */
  readonly reroute: boolean;
  /** Verdadeiro quando a posição foi ignorada por ser demasiado imprecisa. */
  readonly ignored: boolean;
}

export interface NavigatorOptions {
  /** Compõe o aviso antecipado, por exemplo (300, "Vire à direita.") → "Daqui a 300 metros, vire à direita." */
  readonly formatAlert: (distanceMeters: number, instruction: string) => string;
  /** Posições seguidas fora da rota antes de recalcular (por omissão 3). */
  readonly offRouteFixes?: number;
  /** Tempo mínimo entre pedidos de recálculo (por omissão 15 s). */
  readonly rerouteCooldownMs?: number;
  /** Posições com precisão pior do que isto são ignoradas (por omissão 80 m). */
  readonly maxAccuracy?: number;
}

export interface Navigator {
  readonly route: Route;
  update(fix: NavigationFix): NavigatorUpdate;
}

interface ModeProfile {
  /** Distância à rota a partir da qual se considera que saiu dela. */
  readonly offRoute: number;
  /** Distância ao destino a partir da qual se considera que chegou. */
  readonly arrive: number;
  readonly minAlert: number;
  readonly maxAlert: number;
  readonly minPre: number;
  /** Velocidade típica (m/s), usada enquanto não há uma medição. */
  readonly typicalSpeed: number;
}

const PROFILES: Record<TravelMode, ModeProfile> = {
  car: { offRoute: 40, arrive: 30, minAlert: 400, maxAlert: 2000, minPre: 70, typicalSpeed: 13.9 },
  motorcycle: {
    offRoute: 40,
    arrive: 30,
    minAlert: 400,
    maxAlert: 2000,
    minPre: 70,
    typicalSpeed: 13.9,
  },
  bike: { offRoute: 30, arrive: 20, minAlert: 120, maxAlert: 500, minPre: 30, typicalSpeed: 4.5 },
  walk: { offRoute: 25, arrive: 15, minAlert: 60, maxAlert: 200, minPre: 15, typicalSpeed: 1.4 },
};

/** Segundos de antecedência do aviso antecipado e do aviso imediato. */
const ALERT_SECONDS = 25;
const PRE_SECONDS = 7;
/** Margem para não juntar o aviso antecipado e o imediato. */
const ALERT_PRE_GAP = 40;
/** Distância percorrida depois de uma manobra antes de dizer a instrução seguinte. */
const POST_DELAY_METERS = 15;
/** Antes de chegar à rota pela primeira vez, só se recalcula se se afastar mais do que isto. */
const JOIN_TOLERANCE = 150;
/** Até onde, à frente da posição anterior, se procura a posição atual na rota. */
const SEARCH_LOOKAHEAD_SECONDS = 15;
const SEARCH_MIN_LOOKAHEAD = 300;
const WRONG_WAY_ANGLE = 135;
const WRONG_WAY_MIN_SPEED = 4;

function angleDifference(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function isStartManeuver(type: number): boolean {
  return type === MANEUVER.start || type === MANEUVER.startRight || type === MANEUVER.startLeft;
}

function spokenPre(m: RouteManeuver): string {
  return m.verbalPre ?? m.instruction;
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLocaleLowerCase('pt-PT') + text.slice(1);
}

export function createNavigator(route: Route, options: NavigatorOptions): Navigator {
  const profile = PROFILES[route.mode];
  const offRouteFixes = Math.max(1, options.offRouteFixes ?? 3);
  const rerouteCooldownMs = options.rerouteCooldownMs ?? 15_000;
  const maxAccuracy = options.maxAccuracy ?? 80;

  const line = route.geometry;
  const cumulative = cumulativeDistances(line);
  const totalLength = cumulative.at(-1) ?? 0;
  const lastSegment = Math.max(0, line.length - 2);
  const maneuvers = route.maneuvers;
  const maneuverStart = maneuvers.map((m) => cumulative[m.beginIndex] ?? 0);
  const maneuverEnd = maneuvers.map((m) => cumulative[m.endIndex] ?? 0);
  // Soma das durações das manobras a partir de cada índice (para o tempo restante).
  const durationSuffix: number[] = new Array<number>(maneuvers.length + 1).fill(0);
  for (let i = maneuvers.length - 1; i >= 0; i--) {
    durationSuffix[i] = (durationSuffix[i + 1] ?? 0) + (maneuvers[i]?.duration ?? 0);
  }
  const legEnds = route.legs.map((leg) => cumulative[leg.endIndex] ?? totalLength);

  let segment = 0;
  let traveled = 0;
  let joined = false;
  let initialDistance: number | undefined;
  let offCount = 0;
  let wrongWayCount = 0;
  let lastRerouteAt = -Infinity;
  let arrived = false;
  let speed = profile.typicalSpeed;
  let previous: { traveled: number; timestamp: number } | undefined;
  let lastSnapshot: NavigationSnapshot | undefined;
  const spoken = new Set<string>();

  function project(p: LngLat, from: number, to: number) {
    let best = { segment: from, distance: Infinity, progress: traveled, point: line[0] as LngLat };
    for (let i = from; i <= to; i++) {
      const a = line[i] as LngLat;
      const b = line[i + 1] ?? a;
      const proj = projectOnSegment(p, a, b);
      if (proj.distance < best.distance) {
        const start = cumulative[i] ?? 0;
        const length = (cumulative[i + 1] ?? start) - start;
        best = {
          segment: i,
          distance: proj.distance,
          progress: start + length * proj.t,
          point: proj.point,
        };
      }
    }
    return best;
  }

  function windowEnd(fromSegment: number): number {
    const lookahead = Math.max(SEARCH_MIN_LOOKAHEAD, speed * SEARCH_LOOKAHEAD_SECONDS);
    const limit = (cumulative[fromSegment] ?? 0) + lookahead;
    let end = fromSegment;
    while (
      end < lastSegment &&
      ((cumulative[end + 1] ?? Infinity) <= limit || end - fromSegment < 10)
    ) {
      end++;
    }
    return end;
  }

  function nextManeuverIndex(progress: number): number {
    for (let i = 0; i < maneuvers.length; i++) {
      if ((maneuverStart[i] ?? 0) > progress + 1) return i;
    }
    return maneuvers.length - 1;
  }

  function currentManeuverIndex(progress: number): number {
    let current = 0;
    for (let i = 0; i < maneuvers.length; i++) {
      if ((maneuverStart[i] ?? 0) <= progress + 1) current = i;
      else break;
    }
    return current;
  }

  function remainingDuration(progress: number): number {
    const current = currentManeuverIndex(progress);
    const m = maneuvers[current];
    if (!m) return 0;
    const start = maneuverStart[current] ?? 0;
    const end = maneuverEnd[current] ?? start;
    const length = end - start;
    const fraction = length > 0 ? Math.min(1, Math.max(0, (end - progress) / length)) : 0;
    return m.duration * fraction + (durationSuffix[current + 1] ?? 0);
  }

  function legIndexAt(progress: number): number {
    const index = legEnds.findIndex((end) => progress < end - profile.arrive);
    return index === -1 ? Math.max(0, legEnds.length - 1) : index;
  }

  function say(key: string, text: string | undefined, out: string[]): void {
    if (!text || spoken.has(key)) return;
    spoken.add(key);
    out.push(text);
  }

  function update(fix: NavigationFix): NavigatorUpdate {
    const accuracy = fix.accuracy ?? 0;
    if (!isValidLngLat(fix.lngLat) || accuracy > maxAccuracy) {
      return {
        snapshot: lastSnapshot ?? snapshotAt(fix.lngLat, Infinity, 'navigating'),
        announcements: [],
        reroute: false,
        ignored: true,
      };
    }

    // 1. Projetar a posição na rota, procurando primeiro à frente da posição anterior.
    let best = project(fix.lngLat, Math.max(0, segment - 1), windowEnd(segment));
    const tolerance = profile.offRoute + Math.min(accuracy, 50);
    if (best.distance > tolerance) {
      // Pode ter apanhado a rota mais à frente (por exemplo, um atalho): procurar em toda a rota.
      const global = project(fix.lngLat, 0, lastSegment);
      if (global.distance <= tolerance && global.progress > traveled) best = global;
    }
    const onRoute = best.distance <= tolerance;
    if (onRoute) {
      joined = true;
      if (best.progress > traveled) {
        traveled = best.progress;
        segment = best.segment;
      }
    }

    // 2. Velocidade: a do GPS, ou calculada a partir do avanço na rota.
    if (
      fix.speed !== undefined &&
      fix.speed !== null &&
      Number.isFinite(fix.speed) &&
      fix.speed >= 0
    ) {
      speed = fix.speed;
    } else if (previous && fix.timestamp > previous.timestamp) {
      const measured =
        (traveled - previous.traveled) / ((fix.timestamp - previous.timestamp) / 1000);
      speed = speed * 0.6 + Math.max(0, measured) * 0.4;
    }
    previous = { traveled, timestamp: fix.timestamp };

    // 3. Saída da rota: longe da linha, ou em sentido contrário, em várias posições seguidas.
    initialDistance ??= best.distance;
    const away = joined ? !onRoute : best.distance > initialDistance + JOIN_TOLERANCE;
    offCount = away ? offCount + 1 : 0;
    const routeBearing = bearingAt(segment);
    const wrongWay =
      joined &&
      onRoute &&
      fix.heading !== undefined &&
      fix.heading !== null &&
      Number.isFinite(fix.heading) &&
      speed >= WRONG_WAY_MIN_SPEED &&
      angleDifference(fix.heading, routeBearing) > WRONG_WAY_ANGLE;
    wrongWayCount = wrongWay ? wrongWayCount + 1 : 0;
    const isOff = offCount >= offRouteFixes || wrongWayCount >= offRouteFixes + 2;

    const announcements: string[] = [];
    let reroute = false;

    // 4. Chegada ao destino final.
    const toEnd = totalLength - traveled;
    // Junto ao ponto final (só a partir de meio da rota, para não confundir com a partida num circuito).
    const nearEnd =
      (traveled >= totalLength / 2 || totalLength <= profile.arrive * 4) &&
      distanceMeters(fix.lngLat, line.at(-1) as LngLat) <= profile.arrive + Math.min(accuracy, 20);
    if (!arrived && ((joined && toEnd <= profile.arrive) || nearEnd)) {
      arrived = true;
      traveled = totalLength;
      segment = lastSegment;
      const destination = maneuvers.at(-1);
      if (destination) say(`${maneuvers.length - 1}:pre`, spokenPre(destination), announcements);
    }

    const status: NavigationStatus = arrived ? 'arrived' : isOff ? 'off_route' : 'navigating';
    if (status === 'off_route' && fix.timestamp - lastRerouteAt >= rerouteCooldownMs) {
      reroute = true;
      lastRerouteAt = fix.timestamp;
    }

    // 5. Instruções faladas.
    if (status === 'navigating') {
      const alertDistance = Math.min(
        profile.maxAlert,
        Math.max(profile.minAlert, speed * ALERT_SECONDS),
      );
      const preDistance = Math.max(profile.minPre, speed * PRE_SECONDS);
      const current = currentManeuverIndex(traveled);
      const next = nextManeuverIndex(traveled);
      const currentManeuver = maneuvers[current];
      const nextManeuver = maneuvers[next];
      const toNext = (maneuverStart[next] ?? totalLength) - traveled;

      if (currentManeuver) {
        // À partida (e depois de cada paragem) diz a direção inicial.
        if (isStartManeuver(currentManeuver.type)) {
          say(`${current}:pre`, spokenPre(currentManeuver), announcements);
        }
        // Depois da manobra, "Continue durante…", se o aviso seguinte ainda estiver longe.
        if (
          traveled - (maneuverStart[current] ?? 0) >= POST_DELAY_METERS &&
          toNext > alertDistance + 100
        ) {
          say(`${current}:post`, currentManeuver.verbalPost, announcements);
        }
      }
      if (nextManeuver && next !== current) {
        const finalArrival = next === maneuvers.length - 1 && isArrivalManeuver(nextManeuver.type);
        if (toNext <= alertDistance && toNext > preDistance + ALERT_PRE_GAP) {
          const text = nextManeuver.verbalAlert ?? nextManeuver.instruction;
          say(
            `${next}:alert`,
            options.formatAlert(roundSpokenDistance(toNext), lowerFirst(text)),
            announcements,
          );
        }
        if (!finalArrival && toNext <= preDistance) {
          spoken.add(`${next}:alert`);
          say(`${next}:pre`, spokenPre(nextManeuver), announcements);
        }
      }
    }

    const snapshot = snapshotAt(fix.lngLat, best.distance, status);
    lastSnapshot = snapshot;
    return { snapshot, announcements, reroute, ignored: false };
  }

  function bearingAt(index: number): number {
    const a = line[index] as LngLat;
    const b = line[index + 1] ?? a;
    return a === b ? (lastSnapshot?.bearing ?? 0) : bearingDegrees(a, b);
  }

  function snapshotAt(
    position: LngLat,
    distanceFromRoute: number,
    status: NavigationStatus,
  ): NavigationSnapshot {
    const next = nextManeuverIndex(traveled);
    return {
      status,
      snapped: pointAlong(line, cumulative, traveled).point,
      bearing: bearingAt(segment),
      distanceFromRoute: Number.isFinite(distanceFromRoute)
        ? distanceFromRoute
        : distanceMeters(position, line[0] as LngLat),
      distanceTraveled: traveled,
      distanceRemaining: Math.max(0, totalLength - traveled),
      durationRemaining: status === 'arrived' ? 0 : remainingDuration(traveled),
      nextManeuverIndex: next,
      distanceToNextManeuver: Math.max(0, (maneuverStart[next] ?? totalLength) - traveled),
      legIndex: legIndexAt(traveled),
      speed,
    };
  }

  return { route, update };
}
