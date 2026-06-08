'use client';

import { useReducer, useCallback } from 'react';
import {
  Score, Note, Rest, NoteOrRest, CursorPosition, Pitch, Duration, DurationBase,
  Alter, AccidentalDisplay, TupletInfo,
  cloneScore, makeMeasure, getMeasureBeats, beatsPerMeasure, durationBeats, itemBeats,
  defaultTupletConfig, shiftDurationDown,
  makeRestsForBeats, createEmptyScore,
} from './music-model';

// ─── Actions ─────────────────────────────────────────────────────────────────

export type ScoreAction =
  | { type: 'INSERT_NOTE';   partIndex: number; measureIndex: number; noteIndex: number; note: Note }
  | { type: 'INSERT_NOTE_AT_BEAT'; partIndex: number; measureIndex: number; atBeat: number; note: Note }
  | { type: 'INSERT_REST';   partIndex: number; measureIndex: number; noteIndex: number; rest: Rest }
  | { type: 'REPLACE_AT_INDEX'; partIndex: number; measureIndex: number; noteIndex: number; item: Note | Rest }
  | { type: 'DELETE_NOTES';  noteIds: string[] }
  | { type: 'CONVERT_TO_RESTS'; noteIds: string[]; restBase: import('./music-model').DurationBase }
  | { type: 'SET_BARLINE'; measureIndex: number; side: 'left' | 'right'; style: 'double' | 'final' | 'repeat-start' | 'repeat-end' | null }
  | { type: 'CHANGE_PITCH';  noteId: string; midi: number; alter: Alter }
  | { type: 'CHANGE_CHORD_PITCH'; noteId: string; chordIdx: number; midi: number; alter: Alter }
  | { type: 'CHANGE_GRACE_PITCH'; noteId: string; graceIdx: number; midi: number; alter: Alter }
  | { type: 'SET_ACCIDENTAL_DISPLAY'; noteId: string; value: AccidentalDisplay | null }
  | { type: 'TOGGLE_BRACKET_ACCIDENTAL'; noteId: string }
  | { type: 'TOGGLE_CUE_SIZE'; noteId: string }
  | { type: 'SET_BEKAR_MARK'; noteId: string; value: boolean }
  | { type: 'TOGGLE_GRACE'; noteId: string; kind: 'acciaccatura' | 'appoggiatura' }
  | { type: 'SET_GRACE_KIND'; parentId: string; graceIdx: number; kind: 'acciaccatura' | 'appoggiatura' }
  | { type: 'SET_NOTEHEAD'; noteId: string; shape: 'normal' | 'slashed' | 'slash' | 'x' | 'diamond' | 'triangle' | 'square' | 'cluster' | null }
  | { type: 'TOGGLE_PRE_BEND'; noteId: string }
  | { type: 'TOGGLE_HAIRPIN'; startId: string; endId?: string; kind: 'crescendo' | 'diminuendo' }
  | { type: 'TOGGLE_OCTAVE_SHIFT'; startId: string; endId?: string; shift: '8va-up' | '8va-down' | '15ma-up' | '15ma-down' }
  | { type: 'TOGGLE_PEDAL'; startId: string; endId?: string }
  | { type: 'SET_CLEF_CHANGE'; noteId: string; clef: 'treble' | 'bass' | 'alto' | null }
  | { type: 'SET_TIME_SIG_CHANGE'; noteId: string; num: number | null; den?: number }
  | { type: 'TOGGLE_TUPLET'; itemId: string; num: 3 | 4 | 5 | 6 | 7 | 9 }
  | { type: 'CONVERT_TO_GRACE'; noteId: string; kind: 'acciaccatura' | 'appoggiatura' }
  | { type: 'REMOVE_CHORD_NOTE'; noteId: string; chordIdx: number }
  | { type: 'ADD_TO_CHORD';  noteId: string; pitch: Pitch }
  | { type: 'CHANGE_DURATION'; itemId: string; duration: Duration }
  | { type: 'TOGGLE_ARTICULATION'; noteId: string; articulation: string }
  | { type: 'TOGGLE_TIE'; noteId: string }
  | { type: 'TOGGLE_SLUR'; startId: string; endId?: string }
  | { type: 'TOGGLE_SLIDE'; startId: string; endId: string }
  | { type: 'TOGGLE_ORNAMENT'; noteId: string; ornament: string }
  | { type: 'SET_DYNAMICS'; noteId: string; dynamics: string | null }
  | { type: 'SET_STEM_DIR'; noteId: string; dir: 'up' | 'down' | 'auto' }
  | { type: 'SET_TREMOLO'; noteId: string; count: number }
  | { type: 'TOGGLE_WORDS'; noteId: string; text: string }
  | { type: 'ADD_MEASURE' }
  | { type: 'LOAD_SCORE';    score: Score }
  | { type: 'MOVE_CURSOR';   cursor: CursorPosition }
  | { type: 'SET_TEMPO';     tempo: number }
  | { type: 'SET_TITLE';     title: string }
  | { type: 'SET_COMPOSER';  composer: string }
  | { type: 'SET_KEY_SIG';   keySig: number }
  | { type: 'SET_TIME_SIG';  num: number; den: number }
  | { type: 'UNDO' }
  | { type: 'REDO' };

// ─── State ───────────────────────────────────────────────────────────────────

interface HistoryEntry {
  score: Score;
  cursor: CursorPosition;
}

export interface ScoreState {
  past: HistoryEntry[];
  present: Score;
  cursor: CursorPosition;
  future: HistoryEntry[];
}

const MAX_HISTORY = 200;

export function initialScoreState(score?: Score): ScoreState {
  return {
    past: [],
    present: score ?? createEmptyScore(),
    cursor: { partIndex: 0, measureIndex: 0, noteIndex: 0 },
    future: [],
  };
}

// ─── Reducer ─────────────────────────────────────────────────────────────────

function saveHistory(state: ScoreState): Pick<ScoreState, 'past' | 'future'> {
  const entry: HistoryEntry = { score: cloneScore(state.present), cursor: { ...state.cursor } };
  return { past: [...state.past, entry].slice(-MAX_HISTORY), future: [] };
}

