import type { Duration, DurationBase, Measure, NoteOrRest, Part, Pitch, Score } from './music-model';

// ─── Import ───────────────────────────────────────────────────────────────────

interface ImportWarning { code: string; message: string; }
export interface MusicXmlImportResult { score: Score; warnings: ImportWarning[]; }

const DURATION_CANDIDATES: Duration[] = [
  { base: 'whole', dots: 0 }, { base: 'whole', dots: 1 },
  { base: 'half', dots: 0 }, { base: 'half', dots: 1 }, { base: 'half', dots: 2 },
  { base: 'quarter', dots: 0 }, { base: 'quarter', dots: 1 }, { base: 'quarter', dots: 2 },
  { base: 'eighth', dots: 0 }, { base: 'eighth', dots: 1 }, { base: 'eighth', dots: 2 },
  { base: '16th', dots: 0 }, { base: '16th', dots: 1 },
  { base: '32nd', dots: 0 }, { base: '32nd', dots: 1 },
  { base: '64th', dots: 0 },
];

const BASE_TO_BEATS: Record<DurationBase, number> = {
  whole: 4, half: 2, quarter: 1, eighth: 0.5, '16th': 0.25, '32nd': 0.125, '64th': 0.0625,
};

const TYPE_TO_BASE: Record<string, DurationBase> = {
  whole: 'whole', half: 'half', quarter: 'quarter', eighth: 'eighth',
  '16th': '16th', '32nd': '32nd', '64th': '64th',
};

function text(node: Element | null | undefined, selector: string): string | null {
  if (!node) return null;
  return node.querySelector(selector)?.textContent?.trim() ?? null;
}

function durBeats(d: Duration): number {
  const base = BASE_TO_BEATS[d.base];
  if (d.dots === 0) return base;
  if (d.dots === 1) return base * 1.5;
  return base * 1.75;
}

function closestDuration(beats: number): Duration {
  let best = DURATION_CANDIDATES[0];
  let minDelta = Math.abs(durBeats(best) - beats);
  for (const c of DURATION_CANDIDATES) {
    const delta = Math.abs(durBeats(c) - beats);
    if (delta < minDelta) { minDelta = delta; best = c; }
  }
  return best;
}

function parsePitch(noteEl: Element): Pitch | null {
  const step = text(noteEl, 'pitch > step');
  const alterRaw = text(noteEl, 'pitch > alter');
  const octaveRaw = text(noteEl, 'pitch > octave');
  if (!step || octaveRaw === null) return null;
  const octave = Number(octaveRaw);
  if (Number.isNaN(octave)) return null;
  const stepOffsets: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const stepOffset = stepOffsets[step.toUpperCase()];
  if (stepOffset === undefined) return null;
  const rawAlter = alterRaw === null ? 0 : Number(alterRaw);
  const normalizedAlter: -1 | 0 | 1 = Number.isNaN(rawAlter) ? 0 : rawAlter < 0 ? -1 : rawAlter > 0 ? 1 : 0;
  const midi = (octave + 1) * 12 + stepOffset + normalizedAlter;
  return { midi: Math.max(0, Math.min(127, midi)), alter: normalizedAlter };
}

function parseDuration(noteEl: Element, divisions: number): Duration {
  const typeRaw = text(noteEl, 'type');
  const dots = Math.min(noteEl.querySelectorAll('dot').length, 2) as 0 | 1 | 2;
  if (typeRaw && TYPE_TO_BASE[typeRaw]) return { base: TYPE_TO_BASE[typeRaw], dots };
  const durationRaw = text(noteEl, 'duration');
  const durationTicks = durationRaw === null ? NaN : Number(durationRaw);
  if (Number.isNaN(durationTicks) || divisions <= 0) return { base: 'quarter', dots: 0 };
  return closestDuration(durationTicks / divisions);
}

