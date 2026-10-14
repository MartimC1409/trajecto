import './worker';
import type { BBox, Favorite, LngLat, MapViewState } from '@trajecto/core';
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

export interface MapApi {
  getView(): MapViewState;
}

/** Pedido para centrar o mapa; `seq` permite voltar a centrar no mesmo local. */
export interface FocusRequest {
  readonly seq: number;
  readonly lngLat: LngLat;
  readonly bbox?: BBox;
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
  const [failed, setFailed] = useState(false);

  const onMapClick = useEffectEvent(props.onMapClick);
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
    map.addControl(
      new GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      'top-right',
    );
    map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left');
    map.addControl(new AttributionControl({ customAttribution: MAP_ATTRIBUTION }), 'bottom-right');

    map.on('click', (event) => {
      // Cliques num marcador são tratados pelo próprio marcador.
      const target = event.originalEvent.target;
      if (target instanceof Element && target.closest(`.${MARKER_CLASS}`)) return;
      onMapClick({ lng: event.lngLat.lng, lat: event.lngLat.lat });
    });
    map.on('moveend', () => onViewChange(readView(map)));
    map.on('error', (event) => console.warn('[mapa]', event.error.message));

    mapRef.current = map;
    onReady({ getView: () => readView(map) });

    return () => {
      onReady(null);
      selectedMarkerRef.current = null;
      favoriteMarkersRef.current = [];
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
