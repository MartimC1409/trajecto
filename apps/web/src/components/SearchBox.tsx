import type { Favorite, Geocoder, Place, SearchBias } from '@trajecto/core';
import { MAX_QUERY_LENGTH, MIN_QUERY_LENGTH, sortFavorites } from '@trajecto/core';
import type { KeyboardEvent } from 'react';
import { useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGeocoderSearch } from '../hooks/useGeocoderSearch';
import type { IconName } from './Icon';
import { Icon } from './Icon';
import { placeText } from './placeText';

const MAX_SUGGESTIONS = 5;

interface SearchBoxProps {
  readonly geocoder: Geocoder;
  readonly getBias: () => SearchBias | undefined;
  readonly favorites: readonly Favorite[];
  readonly recent: readonly Place[];
  readonly onSelect: (place: Place) => void;
}

interface Option {
  readonly key: string;
  readonly place: Place;
  readonly title: string;
  readonly subtitle: string;
  /** Texto que fica no campo depois de escolher a opção. */
  readonly inputText: string;
  readonly icon: IconName;
  readonly group: 'favorites' | 'recent' | 'results';
}

const FAVORITE_ICON: Record<Favorite['kind'], IconName> = {
  home: 'home',
  work: 'work',
  other: 'star',
};

/**
 * Caixa de pesquisa com autocompletar, segundo o padrão "combobox" da WAI-ARIA:
 * setas para navegar, Enter para escolher, Escape para fechar ou limpar.
 */
export function SearchBox({ geocoder, getBias, favorites, recent, onSelect }: SearchBoxProps) {
  const { t } = useTranslation();
  const id = useId();
  const inputId = `${id}-input`;
  const listId = `${id}-list`;
  const inputRef = useRef<HTMLInputElement>(null);

  // O texto visível e o texto pesquisado são separados: ao escolher um resultado, mostramos
  // o nome escolhido sem disparar uma nova pesquisa ao servidor.
  const [inputValue, setInputValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const search = useGeocoderSearch(geocoder, searchQuery, getBias);

  const options = useMemo<Option[]>(() => {
    if (inputValue.trim() === '') {
      const favs = sortFavorites(favorites)
        .slice(0, MAX_SUGGESTIONS)
        .map((f) => {
          const text = placeText(f.place, t);
          // Casa e Trabalho aparecem pelo nome do tipo ("Casa"), com a morada por baixo.
          const special = f.kind !== 'other';
          return {
            key: `fav-${f.id}`,
            place: f.place,
            title: special
              ? t(f.kind === 'home' ? 'favorites.home' : 'favorites.work')
              : text.title,
            subtitle: special
              ? [text.title, text.subtitle].filter(Boolean).join(', ')
              : text.subtitle,
            inputText: text.title,
            icon: FAVORITE_ICON[f.kind],
            group: 'favorites' as const,
          };
        });
      const recents = recent.slice(0, MAX_SUGGESTIONS).map((p) => {
        const text = placeText(p, t);
        return {
          key: `recent-${p.id}`,
          place: p,
          ...text,
          inputText: text.title,
          icon: 'clock' as const,
          group: 'recent' as const,
        };
      });
      return [...favs, ...recents];
    }
    const results =
      search.status === 'success' || search.status === 'loading' ? search.results : [];
    return results.map((p) => {
      const text = placeText(p, t);
      return {
        key: `result-${p.id}`,
        place: p,
        ...text,
        inputText: text.title,
        icon: 'pin' as const,
        group: 'results' as const,
      };
    });
  }, [inputValue, favorites, recent, search, t]);

  const showList = open && options.length > 0;
  const activeOption = active >= 0 && active < options.length ? options[active] : undefined;

  const hasResults = search.status === 'success' && search.results.length > 0;
  let status = '';
  if (open && inputValue.trim() !== '') {
    if (search.status === 'too_short') status = t('search.tooShort', { min: MIN_QUERY_LENGTH });
    else if (search.status === 'loading') status = t('search.loading');
    else if (search.status === 'error') status = t(`search.errors.${search.code}`);
    else if (search.status === 'success')
      status =
        search.results.length === 0
          ? t('search.empty')
          : t('search.count', { count: search.results.length });
  }

  function choose(option: Option) {
    onSelect(option.place);
    setInputValue(option.inputText);
    setSearchQuery('');
    setOpen(false);
    setActive(-1);
  }

  function clear() {
    setInputValue('');
    setSearchQuery('');
    setActive(-1);
    setOpen(true);
    inputRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setOpen(true);
        if (options.length > 0) setActive((i) => (i + 1) % options.length);
        break;
      case 'ArrowUp':
        event.preventDefault();
        setOpen(true);
        if (options.length > 0) setActive((i) => (i <= 0 ? options.length - 1 : i - 1));
        break;
      case 'Enter': {
        const option = activeOption ?? (showList ? options[0] : undefined);
        if (option) {
          event.preventDefault();
          choose(option);
        }
        break;
      }
      case 'Escape':
        event.preventDefault();
        if (open) {
          setOpen(false);
          setActive(-1);
        } else if (inputValue !== '') {
          clear();
        }
        break;
      default:
        break;
    }
  }

  return (
    <div className="search" role="search">
      <label htmlFor={inputId} className="visually-hidden">
        {t('search.label')}
      </label>
      <div className="search-field">
        <Icon name="search" />
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={activeOption ? `${listId}-${activeOption.key}` : undefined}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          maxLength={MAX_QUERY_LENGTH}
          placeholder={t('search.placeholder')}
          value={inputValue}
          onChange={(event) => {
            setInputValue(event.target.value);
            setSearchQuery(event.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            setOpen(false);
            setActive(-1);
          }}
          onKeyDown={onKeyDown}
        />
        {inputValue !== '' && (
          <button
            type="button"
            className="icon-button"
            aria-label={t('search.clear')}
            onClick={clear}
          >
            <Icon name="close" />
          </button>
        )}
      </div>

      <ul
        id={listId}
        role="listbox"
        aria-label={t('search.results')}
        className="search-list"
        hidden={!showList}
      >
        {options.map((option, index) => {
          // Cabeçalho de grupo ("Favoritos", "Recentes") antes da primeira opção de cada grupo.
          const startsGroup = index === 0 || options[index - 1]?.group !== option.group;
          const header =
            startsGroup && option.group !== 'results' ? (
              <li key={`header-${option.group}`} role="presentation" className="search-group">
                {t(option.group === 'favorites' ? 'search.favorites' : 'search.recent')}
              </li>
            ) : null;
          return [
            header,
            <li
              key={option.key}
              id={`${listId}-${option.key}`}
              role="option"
              aria-selected={option === activeOption}
              className="search-option"
              // Evita perder o foco do campo antes do clique ser tratado.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(option)}
            >
              <Icon name={option.icon} />
              <span className="option-text">
                <span className="option-title">{option.title}</span>
                {option.subtitle && <span className="option-subtitle">{option.subtitle}</span>}
              </span>
            </li>,
          ];
        })}
      </ul>

      <div
        role="status"
        aria-live="polite"
        // A contagem de resultados só é anunciada a leitores de ecrã; avisos e erros também se veem.
        className={status && !hasResults ? 'search-status' : 'visually-hidden'}
      >
        {status}
      </div>
    </div>
  );
}
