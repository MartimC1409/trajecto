import type {
  Favorite,
  Place,
  Route,
  RouteLanguage,
  RoutePreferences,
  RouteTime,
  SearchBias,
  TravelMode,
} from '@trajecto/core';
import {
  estimateFuelCost,
  isValidLocalDateTime,
  MAX_WAYPOINTS,
  toLocalDateTime,
  TRAVEL_MODES,
} from '@trajecto/core';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatClock, formatDistance, formatDuration, formatEuros } from '../format';
import type { Endpoint, PlannerInput, PlannerState } from '../hooks/useRoutePlanner';
import { useRoutePlanner } from '../hooks/useRoutePlanner';
import { useRouteWeather } from '../hooks/useRouteWeather';
import { useStore } from '../hooks/useStore';
import type { RouteMarker } from '../map/MapView';
import type { NavigationTarget } from '../navigation/session';
import { useServices } from '../services';
import type { IconName } from './Icon';
import { Icon } from './Icon';
import { ManeuverIcon } from './Maneuver';
import { placeText } from './placeText';
import { RouteWeather } from './RouteWeather';
import { SearchBox } from './SearchBox';

const MODE_ICONS: Record<TravelMode, IconName> = {
  car: 'car',
  motorcycle: 'motorcycle',
  walk: 'walk',
  bike: 'bike',
};

const MAX_STOPS = MAX_WAYPOINTS - 2;

type Editing = 'origin' | 'destination' | 'stop' | null;
type SuccessState = Extract<PlannerState, { status: 'success' }>;

interface DirectionsPanelProps {
  readonly destination: Place;
  readonly hidden: boolean;
  readonly selectedRoute: number;
  readonly favorites: readonly Favorite[];
  readonly recent: readonly Place[];
  readonly getBias: () => SearchBias | undefined;
  readonly onSelectRoute: (index: number) => void;
  readonly onRoutesChange: (routes: readonly Route[], markers: readonly RouteMarker[]) => void;
  readonly onStart: (target: NavigationTarget) => void;
  readonly onClose: () => void;
}

/** "AAAA-MM-DDThh:mm" na hora local → Date. */
function parseLocal(value: string): Date {
  const [date = '', time = ''] = value.split('T');
  const [y = 0, mo = 1, d = 1] = date.split('-').map(Number);
  const [h = 0, mi = 0] = time.split(':').map(Number);
  return new Date(y, mo - 1, d, h, mi);
}

/** Próximos 5 minutos certos, como valor inicial do campo de data e hora. */
function nextFiveMinutes(): string {
  const date = new Date(Date.now() + 5 * 60_000);
  date.setMinutes(Math.ceil(date.getMinutes() / 5) * 5, 0, 0);
  return toLocalDateTime(date);
}

export function routeLanguage(appLanguage: string): RouteLanguage {
  return appLanguage === 'en' ? 'en-US' : 'pt-PT';
}

