import type { Route, Router } from '@trajecto/core';
import { RouterError, createMemoryStorage, parseValhallaResponse } from '@trajecto/core';
import { valhallaResponse } from '@trajecto/core/testing';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import type { AppConfig } from './config';
import { LocationError } from './hooks/location';
import type { MapViewProps } from './map/MapView';
import { ServicesProvider, createServices } from './services';
import { RUA_AUGUSTA, SE_LISBOA, fakeGeocoder } from './test/fakes';

const mapProps = vi.hoisted(() => ({ current: null as MapViewProps | null }));
vi.mock('./map/MapView', () => ({
  MapView: (props: MapViewProps) => {
    mapProps.current = props;
    props.onReady({ getView: () => ({ center: { lng: -9.14, lat: 38.72 }, zoom: 13 }) });
    return <div data-testid="map" />;
  },
}));

const config: AppConfig = { geocoderUrl: '/g', routerUrl: '/r', tileJsonUrl: 'x', glyphsUrl: 'y' };
const HERE = { lng: -9.145, lat: 38.715 };
const ROUTES: Route[] = parseValhallaResponse(valhallaResponse(1), 'car');
const SLOW = { timeout: 4000 };

function setup(route: Router['route'] = async () => ROUTES, locate = async () => HERE) {
  const router = { route: vi.fn(route) };
  const services = {
    ...createServices(config, { storage: createMemoryStorage(), persistent: true }),
    geocoder: fakeGeocoder(),
    router,
    locate: vi.fn(locate),
    geolocation: undefined,
  };
  render(
    <ServicesProvider services={services}>
      <App config={config} />
    </ServicesProvider>,
  );
  return { services, router, user: userEvent.setup() };
}

async function openDirections(user: ReturnType<typeof userEvent.setup>) {
  mapProps.current?.onMapClick({ lng: -9.1335, lat: 38.7099 });
  await user.click(await screen.findByRole('button', { name: 'Direções' }));
  return screen.getByRole('region', { name: 'Direções' });
}

