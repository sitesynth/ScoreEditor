'use client';

import {
  Score, Note, Rest, NoteOrRest, Part, DurationBase,
  Pitch, pitchToStepOctave, durationBeats, itemBeats,
} from './music-model';

// ─── Ghost preview ──────────────────────────────────────────────────────────
// A ghost note is a *real* note inserted into the MusicXML for an empty
// measure, so Verovio engraves it with full correctness (notehead size,
// stems, ledger lines, accidentals, spacing). It is marked with a translucent
// red color so the user sees it as a preview rather than a committed note.

export interface GhostSpec {
  partIndex: number;
  measureIndex: number;
  /** Beat slot inside the measure (0-based) at which to insert. */
  slotIndex: number;
  /** Total beat slots in the measure (= measureBeats / noteBeats). */
  slotsTotal: number;
  pitch: Pitch;
  base: DurationBase;
  dots: 0 | 1 | 2;
}

const GHOST_COLOR = '#c0392b';   // red — same as our Note Input accent

// ─── MusicXML generation ─────────────────────────────────────────────────────
//
// We always use <divisions>16</divisions> per quarter — that means a 64th note
// is exactly 1 division, eliminating fractional duration values for all common
// note types up to 64th. Verovio happily renders the result.

// 256 divisions per quarter = enough resolution for 1024th notes
// (1024th = 1/256 of a quarter → exactly 1 division). All standard durations
// from breve (= 2048 div) down to 1024th (= 1 div) divide cleanly.
const DIVISIONS = 256;

// How many measures live in each system (row). Verovio is told to honour our
// encoded system breaks (`breaks: "encoded"`), so this number is the only
// thing that controls row layout — measures will never reflow between rows
// when notes are added, which kills the "score jumps down" effect.
const MEASURES_PER_SYSTEM = 4;

const BASE_TO_TYPE: Record<DurationBase, string> = {
  breve:    'breve',
  whole:    'whole',
  half:     'half',
  quarter:  'quarter',
  eighth:   'eighth',
  '16th':   '16th',
  '32nd':   '32nd',
  '64th':   '64th',
  '128th':  '128th',
  '256th':  '256th',
  '512th':  '512th',
  '1024th': '1024th',
};

/** Duration value in divisions for a note. */
function durationDiv(base: DurationBase, dots: 0 | 1 | 2): number {
  const beats = durationBeats({ base, dots });    // quarter-units
  return Math.round(beats * DIVISIONS);
}

/** Duration value in divisions accounting for tuplet scaling. MusicXML's
 *  `<duration>` is the *playback* duration — for a triplet eighth in 3:2 the
 *  audible length is `eighth × 2/3`. Off-by-one rounding in DIVISIONS=256
 *  resolution is tolerated by Verovio. */
function itemDurationDiv(item: NoteOrRest): number {
  const base = durationDiv(item.duration.base, item.duration.dots);
  if (!item.tuplet) return base;
  return Math.round(base * (item.tuplet.den / item.tuplet.num));
}

// ─── XML escape ──────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ─── Clef mapping ────────────────────────────────────────────────────────────

function clefXml(clef: Part['clef']): string {
  switch (clef) {
    case 'treble': return '<clef><sign>G</sign><line>2</line></clef>';
    case 'bass':   return '<clef><sign>F</sign><line>4</line></clef>';
    case 'alto':   return '<clef><sign>C</sign><line>3</line></clef>';
  }
}

// ─── Note / Rest XML ─────────────────────────────────────────────────────────

/** Render <direction> XML for dynamics / words that should appear BEFORE a
 *  note in the MusicXML stream. Returned as a single string (possibly empty).
 *  Verovio reads <direction> at measure-level and attaches it visually to the
 *  following note. */
