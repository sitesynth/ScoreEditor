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
  /** When true the ghost previews a REST (translucent rest at the slot), not a
   *  pitched note. `pitch` is ignored. Committed via insertRestAtBeat. */
  isRest?: boolean;
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

// Durations that get a beam (8th and shorter). Quarter and longer always
// have a stem with no beam, so they're never part of a beam group.
const BEAMABLE_DURATIONS: Record<DurationBase, boolean> = {
  breve: false, whole: false, half: false, quarter: false,
  eighth: true, '16th': true, '32nd': true, '64th': true,
  '128th': true, '256th': true, '512th': true, '1024th': true,
};

// How many beam strokes (parallel lines) each duration carries.
//   8th = 1, 16th = 2, 32nd = 3, 64th = 4, …
// In MusicXML each stroke gets its own <beam number="N"> tag, so we need to
// emit one beam element per level, each with its own begin/continue/end
// computed inside its own grouping window.
const BEAM_LEVELS: Record<DurationBase, number> = {
  breve: 0, whole: 0, half: 0, quarter: 0,
  eighth: 1, '16th': 2, '32nd': 3, '64th': 4,
  '128th': 5, '256th': 6, '512th': 7, '1024th': 8,
};

// Pick the duration "yardstick" for a given beam level. Level 1 (8th-rate)
// uses the 8th-note window (half-measure in 4/4). Level 2 uses the 16th
// window (per-beat). Level 3+ uses the 32nd window (half-beat). This is
// what makes the tertiary 32nd-stroke break into 4+4 while primary and
// secondary stay continuous across the whole beat.
function beamYardstickForLevel(level: number): DurationBase {
  if (level === 1) return 'eighth';
  if (level === 2) return '16th';
  return '32nd';
}

// How many quarter-note beats live in a beam group for the given meter
// AND the given note duration. Standard engraving rule, observed in the
// user's reference scores:
//   • EIGHTH notes        → 4/4: 2 beats (4 eighths in one beam, half-measure)
//                           others: 1 beat (paired)
//   • SIXTEENTH notes     → 1 beat per group (4 sixteenths per beam)
//   • 32nd and shorter    → 0.5 beat per group (4 thirty-seconds per beam,
//                           8 sixty-fourths per beam, …)
//   • Compound meters     → 1.5 beats (dotted-quarter pulse: three 8ths or
//                           six 16ths per beam)
//   • Other simple meters → 1 beat (default)
function beamGroupBeats(num: number, den: number, base: DurationBase): number {
  // Compound meters: dotted-quarter pulse drives note grouping.
  if (den === 8 && num % 3 === 0) return 1.5;
  // Simple meters with 8-denominator (3/8, 5/8, 7/8): one 8th per beat.
  if (den === 8) return 0.5;

  if (base === 'eighth') {
    if (den === 4 && num === 4) return 2;   // 4/4: half-measure (4 eighths)
    if (den === 2) return 2;                 // cut time: same
    return 1;                                // 2/4, 3/4, …: pairs
  }
  if (base === '16th') return 1;             // 4 sixteenths per beat
  // 32nd, 64th, 128th, … — half-beat windows so groups of 4 land cleanly.
  return 0.5;
}

/** Per-note beam status. Each note may carry multiple beam levels (a 32nd
 *  has 3 strokes, each potentially in different start/continue/end roles).
 *  Empty array (or absent map entry) → no beam at all (flag).
 */
type BeamLevelStatus = { level: number; mode: 'start' | 'continue' | 'end' };

