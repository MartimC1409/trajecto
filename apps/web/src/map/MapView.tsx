import './worker';
import type { BBox, Favorite, LngLat, MapViewState, Route, TravelMode } from '@trajecto/core';
import type { GeoJSONSource } from 'maplibre-gl';
import {
  AttributionControl,
  GeolocateControl,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  ScaleControl,
} from 'maplibre-gl';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { iconSvg } from '../components/Icon';
import type { AppConfig } from '../config';
import { MAP_ATTRIBUTION, buildMapStyle } from './mapStyle';
import type { MapTheme } from './mapStyle';
import {
  ROUTE_HIT_LAYER,
  ROUTE_SOURCE,
  addRouteLayers,
  routesBounds,
  routesToGeoJson,
} from './routeLayers';

export interface MapApi {
  getView(): MapViewState;
}

/** Pedido para centrar o mapa; `seq` permite voltar a centrar no mesmo local. */
export interface FocusRequest {
  readonly seq: number;
  readonly lngLat: LngLat;
  readonly bbox?: BBox;
}

/** Marcador de um ponto da rota (partida, paragem ou destino). */
export interface RouteMarker {
  readonly lngLat: LngLat;
  readonly kind: 'origin' | 'stop' | 'destination';
  readonly label: string;
}

/** Estado da navegação que o mapa precisa de mostrar. */
export interface MapNavigation {
  readonly position: { readonly lngLat: LngLat; readonly bearing: number } | null;
  readonly follow: boolean;
  readonly mode: TravelMode;
}

export interface MapViewProps {
  readonly config: AppConfig;
  readonly theme: MapTheme;
  readonly initialView: MapViewState;
  readonly selected: LngLat | null;
  readonly focus: FocusRequest | null;
  readonly favorites: readonly Favorite[];
  readonly onMapClick: (lngLat: LngLat) => void;
  readonly onFavoriteClick: (favorite: Favorite) => void;
  readonly onViewChange: (view: MapViewState) => void;
  readonly onReady: (api: MapApi | null) => void;
  readonly routes?: readonly Route[];
  readonly selectedRoute?: number;
  readonly routeMarkers?: readonly RouteMarker[];
  readonly navigation?: MapNavigation | null;
  readonly onRouteClick?: (index: number) => void;
  /** O utilizador moveu o mapa à mão durante a navegação (deixa de o seguir). */
  readonly onUserMove?: () => void;
}

const FOLLOW_ZOOM: Record<TravelMode, number> = {
  car: 16.5,
  motorcycle: 16.5,
  bike: 17,
  walk: 17.5,
};

function createGeolocate(): GeolocateControl {
  return new GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: true,
  });
}

/**
 * Remove o botão "A minha localização" do MapLibre e, se `keep`, volta a pô-lo (desligado).
 * Quando está a seguir a posição, esse botão move a câmara sozinho: durante a navegação (que
 * tem a sua própria câmara) e ao mostrar as rotas, isso estragaria o enquadramento.
 */
function replaceGeolocate(
  map: MapLibreMap,
  ref: { current: GeolocateControl | null },
  keep: boolean,
): void {
  if (ref.current) map.removeControl(ref.current);
  ref.current = keep ? createGeolocate() : null;
  if (ref.current) map.addControl(ref.current, 'top-right');
}

const FLAT_CAMERA = { pitch: 0, bearing: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 } };

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

const MARKER_CLASS = 'trajecto-marker';

function readView(map: MapLibreMap): MapViewState {
  const center = map.getCenter();
  return { center: { lng: center.lng, lat: center.lat }, zoom: map.getZoom() };
}