function directionXmlForNote(item: Note): string {
  const parts: string[] = [];
  // Hairpin STOP must come before any new wedge start so a back-to-back
  // crescendo→diminuendo on adjacent notes renders correctly.
  if (item.hairpinEnd) {
    parts.push(`<direction placement="below"><direction-type><wedge type="stop" number="1"/></direction-type></direction>`);
  }
  if (item.hairpinStart) {
    parts.push(`<direction placement="below"><direction-type><wedge type="${item.hairpinStart}" number="1"/></direction-type></direction>`);
  }
  // Pedal stop before start (same reason as wedges).
  if (item.pedalEnd) {
    parts.push(`<direction placement="below"><direction-type><pedal type="stop" line="yes"/></direction-type></direction>`);
  }
  if (item.pedalStart) {
    parts.push(`<direction placement="below"><direction-type><pedal type="start" line="yes"/></direction-type></direction>`);
  }
  // Octave shift stop before start. MusicXML octave-shift type semantics:
  //   8va  (notes sound up an octave) → type="down" size="8" (bracket sits ABOVE)
  //   8vb  (notes sound down)         → type="up"   size="8" (bracket sits BELOW)
  //   15ma (two octaves up)           → type="down" size="15"
  //   15mb (two octaves down)         → type="up"   size="15"
  if (item.octaveShiftEnd) {
    parts.push(`<direction><direction-type><octave-shift type="stop" number="1"/></direction-type></direction>`);
  }
  if (item.octaveShiftStart) {
    const map: Record<string, { type: string; size: number; placement: string }> = {
      '8va-up':  { type: 'down', size: 8,  placement: 'above' },
      '8va-down':{ type: 'up',   size: 8,  placement: 'below' },
      '15ma-up': { type: 'down', size: 15, placement: 'above' },
      '15ma-down':{type: 'up',   size: 15, placement: 'below' },
    };
    const cfg = map[item.octaveShiftStart];
    if (cfg) {
      parts.push(`<direction placement="${cfg.placement}"><direction-type><octave-shift type="${cfg.type}" size="${cfg.size}" number="1"/></direction-type></direction>`);
    }
  }
  if (item.dynamics) {
    parts.push(`<direction placement="below"><direction-type><dynamics><${item.dynamics}/></dynamics></direction-type></direction>`);
  }
  if (item.words && item.words.length > 0) {
    for (const w of item.words) {
      parts.push(`<direction placement="above"><direction-type><words>${esc(w)}</words></direction-type></direction>`);
    }
  }
  return parts.join('\n');
}

/** Inline `<attributes>` block emitted INSIDE a measure before a note that
 *  carries a mid-measure clef or time-sig change. Verovio renders the new
 *  clef/time-sig glyph immediately before the note. */
function inlineAttributesForNote(item: Note): string {
  if (!item.clefChange && !item.timeSigChange) return '';
  const parts: string[] = [];
  if (item.timeSigChange) {
    parts.push(`<time><beats>${item.timeSigChange.num}</beats><beat-type>${item.timeSigChange.den}</beat-type></time>`);
  }
  if (item.clefChange) {
    parts.push(clefXml(item.clefChange));
  }
  return `<attributes>${parts.join('')}</attributes>`;
}