/** Compute automatic multi-level beam grouping for a measure's notes.
 *  Returns a Map keyed by note id → array of per-level beam statuses.
 *
 *  Two-phase algorithm:
 *   PHASE 1 — form LEVEL-1 (primary, 8th-rate) groups using the
 *             PAIR-AND-CHAIN rule (1→flag, 2→pair, 3→pair+flag, 4→quad,
 *             …). Trailing odd notes are excluded from the group and
 *             become flagged — no beam tags at any level.
 *   PHASE 2 — inside each level-1 group, emit `start/continue/end` on
 *             level 1 across the whole group. For levels 2..maxLevel,
 *             sub-divide the group's notes (whose duration provides this
 *             level's stroke) by the level's smaller window, emitting
 *             `start/continue/end` per sub-window.
 *
 *  Result: primary beam stays continuous across the full level-1 group,
 *  while secondary/tertiary beams break at their natural sub-group
 *  boundaries (e.g. 8 thirty-seconds → 1 long primary + 1 long secondary +
 *  tertiary broken into 4+4).
 *
 *  Rests and non-beamable notes break level-1 groups (and therefore every
 *  higher level too). User-explicit note.beam skips auto-beaming.
 */
function computeAutoBeams(
  notes: NoteOrRest[],
  timeSigNum: number,
  timeSigDen: number,
): Map<string, BeamLevelStatus[]> {
  const result = new Map<string, BeamLevelStatus[]>();
  const addStatus = (id: string, s: BeamLevelStatus) => {
    const arr = result.get(id);
    if (arr) arr.push(s);
    else result.set(id, [s]);
  };

  // Walk once to collect (id, base, offset) for every beamable note, plus
  // the deepest level present in this measure.
  // `beam` carries the note's MANUAL beam override (Sibelius-style):
  //   'start'    = Begin  → beam BREAKS before this note (it begins a group)
  //   'end'      = End    → beam BREAKS after this note (it ends a group)
  //   'continue' = Middle → forced beamed on BOTH sides
  //   'none'     = No beam → detached (flag)
  // Notes without an override beam by the automatic rules below.
  type Entry = { id: string; base: DurationBase; offset: number; beam?: 'start' | 'continue' | 'end' | 'none'; secondaryBreak?: boolean };
  const entries: Entry[] = [];
  let maxLevel = 0;
  {
    let offset = 0;
    for (const item of notes) {
      const dur = itemBeats(item);
      const isNote = item.type === 'note';
      // Manual-beam notes are now INCLUDED in grouping (previously excluded)
      // so their override can re-link them coherently with neighbours instead
      // of emitting an orphan beam tag. A STEMLET rest also participates in the
      // beam (the beam is drawn over it) instead of breaking the group.
      const isStemletRest = item.type === 'rest' && !!(item as Rest).stemlet;
      const beamable = (isNote || isStemletRest) && BEAMABLE_DURATIONS[item.duration.base];
      if (beamable) {
        const base = item.duration.base;
        const noteBeam = isNote ? (item as Note).beam : undefined;
        const manual = noteBeam && noteBeam !== 'auto' ? noteBeam : undefined;
        const secBreak = isNote ? (item as Note).secondaryBeamStart || undefined : undefined;
        entries.push({ id: item.id, base, offset, beam: manual, secondaryBreak: secBreak });
        maxLevel = Math.max(maxLevel, BEAM_LEVELS[base]);
      } else {
        // Mark a break — sentinel with maxLevel=0 entry would complicate
        // logic, so we just signal via base='quarter' as a non-beamable
        // marker that won't fall into any group window.
        entries.push({ id: '__break__', base: 'quarter', offset });
      }
      offset += dur;
    }
  }
  if (maxLevel === 0) return result;

  // ── PHASE 1: form LEVEL-1 groups. ──
  //
  // Window for level-1 depends on the deepest duration in this measure:
  //   • maxLevel === 1 (only 8ths)           → 8th-rate window (2 beats in 4/4)
  //   • maxLevel ≥ 2 (16ths/32nds present)   → 16th-rate window (1 beat)
  //
  // PAIR-AND-CHAIN rule (1→flag, 2→pair, 3→pair+flag, 4→quad, …) applies
  // ONLY when maxLevel === 1 — that's the eighth-note typing aid the user
  // asked for. For 16ths and shorter the rule is plain "all beamable notes
  // in the window form one beam" — so 3 sixteenths in a beat give a
  // 3-beam, not 2-beam + flag.
  // User-facing rule (per user 2026-06-10): "16ths just split by 4."
  //
  // For 32nds (and shorter) the primary 8th-beam now spans ONE beat (not the
  // old half-measure), so a beat of eight 32nds reads as a single continuous
  // 8th-beam. The inner 16th/32nd beams break at the eighth-note subdivision
  // (see phase 2), giving "two groups of 4 joined by one 8th beam" per the
  // user's reference (2026-06-10).
  const level1Yardstick: DurationBase = maxLevel >= 2 ? '16th' : 'eighth';
  const level1Window = beamGroupBeats(timeSigNum, timeSigDen, level1Yardstick);
  const applyPairAndChain = maxLevel === 1;
  const defaultGroups: Entry[][] = [];
  {
    let pending: Entry[] = [];
    let curBgIdx = -1;
    const flush = () => {
      const n = pending.length;
      if (n >= 2) {
        if (applyPairAndChain) {
          // Even count → all beamed. Odd → drop the trailing one (flagged).
          const beamed = n - (n % 2);
          if (beamed >= 2) defaultGroups.push(pending.slice(0, beamed));
        } else {
          // Plain rule: every run of ≥ 2 forms one beam group.
          defaultGroups.push(pending.slice());
        }
      }
      // n === 1 → not in any group (flagged), regardless of mode.
      pending = [];
    };
    for (const e of entries) {
      if (e.id === '__break__') {
        // Don't UNCONDITIONALLY flush on a rest — that broke beam groups
        // every time the padded-measure invariant inserted a tiny auto
        // rest between two notes the user meant to be consecutive (e.g.
        // 4+padded+4 thirty-seconds on one beat → 2 separate primary
        // beams instead of one). Let the bgIdx-based flush below decide:
        // if the NEXT beamable note lands in the SAME level-1 window as
        // the current pending run, the run continues across the rest.
        // Cross-window rests still implicitly close the run because the
        // next note's bgIdx will differ.
        continue;
      }
      const bgIdx = Math.floor(e.offset / level1Window + 1e-9);
      if (bgIdx === curBgIdx) {
        pending.push(e);
      } else {
        flush();
        pending.push(e);
        curBgIdx = bgIdx;
      }
    }
    flush();
  }

  // ── PHASE 1b: apply MANUAL beam overrides on top of the auto grouping. ──
  //
  // Each note's `beam` marker forces a BREAK or a JOIN at the boundary with a
  // neighbour; notes without a marker keep the automatic join. For the boundary
  // between two consecutive beamable notes (prev, cur):
  //   • BREAK (OFF) if prev says "end here" / "no beam" (break after prev) OR
  //     cur says "begin here" / "no beam" (break before cur)  → break wins
  //   • else JOIN (ON) if prev or cur is 'continue' (Middle)   → forced join
  //   • else the automatic join (same default group)
  // So Begin('start') splits BEFORE the note, End('end') splits AFTER it,
  // Middle('continue') forces beaming, No-beam('none') isolates it. Re-forming
  // runs from these links yields coherent begin/continue/end groups (no orphan
  // tags). With NO manual markers every link == the auto join, so the output is
  // byte-identical to the pure-auto grouping above.
  const groupIdOf = new Map<string, number>();
  defaultGroups.forEach((g, gi) => g.forEach(e => groupIdOf.set(e.id, gi)));
  const bEntries = entries.filter(e => e.id !== '__break__');
  const breakRight = (e: Entry) => e.beam === 'end' || e.beam === 'none';   // split AFTER e
  const breakLeft = (e: Entry) => e.beam === 'start' || e.beam === 'none';  // split BEFORE e
  const forceJoin = (e: Entry) => e.beam === 'continue';                    // Middle: beam both sides
  const groups: Entry[][] = [];
  {
    let run: Entry[] = [];
    for (let i = 0; i < bEntries.length; i++) {
      const cur = bEntries[i];
      if (i === 0) { run = [cur]; continue; }
      const prev = bEntries[i - 1];
      const defJoin = groupIdOf.has(prev.id) && groupIdOf.get(prev.id) === groupIdOf.get(cur.id);
      let join: boolean;
      if (breakRight(prev) || breakLeft(cur)) join = false;       // explicit break wins
      else if (forceJoin(prev) || forceJoin(cur) || cur.secondaryBreak) join = true; // Middle / secondary-beam bridge the PRIMARY
      else join = defJoin;
      if (join) run.push(cur);
      else { if (run.length >= 2) groups.push(run); run = [cur]; }
    }
    if (run.length >= 2) groups.push(run);
  }

  // ── PHASE 2: emit beam tags per group, per level. ──
  for (const group of groups) {
    // Level 1 — straight start/continue/end across the whole group.
    addStatus(group[0].id, { level: 1, mode: 'start' });
    for (let i = 1; i < group.length - 1; i++) addStatus(group[i].id, { level: 1, mode: 'continue' });
    addStatus(group[group.length - 1].id, { level: 1, mode: 'end' });

    // Higher levels — sub-divide the group's notes by the level's window.
    // Only notes whose duration supplies this level's stroke participate.
    for (let level = 2; level <= maxLevel; level++) {
      // When 32nds (or shorter) are present, EVERY inner beam (16th, 32nd, …)
      // breaks at the eighth-note subdivision (0.5 beat in 4/4). A beat of
      // eight 32nds then renders as two groups of 4 — each group carrying its
      // own 16th + 32nd beams — joined only by the single primary 8th beam.
      // When the deepest note is a 16th, the 16th beam spans the whole beat
      // (one group of 4), so we keep the per-level yardstick there.
      const yardstick: DurationBase = maxLevel >= 3 ? '32nd' : beamYardstickForLevel(level);
      const win = beamGroupBeats(timeSigNum, timeSigDen, yardstick);

      // Walk the group, building sub-runs by window index. Notes that
      // don't carry this level break the sub-run (their stroke is absent
      // here, so the beam at this level can't continue through them).
      let subRun: Entry[] = [];
      let lastBgIdx = -1;
      const flushSub = () => {
        if (subRun.length >= 2) {
          addStatus(subRun[0].id, { level, mode: 'start' });
          for (let i = 1; i < subRun.length - 1; i++) addStatus(subRun[i].id, { level, mode: 'continue' });
          addStatus(subRun[subRun.length - 1].id, { level, mode: 'end' });
        }
        // Singletons at deeper levels (e.g. one 32nd inside a group of
        // 16ths) are left without a tag — Verovio renders that as a
        // partial/half-beam ("hook") attached to the nearest neighbour,
        // which is the standard engraving treatment.
        subRun = [];
      };
      for (const e of group) {
        const carries = BEAM_LEVELS[e.base] >= level;
        const bgIdx = carries ? Math.floor(e.offset / win + 1e-9) : -1;
        // "Start secondary beam" forces a SECONDARY (level ≥ 2) break before
        // this note — the primary (level 1) beam already spans through it, so
        // the result is a sub-group boundary under one continuous primary beam.
        const forceBreak = !!e.secondaryBreak;
        if (carries && bgIdx === lastBgIdx && !forceBreak) {
          subRun.push(e);
        } else {
          flushSub();
          if (carries) {
            subRun.push(e);
            lastBgIdx = bgIdx;
          } else {
            lastBgIdx = -1;
          }
        }
      }
      flushSub();
    }
  }

  return result;
}

