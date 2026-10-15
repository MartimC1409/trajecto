import type { RouteLane } from '@trajecto/core';
import { LANE_DIRECTION, MANEUVER } from '@trajecto/core';
import { useTranslation } from 'react-i18next';
import type { IconName } from './Icon';
import { Icon } from './Icon';

/** Rotação do ícone de seta, como classe CSS (a CSP não permite estilos inline). */
type Turn =
  'straight' | 'slight-right' | 'right' | 'sharp-right' | 'slight-left' | 'left' | 'sharp-left';

interface Glyph {
  readonly icon: IconName;
  readonly turn?: Turn;
  readonly mirror?: boolean;
}

const RIGHTISH = new Set<number>([
  MANEUVER.slightRight,
  MANEUVER.rampRight,
  MANEUVER.exitRight,
  MANEUVER.stayRight,
  MANEUVER.mergeRight,
]);
const LEFTISH = new Set<number>([
  MANEUVER.slightLeft,
  MANEUVER.rampLeft,
  MANEUVER.exitLeft,
  MANEUVER.stayLeft,
  MANEUVER.mergeLeft,
]);

export function maneuverGlyph(type: number): Glyph {
  if (
    type === MANEUVER.destination ||
    type === MANEUVER.destinationLeft ||
    type === MANEUVER.destinationRight
  ) {
    return { icon: 'flag' };
  }
  if (type === MANEUVER.roundaboutEnter || type === MANEUVER.roundaboutExit)
    return { icon: 'roundabout' };
  if (type === MANEUVER.ferryEnter || type === MANEUVER.ferryExit) return { icon: 'ferry' };
  if (type === MANEUVER.uturnLeft) return { icon: 'uturn' };
  if (type === MANEUVER.uturnRight) return { icon: 'uturn', mirror: true };
  if (type === MANEUVER.right) return { icon: 'arrow', turn: 'right' };
  if (type === MANEUVER.sharpRight) return { icon: 'arrow', turn: 'sharp-right' };
  if (type === MANEUVER.left) return { icon: 'arrow', turn: 'left' };
  if (type === MANEUVER.sharpLeft) return { icon: 'arrow', turn: 'sharp-left' };
  if (RIGHTISH.has(type)) return { icon: 'arrow', turn: 'slight-right' };
  if (LEFTISH.has(type)) return { icon: 'arrow', turn: 'slight-left' };
  return { icon: 'arrow', turn: 'straight' };
}

function glyphClass(glyph: Glyph): string {
  return [glyph.turn ? `turn-${glyph.turn}` : '', glyph.mirror ? 'mirror' : '']
    .filter(Boolean)
    .join(' ');
}

export function ManeuverIcon({
  type,
  roundaboutExit,
  size = 40,
}: {
  type: number;
  roundaboutExit?: number | undefined;
  size?: number;
}) {
  const glyph = maneuverGlyph(type);
  return (
    <span className="maneuver-icon" aria-hidden="true">
      <Icon name={glyph.icon} size={size} className={glyphClass(glyph)} />
      {glyph.icon === 'roundabout' && roundaboutExit !== undefined && (
        <span className="maneuver-exit">{roundaboutExit}</span>
      )}
    </span>
  );
}

/** Direções das faixas, por ordem de preferência para escolher a seta a desenhar. */
const LANE_ORDER: readonly [number, Turn | 'uturn'][] = [
  [LANE_DIRECTION.through, 'straight'],
  [LANE_DIRECTION.slightLeft, 'slight-left'],
  [LANE_DIRECTION.slightRight, 'slight-right'],
  [LANE_DIRECTION.left, 'left'],
  [LANE_DIRECTION.right, 'right'],
  [LANE_DIRECTION.sharpLeft, 'sharp-left'],
  [LANE_DIRECTION.sharpRight, 'sharp-right'],
  [LANE_DIRECTION.reverse, 'uturn'],
  [LANE_DIRECTION.mergeToLeft, 'slight-left'],
  [LANE_DIRECTION.mergeToRight, 'slight-right'],
];

export function laneTurn(lane: RouteLane): Turn | 'uturn' {
  const bits = lane.active || lane.valid || lane.directions;
  return LANE_ORDER.find(([bit]) => (bits & bit) !== 0)?.[1] ?? 'straight';
}

export function Lanes({ lanes }: { lanes: readonly RouteLane[] }) {
  const { t } = useTranslation();
  return (
    <ol className="lanes" aria-label={t('nav.lanes')}>
      {lanes.map((lane, index) => {
        const turn = laneTurn(lane);
        const state = lane.active ? 'active' : lane.valid ? 'valid' : 'unused';
        const label = t(lane.active || lane.valid ? 'nav.laneRecommended' : 'nav.lane', {
          n: index + 1,
        });
        // A ordem das faixas é fixa durante a manobra: o índice serve de chave.
        return (
          <li key={index} className={`lane lane-${state}`} aria-label={label}>
            <Icon
              name={turn === 'uturn' ? 'uturn' : 'arrow'}
              size={22}
              className={turn === 'uturn' ? '' : `turn-${turn}`}
            />
          </li>
        );
      })}
    </ol>
  );
}