export function DirectionsPanel(props: DirectionsPanelProps) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const { router, geocoder, preferences, locate, weather } = useServices();
  const prefs = useStore(preferences);
  const locale = i18n.language;

  const [origin, setOrigin] = useState<Endpoint>({ kind: 'current' });
  const [destination, setDestination] = useState<Endpoint>({
    kind: 'place',
    place: props.destination,
  });
  const [stops, setStops] = useState<readonly Place[]>([]);
  const [time, setTime] = useState<RouteTime>({ kind: 'now' });
  const [editing, setEditing] = useState<Editing>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [stepsOpen, setStepsOpen] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Ao abrir o painel, ao voltar da navegação e ao fechar a pesquisa de um ponto, o foco vai
  // para o título (o botão que estava focado desapareceu).
  useEffect(() => {
    if (!props.hidden && editing === null) headingRef.current?.focus();
  }, [props.hidden, editing]);

  const mode = prefs.travelMode;
  const routePreferences = prefs.routePreferences;
  const language = routeLanguage(locale);

  const input = useMemo<PlannerInput>(
    () => ({ origin, stops, destination, mode, preferences: routePreferences, time, language }),
    [origin, stops, destination, mode, routePreferences, time, language],
  );
  const state = useRoutePlanner(router, input, locate);

  // Enquanto se calcula uma nova rota, continua a mostrar-se a anterior.
  const [lastSuccess, setLastSuccess] = useState<SuccessState | null>(null);
  if (state.status === 'success' && state !== lastSuccess) setLastSuccess(state);
  const shown: SuccessState | null =
    state.status === 'success'
      ? state
      : state.status === 'loading' || state.status === 'locating'
        ? lastSuccess
        : null;

  const markers = useMemo<RouteMarker[]>(() => {
    const list: RouteMarker[] = [];
    if (origin.kind === 'place') {
      list.push({ lngLat: origin.place.lngLat, kind: 'origin', label: t('directions.origin') });
    }
    stops.forEach((stop, i) =>
      list.push({ lngLat: stop.lngLat, kind: 'stop', label: String(i + 1) }),
    );
    if (destination.kind === 'place') {
      list.push({
        lngLat: destination.place.lngLat,
        kind: 'destination',
        label: t('directions.destination'),
      });
    }
    return list;
  }, [origin, stops, destination, t]);

  const { onRoutesChange } = props;
  useEffect(() => {
    onRoutesChange(shown?.routes ?? [], markers);
  }, [shown, markers, onRoutesChange]);

  const routes = shown?.routes ?? [];
  const selected = routes[props.selectedRoute] ?? routes[0];
  const selectedIndex = selected ? routes.indexOf(selected) : -1;

  function endpointName(endpoint: Endpoint): string {
    return endpoint.kind === 'current'
      ? t('directions.myLocation')
      : placeText(endpoint.place, t).title;
  }

  function choose(place: Place) {
    if (editing === 'origin') setOrigin({ kind: 'place', place });
    else if (editing === 'destination') setDestination({ kind: 'place', place });
    else if (editing === 'stop') setStops((list) => [...list, place].slice(0, MAX_STOPS));
    setEditing(null);
  }

  function chooseMyLocation() {
    if (editing === 'origin') setOrigin({ kind: 'current' });
    else if (editing === 'destination') setDestination({ kind: 'current' });
    setEditing(null);
  }

  function setPreference(key: keyof RoutePreferences, value: boolean) {
    preferences.set('routePreferences', { ...routePreferences, [key]: value });
  }

  function setTimeKind(kind: RouteTime['kind']) {
    if (kind === 'now') setTime({ kind: 'now' });
    else setTime({ kind, value: time.kind === 'now' ? nextFiveMinutes() : time.value });
  }

  function start(simulate: boolean) {
    if (!fresh || !shown || !selected) return;
    props.onStart({
      route: selected,
      waypoints: shown.waypoints.slice(1),
      request: {
        mode: shown.input.mode,
        preferences: shown.input.preferences,
        language: shown.input.language,
      },
      simulate,
    });
  }

  function arrivalText(route: Route): string {
    const duration = route.duration * 1000;
    if (time.kind === 'arrive') {
      return t('directions.departure', {
        time: formatClock(new Date(parseLocal(time.value).getTime() - duration), locale),
      });
    }
    const departure =
      time.kind === 'depart' ? parseLocal(time.value).getTime() : (shown?.computedAt ?? 0);
    return t('directions.arrival', { time: formatClock(new Date(departure + duration), locale) });
  }

  function fuelText(route: Route): string | null {
    if (route.mode !== 'car' && route.mode !== 'motorcycle') return null;
    const litresPer100Km =
      route.mode === 'car' ? prefs.fuel.carLitresPer100Km : prefs.fuel.motorcycleLitresPer100Km;
    const cost = estimateFuelCost(route.distance, {
      litresPer100Km,
      pricePerLitre: prefs.fuel.pricePerLitre,
    });
    return t('directions.fuel', { cost: formatEuros(cost, locale) });
  }

  const statusText =
    state.status === 'locating'
      ? t('directions.locating')
      : state.status === 'loading'
        ? t('directions.calculating')
        : state.status === 'error'
          ? t(`directions.errors.${state.code}`)
          : '';

  const editingLabel =
    editing === 'origin'
      ? t('directions.origin')
      : editing === 'destination'
        ? t('directions.destination')
        : t('directions.stop', { n: stops.length + 1 });

  const roadMode = mode === 'car' || mode === 'motorcycle';
  // Só se pode iniciar com o resultado do pedido atual (não com a rota anterior ainda visível).
  const fresh = state.status === 'success' && state.input === input;

  // Meteorologia na rota escolhida, à hora de partida do pedido (agora, partir às, chegar às).
  const weatherRoute = fresh ? (selected ?? null) : null;
  let departure: number | null = null;
  if (shown && weatherRoute) {
    const requested = shown.input.time;
    if (requested.kind === 'now') departure = shown.computedAt;
    else {
      const at = parseLocal(requested.value).getTime();
      departure = requested.kind === 'depart' ? at : at - weatherRoute.duration * 1000;
    }
  }
  const weatherState = useRouteWeather(weather, weatherRoute, departure, shown?.computedAt ?? 0);
  const canNavigate = fresh && origin.kind === 'current' && Boolean(selected);

  return (
    <section
      className="sheet directions"
      aria-labelledby={`${id}-title`}
      hidden={props.hidden}
      aria-busy={state.status === 'loading' || state.status === 'locating'}
    >
      <div className="sheet-header">
        <h2 id={`${id}-title`} ref={headingRef} tabIndex={-1} className="sheet-title">
          {t('directions.title')}
        </h2>
        <button
          type="button"
          className="icon-button"
          aria-label={t('directions.close')}
          onClick={props.onClose}
        >
          <Icon name="close" />
        </button>
      </div>

      <fieldset className="mode-tabs">
        <legend className="visually-hidden">{t('directions.mode')}</legend>
        {TRAVEL_MODES.map((m) => (
          <label key={m} className="mode-tab">
            <input
              type="radio"
              name={`${id}-mode`}
              value={m}
              checked={mode === m}
              onChange={() => preferences.set('travelMode', m)}
            />
            <Icon name={MODE_ICONS[m]} />
            <span>{t(`directions.modes.${m}`)}</span>
          </label>
        ))}
      </fieldset>

      {editing ? (
        <div className="waypoint-search">
          <SearchField
            label={t('directions.search', { what: editingLabel.toLocaleLowerCase(locale) })}
            favorites={props.favorites}
            recent={props.recent}
            getBias={props.getBias}
            geocoder={geocoder}
            onSelect={choose}
          />
          <div className="waypoint-search-actions">
            {editing !== 'stop' && (
              <button type="button" className="button" onClick={chooseMyLocation}>
                <Icon name="navigation" />
                {t('directions.useMyLocation')}
              </button>
            )}
            <button type="button" className="button" onClick={() => setEditing(null)}>
              {t('directions.cancelSearch')}
            </button>
          </div>
        </div>
      ) : (
        <div className="waypoints">
          <ol className="waypoint-list">
            <WaypointRow
              icon="navigation"
              label={t('directions.origin')}
              name={endpointName(origin)}
              actionLabel={t('directions.change', {
                what: t('directions.origin').toLocaleLowerCase(locale),
              })}
              onAction={() => setEditing('origin')}
            />
            {stops.map((stop, index) => (
              <WaypointRow
                key={`${stop.id}-${index}`}
                icon="pin"
                label={t('directions.stop', { n: index + 1 })}
                name={placeText(stop, t).title}
                actionLabel={t('directions.removeStop', {
                  what: t('directions.stop', { n: index + 1 }).toLocaleLowerCase(locale),
                })}
                actionIcon="close"
                onAction={() => setStops((list) => list.filter((_, i) => i !== index))}
              />
            ))}
            <WaypointRow
              icon="flag"
              label={t('directions.destination')}
              name={endpointName(destination)}
              actionLabel={t('directions.change', {
                what: t('directions.destination').toLocaleLowerCase(locale),
              })}
              onAction={() => setEditing('destination')}
            />
          </ol>
          <div className="waypoint-tools">
            <button
              type="button"
              className="button"
              disabled={stops.length >= MAX_STOPS}
              onClick={() => setEditing('stop')}
            >
              <Icon name="plus" />
              {t('directions.addStop')}
            </button>
            <button
              type="button"
              className="icon-button bordered"
              aria-label={t('directions.swap')}
              title={t('directions.swap')}
              onClick={() => {
                setOrigin(destination);
                setDestination(origin);
                setStops((list) => [...list].reverse());
              }}
            >
              <Icon name="swap" />
            </button>
          </div>
        </div>
      )}

      <p className="directions-status" role="status" aria-live="polite">
        {statusText}
      </p>

      {routes.length > 0 && (
        <>
          <h3 className="visually-hidden">{t('directions.routes')}</h3>
          <ul className="route-list">
            {routes.map((route, index) => {
              const fuel = fuelText(route);
              return (
                // As rotas de um resultado não mudam de ordem: o índice serve de chave.
                <li key={index}>
                  <button
                    type="button"
                    className="route-option"
                    aria-pressed={index === selectedIndex}
                    onClick={() => props.onSelectRoute(index)}
                  >
                    <span className="route-duration">{formatDuration(route.duration, t)}</span>
                    <span className="route-meta">
                      {formatDistance(route.distance, locale)} · {arrivalText(route)}
                    </span>
                    <span className="route-tags">
                      {index === 0 && routes.length > 1 && (
                        <span className="tag">{t('directions.recommended')}</span>
                      )}
                      {route.hasToll && <span className="tag">{t('directions.toll')}</span>}
                      {route.hasFerry && <span className="tag">{t('directions.ferry')}</span>}
                      {fuel && <span className="tag">{fuel}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="sheet-actions">
            <button
              type="button"
              className="button primary"
              disabled={!canNavigate}
              onClick={() => start(false)}
            >
              <Icon name="navigation" />
              {t('directions.start')}
            </button>
            <button
              type="button"
              className="button"
              disabled={!fresh || !selected}
              onClick={() => start(true)}
            >
              <Icon name="play" />
              {t('directions.simulate')}
            </button>
            <button
              type="button"
              className="button"
              aria-expanded={stepsOpen}
              aria-controls={`${id}-steps`}
              onClick={() => setStepsOpen((open) => !open)}
            >
              <Icon name="list" />
              {stepsOpen ? t('directions.hideSteps') : t('directions.showSteps')}
            </button>
          </div>
          {origin.kind !== 'current' && (
            <p className="muted">{t('directions.startNeedsLocation')}</p>
          )}
          <RouteWeather state={weatherState} />
        </>
      )}

      <button
        type="button"
        className="button disclosure"
        aria-expanded={optionsOpen}
        aria-controls={`${id}-options`}
        onClick={() => setOptionsOpen((open) => !open)}
      >
        {t('directions.options')}
      </button>
      <div id={`${id}-options`} className="route-options" hidden={!optionsOpen}>
        <fieldset className="field">
          <legend className="visually-hidden">{t('directions.options')}</legend>
          {roadMode && (
            <>
              <Checkbox
                label={t('directions.avoidTolls')}
                checked={routePreferences.avoidTolls}
                onChange={(v) => setPreference('avoidTolls', v)}
              />
              <Checkbox
                label={t('directions.avoidHighways')}
                checked={routePreferences.avoidHighways}
                onChange={(v) => setPreference('avoidHighways', v)}
              />
            </>
          )}
          <Checkbox
            label={t('directions.avoidFerries')}
            checked={routePreferences.avoidFerries}
            onChange={(v) => setPreference('avoidFerries', v)}
          />
          <Checkbox
            label={t('directions.shortest')}
            checked={routePreferences.shortest}
            onChange={(v) => setPreference('shortest', v)}
          />
          <p className="muted">{t('directions.avoidHint')}</p>
        </fieldset>
        <fieldset className="field">
          <legend>{t('directions.when')}</legend>
          {(
            [
              ['now', 'directions.leaveNow'],
              ['depart', 'directions.departAt'],
              ['arrive', 'directions.arriveBy'],
            ] as const
          ).map(([kind, key]) => (
            <label key={kind} className="radio">
              <input
                type="radio"
                name={`${id}-when`}
                checked={time.kind === kind}
                onChange={() => setTimeKind(kind)}
              />
              {t(key)}
            </label>
          ))}
          {time.kind !== 'now' && (
            <label className="number-field">
              <span>{t('directions.dateTime')}</span>
              <input
                type="datetime-local"
                value={time.value}
                onChange={(event) => {
                  const value = event.target.value;
                  if (isValidLocalDateTime(value)) setTime({ kind: time.kind, value });
                }}
              />
            </label>
          )}
          {(time.kind !== 'now' || stops.length > 0) && (
            <p className="muted">{t('directions.noAlternatives')}</p>
          )}
        </fieldset>
      </div>

      {selected && (
        <ol
          id={`${id}-steps`}
          className="steps"
          aria-label={t('directions.steps')}
          hidden={!stepsOpen}
        >
          {selected?.maneuvers.map((maneuver, index) => (
            // Os passos de uma rota não mudam de ordem: o índice serve de chave.
            <li key={index} className="step">
              <ManeuverIcon
                type={maneuver.type}
                roundaboutExit={maneuver.roundaboutExit}
                size={24}
              />
              <span className="step-text">
                <span>{maneuver.instruction}</span>
                {maneuver.distance > 0 && (
                  <span className="muted">{formatDistance(maneuver.distance, locale)}</span>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function WaypointRow(props: {
  icon: IconName;
  label: string;
  name: string;
  actionLabel: string;
  actionIcon?: IconName;
  onAction: () => void;
}) {
  return (
    <li className="waypoint">
      <Icon name={props.icon} />
      <span className="option-text">
        <span className="option-subtitle">{props.label}</span>
        <span className="option-title">{props.name}</span>
      </span>
      <button
        type="button"
        className="icon-button"
        aria-label={`${props.actionLabel}: ${props.name}`}
        onClick={props.onAction}
      >
        <Icon name={props.actionIcon ?? 'search'} />
      </button>
    </li>
  );
}

function Checkbox(props: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="checkbox">
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(event) => props.onChange(event.target.checked)}
      />
      {props.label}
    </label>
  );
}

/** Caixa de pesquisa para escolher um ponto da rota (abre já com o cursor no campo). */
function SearchField(props: {
  label: string;
  favorites: readonly Favorite[];
  recent: readonly Place[];
  getBias: () => SearchBias | undefined;
  geocoder: ReturnType<typeof useServices>['geocoder'];
  onSelect: (place: Place) => void;
}) {
  return (
    <SearchBox
      geocoder={props.geocoder}
      getBias={props.getBias}
      favorites={props.favorites}
      recent={props.recent}
      onSelect={props.onSelect}
      label={props.label}
      placeholder={props.label}
      autoFocus
    />
  );
}