function noteXml(
  item: NoteOrRest,
  prevHadTieStart: boolean = false,
  priorAlterInMeasure: number | null = null,
): string {
  const dur = itemDurationDiv(item);
  const type = BASE_TO_TYPE[item.duration.base];
  const dots = '<dot/>'.repeat(item.duration.dots);

  // Tuplet bracket marker — emitted inside <notations> on the first and last
  // member. Time-modification is on every member.
  const tupletNotationXml = item.tuplet
    ? (item.tuplet.position === 'start' || item.tuplet.position === 'single'
        ? '<tuplet type="start" number="1"/>' : '') +
      (item.tuplet.position === 'end' || item.tuplet.position === 'single'
        ? '<tuplet type="stop" number="1"/>' : '')
    : '';
  const timeModXml = item.tuplet
    ? `<time-modification><actual-notes>${item.tuplet.num}</actual-notes><normal-notes>${item.tuplet.den}</normal-notes></time-modification>`
    : '';

  if (item.type === 'rest') {
    const restNotations = tupletNotationXml
      ? `<notations>${tupletNotationXml}</notations>` : '';
    return `<note xml:id="${item.id}">
  <rest/>
  <duration>${dur}</duration>
  <voice>1</voice>
  <type>${type}</type>
  ${dots}
  ${timeModXml}
  ${restNotations}
</note>`;
  }

  // Main note (pitch + duration + xml:id so Verovio passes our UUID into the
  // SVG output — used for selection).
  const { step, alter, octave } = pitchToStepOctave(item.pitch);
  const alterXml = alter !== 0 ? `<alter>${alter}</alter>` : '';
  // Resolve accidental glyph. Priority:
  //   1. accidentalDisplay (microtonal / courtesy natural override)
  //   2. alter !== 0 (explicit sharp/flat/etc.)
  //   3. bekarMark (user explicitly placed a ♮ — can be on a plain alter=0
  //      note to cancel an inherited measure-context alteration)
  // We do NOT auto-emit a natural based on prior alteration in the measure —
  // engraving convention is that an alteration carries through the measure
  // until the user puts an explicit bekar.
  const ACC_MAP_FROM_ALTER: Record<number, string> = {
    [-3]: 'triple-flat', [-2]: 'flat-flat', [-1]: 'flat',
    [0]: 'natural',
    [1]: 'sharp', [2]: 'double-sharp', [3]: 'triple-sharp',
  };
  let accidentalGlyph: string | null = null;
  if (item.accidentalDisplay) {
    accidentalGlyph = item.accidentalDisplay;
  } else if (alter !== 0) {
    accidentalGlyph = ACC_MAP_FROM_ALTER[alter] ?? null;
  } else if (item.bekarMark) {
    accidentalGlyph = 'natural';
  }
  // Suppress redundant glyph: if the same alter is already in force in
  // this measure on this step+octave, don't repeat it (engraving rule).
  if (
    accidentalGlyph &&
    !item.accidentalDisplay && !item.bekarMark &&
    !item.bracketAccidental &&
    priorAlterInMeasure !== null &&
    priorAlterInMeasure === alter
  ) {
    accidentalGlyph = null;
  }
  const bracketAttr = item.bracketAccidental ? ' parentheses="yes"' : '';
  const accidentalXml = accidentalGlyph
    ? `<accidental${bracketAttr}>${accidentalGlyph}</accidental>`
    : '';

  // Articulations → <notations><articulations><...></...></articulations></notations>.
  // MusicXML uses kebab-case element names per articulation (accent,
  // staccato, tenuto, marcato, staccatissimo, accent-staccato, etc).
  const arts = item.articulations ?? [];
  const fermatas = arts.filter(a => a === 'fermata' || a === 'fermata-short' || a === 'fermata-long');
  const articulationsTags = arts.filter(a => !fermatas.includes(a));
  const articulationsBlock = articulationsTags.length > 0
    ? `<articulations>${articulationsTags.map(a => `<${a}/>`).join('')}</articulations>`
    : '';
  const fermataBlock = fermatas.length > 0
    ? fermatas.map(() => '<fermata/>').join('')
    : '';

  // Ornaments (trill-mark, mordent, inverted-mordent, turn, inverted-turn) and
  // tremolo go inside <notations><ornaments>.
  const orns = item.ornaments ?? [];
  const tremoloXml = item.tremolo && item.tremolo > 0
    ? `<tremolo type="single">${Math.min(5, item.tremolo)}</tremolo>` : '';
  const ornamentsTags = orns.map(o => `<${o}/>`).join('');
  const ornamentsBlock = (ornamentsTags || tremoloXml)
    ? `<ornaments>${ornamentsTags}${tremoloXml}</ornaments>` : '';

  // Tie elements: <tie> is the audible link, <tied> is the visual mark.
  // Don't force placement — Verovio's auto-routing (opposite side from stem)
  // produces tighter, shallower arcs than an explicit placement attribute,
  // which makes Verovio draw a long slur-like swoop.
  const tieElements: string[] = [];
  const tiedElements: string[] = [];
  if (prevHadTieStart) {
    tieElements.push('<tie type="stop"/>');
    tiedElements.push('<tied type="stop"/>');
  }
  if (item.tieStart) {
    tieElements.push('<tie type="start"/>');
    tiedElements.push('<tied type="start"/>');
  }
  const tiedBlock = tiedElements.length > 0 ? tiedElements.join('') : '';

  // Slur span — type="start" on slurStart, type="stop" on slurEnd.
  // Number 1 = user-placed slurs. Number 2 reserved for grace→main slurs
  // (we automatically add one when a note has any graceBefore items).
  const slurElements: string[] = [];
  if (item.slurStart) slurElements.push('<slur type="start" number="1"/>');
  if (item.slurEnd)   slurElements.push('<slur type="stop" number="1"/>');
  if (item.graceBefore && item.graceBefore.length > 0) {
    slurElements.push('<slur type="stop" number="2"/>');
  }
  const slurBlock = slurElements.join('');

  // Slide (glissando line) between two notes of different pitch.
  const slideElements: string[] = [];
  if (item.slideStart) slideElements.push('<slide type="start" line-type="solid" number="1"/>');
  if (item.slideEnd)   slideElements.push('<slide type="stop" line-type="solid" number="1"/>');
  const slideBlock = slideElements.join('');

  const stemXml = item.stemDir ? `<stem>${item.stemDir}</stem>` : '';

  // Notehead shape override (broken/slash/x/diamond/…).
  const noteheadXml = item.notehead && item.notehead !== 'normal'
    ? `<notehead>${item.notehead}</notehead>` : '';

  const notationsXml = (articulationsBlock || fermataBlock || ornamentsBlock || tiedBlock || slurBlock || slideBlock || tupletNotationXml)
    ? `<notations>${tiedBlock}${slurBlock}${slideBlock}${fermataBlock}${ornamentsBlock}${articulationsBlock}${tupletNotationXml}</notations>`
    : '';

  // Grace notes BEFORE the main note: each emits its own <note> with a
  // <grace> element and NO <duration> (grace notes take no measure time).
  // Acciaccatura gets slash="yes" so Verovio renders the slashed stem.
  // The FIRST grace note also opens a slur (number 2) that closes on the
  // main note — standard engraving convention links grace→main with a
  // legato curve.
  let graceXml = '';
  if (item.graceBefore && item.graceBefore.length > 0) {
    item.graceBefore.forEach((g, idx) => {
      const gp = pitchToStepOctave(g.pitch);
      const gAlterXml = gp.alter !== 0 ? `<alter>${gp.alter}</alter>` : '';
      const gAccGlyph = ACC_MAP_FROM_ALTER[gp.alter];
      const gAccXml = gp.alter !== 0 && gAccGlyph
        ? `<accidental>${gAccGlyph}</accidental>` : '';
      const slashAttr = g.kind === 'acciaccatura' ? ' slash="yes"' : '';
      const gSlurXml = idx === 0
        ? `<notations><slur type="start" number="2"/></notations>` : '';
      graceXml += `<note xml:id="${g.id}">
  <grace${slashAttr}/>
  <pitch>
    <step>${gp.step}</step>
    ${gAlterXml}
    <octave>${gp.octave}</octave>
  </pitch>
  <voice>1</voice>
  <type>eighth</type>
  ${gAccXml}
  ${gSlurXml}
</note>
`;
    });
  }

  const cueXml = item.cueSize ? `<cue/>` : '';

  let out = graceXml + `<note xml:id="${item.id}">
  ${cueXml}
  <pitch>
    <step>${step}</step>
    ${alterXml}
    <octave>${octave}</octave>
  </pitch>
  <duration>${dur}</duration>
  ${tieElements.join('')}
  <voice>1</voice>
  <type>${type}</type>
  ${dots}
  ${timeModXml}
  ${accidentalXml}
  ${stemXml}
  ${noteheadXml}
  ${notationsXml}
</note>`;

  // Chord notes — each additional pitch is a <note><chord/>...</note> sibling.
  // Verovio (and every other MusicXML renderer) merges them into a single
  // chord head-stack on the parent's stem.
  if (item.chordNotes && item.chordNotes.length > 0) {
    for (const p of item.chordNotes) {
      const so = pitchToStepOctave(p);
      const aX = so.alter !== 0 ? `<alter>${so.alter}</alter>` : '';
      const accX =
        so.alter === 1 ? '<accidental>sharp</accidental>' :
        so.alter === -1 ? '<accidental>flat</accidental>' : '';
      out += `\n<note>
  <chord/>
  <pitch>
    <step>${so.step}</step>
    ${aX}
    <octave>${so.octave}</octave>
  </pitch>
  <duration>${dur}</duration>
  ${timeModXml}
  <voice>1</voice>
  <type>${type}</type>
  ${dots}
  ${accX}
</note>`;
    }
  }
  return out;
}

