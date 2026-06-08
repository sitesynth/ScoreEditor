'use client';

import type { Pitch } from './editor-store';

// ─── Verovio SVG inspection ──────────────────────────────────────────────────
//
// Verovio renders staves as <g class="staff">…</g>, each containing
// <g class="staffLines"> with 5 horizontal <path> segments. The
// <g class="staff"> bbox spans from the top line to the bottom line —
// for a standard 5-line stave, height / 4 = one staff-space.

// All coordinates are in CLIENT (screen) space — same space as MouseEvent's
// clientX/clientY. We get them from getBoundingClientRect() which already
// applies all parent transforms. This avoids the headache of Verovio's nested
// transform="translate(...) scale(...)" structure.

export interface StaffInfo {
  el: SVGGElement;
  /** Y of the top line in client pixels. */
  topY: number;
  /** Y of the bottom line in client pixels. */
  bottomY: number;
  /** Y distance between adjacent lines in client pixels. */
  lineSpacing: number;
  leftX: number;
  rightX: number;
  clef: 'treble' | 'bass' | 'alto' | 'tenor';
  /** True when the clef was actually detected on the SVG (i.e. this is the
   *  first measure of a system). False when it was inherited / defaulted. */
  clefExplicit: boolean;
}

export interface MeasureBox {
  el: SVGGElement;
  measureIndex: number;
  /** All coords in client pixels. */
  leftX: number;
  rightX: number;
  topY: number;
  bottomY: number;
  staves: StaffInfo[];
}

// ─── Locate staves in a rendered Verovio SVG ─────────────────────────────────

/**
 * Find all <g class="measure"> nodes and group their staves. Verovio emits
 * one staff per part per measure, all wrapped inside the measure element —
 * so this gives us the data needed to snap the mouse to a specific bar +
 * beat slot within that bar.
 */
export function findMeasures(svg: SVGSVGElement): MeasureBox[] {
  const measureEls = Array.from(svg.querySelectorAll('g.measure')) as SVGGElement[];
  const raw = measureEls.map((m, i) => {
    const r = m.getBoundingClientRect();
    const staves = findStaves(m as unknown as SVGSVGElement);
    let topY = r.top, bottomY = r.bottom, leftX = r.left, rightX = r.right;
    if (staves.length > 0) {
      topY = Math.min(r.top, ...staves.map(s => s.topY));
      bottomY = Math.max(r.bottom, ...staves.map(s => s.bottomY));
      leftX = Math.min(r.left, ...staves.map(s => s.leftX));
      rightX = Math.max(r.right, ...staves.map(s => s.rightX));
    }
    return { el: m, measureIndex: i, leftX, rightX, topY, bottomY, staves };
  });

  // Propagate detected clefs forward by staff position. Verovio only emits a
  // g.clef in the first measure of each system, so measures 2..N within the
  // same system inherit. Without this the bass stave gets read as treble and
  // ghost-preview snaps to wildly wrong pitches.
  const lastClef: Array<StaffInfo['clef']> = [];
  for (const m of raw) {
    m.staves.forEach((s, idx) => {
      if (s.clefExplicit) lastClef[idx] = s.clef;
      else if (lastClef[idx]) s.clef = lastClef[idx];
    });
  }
  return raw;
}

/**
 * Pull staff geometry out of each <g class="staff"> in the Verovio SVG.
 *
 * Strategy: find the 5 horizontal lines of the stave directly (Verovio draws
 * them as <path> children of <g class="staffLines">). For each path, take its
 * bbox top (== bottom, since paths are 1px-tall lines). The smallest Y is the
 * top line, the largest is the bottom line, and the spacing follows from there.
 *
 * Fallback: use bbox of the lines group, or of the whole staff. Both are less
 * accurate (the latter can include stems/ledger lines/clef heights).
 */
