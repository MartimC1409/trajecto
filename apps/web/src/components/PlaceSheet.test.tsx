import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RUA_AUGUSTA, makePlace } from '../test/fakes';
import { PlaceSheet } from './PlaceSheet';

describe('PlaceSheet', () => {
  it('mostra estado de carregamento sem botões de guardar', () => {
    render(
      <PlaceSheet
        selection={{ status: 'loading', lngLat: { lng: -9.1, lat: 38.7 } }}
        favorites={[]}
        feedback={null}
        onToggle={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: 'A procurar a morada…' })).toBeVisible();
    expect(screen.getByText('38.70000, -9.10000')).toBeVisible();
    expect(screen.queryByRole('button', { name: /Casa/ })).toBeNull();
  });

  it('mostra o local e o estado dos favoritos', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const onClose = vi.fn();
    render(
      <PlaceSheet
        selection={{ status: 'ready', place: RUA_AUGUSTA }}
        favorites={[{ id: 'f', kind: 'work', place: RUA_AUGUSTA, createdAt: 1 }]}
        feedback="Guardado como Trabalho."
        onToggle={onToggle}
        onClose={onClose}
      />,
    );
    expect(screen.getByRole('region', { name: 'Rua Augusta' })).toBeVisible();
    expect(screen.getByText('1100-053 Lisboa')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Trabalho' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Casa' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('status')).toHaveTextContent('Guardado como Trabalho.');
    await user.click(screen.getByRole('button', { name: 'Casa' }));
    expect(onToggle).toHaveBeenCalledWith('home');
    await user.click(screen.getByRole('button', { name: 'Favorito' }));
    expect(onToggle).toHaveBeenCalledWith('other');
    await user.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('explica quando não há morada ou houve erro', () => {
    const { rerender } = render(
      <PlaceSheet
        selection={{
          status: 'ready',
          place: makePlace({ id: 'coord:1', kind: 'coordinate' }),
          noAddress: true,
        }}
        favorites={[]}
        feedback={null}
        onToggle={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Local no mapa' })).toBeVisible();
    expect(screen.getByText('Não encontrámos uma morada para este ponto.')).toBeVisible();
    rerender(
      <PlaceSheet
        selection={{ status: 'ready', place: RUA_AUGUSTA, error: 'network' }}
        favorites={[]}
        feedback={null}
        onToggle={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Não foi possível obter a morada: Sem ligação à internet ou ao serviço de pesquisa.',
    );
  });
});
