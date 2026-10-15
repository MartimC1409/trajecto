import type { Report } from '@trajecto/core';
import { createMemoryStorage } from '@trajecto/core';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import type { AppConfig } from './config';
import type { MapViewProps } from './map/MapView';
import { ServicesProvider, createServices } from './services';
import { SE_LISBOA, fakeGeocoder } from './test/fakes';

const mapProps = vi.hoisted(() => ({ current: null as MapViewProps | null }));
vi.mock('./map/MapView', () => ({
  MapView: (props: MapViewProps) => {
    mapProps.current = props;
    props.onReady({ getView: () => ({ center: { lng: -9.14, lat: 38.72 }, zoom: 13 }) });
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

function setup() {
  const services = {
    ...createServices(config, { storage: createMemoryStorage(), persistent: true }),
    geocoder: fakeGeocoder(),
  };
  render(
    <ServicesProvider services={services}>
      <App config={config} />
    </ServicesProvider>,
  );
  return { services, user: userEvent.setup() };
}

async function reportAtPlace(user: ReturnType<typeof userEvent.setup>, type: string) {
  mapProps.current?.onMapClick({ lng: -9.1335, lat: 38.7099 });
  await user.click(await screen.findByRole('button', { name: 'Reportar aqui' }));
  const picker = screen.getByRole('region', { name: 'O que está na estrada?' });
  expect(within(picker).getByRole('heading', { name: 'O que está na estrada?' })).toHaveFocus();
  await user.click(within(picker).getByRole('button', { name: type }));
}

describe('Reportes', () => {
  beforeEach(() => {
    mapProps.current = null;
  });

  it('reporta num local, mostra no mapa, confirma e apaga', async () => {
    const { user, services } = setup();
    await reportAtPlace(user, 'Obras');
    expect(await screen.findByText('Obras: reporte guardado neste dispositivo.')).toBeVisible();
    const [report] = services.reports.getSnapshot().reports as [Report];
    expect(report).toMatchObject({ type: 'roadworks', lngLat: SE_LISBOA.lngLat });
    expect(mapProps.current?.reports?.map((r) => r.id)).toEqual([report.id]);

    act(() => mapProps.current?.onReportClick?.(report));
    const sheet = screen.getByRole('region', { name: 'Obras' });
    expect(sheet).toHaveTextContent('Reportado às');
    await user.click(within(sheet).getByRole('button', { name: 'Ainda lá está' }));
    expect(services.reports.getSnapshot().reports[0]?.confirmations).toBe(1);
    expect(await screen.findByText('Obrigado: o reporte fica mais tempo.')).toBeVisible();

    act(() => mapProps.current?.onReportClick?.(report));
    await user.click(screen.getByRole('button', { name: 'Já não está' }));
    expect(services.reports.getSnapshot().reports).toEqual([]);
  });

  it('fecha a escolha com Escape e respeita o interruptor da polícia', async () => {
    const { user, services } = setup();
    mapProps.current?.onMapClick({ lng: -9.1335, lat: 38.7099 });
    await user.click(await screen.findByRole('button', { name: 'Reportar aqui' }));
    expect(screen.getByRole('button', { name: 'Polícia' })).toBeVisible();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('region', { name: 'O que está na estrada?' })).toBeNull();

    services.reports.add('police', SE_LISBOA.lngLat);
    await user.click(screen.getByRole('button', { name: 'Abrir menu' }));
    const menu = screen.getByRole('complementary', { name: 'Menu' });
    await user.click(
      within(menu).getByRole('checkbox', { name: 'Mostrar e avisar reportes de polícia' }),
    );
    expect(services.preferences.getSnapshot().policeReports).toBe(false);
    expect(mapProps.current?.reports).toEqual([]);
    await user.click(within(menu).getByRole('button', { name: 'Fechar menu' }));

    await user.click(screen.getByRole('button', { name: 'Reportar aqui' }));
    expect(screen.queryByRole('button', { name: 'Polícia' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Fechar reportes' }));

    // Apagar todos os reportes a partir do menu.
    await user.click(screen.getByRole('button', { name: 'Abrir menu' }));
    await user.click(
      within(screen.getByRole('complementary', { name: 'Menu' })).getByRole('button', {
        name: 'Apagar todos os reportes',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Confirmar: apagar reportes' }));
    expect(services.reports.getSnapshot().reports).toEqual([]);
  });
});
