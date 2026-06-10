'use client';

import { create } from 'zustand';

// ─── Types (re-exports from music-model for backward-compat panel imports) ──

export type DurationBase =
  | 'breve' | 'whole' | 'half' | 'quarter' | 'eighth' | '16th' | '32nd' | '64th'
  | '128th' | '256th' | '512th' | '1024th';
export type Alter = -3 | -2 | -1 | 0 | 1 | 2 | 3;
export type EditorMode = 'normal' | 'note-input';

// ─── UI-only store ──────────────────────────────────────────────────────────
// The score itself lives in useScore() (reducer). This store keeps cross-
// component UI state: input mode, active duration, accidental, selection.

interface EditorUiState {
  mode: EditorMode;
  activeDuration: DurationBase;
  activeDots: 0 | 1 | 2 | 3;
  pendingAlter: Alter;
  selectedIds: Set<string>;
  /** When true, the staff ghost previews/commits RESTS instead of notes.
   *  Armed by the R key / rest buttons; cleared by A-G / note-duration picks. */
  restMode: boolean;

  setMode:           (m: EditorMode) => void;
  setRestMode:       (b: boolean) => void;
  toggleNoteInput:   () => void;
  enterNoteInput:    () => void;
  exitNoteInput:     () => void;
  setActiveDuration: (d: DurationBase) => void;
  toggleDots:        () => void;
  setPendingAlter:   (a: Alter) => void;
  setSelectedIds:    (ids: Set<string>) => void;
  clearSelection:    () => void;
  toggleSelection:   (id: string, multi: boolean) => void;
}

export const useEditorStore = create<EditorUiState>((set) => ({
  mode:           'normal',
  activeDuration: 'quarter',
  activeDots:     0,
  pendingAlter:   0,
  selectedIds:    new Set(),
  restMode:       false,

  setMode:           (m)    => set({ mode: m }),
  setRestMode:       (b)    => set({ restMode: b }),
  toggleNoteInput:   ()     => set((s) => ({ mode: s.mode === 'note-input' ? 'normal' : 'note-input' })),
  // Note: do NOT clear `selectedIds` here. Pressing A-G with a user-selected
  // note must keep the selection so the keyboard handler can edit it instead
  // of inserting a new one. Selection is cleared explicitly via Escape /
  // empty-space click / exit.
  enterNoteInput:    ()     => set({ mode: 'note-input' }),
  exitNoteInput:     ()     => set({ mode: 'normal' }),
  // Selecting a duration also enters note-input mode (matches Sibelius / Flat / ScoreSynth).
  setActiveDuration: (d)    => set({ activeDuration: d, mode: 'note-input' }),
  toggleDots:        ()     => set((s) => ({ activeDots: ((s.activeDots + 1) % 4) as 0 | 1 | 2 | 3 })),
  setPendingAlter:   (a)    => set({ pendingAlter: a }),
  setSelectedIds:    (ids)  => set({ selectedIds: ids }),
  clearSelection:    ()     => set({ selectedIds: new Set() }),
  toggleSelection:   (id, multi) => set((s) => {
    const next = new Set(multi ? s.selectedIds : []);
    if (multi && s.selectedIds.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    return { selectedIds: next };
  }),
}));

// ─── Sibelius-style duration shortcuts ──────────────────────────────────────

export const DURATION_KEY_MAP: Record<string, DurationBase> = {
  '1': '64th',
  '2': '32nd',
  '3': '16th',
  '4': 'eighth',
  '5': 'quarter',
  '6': 'half',
  '7': 'whole',
};
