import type { TransitPlanner } from '@trajecto/core';
import { TransitError, createMemoryStorage } from '@trajecto/core';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import type { AppConfig } from './config';
import { formatClock } from './format';
import { LocationError } from './hooks/location';
import type { MapViewProps } from './map/MapView';
import { ServicesProvider, createServices } from './services';
import { SE_LISBOA, fakeGeocoder } from './test/fakes';
import { TRANSIT_ITINERARIES } from './test/transit';

const mapProps = vi.hoisted(() => ({ current: null as MapViewProps | null }));
vi.mock('./map/MapView', () => ({
  MapView: (props: MapViewProps) => {
    mapProps.current = props;
    props.onReady({
      getView: () => ({ center: { lng: -9.14, lat: 38.72 }, zoom: 13 }),
      getBounds: () => [-9.15, 38.71, -9.13, 38.73],
    });
    return <div data-testid="map" />;
  },
}));

const config: AppConfig = {
  geocoderUrl: '/g',
  routerUrl: '/r',
  weatherUrl: '/w',
  transitUrl: '/t',
  speedCamerasUrl: '/c',
  tileJsonUrl: 'x',
  reliefTilesUrl: 'r',
  glyphsUrl: 'y',
};
const HERE = { lng: -9.145, lat: 38.715 };
const SLOW = { timeout: 4000 };
const clock = (ms: number) => formatClock(new Date(ms), 'pt-PT');

function setup(
  plan: TransitPlanner['plan'] = async () => TRANSIT_ITINERARIES,
  locate = async () => HERE,
) {
  const transit = { plan: vi.fn(plan) };
  const router = { route: vi.fn(async () => []) };
  const services = {
    ...createServices(config, { storage: createMemoryStorage(), persistent: true }),
    geocoder: fakeGeocoder(),
    router,
    transit,
    locate: vi.fn(locate),
    geolocation: undefined,
  };
  render(
    <ServicesProvider services={services}>
      <App config={config} />
    </ServicesProvider>,
  );
  return { services, transit, router, user: userEvent.setup() };
}

async function openTransit(user: ReturnType<typeof userEvent.setup>) {
  mapProps.current?.onMapClick({ lng: -9.1335, lat: 38.7099 });
  await user.click(await screen.findByRole('button', { name: 'Direções' }));
  const panel = screen.getByRole('region', { name: 'Direções' });
  await user.click(within(panel).getByRole('radio', { name: 'Transportes públicos' }));
  return panel;
}

function optionItems(panel: HTMLElement): HTMLElement[] {
  return within(panel)
    .getAllByRole('listitem')
    .filter((li) => li.querySelector('.route-option'));
}

