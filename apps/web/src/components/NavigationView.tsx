import { isArrivalManeuver } from '@trajecto/core';
import { useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { formatClock, formatDistance, formatDuration } from '../format';
import type { NavigationState } from '../navigation/session';
import { Icon } from './Icon';
import { Lanes, ManeuverIcon } from './Maneuver';

/** Mostra "Depois…" quando a manobra seguinte vem logo a seguir (menos do que isto, em metros). */
const THEN_DISTANCE = 150;
const SIMULATION_SPEEDS = [1, 4] as const;

interface NavigationViewProps {
  readonly state: NavigationState;
  readonly voiceEnabled: boolean;
  readonly voiceSupported: boolean;
  readonly wakeLockSupported: boolean;
  readonly follow: boolean;
  readonly onToggleVoice: () => void;
  readonly onRecenter: () => void;
  readonly onSetSpeed: (factor: number) => void;
  readonly onEnd: () => void;
}

export function NavigationView(props: NavigationViewProps) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const locale = i18n.language;
  const { state } = props;
  const headingRef = useRef<HTMLHeadingElement>(null);

  // O botão que iniciou a navegação desaparece: o foco passa para esta região.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const { route, snapshot } = state;
  const maneuvers = route.maneuvers;

  const arrived = snapshot?.status === 'arrived';
  // Antes da primeira posição mostra-se a instrução de partida.
  const nextIndex = snapshot ? snapshot.nextManeuverIndex : 0;
  const next = maneuvers[nextIndex];
  const following = maneuvers[nextIndex + 1];
  const showThen =
    !arrived &&
    snapshot !== null &&
    next !== undefined &&
    following !== undefined &&
    !isArrivalManeuver(next.type) &&
    next.distance < THEN_DISTANCE;

  const remainingTime = snapshot?.durationRemaining ?? route.duration;
  const remainingDistance = snapshot?.distanceRemaining ?? route.distance;
  const eta = new Date(state.updatedAt + remainingTime * 1000);

  let status = '';
  if (state.rerouting) status = t('nav.rerouting');
  else if (state.notice === 'reroute_failed') status = t('nav.rerouteFailed');
  else if (state.notice === 'gps_denied') status = t('nav.gpsDenied');
  else if (state.notice === 'gps_error') status = t('nav.gpsError');
  else if (snapshot?.status === 'off_route') status = t('nav.offRoute');
  else if (!snapshot && !state.simulate) status = t('nav.waitingGps');

  const exit = next?.sign;
  const exitText = exit
    ? [exit.exitNumber, ...exit.branch, ...exit.toward].filter(Boolean).join(' · ')
    : '';

  return (
    <section className="nav" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} ref={headingRef} tabIndex={-1} className="visually-hidden">
        {t('nav.label')}
      </h2>

      <div className="nav-banner">
        {arrived || !next ? (
          <div className="nav-step">
            <ManeuverIcon type={4} />
            <p className="nav-instruction">{t('nav.arrived')}</p>
          </div>
        ) : (
          <div className="nav-step">
            <ManeuverIcon type={next.type} roundaboutExit={next.roundaboutExit} />
            <div className="nav-text">
              {snapshot && (
                <p className="nav-distance">
                  {formatDistance(snapshot.distanceToNextManeuver, locale)}
                </p>
              )}
              {/* Leitores de ecrã: a instrução atual é anunciada quando muda. */}
              <p className="nav-instruction" aria-live="polite">
                {next.instruction}
              </p>
              {exitText && <p className="nav-exit">{exitText}</p>}
            </div>
          </div>
        )}
        {!arrived && next?.lanes && <Lanes lanes={next.lanes} />}
        {showThen && following && (
          <p className="nav-then">
            <span>{t('nav.then')}</span>
            <ManeuverIcon
              type={following.type}
              roundaboutExit={following.roundaboutExit}
              size={22}
            />
          </p>
        )}
      </div>

      <p className="nav-status" role="status" aria-live="polite" hidden={status === ''}>
        {status}
      </p>

      <div className="nav-footer">
        <div className="nav-summary" aria-label={t('nav.remaining')}>
          {!arrived && (
            <>
              <p className="nav-eta">
                <span className="visually-hidden">{t('nav.eta')}: </span>
                {formatClock(eta, locale)}
              </p>
              <p className="nav-remaining">
                {formatDuration(remainingTime, t)} · {formatDistance(remainingDistance, locale)}
              </p>
            </>
          )}
          {state.simulate && <p className="nav-badge">{t('nav.simulation')}</p>}
          {!props.wakeLockSupported && !state.simulate && (
            <p className="muted">{t('nav.noWakeLock')}</p>
          )}
        </div>
        <div className="nav-actions">
          {props.voiceSupported && (
            <button
              type="button"
              className="icon-button"
              aria-pressed={props.voiceEnabled}
              aria-label={props.voiceEnabled ? t('nav.voiceOff') : t('nav.voiceOn')}
              onClick={props.onToggleVoice}
            >
              <Icon name={props.voiceEnabled ? 'volume' : 'mute'} />
            </button>
          )}
          {state.simulate &&
            SIMULATION_SPEEDS.map((factor) => (
              <button
                key={factor}
                type="button"
                className="button toggle"
                aria-pressed={state.simulationSpeed === factor}
                aria-label={t('nav.speed', { factor })}
                onClick={() => props.onSetSpeed(factor)}
              >
                {factor}×
              </button>
            ))}
          {!props.follow && (
            <button type="button" className="button" onClick={props.onRecenter}>
              <Icon name="navigation" />
              {t('nav.recenter')}
            </button>
          )}
          <button type="button" className="button danger solid" onClick={props.onEnd}>
            {t('nav.end')}
          </button>
        </div>
      </div>
    </section>
  );
}
