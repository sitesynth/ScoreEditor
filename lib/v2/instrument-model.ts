// Instrument-centric model (v2 of v2).
//
// Hierarchy:
//   ScoreV2
//     ├─ systemMeasures: SystemMeasure[]   // global per-measure data (timeSig, barline, ...)
//     └─ instruments: Instrument[]
//          └─ staves: Staff[]               // 1 for monophonic, 2 for piano/harp/organ
//                └─ measures: StaffMeasure[]  // length === systemMeasures.length (invariant)
//                      └─ notes: NoteOrRest[]
//
// Pitch / Duration / Note / Rest are reused from music-model.ts.

import {
  type NoteOrRest,
  type Note,
  type Pitch,
  type TimeSig,
} from './music-model';

// ─── Atoms ───────────────────────────────────────────────────────────────────

export type Clef = 'treble' | 'bass' | 'alto' | 'tenor' | 'percussion';

export type BarlineStyle =
  | 'regular' | 'double' | 'final' | 'repeat-start' | 'repeat-end' | 'none';

export type BracketStyle = 'brace' | 'bracket' | 'square' | 'none';

// ─── Voice (per-instrument) ──────────────────────────────────────────────────
// Each voice has its own MIDI channel + default velocity. Notes reference a voice
// via Note.voiceId. Lets us later edit RH/LH velocity independently (advice #3).

export interface Voice {
  id: string;
  label: string;     // "Voice 1", "RH", ...
  channel: number;   // MIDI channel 1..16
  velocity: number;  // default note velocity 0..127
  color?: string;    // UI hint (matches RightSidebar palette)
}

// ─── Staff ───────────────────────────────────────────────────────────────────

export interface Staff {
  id: string;
  clef: Clef;
  measures: StaffMeasure[];   // INVARIANT: length === ScoreV2.systemMeasures.length
}

export interface StaffMeasure {
  id: string;
  notes: NoteOrRest[];
}

// ─── Instrument ──────────────────────────────────────────────────────────────

export interface Instrument {
  id: string;
  name: string;            // "Piano", "Violin"
  abbreviation: string;    // "Pno.", "Vln."
  midiProgram: number;     // GM program (0 = Acoustic Grand)
  bracket: BracketStyle;   // visual grouping of own staves
  staves: Staff[];         // piano → [treble, bass]
  voices: Voice[];         // at least one
  /** MIDI split point for auto-assigning notes (multi-staff only). Default: 60 = C4. */
  splitPoint?: number;
}

// ─── SystemMeasure (advice #1: shared between all staves) ────────────────────
// One per "vertical column" through the score. Holds anything that must change
// in lockstep across instruments: time signature, barline style, key/tempo changes.
// Individual notes still live in StaffMeasure[number], indexed by the same i.

export interface SystemMeasure {
  id: string;
  number: number;             // 1-based
  timeSig?: TimeSig;          // undefined → inherit previous
  keyChange?: number;         // -7..+7, undefined → inherit previous
  tempoChange?: number;       // BPM, undefined → inherit previous
  barlineEnd?: BarlineStyle;  // right edge; undefined → 'regular'
}

// ─── Score ───────────────────────────────────────────────────────────────────

export interface ScoreV2 {
  id: string;
  metadata: {
    title: string;
    composer: string;
    tempo: number;     // initial BPM
    timeSig: TimeSig;  // initial
    keySig: number;    // initial -7..+7
  };
  systemMeasures: SystemMeasure[];
  instruments: Instrument[];
}

// ─── Note extension: voice + cross-staff display ─────────────────────────────
// Pure type augmentation — actual fields live on the Note type from music-model.
// We treat both as optional so existing v1 notes keep working.

declare module './music-model' {
  interface Note {
    /** Voice this note belongs to. Falls back to instrument.voices[0]. */
    voiceId?: string;
    /**
     * Cross-staff display: note logically lives on its owner Staff
     * (where it's stored) but renders on this Staff.id instead.
     * Used for piano LH passages that visually cross to the treble staff.
     */
    displayStaffId?: string;
  }
}

// ─── Factories ───────────────────────────────────────────────────────────────

const uid = () => crypto.randomUUID();

export function makeStaffMeasure(): StaffMeasure {
  return { id: uid(), notes: [] };
}

export function makeSystemMeasure(number: number): SystemMeasure {
  return { id: uid(), number };
}

export function makeStaff(clef: Clef, numMeasures: number): Staff {
  return {
    id: uid(),
    clef,
    measures: Array.from({ length: numMeasures }, makeStaffMeasure),
  };
}

