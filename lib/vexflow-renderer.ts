import type { Score, CursorPosition, Pitch } from './music-model';
import type { EditorMode, StaveLayout } from './editor-state';
import { vexDuration, pitchToVexKey, beatsPerMeasure, durationBeats } from './music-model';

// ─── Layout constants ─────────────────────────────────────────────────────────

const MARGIN_LEFT        = 16;
const MARGIN_RIGHT       = 16;
const MARGIN_TOP         = 12;
const MIN_MEASURE_WIDTH  = 100;
const NOTES_PER_NOTE_WIDTH = 46;  // pixels per note slot
const CLEF_WIDTH         = 38;    // reserved for clef symbol
const TIME_SIG_WIDTH     = 26;    // reserved for time signature
const KEY_SIG_WIDTH      = 12;    // per accidental in key sig
const STAVE_SLOT_H       = 52;    // height slot per stave (staff=40 + 12 headroom)
const PART_GAP           = 56;    // gap between consecutive parts in one system
const SYSTEM_GAP         = 72;    // gap between systems

// ─── Key signature helpers ────────────────────────────────────────────────────

const KEY_SIG_NAMES: Record<string, string> = {
  '0': 'C',
  '1': 'G',  '2': 'D',  '3': 'A',  '4': 'E',  '5': 'B',  '6': 'F#', '7': 'C#',
  '-1': 'F', '-2': 'Bb', '-3': 'Eb', '-4': 'Ab', '-5': 'Db', '-6': 'Gb', '-7': 'Cb',
};

// Pitch classes (chromatic index 0-11) affected by each sharp/flat, in order
const SHARP_PCS = [6, 1, 8, 3, 10, 5, 0]; // F# C# G# D# A# E# B#
const FLAT_PCS  = [10, 3, 8, 1, 6, 11, 4]; // Bb Eb Ab Db Gb Cb Fb

const IS_BLACK_KEY = [false, true, false, true, false, false, true, false, true, false, true, false];

/**
 * Returns the VexFlow accidental string to attach to a StaveNote, or null if none needed.
 * Takes the key signature into account so accidentals in-key are not shown.
 */
function getVexAccidental(pitch: Pitch, keySig: number): string | null {
  const pc = pitch.midi % 12;
  const sharpSet = new Set(keySig > 0 ? SHARP_PCS.slice(0, keySig) : []);
  const flatSet  = new Set(keySig < 0 ? FLAT_PCS.slice(0, -keySig) : []);

  if (IS_BLACK_KEY[pc]) {
    // This is a chromatically-altered pitch (black key on piano)
    if (sharpSet.has(pc) && pitch.alter === 1)  return null; // already sharp in key sig
    if (flatSet.has(pc)  && pitch.alter === -1) return null; // already flat in key sig
    return pitch.alter === -1 ? 'b' : '#';
  } else {
    // White key — may need a natural sign to override the key sig
    // If the key sig sharpens the note immediately above (pc+1), this white key needs ♮
    // If the key sig flattens the note immediately below (pc-1), this white key needs ♮
    const sharpAbove = sharpSet.has((pc + 1) % 12);
    const flatBelow  = flatSet.has((pc - 1 + 12) % 12);
    return (sharpAbove || flatBelow) ? 'n' : null;
  }
}

// ─── System layout helpers ────────────────────────────────────────────────────

function systemHeight(numParts: number): number {
  return numParts * STAVE_SLOT_H + (numParts - 1) * PART_GAP;
}

// ─── Main render function ─────────────────────────────────────────────────────

