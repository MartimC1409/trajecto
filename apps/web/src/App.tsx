import type { Favorite, LngLat, MapViewState, Place, Route, SearchBias } from '@trajecto/core';
import { GeocoderError, coordinatePlace, isAbortError } from '@trajecto/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DirectionsPanel } from './components/DirectionsPanel';
import { Icon } from './components/Icon';
import { Menu } from './components/Menu';
import { NavigationView } from './components/NavigationView';
import type { Selection } from './components/PlaceSheet';
import { PlaceSheet } from './components/PlaceSheet';
import { SearchBox } from './components/SearchBox';
import type { AppConfig } from './config';
import { useResolvedTheme } from './hooks/useResolvedTheme';
import { useStore } from './hooks/useStore';
import { useWakeLock } from './hooks/useWakeLock';
import type { FocusRequest, MapApi, RouteMarker } from './map/MapView';
import { MapView } from './map/MapView';
import type { NavigationTarget } from './navigation/session';
import { useNavigation } from './navigation/useNavigation';
import { useServices } from './services';

const MENU_ID = 'app-menu';

export function App({ config }: { config: AppConfig }) {
  const { t, i18n } = useTranslation();
  const services = useServices();
  const { geocoder, places, preferences, storagePersistent } = services;
  const prefs = useStore(preferences);
  const placesState = useStore(places);
  const theme = useResolvedTheme(prefs.theme);

  const [selection, setSelection] = useState<Selection | null>(null);
  const [focus, setFocus] = useState<FocusRequest | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const mapApiRef = useRef<MapApi | null>(null);
  const reverseRef = useRef<AbortController | null>(null);
  const focusSeq = useRef(0);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  // A vista inicial só é lida uma vez; depois o mapa é a fonte de verdade.
  const [initialView] = useState(() => preferences.getSnapshot().lastView);

  // Direções: o painel é recriado (estado limpo) para cada novo destino.
  const [directions, setDirections] = useState<{ seq: number; place: Place } | null>(null);
  const directionsSeq = useRef(0);
  const [routeView, setRouteView] = useState<{
    routes: readonly Route[];
    markers: readonly RouteMarker[];
  }>({ routes: [], markers: [] });
  // A rota escolhida só vale para o resultado em que foi escolhida.
  const [routeChoice, setRouteChoice] = useState<{
    routes: readonly Route[];
    index: number;
  } | null>(null);
  const selectedRoute =
    routeChoice && routeChoice.routes === routeView.routes ? routeChoice.index : 0;

  const navigation = useNavigation(services, prefs.voiceGuidance);
  const navState = navigation.state;
  const [follow, setFollow] = useState(true);
  const wakeLockSupported = useWakeLock(navState !== null);

  useEffect(() => {
    if (i18n.language !== prefs.language) {
      void i18n.changeLanguage(prefs.language);
      document.documentElement.lang = prefs.language;
    }
  }, [i18n, prefs.language]);

  // Cancela pedidos pendentes quando a app é desmontada.
  useEffect(() => () => reverseRef.current?.abort(), []);

  const getBias = useCallback((): SearchBias | undefined => {
    const view = mapApiRef.current?.getView();
    return view ? { lngLat: view.center, zoom: view.zoom } : undefined;
  }, []);

  const focusOn = useCallback((place: Place) => {
    focusSeq.current += 1;
    setFocus({
      seq: focusSeq.current,
      lngLat: place.lngLat,
      ...(place.bbox ? { bbox: place.bbox } : {}),
    });
  }, []);

  const showPlace = useCallback(
    (place: Place, options: { record: boolean }) => {
      reverseRef.current?.abort();
      setFeedback(null);
      setSelection({ status: 'ready', place });
      focusOn(place);
      if (options.record && preferences.getSnapshot().historyEnabled) places.addToHistory(place);
    },
    [focusOn, places, preferences],
  );

  const reverseAt = useCallback(
    (lngLat: LngLat) => {
      reverseRef.current?.abort();
      const controller = new AbortController();
      reverseRef.current = controller;
      setFeedback(null);
      setSelection({ status: 'loading', lngLat });
      geocoder
        .reverse(lngLat, { signal: controller.signal })
        .then((place) => {
          if (controller.signal.aborted) return;
          setSelection(
            place
              ? { status: 'ready', place }
              : { status: 'ready', place: coordinatePlace(lngLat), noAddress: true },
          );
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted || isAbortError(error)) return;
          setSelection({
            status: 'ready',
            place: coordinatePlace(lngLat),
            error: error instanceof GeocoderError ? error.code : 'unavailable',
          });
        });
    },
    [geocoder],
  );

  const selectedPlace = selection?.status === 'ready' ? selection.place : null;
  const selectedFavorites = useMemo(
    () =>
      selectedPlace ? placesState.favorites.filter((f) => f.place.id === selectedPlace.id) : [],
    [placesState.favorites, selectedPlace],
  );

  function toggleFavorite(kind: Favorite['kind']) {
    if (!selectedPlace) return;
    const existing = selectedFavorites.find((f) => f.kind === kind);
    if (existing) {
      places.removeFavorite(existing.id);
      setFeedback(t('place.removed'));
      return;
    }
    if (kind === 'other') {
      const result = places.addFavorite(selectedPlace);
      setFeedback(t(result === 'limit_reached' ? 'place.limitReached' : 'place.savedFavorite'));
    } else {
      places.setSpecial(kind, selectedPlace);
      setFeedback(t(kind === 'home' ? 'place.savedHome' : 'place.savedWork'));
    }
  }

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    menuButtonRef.current?.focus();
  }, []);

  const onViewChange = useCallback(
    (view: MapViewState) => preferences.set('lastView', view),
    [preferences],
  );

  const onReady = useCallback((api: MapApi | null) => {
    mapApiRef.current = api;
  }, []);

  const onRoutesChange = useCallback(
    (routes: readonly Route[], markers: readonly RouteMarker[]) =>
      setRouteView({ routes, markers }),
    [],
  );

  function openDirections(place: Place) {
    reverseRef.current?.abort();
    directionsSeq.current += 1;
    setDirections({ seq: directionsSeq.current, place });
    setSelection(null);
  }

  function closeDirections() {
    setDirections(null);
    setRouteView({ routes: [], markers: [] });
  }

  function startNavigation(target: NavigationTarget) {
    setFollow(true);
    navigation.start(target);
  }

  const recent = useMemo(() => placesState.history.map((h) => h.place), [placesState.history]);
  const navMarkers = useMemo(
    () => routeView.markers.filter((marker) => marker.kind !== 'origin'),
    [routeView.markers],
  );
  const navRoute = navState?.route;
  const navRoutes = useMemo(() => (navRoute ? [navRoute] : []), [navRoute]);

  // Um local já guardado tem o seu próprio marcador; não sobrepomos o marcador vermelho.
  const selectedLngLat =
    selection?.status === 'loading'
      ? selection.lngLat
      : selectedFavorites.length > 0
        ? null
        : (selectedPlace?.lngLat ?? null);

  const navigating = navState !== null;

  return (
    <div className={navigating ? 'app navigating' : 'app'}>
      {!navigating && (
        <header className="topbar">
          <button
            ref={menuButtonRef}
            type="button"
            className="icon-button menu-button"
            aria-label={menuOpen ? t('menu.close') : t('menu.open')}
            aria-expanded={menuOpen}
            aria-controls={MENU_ID}
            onClick={() => (menuOpen ? closeMenu() : setMenuOpen(true))}
          >
            <Icon name="menu" />
          </button>
          <SearchBox
            geocoder={geocoder}
            getBias={getBias}
            favorites={placesState.favorites}
            recent={recent}
            onSelect={(place) => showPlace(place, { record: true })}
          />
        </header>
      )}

      {!navigating && (!storagePersistent || !places.isPersistent()) && (
        <p className="banner" role="alert">
          {t('app.storageWarning')}
        </p>
      )}

      <main className="map-area">
        <h1 className="visually-hidden">{t('app.name')}</h1>
        <MapView
          config={config}
          theme={theme}
          initialView={initialView}
          selected={directions || navigating ? null : selectedLngLat}
          focus={focus}
          favorites={placesState.favorites}
          onMapClick={directions || navigating ? ignoreClick : reverseAt}
          onFavoriteClick={(favorite) => {
            if (!directions && !navigating) showPlace(favorite.place, { record: false });
          }}
          onViewChange={onViewChange}
          onReady={onReady}
          routes={navigating ? navRoutes : routeView.routes}
          selectedRoute={navigating ? 0 : selectedRoute}
          routeMarkers={navigating ? navMarkers : routeView.markers}
          navigation={
            navState ? { position: navState.position, follow, mode: navState.route.mode } : null
          }
          onRouteClick={(index) => setRouteChoice({ routes: routeView.routes, index })}
          onUserMove={() => setFollow(false)}
        />
        {!directions && !navigating && (
          <button
            type="button"
            className="button floating whats-here"
            title={t('map.whatsHereHint')}
            onClick={() => {
              const view = mapApiRef.current?.getView();
              if (view) reverseAt(view.center);
            }}
          >
            <Icon name="target" />
            {t('map.whatsHere')}
          </button>
        )}
      </main>

      {selection && !directions && !navigating && (
        <PlaceSheet
          selection={selection}
          favorites={selectedFavorites}
          feedback={feedback}
          onToggle={toggleFavorite}
          onDirections={openDirections}
          onClose={() => {
            reverseRef.current?.abort();
            setSelection(null);
          }}
        />
      )}

      {directions && (
        <DirectionsPanel
          key={directions.seq}
          destination={directions.place}
          hidden={navigating}
          selectedRoute={selectedRoute}
          favorites={placesState.favorites}
          recent={recent}
          getBias={getBias}
          onSelectRoute={(index) => setRouteChoice({ routes: routeView.routes, index })}
          onRoutesChange={onRoutesChange}
          onStart={startNavigation}
          onClose={closeDirections}
        />
      )}

      {navState && (
        <NavigationView
          state={navState}
          voiceEnabled={prefs.voiceGuidance}
          voiceSupported={navigation.voiceSupported}
          wakeLockSupported={wakeLockSupported}
          follow={follow}
          onToggleVoice={() => preferences.set('voiceGuidance', !prefs.voiceGuidance)}
          onRecenter={() => setFollow(true)}
          onSetSpeed={navigation.setSimulationSpeed}
          onEnd={navigation.stop}
        />
      )}

      <Menu
        id={MENU_ID}
        open={menuOpen && !navigating}
        favorites={placesState.favorites}
        history={placesState.history}
        preferences={prefs}
        onClose={closeMenu}
        onShowPlace={(place) => {
          closeDirections();
          showPlace(place, { record: false });
          closeMenu();
        }}
        onRemoveFavorite={(id) => places.removeFavorite(id)}
        onRemoveHistory={(id) => places.removeFromHistory(id)}
        onClearHistory={() => places.clearHistory()}
        onClearAll={() => {
          places.clearAll();
          preferences.reset();
          setSelection(null);
        }}
        onSetTheme={(value) => preferences.set('theme', value)}
        onSetLanguage={(value) => preferences.set('language', value)}
        onSetHistoryEnabled={(enabled) => preferences.set('historyEnabled', enabled)}
        onSetVoiceGuidance={(enabled) => preferences.set('voiceGuidance', enabled)}
        onSetFuel={(fuel) => preferences.set('fuel', fuel)}
      />
    </div>
  );
}

/** Durante as direções e a navegação, tocar no mapa não abre a ficha de um local. */
function ignoreClick(): void {}