export function findStaves(svg: SVGSVGElement): StaffInfo[] {
  const staffGroups = Array.from(svg.querySelectorAll('g.staff')) as SVGGElement[];
  // eslint-disable-next-line no-console
  if (staffGroups.length === 0) console.warn('[v2/findStaves] no g.staff found in SVG');

  return staffGroups.map((el) => {
    // Use getBoundingClientRect — gives us coordinates already transformed
    // through every parent SVG transform.
    const linesGroup =
      (el.querySelector('g.staffLines') as SVGGElement | null) ??
      (el.querySelector('g.lines') as SVGGElement | null) ??
      (el.querySelector('g.staff-lines') as SVGGElement | null);

    let topY = 0, bottomY = 0, leftX = 0, rightX = 0;

    if (linesGroup) {
      // Read each path's client-rect — gives us the actual top/bottom lines.
      const paths = Array.from(linesGroup.querySelectorAll('path')) as SVGPathElement[];
      if (paths.length >= 2) {
        const ys: number[] = [];
        let lx = Infinity, rx = -Infinity;
        for (const p of paths) {
          const r = p.getBoundingClientRect();
          ys.push(r.top + r.height / 2);
          if (r.left < lx) lx = r.left;
          if (r.right > rx) rx = r.right;
        }
        ys.sort((a, b) => a - b);
        topY = ys[0];
        bottomY = ys[ys.length - 1];
        leftX = lx;
        rightX = rx;
      } else {
        const r = linesGroup.getBoundingClientRect();
        topY = r.top; bottomY = r.bottom;
        leftX = r.left; rightX = r.right;
      }
    } else {
      const r = el.getBoundingClientRect();
      topY = r.top; bottomY = r.bottom;
      leftX = r.left; rightX = r.right;
    }

    const rawSpacing = (bottomY - topY) / 4;
    const lineSpacing = (rawSpacing > 1 && rawSpacing < 100) ? rawSpacing : 6;

    // Detect clef. Only the first measure of a system carries it in the SVG,
    // so subsequent measures get `clefExplicit: false` and findMeasures will
    // copy the clef forward by staff position.
    let clef: StaffInfo['clef'] = 'treble';
    let clefExplicit = false;
    const clefUse = el.querySelector('g.clef use');
    if (clefUse) {
      const href =
        clefUse.getAttribute('href') ??
        clefUse.getAttribute('xlink:href') ?? '';
      // SMuFL: gClef=E050, fClef=E062, cClef=E05C
      if (href.includes('E062') || href.toLowerCase().includes('fclef')) { clef = 'bass'; clefExplicit = true; }
      else if (href.includes('E05C') || href.toLowerCase().includes('cclef')) { clef = 'alto'; clefExplicit = true; }
      else if (href.includes('E050') || href.toLowerCase().includes('gclef')) { clef = 'treble'; clefExplicit = true; }
    }

    return { el, topY, bottomY, lineSpacing, leftX, rightX, clef, clefExplicit };
  });
}

// ─── Coordinate conversion ───────────────────────────────────────────────────

export function clientToSvg(svg: SVGSVGElement, clientX: number, clientY: number) {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: clientX, y: clientY };
  const inv = ctm.inverse();
  const out = pt.matrixTransform(inv);
  return { x: out.x, y: out.y };
}

export function svgToClient(svg: SVGSVGElement, svgX: number, svgY: number) {
  const pt = svg.createSVGPoint();
  pt.x = svgX;
  pt.y = svgY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: svgX, y: svgY };
  return pt.matrixTransform(ctm);
}

// ─── Pitch from Y ────────────────────────────────────────────────────────────
//
// For a 5-line stave, each half-spacing step downward is one diatonic step
// in the underlying scale. With treble clef:
//   step 0 = top line     = F5
//   step 1 = space        = E5
//   step 2 = line (4th)   = D5
//   step 3 = space        = C5
//   step 4 = middle line  = B4
//   step 5 = space        = A4
//   step 6 = line (2nd)   = G4
//   step 7 = space        = F4
//   step 8 = bottom line  = E4
//
// Below the bottom line we go onto ledger spaces / lines:
//   step 9  = D4
//   step 10 = C4 (middle C ledger line)
//   step 11 = B3
//   …
// Above the top line we go negative (E5 line is step -1? no — going up):
//   step -1 = G5 (space above top line)
//   step -2 = A5 (1st ledger line above)
//   step -3 = B5
//   …
//
// The same logic applies for bass clef with a different top-pitch anchor.

const DIATONIC_ORDER = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
type Step = typeof DIATONIC_ORDER[number];

/** Top-line pitch for each clef. */
const CLEF_TOP_PITCH: Record<StaffInfo['clef'], Pitch> = {
  treble: { step: 'F', octave: 5 },
  bass:   { step: 'A', octave: 3 },
  alto:   { step: 'G', octave: 5 },
  tenor:  { step: 'E', octave: 5 },
};

