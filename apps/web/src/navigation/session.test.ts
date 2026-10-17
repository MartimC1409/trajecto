import type { LngLat, Route, Router } from '@trajecto/core';
import {
  cumulativeDistances,
  parseValhallaResponse,
  pointAlong,
  RouterError,
} from '@trajecto/core';
import { valhallaResponse } from '@trajecto/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NavigationSessionDeps, NavigationState, NavigationTarget } from './session';
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

function setup(routerImpl?: Router['route'], extra: Partial<NavigationSessionDeps> = {}) {
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
    alertMessage: (kind, meters) => `${kind} daqui a ${meters} metros.`,
    onChange: (state) => states.push(state),
    ...extra,
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
    // A rota nova é logo calculada com a última posição (não fica o estado da rota antiga).
    expect(session.getState()?.snapshot).toMatchObject({ status: 'navigating' });
  });

  it('não recalcula mais de uma vez em 15 s, mesmo com uma rota nova', async () => {
    const { session, gps, target, router } = setup();
    session.start(target);
    gps.emit(along(100), 0);
    for (let t = 1; t <= 3; t++) gps.emit(along(150, 150), t * 1000);
    await vi.runAllTimersAsync();
    expect(router.route).toHaveBeenCalledTimes(1);
    // Volta à rota nova e abandona-a logo: a sessão espera 15 s desde o último pedido.
    gps.emit(along(200), 4000);
    for (let t = 5; t <= 17; t++) gps.emit(along(250, 150), t * 1000);
    expect(session.getState()?.snapshot?.status).toBe('off_route');
    await vi.runAllTimersAsync();
    expect(router.route).toHaveBeenCalledTimes(1);
    gps.emit(along(250, 150), 18_000);
    await vi.runAllTimersAsync();
    expect(router.route).toHaveBeenCalledTimes(2);
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

  it('sem rede não tenta recalcular: avisa uma vez e recalcula quando a rede volta', async () => {
    let online = false;
    const { session, speak, gps, target, router } = setup(undefined, {
      isOnline: () => online,
      offlineMessage: () => 'Sem rede para recalcular.',
    });
    session.start(target);
    gps.emit(along(100), 0);
    for (let t = 1; t <= 20; t++) gps.emit(along(150, 150), t * 1000);
    expect(router.route).not.toHaveBeenCalled();
    expect(session.getState()?.notice).toBe('reroute_offline');
    expect(
      speak.mock.calls.filter(([texts]) => texts.includes('Sem rede para recalcular.')),
    ).toHaveLength(1);
    expect(speak).not.toHaveBeenCalledWith(['A recalcular a rota.']);
    // A rede volta: a posição seguinte recalcula logo, sem esperar pelo intervalo entre pedidos.
    online = true;
    gps.emit(along(150, 150), 21_000);
    expect(router.route).toHaveBeenCalledTimes(1);
    await vi.runAllTimersAsync();
    expect(session.getState()).toMatchObject({ rerouting: false, notice: null });
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

  it('com GPS impreciso diz porquê, mostra a posição e começa quando o sinal melhora', () => {
    const { session, gps, target } = setup();
    session.start(target);
    const indoors = along(50, 20);
    gps.emit(indoors, 0, { accuracy: 150.4 });
    let state = session.getState();
    expect(state?.notice).toBe('gps_weak');
    expect(state?.gpsAccuracy).toBe(150);
    expect(state?.snapshot).toBeNull();
    expect(state?.position?.lngLat).toEqual(indoors);

    gps.emit(along(60), 1000, { accuracy: 6 });
    state = session.getState();
    expect(state?.notice).toBeNull();
    expect(state?.gpsAccuracy).toBe(6);
    expect(state?.snapshot?.status).toBe('navigating');

    // Já na rota, uma posição imprecisa não tira a seta da estrada.
    const onRoad = state?.position;
    gps.emit(along(200, 300), 2000, { accuracy: 500 });
    expect(session.getState()?.notice).toBe('gps_weak');
    expect(session.getState()?.position).toEqual(onRoad);
  });

  it('parado, um "tempo esgotado" logo depois de uma posição não é falta de sinal', () => {
    const { session, gps, target } = setup();
    session.start(target);
    gps.emit(along(100), 0);
    gps.fail(3);
    expect(session.getState()?.notice).toBeNull();
    vi.advanceTimersByTime(31_000);
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

  it('avisa os reportes que ficam à frente na rota, uma vez cada', () => {
    const { session, speak, gps, target } = setup();
    session.start({
      ...target,
      alerts: [
        { id: 'p1', kind: 'police', lngLat: along(600) },
        { id: 'away', kind: 'hazard', lngLat: { lng: -9.13, lat: 38.7 } },
      ],
    });
    gps.emit(along(0), 0, { speed: 13.9 });
    expect(session.getState()?.nextAlert).toMatchObject({ kind: 'police' });
    expect(session.getState()?.nextAlert?.distance).toBeCloseTo(600, -1);
    // A ~14 m/s o aviso é dito ~25 s antes (≈ 350 m): a 300 m já é dito, uma só vez.
    gps.emit(along(300), 22_000, { speed: 13.9 });
    expect(speak.mock.calls.at(-1)?.[0]).toContain('police daqui a 300 metros.');
    speak.mockClear();
    gps.emit(along(350), 26_000, { speed: 13.9 });
    expect(speak.mock.calls.flat(2).some((text) => String(text).startsWith('police'))).toBe(false);
    gps.emit(along(700), 50_000, { speed: 13.9 });
    expect(session.getState()?.nextAlert).toBeNull();
  });
});
