import type {
  AlertSource,
  LngLat,
  NavigationFix,
  NavigationSnapshot,
  Navigator,
  Route,
  RouteRequest,
  RouteAlert,
  Router,
  TravelMode,
} from '@trajecto/core';
import {
  alertsAlongRoute,
  createNavigator,
  createRouteSimulator,
  isAbortError,
  isValidLngLat,
  nextAlert,
  roundSpokenDistance,
} from '@trajecto/core';

/** O que é preciso para começar a navegar. */
export interface NavigationTarget {
  readonly route: Route;
  /** Paragens e destino (sem a partida), pela ordem da viagem. */
  readonly waypoints: readonly LngLat[];
  /** Meio de transporte, preferências e língua usados para recalcular a rota. */
  readonly request: Pick<RouteRequest, 'mode' | 'preferences' | 'language'>;
  readonly simulate: boolean;
  /** Reportes e radares a avisar durante a viagem (os que ficarem em cima da rota). */
  readonly alerts?: readonly AlertSource[];
}

/**
 * Aviso a mostrar durante a navegação. `gps_weak`: as posições recebidas são demasiado imprecisas
 * para seguir a rota (por exemplo, dentro de casa); a navegação continua quando o sinal melhorar.
 */
export type NavigationNotice = 'reroute_failed' | 'gps_denied' | 'gps_error' | 'gps_weak' | null;

export interface NavigationState {
  readonly route: Route;
  readonly snapshot: NavigationSnapshot | null;
  /** Posição a mostrar no mapa: na rota quando se está nela, senão a do GPS. */
  readonly position: { readonly lngLat: LngLat; readonly bearing: number } | null;
  readonly rerouting: boolean;
  readonly notice: NavigationNotice;
  /** Precisão da última posição do GPS (m), arredondada; `null` antes da primeira. */
  readonly gpsAccuracy: number | null;
  readonly simulate: boolean;
  /** Multiplicador de velocidade da simulação. */
  readonly simulationSpeed: number;
  /** Instante da última atualização (para calcular a hora de chegada). */
  readonly updatedAt: number;
  /** Próximo aviso na rota (reporte ou radar) até 2 km à frente. */
  readonly nextAlert: {
    readonly kind: string;
    readonly distance: number;
    /** Valor extra (por exemplo, o limite de um radar). */
    readonly detail?: number;
  } | null;
}

export interface NavigationSessionDeps {
  readonly router: Router;
  readonly geolocation: Geolocation | undefined;
  readonly speak: (texts: readonly string[]) => void;
  readonly formatAlert: (meters: number, instruction: string) => string;
  /** Frase dita ao recalcular a rota (na língua atual). */
  readonly reroutingMessage: () => string;
  /** Frase dita ao aproximar-se de um aviso, por exemplo "Polícia reportada daqui a 400 metros." */
  readonly alertMessage?: (kind: string, meters: number, detail?: number) => string;
  readonly onChange: (state: NavigationState | null) => void;
  /** Intervalo entre posições simuladas (por omissão 1 s). */
  readonly simulationTickMs?: number;
}

export interface NavigationSession {
  start(target: NavigationTarget): void;
  stop(): void;
  setSimulationSpeed(factor: number): void;
  getState(): NavigationState | null;
}

/** Abaixo desta velocidade (m/s) a direção do GPS não é fiável. */
const MIN_SPEED_FOR_HEADING = 2;
/**
 * Intervalo mínimo entre recálculos, contado na sessão (e não em cada rota), para respeitar
 * o uso justo do servidor público mesmo quando a rota nova volta a ser abandonada logo.
 */
export const REROUTE_COOLDOWN_MS = 15_000;
/** O próximo aviso aparece no ecrã a partir desta distância (m). */
const ALERT_DISPLAY_DISTANCE = 2000;
/**
 * Erros de "tempo esgotado" do GPS logo depois de uma posição não contam como falta de sinal:
 * parado, o telemóvel pode demorar a dar uma posição nova.
 */
const GPS_STALE_MS = 30_000;