/** Serialize a sequence of notes/rests, threading `tieStart` from one note to
 *  the next NOTE (skipping intervening rests — auto-pad rests must not break
 *  a tie chain) and prepending any <direction> elements (dynamics, words).
 *  Also maintains per-measure accidental state so a note re-occurring at the
 *  same pitch (step+octave) gets a natural sign when the user cleared its
 *  alteration. */
function renderNotesXml(notes: NoteOrRest[], initialPrevTie: boolean = false): { xml: string; endingTie: boolean } {
  let prevTie = initialPrevTie;
  // Tracks the LAST emitted alter per "step+octave" within this measure
  // (e.g. "G4" → 1 means a G# was rendered). Used to decide whether the
  // next G4 in this measure needs a courtesy natural.
  const measureAcc = new Map<string, number>();
  const out: string[] = [];
  for (const n of notes) {
    if (n.type === 'note') {
      // Inline clef / time-sig change must precede the <direction> tags and
      // the <note> itself, otherwise Verovio attaches it to the wrong slot.
      const inlineAttrs = inlineAttributesForNote(n);
      if (inlineAttrs) out.push(inlineAttrs);
      const dir = directionXmlForNote(n);
      if (dir) out.push(dir);
      const so = pitchToStepOctave(n.pitch);
      const key = `${so.step}${so.octave}`;
      const prior = measureAcc.has(key) ? measureAcc.get(key)! : null;
      out.push(noteXml(n, prevTie, prior));
      // Update map with the alter THIS note carries forward to the rest of
      // the measure (the alter actually displayed, which is `so.alter`).
      measureAcc.set(key, so.alter);
      // Chord notes share the same alteration-carrying scope — track them too.
      if (n.chordNotes) {
        for (const cp of n.chordNotes) {
          const cso = pitchToStepOctave(cp);
          measureAcc.set(`${cso.step}${cso.octave}`, cso.alter);
        }
      }
      prevTie = !!n.tieStart;
    } else {
      out.push(noteXml(n, false));
    }
  }
  return { xml: out.join('\n'), endingTie: prevTie };
}

