import { useReducer, useCallback } from 'react';
import {
  Score, Note, Rest, CursorPosition,
  cloneScore, makeMeasure, getMeasureBeats, beatsPerMeasure, durationBeats,
} from './music-model';

// ─── Actions ─────────────────────────────────────────────────────────────────

export type ScoreAction =
  | { type: 'INSERT_NOTE';   partIndex: number; measureIndex: number; noteIndex: number; note: Note }
  | { type: 'INSERT_REST';   partIndex: number; measureIndex: number; noteIndex: number; rest: Rest }
  | { type: 'DELETE_NOTES';  noteIds: string[] }
  | { type: 'CHANGE_PITCH';  noteId: string; midi: number; alter: -1|0|1 }
  | { type: 'ADD_MEASURE' }
  | { type: 'LOAD_SCORE';    score: Score }
  | { type: 'MOVE_CURSOR';   cursor: CursorPosition }
  | { type: 'SET_TEMPO';     tempo: number }
  | { type: 'SET_TITLE';     title: string }
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

export function initialScoreState(score: Score): ScoreState {
  return {
    past: [],
    present: score,
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
      const currentBeats = getMeasureBeats(measure);
      const noteBeats = durationBeats(note.duration);
      if (currentBeats + noteBeats > maxBeats + 0.001) return state;

      const hist = saveHistory(state);
      const newScore = cloneScore(state.present);
      newScore.parts[partIndex].measures[measureIndex].notes.splice(noteIndex, 0, note);

      const updatedBeats = getMeasureBeats(newScore.parts[partIndex].measures[measureIndex]);
      let newMeasureIndex = measureIndex;
      let newNoteIndex = noteIndex + 1;

      if (Math.abs(updatedBeats - maxBeats) < 0.001) {
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
      const currentBeats = getMeasureBeats(measure);
      const restBeats = durationBeats(rest.duration);
      if (currentBeats + restBeats > maxBeats + 0.001) return state;

      const hist = saveHistory(state);
      const newScore = cloneScore(state.present);
      newScore.parts[partIndex].measures[measureIndex].notes.splice(noteIndex, 0, rest);

      const updatedBeats = getMeasureBeats(newScore.parts[partIndex].measures[measureIndex]);
      let newMeasureIndex = measureIndex;
      let newNoteIndex = noteIndex + 1;

      if (Math.abs(updatedBeats - maxBeats) < 0.001) {
        newMeasureIndex = measureIndex + 1;
        newNoteIndex = 0;
        if (newMeasureIndex >= newScore.parts[0].measures.length) {
          const newNum = newScore.parts[0].measures.length + 1;
          newScore.parts.forEach(p => p.measures.push(makeMeasure(newNum)));
        }
      }

      return { ...hist, present: newScore, cursor: { partIndex, measureIndex: newMeasureIndex, noteIndex: newNoteIndex } };
    }

    case 'DELETE_NOTES': {
      const { noteIds } = action;
      if (noteIds.length === 0) return state;
      const hist = saveHistory(state);
      const newScore = cloneScore(state.present);
      const idSet = new Set(noteIds);

      for (const part of newScore.parts) {
        for (const measure of part.measures) {
          measure.notes = measure.notes.filter(n => !idSet.has(n.id));
        }
      }

      const cursor = { ...state.cursor };
      const part = newScore.parts[cursor.partIndex];
      if (part) {
        const meas = part.measures[cursor.measureIndex];
        if (meas) cursor.noteIndex = Math.min(cursor.noteIndex, meas.notes.length);
      }

      return { ...hist, present: newScore, cursor };
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

export function useScore(initialScore: Score) {
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

  const deleteNotes = useCallback((ids: string[]) => dispatch({ type: 'DELETE_NOTES', noteIds: ids }), []);
  const changePitch = useCallback((noteId: string, midi: number, alter: -1|0|1) => dispatch({ type: 'CHANGE_PITCH', noteId, midi, alter }), []);
  const moveCursor  = useCallback((cursor: CursorPosition) => dispatch({ type: 'MOVE_CURSOR', cursor }), []);
  const undo        = useCallback(() => dispatch({ type: 'UNDO' }), []);
  const redo        = useCallback(() => dispatch({ type: 'REDO' }), []);
  const addMeasure  = useCallback(() => dispatch({ type: 'ADD_MEASURE' }), []);
  const loadScore   = useCallback((score: Score) => dispatch({ type: 'LOAD_SCORE', score }), []);
  const setKeySig   = useCallback((keySig: number) => dispatch({ type: 'SET_KEY_SIG', keySig }), []);
  const setTimeSig  = useCallback((num: number, den: number) => dispatch({ type: 'SET_TIME_SIG', num, den }), []);

  return {
    score: state.present,
    cursor: state.cursor,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    dispatch,
    insertNote,
    insertRest,
    deleteNotes,
    changePitch,
    moveCursor,
    undo,
    redo,
    addMeasure,
    loadScore,
    setKeySig,
    setTimeSig,
  };
}
