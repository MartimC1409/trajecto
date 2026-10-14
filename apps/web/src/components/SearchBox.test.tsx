import type { Place } from '@trajecto/core';
import { GeocoderError } from '@trajecto/core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RUA_AUGUSTA, SE_LISBOA, fakeGeocoder, makePlace } from '../test/fakes';
import { SearchBox } from './SearchBox';

function setup(overrides: Partial<Parameters<typeof SearchBox>[0]> = {}) {
  const geocoder = overrides.geocoder ?? fakeGeocoder();
  const onSelect = vi.fn();
  const getBias = vi.fn(() => ({ lngLat: { lng: -9.14, lat: 38.72 }, zoom: 13 }));
  render(
    <SearchBox
      geocoder={geocoder}
      getBias={getBias}
      favorites={[]}
      recent={[]}
      onSelect={onSelect}
      {...overrides}
    />,
  );
  return { geocoder, onSelect, getBias, input: screen.getByRole('combobox') };
}

describe('SearchBox', () => {
  it('tem nome acessível e começa fechada', () => {
    const { input } = setup();
    expect(input).toHaveAccessibleName('Pesquisar moradas e locais');
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  it('pede pelo menos 3 letras antes de pesquisar', async () => {
    const user = userEvent.setup();
    const { input, geocoder } = setup();
    await user.type(input, 'ru');
    expect(screen.getByRole('status')).toHaveTextContent('Escreve pelo menos 3 letras.');
    expect(geocoder.search).not.toHaveBeenCalled();
  });

  it('pesquisa uma só vez depois de parar de escrever, com foco no mapa', async () => {
    const user = userEvent.setup();
    const { input, geocoder, getBias } = setup();
    await user.type(input, 'rua augusta');
    expect(await screen.findByRole('option', { name: /Rua Augusta/ })).toBeVisible();
    expect(geocoder.search).toHaveBeenCalledTimes(1);
    expect(geocoder.search).toHaveBeenCalledWith(
      'rua augusta',
      expect.objectContaining({ bias: { lngLat: { lng: -9.14, lat: 38.72 }, zoom: 13 } }),
    );
    expect(getBias).toHaveBeenCalledTimes(1);
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('2 resultados');
  });

  it('navega com as setas e escolhe com Enter', async () => {
    const user = userEvent.setup();
    const { input, onSelect } = setup();
    await user.type(input, 'lisboa');
    await screen.findAllByRole('option');
    await user.keyboard('{ArrowDown}{ArrowDown}');
    const active = screen.getByRole('option', { selected: true });
    expect(active).toHaveTextContent('Sé de Lisboa');
    expect(input).toHaveAttribute('aria-activedescendant', active.id);
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(screen.getByRole('option', { selected: true })).toHaveTextContent('Sé de Lisboa');
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith(SE_LISBOA);
    expect(input).toHaveValue('Sé de Lisboa');
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  it('Enter sem opção ativa escolhe o primeiro resultado e não volta a pesquisar', async () => {
    const user = userEvent.setup();
    const { input, onSelect, geocoder } = setup();
    await user.type(input, 'augusta');
    await screen.findAllByRole('option');
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith(RUA_AUGUSTA);
    await new Promise((r) => setTimeout(r, 400));
    expect(geocoder.search).toHaveBeenCalledTimes(1);
  });

  it('escolhe com o rato', async () => {
    const user = userEvent.setup();
    const { input, onSelect } = setup();
    await user.type(input, 'augusta');
    await user.click(await screen.findByRole('option', { name: /Sé de Lisboa/ }));
    expect(onSelect).toHaveBeenCalledWith(SE_LISBOA);
  });

  it('Escape fecha a lista e, se repetido, limpa o texto', async () => {
    const user = userEvent.setup();
    const { input } = setup();
    await user.type(input, 'augusta');
    await screen.findAllByRole('option');
    await user.keyboard('{Escape}');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    await user.keyboard('{Escape}');
    expect(input).toHaveValue('');
  });

  it('o botão de limpar apaga o texto e mantém o foco', async () => {
    const user = userEvent.setup();
    const { input } = setup();
    await user.type(input, 'abc');
    await user.click(screen.getByRole('button', { name: 'Limpar pesquisa' }));
    expect(input).toHaveValue('');
    expect(input).toHaveFocus();
  });

  it('mostra mensagem quando não há resultados', async () => {
    const user = userEvent.setup();
    const { input } = setup({ geocoder: fakeGeocoder([]) });
    await user.type(input, 'xyzxyz');
    expect(await screen.findByText('Sem resultados para esta pesquisa.')).toBeVisible();
  });

  it.each([
    ['rate_limited', 'Demasiadas pesquisas seguidas. Aguarda alguns segundos.'],
    ['network', 'Sem ligação à internet ou ao serviço de pesquisa.'],
  ] as const)('mostra o erro %s', async (code, message) => {
    const user = userEvent.setup();
    const geocoder = fakeGeocoder();
    geocoder.search.mockRejectedValue(new GeocoderError(code, 'x'));
    const { input } = setup({ geocoder });
    await user.type(input, 'lisboa');
    expect(await screen.findByText(message)).toBeVisible();
  });

  it('erros desconhecidos aparecem como serviço indisponível', async () => {
    const user = userEvent.setup();
    const geocoder = fakeGeocoder();
    geocoder.search.mockRejectedValue(new Error('???'));
    const { input } = setup({ geocoder });
    await user.type(input, 'lisboa');
    expect(await screen.findByText(/indisponível/)).toBeVisible();
  });

  it('ignora respostas atrasadas de pesquisas antigas', async () => {
    const user = userEvent.setup();
    const geocoder = fakeGeocoder();
    let resolveOld: (places: Place[]) => void = () => undefined;
    geocoder.search
      .mockImplementationOnce(
        () =>
          new Promise<Place[]>((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValueOnce([SE_LISBOA]);
    const { input } = setup({ geocoder });
    await user.type(input, 'lisboa');
    await waitFor(() => expect(geocoder.search).toHaveBeenCalledTimes(1));
    await user.clear(input);
    await user.type(input, 'sé de');
    await screen.findByRole('option', { name: /Sé de Lisboa/ });
    // O pedido antigo foi cancelado e a resposta dele, mesmo que chegue, é ignorada.
    expect(geocoder.search.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    resolveOld([RUA_AUGUSTA]);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('option', { name: /Rua Augusta/ })).toBeNull();
    expect(screen.getByRole('option', { name: /Sé de Lisboa/ })).toBeVisible();
  });

  it('sem texto mostra favoritos e recentes', async () => {
    const user = userEvent.setup();
    const home = makePlace({ id: 'h', name: 'Casa da Avó' });
    setup({
      favorites: [{ id: 'f1', kind: 'home', place: home, createdAt: 1 }],
      recent: [SE_LISBOA],
    });
    await user.click(screen.getByRole('combobox'));
    expect(screen.getByText('Favoritos')).toBeVisible();
    expect(screen.getByText('Recentes')).toBeVisible();
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'CasaCasa da Avó',
      'Sé de LisboaLargo da Sé, Lisboa',
    ]);
  });
});