export function importMusicXml(xmlText: string, fallbackTitle = 'Imported score'): MusicXmlImportResult {
  const warnings: ImportWarning[] = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Invalid XML file.');
  const root = doc.querySelector('score-partwise');
  if (!root) throw new Error('Unsupported MusicXML format. Expected score-partwise.');

  const title = text(root, 'work > work-title') || text(root, 'movement-title') || fallbackTitle;
  const composer = text(root, "identification > creator[type='composer']") || '';

  const partNameMap = new Map<string, string>();
  root.querySelectorAll('part-list > score-part').forEach((partNode) => {
    const id = partNode.getAttribute('id');
    if (!id) return;
    partNameMap.set(id, text(partNode, 'part-name') || id);
  });

  const parts: Part[] = [];
  let globalTimeSig = { num: 4, den: 4 };
  let globalKeySig = 0;

  root.querySelectorAll('part').forEach((partEl, partIndex) => {
    const partId = partEl.getAttribute('id') || `P${partIndex + 1}`;
    const partName = partNameMap.get(partId) || `Part ${partIndex + 1}`;
    const measures: Measure[] = [];
    let currentDivisions = 1;

    partEl.querySelectorAll(':scope > measure').forEach((measureEl, measureIndex) => {
      const measureNumber = Number(measureEl.getAttribute('number') || measureIndex + 1);
      const attrs = measureEl.querySelector(':scope > attributes');
      if (attrs) {
        const d = Number(text(attrs, 'divisions'));
        if (!Number.isNaN(d) && d > 0) currentDivisions = d;
        const beatsRaw = text(attrs, 'time > beats');
        const beatTypeRaw = text(attrs, 'time > beat-type');
        if (beatsRaw && beatTypeRaw) {
          const b = Number(beatsRaw), bt = Number(beatTypeRaw);
          if (!Number.isNaN(b) && !Number.isNaN(bt) && b > 0 && bt > 0) globalTimeSig = { num: b, den: bt };
        }
        const fifths = Number(text(attrs, 'key > fifths'));
        if (!Number.isNaN(fifths)) globalKeySig = Math.max(-7, Math.min(7, fifths));
      }

      const notes: NoteOrRest[] = [];
      measureEl.querySelectorAll(':scope > note').forEach((noteEl) => {
        if (noteEl.querySelector('chord')) {
          warnings.push({ code: 'CHORD_SIMPLIFIED', message: 'Chord notes simplified.' });
        }
        const duration = parseDuration(noteEl, currentDivisions);
        if (noteEl.querySelector('rest')) {
          notes.push({ type: 'rest', id: crypto.randomUUID(), duration });
          return;
        }
        const pitch = parsePitch(noteEl);
        if (!pitch) {
          warnings.push({ code: 'PITCH_SKIPPED', message: `Skipped note in measure ${measureNumber}.` });
          return;
        }
        notes.push({ type: 'note', id: crypto.randomUUID(), pitch, duration });
      });

      measures.push({
        id: crypto.randomUUID(),
        number: Number.isNaN(measureNumber) ? measureIndex + 1 : measureNumber,
        notes,
      });
    });

    parts.push({
      id: partId,
      instrumentId: partId,
      name: partName,
      abbreviation: partName,
      clef: 'treble',
      measures,
    });
  });

  if (parts.length === 0) throw new Error('No parts found in MusicXML.');

  return {
    score: {
      id: crypto.randomUUID(),
      metadata: { title, composer, tempo: 120, timeSig: globalTimeSig, keySig: globalKeySig },
      parts,
    },
    warnings,
  };
}

// ─── Export ───────────────────────────────────────────────────────────────────

const BASE_TO_TYPE: Record<DurationBase, string> = {
  whole: 'whole', half: 'half', quarter: 'quarter', eighth: 'eighth',
  '16th': '16th', '32nd': '32nd', '64th': '64th',
};

const DIVISIONS = 16; // quarter note = 16 ticks

function durationToTicks(d: Duration): number {
  const base = BASE_TO_BEATS[d.base] * DIVISIONS;
  if (d.dots === 0) return base;
  if (d.dots === 1) return base * 1.5;
  return base * 1.75;
}

const KEY_SIG_FIFTHS: Record<number, number> = {
  '-7': -7, '-6': -6, '-5': -5, '-4': -4, '-3': -3, '-2': -2, '-1': -1,
  0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7,
};

const CLEF_TO_XML: Record<string, { sign: string; line: number }> = {
  treble: { sign: 'G', line: 2 },
  bass:   { sign: 'F', line: 4 },
  alto:   { sign: 'C', line: 3 },
  tenor:  { sign: 'C', line: 4 },
  percussion: { sign: 'percussion', line: 2 },
};

function noteToXml(note: NoteOrRest): string {
  const dots = '<dot/>'.repeat(note.duration.dots);
  const ticks = Math.round(durationToTicks(note.duration));
  const type = BASE_TO_TYPE[note.duration.base];

  if (note.type === 'rest') {
    return `<note><rest/><duration>${ticks}</duration><type>${type}</type>${dots}</note>`;
  }

  const pc = note.pitch.midi % 12;
  const octave = Math.floor(note.pitch.midi / 12) - 1;
  const stepNames = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
  const step = stepNames[pc];
  const alter = note.pitch.alter !== 0 ? `<alter>${note.pitch.alter}</alter>` : '';

  return `<note><pitch><step>${step}</step>${alter}<octave>${octave}</octave></pitch><duration>${ticks}</duration><type>${type}</type>${dots}</note>`;
}

export function exportMusicXml(score: Score): string {
  const { title, composer, timeSig, keySig } = score.metadata;
  const fifths = KEY_SIG_FIFTHS[keySig] ?? 0;

  const partListXml = score.parts.map((p, i) =>
    `<score-part id="P${i + 1}"><part-name>${p.name}</part-name></score-part>`
  ).join('\n    ');

  const partsXml = score.parts.map((p, i) => {
    const clefInfo = CLEF_TO_XML[p.clef] ?? CLEF_TO_XML.treble;
    const measuresXml = p.measures.map((m, mi) => {
      const attrs = mi === 0
        ? `<attributes><divisions>${DIVISIONS}</divisions><key><fifths>${fifths}</fifths></key><time><beats>${timeSig.num}</beats><beat-type>${timeSig.den}</beat-type></time><clef><sign>${clefInfo.sign}</sign><line>${clefInfo.line}</line></clef></attributes>`
        : '';
      const notesXml = m.notes.map(noteToXml).join('');
      return `<measure number="${m.number}">${attrs}${notesXml}</measure>`;
    }).join('\n      ');
    return `<part id="P${i + 1}">\n      ${measuresXml}\n    </part>`;
  }).join('\n    ');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <work><work-title>${title}</work-title></work>
  <identification>
    <creator type="composer">${composer}</creator>
  </identification>
  <part-list>
    ${partListXml}
  </part-list>
  ${partsXml}
</score-partwise>`;
}
