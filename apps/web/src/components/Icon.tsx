export type IconName =
  'search' | 'close' | 'menu' | 'home' | 'work' | 'star' | 'trash' | 'target' | 'pin' | 'clock';

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
};

/** SVG completo, para usar fora do React (por exemplo, nos marcadores do mapa). */
export function iconSvg(name: IconName): string {
  return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICON_PATHS[name]}</svg>`;
}

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
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
