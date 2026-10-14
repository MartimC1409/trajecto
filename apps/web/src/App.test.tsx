import type { LngLat } from '@trajecto/core';
import { GeocoderError, createMemoryStorage } from '@trajecto/core';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import type { AppConfig } from './config';
import type { MapViewProps } from './map/MapView';
import { ServicesProvider, createServices } from './services';
import { RUA_AUGUSTA, SE_LISBOA, fakeGeocoder } from './test/fakes';

// O mapa real precisa de WebGL; aqui usamos um substituto que expõe as mesmas propriedades.
const mapProps = vi.hoisted(() => ({ current: null as MapViewProps | null }));
vi.mock('./map/MapView', () => ({
  MapView: (props: MapViewProps) => {
    mapProps.current = props;
    props.onReady({ getView: () => ({ center: { lng: -9.14, lat: 38.72 }, zoom: 13 }) });
    return <div data-testid="map" data-theme={props.theme} />;
  },
}));

const config: AppConfig = { geocoderUrl: '/g', tileJsonUrl: 'x', glyphsUrl: 'y' };

function setup() {
  const storage = createMemoryStorage();
  const services = {
    ...createServices(config, { storage, persistent: true }),
    geocoder: fakeGeocoder(),
  };
  render(
    <ServicesProvider services={services}>
      <App config={config} />
    </ServicesProvider>,
  );
  return { services, storage, user: userEvent.setup() };
}

function clickMap(lngLat: LngLat) {
  mapProps.current?.onMapClick(lngLat);
}

