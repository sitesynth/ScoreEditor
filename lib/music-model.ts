// ─── Duration ────────────────────────────────────────────────────────────────

export type DurationBase =
  | 'whole' | 'half' | 'quarter' | 'eighth' | '16th' | '32nd' | '64th';

export interface Duration {
  base: DurationBase;
  dots: 0 | 1 | 2;
}

const BASE_BEATS: Record<DurationBase, number> = {
  whole: 4, half: 2, quarter: 1, eighth: 0.5,
  '16th': 0.25, '32nd': 0.125, '64th': 0.0625,
};

export function durationBeats(d: Duration): number {
  const base = BASE_BEATS[d.base];
  if (d.dots === 0) return base;
  if (d.dots === 1) return base * 1.5;
  return base * 1.75;
}

export function vexDuration(d: Duration): string {
  const map: Record<DurationBase, string> = {
    whole: 'w', half: 'h', quarter: 'q', eighth: '8',
    '16th': '16', '32nd': '32', '64th': '64',
  };
  return map[d.base] + (d.dots > 0 ? 'd'.repeat(d.dots) : '');
}

// ─── Pitch ───────────────────────────────────────────────────────────────────

export interface Pitch {
  midi: number;
  alter: -1 | 0 | 1;
}

export function pitchToVexKey(pitch: Pitch): string {
  const noteNames = ['c', 'c', 'd', 'd', 'e', 'f', 'f', 'g', 'g', 'a', 'a', 'b'];
  const sharps    = [false, true, false, true, false, false, true, false, true, false, true, false];
  const pc = pitch.midi % 12;
  const octave = Math.floor(pitch.midi / 12) - 1;
  let name = noteNames[pc];
  if (sharps[pc]) {
    if (pitch.alter === -1) {
      const flatNames = ['c', 'db', 'd', 'eb', 'e', 'f', 'gb', 'g', 'ab', 'a', 'bb', 'b'];
      name = flatNames[pc];
    } else {
      const sharpNames = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
      name = sharpNames[pc];
    }
  }
  return `${name}/${octave}`;
}

export function pitchAccidental(pitch: Pitch): string | null {
  const pc = pitch.midi % 12;
  const isBlack = [false, true, false, true, false, false, true, false, true, false, true, false][pc];
  if (!isBlack) return null;
  return pitch.alter === -1 ? 'b' : '#';
}

// ─── Note / Rest ─────────────────────────────────────────────────────────────

export interface Note {
  type: 'note';
  id: string;
  pitch: Pitch;
  duration: Duration;
  tieStart?: boolean;
  tieEnd?: boolean;
}

export interface Rest {
  type: 'rest';
  id: string;
  duration: Duration;
}

export type NoteOrRest = Note | Rest;

// ─── Instrument ──────────────────────────────────────────────────────────────

export type ClefType = 'treble' | 'bass' | 'alto' | 'tenor' | 'percussion';
export type InstrumentFamily = 'keyboard' | 'strings' | 'woodwinds' | 'brass' | 'percussion' | 'voice';

export interface Instrument {
  id: string;
  name: string;
  abbreviation: string;
  family: InstrumentFamily;
  defaultClef: ClefType;
  secondaryClef?: ClefType;
  midiProgram: number;
  transposition: number;
}

// ─── Measure / Part / Score ──────────────────────────────────────────────────

export interface Measure {
  id: string;
  number: number;
  notes: NoteOrRest[];
}

export interface Part {
  id: string;
  instrumentId: string;
  name: string;
  abbreviation: string;
  clef: ClefType;
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

export function getMeasureBeats(measure: Measure): number {
  return measure.notes.reduce((s, n) => s + durationBeats(n.duration), 0);
}

export function isMeasureFull(measure: Measure, timeSig: TimeSig): boolean {
  return Math.abs(getMeasureBeats(measure) - beatsPerMeasure(timeSig)) < 0.001;
}

export function makeMeasure(number: number): Measure {
  return { id: crypto.randomUUID(), number, notes: [] };
}

export interface ScoreConfig {
  title: string;
  composer: string;
  tempo: number;
  timeSig: TimeSig;
  keySig: number;
  numMeasures: number;
  parts: Array<{ instrument: Instrument; clef: ClefType }>;
}

export function createEmptyScore(config: ScoreConfig): Score {
  const parts: Part[] = config.parts.map((p, i) => ({
    id: crypto.randomUUID(),
    instrumentId: p.instrument.id,
    name: p.instrument.name,
    abbreviation: p.instrument.abbreviation,
    clef: p.clef,
    measures: Array.from({ length: config.numMeasures }, (_, idx) => makeMeasure(idx + 1)),
  }));

  return {
    id: crypto.randomUUID(),
    metadata: {
      title: config.title || 'Untitled Score',
      composer: config.composer,
      tempo: config.tempo,
      timeSig: config.timeSig,
      keySig: config.keySig,
    },
    parts,
  };
}

export function letterToPitch(
  letter: string,
  prevMidi: number | null,
  alter: -1 | 0 | 1 = 0,
): Pitch {
  const semitones: Record<string, number> = {
    c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11,
  };
  const pc = semitones[letter.toLowerCase()];
  if (pc === undefined) throw new Error(`Invalid note letter: ${letter}`);
  const baseMidi = pc + alter;

  if (prevMidi === null) {
    return { midi: 12 * 5 + baseMidi, alter };
  }
  const prevOct = Math.floor(prevMidi / 12);
  const candidates = [prevOct - 1, prevOct, prevOct + 1].map(oct => oct * 12 + baseMidi);
  const best = candidates.reduce((a, b) =>
    Math.abs(a - prevMidi) <= Math.abs(b - prevMidi) ? a : b,
  );
  return { midi: best, alter };
}

export function transposePitch(pitch: Pitch, semitones: number): Pitch {
  const newMidi = Math.max(21, Math.min(108, pitch.midi + semitones));
  const pc = newMidi % 12;
  const isBlack = [false, true, false, true, false, false, true, false, true, false, true, false][pc];
  return { midi: newMidi, alter: isBlack ? pitch.alter : 0 };
}

export function cloneScore(score: Score): Score {
  return JSON.parse(JSON.stringify(score));
}