function noteXml(
  item: NoteOrRest,
  prevHadTieStart: boolean = false,
  priorAlterInMeasure: number | null = null,
  autoBeam?: BeamLevelStatus[] | 'start' | 'continue' | 'end' | 'none',
  betweenTrem?: { start?: number; stop?: number },
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
    // Stemlet rest: emit the beam tags so Verovio draws the beam OVER the rest
    // (computeAutoBeams includes stemlet rests in the group).
    const restBeam = Array.isArray(autoBeam)
      ? [...autoBeam].sort((a, b) => a.level - b.level)
          .map(s => `<beam number="${s.level}">${s.mode === 'start' ? 'begin' : s.mode === 'continue' ? 'continue' : 'end'}</beam>`)
          .join('')
      : '';
    return `<note xml:id="${item.id}">
  <rest/>
  <duration>${dur}</duration>
  <voice>1</voice>
  <type>${type}</type>
  ${dots}
  ${timeModXml}
  ${restBeam}
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
  // Fermata variants are <notations><fermata>SHAPE</fermata>, NOT
  // <articulations> children. Each shape maps to a distinct SMuFL glyph
  // (verified against Verovio 6.2):
  //   fermata           → ''/normal     (E4C0)
  //   fermata-short     → angled        (E4C4)
  //   fermata-long      → square        (E4C6)
  //   fermata-very-long → double-square (E4C8)
  const FERMATA_SHAPE: Record<string, string> = {
    'fermata': '',
    'fermata-short': 'angled',
    'fermata-long': 'square',
    'fermata-very-long': 'double-square',
  };
  const fermatas = arts.filter(a => a in FERMATA_SHAPE);
  const articulationsTags = arts.filter(a => !(a in FERMATA_SHAPE));
  const articulationsBlock = articulationsTags.length > 0
    ? `<articulations>${articulationsTags.map(a => `<${a}/>`).join('')}</articulations>`
    : '';
  const fermataBlock = fermatas
    .map(a => (FERMATA_SHAPE[a] ? `<fermata>${FERMATA_SHAPE[a]}</fermata>` : '<fermata/>'))
    .join('');

  // Ornaments (trill-mark, mordent, inverted-mordent, turn, inverted-turn) and
  // tremolo go inside <notations><ornaments>.
  const orns = item.ornaments ?? [];
  // Between-note tremolo (start on this note / stop carried from the previous
  // note) takes precedence; a stop is emitted before a start when a note both
  // ends and begins one. Single-note tremolo / buzz roll only when there's no
  // between-note tremolo on this note.
  let tremoloXml = '';
  if (betweenTrem?.stop != null) tremoloXml += `<tremolo type="stop">${betweenTrem.stop}</tremolo>`;
  if (betweenTrem?.start != null) tremoloXml += `<tremolo type="start">${betweenTrem.start}</tremolo>`;
  if (!tremoloXml) {
    tremoloXml = item.buzz
      ? '<tremolo type="unmeasured">0</tremolo>'   // buzz roll — "z" on the stem
      : item.tremolo && item.tremolo > 0
        ? `<tremolo type="single">${Math.min(5, item.tremolo)}</tremolo>` : '';
  }
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
  if (item.graceBefore && item.graceBefore.length > 0 && !item.graceSlurDisabled) {
    slurElements.push('<slur type="stop" number="2"/>');
  }
  const slurBlock = slurElements.join('');

  // Slide (glissando line) between two notes of different pitch.
  const slideElements: string[] = [];
  if (item.slideStart) slideElements.push('<slide type="start" line-type="solid" number="1"/>');
  if (item.slideEnd)   slideElements.push('<slide type="stop" line-type="solid" number="1"/>');
  const slideBlock = slideElements.join('');

  const stemXml = item.stemDir ? `<stem>${item.stemDir}</stem>` : '';

  // Beam tags. Priority:
  //   1. User-explicit beam from item.beam (start/continue/end/none) — wins
  //      over auto-beaming, applied to level 1 only.
  //   2. autoBeam is either:
  //      • an array of BeamLevelStatus (multi-level, from computeAutoBeams)
  //      • a single string mode (legacy ghost path — applied to level 1)
  //   3. Nothing — flag.
  //
  // "none" on level 1 → emit begin+end on level 1 (standard MusicXML idiom
  // for "flagged, no beam to neighbours").
  const modeToTag = (m: 'start' | 'continue' | 'end'): string =>
    m === 'start' ? 'begin' : m === 'continue' ? 'continue' : 'end';

  let beamXml = '';
  // Manual beam overrides (item.beam) are no longer emitted directly here —
  // computeAutoBeams folds them into the grouping and returns coherent
  // multi-level statuses (see PHASE 1b), so a Begin/End/Middle note gets
  // proper begin/continue/end tags and a No-beam note gets none (→ flag).
  // Feathered beam: the note that STARTS the group carries `feathered`; we put
  // the MusicXML `fan` attribute on its primary (level-1) begin beam.
  const fan = item.type === 'note' && item.feathered ? item.feathered : null;
  const fanAttr = (level: number, mode: 'start' | 'continue' | 'end') =>
    fan && level === 1 && mode === 'start' ? ` fan="${fan}"` : '';
  if (Array.isArray(autoBeam)) {
    // Multi-level auto. Sort by level so the renderer sees them in order.
    const sorted = [...autoBeam].sort((a, b) => a.level - b.level);
    for (const s of sorted) {
      beamXml += `<beam number="${s.level}"${fanAttr(s.level, s.mode)}>${modeToTag(s.mode)}</beam>`;
    }
  } else if (autoBeam === 'start' || autoBeam === 'continue' || autoBeam === 'end') {
    beamXml = `<beam number="1"${fanAttr(1, autoBeam)}>${modeToTag(autoBeam)}</beam>`;
  }
  // autoBeam === 'none' or undefined → no beam tag (flag).

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
      const gSlurXml = idx === 0 && !item.graceSlurDisabled
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
  ${beamXml}
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
/** Build a virtual note list that interleaves the model notes with a ghost
 *  preview at its correct beat offset. Used only for beam-grouping math —
 *  the real render still emits ghost through ghostNoteXml. The returned
 *  list's element with id `__ghost__` represents the ghost; map lookup
 *  results for that id are used when emitting the ghost's <beam> tag. */
function notesForBeamingWithGhost(
  notes: NoteOrRest[],
  ghost: GhostSpec,
  maxBeats: number,
): NoteOrRest[] {
  const ghostStartBeat = ghost.slotIndex * (maxBeats / ghost.slotsTotal);
  // A rest ghost inserts a REST into the virtual list so it BREAKS the beam at
  // its slot (rests aren't beamable) — keeps neighbouring real-note beams
  // stable in the preview. A note ghost inserts a beamable note.
  const ghostItem: NoteOrRest = ghost.isRest
    ? { type: 'rest', id: '__ghost__', duration: { base: ghost.base, dots: ghost.dots } }
    : { type: 'note', id: '__ghost__', pitch: ghost.pitch, duration: { base: ghost.base, dots: ghost.dots } };
  const out: NoteOrRest[] = [];
  let offset = 0;
  let inserted = false;
  for (const n of notes) {
    if (!inserted && offset >= ghostStartBeat - 0.001) {
      out.push(ghostItem);
      inserted = true;
    }
    out.push(n);
    offset += itemBeats(n);
  }
  if (!inserted) out.push(ghostItem);
  return out;
}

function renderNotesXml(
  notes: NoteOrRest[],
  initialPrevTie: boolean = false,
  timeSigNum: number = 4,
  timeSigDen: number = 4,
  externalBeams?: Map<string, BeamLevelStatus[]>,
): { xml: string; endingTie: boolean } {
  let prevTie = initialPrevTie;
  // Tracks the LAST emitted alter per "step+octave" within this measure
  // (e.g. "G4" → 1 means a G# was rendered). Used to decide whether the
  // next G4 in this measure needs a courtesy natural.
  const measureAcc = new Map<string, number>();
  // Beam map: either supplied by caller (when a ghost was injected and the
  // map covers real-notes + ghost together) or computed from `notes` alone.
  const autoBeams = externalBeams ?? computeAutoBeams(notes, timeSigNum, timeSigDen);
  const out: string[] = [];
  let prevItem: NoteOrRest | null = null;
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
      // Between-note tremolo: this note STARTS one if it carries tremoloBetween,
      // and STOPS one if the immediately-previous note carried it.
      const betweenTrem = {
        start: n.tremoloBetween,
        stop: prevItem && prevItem.type === 'note' ? prevItem.tremoloBetween : undefined,
      };
      out.push(noteXml(n, prevTie, prior, autoBeams.get(n.id), betweenTrem));
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
      // Rest — pass its beam status too (stemlet rests are beamed over).
      out.push(noteXml(n, false, null, autoBeams.get(n.id)));
    }
    prevItem = n;
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

/** XML for a ghost-preview note — fully-formed pitch note + color attribute.
 *  When `autoBeam` is set, emits a matching `<beam>` tag so the ghost joins
 *  the running beam group instead of looking visually disconnected. */
function ghostNoteXml(
  g: GhostSpec,
  autoBeam?: BeamLevelStatus[] | 'start' | 'continue' | 'end' | 'none',
): string {
  const dur = durationDiv(g.base, g.dots);
  const type = BASE_TO_TYPE[g.base];
  const dots = '<dot/>'.repeat(g.dots);
  const { step, alter, octave } = pitchToStepOctave(g.pitch);
  const alterXml = alter !== 0 ? `<alter>${alter}</alter>` : '';
  const accidentalXml =
    alter === 1 ? `<accidental color="${GHOST_COLOR}">sharp</accidental>` :
    alter === -1 ? `<accidental color="${GHOST_COLOR}">flat</accidental>` :
    '';
  // Multi-level beam tags. Skip 'none' (avoids Verovio confusion with the
  // begin+end-on-one-note idiom in the preview).
  const modeToTag = (m: 'start' | 'continue' | 'end'): string =>
    m === 'start' ? 'begin' : m === 'continue' ? 'continue' : 'end';
  let beamXml = '';
  if (Array.isArray(autoBeam)) {
    const sorted = [...autoBeam].sort((a, b) => a.level - b.level);
    for (const s of sorted) {
      beamXml += `<beam number="${s.level}">${modeToTag(s.mode)}</beam>`;
    }
  } else if (autoBeam === 'start' || autoBeam === 'continue' || autoBeam === 'end') {
    beamXml = `<beam number="1">${modeToTag(autoBeam)}</beam>`;
  }
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
  ${beamXml}
</note>`;
}

