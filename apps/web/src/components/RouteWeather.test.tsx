import type { RouteWeatherPoint } from '@trajecto/core';
import { weatherWarnings } from '@trajecto/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { RouteWeather } from './RouteWeather';

const AT = new Date(2026, 9, 15, 14, 5).getTime();

function point(km: number, extra: Partial<RouteWeatherPoint>): RouteWeatherPoint {
  return {
    sample: { lngLat: { lng: -9, lat: 38 }, distance: km * 1000, seconds: km * 40 },
    at: AT + km * 40_000,
    ...extra,
  };
}

describe('RouteWeather', () => {
  it('não mostra nada sem rota', () => {
    const { container } = render(<RouteWeather state={{ status: 'idle' }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    [{ status: 'loading' } as const, 'A obter a previsão…'],
    [{ status: 'error' } as const, 'Não foi possível obter a previsão do tempo.'],
    [{ status: 'out_of_range' } as const, 'próximos 7 dias'],
  ])('mostra o estado %o', (state, text) => {
    render(<RouteWeather state={state} />);
    expect(screen.getByRole('region', { name: 'Meteorologia na rota' })).toHaveTextContent(text);
  });

  it('mostra avisos com a hora e o km, e a previsão ponto a ponto', async () => {
    const points = [
      point(0, { weatherCode: 0, temperature: 21.4, precipitation: 0, windGusts: 20 }),
      point(15, { weatherCode: 65, temperature: 17, precipitation: 6.2, windGusts: 72 }),
      point(30, {}),
    ];
    render(
      <RouteWeather state={{ status: 'success', points, warnings: weatherWarnings(points) }} />,
    );
    const region = screen.getByRole('region', { name: 'Meteorologia na rota' });
    expect(region).toHaveTextContent('Chuva forte · por volta das 14:15, ao km 15');
    expect(region).toHaveTextContent('Rajadas de vento fortes');
    expect(region).toHaveTextContent('Dados meteorológicos: Open-Meteo.com');
    expect(screen.getByRole('link', { name: /CC BY 4.0/u })).toHaveAttribute(
      'href',
      'https://creativecommons.org/licenses/by/4.0/',
    );
    expect(region.querySelector('.weather-points')).not.toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Ver previsão ponto a ponto' }));
    expect(region).toHaveTextContent('Km 0 · 14:05');
    expect(region).toHaveTextContent('Céu limpo · 21 °C · 0 mm · rajadas 20 km/h');
    expect(region).toHaveTextContent('Chuva · 17 °C · 6,2 mm · rajadas 72 km/h');
    expect(region).toHaveTextContent('sem previsão para esta hora');
  });

  it('diz quando não há avisos', () => {
    const points = [point(0, { weatherCode: 2, temperature: 20 })];
    render(<RouteWeather state={{ status: 'success', points, warnings: [] }} />);
    expect(screen.getByText('Sem avisos de tempo previstos na rota.')).toBeVisible();
  });
});