export function makeVoice(label: string, channel: number, color?: string): Voice {
  return { id: uid(), label, channel, velocity: 80, color };
}

export function makePianoInstrument(numMeasures: number, splitPoint = 60): Instrument {
  return {
    id: uid(),
    name: 'Piano',
    abbreviation: 'Pno.',
    midiProgram: 0,
    bracket: 'brace',
    splitPoint,
    staves: [makeStaff('treble', numMeasures), makeStaff('bass', numMeasures)],
    voices: [
      makeVoice('RH', 1, '#E45858'),
      makeVoice('LH', 2, '#E0B048'),
    ],
  };
}

export function makeMonoInstrument(
  name: string,
  abbreviation: string,
  clef: Clef,
  midiProgram: number,
  numMeasures: number,
): Instrument {
  return {
    id: uid(),
    name,
    abbreviation,
    midiProgram,
    bracket: 'none',
    staves: [makeStaff(clef, numMeasures)],
    voices: [makeVoice('Voice 1', 1, '#E45858')],
  };
}

export function createEmptyScoreV2(
  title = 'Untitled score',
  composer = 'Composer / arranger',
  numMeasures = 16,
): ScoreV2 {
  return {
    id: uid(),
    metadata: { title, composer, tempo: 120, timeSig: { num: 4, den: 4 }, keySig: 0 },
    systemMeasures: Array.from({ length: numMeasures }, (_, i) => makeSystemMeasure(i + 1)),
    instruments: [makePianoInstrument(numMeasures)],
  };
}

// ─── Invariants: keep staff.measures aligned with systemMeasures ─────────────

export function appendSystemMeasure(score: ScoreV2): void {
  score.systemMeasures.push(makeSystemMeasure(score.systemMeasures.length + 1));
  for (const inst of score.instruments) {
    for (const staff of inst.staves) staff.measures.push(makeStaffMeasure());
  }
}

export function removeSystemMeasureAt(score: ScoreV2, index: number): void {
  score.systemMeasures.splice(index, 1);
  for (const inst of score.instruments) {
    for (const staff of inst.staves) staff.measures.splice(index, 1);
  }
  score.systemMeasures.forEach((m, i) => { m.number = i + 1; });
}

export function appendInstrument(score: ScoreV2, instrument: Instrument): void {
  // Grow/shrink the new instrument's staves to match the current measure count.
  const target = score.systemMeasures.length;
  for (const staff of instrument.staves) {
    while (staff.measures.length < target) staff.measures.push(makeStaffMeasure());
    if (staff.measures.length > target) staff.measures.length = target;
  }
  score.instruments.push(instrument);
}

// ─── Split point: auto-assign chord notes between two staves ─────────────────
// Advice #1 of the original prompt: pitches >= splitPoint → treble (staves[0]),
// pitches < splitPoint → bass (staves[1]). Returns index arrays so the caller
// can route Note/Pitch payloads however it likes.

export interface SplitResult {
  trebleIndices: number[];
  bassIndices: number[];
}

export function splitByPitch(pitches: Pitch[], splitPoint = 60): SplitResult {
  const trebleIndices: number[] = [];
  const bassIndices: number[] = [];
  pitches.forEach((p, i) => {
    (p.midi >= splitPoint ? trebleIndices : bassIndices).push(i);
  });
  return { trebleIndices, bassIndices };
}

/** Convenience: split a chord (main pitch + chordNotes) into two pitch arrays. */
export function splitChord(
  main: Pitch,
  chordNotes: Pitch[] | undefined,
  splitPoint = 60,
): { treble: Pitch[]; bass: Pitch[] } {
  const all = [main, ...(chordNotes ?? [])];
  const { trebleIndices, bassIndices } = splitByPitch(all, splitPoint);
  return {
    treble: trebleIndices.map(i => all[i]),
    bass: bassIndices.map(i => all[i]),
  };
}

// ─── Cross-staff helpers ─────────────────────────────────────────────────────

/** Mark a note for cross-staff rendering. Note is still stored on its owner staff. */
export function setCrossStaff(note: Note, displayStaff: Staff | null): void {
  if (displayStaff) note.displayStaffId = displayStaff.id;
  else delete note.displayStaffId;
}

export function isCrossStaff(note: Note, ownerStaffId: string): boolean {
  return !!note.displayStaffId && note.displayStaffId !== ownerStaffId;
}

// ─── Indexing helpers (for UI / hit-testing) ─────────────────────────────────

export interface StaffRef {
  instrumentIndex: number;
  staffIndex: number;
}

