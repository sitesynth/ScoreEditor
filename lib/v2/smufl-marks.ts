// SMuFL glyph ↔ mark-name mapping for click-to-select / delete of individual
// notation marks attached to a note (articulations, fermatas, ornaments).
//
// Verovio renders these marks as <g class="artic|fermata|trill|mordent|turn">
// INSIDE the note's <g class="note">, each containing a <use xlink:href="#XXXX-…">
// that points at a SMuFL glyph. A note can carry several marks of the same
// class (e.g. accent + staccato are both class "artic"), so to know WHICH mark
// the user clicked we map the rendered glyph codepoint back to its model name.
//
// Codepoints captured empirically from Verovio 6.2 across both stem directions
// (above/below placement variants). If a future Verovio bump changes a glyph,
// re-run the probe and update these tables — nothing else depends on the values.

export type MarkKind = 'artic' | 'ornament';

/** Model mark-name → SMuFL codepoint hex strings (uppercase, no `U+`).
 *  Multiple entries = above/below placement variants. */
export const MARK_GLYPHS: Record<string, string[]> = {
  // ── Articulations (class "artic") ──
  'staccato':      ['E4A2', 'E4A3'],
  'staccatissimo': ['E4A8', 'E4A9'],
  'tenuto':        ['E4A4', 'E4A5'],
  'accent':        ['E4A0', 'E4A1'],
  'strong-accent': ['E4AC', 'E4AD'],
  'down-bow':      ['E610', 'E611'],
  'up-bow':        ['E612', 'E613'],
  'harmonic':      ['E614', 'E615'],
  // ── Fermatas (class "fermata"; stored in note.articulations[]) ──
  'fermata':           ['E4C0'],
  'fermata-short':     ['E4C4'],
  'fermata-long':      ['E4C6'],
  'fermata-very-long': ['E4C8'],
  // ── Ornaments (class "trill" / "mordent" / "turn"; note.ornaments[]) ──
  'trill-mark':       ['E566'],
  'mordent':          ['E56D'],
  'inverted-mordent': ['E56C'],
  'turn':             ['E567'],
  'inverted-turn':    ['E568'],
};

const ORNAMENT_NAMES = new Set([
  'trill-mark', 'mordent', 'inverted-mordent', 'turn', 'inverted-turn',
]);

/** Reverse lookup: codepoint → { kind, name }. Built once. */
const REVERSE: Record<string, { kind: MarkKind; name: string }> = (() => {
  const r: Record<string, { kind: MarkKind; name: string }> = {};
  for (const [name, cps] of Object.entries(MARK_GLYPHS)) {
    const kind: MarkKind = ORNAMENT_NAMES.has(name) ? 'ornament' : 'artic';
    for (const cp of cps) r[cp.toUpperCase()] = { kind, name };
  }
  return r;
})();

/** Map a SMuFL codepoint (e.g. "E4A3") to the model mark it represents. */
export function glyphToMark(codepoint: string): { kind: MarkKind; name: string } | null {
  return REVERSE[codepoint.toUpperCase()] ?? null;
}

/** breath-mark / caesura get their own Verovio classes (no shared "artic"
 *  class and no stable glyph in <use>), so they're identified by SVG class. */
export const CLASS_TO_ARTIC: Record<string, string> = {
  breath: 'breath-mark',
  caesura: 'caesura',
};

/** Extract the leading SMuFL codepoint from a mark `<g>` element by reading the
 *  first `<use xlink:href="#XXXX-…">` (or href) inside it. Returns uppercase
 *  hex (e.g. "E4A3") or null. */
export function codepointOfMarkEl(el: Element): string | null {
  const use = el.querySelector('use');
  if (!use) return null;
  const href =
    use.getAttribute('xlink:href') ??
    use.getAttribute('href') ??
    '';
  const m = href.match(/#([0-9A-Fa-f]{4})/);
  return m ? m[1].toUpperCase() : null;
}
