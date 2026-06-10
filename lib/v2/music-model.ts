// Internal score model — copied from ScoreSynth (proven design).
// Keeps notes as MIDI pitch + alter, durations as base + dots, etc.
// Verovio sees this only as MusicXML (via score-to-musicxml.ts).

// ─── Duration ────────────────────────────────────────────────────────────────

export type DurationBase =
  | 'breve' | 'whole' | 'half' | 'quarter' | 'eighth' | '16th' | '32nd' | '64th'
  | '128th' | '256th' | '512th' | '1024th';

export interface Duration {
  base: DurationBase;
  dots: 0 | 1 | 2 | 3;
}

/** Duration in quarter-note beats (undotted) */
const BASE_BEATS: Record<DurationBase, number> = {
  breve: 8, whole: 4, half: 2, quarter: 1, eighth: 0.5,
  '16th': 0.25, '32nd': 0.125, '64th': 0.0625,
  '128th': 0.03125, '256th': 0.015625,
  '512th': 0.0078125, '1024th': 0.00390625,
};

export function durationBeats(d: Duration): number {
  const base = BASE_BEATS[d.base];
  // 0 dots → 1×, 1 dot → 1.5×, 2 dots → 1.75×, 3 dots → 1.875×.
  // Closed form: 2 − 2⁻ⁿ.
  return base * (2 - Math.pow(2, -d.dots));
}

// ─── Pitch ───────────────────────────────────────────────────────────────────

export type Alter = -3 | -2 | -1 | 0 | 1 | 2 | 3;

export interface Pitch {
  midi: number;        // 0..127 (C4 = 60)
  alter: Alter;        // tripleFlat..doubleSharp, midi reflects the shift
}

/** Non-standard accidental glyphs that aren't derivable from the integer
 *  `alter` value alone (microtones, courtesy naturals). When set on a Note
 *  it OVERRIDES the rendered <accidental> element; pitch.alter still drives
 *  MIDI (rounded toward zero for half-step microtones). */
export type AccidentalDisplay =
  | 'natural-sharp' | 'natural-flat'
  | 'quarter-sharp' | 'three-quarters-sharp'
  | 'quarter-flat'  | 'three-quarters-flat';

// ─── Tuplet ──────────────────────────────────────────────────────────────────

/** Tuplet membership for a single item. All items in one tuplet share the
 *  same `num`/`den` ratio (e.g. 3:2 for a regular triplet). `position`
 *  identifies where in the contiguous span this item lives so the renderer
 *  can draw the bracket only once and the reducer can collapse the span
 *  back when the user toggles the tuplet off. */
export interface TupletInfo {
  num: number;
  den: number;
  position: 'start' | 'middle' | 'end' | 'single';
}

/** Standard tuplet ratio for a button-count `num`. Sticks to the common
 *  music-engraving defaults: 3:2 triplet, 5:4 / 6:4 / 7:4, 9:8, 4:6 (compound
 *  quadruplet inside dotted units). */
export function defaultTupletConfig(num: number): { den: number; shiftDown: number } {
  switch (num) {
    // Duplet (2 in time of 3) — used in compound meters: 2 notes occupy
    // the space of 3 of the same duration.
    case 2: return { den: 3, shiftDown: 0 };
    case 3: return { den: 2, shiftDown: 1 };
    case 4: return { den: 6, shiftDown: 1 };
    case 5: return { den: 4, shiftDown: 2 };
    case 6: return { den: 4, shiftDown: 2 };
    case 7: return { den: 4, shiftDown: 2 };
    // Octuplet (8 in time of 6 — typical) — falls into the 8th-note frame.
    case 8: return { den: 6, shiftDown: 2 };
    case 9: return { den: 8, shiftDown: 3 };
    default: return { den: 2, shiftDown: 1 };
  }
}

const DUR_ORDER: DurationBase[] = [
  'breve', 'whole', 'half', 'quarter', 'eighth',
  '16th', '32nd', '64th', '128th', '256th', '512th', '1024th',
];

/** Return a duration `shiftDown` steps smaller than `base`. Clamps to 1024th
 *  if we'd overflow. */
