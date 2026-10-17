import type { BBox, Geocoder, OfflineArea } from '@trajecto/core';
import {
  OFFLINE_AREAS_STORAGE_KEY,
  countTiles,
  createMemoryStorage,
  createOfflineAreasStore,
} from '@trajecto/core';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { useOfflineAreas } from '../hooks/useOfflineAreas';
import { createMapResources } from '../offline/mapResources';
import { createCacheTileStore } from '../offline/tileStore';
import { createFakeCacheStorage } from '../test/fakeCaches';
import { SE_LISBOA } from '../test/fakes';
import { OfflineMaps } from './OfflineMaps';

const ORIGIN = 'https://trajecto.test';
/** Alguns quarteirões da Baixa (18 tiles do zoom 0 ao 14). */
const SMALL: BBox = [-9.14, 38.708, -9.135, 38.712];
const TILES = countTiles(SMALL);

interface SetupOptions {
  bounds?: BBox | undefined;
  supported?: boolean;
  apple?: boolean;
  persisted?: boolean;
  reverse?: Geocoder['reverse'];
  tileFetch?: typeof fetch;
}

function setup(options: SetupOptions = {}) {
  const caches = createFakeCacheStorage();
  const storage = createMemoryStorage();
  const offlineAreas = createOfflineAreasStore({ storage });
  const offlineTiles = options.supported === false ? null : createCacheTileStore(caches, ORIGIN);
  const glyphFetch = vi.fn(async () => new Response(new Uint8Array([1])));
  const services = {
    offlineAreas,
    offlineTiles,
    mapResources: createMapResources({
      tileJsonUrl: 'https://ofm.test/planet',
      glyphsUrl: 'https://ofm.test/fonts/{fontstack}/{range}.pbf',
      store: offlineTiles ?? createCacheTileStore(caches, ORIGIN),
      caches,
      areas: () => offlineAreas.getSnapshot().areas,
      fetch: glyphFetch,
      origin: ORIGIN,
    }),
  };
  const tileFetch = vi.fn(
    options.tileFetch ?? (async () => new Response(new Uint8Array([31, 139, 8, 0]))),
  );
  const storageManager = {
    estimate: async () => ({ usage: 12_300_000, quota: 2_000_000_000 }),
    persisted: async () => options.persisted ?? false,
    persist: vi.fn(async () => true),
  } as unknown as StorageManager;
  const geocoder = {
    reverse: vi.fn(options.reverse ?? (async () => SE_LISBOA)),
  };
  const onShowArea = vi.fn();
  const bounds = 'bounds' in options ? options.bounds : SMALL;

  function Harness() {
    const api = useOfflineAreas(services, { fetch: tileFetch, storageManager });
    return (
      <OfflineMaps
        api={api}
        getBounds={() => bounds}
        geocoder={geocoder}
        onShowArea={onShowArea}
        appleDevice={options.apple ?? false}
      />
    );
  }
  render(<Harness />);
  return {
    user: userEvent.setup(),
    offlineAreas,
    offlineTiles,
    tileFetch,
    geocoder,
    onShowArea,
    storage,
    storageManager,
  };
}

