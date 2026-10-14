import type { Language } from '@trajecto/core';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './en';
import { ptPT } from './pt-PT';

export const LANGUAGE_NAMES: Record<Language, string> = {
  'pt-PT': 'Português (Portugal)',
  en: 'English',
};

/** Inicializa o i18next. Português europeu é a língua base e de recurso. */
export async function initI18n(language: Language): Promise<typeof i18next> {
  if (!i18next.isInitialized) {
    await i18next.use(initReactI18next).init({
      resources: { 'pt-PT': { translation: ptPT }, en: { translation: en } },
      lng: language,
      fallbackLng: 'pt-PT',
      supportedLngs: ['pt-PT', 'en'],
      interpolation: { escapeValue: false }, // o React já escapa o texto
    });
  } else if (i18next.language !== language) {
    await i18next.changeLanguage(language);
  }
  document.documentElement.lang = language;
  return i18next;
}