describe('App', () => {
  beforeEach(() => {
    mapProps.current = null;
  });

  it('escolher um resultado mostra o local, centra o mapa e guarda no histórico', async () => {
    const { user, services } = setup();
    await user.type(screen.getByRole('combobox'), 'augusta');
    await user.click(await screen.findByRole('option', { name: /Rua Augusta/ }));
    expect(screen.getByRole('region', { name: 'Rua Augusta' })).toBeVisible();
    expect(mapProps.current?.focus).toMatchObject({ seq: 1, bbox: RUA_AUGUSTA.bbox });
    expect(mapProps.current?.selected).toEqual(RUA_AUGUSTA.lngLat);
    expect(services.places.getSnapshot().history[0]?.place.id).toBe(RUA_AUGUSTA.id);
  });

  it('não guarda histórico quando está desligado', async () => {
    const { user, services } = setup();
    services.preferences.set('historyEnabled', false);
    await user.type(screen.getByRole('combobox'), 'augusta');
    await user.click(await screen.findByRole('option', { name: /Rua Augusta/ }));
    expect(services.places.getSnapshot().history).toEqual([]);
  });

  it('clicar no mapa procura a morada e permite guardar como Casa', async () => {
    const { user, services } = setup();
    clickMap({ lng: -9.1335, lat: 38.7099 });
    expect(await screen.findByRole('heading', { name: 'Sé de Lisboa' })).toBeVisible();
    expect(services.geocoder.reverse).toHaveBeenCalledWith(
      { lng: -9.1335, lat: 38.7099 },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    await user.click(screen.getByRole('button', { name: 'Casa' }));
    expect(screen.getByRole('button', { name: 'Casa' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Guardado como Casa.')).toBeVisible();
    // O marcador de Casa substitui o marcador do local selecionado.
    expect(mapProps.current?.selected).toBeNull();
    expect(services.places.getSnapshot().favorites[0]).toMatchObject({ kind: 'home' });
    await user.click(screen.getByRole('button', { name: 'Casa' }));
    expect(services.places.getSnapshot().favorites).toEqual([]);
    expect(screen.getByText('Removido dos favoritos.')).toBeVisible();
  });

  it('ponto sem morada e erro na geocodificação inversa', async () => {
    const { services } = setup();
    vi.mocked(services.geocoder.reverse).mockResolvedValueOnce(null);
    clickMap({ lng: -9, lat: 38 });
    expect(await screen.findByText('Não encontrámos uma morada para este ponto.')).toBeVisible();
    vi.mocked(services.geocoder.reverse).mockRejectedValueOnce(
      new GeocoderError('rate_limited', 'x'),
    );
    clickMap({ lng: -9.5, lat: 38.5 });
    expect(await screen.findByRole('alert')).toHaveTextContent('Demasiadas pesquisas seguidas');
  });

  it('só a última geocodificação inversa conta', async () => {
    const { services } = setup();
    let resolveFirst: (value: typeof SE_LISBOA) => void = () => undefined;
    vi.mocked(services.geocoder.reverse)
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce(RUA_AUGUSTA);
    clickMap({ lng: -9, lat: 38 });
    clickMap({ lng: -9.1, lat: 38.1 });
    expect(await screen.findByRole('heading', { name: 'Rua Augusta' })).toBeVisible();
    resolveFirst(SE_LISBOA);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole('heading', { name: 'Sé de Lisboa' })).toBeNull();
  });

  it('"Que sítio é este?" usa o centro do mapa', async () => {
    const { user, services } = setup();
    await user.click(screen.getByRole('button', { name: /Que sítio é este/ }));
    expect(services.geocoder.reverse).toHaveBeenCalledWith(
      { lng: -9.14, lat: 38.72 },
      expect.anything(),
    );
    await user.click(await screen.findByRole('button', { name: 'Fechar' }));
    expect(screen.queryByRole('heading', { name: 'Sé de Lisboa' })).toBeNull();
  });

  it('o menu lista favoritos e histórico, e permite apagar', async () => {
    const { user, services } = setup();
    services.places.setSpecial('work', SE_LISBOA);
    services.places.addFavorite(RUA_AUGUSTA);
    services.places.addToHistory(RUA_AUGUSTA);
    const menuButton = screen.getByRole('button', { name: 'Abrir menu' });
    await user.click(menuButton);
    const menu = screen.getByRole('complementary', { name: 'Menu' });
    expect(within(menu).getByRole('heading', { name: 'Menu' })).toHaveFocus();
    expect(menuButton).toHaveAttribute('aria-expanded', 'true');

    await user.click(within(menu).getByRole('button', { name: 'Remover Rua Augusta' }));
    expect(services.places.getSnapshot().favorites.map((f) => f.kind)).toEqual(['work']);

    await user.click(within(menu).getByRole('button', { name: 'Apagar Rua Augusta do histórico' }));
    expect(services.places.getSnapshot().history).toEqual([]);
    expect(within(menu).getByText('O histórico está vazio.')).toBeVisible();

    await user.click(within(menu).getByRole('button', { name: /Mostrar Trabalho: Sé de Lisboa/ }));
    expect(screen.getByRole('region', { name: 'Sé de Lisboa' })).toBeVisible();
    expect(screen.queryByRole('complementary', { name: 'Menu' })).toBeNull();
    expect(menuButton).toHaveFocus();
  });

  it('apagar todo o histórico exige confirmação', async () => {
    const { user, services } = setup();
    services.places.addToHistory(RUA_AUGUSTA);
    await user.click(screen.getByRole('button', { name: 'Abrir menu' }));
    await user.click(screen.getByRole('button', { name: 'Apagar todo o histórico' }));
    expect(services.places.getSnapshot().history).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await user.click(screen.getByRole('button', { name: 'Apagar todo o histórico' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar: apagar histórico' }));
    expect(services.places.getSnapshot().history).toEqual([]);
  });

  it('definições: tema, língua, histórico e apagar tudo', async () => {
    const { user, services } = setup();
    services.places.addFavorite(RUA_AUGUSTA);
    await user.click(screen.getByRole('button', { name: 'Abrir menu' }));

    await user.click(screen.getByRole('radio', { name: 'Escuro' }));
    expect(screen.getByTestId('map')).toHaveAttribute('data-theme', 'dark');
    expect(document.documentElement.dataset.theme).toBe('dark');

    await user.click(screen.getByRole('checkbox', { name: 'Guardar histórico de pesquisas' }));
    expect(services.preferences.getSnapshot().historyEnabled).toBe(false);
    expect(screen.getByText('O histórico está desligado nas definições.')).toBeVisible();

    await user.click(screen.getByRole('radio', { name: 'English' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Settings' })).toBeVisible());
    expect(document.documentElement.lang).toBe('en');

    await user.click(screen.getByRole('button', { name: 'Delete all my data' }));
    await user.click(screen.getByRole('button', { name: 'Confirm: delete everything' }));
    await waitFor(() => expect(document.documentElement.lang).toBe('pt-PT'));
    expect(services.places.getSnapshot().favorites).toEqual([]);
    expect(services.preferences.getSnapshot().theme).toBe('system');
  });

  it('Escape fecha o menu e devolve o foco ao botão', async () => {
    const { user } = setup();
    const menuButton = screen.getByRole('button', { name: 'Abrir menu' });
    await user.click(menuButton);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(menuButton).toHaveFocus();
  });

  it('clicar num favorito no mapa mostra-o sem o guardar no histórico', () => {
    const { services } = setup();
    mapProps.current?.onFavoriteClick({ id: 'f', kind: 'other', place: SE_LISBOA, createdAt: 1 });
    return waitFor(() => {
      expect(screen.getByRole('region', { name: 'Sé de Lisboa' })).toBeVisible();
      expect(services.places.getSnapshot().history).toEqual([]);
    });
  });

  it('guarda a vista do mapa', () => {
    const { services } = setup();
    mapProps.current?.onViewChange({ center: { lng: -8.61, lat: 41.15 }, zoom: 11 });
    expect(services.preferences.getSnapshot().lastView).toEqual({
      center: { lng: -8.61, lat: 41.15 },
      zoom: 11,
    });
  });

  it('avisa quando não é possível guardar dados', async () => {
    const storage = createMemoryStorage();
    storage.setItem = () => {
      throw new DOMException('Quota', 'QuotaExceededError');
    };
    const services = {
      ...createServices(config, { storage, persistent: true }),
      geocoder: fakeGeocoder(),
    };
    render(
      <ServicesProvider services={services}>
        <App config={config} />
      </ServicesProvider>,
    );
    services.places.addFavorite(RUA_AUGUSTA);
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível guardar dados');
  });

  it('avisa desde o início quando o browser bloqueia o armazenamento', () => {
    const services = {
      ...createServices(config, { storage: createMemoryStorage(), persistent: false }),
      geocoder: fakeGeocoder(),
    };
    render(
      <ServicesProvider services={services}>
        <App config={config} />
      </ServicesProvider>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível guardar dados');
  });
});
