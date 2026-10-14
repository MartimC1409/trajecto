import type {
  LngLat,
  NavigationFix,
  NavigationSnapshot,
  Navigator,
  Route,
  RouteRequest,
  Router,
} from '@trajecto/core';
import { createNavigator, createRouteSimulator, isAbortError } from '@trajecto/core';

/** O que é preciso para começar a navegar. */
export interface NavigationTarget {
  readonly route: Route;
  /** Paragens e destino (sem a partida), pela ordem da viagem. */
  readonly waypoints: readonly LngLat[];
  /** Meio de transporte, preferências e língua usados para recalcular a rota. */
  readonly request: Pick<RouteRequest, 'mode' | 'preferences' | 'language'>;
  readonly simulate: boolean;
}

export type NavigationNotice = 'reroute_failed' | 'gps_denied' | 'gps_error' | null;

export interface NavigationState {
  readonly route: Route;
  readonly snapshot: NavigationSnapshot | null;
  /** Posição a mostrar no mapa: na rota quando se está nela, senão a do GPS. */
  readonly position: { readonly lngLat: LngLat; readonly bearing: number } | null;
  readonly rerouting: boolean;
  readonly notice: NavigationNotice;
  readonly simulate: boolean;
  /** Multiplicador de velocidade da simulação. */
  readonly simulationSpeed: number;
  /** Instante da última atualização (para calcular a hora de chegada). */
  readonly updatedAt: number;
}

export interface NavigationSessionDeps {
  readonly router: Router;
  readonly geolocation: Geolocation | undefined;
  readonly speak: (texts: readonly string[]) => void;
  readonly formatAlert: (meters: number, instruction: string) => string;
  /** Frase dita ao recalcular a rota (na língua atual). */
  readonly reroutingMessage: () => string;
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
      patch({ route, rerouting: false, notice: null });
    } catch (error) {
      if (session !== generation || isAbortError(error)) return;
      patch({ rerouting: false, notice: 'reroute_failed' });
    }
  }

  function onFix(fix: NavigationFix) {
    if (!navigator || !state) return;
    const update = navigator.update(fix);
    if (update.ignored) return;
    const { snapshot } = update;
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
      updatedAt: Date.now(),
      position: onRoute
        ? { lngLat: snapshot.snapped, bearing: snapshot.bearing }
        : { lngLat: fix.lngLat, bearing: gpsBearing },
      // O aviso de recálculo falhado mantém-se enquanto estiver fora da rota.
      notice: !onRoute && state.notice === 'reroute_failed' ? state.notice : null,
    });
    if (update.announcements.length > 0) deps.speak(update.announcements);
    if (snapshot.status === 'arrived') {
      stopSources();
      return;
    }
    if (update.reroute) void reroute(fix, snapshot.legIndex);
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
      (error) =>
        patch({ notice: error.code === error.PERMISSION_DENIED ? 'gps_denied' : 'gps_error' }),
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
      navigator = newNavigator(next.route);
      emit({
        route: next.route,
        snapshot: null,
        position: null,
        rerouting: false,
        notice: null,
        simulate: next.simulate,
        simulationSpeed: 1,
        updatedAt: Date.now(),
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