export function scoreReducer(state: ScoreState, action: ScoreAction): ScoreState {
  switch (action.type) {

    case 'UNDO': {
      if (state.past.length === 0) return state;
      const prev = state.past[state.past.length - 1];
      return {
        past: state.past.slice(0, -1),
        present: prev.score,
        cursor: prev.cursor,
        future: [{ score: cloneScore(state.present), cursor: { ...state.cursor } }, ...state.future],
      };
    }

    case 'REDO': {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      return {
        past: [...state.past, { score: cloneScore(state.present), cursor: { ...state.cursor } }],
        present: next.score,
        cursor: next.cursor,
        future: state.future.slice(1),
      };
    }

    case 'MOVE_CURSOR':
      return { ...state, cursor: action.cursor };

    case 'INSERT_NOTE': {
      const { partIndex, measureIndex, noteIndex, note } = action;
      const timeSig = state.present.metadata.timeSig;
      const measure = state.present.parts[partIndex]?.measures[measureIndex];
      if (!measure) return state;

      const maxBeats = beatsPerMeasure(timeSig);
      const noteBeats = durationBeats(note.duration);

      const hist = saveHistory(state);
      const newScore = cloneScore(state.present);
      const newMeasure = newScore.parts[partIndex].measures[measureIndex];

      const existing = newMeasure.notes[noteIndex];
      if (existing && existing.type === 'rest') {
        const existingBeats = itemBeats(existing);
        if (Math.abs(existingBeats - noteBeats) < 0.001) {
          newMeasure.notes[noteIndex] = note;
        } else if (existingBeats > noteBeats) {
          // Split the rest into [note, remaining-rest-fragments].
          const padding = makeRestsForBeats(existingBeats - noteBeats);
          newMeasure.notes.splice(noteIndex, 1, note, ...padding);
        } else {
          // Note longer than rest — refuse for now.
          return state;
        }
      } else if (existing && existing.type === 'note') {
        const usedBeats = newMeasure.notes.reduce((s, n) => s + itemBeats(n), 0);
        if (usedBeats + noteBeats > maxBeats + 0.001) return state;
        newMeasure.notes.splice(noteIndex, 0, note);
      } else {
        // Past end / empty measure — append.
        const usedBeats = newMeasure.notes.reduce((s, n) => s + itemBeats(n), 0);
        if (usedBeats + noteBeats > maxBeats + 0.001) return state;
        newMeasure.notes.push(note);
      }

      // Keep the measure full: pad trailing rests so the model matches what
      // Verovio renders. Arrow navigation now visits every visible item.
      const beatsAfter = newMeasure.notes.reduce((s, n) => s + itemBeats(n), 0);
      if (beatsAfter < maxBeats - 0.001) {
        newMeasure.notes.push(...makeRestsForBeats(maxBeats - beatsAfter));
      }

      let newMeasureIndex = measureIndex;
      let newNoteIndex = noteIndex + 1;
      if (newNoteIndex >= newMeasure.notes.length) {
        newMeasureIndex = measureIndex + 1;
        newNoteIndex = 0;
        if (newMeasureIndex >= newScore.parts[0].measures.length) {
          const newNum = newScore.parts[0].measures.length + 1;
          newScore.parts.forEach(p => p.measures.push(makeMeasure(newNum)));
        }
      }

      return { ...hist, present: newScore, cursor: { partIndex, measureIndex: newMeasureIndex, noteIndex: newNoteIndex } };
    }

    case 'INSERT_NOTE_AT_BEAT': {
      const { partIndex, measureIndex, atBeat, note } = action;
      const timeSig = state.present.metadata.timeSig;
      const measure = state.present.parts[partIndex]?.measures[measureIndex];
      if (!measure) return state;
      const maxBeats = beatsPerMeasure(timeSig);
      const noteBeats = durationBeats(note.duration);
      if (atBeat < -0.001 || atBeat + noteBeats > maxBeats + 0.001) return state;

      const hist = saveHistory(state);
      const newScore = cloneScore(state.present);
      const newMeasure = newScore.parts[partIndex].measures[measureIndex];

      if (newMeasure.notes.length === 0) {
        // Empty bar — build [leading rests, note, trailing rests] from scratch.
        const leading = makeRestsForBeats(Math.max(0, atBeat));
        const trailing = makeRestsForBeats(Math.max(0, maxBeats - atBeat - noteBeats));
        newMeasure.notes = [...leading, note, ...trailing];
      } else {
        // Find the item containing atBeat.
        let containingIdx = -1;
        let containingStart = 0;
        let beat = 0;
        for (let i = 0; i < newMeasure.notes.length; i++) {
          const ib = itemBeats(newMeasure.notes[i]);
          if (atBeat < beat + ib - 0.001) {
            containingIdx = i;
            containingStart = beat;
            break;
          }
          beat += ib;
        }
        if (containingIdx < 0) return state;

        // Walk forward from containingIdx, accumulating beats until we've
        // covered the new note's full span. Items in the way get consumed —
        // notes too, not just rests. The portion BEFORE atBeat inside the
        // first item is preserved as rest; the leftover AFTER the new note
        // becomes trailing rests.
        const beatOffset = atBeat - containingStart;
        let endBeat = containingStart;
        let lastConsumedIdx = containingIdx - 1;
        while (
          lastConsumedIdx + 1 < newMeasure.notes.length &&
          endBeat < atBeat + noteBeats - 0.001
        ) {
          lastConsumedIdx++;
          endBeat += itemBeats(newMeasure.notes[lastConsumedIdx]);
        }
        if (endBeat < atBeat + noteBeats - 0.001) return state; // not enough room in measure

        const trailingBeats = endBeat - (atBeat + noteBeats);
        const leading = beatOffset > 0.001 ? makeRestsForBeats(beatOffset) : [];
        const trailing = trailingBeats > 0.001 ? makeRestsForBeats(trailingBeats) : [];
        newMeasure.notes.splice(
          containingIdx,
          lastConsumedIdx - containingIdx + 1,
          ...leading,
          note,
          ...trailing,
        );
      }

      // Safety net — keep the measure full.
      const used = newMeasure.notes.reduce((s, n) => s + itemBeats(n), 0);
      if (used < maxBeats - 0.001) {
        newMeasure.notes.push(...makeRestsForBeats(maxBeats - used));
      }

      // Cursor → just past the inserted note.
      const noteIdx = newMeasure.notes.findIndex(n => n.id === note.id);
      let newMeasureIndex = measureIndex;
      let newNoteIndex = noteIdx >= 0 ? noteIdx + 1 : newMeasure.notes.length;
      if (newNoteIndex >= newMeasure.notes.length) {
        newMeasureIndex = measureIndex + 1;
        newNoteIndex = 0;
        if (newMeasureIndex >= newScore.parts[0].measures.length) {
          const newNum = newScore.parts[0].measures.length + 1;
          newScore.parts.forEach(p => p.measures.push(makeMeasure(newNum)));
        }
      }
      return { ...hist, present: newScore, cursor: { partIndex, measureIndex: newMeasureIndex, noteIndex: newNoteIndex } };
    }

    case 'INSERT_REST': {
      const { partIndex, measureIndex, noteIndex, rest } = action;
      const timeSig = state.present.metadata.timeSig;
      const measure = state.present.parts[partIndex]?.measures[measureIndex];
      if (!measure) return state;

      const maxBeats = beatsPerMeasure(timeSig);
      const restBeats = durationBeats(rest.duration);

      const hist = saveHistory(state);
      const newScore = cloneScore(state.present);
      const newMeasure = newScore.parts[partIndex].measures[measureIndex];

      const existing = newMeasure.notes[noteIndex];
      if (existing && existing.type === 'rest') {
        const existingBeats = itemBeats(existing);
        if (Math.abs(existingBeats - restBeats) < 0.001) {
          newMeasure.notes[noteIndex] = rest;
        } else if (existingBeats > restBeats) {
          const padding = makeRestsForBeats(existingBeats - restBeats);
          newMeasure.notes.splice(noteIndex, 1, rest, ...padding);
        } else {
          return state;
        }
      } else if (existing && existing.type === 'note') {
        const usedBeats = newMeasure.notes.reduce((s, n) => s + itemBeats(n), 0);
        if (usedBeats + restBeats > maxBeats + 0.001) return state;
        newMeasure.notes.splice(noteIndex, 0, rest);
      } else {
        const usedBeats = newMeasure.notes.reduce((s, n) => s + itemBeats(n), 0);
        if (usedBeats + restBeats > maxBeats + 0.001) return state;
        newMeasure.notes.push(rest);
      }

      const beatsAfter = newMeasure.notes.reduce((s, n) => s + itemBeats(n), 0);
      if (beatsAfter < maxBeats - 0.001) {
        newMeasure.notes.push(...makeRestsForBeats(maxBeats - beatsAfter));
      }

      let newMeasureIndex = measureIndex;
      let newNoteIndex = noteIndex + 1;
      if (newNoteIndex >= newMeasure.notes.length) {
        newMeasureIndex = measureIndex + 1;
        newNoteIndex = 0;
        if (newMeasureIndex >= newScore.parts[0].measures.length) {
          const newNum = newScore.parts[0].measures.length + 1;
          newScore.parts.forEach(p => p.measures.push(makeMeasure(newNum)));
        }
      }

      return { ...hist, present: newScore, cursor: { partIndex, measureIndex: newMeasureIndex, noteIndex: newNoteIndex } };
    }

    case 'REPLACE_AT_INDEX': {
      const { partIndex, measureIndex, noteIndex, item } = action;
      const measure = state.present.parts[partIndex]?.measures[measureIndex];
      if (!measure || noteIndex < 0 || noteIndex >= measure.notes.length) return state;

      // Replacement must have the same effective beat span as what's already
      // there — otherwise the measure would be invalid.
      const existing = measure.notes[noteIndex];
      const existingBeats = itemBeats(existing);
      const newBeats = itemBeats(item);
      if (Math.abs(existingBeats - newBeats) > 0.001) return state;

      const hist = saveHistory(state);
      const newScore = cloneScore(state.present);
      newScore.parts[partIndex].measures[measureIndex].notes[noteIndex] = item;
      // Cursor advances past the replaced item.
      const cursor = { partIndex, measureIndex, noteIndex: noteIndex + 1 };
      return { ...hist, present: newScore, cursor };
    }

    case 'DELETE_NOTES': {
      const { noteIds } = action;
      if (noteIds.length === 0) return state;
      const hist = saveHistory(state);
      const newScore = cloneScore(state.present);
      const idSet = new Set(noteIds);
      const maxBeats = beatsPerMeasure(state.present.metadata.timeSig);

      // Two-phase delete:
      //   1. Selected notes → rest of the same duration.
      //   2. Selected rests → physically removed.
      // After deletion: if the measure is partially full, re-pad it with
      // trailing rests so the model stays measure-complete (arrow nav, etc.).
      // If the measure ends up empty, leave it empty — the converter draws a
      // whole-measure rest, which is what the user expects for "wipe a bar".
      let touched = false;
      for (const part of newScore.parts) {
        for (const measure of part.measures) {
          measure.notes = measure.notes.map((n) => {
            if (idSet.has(n.id) && n.type === 'note') {
              touched = true;
              const replacement: Rest = {
                type: 'rest',
                id: crypto.randomUUID(),
                duration: n.duration,
                // Carry tuplet metadata: a triplet eighth's effective beats
                // is 1/3, not 1/2 — the rest replacing it must report the
                // same so the measure sum stays correct.
                ...(n.tuplet ? { tuplet: { ...n.tuplet } } : {}),
              };
              return replacement;
            }
            return n;
          });
          const beforeLen = measure.notes.length;
          measure.notes = measure.notes.filter((n) => !(idSet.has(n.id) && n.type === 'rest'));
          if (measure.notes.length !== beforeLen) touched = true;

          if (measure.notes.length > 0) {
            const used = measure.notes.reduce((s, n) => s + itemBeats(n), 0);
            if (used < maxBeats - 0.001) {
              measure.notes.push(...makeRestsForBeats(maxBeats - used));
            }
          }
        }
      }
      if (!touched) return state;
      return { ...hist, present: newScore, cursor: state.cursor };
    }

    case 'CONVERT_TO_RESTS': {
      const { noteIds, restBase } = action;
      const newDur: Duration = { base: restBase, dots: 0 };
      const newBeats = durationBeats(newDur);
      if (noteIds.length === 0) return state;
      const hist = saveHistory(state);
      const newScore = cloneScore(state.present);
      const idSet = new Set(noteIds);
      let touched = false;
      for (const part of newScore.parts) {
        for (const measure of part.measures) {
          const out: NoteOrRest[] = [];
          for (const item of measure.notes) {
            if (item.type === 'note' && idSet.has(item.id)) {
              // Tuplet members: tile-conversion would break the tuplet bracket
              // span. Drop to a single rest of the original duration so the
              // tuplet stays intact.
              if (item.tuplet) {
                out.push({
                  type: 'rest',
                  id: crypto.randomUUID(),
                  duration: item.duration,
                  tuplet: { ...item.tuplet },
                });
                touched = true;
                continue;
              }
              const oldBeats = durationBeats(item.duration);
              if (newBeats <= oldBeats + 0.001) {
                // Tile as many new-duration rests as fit, fill any remainder
                // with standard greedy rest sizes (so e.g. converting a
                // dotted-quarter to 16th rests yields 6×16th, not 3×16th + 1
                // misshaped tail).
                const fullCount = Math.floor((oldBeats + 0.001) / newBeats);
                for (let i = 0; i < fullCount; i++) {
                  out.push({ type: 'rest', id: crypto.randomUUID(), duration: { ...newDur } });
                }
                const remainBeats = oldBeats - fullCount * newBeats;
                if (remainBeats > 0.001) {
                  out.push(...makeRestsForBeats(remainBeats));
                }
              } else {
                // Requested rest is LONGER than the note's slot — keep at the
                // note's original duration rather than reshape the measure.
                out.push({ type: 'rest', id: crypto.randomUUID(), duration: item.duration });
              }
              touched = true;
            } else {
              out.push(item);
            }
          }
          measure.notes = out;
        }
      }
      if (!touched) return state;
      return { ...hist, present: newScore, cursor: state.cursor };
    }

    case 'CHANGE_PITCH': {
      const { noteId, midi, alter } = action;
      const hist = saveHistory(state);
      const newScore = cloneScore(state.present);
      for (const part of newScore.parts) {
        for (const measure of part.measures) {
          const n = measure.notes.find(x => x.id === noteId && x.type === 'note');
          if (n && n.type === 'note') n.pitch = { midi, alter };
        }
      }
      return { ...hist, present: newScore, cursor: state.cursor };
    }

    case 'CHANGE_CHORD_PITCH': {
      const { noteId, chordIdx, midi, alter } = action;
      const hist = saveHistory(state);
      const newScore = cloneScore(state.present);
      let touched = false;
      for (const part of newScore.parts) {
        for (const measure of part.measures) {
          const n = measure.notes.find(x => x.id === noteId && x.type === 'note');
          if (n && n.type === 'note' && n.chordNotes && n.chordNotes[chordIdx]) {
            n.chordNotes[chordIdx] = { midi, alter };
            touched = true;
          }
        }
      }
      if (!touched) return state;
      return { ...hist, present: newScore, cursor: state.cursor };
    }

    case 'CHANGE_GRACE_PITCH': {
      const { noteId, graceIdx, midi, alter } = action;
      const hist = saveHistory(state);
      const newScore = cloneScore(state.present);
      let touched = false;
      for (const part of newScore.parts) {
        for (const measure of part.measures) {
          const n = measure.notes.find(x => x.id === noteId && x.type === 'note');
          if (n && n.type === 'note' && n.graceBefore && n.graceBefore[graceIdx]) {
            n.graceBefore[graceIdx].pitch = { midi, alter };
            touched = true;
          }
        }
      }
      if (!touched) return state;
      return { ...hist, present: newScore, cursor: state.cursor };
    }

    case 'REMOVE_CHORD_NOTE': {
      const { noteId, chordIdx } = action;
      const hist = saveHistory(state);
      const newScore = cloneScore(state.present);
      let touched = false;
      for (const part of newScore.parts) {
        for (const measure of part.measures) {
          const n = measure.notes.find(x => x.id === noteId && x.type === 'note');
          if (n && n.type === 'note' && n.chordNotes && n.chordNotes[chordIdx]) {
            n.chordNotes.splice(chordIdx, 1);
            touched = true;
          }
        }
      }
      if (!touched) return state;
      return { ...hist, present: newScore, cursor: state.cursor };
    }

    case 'ADD_TO_CHORD': {
      const { noteId, pitch } = action;
      const hist = saveHistory(state);
      const newScore = cloneScore(state.present);
      let touched = false;
      for (const part of newScore.parts) {
        for (const measure of part.measures) {
          const n = measure.notes.find(x => x.id === noteId && x.type === 'note');
          if (n && n.type === 'note') {
            // Don't add duplicate pitches.
            const exists =
              n.pitch.midi === pitch.midi ||
              (n.chordNotes ?? []).some(p => p.midi === pitch.midi);
            if (!exists) {
              n.chordNotes = [...(n.chordNotes ?? []), pitch];
              touched = true;
            }
          }
        }
      }
      if (!touched) return state;
      return { ...hist, present: newScore, cursor: state.cursor };
    }

    case 'CHANGE_DURATION': {
      const { itemId, duration: newDur } = action;
      const newBeats = durationBeats(newDur);
      const hist = saveHistory(state);
      const newScore = cloneScore(state.present);

      let touched = false;
      outer: for (const part of newScore.parts) {
        for (const measure of part.measures) {
          const idx = measure.notes.findIndex(n => n.id === itemId);
          if (idx < 0) continue;
          const item = measure.notes[idx];
          // Refuse to change duration of a tuplet member — would either change
          // the measure sum (if we keep the tuplet meta) or split the bracket.
          // Tuplet edits go through TOGGLE_TUPLET, which rebuilds the whole
          // span.
          if (item.tuplet) break outer;
          const oldBeats = durationBeats(item.duration);

          if (Math.abs(newBeats - oldBeats) < 0.001) {
            // Same duration — no-op.
            break outer;
          }

          if (newBeats < oldBeats) {
            // Shrink: keep the item with the new duration, pad the diff
            // with trailing rests so the measure stays full.
            const shrunk: Note | Rest = item.type === 'note'
              ? { ...item, duration: { ...newDur } }
              : { ...item, duration: { ...newDur } };
            const padding = makeRestsForBeats(oldBeats - newBeats);
            measure.notes.splice(idx, 1, shrunk, ...padding);
            touched = true;
            break outer;
          }

          // Expand: consume trailing rest space.
          let needed = newBeats - oldBeats;
          let j = idx + 1;
          while (needed > 0.001 && j < measure.notes.length) {
            const nxt = measure.notes[j];
            if (nxt.type !== 'rest') break; // can't eat notes
            const nxtBeats = durationBeats(nxt.duration);
            if (nxtBeats <= needed + 0.001) {
              measure.notes.splice(j, 1);
              needed -= nxtBeats;
            } else {
              // Partially split this rest: leave (nxtBeats - needed) trailing.
              const leftover = makeRestsForBeats(nxtBeats - needed);
              measure.notes.splice(j, 1, ...leftover);
              needed = 0;
              break;
            }
          }
          if (needed > 0.001) break outer; // not enough room — leave unchanged
          const expanded: Note | Rest = item.type === 'note'
            ? { ...item, duration: { ...newDur } }
            : { ...item, duration: { ...newDur } };
          measure.notes[idx] = expanded;
          touched = true;
          break outer;
        }
      }
      if (!touched) return state;
      return { ...hist, present: newScore, cursor: state.cursor };
    }

    case 'TOGGLE_ARTICULATION': {
      const { noteId, articulation } = action;
      const hist = saveHistory(state);
      const newScore = cloneScore(state.present);
      let touched = false;
      for (const part of newScore.parts) {
        for (const measure of part.measures) {
          const n = measure.notes.find(x => x.id === noteId && x.type === 'note');
          if (n && n.type === 'note') {
            const arts = n.articulations ?? [];
            if (arts.includes(articulation)) {
              n.articulations = arts.filter(a => a !== articulation);
              if (n.articulations.length === 0) delete n.articulations;
            } else {
              n.articulations = [...arts, articulation];
            }
            touched = true;
          }
        }
      }
      if (!touched) return state;
      return { ...hist, present: newScore, cursor: state.cursor };
    }

    case 'TOGGLE_TIE': {
      const hist = saveHistory(state);
      const newScore = cloneScore(state.present);
      let touched = false;
      for (const part of newScore.parts) {
        for (const measure of part.measures) {
          const n = measure.notes.find(x => x.id === action.noteId && x.type === 'note');
          if (n && n.type === 'note') {
            if (n.tieStart) delete n.tieStart;
            else n.tieStart = true;
            touched = true;
          }
        }
      }
      if (!touched) return state;
      return { ...hist, present: newScore, cursor: state.cursor };
    }

    case 'SET_ACCIDENTAL_DISPLAY': {
      const hist = saveHistory(state);
      const newScore = cloneScore(state.present);
      let touched = false;
      for (const part of newScore.parts) {
        for (const measure of part.measures) {
          const n = measure.notes.find(x => x.id === action.noteId && x.type === 'note');
          if (n && n.type === 'note') {
            if (action.value === null || n.accidentalDisplay === action.value) {
              delete n.accidentalDisplay;
            } else {
              n.accidentalDisplay = action.value;
            }
            touched = true;
          }
        }
      }
      if (!touched) return state;
      return { ...hist, present: newScore, cursor: state.cursor };
    }

    case 'TOGGLE_CUE_SIZE': {
      const hist = saveHistory(state);
      const newScore = cloneScore(state.present);
      let touched = false;
      for (const part of newScore.parts) {
        for (const measure of part.measures) {
          const n = measure.notes.find(x => x.id === action.noteId && x.type === 'note');
          if (n && n.type === 'note') {
            if (n.cueSize) delete n.cueSize;
            else n.cueSize = true;
            touched = true;
          }
        }
      }
      if (!touched) return state;
      return { ...hist, present: newScore, cursor: state.cursor };
    }

    case 'SET_BEKAR_MARK': {
      const hist = saveHistory(state);
      const newScore = cloneScore(state.present);
      let touched = false;
      for (const part of newScore.parts) {
        for (const measure of part.measures) {
          const n = measure.notes.find(x => x.id === action.noteId && x.type === 'note');
          if (n && n.type === 'note') {
            if (action.value) n.bekarMark = true;
            else if (n.bekarMark) delete n.bekarMark;
            touched = true;
          }
        }
      }
      if (!touched) return state;
      return { ...hist, present: newScore, cursor: state.cursor };
    }

    case 'TOGGLE_BRACKET_ACCIDENTAL': {
      const hist = saveHistory(state);
      const newScore = cloneScore(state.present);
      let touched = false;
      for (const part of newScore.parts) {
        for (const measure of part.measures) {
          const n = measure.notes.find(x => x.id === action.noteId && x.type === 'note');
          if (n && n.type === 'note') {
            if (n.bracketAccidental) delete n.bracketAccidental;
            else n.bracketAccidental = true;
            touched = true;
          }
        }
      }
      if (!touched) return state;
      return { ...hist, present: newScore, cursor: state.cursor };
    }

    case 'TOGGLE_GRACE': {
      const hist = saveHistory(state);
      const newScore = cloneScore(state.present);
      let touched = false;
      for (const part of newScore.parts) {
        for (const measure of part.measures) {
          const n = measure.notes.find(x => x.id === action.noteId && x.type === 'note');
          if (n && n.type === 'note') {
            const sameKind = n.graceBefore?.find(g => g.kind === action.kind);
            if (sameKind && (n.graceBefore?.length ?? 0) === 1) {
              // Only grace is this same kind — toggle off.
              delete n.graceBefore;
            } else if (n.graceBefore && n.graceBefore.length > 0) {
              // Replace the existing single grace with the new kind, keeping
              // pitch. This swaps acciaccatura ↔ appoggiatura without
              // accumulating multiple graces.
              const keep = n.graceBefore[0];
              n.graceBefore = [{ ...keep, kind: action.kind }];
            } else {
              // No grace yet — add a fresh one above the main pitch.
              const newPitch: Pitch = { midi: n.pitch.midi + 2, alter: 0 };
              n.graceBefore = [
                { id: crypto.randomUUID(), pitch: newPitch, kind: action.kind },
              ];
            }
            touched = true;
          }
        }
      }
      if (!touched) return state;
      return { ...hist, present: newScore, cursor: state.cursor };
    }

    case 'SET_GRACE_KIND': {
      const hist = saveHistory(state);
      const newScore = cloneScore(state.present);
      let touched = false;
      for (const part of newScore.parts) {
        for (const measure of part.measures) {
          const n = measure.notes.find(x => x.id === action.parentId && x.type === 'note');
          if (n && n.type === 'note' && n.graceBefore && n.graceBefore[action.graceIdx]) {
            n.graceBefore[action.graceIdx].kind = action.kind;
            touched = true;
          }
        }
      }
      if (!touched) return state;
      return { ...hist, present: newScore, cursor: state.cursor };
    }

    case 'SET_NOTEHEAD': {
      const hist = saveHistory(state);
      const newScore = cloneScore(state.present);
      let touched = false;
      for (const part of newScore.parts) {
        for (const measure of part.measures) {
          const n = measure.notes.find(x => x.id === action.noteId && x.type === 'note');
          if (n && n.type === 'note') {
            if (action.shape === null || n.notehead === action.shape) {
              delete n.notehead;
            } else {
              n.notehead = action.shape;
            }
            touched = true;
          }
        }
      }
      if (!touched) return state;
      return { ...hist, present: newScore, cursor: state.cursor };
    }

    case 'CONVERT_TO_GRACE': {
      const { noteId, kind } = action;
      const hist = saveHistory(state);
      const newScore = cloneScore(state.present);
      let touched = false;
      outer: for (const part of newScore.parts) {
        for (let mIdx = 0; mIdx < part.measures.length; mIdx++) {
          const measure = part.measures[mIdx];
          const idx = measure.notes.findIndex(n => n.id === noteId && n.type === 'note');
          if (idx < 0) continue;
          const sourceNote = measure.notes[idx] as Note;

          // Find the NEXT note to attach the grace to (skipping rests, can
          // cross measure boundaries within the same part).
          let targetNote: Note | null = null;
          for (let j = idx + 1; j < measure.notes.length; j++) {
            if (measure.notes[j].type === 'note') {
              targetNote = measure.notes[j] as Note;
              break;
            }
          }
          if (!targetNote) {
            for (let m = mIdx + 1; m < part.measures.length && !targetNote; m++) {
              for (const n of part.measures[m].notes) {
                if (n.type === 'note') { targetNote = n as Note; break; }
              }
            }
          }
          if (!targetNote) break outer; // no next note in this part

          // Move the source note's pitch (and chord-notes if any) into the
          // target's graceBefore array, then replace source with a rest.
          targetNote.graceBefore = [
            ...(targetNote.graceBefore ?? []),
            { id: crypto.randomUUID(), pitch: { ...sourceNote.pitch }, kind },
          ];
          measure.notes[idx] = {
            type: 'rest',
            id: crypto.randomUUID(),
            duration: sourceNote.duration,
          };
          touched = true;
          break outer;
        }
      }
      if (!touched) return state;
      return { ...hist, present: newScore, cursor: state.cursor };
    }

    case 'TOGGLE_PRE_BEND': {
      const hist = saveHistory(state);
      const newScore = cloneScore(state.present);
      let touched = false;
      for (const part of newScore.parts) {
        for (const measure of part.measures) {
          const n = measure.notes.find(x => x.id === action.noteId && x.type === 'note');
          if (n && n.type === 'note') {
            if (n.preBend) delete n.preBend;
            else n.preBend = true;
            touched = true;
          }
        }
      }
      if (!touched) return state;
      return { ...hist, present: newScore, cursor: state.cursor };
    }

    case 'TOGGLE_HAIRPIN': {
      const hist = saveHistory(state);
      const newScore = cloneScore(state.present);
      let touched = false;
      for (const part of newScore.parts) {
        for (const measure of part.measures) {
          for (const n of measure.notes) {
            if (n.type !== 'note') continue;
            if (n.id === action.startId) {
              // Toggle: same kind already set → clear; else set.
              if (n.hairpinStart === action.kind) {
                delete n.hairpinStart;
              } else {
                n.hairpinStart = action.kind;
              }
              touched = true;
            }
            if (action.endId && n.id === action.endId) {
              if (n.hairpinEnd) delete n.hairpinEnd;
              else n.hairpinEnd = true;
              touched = true;
            }
          }
        }
      }
      if (!touched) return state;
      return { ...hist, present: newScore, cursor: state.cursor };
    }

    case 'TOGGLE_OCTAVE_SHIFT': {
      const hist = saveHistory(state);
      const newScore = cloneScore(state.present);
      let touched = false;
      for (const part of newScore.parts) {
        for (const measure of part.measures) {
          for (const n of measure.notes) {
            if (n.type !== 'note') continue;
            if (n.id === action.startId) {
              if (n.octaveShiftStart === action.shift) {
                delete n.octaveShiftStart;
              } else {
                n.octaveShiftStart = action.shift;
              }
              touched = true;
            }
            if (action.endId && n.id === action.endId) {
              if (n.octaveShiftEnd) delete n.octaveShiftEnd;
              else n.octaveShiftEnd = true;
              touched = true;
            }
          }
        }
      }
      if (!touched) return state;
      return { ...hist, present: newScore, cursor: state.cursor };
    }

    case 'TOGGLE_PEDAL': {
      const hist = saveHistory(state);
      const newScore = cloneScore(state.present);
      let touched = false;
      for (const part of newScore.parts) {
        for (const measure of part.measures) {
          for (const n of measure.notes) {
            if (n.type !== 'note') continue;
            if (n.id === action.startId) {
              if (n.pedalStart) delete n.pedalStart;
              else n.pedalStart = true;
              touched = true;
            }
            if (action.endId && n.id === action.endId) {
              if (n.pedalEnd) delete n.pedalEnd;
              else n.pedalEnd = true;
              touched = true;
            }
          }
        }
      }
      if (!touched) return state;
      return { ...hist, present: newScore, cursor: state.cursor };
    }

    case 'SET_CLEF_CHANGE': {
      const hist = saveHistory(state);
      const newScore = cloneScore(state.present);
      let touched = false;
      for (const part of newScore.parts) {
        for (const measure of part.measures) {
          const n = measure.notes.find(x => x.id === action.noteId && x.type === 'note');
          if (n && n.type === 'note') {
            if (action.clef === null || n.clefChange === action.clef) {
              delete n.clefChange;
            } else {
              n.clefChange = action.clef;
            }
            touched = true;
          }
        }
      }
      if (!touched) return state;
      return { ...hist, present: newScore, cursor: state.cursor };
    }

    case 'SET_TIME_SIG_CHANGE': {
      const hist = saveHistory(state);
      const newScore = cloneScore(state.present);
      let touched = false;
      for (const part of newScore.parts) {
        for (const measure of part.measures) {
          const n = measure.notes.find(x => x.id === action.noteId && x.type === 'note');
          if (n && n.type === 'note') {
            if (action.num === null) {
              delete n.timeSigChange;
            } else {
              const existing = n.timeSigChange;
              const den = action.den ?? 4;
              if (existing && existing.num === action.num && existing.den === den) {
                delete n.timeSigChange;
              } else {
                n.timeSigChange = { num: action.num, den };
              }
            }
            touched = true;
          }
        }
      }
      if (!touched) return state;
      return { ...hist, present: newScore, cursor: state.cursor };
    }

    case 'TOGGLE_SLUR': {
      const hist = saveHistory(state);
      const newScore = cloneScore(state.present);
      let touched = false;
      for (const part of newScore.parts) {
        for (const measure of part.measures) {
          for (const n of measure.notes) {
            if (n.type !== 'note') continue;
            if (n.id === action.startId) {
              if (n.slurStart) delete n.slurStart;
              else n.slurStart = true;
              touched = true;
            }
            if (action.endId && n.id === action.endId) {
              if (n.slurEnd) delete n.slurEnd;
              else n.slurEnd = true;
              touched = true;
            }
          }
        }
      }
      if (!touched) return state;
      return { ...hist, present: newScore, cursor: state.cursor };
    }

    case 'TOGGLE_SLIDE': {
      const hist = saveHistory(state);
      const newScore = cloneScore(state.present);
      let touched = false;
      for (const part of newScore.parts) {
        for (const measure of part.measures) {
          for (const n of measure.notes) {
            if (n.type !== 'note') continue;
            if (n.id === action.startId) {
              if (n.slideStart) delete n.slideStart;
              else n.slideStart = true;
              touched = true;
            }
            if (n.id === action.endId) {
              if (n.slideEnd) delete n.slideEnd;
              else n.slideEnd = true;
              touched = true;
            }
          }
        }
      }
      if (!touched) return state;
      return { ...hist, present: newScore, cursor: state.cursor };
    }

    case 'TOGGLE_ORNAMENT': {
      const hist = saveHistory(state);
      const newScore = cloneScore(state.present);
      let touched = false;
      for (const part of newScore.parts) {
        for (const measure of part.measures) {
          const n = measure.notes.find(x => x.id === action.noteId && x.type === 'note');
          if (n && n.type === 'note') {
            const orns = n.ornaments ?? [];
            if (orns.includes(action.ornament)) {
              n.ornaments = orns.filter(o => o !== action.ornament);
              if (n.ornaments.length === 0) delete n.ornaments;
            } else {
              n.ornaments = [...orns, action.ornament];
            }
            touched = true;
          }
        }
      }
      if (!touched) return state;
      return { ...hist, present: newScore, cursor: state.cursor };
    }

    case 'SET_DYNAMICS': {
      const hist = saveHistory(state);
      const newScore = cloneScore(state.present);
      let touched = false;
      for (const part of newScore.parts) {
        for (const measure of part.measures) {
          const n = measure.notes.find(x => x.id === action.noteId && x.type === 'note');
          if (n && n.type === 'note') {
            // Toggle: if same value already set, clear; else set.
            if (action.dynamics === null || n.dynamics === action.dynamics) {
              delete n.dynamics;
            } else {
              n.dynamics = action.dynamics;
            }
            touched = true;
          }
        }
      }
      if (!touched) return state;
      return { ...hist, present: newScore, cursor: state.cursor };
    }

    case 'SET_STEM_DIR': {
      const hist = saveHistory(state);
      const newScore = cloneScore(state.present);
      let touched = false;
      for (const part of newScore.parts) {
        for (const measure of part.measures) {
          const n = measure.notes.find(x => x.id === action.noteId && x.type === 'note');
          if (n && n.type === 'note') {
            if (action.dir === 'auto') delete n.stemDir;
            else n.stemDir = action.dir;
            touched = true;
          }
        }
      }
      if (!touched) return state;
      return { ...hist, present: newScore, cursor: state.cursor };
    }

    case 'SET_TREMOLO': {
      const hist = saveHistory(state);
      const newScore = cloneScore(state.present);
      let touched = false;
      for (const part of newScore.parts) {
        for (const measure of part.measures) {
          const n = measure.notes.find(x => x.id === action.noteId && x.type === 'note');
          if (n && n.type === 'note') {
            // Toggle off if same count already set.
            if (action.count === 0 || n.tremolo === action.count) {
              delete n.tremolo;
            } else {
              n.tremolo = action.count;
            }
            touched = true;
          }
        }
      }
      if (!touched) return state;
      return { ...hist, present: newScore, cursor: state.cursor };
    }

    case 'TOGGLE_WORDS': {
      const hist = saveHistory(state);
      const newScore = cloneScore(state.present);
      let touched = false;
      for (const part of newScore.parts) {
        for (const measure of part.measures) {
          const n = measure.notes.find(x => x.id === action.noteId && x.type === 'note');
          if (n && n.type === 'note') {
            const ws = n.words ?? [];
            if (ws.includes(action.text)) {
              n.words = ws.filter(w => w !== action.text);
              if (n.words.length === 0) delete n.words;
            } else {
              n.words = [...ws, action.text];
            }
            touched = true;
          }
        }
      }
      if (!touched) return state;
      return { ...hist, present: newScore, cursor: state.cursor };
    }

    case 'TOGGLE_TUPLET': {
      // Two modes, decided by whether the clicked item is ALREADY in a tuplet:
      //   • Not in a tuplet → split the single item into `num` sub-items of a
      //     smaller duration, each tagged with `{num, den, position}` so the
      //     converter emits <time-modification> + <notations><tuplet>. The
      //     sub-items collectively occupy the same effective beat span as
      //     the source (1 × source = num × (source/2^shift) × (den/num)).
      //   • Already in a tuplet → collapse the whole bracket span back to a
      //     single non-tuplet item of the equivalent nominal duration. The
      //     replacement loses pitch/articulations of all but the first member.
      const { itemId, num } = action;
      const hist = saveHistory(state);
      const newScore = cloneScore(state.present);
      let touched = false;
      const cfg = defaultTupletConfig(num);

      outer: for (const part of newScore.parts) {
        for (const measure of part.measures) {
          const idx = measure.notes.findIndex(n => n.id === itemId);
          if (idx < 0) continue;
          const source = measure.notes[idx];

          if (source.tuplet) {
            // COLLAPSE — find the bracket bounds (start..end) around `idx`.
            let s = idx;
            while (s > 0 && measure.notes[s].tuplet && measure.notes[s].tuplet!.position !== 'start' && measure.notes[s].tuplet!.position !== 'single') {
              s--;
            }
            let e = idx;
            while (e < measure.notes.length - 1 && measure.notes[e].tuplet && measure.notes[e].tuplet!.position !== 'end' && measure.notes[e].tuplet!.position !== 'single') {
              e++;
            }
            const spanBeats = measure.notes.slice(s, e + 1).reduce((acc, it) => acc + itemBeats(it), 0);
            // Pick the first member as the replacement template (keeps its
            // pitch / articulations if it was a Note).
            const head = measure.notes[s];
            // Replace span with greedy rests covering spanBeats, then if head
            // was a note, promote the first rest back to that note's pitch &
            // longest-fitting base. Simpler: tile rests, drop tuplet entirely.
            const replacement: NoteOrRest[] = makeRestsForBeats(spanBeats);
            if (head.type === 'note' && replacement.length > 0) {
              const firstRest = replacement[0];
              const promoted: Note = {
                type: 'note',
                id: head.id,
                pitch: { ...head.pitch },
                chordNotes: head.chordNotes ? head.chordNotes.map(p => ({ ...p })) : undefined,
                duration: firstRest.duration,
              };
              replacement[0] = promoted;
            }
            measure.notes.splice(s, e - s + 1, ...replacement);
            touched = true;
            break outer;
          }

          // WRAP — split source into N sub-items.
          const newBase = shiftDurationDown(source.duration.base, cfg.shiftDown);
          const newDuration: Duration = { base: newBase, dots: 0 };
          const sub: NoteOrRest[] = [];
          for (let i = 0; i < num; i++) {
            const position: TupletInfo['position'] =
              num === 1 ? 'single' : i === 0 ? 'start' : i === num - 1 ? 'end' : 'middle';
            if (source.type === 'note') {
              const member: Note = {
                type: 'note',
                id: i === 0 ? source.id : crypto.randomUUID(),
                pitch: { ...source.pitch },
                chordNotes: i === 0 && source.chordNotes ? source.chordNotes.map(p => ({ ...p })) : undefined,
                duration: { ...newDuration },
                tuplet: { num, den: cfg.den, position },
              };
              sub.push(member);
            } else {
              sub.push({
                type: 'rest',
                id: i === 0 ? source.id : crypto.randomUUID(),
                duration: { ...newDuration },
                tuplet: { num, den: cfg.den, position },
              });
            }
          }
          measure.notes.splice(idx, 1, ...sub);
          touched = true;
          break outer;
        }
      }
      if (!touched) return state;
      return { ...hist, present: newScore, cursor: state.cursor };
    }

    case 'SET_BARLINE': {
      const { measureIndex, side, style } = action;
      const hist = saveHistory(state);
      const newScore = cloneScore(state.present);
      let touched = false;
      for (const part of newScore.parts) {
        const m = part.measures[measureIndex];
        if (!m) continue;
        if (side === 'right') {
          if (style === null || style === 'repeat-start') {
            if (m.barlineRight) { delete m.barlineRight; touched = true; }
          } else {
            if (m.barlineRight !== style) {
              m.barlineRight = style;
              touched = true;
            } else {
              // Toggle off — same style clicked twice clears it.
              delete m.barlineRight;
              touched = true;
            }
          }
        } else {
          if (style === null || style !== 'repeat-start') {
            if (m.barlineLeft) { delete m.barlineLeft; touched = true; }
          } else {
            if (m.barlineLeft) {
              delete m.barlineLeft;
              touched = true;
            } else {
              m.barlineLeft = 'repeat-start';
              touched = true;
            }
          }
        }
      }
      if (!touched) return state;
      return { ...hist, present: newScore, cursor: state.cursor };
    }

    case 'ADD_MEASURE': {
      const hist = saveHistory(state);
      const newScore = cloneScore(state.present);
      const newNum = newScore.parts[0].measures.length + 1;
      newScore.parts.forEach(p => p.measures.push(makeMeasure(newNum)));
      return { ...hist, present: newScore, cursor: state.cursor };
    }

    case 'LOAD_SCORE': {
      const hist = saveHistory(state);
      return {
        ...hist,
        present: cloneScore(action.score),
        cursor: { partIndex: 0, measureIndex: 0, noteIndex: 0 },
      };
    }

    case 'SET_TEMPO': {
      const newScore = cloneScore(state.present);
      newScore.metadata.tempo = action.tempo;
      return { ...state, present: newScore };
    }

    case 'SET_TITLE': {
      const newScore = cloneScore(state.present);
      newScore.metadata.title = action.title;
      return { ...state, present: newScore };
    }

    case 'SET_COMPOSER': {
      const newScore = cloneScore(state.present);
      newScore.metadata.composer = action.composer;
      return { ...state, present: newScore };
    }

    case 'SET_KEY_SIG': {
      const newScore = cloneScore(state.present);
      newScore.metadata.keySig = action.keySig;
      return { ...state, present: newScore };
    }

    case 'SET_TIME_SIG': {
      const newScore = cloneScore(state.present);
      newScore.metadata.timeSig = { num: action.num, den: action.den };
      return { ...state, present: newScore };
    }

    default:
      return state;
  }
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useScore(initialScore?: Score) {
  const [state, dispatch] = useReducer(scoreReducer, undefined, () =>
    initialScoreState(initialScore),
  );

  const insertNote = useCallback(
    (note: Note) => dispatch({ type: 'INSERT_NOTE', partIndex: state.cursor.partIndex, measureIndex: state.cursor.measureIndex, noteIndex: state.cursor.noteIndex, note }),
    [state.cursor],
  );

  const insertRest = useCallback(
    (rest: Rest) => dispatch({ type: 'INSERT_REST', partIndex: state.cursor.partIndex, measureIndex: state.cursor.measureIndex, noteIndex: state.cursor.noteIndex, rest }),
    [state.cursor],
  );

  const replaceAtIndex = useCallback(
    (partIndex: number, measureIndex: number, noteIndex: number, item: Note | Rest) =>
      dispatch({ type: 'REPLACE_AT_INDEX', partIndex, measureIndex, noteIndex, item }),
    [],
  );
  // Position-explicit insert helpers — do NOT depend on cursor. Use these when
  // you issue several inserts in a row within a single event handler: the
  // cursor-based insertNote/insertRest close over the cursor at render time,
  // so all calls in the same handler would target the same noteIndex.
  const insertNoteAt = useCallback(
    (partIndex: number, measureIndex: number, noteIndex: number, note: Note) =>
      dispatch({ type: 'INSERT_NOTE', partIndex, measureIndex, noteIndex, note }),
    [],
  );
  const insertNoteAtBeat = useCallback(
    (partIndex: number, measureIndex: number, atBeat: number, note: Note) =>
      dispatch({ type: 'INSERT_NOTE_AT_BEAT', partIndex, measureIndex, atBeat, note }),
    [],
  );
  const insertRestAt = useCallback(
    (partIndex: number, measureIndex: number, noteIndex: number, rest: Rest) =>
      dispatch({ type: 'INSERT_REST', partIndex, measureIndex, noteIndex, rest }),
    [],
  );
  const deleteNotes = useCallback((ids: string[]) => dispatch({ type: 'DELETE_NOTES', noteIds: ids }), []);
  const convertToRests = useCallback(
    (ids: string[], restBase: DurationBase) =>
      dispatch({ type: 'CONVERT_TO_RESTS', noteIds: ids, restBase }),
    [],
  );
  const setBarline = useCallback(
    (measureIndex: number, side: 'left' | 'right', style: 'double' | 'final' | 'repeat-start' | 'repeat-end' | null) =>
      dispatch({ type: 'SET_BARLINE', measureIndex, side, style }),
    [],
  );
  const changePitch = useCallback((noteId: string, midi: number, alter: Alter) => dispatch({ type: 'CHANGE_PITCH', noteId, midi, alter }), []);
  const changeChordPitch = useCallback((noteId: string, chordIdx: number, midi: number, alter: Alter) =>
    dispatch({ type: 'CHANGE_CHORD_PITCH', noteId, chordIdx, midi, alter }), []);
  const changeGracePitch = useCallback(
    (noteId: string, graceIdx: number, midi: number, alter: Alter) =>
      dispatch({ type: 'CHANGE_GRACE_PITCH', noteId, graceIdx, midi, alter }),
    [],
  );
  const setAccidentalDisplay = useCallback(
    (noteId: string, value: AccidentalDisplay | null) =>
      dispatch({ type: 'SET_ACCIDENTAL_DISPLAY', noteId, value }),
    [],
  );
  const toggleBracketAccidental = useCallback(
    (noteId: string) => dispatch({ type: 'TOGGLE_BRACKET_ACCIDENTAL', noteId }),
    [],
  );
  const toggleCueSize = useCallback(
    (noteId: string) => dispatch({ type: 'TOGGLE_CUE_SIZE', noteId }),
    [],
  );
  const setBekarMark = useCallback(
    (noteId: string, value: boolean) => dispatch({ type: 'SET_BEKAR_MARK', noteId, value }),
    [],
  );
  const toggleGrace = useCallback(
    (noteId: string, kind: 'acciaccatura' | 'appoggiatura') =>
      dispatch({ type: 'TOGGLE_GRACE', noteId, kind }),
    [],
  );
  const setGraceKind = useCallback(
    (parentId: string, graceIdx: number, kind: 'acciaccatura' | 'appoggiatura') =>
      dispatch({ type: 'SET_GRACE_KIND', parentId, graceIdx, kind }),
    [],
  );
  const setNotehead = useCallback(
    (noteId: string, shape: 'normal' | 'slashed' | 'slash' | 'x' | 'diamond' | 'triangle' | 'square' | 'cluster' | null) =>
      dispatch({ type: 'SET_NOTEHEAD', noteId, shape }),
    [],
  );
  const togglePreBend = useCallback(
    (noteId: string) => dispatch({ type: 'TOGGLE_PRE_BEND', noteId }),
    [],
  );
  const convertToGrace = useCallback(
    (noteId: string, kind: 'acciaccatura' | 'appoggiatura') =>
      dispatch({ type: 'CONVERT_TO_GRACE', noteId, kind }),
    [],
  );
  const removeChordNote = useCallback((noteId: string, chordIdx: number) =>
    dispatch({ type: 'REMOVE_CHORD_NOTE', noteId, chordIdx }), []);
  const addToChord  = useCallback((noteId: string, pitch: Pitch) => dispatch({ type: 'ADD_TO_CHORD', noteId, pitch }), []);
  const toggleArticulation = useCallback(
    (noteId: string, articulation: string) => dispatch({ type: 'TOGGLE_ARTICULATION', noteId, articulation }),
    [],
  );
  const toggleTie = useCallback(
    (noteId: string) => dispatch({ type: 'TOGGLE_TIE', noteId }),
    [],
  );
  const toggleSlur = useCallback(
    (startId: string, endId?: string) => dispatch({ type: 'TOGGLE_SLUR', startId, endId }),
    [],
  );
  const toggleHairpin = useCallback(
    (startId: string, kind: 'crescendo' | 'diminuendo', endId?: string) =>
      dispatch({ type: 'TOGGLE_HAIRPIN', startId, endId, kind }),
    [],
  );
  const toggleOctaveShift = useCallback(
    (startId: string, shift: '8va-up' | '8va-down' | '15ma-up' | '15ma-down', endId?: string) =>
      dispatch({ type: 'TOGGLE_OCTAVE_SHIFT', startId, endId, shift }),
    [],
  );
  const togglePedal = useCallback(
    (startId: string, endId?: string) => dispatch({ type: 'TOGGLE_PEDAL', startId, endId }),
    [],
  );
  const setClefChange = useCallback(
    (noteId: string, clef: 'treble' | 'bass' | 'alto' | null) =>
      dispatch({ type: 'SET_CLEF_CHANGE', noteId, clef }),
    [],
  );
  const setTimeSigChange = useCallback(
    (noteId: string, num: number | null, den?: number) =>
      dispatch({ type: 'SET_TIME_SIG_CHANGE', noteId, num, den }),
    [],
  );
  const toggleTuplet = useCallback(
    (itemId: string, num: 3 | 4 | 5 | 6 | 7 | 9) =>
      dispatch({ type: 'TOGGLE_TUPLET', itemId, num }),
    [],
  );
  const toggleSlide = useCallback(
    (startId: string, endId: string) => dispatch({ type: 'TOGGLE_SLIDE', startId, endId }),
    [],
  );
  const toggleOrnament = useCallback(
    (noteId: string, ornament: string) => dispatch({ type: 'TOGGLE_ORNAMENT', noteId, ornament }),
    [],
  );
  const setDynamics = useCallback(
    (noteId: string, dynamics: string | null) => dispatch({ type: 'SET_DYNAMICS', noteId, dynamics }),
    [],
  );
  const setStemDir = useCallback(
    (noteId: string, dir: 'up' | 'down' | 'auto') => dispatch({ type: 'SET_STEM_DIR', noteId, dir }),
    [],
  );
  const setTremolo = useCallback(
    (noteId: string, count: number) => dispatch({ type: 'SET_TREMOLO', noteId, count }),
    [],
  );
  const toggleWords = useCallback(
    (noteId: string, text: string) => dispatch({ type: 'TOGGLE_WORDS', noteId, text }),
    [],
  );
  const changeDuration = useCallback(
    (itemId: string, duration: Duration) => dispatch({ type: 'CHANGE_DURATION', itemId, duration }),
    [],
  );
  const moveCursor  = useCallback((cursor: CursorPosition) => dispatch({ type: 'MOVE_CURSOR', cursor }), []);
  const undo        = useCallback(() => dispatch({ type: 'UNDO' }), []);
  const redo        = useCallback(() => dispatch({ type: 'REDO' }), []);
  const addMeasure  = useCallback(() => dispatch({ type: 'ADD_MEASURE' }), []);
  const loadScore   = useCallback((score: Score) => dispatch({ type: 'LOAD_SCORE', score }), []);
  const setKeySig   = useCallback((keySig: number) => dispatch({ type: 'SET_KEY_SIG', keySig }), []);
  const setTimeSig  = useCallback((num: number, den: number) => dispatch({ type: 'SET_TIME_SIG', num, den }), []);
  const setTitle    = useCallback((title: string) => dispatch({ type: 'SET_TITLE', title }), []);
  const setComposer = useCallback((composer: string) => dispatch({ type: 'SET_COMPOSER', composer }), []);
  const setTempo    = useCallback((tempo: number) => dispatch({ type: 'SET_TEMPO', tempo }), []);

  return {
    score: state.present,
    cursor: state.cursor,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    dispatch,
    insertNote,
    insertRest,
    insertNoteAt,
    insertNoteAtBeat,
    insertRestAt,
    replaceAtIndex,
    deleteNotes,
    convertToRests,
    setBarline,
    changePitch,
    changeChordPitch,
    changeGracePitch,
    setAccidentalDisplay,
    toggleBracketAccidental,
    toggleCueSize,
    setBekarMark,
    toggleGrace,
    setGraceKind,
    setNotehead,
    togglePreBend,
    convertToGrace,
    removeChordNote,
    addToChord,
    toggleArticulation,
    toggleTie,
    toggleSlur,
    toggleSlide,
    toggleHairpin,
    toggleOctaveShift,
    togglePedal,
    setClefChange,
    setTimeSigChange,
    toggleTuplet,
    toggleOrnament,
    setDynamics,
    setStemDir,
    setTremolo,
    toggleWords,
    changeDuration,
    moveCursor,
    undo,
    redo,
    addMeasure,
    loadScore,
    setKeySig,
    setTimeSig,
    setTitle,
    setComposer,
    setTempo,
  };
}