export function MapView(props: MapViewProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const appliedThemeRef = useRef<MapTheme>(props.theme);
  const selectedMarkerRef = useRef<Marker | null>(null);
  const favoriteMarkersRef = useRef<Marker[]>([]);
  const routeMarkersRef = useRef<Marker[]>([]);
  const puckRef = useRef<Marker | null>(null);
  const geolocateRef = useRef<GeolocateControl | null>(null);
  const wasNavigatingRef = useRef(false);
  const routeDataRef = useRef(routesToGeoJson([], 0));
  const [failed, setFailed] = useState(false);

  const onMapClick = useEffectEvent(props.onMapClick);
  const onRouteClick = useEffectEvent((index: number) => props.onRouteClick?.(index));
  const onUserMove = useEffectEvent(() => props.onUserMove?.());
  const onFavoriteClick = useEffectEvent(props.onFavoriteClick);
  const onViewChange = useEffectEvent(props.onViewChange);
  const onReady = useEffectEvent(props.onReady);
  const readInitial = useEffectEvent(() => ({
    theme: props.theme,
    view: props.initialView,
    config: props.config,
    locale: t('map.controls', { returnObjects: true }) as Record<string, string>,
  }));

  // Criação do mapa (uma vez por montagem).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const initial = readInitial();
    let map: MapLibreMap;
    try {
      map = new MapLibreMap({
        container,
        style: buildMapStyle(initial.theme, initial.config),
        center: [initial.view.center.lng, initial.view.center.lat],
        zoom: initial.view.zoom,
        maxPitch: 85,
        attributionControl: false,
        locale: initial.locale,
      });
    } catch (error) {
      console.error('[mapa] Não foi possível criar o mapa:', error);
      // O MapLibre lança o erro de forma síncrona quando não há WebGL2; não existe um callback
      // onde o tratar, por isso atualizamos o estado aqui (acontece no máximo uma vez).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFailed(true);
      return;
    }
    appliedThemeRef.current = initial.theme;

    map.addControl(new NavigationControl({ visualizePitch: true }), 'top-right');
    geolocateRef.current = createGeolocate();
    map.addControl(geolocateRef.current, 'top-right');
    map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left');
    map.addControl(new AttributionControl({ customAttribution: MAP_ATTRIBUTION }), 'bottom-right');

    map.on('click', (event) => {
      // Cliques num marcador são tratados pelo próprio marcador.
      const target = event.originalEvent.target;
      if (target instanceof Element && target.closest(`.${MARKER_CLASS}`)) return;
      // Um toque numa rota alternativa escolhe essa rota.
      const hit = map.getLayer(ROUTE_HIT_LAYER)
        ? map.queryRenderedFeatures(event.point, { layers: [ROUTE_HIT_LAYER] })[0]
        : undefined;
      const index = hit?.properties?.index;
      if (typeof index === 'number') {
        onRouteClick(index);
        return;
      }
      onMapClick({ lng: event.lngLat.lng, lat: event.lngLat.lat });
    });
    // As camadas da rota são parte do estilo: voltam a ser criadas quando o tema muda.
    map.on('style.load', () => addRouteLayers(map, routeDataRef.current));
    for (const type of ['dragstart', 'zoomstart', 'rotatestart', 'pitchstart'] as const) {
      map.on(type, (event: { originalEvent?: Event }) => {
        if (event.originalEvent) onUserMove();
      });
    }
    map.on('moveend', () => onViewChange(readView(map)));
    map.on('error', (event) => console.warn('[mapa]', event.error.message));

    mapRef.current = map;
    onReady({ getView: () => readView(map) });

    return () => {
      onReady(null);
      selectedMarkerRef.current = null;
      favoriteMarkersRef.current = [];
      routeMarkersRef.current = [];
      puckRef.current = null;
      geolocateRef.current = null;
      mapRef.current = null;
      map.remove();
    };
  }, []);

  // Tema claro/escuro.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || appliedThemeRef.current === props.theme) return;
    appliedThemeRef.current = props.theme;
    map.setStyle(buildMapStyle(props.theme, props.config));
  }, [props.theme, props.config]);

  // Marcador do local selecionado.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!props.selected) {
      selectedMarkerRef.current?.remove();
      selectedMarkerRef.current = null;
      return;
    }
    const lngLat: [number, number] = [props.selected.lng, props.selected.lat];
    if (selectedMarkerRef.current) {
      selectedMarkerRef.current.setLngLat(lngLat);
    } else {
      selectedMarkerRef.current = new Marker({ color: '#c62828', className: MARKER_CLASS })
        .setLngLat(lngLat)
        .addTo(map);
    }
  }, [props.selected]);

  // Marcadores de Casa, Trabalho e favoritos.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const marker of favoriteMarkersRef.current) marker.remove();
    favoriteMarkersRef.current = props.favorites.map((favorite) => {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = `${MARKER_CLASS} favorite-marker favorite-${favorite.kind}`;
      const name = favorite.place.name ?? favorite.place.address.street ?? '';
      const key =
        favorite.kind === 'home'
          ? 'map.homeMarker'
          : favorite.kind === 'work'
            ? 'map.workMarker'
            : 'map.favoriteMarker';
      element.setAttribute('aria-label', t(key, { name }));
      element.innerHTML = iconSvg(
        favorite.kind === 'home' ? 'home' : favorite.kind === 'work' ? 'work' : 'star',
      );
      element.addEventListener('click', (event) => {
        event.stopPropagation();
        onFavoriteClick(favorite);
      });
      return new Marker({ element })
        .setLngLat([favorite.place.lngLat.lng, favorite.place.lngLat.lat])
        .addTo(map);
    });
  }, [props.favorites, t]);

  // Centrar o mapa num local escolhido.
  useEffect(() => {
    const map = mapRef.current;
    const focus = props.focus;
    if (!map || !focus) return;
    const [west, south, east, north] = focus.bbox ?? [];
    const hasArea =
      west !== undefined &&
      south !== undefined &&
      east !== undefined &&
      north !== undefined &&
      (east - west > 0.002 || north - south > 0.002);
    if (hasArea) {
      map.fitBounds(
        [
          [west, south],
          [east, north],
        ],
        { padding: 64, maxZoom: 17 },
      );
    } else {
      map.flyTo({
        center: [focus.lngLat.lng, focus.lngLat.lat],
        zoom: Math.max(map.getZoom(), 16),
      });
    }
  }, [props.focus]);

  // Rotas (principal e alternativas).
  const routes = props.routes;
  const selectedRoute = props.selectedRoute ?? 0;
  useEffect(() => {
    const map = mapRef.current;
    routeDataRef.current = routesToGeoJson(routes ?? [], selectedRoute);
    if (!map) return;
    const source = map.getSource(ROUTE_SOURCE) as GeoJSONSource | undefined;
    if (source) source.setData(routeDataRef.current);
    else if (map.isStyleLoaded()) addRouteLayers(map, routeDataRef.current);
  }, [routes, selectedRoute]);

  // Durante a navegação, o botão de localização do MapLibre sai (a câmara é da navegação).
  const navigating = Boolean(props.navigation);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (navigating) {
      wasNavigatingRef.current = true;
      replaceGeolocate(map, geolocateRef, false);
    } else if (!geolocateRef.current) {
      replaceGeolocate(map, geolocateRef, true);
    }
  }, [navigating]);

  // Fora da navegação: mostrar todas as rotas quando chega um resultado novo, com o mapa plano
  // e virado a norte; sem rotas, só endireitar o mapa se a navegação acabou de terminar.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || navigating) return;
    const ended = wasNavigatingRef.current;
    wasNavigatingRef.current = false;
    const duration = prefersReducedMotion() ? 0 : 800;
    if (!routes || routes.length === 0) {
      if (ended) map.easeTo({ ...FLAT_CAMERA, duration });
      return;
    }
    // Um único movimento de câmara: outro movimento logo a seguir cancelaria este.
    replaceGeolocate(map, geolocateRef, true);
    map.jumpTo(FLAT_CAMERA);
    const [west, south, east, north] = routesBounds(routes);
    const container = map.getContainer();
    const wide = container.clientWidth >= 768;
    map.fitBounds(
      [
        [west, south],
        [east, north],
      ],
      {
        padding: wide
          ? { top: 90, bottom: 60, left: 420, right: 70 }
          : { top: 90, bottom: Math.round(container.clientHeight * 0.5), left: 40, right: 40 },
        maxZoom: 17,
        duration,
      },
    );
  }, [routes, navigating]);

  // Marcadores da partida, paragens e destino.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const marker of routeMarkersRef.current) marker.remove();
    routeMarkersRef.current = (props.routeMarkers ?? []).map((point) => {
      const lngLat: [number, number] = [point.lngLat.lng, point.lngLat.lat];
      if (point.kind === 'destination') {
        return new Marker({ color: '#c62828', className: MARKER_CLASS })
          .setLngLat(lngLat)
          .addTo(map);
      }
      const element = document.createElement('div');
      element.className = `${MARKER_CLASS} route-point route-point-${point.kind}`;
      element.setAttribute('role', 'img');
      element.setAttribute('aria-label', point.label);
      if (point.kind === 'stop') element.textContent = point.label;
      return new Marker({ element }).setLngLat(lngLat).addTo(map);
    });
  }, [props.routeMarkers]);

  // Seta da posição atual durante a navegação.
  const position = props.navigation?.position ?? null;
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!position) {
      puckRef.current?.remove();
      puckRef.current = null;
      return;
    }
    const lngLat: [number, number] = [position.lngLat.lng, position.lngLat.lat];
    if (!puckRef.current) {
      const element = document.createElement('div');
      element.className = 'nav-puck';
      element.setAttribute('aria-hidden', 'true');
      element.innerHTML = iconSvg('navigation');
      puckRef.current = new Marker({
        element,
        rotationAlignment: 'map',
        pitchAlignment: 'map',
      })
        .setLngLat(lngLat)
        .addTo(map);
    }
    puckRef.current.setLngLat(lngLat).setRotation(position.bearing);
  }, [position]);

  // A câmara segue a posição, com o mapa orientado na direção da viagem.
  const follow = props.navigation?.follow ?? false;
  const mode = props.navigation?.mode ?? 'car';
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !position || !follow) return;
    const height = map.getContainer().clientHeight;
    map.easeTo({
      center: [position.lngLat.lng, position.lngLat.lat],
      bearing: position.bearing,
      pitch: 50,
      zoom: FOLLOW_ZOOM[mode],
      // A posição fica no terço inferior do ecrã, para se ver mais estrada à frente.
      padding: { top: Math.round(height * 0.45), bottom: 110, left: 0, right: 0 },
      duration: prefersReducedMotion() ? 0 : 900,
      essential: true,
    });
  }, [position, follow, mode]);

  return (
    <div className="map-wrapper">
      <div ref={containerRef} className="map" role="region" aria-label={t('map.label')} />
      {failed && (
        <p className="map-error" role="alert">
          {t('map.loadError')}
        </p>
      )}
    </div>
  );
}