// ─── Measure XML ─────────────────────────────────────────────────────────────

function emptyMeasureRest(timeSigNum: number, timeSigDen: number): string {
  // A whole-measure rest with measure="yes" lets Verovio center it.
  const dur = (timeSigNum * 4 / timeSigDen) * DIVISIONS;
  return `<note>
  <rest measure="yes"/>
  <duration>${dur}</duration>
  <voice>1</voice>
</note>`;
}

/**
 * Greedy-fill remaining beats with rest notes. We split a free amount of
 * quarter-units into the largest possible standard durations so Verovio
 * always sees a fully-populated measure (a half-filled measure makes
 * Verovio's layout engine hang).
 */
function padRests(beatsToFill: number): string {
  const sizes: Array<[DurationBase, number]> = [
    ['whole',   4],
    ['half',    2],
    ['quarter', 1],
    ['eighth',  0.5],
    ['16th',    0.25],
    ['32nd',    0.125],
    ['64th',    0.0625],
  ];
  const out: string[] = [];
  let remaining = beatsToFill;
  for (const [base, beats] of sizes) {
    while (remaining >= beats - 0.001) {
      const dur = Math.round(beats * DIVISIONS);
      const type = BASE_TO_TYPE[base];
      out.push(`<note>
  <rest/>
  <duration>${dur}</duration>
  <voice>1</voice>
  <type>${type}</type>
</note>`);
      remaining -= beats;
    }
  }
  return out.join('\n');
}

/** XML for a single <chord/> note in red (used when ghost stacks on an
 *  existing note as a preview for chord addition). */
