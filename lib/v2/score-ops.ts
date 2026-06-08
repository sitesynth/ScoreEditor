'use client';

import type { DurationBase, Pitch, Alter } from './editor-store';

// ─── Duration math ───────────────────────────────────────────────────────────
//
// MusicXML <duration> is in `divisions` units. Our empty-score has
// <divisions>4</divisions> meaning a quarter note = 4 units.
// Map each duration-base to (xml-type-name, base-duration-in-quarters-units).

const BASE_TO_TYPE: Record<DurationBase, string> = {
  'whole':   'whole',
  'half':    'half',
  'quarter': 'quarter',
  'eighth':  'eighth',
  '16th':    '16th',
  '32nd':    '32nd',
  '64th':    '64th',
};

/** How many quarter-divisions does each duration consume (no dots). */
const BASE_QUARTER_UNITS: Record<DurationBase, number> = {
  'whole':   16,
  'half':    8,
  'quarter': 4,
  'eighth':  2,
  '16th':    1,
  '32nd':    0.5,
  '64th':    0.25,
};

function durationUnits(base: DurationBase, dots: 0 | 1 | 2): number {
  const u = BASE_QUARTER_UNITS[base];
  if (dots === 0) return u;
  if (dots === 1) return u * 1.5;
  return u * 1.75;
}

// ─── XML helpers ─────────────────────────────────────────────────────────────

function parseXml(xml: string): Document {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  const err = doc.querySelector('parsererror');
  if (err) throw new Error('Invalid MusicXML: ' + err.textContent);
  return doc;
}

function serializeXml(doc: Document): string {
  return new XMLSerializer().serializeToString(doc);
}

/** Build a <note> element for a pitch. */
function buildPitchNote(
  doc: Document,
  pitch: Pitch,
  base: DurationBase,
  dots: 0 | 1 | 2,
  divisions: number,
): Element {
  const note = doc.createElement('note');

  const p = doc.createElement('pitch');
  const step = doc.createElement('step');
  step.textContent = pitch.step;
  p.appendChild(step);

  if (pitch.alter && pitch.alter !== 0) {
    const alter = doc.createElement('alter');
    alter.textContent = String(pitch.alter);
    p.appendChild(alter);
  }

  const oct = doc.createElement('octave');
  oct.textContent = String(pitch.octave);
  p.appendChild(oct);

  note.appendChild(p);

  // Duration in divisions (quarter-units × divisions/4).
  // BASE_QUARTER_UNITS is already in units of "16th-of-a-whole".
  // Our score uses <divisions>4</divisions>, so quarter = 4 units.
  // For now stay consistent with that.
  const quarterUnits = durationUnits(base, dots);
  // quarterUnits is in 16th-of-a-whole units. Convert to divisions:
  // 16th-of-whole=1 → 16th note → divisions/4 units.
  // To keep it simple given divisions=4: quarter=4u → 4 div, eighth=2u → 2 div, etc.
  // Generalized: divisions per 16th-of-whole = divisions/4. Multiply.
  const durationValue = Math.round(quarterUnits * (divisions / 4));

  const dur = doc.createElement('duration');
  dur.textContent = String(durationValue);
  note.appendChild(dur);

  const voice = doc.createElement('voice');
  voice.textContent = '1';
  note.appendChild(voice);

  const type = doc.createElement('type');
  type.textContent = BASE_TO_TYPE[base];
  note.appendChild(type);

  for (let i = 0; i < dots; i++) {
    note.appendChild(doc.createElement('dot'));
  }

  // Accidental display (mirrors <alter>)
  if (pitch.alter === 1) {
    const acc = doc.createElement('accidental');
    acc.textContent = 'sharp';
    note.appendChild(acc);
  } else if (pitch.alter === -1) {
    const acc = doc.createElement('accidental');
    acc.textContent = 'flat';
    note.appendChild(acc);
  }

  return note;
}

// ─── Public ops ──────────────────────────────────────────────────────────────

export interface InsertOptions {
  pitch: Pitch;
  base: DurationBase;
  dots?: 0 | 1 | 2;
}

/**
 * Insert a note into the first measure that still contains a measure-rest
 * (i.e., has not been filled yet). MVP behavior — replaces the rest with
 * a single note. Later we'll do real cursor-based insertion.
 */
export function insertNote(musicXml: string, opts: InsertOptions): string {
  const { pitch, base, dots = 0 } = opts;
  const doc = parseXml(musicXml);

  const part = doc.querySelector('part');
  if (!part) throw new Error('No <part> in MusicXML');

  // Determine divisions from first <attributes>
  const divisionsEl = doc.querySelector('attributes > divisions');
  const divisions = divisionsEl ? Number(divisionsEl.textContent) || 4 : 4;

  // Find the first <measure> that contains a <rest measure="yes"> placeholder.
  const measures = Array.from(part.querySelectorAll('measure'));
  let targetMeasure: Element | null = null;
  let restNote: Element | null = null;

  for (const m of measures) {
    const r = m.querySelector('note > rest[measure="yes"]');
    if (r) {
      targetMeasure = m;
      restNote = r.parentElement;
      break;
    }
  }

  if (!targetMeasure || !restNote) {
    // No empty measure left — append a fresh measure at the end and use it.
    const newMeasure = doc.createElement('measure');
    newMeasure.setAttribute(
      'number',
      String(measures.length + 1),
    );
    const noteEl = buildPitchNote(doc, pitch, base, dots, divisions);
    newMeasure.appendChild(noteEl);

    // Pad the rest of the measure with a rest if the note doesn't fill it.
    // Skipping padding for MVP — engine will warn but still render.
    part.appendChild(newMeasure);
    return serializeXml(doc);
  }

  // Replace the measure-rest with our note.
  const noteEl = buildPitchNote(doc, pitch, base, dots, divisions);
  targetMeasure.replaceChild(noteEl, restNote);

  // Pad the remainder of the measure with a rest, so the bar is full.
  // Assume 4/4 → quarter*4 = 16 divisions in our default.
  const totalDiv = divisions * 4;
  const usedDiv = Number(noteEl.querySelector('duration')?.textContent || 0);
  const remaining = totalDiv - usedDiv;
  if (remaining > 0) {
    const restEl = doc.createElement('note');
    restEl.appendChild(doc.createElement('rest'));
    const d = doc.createElement('duration');
    d.textContent = String(remaining);
    restEl.appendChild(d);
    const v = doc.createElement('voice');
    v.textContent = '1';
    restEl.appendChild(v);
    targetMeasure.appendChild(restEl);
  }

  return serializeXml(doc);
}

// ─── Pitch helpers ───────────────────────────────────────────────────────────

const STEP_TO_SEMITONE: Record<Pitch['step'], number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};

/** Construct a Pitch from a step letter and octave. */
export function makePitch(step: Pitch['step'], octave: number, alter: Alter = 0): Pitch {
  return { step, octave, alter };
}

/** Convenience: middle-octave C major scale step → Pitch in given octave. */
export function defaultPitch(step: Pitch['step'] = 'C', octave: number = 5): Pitch {
  return { step, octave };
}
