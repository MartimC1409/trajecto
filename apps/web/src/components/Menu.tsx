import type {
  Favorite,
  FuelPreferences,
  HistoryEntry,
  Language,
  Place,
  Preferences,
  ThemePreference,
} from '@trajecto/core';
import { FUEL_LIMITS, LANGUAGES, sortFavorites } from '@trajecto/core';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LANGUAGE_NAMES } from '../i18n';
import { ConfirmButton } from './ConfirmButton';
import { Icon } from './Icon';
import { placeText } from './placeText';

interface MenuProps {
  readonly open: boolean;
  readonly id: string;
  readonly favorites: readonly Favorite[];
  readonly history: readonly HistoryEntry[];
  readonly preferences: Preferences;
  readonly onClose: () => void;
  readonly onShowPlace: (place: Place) => void;
  readonly onRemoveFavorite: (favoriteId: string) => void;
  readonly onRemoveHistory: (placeId: string) => void;
  readonly onClearHistory: () => void;
  readonly onClearAll: () => void;
  readonly onSetTheme: (theme: ThemePreference) => void;
  readonly onSetLanguage: (language: Language) => void;
  readonly onSetHistoryEnabled: (enabled: boolean) => void;
  readonly onSetVoiceGuidance: (enabled: boolean) => void;
  readonly onSetFuel: (fuel: FuelPreferences) => void;
}

/** Campo numérico que aceita vírgula decimal e só grava valores dentro dos limites. */
function NumberField(props: {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly describedBy: string;
  readonly onChange: (value: number) => void;
}) {
  const format = (value: number) => String(value).replace('.', ',');
  const [text, setText] = useState(() => format(props.value));
  const [shown, setShown] = useState(props.value);
  const parsed = Number(text.trim().replace(',', '.'));
  // O valor mudou fora deste campo (por exemplo, ao apagar todos os dados): mostrar o novo.
  if (props.value !== shown) {
    setShown(props.value);
    if (parsed !== props.value) setText(format(props.value));
  }
  const valid =
    text.trim() !== '' && Number.isFinite(parsed) && parsed >= props.min && parsed <= props.max;
  return (
    <label className="number-field">
      <span>{props.label}</span>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={text}
        aria-invalid={!valid}
        aria-describedby={props.describedBy}
        onChange={(event) => {
          setText(event.target.value);
          const value = Number(event.target.value.trim().replace(',', '.'));
          if (
            event.target.value.trim() !== '' &&
            Number.isFinite(value) &&
            value >= props.min &&
            value <= props.max
          ) {
            props.onChange(value);
          }
        }}
      />
    </label>
  );
}

const THEMES = [
  ['system', 'settings.themeSystem'],
  ['light', 'settings.themeLight'],
  ['dark', 'settings.themeDark'],
] as const;

