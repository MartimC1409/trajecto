import type { BBox, Geocoder, OfflineArea } from '@trajecto/core';
import { MAX_OFFLINE_AREAS, OFFLINE_LIMITS } from '@trajecto/core';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatBytes } from '../format';
import type { OfflineAreasApi } from '../hooks/useOfflineAreas';
import { ConfirmButton } from './ConfirmButton';

const NAME_TIMEOUT_MS = 4000;

interface OfflineMapsProps {
  readonly api: OfflineAreasApi;
  /** Zona visível no mapa (`undefined` se o mapa ainda não abriu). */
  readonly getBounds: () => BBox | undefined;
  readonly geocoder: Pick<Geocoder, 'reverse'>;
  readonly onShowArea: (bbox: BBox) => void;
  /** iPhone/iPad: os mapas só ficam protegidos com a app no ecrã principal. */
  readonly appleDevice?: boolean;
}

/** Nome da zona: a localidade no centro (pesquisa inversa), ou "Zona N" se não houver rede. */
async function areaName(
  geocoder: Pick<Geocoder, 'reverse'>,
  bbox: BBox,
  fallback: string,
): Promise<string> {
  const center = { lng: (bbox[0] + bbox[2]) / 2, lat: (bbox[1] + bbox[3]) / 2 };
  try {
    const place = await geocoder.reverse(center, { signal: AbortSignal.timeout(NAME_TIMEOUT_MS) });
    return place?.address.locality ?? place?.address.county ?? place?.name ?? fallback;
  } catch {
    return fallback;
  }
}

export function OfflineMaps(props: OfflineMapsProps) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const locale = i18n.language;
  const { api } = props;
  const [naming, setNaming] = useState(false);

  if (!api.supported) {
    return <p className="muted">{t('offline.unsupported')}</p>;
  }

  const bounds = props.getBounds();
  const check = bounds ? api.check(bounds) : null;
  const busy = api.active !== null || naming;

  function checkText(): string {
    if (!check) return t('offline.noMap');
    if (check.ok) return t('offline.estimate', { size: formatBytes(check.estimatedBytes, locale) });
    if (check.reason === 'outside_area') return t('offline.outside');
    if (check.reason === 'invalid') return t('offline.noMap');
    return t('offline.tooLarge', {
      size: formatBytes(check.estimatedBytes, locale),
      max: formatBytes(OFFLINE_LIMITS.maxBytes, locale),
    });
  }

  async function save() {
    if (!bounds || !check?.ok) return;
    setNaming(true);
    const name = await areaName(
      props.geocoder,
      check.bbox,
      t('offline.areaFallback', { n: api.areas.length + 1 }),
    );
    setNaming(false);
    await api.download(bounds, name);
  }

  const activeArea = api.active ? api.areas.find((a) => a.id === api.active?.areaId) : undefined;
  const percent = api.active?.progress.total
    ? Math.floor((api.active.progress.done / api.active.progress.total) * 100)
    : 0;

  return (
    <div className="offline-maps">
      <p className="muted">
        {t('offline.intro', { max: formatBytes(OFFLINE_LIMITS.maxBytes, locale) })}
      </p>
      <p id={`${id}-check`}>{checkText()}</p>
      <div className="sheet-actions">
        <button
          type="button"
          className="button primary"
          disabled={!check?.ok || busy || api.areas.length >= MAX_OFFLINE_AREAS}
          aria-describedby={`${id}-check`}
          onClick={() => void save()}
        >
          {t('offline.save')}
        </button>
      </div>

      {api.active && (
        <div className="offline-progress">
          <label htmlFor={`${id}-progress`}>
            {t('offline.saving', { name: activeArea?.name ?? '', percent })}
          </label>
          <progress id={`${id}-progress`} max={100} value={percent}>
            {percent} %
          </progress>
          <button type="button" className="button" onClick={api.cancel}>
            {t('offline.cancel')}
          </button>
        </div>
      )}

      <p className="offline-message" role="status" aria-live="polite">
        {api.message &&
          (api.message.kind === 'limit_reached'
            ? t('offline.messages.limit_reached', { max: MAX_OFFLINE_AREAS })
            : t(`offline.messages.${api.message.kind}`, {
                name: api.message.name,
                max: formatBytes(OFFLINE_LIMITS.maxBytes, locale),
              }))}
      </p>

      {api.areas.length > 0 && (
        <ul className="offline-list" aria-label={t('offline.saved')}>
          {api.areas.map((area) => (
            <OfflineAreaItem
              key={area.id}
              area={area}
              locale={locale}
              busy={busy}
              onShow={() => props.onShowArea(area.bbox)}
              onResume={() => void api.resume(area)}
              onRemove={() => void api.remove(area)}
            />
          ))}
        </ul>
      )}

      {api.storage?.usage !== undefined && (
        <p className="muted">
          {api.storage.quota !== undefined
            ? t('offline.storage', {
                used: formatBytes(api.storage.usage, locale),
                quota: formatBytes(api.storage.quota, locale),
              })
            : t('offline.storageUsed', { used: formatBytes(api.storage.usage, locale) })}
        </p>
      )}
      {api.areas.length > 0 && api.storage && !api.storage.persisted && (
        <p className="muted">
          {props.appleDevice ? t('offline.notPersistedApple') : t('offline.notPersisted')}
        </p>
      )}
    </div>
  );
}

function OfflineAreaItem(props: {
  area: OfflineArea;
  locale: string;
  busy: boolean;
  onShow: () => void;
  onResume: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const { area, locale } = props;
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'short' }).format(area.createdAt);
  return (
    <li className="offline-item">
      <span className="option-text">
        <span className="option-title">{area.name}</span>
        <span className="option-subtitle">
          {formatBytes(area.bytes, locale)} · {date}
          {!area.complete && ` · ${t('offline.incomplete')}`}
        </span>
      </span>
      <span className="offline-actions">
        <button type="button" className="button" onClick={props.onShow}>
          {t('offline.show')}
        </button>
        {!area.complete && (
          <button type="button" className="button" disabled={props.busy} onClick={props.onResume}>
            {t('offline.resume')}
          </button>
        )}
        <ConfirmButton
          label={t('offline.remove')}
          confirmLabel={t('offline.confirmRemove', { name: area.name })}
          onConfirm={props.onRemove}
        />
      </span>
    </li>
  );
}
