import type { Report } from '@trajecto/core';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { formatClock } from '../format';
import { Icon } from './Icon';

interface ReportSheetProps {
  readonly report: Report;
  readonly onConfirm: () => void;
  readonly onRemove: () => void;
  readonly onClose: () => void;
}

/** Detalhe de um reporte tocado no mapa: confirmar ou apagar. */
export function ReportSheet({ report, onConfirm, onRemove, onClose }: ReportSheetProps) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const locale = i18n.language;
  return (
    <section className="sheet" aria-labelledby={`${id}-title`}>
      <div className="sheet-header">
        <h2 id={`${id}-title`} className="sheet-title report-title">
          <Icon name={report.type} />
          {t(`reports.types.${report.type}`)}
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
      <p className="sheet-subtitle">
        {t('reports.reportedAt', { time: formatClock(new Date(report.createdAt), locale) })} ·{' '}
        {t('reports.expiresAt', { time: formatClock(new Date(report.expiresAt), locale) })}
      </p>
      {report.confirmations > 0 && (
        <p className="sheet-note">{t('reports.confirmations', { count: report.confirmations })}</p>
      )}
      <div className="sheet-actions">
        <button type="button" className="button primary" onClick={onConfirm}>
          {t('reports.stillThere')}
        </button>
        <button type="button" className="button" onClick={onRemove}>
          {t('reports.gone')}
        </button>
      </div>
      <p className="muted">{t('reports.localOnly')}</p>
    </section>
  );
}
