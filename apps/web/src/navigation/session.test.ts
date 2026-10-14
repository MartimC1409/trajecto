import type { LngLat, Route, Router } from '@trajecto/core';
import {
  cumulativeDistances,
  parseValhallaResponse,
  pointAlong,
  RouterError,
} from '@trajecto/core';
import { valhallaResponse } from '@trajecto/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NavigationState, NavigationTarget } from './session';
import { createNavigationSession } from './session';

const route = parseValhallaResponse(valhallaResponse(), 'car')[0] as Route;
const DESTINATION = route.geometry.at(-1) as LngLat;

function along(meters: number, east = 0) {
  const { point } = pointAlong(route.geometry, cumulativeDistances(route.geometry), meters);
  return {
    lng: point.lng + east / (111_320 * Math.cos((point.lat * Math.PI) / 180)),
    lat: point.lat,
  };
}

function fakeGeolocation() {
  let success: PositionCallback | undefined;
  let failure: PositionErrorCallback | null | undefined;
  const geolocation = {
    watchPosition: vi.fn((ok: PositionCallback, error?: PositionErrorCallback | null) => {
      success = ok;
      failure = error;
      return 7;
    }),
    clearWatch: vi.fn(),
    getCurrentPosition: vi.fn(),
  };
  const emit = (
    lngLat: { lng: number; lat: number },
    timestamp: number,
    extra: Partial<GeolocationCoordinates> = {},
  ) =>
    success?.({
      coords: {
        longitude: lngLat.lng,
        latitude: lngLat.lat,
        accuracy: 5,
        heading: null,
        speed: null,
        altitude: null,
        altitudeAccuracy: null,
        ...extra,
      } as GeolocationCoordinates,
      timestamp,
    } as GeolocationPosition);
  const fail = (code: number) =>
    failure?.({
      code,
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
      message: '',
    } as GeolocationPositionError);
  return { geolocation: geolocation as unknown as Geolocation, raw: geolocation, emit, fail };
}

function setup(routerImpl?: Router['route']) {
  const states: (NavigationState | null)[] = [];
  const speak = vi.fn<(texts: readonly string[]) => void>();
  const router: Router = { route: vi.fn(routerImpl ?? (async () => [route])) };
  const gps = fakeGeolocation();
  const session = createNavigationSession({
    router,
    geolocation: gps.geolocation,
    speak,
    formatAlert: (m, text) => `Daqui a ${m} metros, ${text}`,
    reroutingMessage: () => 'A recalcular a rota.',
    onChange: (state) => states.push(state),
  });
  const target: NavigationTarget = {
    route,
    waypoints: [DESTINATION],
    request: { mode: 'car', language: 'pt-PT', preferences: { avoidTolls: true } },
    simulate: false,
  };
  return { session, states, speak, router, gps, target };
}

describe('createNavigationSession', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('segue o GPS, fala as instruções e para ao chegar', () => {
    const { session, speak, gps, target } = setup();
    session.start(target);
    expect(gps.raw.watchPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 15_000,
    });
    gps.emit(along(0), 0);
    expect(speak).toHaveBeenLastCalledWith(['Siga para norte na Avenida da Liberdade.']);
    expect(session.getState()?.position?.lngLat.lat).toBeCloseTo(38.715, 5);
    gps.emit(along(1212), 1000);
    expect(session.getState()?.snapshot?.status).toBe('arrived');
    expect(gps.raw.clearWatch).toHaveBeenCalledWith(7);
    session.stop();
    expect(session.getState()).toBeNull();
  });

  it('recalcula a rota a partir da posição atual quando sai dela', async () => {
    const { session, speak, gps, target, router } = setup();
    session.start(target);
    gps.emit(along(100), 0);
    for (let t = 1; t <= 3; t++) gps.emit(along(150, 150), t * 1000, { heading: 90, speed: 10 });
    expect(session.getState()?.rerouting).toBe(true);
    expect(session.getState()?.position?.bearing).toBe(90);
    expect(speak).toHaveBeenCalledWith(['A recalcular a rota.']);
    expect(router.route).toHaveBeenCalledWith(
      {
        mode: 'car',
        language: 'pt-PT',
        preferences: { avoidTolls: true },
        waypoints: [along(150, 150), DESTINATION],
        heading: 90,
      },
      { signal: expect.any(AbortSignal) },
    );
    await vi.runAllTimersAsync();
    expect(session.getState()).toMatchObject({ rerouting: false, notice: null });
  });

  it('avisa quando o recálculo falha e limpa o aviso ao voltar à rota', async () => {
    const { session, gps, target } = setup(async () => {
      throw new RouterError('network', 'x');
    });
    session.start(target);
    gps.emit(along(100), 0);
    for (let t = 1; t <= 3; t++) gps.emit(along(150, 150), t * 1000);
    await vi.runAllTimersAsync();
    expect(session.getState()?.notice).toBe('reroute_failed');
    gps.emit(along(150, 150), 4000);
    expect(session.getState()?.notice).toBe('reroute_failed');
    gps.emit(along(200), 5000);
    expect(session.getState()?.notice).toBeNull();
  });

  it('ignora o resultado de um recálculo depois de terminar', async () => {
    let resolve: (routes: Route[]) => void = () => undefined;
    const { session, gps, target, states } = setup(
      () => new Promise<Route[]>((r) => (resolve = r)),
    );
    session.start(target);
    gps.emit(along(100), 0);
    for (let t = 1; t <= 3; t++) gps.emit(along(150, 150), t * 1000);
    session.stop();
    resolve([route]);
    await vi.runAllTimersAsync();
    expect(states.at(-1)).toBeNull();
  });

  it('indica falta de permissão ou de sinal do GPS', () => {
    const { session, gps, target } = setup();
    session.start(target);
    gps.fail(1);
    expect(session.getState()?.notice).toBe('gps_denied');
    gps.fail(3);
    expect(session.getState()?.notice).toBe('gps_error');
  });

  it('funciona sem geolocalização disponível', () => {
    const states: (NavigationState | null)[] = [];
    const session = createNavigationSession({
      router: { route: vi.fn() },
      geolocation: undefined,
      speak: vi.fn(),
      formatAlert: (m, t) => `${m} ${t}`,
      reroutingMessage: () => '',
      onChange: (s) => states.push(s),
    });
    session.start({
      route,
      waypoints: [DESTINATION],
      request: { mode: 'car', language: 'pt-PT' },
      simulate: false,
    });
    expect(session.getState()?.notice).toBe('gps_error');
  });

  it('simula a viagem e permite acelerar', () => {
    const { session, gps, target, speak } = setup();
    session.start({ ...target, simulate: true });
    expect(gps.raw.watchPosition).not.toHaveBeenCalled();
    expect(speak).toHaveBeenCalledWith(['Siga para norte na Avenida da Liberdade.']);
    session.setSimulationSpeed(4);
    session.setSimulationSpeed(Number.NaN);
    expect(session.getState()?.simulationSpeed).toBe(4);
    vi.advanceTimersByTime(40_000);
    expect(session.getState()?.snapshot?.status).toBe('arrived');
    expect(speak).toHaveBeenLastCalledWith(['Chegou ao seu destino.']);
  });

  it('não altera a velocidade fora da simulação', () => {
    const { session, target } = setup();
    session.start(target);
    session.setSimulationSpeed(4);
    expect(session.getState()?.simulationSpeed).toBe(1);
  });
});