/** XML for a ghost-preview REST — a translucent rest at the hovered beat slot.
 *  Mirrors ghostNoteXml but emits <rest/> (no pitch, no beam — rests don't
 *  beam). The ghost's `pitch` field is ignored for rests. */
function ghostRestXml(g: GhostSpec): string {
  const dur = durationDiv(g.base, g.dots);
  const type = BASE_TO_TYPE[g.base];
  const dots = '<dot/>'.repeat(g.dots);
  return `<note color="${GHOST_COLOR}">
  <rest/>
  <duration>${dur}</duration>
  <voice>1</voice>
  <type>${type}</type>
  ${dots}
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

  // When a ghost is in flight, compute beam grouping on the virtual list
  // (real notes + ghost at its beat offset). The same map is then used for
  // every render path below — keeps the ghost preview's beam in sync with
  // what the commit will produce.
  const beamMap: Map<string, BeamLevelStatus[]> | undefined =
    ghost
      ? computeAutoBeams(
          notesForBeamingWithGhost(notes, ghost, maxBeats),
          timeSigNum,
          timeSigDen,
        )
      : undefined;
  const beamModeOf = (id: string) => beamMap?.get(id);
  // Ghost render: a rest ghost emits a translucent <rest>, a note ghost the
  // usual pitched note. Rests don't beam, so the beam mode is ignored for them.
  const ghostXml = (g: GhostSpec, beam: ReturnType<typeof beamModeOf>) =>
    g.isRest ? ghostRestXml(g) : ghostNoteXml(g, beam);

  if (notes.length === 0 && ghost) {
    // Empty measure: [rests before] [ghost] [rests after]
    const afterBeats = Math.max(0, maxBeats - ghostStartBeat - ghostBeats);
    const parts: string[] = [];
    if (ghostStartBeat > 0.001) parts.push(padRests(ghostStartBeat));
    parts.push(ghostXml(ghost, beamModeOf('__ghost__')));
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
    // Contiguous run of rests covering the ghost — a half/longer ghost can span
    // several padded rest pieces, so "fits inside one rest" isn't enough.
    let restRunStart = -1, restRunStartBeat = 0, restRunEnd = -1, restRunEndBeat = 0;
    let ghostFitsRestRun = false;
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
      // Find the rest run that both starts at/contains the ghost AND is long
      // enough to hold the whole ghost duration.
      let beat2 = 0, rs = -1, rsb = 0;
      for (let i = 0; i < notes.length; i++) {
        const ib = itemBeats(notes[i]);
        if (notes[i].type === 'rest') {
          if (rs === -1) { rs = i; rsb = beat2; }
          if (ghostStartBeat >= rsb - 0.001 && ghostStartBeat + ghostBeats <= beat2 + ib + 0.001) {
            restRunStart = rs; restRunStartBeat = rsb; restRunEnd = i; restRunEndBeat = beat2 + ib;
            ghostFitsRestRun = true;
            break;
          }
        } else {
          rs = -1;
        }
        beat2 += ib;
      }
    }

    if (ghost && targetIndex >= 0 && targetIsRest && targetMatchesDuration) {
      // Ghost replaces a rest in-place — render it tinted, leave the rest
      // out of the output for the duration of the ghost.
      const items: string[] = notes.map((n, i) =>
        i === targetIndex
          ? ghostXml(ghost, beamModeOf('__ghost__'))
          : noteXml(n, false, null, beamModeOf(n.id)),
      );
      body = items.join('\n');
    } else if (
      ghost && !ghost.isRest && targetIndex >= 0 && !targetIsRest && targetMatchesDuration
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
        if (i !== targetIndex) return noteXml(n, false, null, beamModeOf(n.id));
        // Chord stack — preview pitch shares stem with the real note, so it
        // doesn't get its own beam tag.
        return showChordPreview
          ? noteXml(n, false, null, beamModeOf(n.id)) + '\n' + ghostChordOnlyXml(ghost)
          : noteXml(n, false, null, beamModeOf(n.id));
      });
      body = items.join('\n');
    } else if (ghost && ghostFitsRestRun) {
      // Ghost lands in a RUN of one or more consecutive rests — split-render it
      // as [leading rest, ghost, trailing rest], consuming the whole run. This
      // covers a half/longer note that spans several padded rest pieces (which
      // the old "fits inside ONE rest" check rejected, so the preview vanished
      // even though the commit succeeds). The model keeps the rests; INSERT_NOTE
      // performs the real split on commit.
      const leading = ghostStartBeat - restRunStartBeat;
      const trailing = restRunEndBeat - (ghostStartBeat + ghostBeats);
      const items: string[] = [];
      for (let i = 0; i < notes.length; i++) {
        if (i < restRunStart || i > restRunEnd) {
          items.push(noteXml(notes[i], false, null, beamModeOf(notes[i].id)));
        } else if (i === restRunStart) {
          if (leading > 0.001) items.push(padRests(leading));
          items.push(ghostXml(ghost, beamModeOf('__ghost__')));
          if (trailing > 0.001) items.push(padRests(trailing));
        }
        // indices in (restRunStart, restRunEnd] are consumed by the run above
      }
      body = items.join('\n');
    } else if (ghost && ghostStartBeat >= usedBeats - 0.001 && ghostStartBeat + ghostBeats <= maxBeats + 0.001) {
      // Ghost lands after existing items — preview an "append".
      const r = renderNotesXml(notes, initialPrevTie, timeSigNum, timeSigDen, beamMap);
      endingTie = r.endingTie;
      const itemsXml = r.xml;
      const gap = Math.max(0, ghostStartBeat - usedBeats);
      const afterBeats = Math.max(0, maxBeats - ghostStartBeat - ghostBeats);
      const parts: string[] = [itemsXml];
      if (gap > 0.001) parts.push(padRests(gap));
      parts.push(ghostXml(ghost, beamModeOf('__ghost__')));
      if (afterBeats > 0.001) parts.push(padRests(afterBeats));
      body = parts.join('\n');
    } else {
      // No ghost or ghost conflicts with a real note — render normally.
      const r = renderNotesXml(notes, initialPrevTie, timeSigNum, timeSigDen, beamMap);
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