function ghostChordOnlyXml(g: GhostSpec): string {
  const dur = durationDiv(g.base, g.dots);
  const type = BASE_TO_TYPE[g.base];
  const dots = '<dot/>'.repeat(g.dots);
  const { step, alter, octave } = pitchToStepOctave(g.pitch);
  const alterXml = alter !== 0 ? `<alter>${alter}</alter>` : '';
  return `<note color="${GHOST_COLOR}">
  <chord/>
  <pitch>
    <step>${step}</step>
    ${alterXml}
    <octave>${octave}</octave>
  </pitch>
  <duration>${dur}</duration>
  <voice>1</voice>
  <type>${type}</type>
  ${dots}
</note>`;
}

/** XML for a ghost-preview note — fully-formed pitch note + color attribute. */
function ghostNoteXml(g: GhostSpec): string {
  const dur = durationDiv(g.base, g.dots);
  const type = BASE_TO_TYPE[g.base];
  const dots = '<dot/>'.repeat(g.dots);
  const { step, alter, octave } = pitchToStepOctave(g.pitch);
  const alterXml = alter !== 0 ? `<alter>${alter}</alter>` : '';
  const accidentalXml =
    alter === 1 ? `<accidental color="${GHOST_COLOR}">sharp</accidental>` :
    alter === -1 ? `<accidental color="${GHOST_COLOR}">flat</accidental>` :
    '';
  // The `color` attribute on <note> tints notehead, stem, ledger lines, and
  // accidental at once. Verovio respects it.
  return `<note color="${GHOST_COLOR}">
  <pitch>
    <step>${step}</step>
    ${alterXml}
    <octave>${octave}</octave>
  </pitch>
  <duration>${dur}</duration>
  <voice>1</voice>
  <type>${type}</type>
  ${dots}
  ${accidentalXml}
</note>`;
}

/** Right-side final barline for the last measure of the piece. */
const FINAL_BARLINE = `<barline location="right"><bar-style>light-heavy</bar-style></barline>`;

