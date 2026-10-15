import type { WeatherCategory, WeatherWarningKind } from '@trajecto/core';
import { weatherCategory } from '@trajecto/core';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatClock } from '../format';
import type { RouteWeatherState } from '../hooks/useRouteWeather';
import type { IconName } from './Icon';
import { Icon } from './Icon';

const CATEGORY_ICON: Record<WeatherCategory, IconName> = {
  clear: 'sun',
  partly_cloudy: 'cloud',
  cloudy: 'cloud',
  fog: 'fog',
  drizzle: 'rain',
  rain: 'rain',
  freezing: 'snow',
  snow: 'snow',
  showers: 'rain',
  thunderstorm: 'storm',
  unknown: 'cloud',
};

const WARNING_ICON: Record<WeatherWarningKind, IconName> = {
  thunderstorm: 'storm',
  snow: 'snow',
  ice: 'snow',
  heavy_rain: 'rain',
  fog: 'fog',
  wind: 'wind',
  heat: 'sun',
};

function km(meters: number): string {
  return String(Math.round(meters / 1000));
}

/** Resumo do tempo previsto ao longo da rota escolhida. */
export function RouteWeather({ state }: { state: RouteWeatherState }) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const [open, setOpen] = useState(false);
  const locale = i18n.language;
  const number = (value: number, digits = 0) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value);

  if (state.status === 'idle') return null;

  return (
    <section className="route-weather" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="route-weather-title">
        {t('weather.title')}
      </h3>
      {state.status === 'loading' && <p className="muted">{t('weather.loading')}</p>}
      {state.status === 'error' && <p className="muted">{t('weather.error')}</p>}
      {state.status === 'out_of_range' && <p className="muted">{t('weather.outOfRange')}</p>}
      {state.status === 'success' && (
        <>
          {state.warnings.length === 0 ? (
            <p>{t('weather.noWarnings')}</p>
          ) : (
            <ul className="weather-warnings">
              {state.warnings.map((warning) => (
                <li key={warning.kind} className="weather-warning">
                  <Icon name={WARNING_ICON[warning.kind]} />
                  <span>
                    {t('weather.warningAt', {
                      what: t(`weather.kinds.${warning.kind}`),
                      time: formatClock(new Date(warning.point.at), locale),
                      km: km(warning.point.sample.distance),
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className="button"
            aria-expanded={open}
            aria-controls={`${id}-points`}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? t('weather.hideDetails') : t('weather.showDetails')}
          </button>
          <ol id={`${id}-points`} className="weather-points" hidden={!open}>
            {state.points.map((point) => {
              const category = weatherCategory(point.weatherCode);
              const details = [
                point.temperature !== undefined
                  ? t('weather.temperature', { value: number(point.temperature) })
                  : null,
                point.precipitation !== undefined
                  ? t('weather.precipitation', { value: number(point.precipitation, 1) })
                  : null,
                point.windGusts !== undefined
                  ? t('weather.gusts', { value: number(point.windGusts) })
                  : null,
              ].filter(Boolean);
              return (
                <li key={point.sample.distance} className="weather-point">
                  <Icon name={CATEGORY_ICON[category]} />
                  <span className="option-text">
                    <span className="option-title">
                      {t('weather.point', {
                        km: km(point.sample.distance),
                        time: formatClock(new Date(point.at), locale),
                      })}
                    </span>
                    <span className="option-subtitle">
                      {point.weatherCode === undefined && point.temperature === undefined
                        ? t('weather.noData')
                        : [t(`weather.categories.${category}`), ...details].join(' · ')}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        </>
      )}
      <p className="muted">{t('weather.thresholdsHint')}</p>
      <p className="muted">
        <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">
          {t('weather.attribution')}
        </a>{' '}
        <a
          href="https://creativecommons.org/licenses/by/4.0/"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('weather.licence')}
        </a>
      </p>
    </section>
  );
}