export async function renderScore(
  container: HTMLDivElement,
  score: Score,
  cursor: CursorPosition,
  mode: EditorMode,
  selectedNoteIds: Set<string>,
  zoom: number,
): Promise<StaveLayout[]> {
  const VF = await import('vexflow');
  const { Renderer, Stave, StaveNote, Voice, Formatter, Beam, Accidental, Dot } = VF;

  container.innerHTML = '';

  const keySig    = score.metadata.keySig;
  const keySigStr = KEY_SIG_NAMES[String(keySig)] ?? 'C';
  const numParts  = score.parts.length;
  const timeSig   = score.metadata.timeSig;
  const numMeasures = score.parts[0]?.measures.length ?? 0;
  const keySigExtra = KEY_SIG_WIDTH * Math.abs(keySig);

  // ── Width calculation ───────────────────────────────────────────────────────

  function noteAreaWidth(mIdx: number): number {
    let maxNotes = 0;
    for (const part of score.parts) {
      const n = part.measures[mIdx]?.notes.length ?? 0;
      maxNotes = Math.max(maxNotes, n);
    }
    return Math.max(MIN_MEASURE_WIDTH, maxNotes * NOTES_PER_NOTE_WIDTH + 24);
  }

  // Width for a measure given whether it starts a system (needs clef/keysig header)
  function measureWidth(mIdx: number, isSystemStart: boolean): number {
    const noteW = noteAreaWidth(mIdx);
    if (!isSystemStart) return noteW;
    return noteW + CLEF_WIDTH + keySigExtra + (mIdx === 0 ? TIME_SIG_WIDTH : 0);
  }

  // ── Two-pass system building ────────────────────────────────────────────────
  // Pass 1: determine where line breaks occur

  const containerWidth  = container.offsetWidth || 800;
  const availableWidth  = containerWidth - MARGIN_LEFT - MARGIN_RIGHT;

  const systems: number[][] = [];
  let currentSystem: number[] = [];
  let currentWidth = 0;

  for (let m = 0; m < numMeasures; m++) {
    const isStart = currentSystem.length === 0;
    const w = measureWidth(m, isStart);
    if (!isStart && currentWidth + w > availableWidth) {
      systems.push(currentSystem);
      currentSystem = [m];
      currentWidth = measureWidth(m, true);
    } else {
      currentSystem.push(m);
      currentWidth += w;
    }
  }
  if (currentSystem.length > 0) systems.push(currentSystem);

  const systemStartSet = new Set(systems.map(s => s[0]));

  // ── SVG setup ───────────────────────────────────────────────────────────────

  const totalHeight = MARGIN_TOP + systems.length * (systemHeight(numParts) + SYSTEM_GAP);
  const renderer    = new Renderer(container, Renderer.Backends.SVG);
  renderer.resize(containerWidth, totalHeight);
  const ctx = renderer.getContext();
  ctx.setFont('Arial', 10);

  const layouts: StaveLayout[] = [];

  // ── Render each system ──────────────────────────────────────────────────────

  for (let sysIdx = 0; sysIdx < systems.length; sysIdx++) {
    const measureIndices = systems[sysIdx];
    const sysY = MARGIN_TOP + sysIdx * (systemHeight(numParts) + SYSTEM_GAP);

    // Stretch measures to fill the available width
    const usedWidth = measureIndices.reduce((s, m) => s + measureWidth(m, systemStartSet.has(m)), 0);
    const extraPerMeasure = Math.max(0, availableWidth - usedWidth) / measureIndices.length;

    // Build column geometry
    let xPos = MARGIN_LEFT;
    const columns = measureIndices.map(mIdx => {
      const w = measureWidth(mIdx, systemStartSet.has(mIdx)) + extraPerMeasure;
      const col = { x: xPos, width: w, measureIndex: mIdx };
      xPos += w;
      return col;
    });

    // System bracket for multiple parts
    if (numParts > 1) {
      const bx = MARGIN_LEFT - 7;
      const bt = sysY;
      const bb = sysY + systemHeight(numParts);
      ctx.save();
      ctx.fillStyle = '#111';
      ctx.fillRect(bx, bt, 4, bb - bt);
      ctx.fillRect(bx - 4, bt - 1, 12, 5);      // top serif
      ctx.fillRect(bx - 4, bb - 4, 12, 5);      // bottom serif
      ctx.restore();
    }

    // ── Render each part ──────────────────────────────────────────────────────

    for (let partIdx = 0; partIdx < numParts; partIdx++) {
      const part      = score.parts[partIdx];
      const partY     = sysY + partIdx * (STAVE_SLOT_H + PART_GAP);
      const clefType  = part.clef as 'treble' | 'bass' | 'alto' | 'tenor' | 'percussion';

      for (const col of columns) {
        const { x, width, measureIndex: mIdx } = col;
        const measure      = part.measures[mIdx];
        const isSystemStart = systemStartSet.has(mIdx);
        const isFirstEver   = mIdx === 0;

        // ── Stave ────────────────────────────────────────────────────────────

        const stave = new Stave(x, partY, width);
        if (isSystemStart) {
          stave.addClef(clefType);
          if (clefType !== 'percussion') stave.addKeySignature(keySigStr);
        }
        if (isFirstEver) {
          stave.addTimeSignature(`${timeSig.num}/${timeSig.den}`);
        }
        stave.setContext(ctx).draw();

        // Measure number label (above stave, first part only)
        if (partIdx === 0 && mIdx > 0) {
          ctx.save();
          ctx.setFont('Arial', 9);
          ctx.fillStyle = '#aaa';
          ctx.fillText(String(mIdx + 1), x + (isSystemStart ? 4 : 3), partY - 5);
          ctx.restore();
        }

        // ── Build StaveNotes ──────────────────────────────────────────────────

        const staveNotes: InstanceType<typeof StaveNote>[] = [];

        for (const nr of (measure?.notes ?? [])) {
          const dur = vexDuration(nr.duration);

          if (nr.type === 'note') {
            const sn = new StaveNote({
              keys:     [pitchToVexKey(nr.pitch)],
              duration: dur,
              clef:     clefType,
              autoStem: true,
            });
            const acc = getVexAccidental(nr.pitch, keySig);
            if (acc) sn.addModifier(new Accidental(acc), 0);
            for (let d = 0; d < nr.duration.dots; d++) Dot.buildAndAttach([sn], { all: true });
            if (selectedNoteIds.has(nr.id)) {
              sn.setStyle({ fillStyle: '#c0392b', strokeStyle: '#c0392b' });
            }
            staveNotes.push(sn);
          } else {
            // Rest — place at standard center position
            const restKey = clefType === 'bass' ? 'd/3' : 'b/4';
            const sn = new StaveNote({
              keys:     [restKey],
              duration: dur + 'r',
              clef:     clefType,
            });
            for (let d = 0; d < nr.duration.dots; d++) Dot.buildAndAttach([sn], { all: true });
            staveNotes.push(sn);
          }
        }

        // Ghost whole rest when measure is empty
        const tickables: InstanceType<typeof StaveNote>[] = staveNotes.length > 0
          ? staveNotes
          : (() => {
              const g = new StaveNote({
                keys: [clefType === 'bass' ? 'd/3' : 'b/4'],
                duration: 'wr',
              });
              g.setStyle({ fillStyle: '#ccc', strokeStyle: '#ccc' });
              return [g];
            })();

        // ── Format & draw voice ───────────────────────────────────────────────

        let decorW = isSystemStart ? CLEF_WIDTH + keySigExtra : 0;
        if (isFirstEver) decorW += TIME_SIG_WIDTH;
        const innerW = Math.max(40, width - decorW - 22);

        try {
          const voice = new Voice({ numBeats: timeSig.num, beatValue: timeSig.den });
          voice.setStrict(false);
          voice.addTickables(tickables);
          new Formatter().joinVoices([voice]).format([voice], innerW);
          voice.draw(ctx, stave);

          if (staveNotes.length > 0) {
            Beam.generateBeams(staveNotes).forEach(b => b.setContext(ctx).draw());
          }
        } catch {
          // ignore formatter errors
        }

        // ── Note positions & cursor x positions ───────────────────────────────

        const notePositions: StaveLayout['notePositions'] = [];
        const cursorXPositions: number[] = [];
        let beatAcc = 0;

        for (let ni = 0; ni < (measure?.notes.length ?? 0); ni++) {
          const sn = staveNotes[ni];
          try {
            const bb = sn?.getBoundingBox();
            const nx = bb ? bb.getX() + bb.getW() / 2 : x + decorW + 30 + ni * NOTES_PER_NOTE_WIDTH;
            notePositions.push({ noteId: measure!.notes[ni].id, x: nx, beatOffset: beatAcc });
            cursorXPositions.push(nx - 8);
          } catch {
            cursorXPositions.push(x + decorW + 30 + ni * NOTES_PER_NOTE_WIDTH);
          }
          beatAcc += durationBeats(measure!.notes[ni].duration);
        }

        // Last cursor position (after all notes in the measure)
        const lastCursorX = (() => {
          if (staveNotes.length > 0) {
            try {
              const bb = staveNotes[staveNotes.length - 1].getBoundingBox();
              if (bb) return bb.getX() + bb.getW() + 8;
            } catch { /**/ }
          }
          return x + decorW + 28;
        })();
        cursorXPositions.push(lastCursorX);

        // ── Draw cursor ───────────────────────────────────────────────────────

        if (mode === 'note-input' && partIdx === cursor.partIndex && mIdx === cursor.measureIndex) {
          const ni  = Math.min(cursor.noteIndex, cursorXPositions.length - 1);
          const cx  = cursorXPositions[ni] ?? lastCursorX;
          const top = partY - 10;
          const bot = partY + STAVE_SLOT_H + 6;

          ctx.save();
          ctx.fillStyle = 'rgba(192,57,43,0.10)';
          ctx.fillRect(cx - 1, top, 4, bot - top);
          ctx.strokeStyle = '#c0392b';
          ctx.setLineWidth(2);
          ctx.beginPath();
          ctx.moveTo(cx + 1, top);
          ctx.lineTo(cx + 1, bot);
          ctx.stroke();
          ctx.restore();
        }

        // ── Store layout ──────────────────────────────────────────────────────

        layouts.push({
          partIndex:       partIdx,
          measureIndex:    mIdx,
          x,
          y:               partY,
          width,
          staveTopY:       partY,
          staveBottomY:    partY + 40,
          clef:            clefType as 'treble' | 'bass' | 'alto',
          notePositions,
          cursorXPositions,
        });
      }
    }
  }

  return layouts;
}