/**
 * Walk `steps` diatonic steps downward (positive) or upward (negative)
 * from `top`. Returns the resulting pitch (without alter; clients add alter).
 */
function stepDown(top: Pitch, steps: number): Pitch {
  let idx = DIATONIC_ORDER.indexOf(top.step as Step);
  let oct = top.octave;
  let s = steps;
  while (s > 0) {
    idx -= 1;
    if (idx < 0) { idx = 6; oct -= 1; }
    s -= 1;
  }
  while (s < 0) {
    idx += 1;
    if (idx > 6) { idx = 0; oct += 1; }
    s += 1;
  }
  return { step: DIATONIC_ORDER[idx], octave: oct };
}

/**
 * Snap a Y-in-SVG-userspace to the nearest staff position and return:
 *   - snapped Y
 *   - pitch at that position
 *   - "step index" for ledger-line drawing later
 */
export interface StaffSnap {
  staffIndex: number;
  /** Snapped Y in SVG userspace. */
  svgY: number;
  /** Number of half-steps below the top line (negative = above). */
  stepIndex: number;
  /** The pitch at the snapped position. */
  pitch: Pitch;
}

/**
 * Find the measure containing (svgX, svgY) — only measures that *strictly*
 * contain the point in X and have at least one stave near the Y. Returns null
 * if the cursor is in the page margins, between systems, etc.
 */
export function findMeasureAtPoint(
  measures: MeasureBox[],
  svgX: number,
  svgY: number,
): MeasureBox | null {
  // First pass — STRICT X containment (no horizontal pad). Without this,
  // measures' x-padded ranges overlap at the barline and the cursor right
  // at measure-N's start gets attributed to measure-(N-1), making the
  // first beat of N nearly impossible to aim at.
  for (const m of measures) {
    const spacing = m.staves[0]?.lineSpacing ?? 12;
    const yPad = spacing * 5;
    if (svgX < m.leftX || svgX > m.rightX) continue;
    if (svgY < m.topY - yPad || svgY > m.bottomY + yPad) continue;
    return m;
  }
  // Second pass — fall back to a small x-pad so a click just outside the
  // measure bbox (margin / page edge) still resolves to the nearest bar.
  for (const m of measures) {
    const spacing = m.staves[0]?.lineSpacing ?? 12;
    const yPad = spacing * 5;
    const xPad = spacing * 2;
    if (svgX < m.leftX - xPad || svgX > m.rightX + xPad) continue;
    if (svgY < m.topY - yPad || svgY > m.bottomY + yPad) continue;
    return m;
  }
  return null;
}

/**
 * Inside a measure, snap an X coordinate to the nearest beat slot. The number
 * of slots is determined by the active duration:
 *   4/4 + quarter → 4 slots,  4/4 + half → 2 slots,  4/4 + eighth → 8 slots.
 *
 * We carve up the measure width evenly. The first measure has clef/time-sig
 * eating the left side — for simplicity we trim a fixed fraction off the left
 * to skip those.
 */
export interface BeatSnap {
  /** Beat index inside the measure (0-based). */
  slotIndex: number;
  /** Snapped X in SVG userspace. */
  svgX: number;
}

/**
 * Slot snap with optional hysteresis. If `prevSlotIndex` is given (last slot
 * the ghost was in for THIS measure), we keep that slot while the cursor sits
 * within ±HYST_SLOT half-slots of its centre. Makes the horizontal cursor feel
 * stable — small mouse jitters no longer flick the ghost between adjacent
 * eighth/16th slots.
 */
const HYST_SLOT = 0.1;