function measureXml(
  notes: NoteOrRest[],
  measureNumber: number,
  attributesXml: string,
  timeSigNum: number,
  timeSigDen: number,
  ghost?: GhostSpec,
  isLast?: boolean,
  newSystem?: boolean,
  initialPrevTie: boolean = false,
  barlineLeft?: 'repeat-start',
  barlineRight?: 'double' | 'final' | 'repeat-end',
): { xml: string; endingTie: boolean } {
  const maxBeats = timeSigNum * (4 / timeSigDen);
  let body: string;
  // Tracks whether the last NOTE in this measure had tieStart — caller threads
  // this into the next measure so a tie across the barline emits a matching
  // <tie type="stop"/> on the first note of the next bar.
  let endingTie = initialPrevTie;

  const ghostBeats = ghost ? durationBeats({ base: ghost.base, dots: ghost.dots }) : 0;
  const slotBeats = ghost ? maxBeats / ghost.slotsTotal : 0;
  const ghostStartBeat = ghost ? ghost.slotIndex * slotBeats : 0;

  if (notes.length === 0 && ghost) {
    // Empty measure: [rests before] [ghost] [rests after]
    const afterBeats = Math.max(0, maxBeats - ghostStartBeat - ghostBeats);
    const parts: string[] = [];
    if (ghostStartBeat > 0.001) parts.push(padRests(ghostStartBeat));
    parts.push(ghostNoteXml(ghost));
    if (afterBeats > 0.001) parts.push(padRests(afterBeats));
    body = parts.join('\n');
  } else if (notes.length === 0) {
    body = emptyMeasureRest(timeSigNum, timeSigDen);
  } else {
    const usedBeats = notes.reduce((s, n) => s + itemBeats(n), 0);

    // Look up which item the ghost's slot starts at OR falls inside. With the
    // padded measure model, a slot in the middle of a multi-beat rest no
    // longer aligns with any item boundary, so we also track containing-item
    // + beat offset for the split-render path below.
    let targetIndex = -1;
    let targetIsRest = false;
    let targetMatchesDuration = false;
    let containingIdx = -1;
    let containingOffset = 0;
    if (ghost) {
      let beat = 0;
      for (let i = 0; i < notes.length; i++) {
        const ib = itemBeats(notes[i]);
        if (Math.abs(beat - ghostStartBeat) < 0.001) {
          targetIndex = i;
          targetIsRest = notes[i].type === 'rest';
          targetMatchesDuration = Math.abs(ib - ghostBeats) < 0.001;
          containingIdx = i;
          containingOffset = 0;
          break;
        }
        if (ghostStartBeat < beat + ib - 0.001) {
          containingIdx = i;
          containingOffset = ghostStartBeat - beat;
          break;
        }
        beat += ib;
      }
    }

    if (ghost && targetIndex >= 0 && targetIsRest && targetMatchesDuration) {
      // Ghost replaces a rest in-place — render it tinted, leave the rest
      // out of the output for the duration of the ghost.
      const items: string[] = notes.map((n, i) =>
        i === targetIndex ? ghostNoteXml(ghost) : noteXml(n),
      );
      body = items.join('\n');
    } else if (
      ghost && targetIndex >= 0 && !targetIsRest && targetMatchesDuration
    ) {
      // Ghost stacks on an existing note → chord-addition preview. Only show
      // it when the ghost pitch isn't already part of that note's chord.
      const target = notes[targetIndex];
      const existingMidis = target.type === 'note'
        ? [target.pitch.midi, ...(target.chordNotes ?? []).map((p) => p.midi)]
        : [];
      const showChordPreview =
        target.type === 'note' && !existingMidis.includes(ghost.pitch.midi);
      const items: string[] = notes.map((n, i) => {
        if (i !== targetIndex) return noteXml(n);
        return showChordPreview
          ? noteXml(n) + '\n' + ghostChordOnlyXml(ghost)
          : noteXml(n);
      });
      body = items.join('\n');
    } else if (
      ghost && containingIdx >= 0 && notes[containingIdx].type === 'rest'
    ) {
      // Ghost falls INSIDE a rest of larger duration — split-render it as
      // [leading rest, ghost, trailing rest]. The model still has one big
      // rest; INSERT_NOTE will perform the real split on commit.
      const target = notes[containingIdx];
      const targetBeats = itemBeats(target);
      const trailing = targetBeats - containingOffset - ghostBeats;
      if (trailing >= -0.001) {
        const items: string[] = [];
        for (let i = 0; i < notes.length; i++) {
          if (i !== containingIdx) {
            items.push(noteXml(notes[i]));
            continue;
          }
          if (containingOffset > 0.001) items.push(padRests(containingOffset));
          items.push(ghostNoteXml(ghost));
          if (trailing > 0.001) items.push(padRests(trailing));
        }
        body = items.join('\n');
      } else {
        // Ghost doesn't fit inside the rest — render normally.
        const r = renderNotesXml(notes, initialPrevTie);
        endingTie = r.endingTie;
        const remBeats = maxBeats - usedBeats;
        body = remBeats > 0.001 ? r.xml + '\n' + padRests(remBeats) : r.xml;
      }
    } else if (ghost && ghostStartBeat >= usedBeats - 0.001 && ghostStartBeat + ghostBeats <= maxBeats + 0.001) {
      // Ghost lands after existing items — preview an "append".
      const r = renderNotesXml(notes, initialPrevTie);
      endingTie = r.endingTie;
      const itemsXml = r.xml;
      const gap = Math.max(0, ghostStartBeat - usedBeats);
      const afterBeats = Math.max(0, maxBeats - ghostStartBeat - ghostBeats);
      const parts: string[] = [itemsXml];
      if (gap > 0.001) parts.push(padRests(gap));
      parts.push(ghostNoteXml(ghost));
      if (afterBeats > 0.001) parts.push(padRests(afterBeats));
      body = parts.join('\n');
    } else {
      // No ghost or ghost conflicts with a real note — render normally.
      const r = renderNotesXml(notes, initialPrevTie);
      endingTie = r.endingTie;
      const remBeats = maxBeats - usedBeats;
      body = remBeats > 0.001 ? r.xml + '\n' + padRests(remBeats) : r.xml;
    }
  }

  // <print new-system="yes"/> must precede <attributes>. It locks this measure
  // as the first one in its row regardless of how dense the previous row got.
  const printXml = newSystem ? '<print new-system="yes"/>' : '';

  // Left barline — repeat-start ("|:")
  const leftBarlineXml = barlineLeft === 'repeat-start'
    ? `<barline location="left"><bar-style>heavy-light</bar-style><repeat direction="forward"/></barline>`
    : '';

  // Right barline — explicit override wins over the auto "final-on-last" rule
  let rightBarlineXml = '';
  if (barlineRight === 'double') {
    rightBarlineXml = `<barline location="right"><bar-style>light-light</bar-style></barline>`;
  } else if (barlineRight === 'final') {
    rightBarlineXml = `<barline location="right"><bar-style>light-heavy</bar-style></barline>`;
  } else if (barlineRight === 'repeat-end') {
    rightBarlineXml = `<barline location="right"><bar-style>light-heavy</bar-style><repeat direction="backward"/></barline>`;
  } else if (isLast) {
    rightBarlineXml = FINAL_BARLINE;
  }

  const xml = `<measure number="${measureNumber}">
  ${printXml}
  ${attributesXml}
  ${leftBarlineXml}
  ${body}
  ${rightBarlineXml}
</measure>`;
  return { xml, endingTie };
}

