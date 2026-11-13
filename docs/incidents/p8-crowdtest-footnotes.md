# P8 — Crowdtest footnote/annotation cluster (2026-11-13)

> Source: 方舟模型众测 (4 anonymous models, ~600 browser-level cases, synthetic
> + real-book《路边野餐》rounds). Cross-validated findings only get a P-tag;
> single-model findings stay "pending review" until reproduced. Evidence assets:
> `/Volumes/ExternalDisk/ark-crowdtest-materials/task1-{catkin,verso,limen,stolon}/`.
> Defect report: `docs/testing/crowdtest-2026-11-defect-report.md` (docs/ is
> gitignored — this entry is the in-repo record).

## P8.1 — Footnote popover overflowed the viewport on first open at bottom/right-edge anchors

**Found:** 2026-11-13 crowdtest, 4/4 models cross-validated (catkin
REAL-EDGE-BOTTOM/RIGHT, verso B-BOUNDARY-*, limen REAL-RENDER-EDGE-*,
stolon REAL-POS-CH0~CH4 — 12+ failing cases total). Fix: this cluster's
first commit.

**Severity:** P2 (UX/usability: popover partially or fully unreachable at
viewport edges; no data impact; every book with chapter-end footnotes has
bottom-edge anchors, so hit rate is high on first scroll-through).

**Locations**
- `packages/web/src/components/reading/annotations/FootnotePopover.tsx` —
  un-positioned frame + measure effect
- `packages/web/src/components/reading/annotations/popoverPosition.ts` —
  extracted pure positioning math (new)
- `packages/web/src/components/reading/annotations/__tests__/popoverPosition.test.ts` — regression cases mirroring the crowdtest edge scenarios

**What went wrong**

The popover renders one hidden frame before positioning. That frame used
`display: none`, so `getBoundingClientRect()` in `useLayoutEffect` measured
a **0×0** box: `top + 0 > innerHeight - margin` never fired (no bottom
flip) and the horizontal clamp compared against a zero width (no right-edge
clamp). The effect deps `[data, isNarrow]` exclude `pos`, so after
`setPos` made the element visible with its real 420px width and full
height, nothing re-measured — the misplaced frame stayed. Bottom-edge
anchors overflowed the viewport bottom (field evidence: popover box bottom
930 > viewport 900); right-edge anchors overflowed the right margin.

**Why the fix works**

1. The un-positioned frame now renders `position: fixed; visibility:
   hidden` with the real popover width — the measured rect carries true
   content dimensions while staying out of flow and invisible.
   `useLayoutEffect` completes positioning before the browser paints, so
   the hidden frame is never shown (no flash).
2. The flip/clamp math moved into a pure `computePopoverPosition` with
   unit tests pinning exactly the crowdtest failure shapes: bottom-edge
   flip, flip-overflow top floor, right/left-edge clamps, and the legacy
   0×0-rect degradation.
