import type { Place } from '@trajecto/core';
import { formatLngLat, formatPlace } from '@trajecto/core';
import type { TFunction } from 'i18next';

/** Título e subtítulo prontos a mostrar, com texto genérico quando o local não tem nome. */
export function placeText(place: Place, t: TFunction): { title: string; subtitle: string } {
  const formatted = formatPlace(place);
  return {
    title: formatted.title ?? t('place.unnamed'),
    subtitle: formatted.subtitle || (formatted.title ? '' : formatLngLat(place.lngLat)),
  };
}