describe('Transportes públicos', () => {
  beforeEach(() => {
    mapProps.current = null;
  });

  it('mostra as ligações, os passos com atrasos e o itinerário escolhido no mapa', async () => {
    const { user, transit, services } = setup();
    const panel = await openTransit(user);
    expect(services.preferences.getSnapshot().publicTransport).toBe(true);
    await waitFor(() => expect(transit.plan).toHaveBeenCalledTimes(1), SLOW);
    expect(transit.plan).toHaveBeenCalledWith(
      { from: HERE, to: SE_LISBOA.lngLat },
      { signal: expect.any(AbortSignal) },
    );

    const [first, second, third] = optionItems(panel);
    const [a, b, c] = TRANSIT_ITINERARIES;
    if (!a || !b || !c) throw new Error('fixture');
    expect(first).toHaveTextContent('25 min');
    expect(first).toHaveTextContent(`${clock(a.start)} – ${clock(a.end)}`);
    expect(first).toHaveTextContent('Sem transbordos · 350 m a pé');
    expect(first).toHaveTextContent('MetroVd');
    expect(within(first as HTMLElement).getByRole('button')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // Troços a pé com menos de 1 minuto não aparecem no resumo.
    expect(second).not.toHaveTextContent('A pé');
    expect(third).toHaveTextContent('1 transbordo');

    const steps = within(panel).getByRole('list', { name: 'Passos da ligação' });
    expect(steps).toHaveTextContent('Sentido Telheiras');
    expect(steps).toHaveTextContent(`${clock(a.start + 6 * 60_000)} Entrar em Rossio · Cais 1`);
    expect(steps).toHaveTextContent('Sair em Alvalade');
    expect(steps).toHaveTextContent('7 paragens · 16 min · Metropolitano de Lisboa');
    expect(steps).toHaveTextContent(
      `Atraso de 2 minutos (previsto às ${clock(a.start + 4 * 60_000)})`,
    );
    // O fim usa o nome do destino escolhido (e não o nome que o serviço dá ao ponto).
    expect(steps).toHaveTextContent('A pé até Sé de Lisboa');
    expect(steps).not.toHaveTextContent('END');

    // O mapa recebe o itinerário depois do painel (efeito → estado da App → nova renderização).
    await waitFor(() => expect(mapProps.current?.transit).toBe(a));
    expect(mapProps.current?.routes).toEqual([]);
    // Sem navegação passo a passo nos transportes públicos.
    expect(within(panel).queryByRole('button', { name: 'Iniciar' })).toBeNull();
    expect(within(panel).getByRole('link', { name: /Transitous/u })).toHaveAttribute(
      'href',
      'https://transitous.org/sources/',
    );

    // Autocarro só com horário e cores sem contraste: o texto passa a preto.
    await user.click(within(second as HTMLElement).getByRole('button'));
    await waitFor(() => expect(mapProps.current?.transit).toBe(b));
    expect(within(panel).getByRole('list', { name: 'Passos da ligação' })).toHaveTextContent(
      'Hora do horário (sem tempo real)',
    );
    const badge = (second as HTMLElement).querySelector<HTMLElement>('.line-badge');
    expect(badge?.style.color).toBe('rgb(0, 0, 0)');
    expect(badge?.style.background).toContain('rgb(255, 204, 0)');

    await user.click(within(third as HTMLElement).getByRole('button'));
    const thirdSteps = within(panel).getByRole('list', { name: 'Passos da ligação' });
    expect(thirdSteps).toHaveTextContent('Cancelado');
    expect(thirdSteps).toHaveTextContent('A horas (tempo real)');

    await user.click(within(panel).getByRole('button', { name: 'Fechar direções' }));
    await waitFor(() => expect(mapProps.current?.transit).toBeNull());
  });

  it('só a hora entra nas opções; "Chegar às" pede a hora de chegada', async () => {
    const { user, transit } = setup();
    const panel = await openTransit(user);
    await waitFor(() => expect(transit.plan).toHaveBeenCalledTimes(1), SLOW);
    await user.click(within(panel).getByRole('button', { name: 'Opções de rota' }));
    expect(within(panel).queryByRole('checkbox')).toBeNull();
    expect(within(panel).queryByRole('button', { name: 'Adicionar paragem' })).toBeNull();
    await user.click(within(panel).getByRole('radio', { name: 'Chegar às' }));
    await waitFor(() => expect(transit.plan).toHaveBeenCalledTimes(2), { timeout: 6000 });
    const request = transit.plan.mock.calls[1]?.[0];
    expect(request).toMatchObject({ arriveBy: true });
    // Hora local do campo (próximos 5 minutos certos), em milissegundos.
    expect(request?.time).toBeGreaterThan(Date.now());
    expect((request?.time ?? 0) % 300_000).toBe(0);
  }, 10_000);

  it('volta ao carro, sem itinerário no mapa e sem as paragens ignoradas', async () => {
    const { user, transit, router, services } = setup();
    mapProps.current?.onMapClick({ lng: -9.1335, lat: 38.7099 });
    await user.click(await screen.findByRole('button', { name: 'Direções' }));
    const panel = screen.getByRole('region', { name: 'Direções' });
    // Uma paragem no carro.
    await user.click(within(panel).getByRole('button', { name: 'Adicionar paragem' }));
    await user.type(within(panel).getByRole('combobox'), 'Rua');
    await user.click(await within(panel).findByRole('option', { name: /Rua Augusta/u }, SLOW));
    await waitFor(() => expect(mapProps.current?.routeMarkers).toHaveLength(2));

    await user.click(within(panel).getByRole('radio', { name: 'Transportes públicos' }));
    expect(within(panel).getByText('As paragens não são usadas nos transportes públicos.'));
    await waitFor(() => expect(mapProps.current?.routeMarkers).toHaveLength(1));
    await waitFor(() => expect(mapProps.current?.transit).toBeTruthy(), SLOW);
    expect(transit.plan).toHaveBeenCalledTimes(1);

    await user.click(within(panel).getByRole('radio', { name: 'Carro' }));
    expect(services.preferences.getSnapshot().publicTransport).toBe(false);
    expect(services.preferences.getSnapshot().travelMode).toBe('car');
    await waitFor(() => expect(mapProps.current?.transit).toBeNull());
    await waitFor(() => expect(router.route).toHaveBeenCalled(), SLOW);
    expect(within(panel).queryByRole('list', { name: 'Passos da ligação' })).toBeNull();
  });

  it.each([
    [new TransitError('no_route', 'x'), /Não foram encontradas ligações de transportes/u],
    [new TransitError('rate_limited', 'x'), /Aguarda um minuto/u],
    [new Error('inesperado'), /Transitous\) está indisponível/u],
  ])('mostra erros do serviço (%#)', async (error, message) => {
    const { user } = setup(async () => {
      throw error;
    });
    const panel = await openTransit(user);
    expect(await within(panel).findByText(message, {}, SLOW)).toBeVisible();
    expect(mapProps.current?.transit).toBeNull();
  });

  it('sem acesso à localização, diz como resolver', async () => {
    const { user, transit } = setup(undefined, async () => {
      throw new LocationError('location_denied');
    });
    const panel = await openTransit(user);
    expect(await within(panel).findByText(/Sem acesso à localização/u, {}, SLOW)).toBeVisible();
    expect(transit.plan).not.toHaveBeenCalled();
  });
});