describe('Direções', () => {
  beforeEach(() => {
    mapProps.current = null;
  });

  it('calcula rotas a partir da localização atual e mostra-as no mapa', async () => {
    const { user, router } = setup();
    const panel = await openDirections(user);
    expect(within(panel).getByRole('heading', { name: 'Direções' })).toHaveFocus();
    const options = await within(panel).findAllByRole('button', { pressed: false }, SLOW);
    expect(router.route).toHaveBeenCalledWith(
      {
        mode: 'car',
        waypoints: [HERE, SE_LISBOA.lngLat],
        preferences: {
          avoidTolls: false,
          avoidHighways: false,
          avoidFerries: false,
          shortest: false,
        },
        time: { kind: 'now' },
        alternatives: 2,
        language: 'pt-PT',
      },
      { signal: expect.any(AbortSignal) },
    );
    expect(options.length).toBeGreaterThan(0);
    const list = within(panel)
      .getAllByRole('listitem')
      .filter((li) => li.querySelector('.route-option'));
    expect(list).toHaveLength(2);
    expect(list[0]).toHaveTextContent('2 min');
    expect(list[0]).toHaveTextContent('1,2 km');
    expect(list[0]).toHaveTextContent('Recomendada');
    expect(list[0]).toHaveTextContent('Com portagens');
    expect(list[0]).toHaveTextContent(/0,14\s€ de combustível/u);
    await waitFor(() => expect(mapProps.current?.routes).toHaveLength(2));
    expect(mapProps.current?.selected).toBeNull();
    expect(mapProps.current?.routeMarkers).toEqual([
      { lngLat: SE_LISBOA.lngLat, kind: 'destination', label: 'Destino' },
    ]);

    // Escolher a alternativa na lista e no mapa.
    await user.click(within(list[1] as HTMLElement).getByRole('button'));
    expect(mapProps.current?.selectedRoute).toBe(1);
    mapProps.current?.onRouteClick?.(0);
    await waitFor(() => expect(mapProps.current?.selectedRoute).toBe(0));

    // Passos da rota.
    await user.click(within(panel).getByRole('button', { name: 'Ver passos' }));
    expect(within(panel).getByRole('list', { name: 'Passos da rota' })).toHaveTextContent(
      'Vire à direita na Rua Alexandre Herculano.',
    );

    // Tocar no mapa não abre a ficha de um local enquanto as direções estão abertas.
    mapProps.current?.onMapClick({ lng: -9, lat: 38 });
    expect(screen.queryByRole('button', { name: 'Direções' })).toBeNull();

    await user.click(within(panel).getByRole('button', { name: 'Fechar direções' }));
    expect(screen.queryByRole('region', { name: 'Direções' })).toBeNull();
    expect(mapProps.current?.routes).toEqual([]);
  });

  it('muda o meio de transporte e as opções, guardando-os nas preferências', async () => {
    const { user, router, services } = setup();
    const panel = await openDirections(user);
    await waitFor(() => expect(router.route).toHaveBeenCalledTimes(1), SLOW);
    await user.click(within(panel).getByRole('radio', { name: 'A pé' }));
    await waitFor(() => expect(router.route).toHaveBeenCalledTimes(2), SLOW);
    expect(router.route.mock.calls[1]?.[0]).toMatchObject({ mode: 'walk' });
    expect(services.preferences.getSnapshot().travelMode).toBe('walk');

    await user.click(within(panel).getByRole('button', { name: 'Opções de rota' }));
    // A pé não há portagens nem autoestradas.
    expect(within(panel).queryByRole('checkbox', { name: 'Evitar portagens' })).toBeNull();
    await user.click(within(panel).getByRole('checkbox', { name: 'Evitar ferries' }));
    await waitFor(() => expect(router.route).toHaveBeenCalledTimes(3), SLOW);
    expect(router.route.mock.calls[2]?.[0]).toMatchObject({
      preferences: expect.objectContaining({ avoidFerries: true }),
    });
    expect(services.preferences.getSnapshot().routePreferences.avoidFerries).toBe(true);

    await user.click(within(panel).getByRole('radio', { name: 'Partir às' }));
    expect(within(panel).getByText(/não são calculadas rotas alternativas/u)).toBeVisible();
    await waitFor(() => expect(router.route).toHaveBeenCalledTimes(4), SLOW);
    expect(router.route.mock.calls[3]?.[0].time).toMatchObject({ kind: 'depart' });
    const input = within(panel).getByLabelText('Data e hora');
    fireEvent.change(input, { target: { value: '2026-10-20T08:30' } });
    await waitFor(
      () =>
        expect(router.route.mock.calls.at(-1)?.[0].time).toEqual({
          kind: 'depart',
          value: '2026-10-20T08:30',
        }),
      SLOW,
    );
    await waitFor(
      () => expect(within(panel).getAllByText(/Chegada às 08:3[0-9]/u)[0]).toBeVisible(),
      SLOW,
    );
    await user.click(within(panel).getByRole('radio', { name: 'Chegar às' }));
    await waitFor(
      () => expect(within(panel).getAllByText(/Partida às 08:2[0-9]/u)[0]).toBeVisible(),
      SLOW,
    );
    await user.click(within(panel).getByRole('radio', { name: 'Partir agora' }));
    await waitFor(
      () => expect(router.route.mock.calls.at(-1)?.[0].time).toEqual({ kind: 'now' }),
      SLOW,
    );
  }, 30_000);

  it('permite escolher outra partida, paragens e trocar os pontos', async () => {
    const { user, router } = setup();
    const panel = await openDirections(user);
    await user.click(within(panel).getByRole('button', { name: /^Alterar partida/u }));
    await user.type(within(panel).getByRole('combobox', { name: 'Pesquisar partida' }), 'augusta');
    await user.click(await within(panel).findByRole('option', { name: /Rua Augusta/u }));
    await waitFor(
      () =>
        expect(router.route.mock.calls.at(-1)?.[0].waypoints).toEqual([
          RUA_AUGUSTA.lngLat,
          SE_LISBOA.lngLat,
        ]),
      SLOW,
    );
    expect(await within(panel).findByRole('button', { name: 'Iniciar' }, SLOW)).toBeDisabled();
    expect(within(panel).getByText(/a partida tem de ser a tua localização/u)).toBeVisible();
    expect(mapProps.current?.routeMarkers?.map((m) => m.kind)).toEqual(['origin', 'destination']);

    await user.click(within(panel).getByRole('button', { name: 'Adicionar paragem' }));
    await user.type(within(panel).getByRole('combobox'), 'augusta');
    await user.click(await within(panel).findByRole('option', { name: /Sé de Lisboa/u }));
    expect(within(panel).getByText('Paragem 1')).toBeVisible();
    await waitFor(
      () => expect(router.route.mock.calls.at(-1)?.[0].waypoints).toHaveLength(3),
      SLOW,
    );

    await user.click(within(panel).getByRole('button', { name: 'Trocar partida e destino' }));
    await waitFor(
      () =>
        expect(router.route.mock.calls.at(-1)?.[0].waypoints).toEqual([
          SE_LISBOA.lngLat,
          SE_LISBOA.lngLat,
          RUA_AUGUSTA.lngLat,
        ]),
      SLOW,
    );
    await user.click(within(panel).getByRole('button', { name: /^Remover paragem 1/u }));
    expect(within(panel).queryByText('Paragem 1')).toBeNull();

    // Voltar a usar a localização atual no destino.
    await user.click(within(panel).getByRole('button', { name: /^Alterar destino/u }));
    await user.click(within(panel).getByRole('button', { name: 'Usar a minha localização' }));
    expect(within(panel).getAllByText('A minha localização')).toHaveLength(1);
    await user.click(within(panel).getByRole('button', { name: /^Alterar destino/u }));
    await user.click(within(panel).getByRole('button', { name: 'Cancelar' }));
    expect(within(panel).queryByRole('combobox')).toBeNull();
  }, 30_000);

  it('mostra erros do serviço de rotas e da localização', async () => {
    const first = setup(async () => {
      throw new RouterError('no_route', 'x', 400);
    });
    const panel = await openDirections(first.user);
    expect(
      await within(panel).findByText(/Não foi encontrado um caminho/u, {}, SLOW),
    ).toBeVisible();
    expect(within(panel).queryByRole('button', { name: 'Iniciar' })).toBeNull();
  });

  it('avisa quando não há acesso à localização', async () => {
    const { user } = setup(undefined, async () => {
      throw new LocationError('location_denied');
    });
    const panel = await openDirections(user);
    expect(await within(panel).findByText(/Sem acesso à localização/u, {}, SLOW)).toBeVisible();
  });

  it('simula a navegação e volta às direções ao terminar', async () => {
    const { user } = setup();
    const panel = await openDirections(user);
    await user.click(await within(panel).findByRole('button', { name: 'Simular' }, SLOW));
    const nav = screen.getByRole('region', { name: 'Navegação' });
    expect(within(nav).getByRole('heading', { name: 'Navegação' })).toHaveFocus();
    expect(nav).toHaveTextContent('Vire à direita na Rua Alexandre Herculano.');
    expect(nav).toHaveTextContent('Simulação');
    expect(screen.queryByRole('search')).toBeNull();
    expect(panel).not.toBeVisible();
    expect(mapProps.current?.navigation).toMatchObject({ follow: true, mode: 'car' });
    expect(mapProps.current?.routes).toHaveLength(1);

    // Mover o mapa à mão deixa de o seguir; "Recentrar" volta a seguir.
    mapProps.current?.onUserMove?.();
    await user.click(await within(nav).findByRole('button', { name: 'Recentrar' }));
    expect(mapProps.current?.navigation?.follow).toBe(true);

    await user.click(within(nav).getByRole('button', { name: 'Velocidade da simulação: 4×' }));
    expect(
      within(nav).getByRole('button', { name: 'Velocidade da simulação: 4×' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(nav).getByRole('button', { name: 'Terminar' }));
    expect(screen.queryByRole('region', { name: 'Navegação' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Direções' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Direções' })).toHaveFocus();
    expect(mapProps.current?.navigation).toBeNull();
  });
});