export function snapXToBeatSlot(
  measure: MeasureBox,
  svgX: number,
  slotsInMeasure: number,
  isFirstMeasureWithAttrs: boolean,
  prevSlotIndex?: number,
): BeatSnap {
  const totalWidth = measure.rightX - measure.leftX;
  // The first measure of a system carries clef/key/time-sig in the left
  // part. We trim a smaller fraction (was 25%) so the first beat can still
  // be aimed at easily — clicks slightly to the left clamp to slot 0
  // anyway via the negative-index check below.
  const leftSkip = isFirstMeasureWithAttrs ? totalWidth * 0.15 : totalWidth * 0.03;
  const rightSkip = totalWidth * 0.03;
  const usableLeft = measure.leftX + leftSkip;
  const usableRight = measure.rightX - rightSkip;
  const usableWidth = Math.max(1, usableRight - usableLeft);
  const slotWidth = usableWidth / slotsInMeasure;

  const localX = svgX - usableLeft;
  // Each slot's centre sits at (i + 0.5) * slotWidth; rawSlot = how many
  // slot-widths the cursor is from the left edge, minus 0.5 → distance from
  // slot 0's centre measured in slot-widths.
  const rawSlot = localX / slotWidth - 0.5;
  let slotIndex: number;
  if (prevSlotIndex !== undefined && Math.abs(rawSlot - prevSlotIndex) <= 0.5 + HYST_SLOT) {
    slotIndex = prevSlotIndex;
  } else {
    slotIndex = Math.round(rawSlot);
  }
  if (slotIndex < 0) slotIndex = 0;
  if (slotIndex >= slotsInMeasure) slotIndex = slotsInMeasure - 1;

  // Place ghost at the center of the slot.
  const snappedSvgX = usableLeft + slotIndex * slotWidth + slotWidth / 2;
  return { slotIndex, svgX: snappedSvgX };
}

/**
 * Snap a Y to the nearest pitch on the stave. Optional `overrideStepIndex`
 * forces a specific step (used by callers to implement mouse-coordinate-based
 * hysteresis without geometry feedback loops — ledger lines on a ghost note
 * shift the staff by a few px, which would otherwise break step-index
 * hysteresis).
 */
export function snapYToStaff(
  staff: StaffInfo,
  staffIndex: number,
  svgY: number,
  overrideStepIndex?: number,
): StaffSnap {
  const halfStep = staff.lineSpacing / 2;
  const stepIndex = overrideStepIndex !== undefined
    ? overrideStepIndex
    : Math.round((svgY - staff.topY) / halfStep);
  const snappedY = staff.topY + stepIndex * halfStep;
  const pitch = stepDown(CLEF_TOP_PITCH[staff.clef], stepIndex);
  return { staffIndex, svgY: snappedY, stepIndex, pitch };
}

/**
 * Find the staff under the given point — but only if the point is actually
 * over the stave (within its X range and within ±N staff-spaces vertically
 * to allow ledger-line placement above and below). Returns null if the
 * cursor is in the page margins / outside any staff.
 */
const LEDGER_TOLERANCE_SPACES = 5;   // generous — allow far ledger notes
const X_TOLERANCE_SPACES = 6;        // allow some slop past the bar bounds

export function staffAtPoint(
  staves: StaffInfo[],
  svgX: number,
  svgY: number,
): { staff: StaffInfo; index: number } | null {
  if (staves.length === 0) return null;

  // First: try staves whose bounds (with padding) contain the point.
  for (let i = 0; i < staves.length; i++) {
    const s = staves[i];
    const yPad = s.lineSpacing * LEDGER_TOLERANCE_SPACES;
    const xPad = s.lineSpacing * X_TOLERANCE_SPACES;
    if (
      svgX >= s.leftX - xPad && svgX <= s.rightX + xPad &&
      svgY >= s.topY - yPad && svgY <= s.bottomY + yPad
    ) {
      return { staff: s, index: i };
    }
  }

  // Fallback: pick the staff whose vertical center is closest in Y, regardless
  // of X — gives ghost preview a "snap to nearest stave" feel when hovering
  // between or far from the staves horizontally.
  let bestIdx = -1;
  let bestDist = Infinity;
  for (let i = 0; i < staves.length; i++) {
    const s = staves[i];
    const center = (s.topY + s.bottomY) / 2;
    const d = Math.abs(svgY - center);
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  return bestIdx >= 0 ? { staff: staves[bestIdx], index: bestIdx } : null;
}

/**
 * Legacy: pick the staff closest in Y regardless of bounds. Kept for cases
 * where we want a fallback (not used by the live ghost-cursor logic).
 */
export function staffAtY(staves: StaffInfo[], svgY: number): { staff: StaffInfo; index: number } | null {
  if (staves.length === 0) return null;
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < staves.length; i++) {
    const s = staves[i];
    const center = (s.topY + s.bottomY) / 2;
    const d = Math.abs(svgY - center);
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  return { staff: staves[bestIdx], index: bestIdx };
}