export function Menu(props: MenuProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { open, onClose } = props;

  // Ao abrir, o foco vai para o título; Escape fecha o menu.
  useEffect(() => {
    if (!open) return;
    headingRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const favorites = sortFavorites(props.favorites);
  const kindLabel = (kind: Favorite['kind']) =>
    t(kind === 'home' ? 'favorites.home' : kind === 'work' ? 'favorites.work' : 'favorites.other');

  return (
    <aside id={props.id} className="drawer" aria-labelledby={titleId} hidden={!open}>
      <div className="drawer-header">
        <h2 id={titleId} ref={headingRef} tabIndex={-1}>
          {t('menu.title')}
        </h2>
        <button
          type="button"
          className="icon-button"
          aria-label={t('menu.close')}
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>

      <section aria-labelledby={`${titleId}-fav`}>
        <h3 id={`${titleId}-fav`}>{t('menu.favorites')}</h3>
        {favorites.length === 0 ? (
          <p className="muted">{t('favorites.empty')}</p>
        ) : (
          <ul className="place-list">
            {favorites.map((f) => {
              const { title, subtitle } = placeText(f.place, t);
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    className="place-item"
                    aria-label={t('favorites.show', { name: `${kindLabel(f.kind)}: ${title}` })}
                    onClick={() => props.onShowPlace(f.place)}
                  >
                    <Icon name={f.kind === 'home' ? 'home' : f.kind === 'work' ? 'work' : 'star'} />
                    <span className="option-text">
                      <span className="option-title">
                        {f.kind === 'other' ? title : `${kindLabel(f.kind)} · ${title}`}
                      </span>
                      {subtitle && <span className="option-subtitle">{subtitle}</span>}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={t('favorites.remove', { name: title })}
                    onClick={() => props.onRemoveFavorite(f.id)}
                  >
                    <Icon name="trash" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby={`${titleId}-hist`}>
        <h3 id={`${titleId}-hist`}>{t('menu.history')}</h3>
        {!props.preferences.historyEnabled && <p className="muted">{t('history.disabled')}</p>}
        {props.history.length === 0 ? (
          props.preferences.historyEnabled && <p className="muted">{t('history.empty')}</p>
        ) : (
          <>
            <ul className="place-list">
              {props.history.map((h) => {
                const { title, subtitle } = placeText(h.place, t);
                return (
                  <li key={h.place.id}>
                    <button
                      type="button"
                      className="place-item"
                      aria-label={t('history.show', { name: title })}
                      onClick={() => props.onShowPlace(h.place)}
                    >
                      <Icon name="clock" />
                      <span className="option-text">
                        <span className="option-title">{title}</span>
                        {subtitle && <span className="option-subtitle">{subtitle}</span>}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={t('history.remove', { name: title })}
                      onClick={() => props.onRemoveHistory(h.place.id)}
                    >
                      <Icon name="trash" />
                    </button>
                  </li>
                );
              })}
            </ul>
            <ConfirmButton
              label={t('history.clear')}
              confirmLabel={t('history.confirmClear')}
              onConfirm={props.onClearHistory}
            />
          </>
        )}
      </section>

      <section aria-labelledby={`${titleId}-set`}>
        <h3 id={`${titleId}-set`}>{t('menu.settings')}</h3>
        <fieldset className="field">
          <legend>{t('settings.theme')}</legend>
          {THEMES.map(([value, key]) => (
            <label key={value} className="radio">
              <input
                type="radio"
                name={`${titleId}-theme`}
                value={value}
                checked={props.preferences.theme === value}
                onChange={() => props.onSetTheme(value)}
              />
              {t(key)}
            </label>
          ))}
        </fieldset>
        {/* Botões de opção em vez de <select>: com duas línguas são mais claros e evitam uma
            violação da CSP que o WebKit (Safari) gera ao manipular elementos <select>. */}
        <fieldset className="field">
          <legend>{t('settings.language')}</legend>
          {LANGUAGES.map((lang) => (
            <label key={lang} className="radio">
              <input
                type="radio"
                name={`${titleId}-lang`}
                value={lang}
                checked={props.preferences.language === lang}
                onChange={() => props.onSetLanguage(lang)}
              />
              <span lang={lang}>{LANGUAGE_NAMES[lang]}</span>
            </label>
          ))}
        </fieldset>
        <div className="field">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={props.preferences.historyEnabled}
              aria-describedby={`${titleId}-hist-hint`}
              onChange={(event) => props.onSetHistoryEnabled(event.target.checked)}
            />
            {t('settings.history')}
          </label>
          <p id={`${titleId}-hist-hint`} className="muted">
            {t('settings.historyHint')}
          </p>
        </div>
        <h4>{t('settings.navigation')}</h4>
        <div className="field">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={props.preferences.voiceGuidance}
              aria-describedby={`${titleId}-voice-hint`}
              onChange={(event) => props.onSetVoiceGuidance(event.target.checked)}
            />
            {t('settings.voice')}
          </label>
          <p id={`${titleId}-voice-hint`} className="muted">
            {t('settings.voiceHint')}
          </p>
        </div>
        <fieldset className="field">
          <legend>{t('settings.fuel')}</legend>
          <NumberField
            label={t('settings.carConsumption')}
            value={props.preferences.fuel.carLitresPer100Km}
            min={FUEL_LIMITS.litresPer100Km.min}
            max={FUEL_LIMITS.litresPer100Km.max}
            describedBy={`${titleId}-fuel-hint`}
            onChange={(value) =>
              props.onSetFuel({ ...props.preferences.fuel, carLitresPer100Km: value })
            }
          />
          <NumberField
            label={t('settings.motorcycleConsumption')}
            value={props.preferences.fuel.motorcycleLitresPer100Km}
            min={FUEL_LIMITS.litresPer100Km.min}
            max={FUEL_LIMITS.litresPer100Km.max}
            describedBy={`${titleId}-fuel-hint`}
            onChange={(value) =>
              props.onSetFuel({ ...props.preferences.fuel, motorcycleLitresPer100Km: value })
            }
          />
          <NumberField
            label={t('settings.fuelPrice')}
            value={props.preferences.fuel.pricePerLitre}
            min={FUEL_LIMITS.pricePerLitre.min}
            max={FUEL_LIMITS.pricePerLitre.max}
            describedBy={`${titleId}-fuel-hint`}
            onChange={(value) =>
              props.onSetFuel({ ...props.preferences.fuel, pricePerLitre: value })
            }
          />
          <p id={`${titleId}-fuel-hint`} className="muted">
            {t('settings.fuelHint')}
          </p>
        </fieldset>
        <div className="field">
          <ConfirmButton
            label={t('settings.clearAll')}
            confirmLabel={t('settings.confirmClearAll')}
            onConfirm={props.onClearAll}
          />
          <p className="muted">{t('settings.clearAllHint')}</p>
        </div>
      </section>

      <section aria-labelledby={`${titleId}-about`}>
        <h3 id={`${titleId}-about`}>{t('menu.about')}</h3>
        <p>{t('about.text')}</p>
        <p className="muted">{t('about.privacy')}</p>
        <p className="muted">{t('about.routingPrivacy')}</p>
        <h4>{t('about.dataTitle')}</h4>
        <ul className="attributions">
          <li>
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('about.osm')}
            </a>
          </li>
          <li>
            <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener noreferrer">
              {t('about.omt')}
            </a>
          </li>
          <li>
            <a href="https://photon.komoot.io/" target="_blank" rel="noopener noreferrer">
              {t('about.photon')}
            </a>
          </li>
          <li>
            <a
              href="https://valhalla.github.io/valhalla/"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('about.valhalla')}
            </a>
          </li>
          <li>{t('about.fonts')}</li>
        </ul>
      </section>
    </aside>
  );
}
