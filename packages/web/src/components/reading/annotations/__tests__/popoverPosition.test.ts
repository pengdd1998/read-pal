import { describe, expect, it } from 'vitest';

import {
  computePopoverPosition,
  POPOVER_MARGIN,
} from '../popoverPosition';

// Viewport and popover size shared by most cases. The crowdtest evidence
// (CROWD-1, catkin REAL-EDGE-*) used a 900px-tall viewport — keep that shape
// so the regression cases mirror the field failure.
const VIEWPORT = { width: 1280, height: 900 };
const POP = { width: 420, height: 200 };

describe('computePopoverPosition', () => {
  it('places the popover below a mid-viewport anchor, centered on it', () => {
    const pos = computePopoverPosition(
      { top: 300, bottom: 330, left: 500, width: 24 },
      POP,
      VIEWPORT,
    );
    // Below with margin, horizontally centered on the anchor midpoint.
    expect(pos.top).toBe(338);
    expect(pos.left).toBe(500 + 24 / 2 - POP.width / 2);
    // Fully inside the viewport.
    expect(pos.top + POP.height).toBeLessThanOrEqual(VIEWPORT.height - POPOVER_MARGIN);
    expect(pos.left).toBeGreaterThanOrEqual(POPOVER_MARGIN);
    expect(pos.left + POP.width).toBeLessThanOrEqual(VIEWPORT.width - POPOVER_MARGIN);
  });

  it('flips above a bottom-edge anchor (crowdtest REAL-EDGE-BOTTOM)', () => {
    // Anchor near the viewport bottom: below-placement would overflow.
    const anchorTop = 830;
    const pos = computePopoverPosition(
      { top: anchorTop, bottom: 860, left: 500, width: 24 },
      POP,
      VIEWPORT,
    );
    // Flipped above: popover bottom sits margin above the anchor top.
    expect(pos.top).toBe(anchorTop - POP.height - POPOVER_MARGIN);
    expect(pos.top).toBeGreaterThanOrEqual(POPOVER_MARGIN);
    expect(pos.top + POP.height).toBeLessThanOrEqual(VIEWPORT.height - POPOVER_MARGIN);
  });

  it('floors at the top margin when even the flipped position overflows', () => {
    // Anchor near the bottom AND a popover too tall to fit above it either:
    // below overflows → flip → flipped top would go negative → floored.
    const pos = computePopoverPosition(
      { top: 830, bottom: 860, left: 500, width: 24 },
      { width: 420, height: 850 },
      VIEWPORT,
    );
    expect(pos.top).toBe(POPOVER_MARGIN);
  });

  it('clamps a right-edge anchor into the viewport (crowdtest REAL-EDGE-RIGHT)', () => {
    // Anchor centered near the right edge: naive centering pushes the
    // popover past the right margin.
    const pos = computePopoverPosition(
      { top: 300, bottom: 330, left: 1240, width: 24 },
      POP,
      VIEWPORT,
    );
    expect(pos.left).toBe(VIEWPORT.width - POP.width - POPOVER_MARGIN);
    expect(pos.left + POP.width).toBeLessThanOrEqual(VIEWPORT.width - POPOVER_MARGIN);
  });

  it('clamps a left-edge anchor to the left margin', () => {
    const pos = computePopoverPosition(
      { top: 300, bottom: 330, left: 4, width: 24 },
      POP,
      VIEWPORT,
    );
    expect(pos.left).toBe(POPOVER_MARGIN);
  });

  it('degrades safely on a zero-size popover rect (pre-fix first-open shape)', () => {
    // With the old display:none frame the measured rect was 0x0. The math
    // must still return the below-anchor position rather than NaN/garbage;
    // the component fix ensures this input no longer occurs, this pins the
    // defensive floor.
    const pos = computePopoverPosition(
      { top: 300, bottom: 330, left: 500, width: 24 },
      { width: 0, height: 0 },
      VIEWPORT,
    );
    expect(pos.top).toBe(338);
    expect(pos.left).toBe(512);
  });
});
