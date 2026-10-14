import { MANEUVER } from '@trajecto/core';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { laneTurn, ManeuverIcon, maneuverGlyph } from './Maneuver';

describe('maneuverGlyph', () => {
  it.each([
    [MANEUVER.start, { icon: 'arrow', turn: 'straight' }],
    [MANEUVER.continue, { icon: 'arrow', turn: 'straight' }],
    [MANEUVER.right, { icon: 'arrow', turn: 'right' }],
    [MANEUVER.sharpRight, { icon: 'arrow', turn: 'sharp-right' }],
    [MANEUVER.slightRight, { icon: 'arrow', turn: 'slight-right' }],
    [MANEUVER.exitRight, { icon: 'arrow', turn: 'slight-right' }],
    [MANEUVER.left, { icon: 'arrow', turn: 'left' }],
    [MANEUVER.sharpLeft, { icon: 'arrow', turn: 'sharp-left' }],
    [MANEUVER.rampLeft, { icon: 'arrow', turn: 'slight-left' }],
    [MANEUVER.uturnLeft, { icon: 'uturn' }],
    [MANEUVER.uturnRight, { icon: 'uturn', mirror: true }],
    [MANEUVER.roundaboutEnter, { icon: 'roundabout' }],
    [MANEUVER.ferryEnter, { icon: 'ferry' }],
    [MANEUVER.destinationLeft, { icon: 'flag' }],
  ])('tipo %i', (type, glyph) => {
    expect(maneuverGlyph(type)).toEqual(glyph);
  });

  it('mostra o número da saída nas rotundas', () => {
    const { container } = render(
      <ManeuverIcon type={MANEUVER.roundaboutEnter} roundaboutExit={2} />,
    );
    expect(container).toHaveTextContent('2');
    const { container: arrow } = render(<ManeuverIcon type={MANEUVER.uturnRight} />);
    expect(arrow.querySelector('svg')).toHaveClass('mirror');
  });
});

describe('laneTurn', () => {
  it('usa a direção recomendada, depois a válida, depois a primeira possível', () => {
    expect(laneTurn({ directions: 66, active: 64, valid: 64 })).toBe('right');
    expect(laneTurn({ directions: 10, active: 0, valid: 8 })).toBe('left');
    expect(laneTurn({ directions: 2, active: 0, valid: 0 })).toBe('straight');
    expect(laneTurn({ directions: 256, active: 0, valid: 0 })).toBe('uturn');
    expect(laneTurn({ directions: 0, active: 0, valid: 0 })).toBe('straight');
  });
});