// ─── Click → score position resolution ───────────────────────────────────────

export interface ClickResult {
  partIndex:          number;
  measureIndex:       number;
  noteIndex:          number;
  pitch:              { midi: number; alter: -1 | 0 | 1 } | null;
  snappedY:           number;
  staffPositionLabel: string;
}

export function resolveClick(
  clientX:       number,
  clientY:       number,
  containerRect: DOMRect,
  zoom:          number,
  layouts:       StaveLayout[],
  _score:        Score,
): ClickResult | null {
  const scale = zoom / 100;
  const svgX  = (clientX - containerRect.left) / scale;
  const svgY  = (clientY - containerRect.top)  / scale;

  const hit = layouts.find(l =>
    svgX >= l.x &&
    svgX <= l.x + l.width &&
    svgY >= l.staveTopY - 30 &&
    svgY <= l.staveBottomY + 45,
  );
  if (!hit) return null;

  // Find note index (cursor slot)
  let noteIndex = hit.notePositions.length;
  for (let i = 0; i < hit.notePositions.length; i++) {
    if (svgX < hit.notePositions[i].x) { noteIndex = i; break; }
  }

  const pitchInfo = yToPitchInfo(svgY, hit.staveTopY, hit.clef);
  return {
    partIndex:          hit.partIndex,
    measureIndex:       hit.measureIndex,
    noteIndex,
    pitch:              pitchInfo.pitch,
    snappedY:           pitchInfo.snappedY,
    staffPositionLabel: pitchInfo.staffPositionLabel,
  };
}

