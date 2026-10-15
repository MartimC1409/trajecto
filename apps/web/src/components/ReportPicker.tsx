import type { ReportType } from '@trajecto/core';
import { REPORT_TYPES } from '@trajecto/core';
import { useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';

interface ReportPickerProps {
  /** Mostra o tipo "Polícia" (interruptor do ADR 0008). */
  readonly police: boolean;
  readonly onPick: (type: ReportType) => void;
  readonly onClose: () => void;
}

/** Escolha do tipo de reporte, com botões grandes (pode ser usado a conduzir, parado). */
export function ReportPicker({ police, onPick, onClose }: ReportPickerProps) {
  const { t } = useTranslation();
  const id = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Ao abrir, o foco vai para o título; ao fechar, volta para onde estava (o botão Reportar).
  useEffect(() => {
    const previous = document.activeElement;
    headingRef.current?.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const types = REPORT_TYPES.filter((type) => police || type !== 'police');
  return (
    <section className="report-picker" aria-labelledby={`${id}-title`}>
      <div className="sheet-header">
        <h2 id={`${id}-title`} ref={headingRef} tabIndex={-1} className="sheet-title">
          {t('reports.title')}
        </h2>
        <button
          type="button"
          className="icon-button"
          aria-label={t('reports.close')}
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
      <div className="report-grid">
        {types.map((type) => (
          <button
            key={type}
            type="button"
            className={`report-option report-${type}`}
            onClick={() => onPick(type)}
          >
            <Icon name={type} size={32} />
            <span>{t(`reports.types.${type}`)}</span>
          </button>
        ))}
      </div>
      <p className="muted">{t('reports.localOnly')}</p>
    </section>
  );
}
