/**
 * Pure popover positioning math for the footnote popover (P8.1).
 *
 * Extracted from FootnotePopover so the flip/clamp behavior is unit-testable
 * without a layout-capable DOM: the component only measures rects and applies
 * the result. Measuring a `display:none` element yields a 0x0 rect — with a
 * zero height the bottom-flip never fires and with a zero width the clamp is
 * a no-op, which is exactly how bottom/right-edge anchors overflowed the
 * viewport on first open (crowdtest CROWD-1, 4/4 models).
 */

export interface AnchorRect {
  /** Distance from viewport top to the anchor's top edge. */
  top: number;
  /** Distance from viewport top to the anchor's bottom edge (= top + height). */
  bottom: number;
  /** Distance from viewport left to the anchor's left edge. */
  left: number;
  /** Anchor width in px. */
  width: number;
}

export interface PopoverSize {
  width: number;
  height: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export interface PopoverPosition {
  top: number;
  left: number;
}

/** Overlap allowance kept between popover and viewport edges, in px. */
export const POPOVER_MARGIN = 8;

/**
 * Place the popover below the anchor, horizontally centered on it, then:
 * 1. Flip above the anchor when the popover would overflow the viewport
 *    bottom (floored at the top margin when there is no room above either).
 * 2. Clamp horizontally into the viewport on both edges.
 */
export function computePopoverPosition(
  anchor: AnchorRect,
  pop: PopoverSize,
  viewport: ViewportSize,
  margin: number = POPOVER_MARGIN,
): PopoverPosition {
  let top = anchor.bottom + margin;
  let left = anchor.left + anchor.width / 2 - pop.width / 2;

  if (top + pop.height > viewport.height - margin) {
    top = Math.max(margin, anchor.top - pop.height - margin);
  }

  left = Math.max(margin, Math.min(left, viewport.width - pop.width - margin));

  return { top, left };
}
