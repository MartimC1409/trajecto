import type { TFunction } from 'i18next';

/** Distância para mostrar ("350 m", "1,2 km") ou para dizer em voz alta ("350 metros"). */
export function formatDistance(meters: number, locale: string, spoken = false): string {
  const unitDisplay = spoken ? 'long' : 'short';
  const safe = Number.isFinite(meters) && meters > 0 ? meters : 0;
  if (safe < 1000) {
    const rounded = safe < 100 ? Math.round(safe / 10) * 10 : Math.round(safe / 50) * 50;
    if (rounded < 1000) {
      return new Intl.NumberFormat(locale, { style: 'unit', unit: 'meter', unitDisplay }).format(
        rounded,
      );
    }
  }
  const km = safe / 1000;
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: 'kilometer',
    unitDisplay,
    maximumFractionDigits: km < 10 ? 1 : 0,
  }).format(km);
}

/** Duração legível: "< 1 min", "12 min", "1 h 05 min". */
export function formatDuration(seconds: number, t: TFunction): string {
  const minutes = Math.round((Number.isFinite(seconds) ? Math.max(0, seconds) : 0) / 60);
  if (minutes < 1) return t('format.lessThanMinute');
  if (minutes < 60) return t('format.minutes', { m: minutes });
  const h = Math.floor(minutes / 60);
  return t('format.hoursMinutes', { h, m: String(minutes % 60).padStart(2, '0') });
}

/** Hora do relógio ("14:35"). */
export function formatClock(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date);
}

export function formatEuros(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(value);
}