/** Distância (m) a que se diz o aviso em voz alta: ~25 s antes, conforme o meio de transporte. */
export function alertSpeakDistance(mode: TravelMode, speed: number): number {
  if (mode === 'walk') return 60;
  if (mode === 'bike') return 150;
  return Math.min(1500, Math.max(300, speed * 25));
}

export function createNavigationSession(deps: NavigationSessionDeps): NavigationSession {
  const tickMs = deps.simulationTickMs ?? 1000;
  let state: NavigationState | null = null;
  let navigator: Navigator | null = null;
  let target: NavigationTarget | null = null;
  let waypoints: readonly LngLat[] = [];
  let watchId: number | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let rerouteController: AbortController | null = null;
  let generation = 0;
  let lastRerouteAt = -Infinity;
  let lastFix: NavigationFix | null = null;
  let lastFixAt = -Infinity;
  let routeAlerts: RouteAlert[] = [];
  const announcedAlerts = new Set<string>();

  function emit(next: NavigationState | null) {
    state = next;
    deps.onChange(state);
  }

  function patch(changes: Partial<NavigationState>) {
    if (state) emit({ ...state, ...changes });
  }

  function stopSources() {
    if (watchId !== null) deps.geolocation?.clearWatch(watchId);
    watchId = null;
    if (timer !== null) clearInterval(timer);
    timer = null;
  }

  function newNavigator(route: Route): Navigator {
    routeAlerts = alertsAlongRoute(route, target?.alerts ?? []);
    return createNavigator(route, { formatAlert: deps.formatAlert });
  }

  async function reroute(fix: NavigationFix, legIndex: number) {
    if (!target || state?.rerouting) return;
    const session = generation;
    const remaining = waypoints.slice(legIndex);
    if (remaining.length === 0) return;
    rerouteController?.abort();
    const controller = new AbortController();
    rerouteController = controller;
    patch({ rerouting: true });
    deps.speak([deps.reroutingMessage()]);
    const heading =
      fix.heading !== null &&
      fix.heading !== undefined &&
      Number.isFinite(fix.heading) &&
      (fix.speed ?? 0) >= MIN_SPEED_FOR_HEADING
        ? fix.heading
        : undefined;
    try {
      const [route] = await deps.router.route(
        {
          ...target.request,
          waypoints: [fix.lngLat, ...remaining],
          ...(heading !== undefined ? { heading } : {}),
        },
        { signal: controller.signal },
      );
      if (session !== generation || !route) return;
      waypoints = remaining;
      navigator = newNavigator(route);
      // O estado da rota anterior já não serve: recalcula-se já com a última posição conhecida.
      patch({ route, snapshot: null, rerouting: false, notice: null });
      if (lastFix) onFix(lastFix);
    } catch (error) {
      if (session !== generation || isAbortError(error)) return;
      patch({ rerouting: false, notice: 'reroute_failed' });
    }
  }

  function onFix(fix: NavigationFix) {
    if (!navigator || !state) return;
    lastFix = fix;
    lastFixAt = Date.now();
    const update = navigator.update(fix);
    const accuracy =
      fix.accuracy !== null && fix.accuracy !== undefined && Number.isFinite(fix.accuracy)
        ? Math.round(fix.accuracy)
        : null;
    if (update.ignored) {
      // Posição demasiado imprecisa para seguir a rota: diz porquê em vez de ficar à espera em
      // silêncio. Antes da primeira posição boa, mostra no mapa onde o GPS acha que estás.
      if (isValidLngLat(fix.lngLat)) {
        patch({
          notice: state.notice === 'reroute_failed' ? state.notice : 'gps_weak',
          gpsAccuracy: accuracy,
          ...(state.snapshot === null
            ? { position: { lngLat: fix.lngLat, bearing: state.position?.bearing ?? 0 } }
            : {}),
        });
      }
      return;
    }
    const { snapshot } = update;
    const texts = [...update.announcements];
    let upcoming: NavigationState['nextAlert'] = null;
    if (snapshot.status === 'navigating') {
      const traveled = snapshot.distanceTraveled;
      const shown = nextAlert(routeAlerts, traveled, ALERT_DISPLAY_DISTANCE);
      if (shown) {
        upcoming = {
          kind: shown.kind,
          distance: shown.progress - traveled,
          ...(shown.detail !== undefined ? { detail: shown.detail } : {}),
        };
      }
      const toSay = nextAlert(
        routeAlerts,
        traveled,
        alertSpeakDistance(state.route.mode, snapshot.speed),
      );
      if (toSay && !announcedAlerts.has(toSay.id)) {
        announcedAlerts.add(toSay.id);
        const message = deps.alertMessage?.(
          toSay.kind,
          roundSpokenDistance(toSay.progress - traveled),
          toSay.detail,
        );
        if (message) texts.push(message);
      }
    }
    const onRoute = snapshot.status !== 'off_route';
    const gpsBearing =
      fix.heading !== null &&
      fix.heading !== undefined &&
      Number.isFinite(fix.heading) &&
      (fix.speed ?? 0) >= MIN_SPEED_FOR_HEADING
        ? fix.heading
        : snapshot.bearing;
    patch({
      snapshot,
      nextAlert: upcoming,
      gpsAccuracy: accuracy,
      updatedAt: Date.now(),
      position: onRoute
        ? { lngLat: snapshot.snapped, bearing: snapshot.bearing }
        : { lngLat: fix.lngLat, bearing: gpsBearing },
      // O aviso de recálculo falhado mantém-se enquanto estiver fora da rota.
      notice: !onRoute && state.notice === 'reroute_failed' ? state.notice : null,
    });
    if (texts.length > 0) deps.speak(texts);
    if (snapshot.status === 'arrived') {
      stopSources();
      return;
    }
    if (snapshot.status === 'off_route' && fix.timestamp - lastRerouteAt >= REROUTE_COOLDOWN_MS) {
      lastRerouteAt = fix.timestamp;
      void reroute(fix, snapshot.legIndex);
    }
  }

  function startSimulation(route: Route) {
    const simulator = createRouteSimulator(route, 1);
    let elapsed = 0;
    const tick = () => {
      const factor = state?.simulationSpeed ?? 1;
      const fix = simulator.positionAt(elapsed, Date.now());
      elapsed += tickMs * factor;
      if (!fix) {
        const end = route.geometry.at(-1);
        if (end) onFix({ lngLat: end, accuracy: 5, speed: 0, timestamp: Date.now() });
        stopSources();
        return;
      }
      onFix({ ...fix, speed: (fix.speed ?? 0) * factor });
    };
    tick();
    timer = setInterval(tick, tickMs);
  }

  function startGps() {
    if (!deps.geolocation) {
      patch({ notice: 'gps_error' });
      return;
    }
    watchId = deps.geolocation.watchPosition(
      (position) =>
        onFix({
          lngLat: { lng: position.coords.longitude, lat: position.coords.latitude },
          accuracy: position.coords.accuracy,
          heading: position.coords.heading,
          speed: position.coords.speed,
          timestamp: position.timestamp,
        }),
      (error) => {
        if (error.code === error.TIMEOUT && Date.now() - lastFixAt < GPS_STALE_MS) return;
        patch({ notice: error.code === error.PERMISSION_DENIED ? 'gps_denied' : 'gps_error' });
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15_000 },
    );
  }

  function stop() {
    generation += 1;
    stopSources();
    rerouteController?.abort();
    rerouteController = null;
    navigator = null;
    target = null;
    if (state) emit(null);
  }

  return {
    start(next) {
      stop();
      generation += 1;
      target = next;
      waypoints = next.waypoints;
      lastRerouteAt = -Infinity;
      lastFix = null;
      lastFixAt = -Infinity;
      announcedAlerts.clear();
      navigator = newNavigator(next.route);
      emit({
        route: next.route,
        snapshot: null,
        position: null,
        rerouting: false,
        notice: null,
        gpsAccuracy: null,
        simulate: next.simulate,
        simulationSpeed: 1,
        updatedAt: Date.now(),
        nextAlert: null,
      });
      if (next.simulate) startSimulation(next.route);
      else startGps();
    },
    stop,
    setSimulationSpeed(factor) {
      if (state?.simulate && Number.isFinite(factor) && factor > 0)
        patch({ simulationSpeed: factor });
    },
    getState: () => state,
  };
}