describe('Mapas offline (menu)', () => {
  it('sem suporte do browser, explica que não é possível', () => {
    setup({ supported: false });
    expect(screen.getByText(/não permite guardar mapas/u)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Guardar esta zona' })).toBeNull();
  });

  it.each([
    [undefined, /Abre o mapa/u],
    [[-9.6, 36.9, -6.1, 42.2] as BBox, /grande demais.*Aproxima o mapa/u],
    [[2.2, 48.8, 2.5, 48.9] as BBox, /Portugal e Espanha/u],
    [[-9, 38, -10, 39] as BBox, /Abre o mapa/u],
  ])('zona que não se pode guardar (%#)', (bounds, message) => {
    setup({ bounds });
    expect(screen.getByText(message)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Guardar esta zona' })).toBeDisabled();
  });

  it('guarda a zona visível com o nome da localidade e mostra-a na lista', async () => {
    const { user, offlineAreas, offlineTiles, tileFetch, storageManager, onShowArea } = setup();
    expect(screen.getByText(/Zona no ecrã: cerca de \d/u)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Guardar esta zona' }));
    expect(
      await screen.findByText('«Lisboa» está guardada: o mapa desta zona funciona sem rede.'),
    ).toBeVisible();
    expect(tileFetch).toHaveBeenCalledTimes(TILES);
    expect(storageManager.persist).toHaveBeenCalled();
    const [area] = offlineAreas.getSnapshot().areas;
    expect(area).toMatchObject({ name: 'Lisboa', tiles: TILES, complete: true, bbox: SMALL });
    expect(await offlineTiles?.has({ z: 0, x: 0, y: 0 })).toBe(true);

    const list = screen.getByRole('list', { name: 'Zonas guardadas' });
    expect(within(list).getByText('Lisboa')).toBeVisible();
    expect(within(list).queryByRole('button', { name: 'Continuar' })).toBeNull();
    await user.click(within(list).getByRole('button', { name: 'Ver no mapa' }));
    expect(onShowArea).toHaveBeenCalledWith(SMALL);
    expect(
      await screen.findByText(/Espaço usado por esta app: 12 MB de 2 GB disponíveis/u),
    ).toBeVisible();
    expect(screen.getByText(/O browser pode apagar os mapas/u)).toBeVisible();

    // Apagar: a zona sai da lista e os tiles saem do dispositivo.
    await user.click(within(list).getByRole('button', { name: 'Apagar' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar: apagar Lisboa' }));
    await waitFor(() => expect(offlineAreas.getSnapshot().areas).toEqual([]));
    await waitFor(async () => expect(await offlineTiles?.has({ z: 0, x: 0, y: 0 })).toBe(false));
    expect(screen.queryByRole('list', { name: 'Zonas guardadas' })).toBeNull();
  });

  it('sem nome da localidade (sem rede), usa "Zona N"; no iPhone sugere o ecrã principal', async () => {
    const { user, offlineAreas } = setup({
      apple: true,
      reverse: async () => {
        throw new TypeError('offline');
      },
    });
    await user.click(screen.getByRole('button', { name: 'Guardar esta zona' }));
    expect(await screen.findByText(/«Zona 1» está guardada/u)).toBeVisible();
    expect(offlineAreas.getSnapshot().areas[0]?.name).toBe('Zona 1');
    expect(await screen.findByText(/adiciona o Trajecto ao ecrã principal/u)).toBeVisible();
  });

  it('cancelar deixa a zona incompleta; "Continuar" acaba-a sem repetir o que já tinha', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    const { user, offlineAreas, tileFetch } = setup({
      persisted: true,
      tileFetch: async (_input, init) => {
        calls += 1;
        if (calls > 4) {
          await gate;
          if (init?.signal?.aborted) throw new DOMException('x', 'AbortError');
        }
        return new Response(null, { status: 204 });
      },
    });
    await user.click(screen.getByRole('button', { name: 'Guardar esta zona' }));
    const cancel = await screen.findByRole('button', { name: 'Cancelar' });
    expect(screen.getByRole('progressbar')).toBeVisible();
    expect(screen.getByText(/A guardar «Lisboa»: \d+ %/u)).toBeVisible();
    await user.click(cancel);
    release();
    expect(await screen.findByText(/Cancelado\. O que já foi guardado fica/u)).toBeVisible();
    const [area] = offlineAreas.getSnapshot().areas as OfflineArea[];
    expect(area?.complete).toBe(false);
    expect(screen.getByText(/incompleta/u)).toBeVisible();
    // Armazenamento persistente: sem aviso de que o browser pode apagar.
    expect(screen.queryByText(/O browser pode apagar/u)).toBeNull();

    tileFetch.mockClear();
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByText(/«Lisboa» está guardada/u)).toBeVisible();
    expect(tileFetch.mock.calls.length).toBeLessThan(TILES);
    expect(offlineAreas.getSnapshot().areas[0]).toMatchObject({ complete: true, tiles: TILES });
  });

  it('falha da rede: a zona fica incompleta com a explicação', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { user } = setup({
        tileFetch: async () => new Response('erro', { status: 400 }),
      });
      await user.click(screen.getByRole('button', { name: 'Guardar esta zona' }));
      expect(await screen.findByText(/parou \(sem rede ou serviço indisponível\)/u)).toBeVisible();
    } finally {
      vi.useRealTimers();
    }
  });

  it('zonas guardadas de antes aparecem e a lista mostra o estado', () => {
    const storage = createMemoryStorage({
      [OFFLINE_AREAS_STORAGE_KEY]: JSON.stringify({
        version: 1,
        areas: [
          {
            id: 'x',
            name: 'Porto',
            bbox: [-8.62, 41.14, -8.6, 41.16],
            minZoom: 0,
            maxZoom: 14,
            tiles: 10,
            bytes: 1_500_000,
            version: 'latest',
            createdAt: Date.UTC(2026, 9, 16),
            complete: false,
          },
        ],
      }),
    });
    expect(createOfflineAreasStore({ storage }).getSnapshot().areas).toHaveLength(1);
  });
});
