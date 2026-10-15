import type { Favorite, GeocoderErrorCode, LngLat, Place } from '@trajecto/core';
import { formatLngLat } from '@trajecto/core';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';
import { placeText } from './placeText';

export type Selection =
  | { readonly status: 'loading'; readonly lngLat: LngLat }
  | {
      readonly status: 'ready';
      readonly place: Place;
      /** Geocodificação inversa sem morada encontrada. */
      readonly noAddress?: boolean;
      readonly error?: GeocoderErrorCode;
    };

interface PlaceSheetProps {
  readonly selection: Selection;
  readonly favorites: readonly Favorite[];
  readonly feedback: string | null;
  readonly onToggle: (kind: Favorite['kind']) => void;
  readonly onClose: () => void;
  readonly onDirections?: (place: Place) => void;
  readonly onReport?: (place: Place) => void;
}

export function PlaceSheet({
  selection,
  favorites,
  feedback,
  onToggle,
  onClose,
  onDirections,
  onReport,
}: PlaceSheetProps) {
  const { t } = useTranslation();
  const titleId = useId();

  const header =
    selection.status === 'loading'
      ? { title: t('place.loading'), subtitle: '', lngLat: selection.lngLat }
      : { ...placeText(selection.place, t), lngLat: selection.place.lngLat };

  const has = (kind: Favorite['kind']) => favorites.some((f) => f.kind === kind);

  return (
    <section className="sheet" aria-labelledby={titleId} aria-busy={selection.status === 'loading'}>
      <div className="sheet-header">
        <h2 id={titleId} className="sheet-title">
          {header.title}
        </h2>
        <button
          type="button"
          className="icon-button"
          aria-label={t('place.close')}
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
      {header.subtitle && <p className="sheet-subtitle">{header.subtitle}</p>}
      {selection.status === 'ready' && selection.noAddress && (
        <p className="sheet-note">{t('place.noAddress')}</p>
      )}
      {selection.status === 'ready' && selection.error && (
        <p className="sheet-note" role="alert">
          {t('place.reverseError', { reason: t(`search.errors.${selection.error}`) })}
        </p>
      )}
      <p className="sheet-coords">
        <span className="visually-hidden">{t('place.coordinates')}: </span>
        {formatLngLat(header.lngLat)}
      </p>

      {selection.status === 'ready' && onDirections && (
        <div className="sheet-actions">
          <button
            type="button"
            className="button primary"
            onClick={() => onDirections(selection.place)}
          >
            <Icon name="directions" />
            {t('directions.open')}
          </button>
          {onReport && (
            <button type="button" className="button" onClick={() => onReport(selection.place)}>
              <Icon name="report" />
              {t('reports.reportHere')}
            </button>
          )}
        </div>
      )}
      {selection.status === 'ready' && (
        <div className="sheet-actions" role="group" aria-label={t('place.saveAs')}>
          {(['home', 'work', 'other'] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              className="button toggle"
              aria-pressed={has(kind)}
              onClick={() => onToggle(kind)}
            >
              <Icon name={kind === 'home' ? 'home' : kind === 'work' ? 'work' : 'star'} />
              {t(
                kind === 'home' ? 'place.home' : kind === 'work' ? 'place.work' : 'place.favorite',
              )}
            </button>
          ))}
        </div>
      )}
      <p className="sheet-feedback" role="status" aria-live="polite">
        {feedback}
      </p>
    </section>
  );
}
