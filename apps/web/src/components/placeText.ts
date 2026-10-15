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

/**
 * Categoria do local em texto (por exemplo "Farmácia"), a partir de "poi:pharmacy" (mapa) ou
 * "amenity:pharmacy" (pesquisa). `null` quando não há tradução para essa categoria.
 */
export function categoryLabel(category: string | undefined, t: TFunction): string | null {
  if (!category) return null;
  const value = category.slice(category.lastIndexOf(':') + 1);
  if (!/^[a-z_]{1,40}$/u.test(value)) return null;
  return t(`poi.categories.${value}`, { defaultValue: '' }) || null;
}
