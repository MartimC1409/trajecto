import type { TransitItinerary, TransitKind, TransitLeg } from '@trajecto/core';
import { useTranslation } from 'react-i18next';
import { formatClock, formatDistance, formatDuration } from '../format';
import { legColors } from '../map/transitLayers';
import type { IconName } from './Icon';
import { Icon } from './Icon';

export const TRANSIT_KIND_ICONS: Readonly<Record<TransitKind, IconName>> = {
  walk: 'walk',
  bus: 'bus',
  coach: 'bus',
  tram: 'tram',
  subway: 'metro',
  rail: 'train',
  ferry: 'ferry',
  cable: 'cable',
  other: 'transit',
};

/** Troços a pé com menos de um minuto não aparecem no resumo (só nos passos). */
const MIN_WALK_SUMMARY_S = 60;

interface TransitResultsProps {
  readonly itineraries: readonly TransitItinerary[];
  readonly selected: number;
  readonly onSelect: (index: number) => void;
  /** Nomes a usar no início e no fim (o serviço não conhece os nomes dos nossos pontos). */
  readonly originName: string;
  readonly destinationName: string;
  readonly stepsId: string;
}

function minutesBetween(a: number, b: number): number {
  return Math.round((a - b) / 60_000);
}

/** Etiqueta de uma linha (ícone, nome curto e cores do operador). */
function LineBadge({ leg }: { leg: TransitLeg }) {
  const { t } = useTranslation();
  const colors = legColors(leg);
  return (
    <span className="line-badge" style={{ background: colors.background, color: colors.text }}>
      <Icon name={TRANSIT_KIND_ICONS[leg.kind]} size={16} />
      <span className="visually-hidden">{t(`transit.kinds.${leg.kind}`)}</span>
      {leg.line && <span>{leg.line}</span>}
    </span>
  );
}

/** Resumo de um itinerário: troços por ordem, a pé com os minutos e transportes com a linha. */
function LegSummary({ legs }: { legs: readonly TransitLeg[] }) {
  const { t } = useTranslation();
  return (
    <span className="transit-legs">
      {legs.map((leg, index) =>
        leg.kind === 'walk' ? (
          leg.duration >= MIN_WALK_SUMMARY_S && (
            // Os troços de um itinerário não mudam de ordem: o índice serve de chave.
            <span key={index} className="walk-badge">
              <Icon name="walk" size={16} />
              <span className="visually-hidden">{t('transit.kinds.walk')}</span>
              {formatDuration(leg.duration, t)}
            </span>
          )
        ) : (
          <LineBadge key={index} leg={leg} />
        ),
      )}
    </span>
  );
}

/** Estado do troço: cancelado, atrasado, adiantado, a horas (tempo real) ou só o horário. */
function RealTimeText({ leg }: { leg: TransitLeg }) {
  const { t, i18n } = useTranslation();
  if (leg.cancelled) return <span className="transit-late">{t('transit.cancelled')}</span>;
  if (!leg.realTime) return <span className="muted">{t('transit.scheduled')}</span>;
  const delay = minutesBetween(leg.start, leg.scheduledStart);
  const planned = formatClock(new Date(leg.scheduledStart), i18n.language);
  if (delay >= 1) {
    return (
      <span className="transit-late">{t('transit.late', { count: delay, time: planned })}</span>
    );
  }
  if (delay <= -1) {
    return <span className="muted">{t('transit.early', { count: -delay, time: planned })}</span>;
  }
  return <span className="transit-on-time">{t('transit.onTime')}</span>;
}

export function TransitResults(props: TransitResultsProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const clock = (ms: number) => formatClock(new Date(ms), locale);
  const selected = props.itineraries[props.selected] ?? props.itineraries[0];

  return (
    <>
      <h3 className="visually-hidden">{t('transit.options')}</h3>
      <ul className="route-list">
        {props.itineraries.map((itinerary, index) => (
          // Os itinerários de um resultado não mudam de ordem: o índice serve de chave.
          <li key={index}>
            <button
              type="button"
              className="route-option"
              aria-pressed={itinerary === selected}
              onClick={() => props.onSelect(index)}
            >
              <span className="route-duration">{formatDuration(itinerary.duration, t)}</span>
              <span className="route-meta">
                {t('transit.times', { start: clock(itinerary.start), end: clock(itinerary.end) })} ·{' '}
                {t('transit.transfers', { count: itinerary.transfers })}
                {itinerary.walkDistance > 0 &&
                  ` · ${t('transit.walkDistance', { distance: formatDistance(itinerary.walkDistance, locale) })}`}
              </span>
              <LegSummary legs={itinerary.legs} />
            </button>
          </li>
        ))}
      </ul>

      {selected && (
        <ol id={props.stepsId} className="steps transit-steps" aria-label={t('transit.steps')}>
          {selected.legs.map((leg, index) => {
            const last = index === selected.legs.length - 1;
            const fromName = index === 0 ? props.originName : leg.from.name;
            const toName = last ? props.destinationName : leg.to.name;
            if (leg.kind === 'walk') {
              return (
                // Os troços de um itinerário não mudam de ordem: o índice serve de chave.
                <li key={index} className="step">
                  <Icon name="walk" size={24} />
                  <span className="step-text">
                    <span>{t('transit.walkTo', { place: toName })}</span>
                    <span className="muted">
                      {formatDuration(leg.duration, t)}
                      {leg.distance !== undefined &&
                        leg.distance > 0 &&
                        ` · ${formatDistance(leg.distance, locale)}`}
                    </span>
                  </span>
                </li>
              );
            }
            return (
              <li key={index} className="step">
                <LineBadge leg={leg} />
                <span className="step-text">
                  <span>
                    {leg.headsign
                      ? t('transit.towards', { place: leg.headsign })
                      : (leg.lineName ?? t(`transit.kinds.${leg.kind}`))}
                  </span>
                  <span>
                    <time className="transit-time">{clock(leg.start)}</time>{' '}
                    {t('transit.board', { place: fromName })}
                    {leg.from.track && ` · ${t('transit.track', { track: leg.from.track })}`}
                  </span>
                  <span>
                    <time className="transit-time">{clock(leg.end)}</time>{' '}
                    {t('transit.alight', { place: toName })}
                  </span>
                  <span className="muted">
                    {t('transit.stops', { count: leg.stops + 1 })} ·{' '}
                    {formatDuration(leg.duration, t)}
                    {leg.agency && ` · ${leg.agency}`}
                  </span>
                  <RealTimeText leg={leg} />
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <p className="muted">{t('transit.disclaimer')}</p>
      <p className="muted">
        <a href="https://transitous.org/sources/" target="_blank" rel="noopener noreferrer">
          {t('transit.attribution')}
        </a>{' '}
        ·{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
          {t('transit.osm')}
        </a>
      </p>
    </>
  );
}
