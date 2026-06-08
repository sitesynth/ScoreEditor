import { useState, useCallback } from 'react';
import { Duration, DurationBase } from './music-model';

export type EditorMode = 'normal' | 'note-input';

export function useEditorState() {
  const [mode, setMode] = useState<EditorMode>('normal');
  const [selectedDuration, setSelectedDuration] = useState<Duration>({ base: 'quarter', dots: 0 });
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackBeat, setPlaybackBeat] = useState(0);
  const [pendingAlter, setPendingAlter] = useState<-1 | 0 | 1>(0);

  const enterNoteInput = useCallback(() => {
    setMode('note-input');
    setSelectedNoteIds(new Set());
  }, []);

  const exitNoteInput = useCallback(() => {
    setMode('normal');
  }, []);

  const selectNote = useCallback((id: string, multi = false) => {
    setSelectedNoteIds(prev => {
      if (multi) {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      }
      return new Set([id]);
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedNoteIds(new Set()), []);

  const toggleDot = useCallback(() => {
    setSelectedDuration(d => ({ ...d, dots: d.dots === 0 ? 1 : d.dots === 1 ? 2 : 0 }));
  }, []);

  const selectDuration = useCallback((base: DurationBase, dots?: 0 | 1 | 2) => {
    setSelectedDuration(d => ({ ...d, base, dots: dots ?? d.dots }));
    setMode('note-input');
  }, []);

  return {
    mode, setMode,
    selectedDuration, setSelectedDuration, selectDuration,
    selectedNoteIds, selectNote, clearSelection,
    isPlaying, setIsPlaying,
    playbackBeat, setPlaybackBeat,
    pendingAlter, setPendingAlter,
    enterNoteInput, exitNoteInput,
    toggleDot,
  };
}

export const DURATION_KEY_MAP: Record<string, DurationBase> = {
  '1': '64th',
  '2': '32nd',
  '3': '16th',
  '4': 'eighth',
  '5': 'quarter',
  '6': 'half',
  '7': 'whole',
};

export interface NotePosition {
  noteId: string;
  x: number;
  beatOffset: number;
}

export interface StaveLayout {
  partIndex: number;
  measureIndex: number;
  x: number;
  y: number;
  width: number;
  staveTopY: number;
  staveBottomY: number;
  clef: 'treble' | 'bass' | 'alto';
  notePositions: NotePosition[];
  cursorXPositions: number[];
}