export function shiftDurationDown(base: DurationBase, shift: number): DurationBase {
  const idx = DUR_ORDER.indexOf(base);
  if (idx < 0) return base;
  const newIdx = Math.min(DUR_ORDER.length - 1, idx + shift);
  return DUR_ORDER[newIdx];
}

// ─── Note / Rest ─────────────────────────────────────────────────────────────

export interface Note {
  type: 'note';
  id: string;
  pitch: Pitch;
  /** Additional simultaneous pitches forming a chord with the main pitch. */
  chordNotes?: Pitch[];
  duration: Duration;
  tieStart?: boolean;
  tieEnd?: boolean;
  /** Slur span — covers same-pitch or different-pitch notes (legato curve).
   *  slurStart marks the first note of the span; slurEnd marks the last. */
  slurStart?: boolean;
  slurEnd?: boolean;
  /** Slide (glissando-style line) between two notes of different pitch.
   *  Rendered as a solid line in MusicXML's <slide> element. */
  slideStart?: boolean;
  slideEnd?: boolean;
  /** Articulations applied to this note (MusicXML names: accent, staccato,
   *  tenuto, marcato, fermata, accent-staccato, tenuto-staccato, etc.).
   *  Multiple can stack. Toggling via TOGGLE_ARTICULATION removes if present. */
  articulations?: string[];
  /** Ornaments on this note (MusicXML names: trill-mark, mordent,
   *  inverted-mordent, turn, inverted-turn). */
  ornaments?: string[];
  /** Dynamics marking attached at this note (p, mp, mf, f, ff, pp, sfz, fp).
   *  Rendered via <direction><dynamics> BEFORE the note. */
  dynamics?: string;
  /** Stem direction override. Omit = let Verovio auto-pick. */
  stemDir?: 'up' | 'down';
  /** Beam grouping override.
   *   • `auto` (or omitted) — Verovio decides based on measure beat grid.
   *   • `start`    — this note begins a beam group.
   *   • `continue` — this note is in the middle of a beam group.
   *   • `end`      — this note ends a beam group.
   *   • `none`     — this note is rendered with flag (no beam) regardless.
   *  Sibelius/MuseScore behaviour: setting `none` on a note tells the
   *  engraver "don't include me in any beam". Setting `start` forces a
   *  new beam group here (even mid-beat). */
  beam?: 'auto' | 'start' | 'continue' | 'end' | 'none';
  /** Tremolo slash count (1..5). 0 / undefined = no tremolo. */
  tremolo?: number;
  /** Free text directions ("pizz.", "arco", "sord.", "cresc.", "dim.",
   *  "Da Capo", "Dal Segno", "Coda", "Segno"). Rendered via <direction><words>
   *  BEFORE the note. */
  words?: string[];
  /** Override the rendered accidental glyph (microtones, courtesy naturals).
   *  When set, replaces the alter-derived element in MusicXML. */
  accidentalDisplay?: AccidentalDisplay;
  /** Wrap the rendered accidental in parentheses (courtesy / bracket
   *  accidental in MusicXML's `<accidental parentheses="yes">`). */
  bracketAccidental?: boolean;
  /** Render this note in CUE size — a small notehead, typical of optional
   *  / accompaniment-only notes. MusicXML `<cue/>`. */
  cueSize?: boolean;
  /** Force display of the natural sign ♮ on this note. Distinct from
   *  alter=0 — a plain alter=0 note inside a measure where the same pitch
   *  was earlier altered would SOUND as natural but display no glyph
   *  (engraving lets the alteration carry through unless the user puts a
   *  bekar). This flag emits an explicit <accidental>natural</accidental>. */
  bekarMark?: boolean;
  /** Small ornamental notes PRECEDING this note (acciaccatura =
   *  slashed-stem 8th, appoggiatura = unslashed). They don't consume
   *  measure beats. */
  graceBefore?: Array<{
    id: string;
    pitch: Pitch;
    kind: 'acciaccatura' | 'appoggiatura';
  }>;
  /** Notehead shape override. Default = normal oval. "slash" / "slashed"
   *  draws a diagonal slash through the head (broken notehead — used for
   *  buzz rolls / unpitched / rhythmic notation). MusicXML <notehead>. */
  notehead?: 'normal' | 'slashed' | 'slash' | 'x' | 'diamond' | 'triangle' | 'square' | 'cluster';
  /** Pre-bend marker (guitar technique). Emits MusicXML
   *  <notations><technical><bend><pre-bend/></bend></technical>. */
  preBend?: boolean;
  /** Crescendo / diminuendo hairpin span. `hairpinStart` opens the wedge on
   *  this note; the next note carrying `hairpinEnd` closes it. Rendered via
   *  MusicXML `<direction><wedge>`. */
  hairpinStart?: 'crescendo' | 'diminuendo';
  hairpinEnd?: boolean;
  /** 8va / 8vb / 15ma / 15mb spanner. Apply to the FIRST note of the span;
   *  the next note with `octaveShiftEnd` closes it. The notes inside still
   *  store their *sounding* MIDI; the shift only affects display octave.
   *  Verovio renders the bracket above (8va-up / 15ma-up) or below
   *  (8va-down / 15ma-down) the staff. */
  octaveShiftStart?: '8va-up' | '8va-down' | '15ma-up' | '15ma-down';
  octaveShiftEnd?: boolean;
  /** Sustain pedal markings — `Ped.` icon at start, `✱` at release. */
  pedalStart?: boolean;
  pedalEnd?: boolean;
  /** Mid-measure clef change BEFORE this note. Rendered as a small clef
   *  glyph immediately preceding the note. The clef in effect at the start
   *  of each measure is still the part-level clef (Part.clef) — this just
   *  inserts a local change for the remainder of the measure. */
  clefChange?: 'treble' | 'bass' | 'alto';
  /** Mid-measure time-signature change BEFORE this note. */
  timeSigChange?: { num: number; den: number };
  /** Tuplet membership — same shape for Note and Rest. Effective beat span
   *  is `durationBeats(duration) * (tuplet.den / tuplet.num)`. */
  tuplet?: TupletInfo;
}

