import type { NavigationSnapshot, Route } from '@trajecto/core';
import { parseValhallaResponse } from '@trajecto/core';
import { valhallaResponse } from '@trajecto/core/testing';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { NavigationState } from '../navigation/session';
import { NavigationView } from './NavigationView';

const route = parseValhallaResponse(valhallaResponse(), 'car')[0] as Route;

function snapshot(overrides: Partial<NavigationSnapshot> = {}): NavigationSnapshot {
  return {
    status: 'navigating',
    snapped: { lng: -9.145, lat: 38.716 },
    bearing: 0,
    distanceFromRoute: 0,
    distanceTraveled: 100,
    distanceRemaining: 1112,
    durationRemaining: 130,
    nextManeuverIndex: 1,
    distanceToNextManeuver: 456,
    legIndex: 0,
    speed: 10,
    ...overrides,
  };
}

function state(overrides: Partial<NavigationState> = {}): NavigationState {
  return {
    route,
    snapshot: snapshot(),
    position: null,
    rerouting: false,
    notice: null,
    gpsAccuracy: 8,
    simulate: false,
    simulationSpeed: 1,
    nextAlert: null,
    updatedAt: new Date(2026, 9, 14, 9, 0).getTime(),
    ...overrides,
  };
}

function setup(
  overrides: Partial<NavigationState> = {},
  props: Partial<Parameters<typeof NavigationView>[0]> = {},
) {
  const handlers = {
    onToggleVoice: vi.fn(),
    onRecenter: vi.fn(),
    onSetSpeed: vi.fn(),
    onEnd: vi.fn(),
  };
  render(
    <NavigationView
      state={state(overrides)}
      voiceEnabled
      voiceSupported
      wakeLockSupported
      follow
      {...handlers}
      {...props}
    />,
  );
  return {
    ...handlers,
    user: userEvent.setup(),
    nav: screen.getByRole('region', { name: 'Navegação' }),
  };
}

describe('NavigationView', () => {
  it('mostra a próxima manobra, as faixas, a saída e a hora de chegada', async () => {
    const { nav, user, onToggleVoice, onEnd } = setup();
    expect(nav).toHaveTextContent('450 m');
    expect(nav).toHaveTextContent('Vire à direita na Rua Alexandre Herculano.');
    expect(nav).toHaveTextContent('3 · Rato');
    expect(within(nav).getByRole('list', { name: 'Faixas a usar' })).toBeVisible();
    expect(within(nav).getByRole('listitem', { name: 'Faixa 2 (recomendada)' })).toBeVisible();
    expect(within(nav).getByRole('listitem', { name: 'Faixa 1' })).toBeVisible();
    expect(nav).toHaveTextContent('09:02');
    expect(nav).toHaveTextContent('2 min · 1,1 km');
    expect(within(nav).queryByRole('button', { name: 'Recentrar' })).toBeNull();
    await user.click(within(nav).getByRole('button', { name: 'Desligar instruções por voz' }));
    expect(onToggleVoice).toHaveBeenCalled();
    await user.click(within(nav).getByRole('button', { name: 'Terminar' }));
    expect(onEnd).toHaveBeenCalled();
  });

  it('mostra "Depois" quando a manobra seguinte vem logo a seguir', () => {
    const close = {
      ...route,
      maneuvers: route.maneuvers.map((m, i) => (i === 1 ? { ...m, distance: 80 } : m)),
    };
    const { nav } = setup({ route: close });
    expect(nav).toHaveTextContent('Depois');
  });

  it('indica a chegada', () => {
    const { nav } = setup({ snapshot: snapshot({ status: 'arrived', nextManeuverIndex: 3 }) });
    expect(nav).toHaveTextContent('Chegaste ao destino.');
    expect(nav).not.toHaveTextContent('09:0');
  });

  it.each([
    [{ rerouting: true }, 'A recalcular a rota…'],
    [{ notice: 'reroute_failed' as const }, 'Não foi possível recalcular a rota'],
    [{ notice: 'reroute_offline' as const }, 'Sem rede: não dá para recalcular a rota'],
    [{ notice: 'gps_denied' as const }, 'Sem acesso à localização'],
    [{ notice: 'gps_error' as const }, 'Sem sinal de GPS.'],
    [{ notice: 'gps_weak' as const, gpsAccuracy: 150 }, 'Sinal de GPS fraco (precisão de ±150 m)'],
    [{ notice: 'gps_weak' as const, gpsAccuracy: null }, 'Sinal de GPS fraco. A navegação'],
    [{ snapshot: snapshot({ status: 'off_route' }) }, 'Fora da rota'],
    [{ snapshot: null }, 'À espera do sinal de GPS…'],
  ])('mostra o estado %o', (overrides, text) => {
    setup(overrides);
    expect(screen.getByRole('status')).toHaveTextContent(text);
  });

  it('antes da primeira posição mostra a instrução de partida', () => {
    const { nav } = setup({ snapshot: null });
    expect(nav).toHaveTextContent('Siga para norte na Avenida da Liberdade.');
  });

  it('na simulação permite mudar a velocidade; sem seguir mostra Recentrar', async () => {
    const { nav, user, onSetSpeed, onRecenter } = setup(
      { simulate: true, simulationSpeed: 4 },
      { follow: false, voiceSupported: false, wakeLockSupported: false },
    );
    expect(nav).toHaveTextContent('Simulação');
    expect(within(nav).queryByRole('button', { name: /instruções por voz/u })).toBeNull();
    expect(
      within(nav).getByRole('button', { name: 'Velocidade da simulação: 4×' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(nav).getByRole('button', { name: 'Velocidade da simulação: 1×' }));
    expect(onSetSpeed).toHaveBeenCalledWith(1);
    await user.click(within(nav).getByRole('button', { name: 'Recentrar' }));
    expect(onRecenter).toHaveBeenCalled();
  });

  it('avisa quando o ecrã se pode desligar e a voz está desligada', () => {
    const { nav } = setup({}, { wakeLockSupported: false, voiceEnabled: false });
    expect(nav).toHaveTextContent('pode desligar o ecrã');
    expect(within(nav).getByRole('button', { name: 'Ligar instruções por voz' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('mostra o próximo aviso e o botão Reportar', async () => {
    const onReport = vi.fn();
    const { nav, user } = setup({ nextAlert: { kind: 'police', distance: 420 } }, { onReport });
    expect(nav).toHaveTextContent('Polícia a 400 m');
    await user.click(within(nav).getByRole('button', { name: 'Reportar' }));
    expect(onReport).toHaveBeenCalled();
  });

  it('mostra radares com o limite e tipos desconhecidos pelo nome', () => {
    const { nav } = setup({ nextAlert: { kind: 'speed_camera', distance: 1200, detail: 50 } });
    expect(nav).toHaveTextContent('Radar fixo a 1,2 km · 50 km/h');
  });

  it('mostra tipos de aviso desconhecidos pelo nome', () => {
    const { nav } = setup({ nextAlert: { kind: 'xyz', distance: 300 } });
    expect(nav).toHaveTextContent('xyz a 300 m');
  });
});