// ─── Part XML ────────────────────────────────────────────────────────────────

function partXml(part: Part, partIndex: number, partId: string, score: Score, ghost?: GhostSpec): string {
  const { keySig, timeSig } = score.metadata;
  const attrs0 = `<attributes>
  <divisions>${DIVISIONS}</divisions>
  <key><fifths>${keySig}</fifths></key>
  <time><beats>${timeSig.num}</beats><beat-type>${timeSig.den}</beat-type></time>
  ${clefXml(part.clef)}
</attributes>`;

  // Thread tie state across measures so a tie that starts at the end of
  // measure N gets a matching <tie type="stop"/> on the first note of
  // measure N+1 — without this Verovio renders just the opening half of the
  // tie and the arc flares wide.
  let prevTie = false;
  const measures: string[] = [];
  for (let i = 0; i < part.measures.length; i++) {
    const m = part.measures[i];
    const attrs = i === 0 ? attrs0 : '';
    const ghostForThis = (ghost && ghost.partIndex === partIndex && ghost.measureIndex === i)
      ? ghost : undefined;
    const isLast = i === part.measures.length - 1;
    const newSystem = i > 0 && i % MEASURES_PER_SYSTEM === 0;
    const r = measureXml(m.notes, m.number, attrs, timeSig.num, timeSig.den, ghostForThis, isLast, newSystem, prevTie, m.barlineLeft, m.barlineRight);
    measures.push(r.xml);
    prevTie = r.endingTie;
  }

  return `<part id="${partId}">
${measures.join('\n')}
</part>`;
}

// ─── Public ──────────────────────────────────────────────────────────────────

/** Convert the internal Score JSON model to a Verovio-ready MusicXML string. */
export function scoreToMusicXml(score: Score, ghost?: GhostSpec | null): string {
  // Wrap all parts in a single part-group whose symbol is "brace" — this is
  // the standard MusicXML way to render a piano-style brace connecting two
  // (or more) staves. Verovio honours it.
  const partScoreParts = score.parts.map((p, i) => {
    const id = `P${i + 1}`;
    return `<score-part id="${id}">
  <part-name>${esc(p.name)}</part-name>
  <part-abbreviation>${esc(p.abbreviation)}</part-abbreviation>
</score-part>`;
  }).join('\n');
  const partsList = score.parts.length > 1
    ? `<part-group number="1" type="start">
  <group-symbol>brace</group-symbol>
  <group-barline>yes</group-barline>
</part-group>
${partScoreParts}
<part-group number="1" type="stop"/>`
    : partScoreParts;

  const partsXml = score.parts.map((p, i) =>
    partXml(p, i, `P${i + 1}`, score, ghost ?? undefined),
  ).join('\n');

  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work>
    <work-title>${esc(score.metadata.title)}</work-title>
  </work>
  ${score.metadata.composer ? `<identification><creator type="composer">${esc(score.metadata.composer)}</creator></identification>` : ''}
  <part-list>
    ${partsList}
  </part-list>
  ${partsXml}
</score-partwise>`;
}