export interface Rest {
  type: 'rest';
  id: string;
  duration: Duration;
  tuplet?: TupletInfo;
}

export type NoteOrRest = Note | Rest;

// ─── Measure / Part / Score ──────────────────────────────────────────────────

export type BarlineStyle = 'double' | 'final' | 'repeat-start' | 'repeat-end';

export interface Measure {
  id: string;
  number: number;
  notes: NoteOrRest[];
  /** Right-edge barline override (default = regular thin line). */
  barlineRight?: 'double' | 'final' | 'repeat-end';
  /** Left-edge barline (used for repeat-start markers). */
  barlineLeft?: 'repeat-start';
}

export interface Part {
  id: string;
  name: string;
  abbreviation: string;
  clef: 'treble' | 'bass' | 'alto';
  measures: Measure[];
}

export interface TimeSig {
  num: number;
  den: number;
}

export interface Score {
  id: string;
  metadata: {
    title: string;
    composer: string;
    tempo: number;
    timeSig: TimeSig;
    keySig: number;
  };
  parts: Part[];
}

// ─── Cursor ──────────────────────────────────────────────────────────────────

export interface CursorPosition {
  partIndex: number;
  measureIndex: number;
  noteIndex: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function beatsPerMeasure(timeSig: TimeSig): number {
  return timeSig.num * (4 / timeSig.den);
}

/** Effective beat span of one item — same as `durationBeats(item.duration)`
 *  except inside a tuplet, where it's scaled by `den/num` (so a triplet
 *  eighth-note reports 1/3 of a beat, not 1/2). All measure-sum operations
 *  should go through this helper, not raw `durationBeats`, so the padded-
 *  measure invariant holds with tuplets. */
export function itemBeats(item: NoteOrRest): number {
  const base = durationBeats(item.duration);
  if (!item.tuplet) return base;
  return base * (item.tuplet.den / item.tuplet.num);
}

export function getMeasureBeats(measure: Measure): number {
  return measure.notes.reduce((s, n) => s + itemBeats(n), 0);
}

export function isMeasureFull(measure: Measure, timeSig: TimeSig): boolean {
  return Math.abs(getMeasureBeats(measure) - beatsPerMeasure(timeSig)) < 0.001;
}

export function makeMeasure(number: number): Measure {
  return { id: crypto.randomUUID(), number, notes: [] };
}

/**
 * Greedy split of `beats` (in quarter-units) into the largest standard rest
 * durations. Used to keep a measure fully populated in the MODEL after every
 * mutation, so arrow navigation, click-selection and edit-mode work on the
 * same items the user sees.
 */
export function makeRestsForBeats(beats: number): Rest[] {
  const SIZES: Array<[DurationBase, number]> = [
    ['breve',   8],
    ['whole',   4],
    ['half',    2],
    ['quarter', 1],
    ['eighth',  0.5],
    ['16th',    0.25],
    ['32nd',    0.125],
    ['64th',    0.0625],
    ['128th',   0.03125],
    ['256th',   0.015625],
    ['512th',   0.0078125],
    ['1024th',  0.00390625],
  ];
  const out: Rest[] = [];
  let remaining = beats;
  for (const [base, b] of SIZES) {
    while (remaining >= b - 0.001) {
      out.push({ type: 'rest', id: crypto.randomUUID(), duration: { base, dots: 0 } });
      remaining -= b;
    }
  }
  return out;
}

export function createEmptyScore(
  title = 'Untitled score',
  composer = 'Composer / arranger',
  numMeasures = 16,
): Score {
  // Two staves grouped as a piano part — Verovio recognizes the brace via
  // a part-group wrapping the two parts in the part-list.
  const treble: Part = {
    id: 'treble',
    name: 'Piano',
    abbreviation: 'Pno.',
    clef: 'treble',
    measures: Array.from({ length: numMeasures }, (_, i) => makeMeasure(i + 1)),
  };
  const bass: Part = {
    id: 'bass',
    name: 'Piano',
    abbreviation: 'Pno.',
    clef: 'bass',
    measures: Array.from({ length: numMeasures }, (_, i) => makeMeasure(i + 1)),
  };
  return {
    id: crypto.randomUUID(),
    metadata: { title, composer, tempo: 120, timeSig: { num: 4, den: 4 }, keySig: 0 },
    parts: [treble, bass],
  };
}

/**
 * Given a note letter (a-g) and the previous MIDI note,
 * return the MIDI number closest to prevMidi.
 */
export function letterToPitch(
  letter: string,
  prevMidi: number | null,
  alter: Alter = 0,
): Pitch {
  const semitones: Record<string, number> = {
    c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11,
  };
  const pc = semitones[letter.toLowerCase()];
  if (pc === undefined) throw new Error(`Invalid note letter: ${letter}`);

  const baseMidi = pc + alter;

  if (prevMidi === null) {
    // Default to octave 4 (middle of treble staff)
    const oct4midi = 12 * 5 + baseMidi;
    return { midi: oct4midi, alter };
  }

  const prevOct = Math.floor(prevMidi / 12);
  const candidates = [prevOct - 1, prevOct, prevOct + 1].map(
    oct => oct * 12 + baseMidi,
  );
  const best = candidates.reduce((a, b) =>
    Math.abs(a - prevMidi) <= Math.abs(b - prevMidi) ? a : b,
  );
  return { midi: best, alter };
}

/** Convert (step letter, octave, alter) → MIDI note number. */
export function stepOctaveToMidi(step: string, octave: number, alter: Alter = 0): number {
  const SEMIS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const pc = SEMIS[step.toUpperCase()];
  if (pc === undefined) throw new Error(`Invalid step letter: ${step}`);
  return 12 * (octave + 1) + pc + alter;
}

/**
 * Walk `letterSteps` diatonic step letters upward from `pitch` (white-key
 * steps in C major; sharps/flats from the existing pitch are preserved on
 * the new note for simplicity). Returns the resulting Pitch in MIDI form.
 *
 *   diatonicUp(C4, 2) → E4    (a third up from C)
 *   diatonicUp(G4, 4) → D5    (a fifth up from G)
 */
export function diatonicUp(pitch: Pitch, letterSteps: number): Pitch {
  const so = pitchToStepOctave(pitch);
  const ORDER = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
  let idx = ORDER.indexOf(so.step as typeof ORDER[number]);
  let oct = so.octave;
  for (let i = 0; i < letterSteps; i++) {
    idx += 1;
    if (idx > 6) { idx = 0; oct += 1; }
  }
  for (let i = 0; i < -letterSteps; i++) {
    idx -= 1;
    if (idx < 0) { idx = 6; oct -= 1; }
  }
  const midi = stepOctaveToMidi(ORDER[idx], oct, 0);
  return { midi, alter: 0 };
}

/** Transpose a pitch by semitones.
 *
 * Spelling rule for black keys: moving UP one chromatic step writes a sharp,
 * moving DOWN writes a flat — matches conventional voice-leading notation
 * (ascending chromatic passages use ♯, descending use ♭). Octave-aligned moves
 * (±12, ±24, …) preserve the original alter so D♭ stays D♭ an octave higher.
 */
export function transposePitch(pitch: Pitch, semitones: number): Pitch {
  const newMidi = Math.max(21, Math.min(108, pitch.midi + semitones));
  const pc = newMidi % 12;
  const isBlack = [false, true, false, true, false, false, true, false, true, false, true, false][pc];
  if (!isBlack) return { midi: newMidi, alter: 0 as Alter };
  if (semitones === 0 || semitones % 12 === 0) return { midi: newMidi, alter: pitch.alter };
  return { midi: newMidi, alter: (semitones > 0 ? 1 : -1) as Alter };
}

/** Deep clone a score (for undo/redo snapshots) */
export function cloneScore(score: Score): Score {
  return JSON.parse(JSON.stringify(score));
}

// ─── MIDI → MusicXML step/octave/alter ──────────────────────────────────────

/** Convert a Pitch into MusicXML primitives (step letter, alter, octave).
 *
 *  CORE RULE: the displayed step letter is determined by the NATURAL pitch,
 *  computed as `midi - alter`. The alter sign just decorates the notehead;
 *  it never moves it to a different staff line.
 *
 *  So F (midi 65, alter 0)        → step F, no accidental
 *      F♭ (midi 64, alter -1)     → step F + flat   (NOT step E)
 *      F♯ (midi 66, alter +1)     → step F + sharp
 *      E♯ (midi 65, alter +1)     → step E + sharp  (NOT step F)
 *      C♭ (midi 59, alter -1)     → step C + flat   (NOT step B)
 *      B♯ (midi 60, alter +1)     → step B + sharp  (NOT step C)
 *      F𝄪 (midi 67, alter +2)     → step F + double-sharp
 *      E♭♭ (midi 62, alter -2)    → step E + double-flat
 */
export function pitchToStepOctave(pitch: Pitch): { step: string; alter: Alter; octave: number } {
  const WHITE: Record<number, string> = { 0: 'C', 2: 'D', 4: 'E', 5: 'F', 7: 'G', 9: 'A', 11: 'B' };

  // Natural midi = where the notehead actually lives on the staff.
  const naturalMidi = pitch.midi - pitch.alter;
  const naturalPc = ((naturalMidi % 12) + 12) % 12;

  if (WHITE[naturalPc] !== undefined) {
    const octave = Math.floor(naturalMidi / 12) - 1;
    return { step: WHITE[naturalPc], alter: pitch.alter, octave };
  }

  // Defensive fallback — naturalPc on a black key means the model has an
  // inconsistent (midi, alter) pair. Pick a sensible spelling from raw midi.
  const pc = ((pitch.midi % 12) + 12) % 12;
  const octave = Math.floor(pitch.midi / 12) - 1;
  const isBlack = [false, true, false, true, false, false, true, false, true, false, true, false][pc];
  if (!isBlack) {
    return { step: WHITE[pc], alter: 0, octave };
  }
  if (pitch.alter <= 0) {
    const flatMap: Record<number, string> = { 1: 'D', 3: 'E', 6: 'G', 8: 'A', 10: 'B' };
    return { step: flatMap[pc], alter: -1 as Alter, octave };
  }
  const sharpMap: Record<number, string> = { 1: 'C', 3: 'D', 6: 'F', 8: 'G', 10: 'A' };
  return { step: sharpMap[pc], alter: 1 as Alter, octave };
}
