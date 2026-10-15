export type IconName =
  | 'search'
  | 'close'
  | 'menu'
  | 'home'
  | 'work'
  | 'star'
  | 'trash'
  | 'target'
  | 'pin'
  | 'clock'
  | 'directions'
  | 'car'
  | 'motorcycle'
  | 'walk'
  | 'bike'
  | 'arrow'
  | 'uturn'
  | 'roundabout'
  | 'ferry'
  | 'flag'
  | 'plus'
  | 'swap'
  | 'volume'
  | 'mute'
  | 'navigation'
  | 'play'
  | 'list';

// Ícones próprios, desenhados numa grelha de 24×24.
export const ICON_PATHS: Record<IconName, string> = {
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  home: '<path d="M4 11 12 4l8 7v9h-6v-6h-4v6H4z"/>',
  work: '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M9 8V5h6v3M3 13h18"/>',
  star: '<path d="m12 3 2.8 6 6.2.6-4.7 4.2 1.4 6.2-5.7-3.2-5.7 3.2 1.4-6.2L3 9.6 9.2 9z"/>',
  trash: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>',
  target: '<circle cx="12" cy="12" r="7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  pin: '<path d="M12 21s-7-7.5-7-12a7 7 0 0 1 14 0c0 4.5-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  directions:
    '<path d="M12 2.5 21.5 12 12 21.5 2.5 12z"/><path d="M9 15v-4h6M12.5 8.5 15 11l-2.5 2.5"/>',
  car: '<path d="M4 16v-4l2.2-5h11.6l2.2 5v4z"/><path d="M5 16v3h3v-3M16 16v3h3v-3M4 12h16"/>',
  motorcycle:
    '<circle cx="5.5" cy="16" r="3.5"/><circle cx="18.5" cy="16" r="3.5"/><path d="M5.5 16 9 10h5l4.5 6M14 10l-1.5-3H10"/>',
  walk: '<circle cx="13" cy="4.5" r="2"/><path d="m9 21 2.5-6.5L14 17v4M8 12l2.5-4.5h3l2 4 2.5 1M11.5 14.5 13.5 7.5"/>',
  bike: '<circle cx="5.5" cy="16.5" r="3.5"/><circle cx="18.5" cy="16.5" r="3.5"/><path d="M5.5 16.5 9 9h6l3.5 7.5M12 16.5 9 9M15 9l-1-3h-2.5"/>',
  arrow: '<path d="M12 20V5M6 11l6-6 6 6"/>',
  uturn: '<path d="M16 20V9a4 4 0 0 0-8 0v7"/><path d="m5 13 3 3 3-3"/>',
  roundabout: '<circle cx="12" cy="9" r="5"/><path d="M12 21v-7M15.5 5.5l3-3M18.5 6V2.5H15"/>',
  ferry: '<path d="M3 18c2 2 4 2 6 0s4-2 6 0 4 2 6 0M5 15l1-5h12l1 5M12 10V4M9 6h6"/>',
  flag: '<path d="M5 21V4h12l-2.5 4L17 12H5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  swap: '<path d="M7 20V4M3 8l4-4 4 4M17 4v16M13 16l4 4 4-4"/>',
  volume: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>',
  mute: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="m16 9 5 6M21 9l-5 6"/>',
  navigation: '<path d="M12 3 19 20l-7-4-7 4z"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
};

/** SVG completo, para usar fora do React (por exemplo, nos marcadores do mapa). */
export function iconSvg(name: IconName): string {
  return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICON_PATHS[name]}</svg>`;
}

export function Icon({
  name,
  size = 20,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      // Conteúdo constante definido acima (nunca dados do utilizador).
      dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] }}
    />
  );
}