export interface FlatStaff {
  staff: Staff;
  instrument: Instrument;
  ref: StaffRef;
  /** Global staff index across all instruments (top-to-bottom). */
  globalIndex: number;
}

export function flattenStaves(score: ScoreV2): FlatStaff[] {
  const out: FlatStaff[] = [];
  let g = 0;
  score.instruments.forEach((instrument, ii) => {
    instrument.staves.forEach((staff, si) => {
      out.push({ staff, instrument, ref: { instrumentIndex: ii, staffIndex: si }, globalIndex: g++ });
    });
  });
  return out;
}

export function totalStaffCount(score: ScoreV2): number {
  let n = 0;
  for (const inst of score.instruments) n += inst.staves.length;
  return n;
}

export function findStaffById(score: ScoreV2, staffId: string): FlatStaff | null {
  return flattenStaves(score).find(f => f.staff.id === staffId) ?? null;
}

// ─── Effective per-measure attributes (resolve "inherit previous") ───────────
// SystemMeasure stores changes only; this walks left-to-right to compute the
// current timeSig/keySig/tempo at any measure index.

export interface ResolvedMeasure {
  timeSig: TimeSig;
  keySig: number;
  tempo: number;
  barlineEnd: BarlineStyle;
}

export function resolveSystemMeasure(score: ScoreV2, index: number): ResolvedMeasure {
  let timeSig = score.metadata.timeSig;
  let keySig = score.metadata.keySig;
  let tempo = score.metadata.tempo;
  for (let i = 0; i <= index; i++) {
    const m = score.systemMeasures[i];
    if (m.timeSig) timeSig = m.timeSig;
    if (m.keyChange !== undefined) keySig = m.keyChange;
    if (m.tempoChange !== undefined) tempo = m.tempoChange;
  }
  const last = score.systemMeasures[index];
  const isFinal = index === score.systemMeasures.length - 1;
  const barlineEnd = last.barlineEnd ?? (isFinal ? 'final' : 'regular');
  return { timeSig, keySig, tempo, barlineEnd };
}

// ─── Layout (advice #2: shared Y-axis for the system) ────────────────────────
// Pure geometry — coordinates only. Actual SVG rendering still goes through
// Verovio; these helpers exist for our own overlays (brace, selection, ghost).

export interface SystemLayout {
  staffHeight: number;         // top line → bottom line of one 5-line staff
  intraInstrumentGap: number;  // between staves of the same instrument (piano)
  interInstrumentGap: number;  // between staves of different instruments
}

export const DEFAULT_LAYOUT: SystemLayout = {
  staffHeight: 40,
  intraInstrumentGap: 60,
  interInstrumentGap: 100,
};

export interface StaffYInfo {
  ref: StaffRef;
  staffId: string;
  yTop: number;     // top line of the staff
  yBottom: number;  // bottom line of the staff
  /** Position of this staff within its instrument's bracket group, if any. */
  bracketRole?: 'start' | 'middle' | 'end';
}

export function computeStaffYOffsets(
  score: ScoreV2,
  layout: SystemLayout = DEFAULT_LAYOUT,
): StaffYInfo[] {
  const result: StaffYInfo[] = [];
  let y = 0;
  score.instruments.forEach((instrument, ii) => {
    instrument.staves.forEach((staff, si) => {
      let bracketRole: 'start' | 'middle' | 'end' | undefined;
      if (instrument.staves.length > 1 && instrument.bracket !== 'none') {
        bracketRole =
          si === 0 ? 'start'
          : si === instrument.staves.length - 1 ? 'end'
          : 'middle';
      }
      result.push({
        ref: { instrumentIndex: ii, staffIndex: si },
        staffId: staff.id,
        yTop: y,
        yBottom: y + layout.staffHeight,
        bracketRole,
      });
      const isLastInInstrument = si === instrument.staves.length - 1;
      y += layout.staffHeight + (isLastInInstrument ? layout.interInstrumentGap : layout.intraInstrumentGap);
    });
  });
  return result;
}

/** Y-range to draw a brace/bracket spanning an instrument's staves. */
export function bracketSpan(
  score: ScoreV2,
  instrumentIndex: number,
  layout: SystemLayout = DEFAULT_LAYOUT,
): { y1: number; y2: number; style: BracketStyle } | null {
  const inst = score.instruments[instrumentIndex];
  if (!inst || inst.staves.length < 2 || inst.bracket === 'none') return null;
  const offsets = computeStaffYOffsets(score, layout);
  const staves = offsets.filter(o => o.ref.instrumentIndex === instrumentIndex);
  return { y1: staves[0].yTop, y2: staves[staves.length - 1].yBottom, style: inst.bracket };
}