// ─── Y coordinate → musical pitch ────────────────────────────────────────────

// Each entry is the MIDI note at that staff position (top to bottom, step = 5px)
const TREBLE_STEPS = [79,77,76,74,72,71,69,67,65,64,62,60,59,57,55,53,52,50,48,47,45,43];
const BASS_STEPS   = [57,55,53,52,50,48,47,45,43,41,40,38,36,35,33,31,29,28,26,24,23,21];

function yToPitchInfo(svgY: number, staveTopY: number, clef: 'treble' | 'bass' | 'alto'): {
  pitch: { midi: number; alter: -1 | 0 | 1 };
  snappedY: number;
  staffPositionLabel: string;
} {
  const relY         = svgY - staveTopY;
  const step         = Math.round(relY / 5);
  const steps        = clef === 'bass' ? BASS_STEPS : TREBLE_STEPS;
  const clamped      = Math.max(0, Math.min(steps.length - 1, step));
  const midi         = steps[clamped];
  const snappedY     = staveTopY + clamped * 5;
  const pc           = midi % 12;
  const isBlack      = IS_BLACK_KEY[pc];
  const isLine       = clamped % 2 === 0;
  const inStaff      = clamped >= 2 && clamped <= 10; // 5 lines × 2 slots each
  const label        = inStaff
    ? `${isLine ? 'Line' : 'Space'} ${Math.max(1, 6 - Math.floor(clamped / 2))}`
    : isLine ? 'Ledger line' : 'Ledger space';

  return {
    pitch: { midi, alter: isBlack ? 1 : 0 },
    snappedY,
    staffPositionLabel: label,
  };
}
