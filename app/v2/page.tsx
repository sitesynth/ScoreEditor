'use client';

import React, { useState, useCallback, useRef, useEffect, useMemo, useDeferredValue } from 'react';
import { C } from '@/lib/theme';
import EditorTopBar from '@/components/v2/EditorTopBar';
import RightSidebar from '@/components/v2/RightSidebar';
import PalettePanel from '@/components/v2/PalettePanel';
import TabBar from '@/components/v2/TabBar';
import BottomPanel, { type ToolbarOp } from '@/components/v2/BottomPanel';
import VerovioRenderer from '@/components/v2/VerovioRenderer';
import { useScore } from '@/lib/v2/score-reducer';
import { scoreToMusicXml, type GhostSpec } from '@/lib/v2/score-to-musicxml';
import { useEditorStore } from '@/lib/v2/editor-store';
import {
  Note, Rest, letterToPitch, transposePitch, stepOctaveToMidi, diatonicUp,
  type DurationBase,
} from '@/lib/v2/music-model';
import {
  findStaves, clientToSvg, svgToClient, snapYToStaff,
  findMeasures, findMeasureAtPoint, snapXToBeatSlot,
  type StaffInfo, type MeasureBox,
} from '@/lib/v2/staff-geometry';
import { beatsPerMeasure, durationBeats } from '@/lib/v2/music-model';

// ─── v2 editor (caret-based) ────────────────────────────────────────────────

export default function EditorV2Page() {
  const [zoom, setZoom] = useState(100);
  const [palettesOpen, setPalettesOpen] = useState(false);
  const clampZoom = (z: number) => Math.max(25, Math.min(400, Math.round(z)));

  // Score model + history
  const {
    score, cursor, canUndo, canRedo,
    insertNote, insertRest, insertNoteAt, insertNoteAtBeat, insertRestAt,
    replaceAtIndex, deleteNotes, convertToRests, setBarline,
    changePitch, changeChordPitch, changeGracePitch, removeChordNote, addToChord, toggleArticulation, changeDuration, moveCursor,
    toggleTie, toggleSlur, toggleSlide, toggleOrnament, setDynamics, setStemDir, setBeam, setTremolo, toggleWords,
    setAccidentalDisplay, toggleBracketAccidental, toggleCueSize, setBekarMark, toggleGrace,
    setNotehead, togglePreBend, convertToGrace, setGraceKind,
    toggleHairpin, toggleOctaveShift, togglePedal, setClefChange, setTimeSigChange,
    toggleTuplet,
    undo, redo,
  } = useScore();

  // UI state — read each value separately (Zustand is fine with this).
  const mode             = useEditorStore((s) => s.mode);
  const activeDuration   = useEditorStore((s) => s.activeDuration);
  const activeDots       = useEditorStore((s) => s.activeDots);
  const pendingAlter     = useEditorStore((s) => s.pendingAlter);
  const selectedIds      = useEditorStore((s) => s.selectedIds);

  // Ghost preview spec — holds beat/pitch info used for commit. The visual
  // preview is rendered as an HTML overlay (see `cursorGhostPos`), so this
  // spec is NOT passed to scoreToMusicXml anymore.
  const [ghostSpec, setGhostSpec] = useState<GhostSpec | null>(null);
  // HTML overlay position for the visual ghost notehead. relX/relY are in
  // scoreScrollRef content coords (post-scroll). Snapped Y comes from
  // staff-line snap; X follows the cursor directly.
  const [cursorGhostPos, setCursorGhostPos] = useState<{
    relX: number;
    relY: number;
    base: DurationBase;
    dots: 0 | 1 | 2 | 3;
    /** Beat the snap chose (1-indexed for the user; 1 = first beat). Used
     *  to render the "Beat N" tooltip + vertical guide line in note-input
     *  mode so the user knows which beat their click will land on. */
    beat: number;
    /** Measure number, also for display. */
    measureNumber: number;
    /** Staff top/bottom Y in scroll-container coords — the snap guide
     *  line spans only the active staff, not the whole page. */
    staffTopY: number;
    staffBottomY: number;
  } | null>(null);
  // Last cursor position seen inside the score area. We keep it in a ref so
  // releasing Space (pan tool) can resume the ghost preview at the exact
  // pixel the user is hovering over — without it, after a pan the user
  // would have to wiggle the mouse before the red preview reappears.
  const lastMousePosRef = useRef<{ x: number; y: number } | null>(null);

  // Mirror ghost activity to the ref so onSvgRendered (with empty deps) can
  // read it without stale closure.
  useEffect(() => { ghostActiveRef.current = ghostSpec !== null; }, [ghostSpec]);

  // Memoize MusicXML for Verovio — ghostSpec is passed so Verovio renders
  // the preview note inline, with proper stems / ledger lines / spacing.
  const musicXml = useMemo(() => scoreToMusicXml(score, ghostSpec), [score, ghostSpec]);
  // Defer Verovio re-render — rapid mouse moves / keystrokes batch.
  const deferredXml = useDeferredValue(musicXml);

  // Last inserted MIDI for auto-octave.
  const lastMidiRef = useRef<number | null>(null);
  // Last inserted note id — digits stack chord intervals on this when
  // nothing is selected, so the user can type "A 3 5" and get a triad.
  const lastInsertedNoteRef = useRef<{ id: string; partIndex: number; measureIndex: number; noteIndex: number } | null>(null);
  // How the current selection was set: 'typed' (auto-select after A-G / R /
  // ghost-commit — next A-G inserts the next note) vs 'user' (click or arrow
  // — next A-G edits the selected pitch / converts a selected rest to a note).
  const selectionSourceRef = useRef<'typed' | 'user' | 'marquee' | null>(null);
  // Live score in a ref so callbacks with empty deps (onSvgRendered) still see
  // the latest state. Without this the verovio↔model mapping is built against
  // the initial (empty) score and ends up empty itself.
  const scoreRef = useRef(score);
  useEffect(() => { scoreRef.current = score; }, [score]);
  // While the ghost is on screen, freeze the staff geometry — Verovio's
  // re-render with the ghost note can subtly shift staff positions, which
  // breaks pitch hysteresis (the snap zone slides out from under the cursor).
  // We still rebuild the verovio↔model id mapping every frame, just not the
  // geometric refs.
  const ghostActiveRef = useRef(false);

  // ── Keyboard handler ─────────────────────────────────────────────────────
  // We use direct deps (not refs) so closures capture fresh state. Effect
  // re-attaches the listener when deps change. Should be cheap enough.
  useEffect(() => {
    const store = useEditorStore.getState();

    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      // Use e.code (physical key) instead of e.key — works regardless of
      // keyboard layout (Russian, French, etc) and CapsLock state.
      const code = e.code;

      // Letter shortcuts: KeyA..KeyZ → 'a'..'z'
      const letterMatch = code.match(/^Key([A-Z])$/);
      const letter = letterMatch ? letterMatch[1].toLowerCase() : null;

      // Digit shortcuts: Digit0..Digit9 → '0'..'9'
      const digitMatch = code.match(/^Digit([0-9])$/);
      const digit = digitMatch ? digitMatch[1] : null;

      // Undo / Redo
      if ((e.ctrlKey || e.metaKey) && code === 'KeyZ' && !e.shiftKey) { undo(); e.preventDefault(); return; }
      if ((e.ctrlKey || e.metaKey) && (code === 'KeyY' || (e.shiftKey && code === 'KeyZ'))) { redo(); e.preventDefault(); return; }

      if (code === 'Escape') {
        store.exitNoteInput();
        store.clearSelection();
        selectionSourceRef.current = null;
        e.preventDefault();
        return;
      }

      // Tab / Shift+Tab — cycle cursor.partIndex through staves.
      // Without this, A-G always inserts into staves[0] (treble) because
      // insertNote/insertRest use the cursor's partIndex and nothing moves it
      // between staves.
      if (code === 'Tab') {
        const total = score.parts.length;
        if (total > 1) {
          const dir = e.shiftKey ? -1 : 1;
          const next = (cursor.partIndex + dir + total) % total;
          moveCursor({ ...cursor, partIndex: next });
        }
        e.preventDefault();
        return;
      }

      // Zoom shortcuts (Figma-style):  Ctrl+= / Ctrl++ → in,  Ctrl+- → out,
      // Ctrl+0 → reset to 100%.
      if ((e.ctrlKey || e.metaKey) && (code === 'Equal' || code === 'NumpadAdd')) {
        setZoom((z) => clampZoom(z + 25));
        e.preventDefault();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (code === 'Minus' || code === 'NumpadSubtract')) {
        setZoom((z) => clampZoom(z - 25));
        e.preventDefault();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && code === 'Digit0') {
        setZoom(100);
        e.preventDefault();
        return;
      }

      if (code === 'Delete' || code === 'Backspace') {
        const ids = [...selectedIds];
        if (ids.length === 0) return;

        // Resolve every selected id into one of three actions:
        //   • staff   → convert every note in that staff/measure to a rest
        //   • chord-note ("uuid|N") → splice it out of the parent's chordNotes
        //   • plain note id → convert to rest (DELETE_NOTES)
        const noteIdsToDelete: string[] = [];
        const chordRemovals: Array<{ noteId: string; chordIdx: number }> = [];

        for (const id of ids) {
          // Chord-note composite key?
          const parts = id.split('|');
          if (parts.length === 2 && parts[1].match(/^\d+$/)) {
            chordRemovals.push({ noteId: parts[0], chordIdx: parseInt(parts[1], 10) });
            continue;
          }
          // Staff selection — wipe the bar entirely. The reducer turns each
          // note into a rest of matching duration AND removes any rest whose
          // id is in the set, so an empty `measure.notes` falls through to
          // the converter's default mRest. Collect notes + rests.
          const staffInfo = staffMapRef.current.get(id);
          if (staffInfo) {
            const measure = score.parts[staffInfo.partIdx]?.measures[staffInfo.measureIdx];
            measure?.notes.forEach((n) => noteIdsToDelete.push(n.id));
            continue;
          }
          // Regular note/rest id.
          noteIdsToDelete.push(id);
        }

        if (noteIdsToDelete.length > 0) deleteNotes(noteIdsToDelete);
        for (const cr of chordRemovals) removeChordNote(cr.noteId, cr.chordIdx);

        store.clearSelection();
        e.preventDefault();
        return;
      }

      // Numeric keys ALWAYS build a chord interval — never change duration.
      // Targets:
      //   1. Anything in `selectedIds` (per-note + per-chord-note via "uuid|N").
      //   2. If selection is empty → the last inserted note (so "A 3 5" → triad).
      // Duration is changed only through BottomPanel buttons, never digits.
      if (digit && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        const intervalNum = parseInt(digit, 10);
        if (intervalNum < 2 || intervalNum > 9) { e.preventDefault(); return; }

        const targets: Array<{ id: string; chordIdx: number }> = [];
        if (selectedIds.size > 0) {
          for (const idKey of selectedIds) {
            const [id, chordStr] = idKey.split('|');
            targets.push({ id, chordIdx: chordStr !== undefined ? parseInt(chordStr, 10) : -1 });
          }
        } else if (lastInsertedNoteRef.current) {
          targets.push({ id: lastInsertedNoteRef.current.id, chordIdx: -1 });
        }

        // Track current chord length per note so multiple stacks in one
        // handler get the right composite ids. score from closure is the
        // pre-dispatch state — addToChord doesn't reflect here until next
        // render, so we predict the new index ourselves.
        const lengthByNote = new Map<string, number>();
        const newSelection = new Set<string>();
        let stacked = false;

        for (const { id, chordIdx } of targets) {
          for (const part of score.parts) {
            for (const m of part.measures) {
              const n = m.notes.find(x => x.id === id && x.type === 'note');
              if (n && n.type === 'note') {
                const fromPitch = chordIdx < 0 ? n.pitch : n.chordNotes?.[chordIdx];
                if (!fromPitch) continue;
                const newPitch = diatonicUp(fromPitch, intervalNum - 1);
                const currentLen = lengthByNote.get(id) ?? (n.chordNotes?.length ?? 0);
                addToChord(id, newPitch);
                // Newly appended chord-note will land at index = currentLen.
                lengthByNote.set(id, currentLen + 1);
                newSelection.add(`${id}|${currentLen}`);
                stacked = true;
              }
            }
          }
        }
        if (stacked) {
          // Move selection to the newly-added chord-notes (visually on top).
          // Next digit press will stack the next interval on these — turning
          // "A 3 3" into a triad A-C#-E instead of two duplicate thirds.
          useEditorStore.getState().setSelectedIds(newSelection);
        }
        e.preventDefault();
        return;
      }

      // Dot
      if (code === 'Period' && !e.ctrlKey && !e.altKey) {
        store.enterNoteInput();
        store.toggleDots();
        e.preventDefault();
        return;
      }

      // Sharp (Shift+3 on most layouts gives '#')
      if (e.shiftKey && code === 'Digit3') {
        store.setPendingAlter(1);
        e.preventDefault();
        return;
      }
      // Flat (Sibelius-style minus key)
      if (code === 'Minus' && !e.ctrlKey) {
        store.setPendingAlter(pendingAlter === -1 ? 0 : -1);
        e.preventDefault();
        return;
      }

      // A-G — insert note with auto-octave (layout-independent via e.code)
      if (letter && 'abcdefg'.includes(letter) && !e.ctrlKey && !e.altKey && !e.metaKey) {
        store.enterNoteInput();

        // EDIT branch: user-selected note → change pitch; user-selected rest
        // → replace with note of same duration; user-selected chord-note
        // ("uuid|N") → change that chord-note's pitch.
        if (selectedIds.size > 0 && selectionSourceRef.current === 'user') {
          const nextSel = new Set<string>();
          let lastEditMidi: number | null = null;
          let edited = false;

          for (const idKey of selectedIds) {
            if (idKey.startsWith('mrest|')) { nextSel.add(idKey); continue; }
            const [baseId, chordStr] = idKey.split('|');
            const chordIdx = chordStr !== undefined ? parseInt(chordStr, 10) : -1;

            let found: { partIdx: number; mIdx: number; nIdx: number; item: Note | Rest } | null = null;
            for (let p = 0; p < score.parts.length && !found; p++) {
              for (let m = 0; m < score.parts[p].measures.length && !found; m++) {
                const idx = score.parts[p].measures[m].notes.findIndex(x => x.id === baseId);
                if (idx >= 0) {
                  found = { partIdx: p, mIdx: m, nIdx: idx, item: score.parts[p].measures[m].notes[idx] };
                }
              }
            }
            if (!found) continue;

            if (chordIdx >= 0 && found.item.type === 'note') {
              const cur = found.item.chordNotes?.[chordIdx];
              if (!cur) continue;
              const pitch = letterToPitch(letter, cur.midi, pendingAlter);
              changeChordPitch(baseId, chordIdx, pitch.midi, pitch.alter);
              nextSel.add(idKey);
              lastEditMidi = pitch.midi;
              edited = true;
            } else if (found.item.type === 'note') {
              const pitch = letterToPitch(letter, found.item.pitch.midi, pendingAlter);
              changePitch(baseId, pitch.midi, pitch.alter);
              nextSel.add(baseId);
              lastEditMidi = pitch.midi;
              edited = true;
            } else if (found.item.type === 'rest') {
              const pitch = letterToPitch(letter, lastMidiRef.current, pendingAlter);
              const newNote: Note = {
                type: 'note',
                id: crypto.randomUUID(),
                pitch,
                duration: found.item.duration,
              };
              replaceAtIndex(found.partIdx, found.mIdx, found.nIdx, newNote);
              nextSel.add(newNote.id);
              lastEditMidi = pitch.midi;
              edited = true;
            }
          }

          if (edited) {
            if (nextSel.size > 0) store.setSelectedIds(nextSel);
            if (lastEditMidi !== null) lastMidiRef.current = lastEditMidi;
            if (pendingAlter !== 0) store.setPendingAlter(0);
            // Stay in user-edit mode so the next A-G keeps editing.
            selectionSourceRef.current = 'user';
            e.preventDefault();
            return;
          }
        }

        // INSERT branch (default).
        try {
          const pitch = letterToPitch(letter, lastMidiRef.current, pendingAlter);
          const note: Note = {
            type: 'note',
            id: crypto.randomUUID(),
            pitch,
            duration: { base: activeDuration, dots: activeDots },
          };
          insertNote(note);
          lastMidiRef.current = pitch.midi;
          lastInsertedNoteRef.current = {
            id: note.id,
            partIndex: cursor.partIndex,
            measureIndex: cursor.measureIndex,
            noteIndex: cursor.noteIndex,
          };
          store.setSelectedIds(new Set([note.id]));
          selectionSourceRef.current = 'typed';
          if (pendingAlter !== 0) store.setPendingAlter(0);
        } catch (err) {
          console.error('[v2] insertNote failed', err);
        }
        e.preventDefault();
        return;
      }

      // R — rest
      if (letter === 'r' && !e.ctrlKey && !e.altKey) {
        store.enterNoteInput();
        const rest: Rest = {
          type: 'rest',
          id: crypto.randomUUID(),
          duration: { base: activeDuration, dots: activeDots },
        };
        insertRest(rest);
        store.setSelectedIds(new Set([rest.id]));
        selectionSourceRef.current = 'typed';
        e.preventDefault();
        return;
      }

      // N — toggle note input
      if (letter === 'n' && !e.ctrlKey && !e.altKey) {
        store.toggleNoteInput();
        e.preventDefault();
        return;
      }

      // V — switch to Selection tool (exit note input, keep current selection)
      if (letter === 'v' && !e.ctrlKey && !e.altKey) {
        store.exitNoteInput();
        e.preventDefault();
        return;
      }

      // Cursor arrows. If something is selected, step the SELECTION across
      // notes/rests/chords on its current stave (this is how Sibelius / Flat /
      // MuseScore behave). Falls back to plain cursor navigation when there's
      // no selection — useful for note-input typing without clicking first.
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const dir = e.key === 'ArrowRight' ? 1 : -1;

        if (selectedIds.size > 0) {
          // Whole-measure (staff) selection — arrow steps INTO the bar at the
          // edge corresponding to the direction. Right → first item; Left →
          // last item. Empty bar → mRest. Anchor logic below handles the rest.
          const staffId = [...selectedIds].find(id => staffMapRef.current.has(id));
          if (staffId) {
            const info = staffMapRef.current.get(staffId)!;
            const part = score.parts[info.partIdx];
            const measure = part?.measures[info.measureIdx];
            if (measure) {
              const nextId = measure.notes.length === 0
                ? `mrest|${info.partIdx}|${info.measureIdx}`
                : measure.notes[dir > 0 ? 0 : measure.notes.length - 1].id;
              useEditorStore.getState().setSelectedIds(new Set([nextId]));
              selectionSourceRef.current = 'user';
              e.preventDefault();
              return;
            }
          }

          // Anchor: (partIdx, mIdx, nIdx). nIdx === -1 means the anchor is a
          // whole-measure rest (`mrest|p|m`) — that bar has no items in the model.
          let anchor: { partIdx: number; mIdx: number; nIdx: number } | null = null;
          for (const idKey of selectedIds) {
            if (idKey.startsWith('mrest|')) {
              const [, pStr, mStr] = idKey.split('|');
              anchor = { partIdx: Number(pStr), mIdx: Number(mStr), nIdx: -1 };
              break;
            }
            const [id] = idKey.split('|');
            for (let p = 0; p < score.parts.length && !anchor; p++) {
              for (let m = 0; m < score.parts[p].measures.length && !anchor; m++) {
                const idx = score.parts[p].measures[m].notes.findIndex(x => x.id === id);
                if (idx >= 0) anchor = { partIdx: p, mIdx: m, nIdx: idx };
              }
            }
            if (anchor) break;
          }
          if (anchor) {
            const part = score.parts[anchor.partIdx];
            const setSel = (id: string) => {
              useEditorStore.getState().setSelectedIds(new Set([id]));
              selectionSourceRef.current = 'user';
              e.preventDefault();
            };
            // Walk forward/backward into a neighbouring measure and pick its
            // first/last item (or mRest if empty). Used when we either start
            // from an mRest or step off the end of the current measure.
            const enterNeighbour = (fromMIdx: number): boolean => {
              let m = fromMIdx + dir;
              while (m >= 0 && m < part.measures.length) {
                const items = part.measures[m].notes;
                if (items.length === 0) {
                  setSel(`mrest|${anchor!.partIdx}|${m}`);
                  return true;
                }
                setSel(items[dir > 0 ? 0 : items.length - 1].id);
                return true;
              }
              return false;
            };

            if (anchor.nIdx === -1) {
              // From a whole-measure rest — straight to the neighbour bar.
              if (enterNeighbour(anchor.mIdx)) return;
              e.preventDefault();
              return;
            }

            // Step ±1 inside the current measure first.
            const items = part.measures[anchor.mIdx].notes;
            const nIdx = anchor.nIdx + dir;
            if (nIdx >= 0 && nIdx < items.length) {
              setSel(items[nIdx].id);
              return;
            }
            // Walked off the edge — cross into the neighbour.
            if (enterNeighbour(anchor.mIdx)) return;
            e.preventDefault();
            return;
          }
        }

        const part = score.parts[cursor.partIndex];
        if (!part) return;
        const measure = part.measures[cursor.measureIndex];
        if (!measure) return;

        if (dir > 0) {
          if (cursor.noteIndex < measure.notes.length) {
            moveCursor({ ...cursor, noteIndex: cursor.noteIndex + 1 });
          } else if (cursor.measureIndex + 1 < part.measures.length) {
            moveCursor({ ...cursor, measureIndex: cursor.measureIndex + 1, noteIndex: 0 });
          }
        } else {
          if (cursor.noteIndex > 0) {
            moveCursor({ ...cursor, noteIndex: cursor.noteIndex - 1 });
          } else if (cursor.measureIndex > 0) {
            const prev = part.measures[cursor.measureIndex - 1];
            moveCursor({ ...cursor, measureIndex: cursor.measureIndex - 1, noteIndex: prev.notes.length });
          }
        }
        e.preventDefault();
        return;
      }

      // Up / Down with empty selection in Note Input — switch staff.
      // Matches Flat.io: ↑ goes to upper staff (treble), ↓ to lower (bass).
      if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') &&
          selectedIds.size === 0 && mode === 'note-input') {
        const total = score.parts.length;
        if (total > 1) {
          const dir = e.key === 'ArrowDown' ? 1 : -1;
          const next = Math.max(0, Math.min(total - 1, cursor.partIndex + dir));
          if (next !== cursor.partIndex) moveCursor({ ...cursor, partIndex: next });
        }
        e.preventDefault();
        return;
      }

      // Up / Down — transpose. Supports per-chord-note selection via
      // composite ids of form "uuid|chordIdx".
      if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && selectedIds.size > 0) {
        const dir = e.key === 'ArrowUp' ? 1 : -1;
        const semis = e.altKey ? 12 * dir : dir;
        for (const idKey of selectedIds) {
          // Grace-note composite key: "parentId:grace:idx"
          const graceMatch = idKey.match(/^(.+):grace:(\d+)$/);
          if (graceMatch) {
            const parentId = graceMatch[1];
            const graceIdx = parseInt(graceMatch[2], 10);
            const liveScore = scoreRef.current;
            for (const part of liveScore.parts) {
              for (const m of part.measures) {
                const n = m.notes.find(x => x.id === parentId && x.type === 'note');
                if (n && n.type === 'note' && n.graceBefore && n.graceBefore[graceIdx]) {
                  const oldP = n.graceBefore[graceIdx].pitch;
                  const np = transposePitch(oldP, semis);
                  changeGracePitch(parentId, graceIdx, np.midi, np.alter);
                }
              }
            }
            continue;
          }
          const [id, chordStr] = idKey.split('|');
          const chordIdx = chordStr !== undefined ? parseInt(chordStr, 10) : -1;
          for (const part of score.parts) {
            for (const m of part.measures) {
              const n = m.notes.find(x => x.id === id && x.type === 'note');
              if (n && n.type === 'note') {
                if (chordIdx < 0) {
                  const np = transposePitch(n.pitch, semis);
                  changePitch(id, np.midi, np.alter);
                } else {
                  const oldP = n.chordNotes?.[chordIdx];
                  if (oldP) {
                    const np = transposePitch(oldP, semis);
                    changeChordPitch(id, chordIdx, np.midi, np.alter);
                  }
                }
              }
            }
          }
        }
        e.preventDefault();
        return;
      }
    }

    // Capture phase to ensure we get the key before any nested element does.
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [
    mode, activeDuration, activeDots, pendingAlter, cursor, score, selectedIds,
    insertNote, insertRest, deleteNotes, changePitch, changeChordPitch,
    changeGracePitch, addToChord, replaceAtIndex, removeChordNote,
    moveCursor, undo, redo,
  ]);

  // Force-focus the editor root on mount so keystrokes are immediately captured.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  // Ctrl+wheel zoom — must register non-passive so we can preventDefault and
  // stop Chrome's built-in page zoom from kicking in. React's synthetic
  // onWheel handler can't do this (it's passive by default in modern React).
  const scoreScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scoreScrollRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      e.stopPropagation();
      setZoom((z) => Math.max(25, Math.min(400, Math.round(z - e.deltaY * 0.1))));
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Re-grab staff/measure geometry whenever zoom changes. Zoom is applied as
  // a CSS `transform: scale(...)` on a parent div, so Verovio never re-renders
  // — but every staff/measure bbox we cached in measuresRef/stavesRef is in
  // SCREEN-pixel coordinates and is now stale. We update even mid-ghost
  // because that's exactly when the user wants zoom to help — placing tiny
  // notes precisely.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    // Defer one frame so the transform has settled into the new size before
    // we sample bboxes.
    const id = requestAnimationFrame(() => {
      const staves = findStaves(svg);
      stavesRef.current = staves;
      measuresRef.current = findMeasures(svg);
      if (staves.length > 0) {
        const raw = staves[0].lineSpacing;
        noteheadPxRef.current = (raw > 2 && raw < 30) ? raw : 8;
      }
      setSvgRenderTick((t) => t + 1);
    });
    return () => cancelAnimationFrame(id);
  }, [zoom]);

  // Initial scroll: center the score in the pad-box. Without this, the user
  // opens /v2 and sees only the empty 2000px left/top padding — the score
  // sits offscreen until they pan to it. We run once on mount AND when zoom
  // changes the content size (so re-centering keeps the score visible).
  const didInitialCenterRef = useRef(false);
  useEffect(() => {
    const el = scoreScrollRef.current;
    if (!el || didInitialCenterRef.current) return;
    // Wait one frame for layout to settle (Verovio render).
    const id = requestAnimationFrame(() => {
      const scoreWidth  = 794  * (zoom / 100);
      const scoreHeight = 1123 * (zoom / 100);
      el.scrollLeft = 2000 + scoreWidth  / 2 - el.clientWidth  / 2;
      el.scrollTop  = 2000 - 40;
      // 40px top padding so the title is visible just under the top bar.
      didInitialCenterRef.current = true;
    });
    return () => cancelAnimationFrame(id);
  }, [zoom]);

  // ── Pan tool: Space-hold + drag scrolls the canvas (Figma-style) ─────────
  const [isSpaceHeld, setIsSpaceHeld] = useState(false);
  // Ref mirror of isSpaceHeld so callbacks (onScoreMouseMove, etc.) can
  // read it synchronously inside their stale closure — the state is async
  // and won't update mid-event-dispatch otherwise.
  const isSpaceHeldRef = useRef(false);
  const panStartRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  useEffect(() => {
    function onDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.code === 'Space' && !e.repeat) {
        // Pan tool (hand cursor) works in ALL modes, including note-input.
        // Drag-pan scrolls the canvas regardless of editor state — useful
        // when zoomed in and the user wants to slide the page around
        // without leaving Note Input. Ghost preview is suspended while
        // Space is held (cursor: grab takes over visually).
        isSpaceHeldRef.current = true;
        setIsSpaceHeld(true);
        e.preventDefault(); // stop page scroll
      }
    }
    function onUp(e: KeyboardEvent) {
      if (e.code === 'Space') {
        // Sync the ref BEFORE the React state update so the synthetic
        // mousemove dispatched below sees the new value through the ref.
        isSpaceHeldRef.current = false;
        setIsSpaceHeld(false);
        // Also end any in-progress pan.
        panStartRef.current = null;
        setIsPanning(false);
        // Resume the ghost preview at the mouse's current pixel — without
        // this, the user has to wiggle the mouse before the red preview
        // reappears after a pan. Dispatch a synthetic mousemove on the
        // scroll container, which re-enters onScoreMouseMove with the
        // last known cursor position; isSpaceHeld is already false by
        // then so the ghost-compute branch runs normally.
        const pos = lastMousePosRef.current;
        const el = scoreScrollRef.current;
        if (pos && el) {
          el.dispatchEvent(new MouseEvent('mousemove', {
            bubbles: true,
            clientX: pos.x,
            clientY: pos.y,
          }));
        }
      }
    }
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, []);

  // ── Selection: click on note/rest in SVG → toggle in store ──────────────
  const svgRef        = useRef<SVGSVGElement | null>(null);
  const stavesRef     = useRef<StaffInfo[]>([]);
  const measuresRef   = useRef<MeasureBox[]>([]);
  const noteheadPxRef = useRef<number>(10);
  // Hysteresis state for pitch snap — anchored to mouseY at which the step
  // was decided, plus the staff.topY at that moment. If Verovio shifts the
  // staff between frames (adding ledger lines for a low ghost note), we slide
  // the anchor mouseY by the same delta so the hysteresis zone tracks the
  // staff. Without this, the staff moves out from under the anchor and we get
  // a feedback dance: low ghost → staff up → snap to higher pitch → ghost
  // moves up → no ledger → staff down → snap back down → repeat.
  const prevPitchSnapRef = useRef<{ staffElId: string; stepIndex: number; mouseY: number; staffTopY: number } | null>(null);
  // Same idea horizontally: keep the previous slot while the cursor sits near
  // its centre. Resets when the active measure changes (different bar →
  // different slot axis).
  const prevSlotSnapRef = useRef<{ measureIdx: number; slotIndex: number } | null>(null);
  // Verovio ignores xml:id from MusicXML and generates its own (e.g. "i125kuo3"),
  // so we build a mapping ourselves by walking SVG measures × staves × notes
  // in parallel with our model.
  const veroviToModelRef = useRef<Map<string, string>>(new Map());
  const modelToVerovioRef = useRef<Map<string, string>>(new Map());
  // Staff Verovio id → which part / measure it belongs to.
  const staffMapRef = useRef<Map<string, { partIdx: number; measureIdx: number }>>(new Map());
  // Bumped every time the SVG is re-rendered and the mapping is rebuilt.
  // Visualization useEffects depend on it so they re-run AFTER the mapping
  // is fresh — without this, VerovioRenderer's async render finishes after
  // visualization has already looked up the (stale) mapping and missed
  // newly-inserted note IDs.
  const [svgRenderTick, setSvgRenderTick] = useState(0);

  const onSvgRendered = useCallback((svg: SVGSVGElement) => {
    svgRef.current = svg;

    // Freeze geometry while a ghost note is on screen — the ghost's ledger
    // lines (or width) can subtly shift staff positions between frames, and
    // updating stavesRef/measuresRef while the cursor is anchored makes the
    // pitch snap zone slide out from under the mouse. Mapping is still
    // updated below so selection of the just-committed note still works.
    if (!ghostActiveRef.current) {
      const staves = findStaves(svg);
      stavesRef.current = staves;
      const measures = findMeasures(svg);
      measuresRef.current = measures;
      if (staves.length > 0) {
        const raw = staves[0].lineSpacing;
        noteheadPxRef.current = (raw > 2 && raw < 30) ? raw : 8;
      }
    }

    // Build Verovio id ↔ model id mapping. For chords we map each notehead
    // separately so the user can transpose / build intervals from the
    // specific note they clicked, not just the primary.
    //
    // Composite keys:
    //   "uuid"     → the primary (main) pitch of a note
    //   "uuid|N"   → chord-note index N (refers to note.chordNotes[N])
    const v2m = new Map<string, string>();
    const m2v = new Map<string, string>();
    const staffMap = new Map<string, { partIdx: number; measureIdx: number }>();
    const measureEls = svg.querySelectorAll('g.measure');
    measureEls.forEach((mEl, mIdx) => {
      const staffEls = mEl.querySelectorAll(':scope > g.staff');
      staffEls.forEach((sEl, partIdx) => {
        if (sEl.id) staffMap.set(sEl.id, { partIdx, measureIdx: mIdx });
        const modelMeasure = scoreRef.current.parts[partIdx]?.measures[mIdx];
        if (!modelMeasure) return;

        // Collect all relevant elements descendants — we don't assume a
        // particular nesting depth (Verovio sometimes wraps notes in extra
        // layer/voice groups). For chord member notes (g.note inside g.chord)
        // we skip during the main walk because the chord container handles them.
        const all = Array.from(sEl.querySelectorAll('g.note, g.rest, g.chord')) as SVGGElement[];

        // Model-first walk: for each model item, we consume the matching
        // SVG slots. If the model item is a note with graceBefore[N],
        // we consume N preceding SVG g.note elements first as graces.
        // This is more robust than trying to detect grace markup in
        // arbitrary Verovio output (the class/wrapper varies by version).
        const isNoteEl = (el: SVGGElement) => {
          const c = el.getAttribute('class') ?? '';
          if (/\bchord\b/.test(c)) return false;
          if (!/\bnote\b/.test(c)) return false;
          // Skip chord inner notes — they're handled by their chord container.
          if (el.parentElement?.closest('g.chord')) return false;
          return true;
        };
        const isChordEl = (el: SVGGElement) => /\bchord\b/.test(el.getAttribute('class') ?? '');
        const isRestEl  = (el: SVGGElement) => /\brest\b/.test(el.getAttribute('class') ?? '');
        const isGhostEl = (el: SVGGElement) => {
          const c = (el.getAttribute('color') ?? '').toLowerCase();
          if (c === '#c0392b') return true;
          if (el.querySelector('[fill="#c0392b"], [color="#c0392b"]')) return true;
          return false;
        };

        // Filter ghost previews + chord-inner notes from the SVG list — they
        // don't correspond to standalone model items.
        const filtered = all.filter(el => {
          if (isGhostEl(el)) return false;
          if (isNoteEl(el) || isChordEl(el) || isRestEl(el)) return true;
          return false;
        });

        let svgIdx = 0;
        for (const item of modelMeasure.notes) {
          if (item.type === 'note') {
            const graceCount = item.graceBefore?.length ?? 0;
            // Consume grace SVG slots first
            for (let gi = 0; gi < graceCount && svgIdx < filtered.length; gi++) {
              const graceEl = filtered[svgIdx++];
              if (!isNoteEl(graceEl) && !isChordEl(graceEl)) continue;
              const key = `${item.id}:grace:${gi}`;
              v2m.set(graceEl.id, key);
              m2v.set(key, graceEl.id);
            }
            // Now consume one note/chord slot for the main note
            while (svgIdx < filtered.length) {
              const el = filtered[svgIdx];
              if (isNoteEl(el) || isChordEl(el)) break;
              svgIdx++;
            }
            if (svgIdx >= filtered.length) break;
            const mainEl = filtered[svgIdx++];
            if (isChordEl(mainEl)) {
              v2m.set(mainEl.id, item.id);
              const inner = Array.from(mainEl.querySelectorAll('g.note')) as SVGGElement[];
              inner.forEach((cn, idx) => {
                const key = idx === 0 ? item.id : `${item.id}|${idx - 1}`;
                v2m.set(cn.id, key);
                if (!m2v.has(key)) m2v.set(key, cn.id);
              });
            } else {
              v2m.set(mainEl.id, item.id);
              m2v.set(item.id, mainEl.id);
            }
          } else {
            // Rest
            while (svgIdx < filtered.length) {
              const el = filtered[svgIdx];
              if (isRestEl(el)) break;
              svgIdx++;
            }
            if (svgIdx >= filtered.length) break;
            const restEl = filtered[svgIdx++];
            v2m.set(restEl.id, item.id);
            m2v.set(item.id, restEl.id);
          }
        }
      });
    });
    veroviToModelRef.current = v2m;
    modelToVerovioRef.current = m2v;
    staffMapRef.current = staffMap;
    // Re-add custom ties IN THIS SAME synchronous call — before the browser
    // gets a chance to paint. Verovio just wiped them by overwriting
    // <svg>.innerHTML; if we waited for the useEffect (next React commit),
    // the user would see one paint with no ties → the flicker every
    // keystroke.
    renderCustomTies();
    // Tell visualization useEffects the mapping is fresh.
    setSvgRenderTick(t => t + 1);

    // Event delegation — single listener on the SVG root.
    // Selection walks UP from the target and picks the FIRST <g> that has an
    // id and a class we consider selectable. Smaller, more specific elements
    // (note / rest / accid / stem / beam / dot) sit deeper in the tree than
    // their containers (measure / staff / system), so this naturally prefers
    // the specific element — exactly what MuseScore does.
    const SELECTABLE_RE = /\b(note|rest|chord|mRest|accid|stem|beam|dot|tie|slur|dynam|tempo|harm|fermata|measure|staff)\b/;

    const onSvgClick = (e: MouseEvent) => {
      // Marquee just ended? Swallow the synthesised click so we don't
      // clear the selection that the marquee drag set.
      if (wasMarqueeRef.current) {
        wasMarqueeRef.current = false;
        return;
      }
      const mode = useEditorStore.getState().mode;

      // Direct click on a custom slur path → select it via synthetic
      // composite id "slur|startId|endId". Lets the user grab the arc
      // without grabbing a notehead first. Skip in note-input — clicks
      // there should fall through to ghost-commit.
      if (mode !== 'note-input') {
        const slurEl = (e.target as Element | null)?.closest?.('path.custom-slur');
        if (slurEl) {
          const s = slurEl.getAttribute('data-slur-start');
          const en = slurEl.getAttribute('data-slur-end');
          if (s && en) {
            const key = `slur|${s}|${en}`;
            useEditorStore.getState().toggleSelection(key, e.shiftKey);
            selectionSourceRef.current = 'user';
            e.stopPropagation();
            return;
          }
        }
        // Same trick for ties — synthetic id "tie|startId|endId|pitch".
        // Pitch is part of the key because chords can carry several ties
        // (one per matched pitch) and the user should be able to grab
        // each independently.
        const tieEl = (e.target as Element | null)?.closest?.('path.custom-tie');
        if (tieEl) {
          const s = tieEl.getAttribute('data-tie-start');
          const en = tieEl.getAttribute('data-tie-end');
          const p = tieEl.getAttribute('data-tie-pitch');
          if (s && en && p) {
            const key = `tie|${s}|${en}|${p}`;
            useEditorStore.getState().toggleSelection(key, e.shiftKey);
            selectionSourceRef.current = 'user';
            e.stopPropagation();
            return;
          }
        }
      }

      // Walk up looking for the most specific selectable. Rests count too —
      // users navigate them with ←/→ same as notes. `mRest` is Verovio's
      // class for whole-measure rests (the centred bar in empty bars); it has
      // no model id (the converter synthesises it), so we identify it by
      // composite key "mrest|partIdx|measureIdx" further down.
      // Selectable engraving primitives. Beam/stem/flag/accid/dot/tuplet
      // are added so they read as standalone editable shapes (planned:
      // vector handles for repositioning / resizing). Tie/slur are
      // selectable via the existing span pass.
      const itemRe = /\b(note|chord|rest|mRest|beam|stem|flag|accid|dot|tuplet)\b/;
      let noteHit:    Element | null = null;
      let staffHit:   Element | null = null;
      let el = e.target as Element | null;
      while (el && el !== svg) {
        if (el.tagName === 'g') {
          const cls = el.getAttribute('class') ?? '';
          if (!noteHit  && itemRe.test(cls) && el.id) noteHit  = el;
          if (!staffHit && /\bstaff\b/.test(cls) && el.id) staffHit = el;
        }
        el = el.parentElement;
      }

      // Proximity fallback: noteheads in Verovio's SVG are tiny, so a tiny
      // miss falls through to the staff (whole-bar) selection. Before that
      // happens, look for the nearest g.note/g.chord within HIT_RADIUS_PX of
      // the click and pretend the user hit it.
      //
      // CRITICAL: only in Selection mode. In Note Input mode the same fallback
      // would steal clicks near existing notes (toggleSelection + stopPropagation)
      // and ghost-commit would never fire — making it nearly impossible to add
      // notes next to existing ones.
      if (!noteHit && mode !== 'note-input') {
        const HIT_RADIUS_PX = 18;
        const staffEl = (e.target as Element | null)?.closest?.('g.staff') as SVGGElement | null;
        const scope: ParentNode = staffEl ?? svg;
        const candidates = scope.querySelectorAll('g.note, g.chord');
        let best: { el: Element; dist: number } | null = null;
        for (const cand of candidates) {
          if ((cand as Element).parentElement?.closest('g.chord') && cand !== (cand as Element).parentElement?.closest('g.chord')) {
            continue;
          }
          const r = (cand as SVGGElement).getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          const cx = (r.left + r.right) / 2;
          const cy = (r.top + r.bottom) / 2;
          const d = Math.hypot(e.clientX - cx, e.clientY - cy);
          if (d <= HIT_RADIUS_PX && (!best || d < best.dist)) {
            best = { el: cand, dist: d };
          }
        }
        if (best && best.el.id) noteHit = best.el;
      }

      // Resolve `noteHit` to a selection id. mRest gets a composite key based
      // on its (partIdx, measureIdx) since there's no model UUID for it.
      const resolveItemId = (hit: Element): string | null => {
        const cls = hit.getAttribute('class') ?? '';
        if (/\bmRest\b/.test(cls) && staffHit) {
          const info = staffMapRef.current.get((staffHit as SVGGElement).id);
          if (info) return `mrest|${info.partIdx}|${info.measureIdx}`;
        }
        return veroviToModelRef.current.get((hit as SVGGElement).id) ?? (hit as SVGGElement).id;
      };

      // Shift+click on an item: extend the selection from the first existing
      // selected item on the same stave (anchor) through the clicked item
      // (target). Includes every note / rest / chord / mRest in between, in
      // model order. Returns true if a range was applied.
      const positionOf = (id: string): { partIdx: number; mIdx: number; nIdx: number } | null => {
        if (id.startsWith('mrest|')) {
          const [, p, m] = id.split('|');
          return { partIdx: Number(p), mIdx: Number(m), nIdx: -1 };
        }
        const [bare] = id.split('|');
        const s = scoreRef.current;
        for (let p = 0; p < s.parts.length; p++) {
          for (let m = 0; m < s.parts[p].measures.length; m++) {
            const i = s.parts[p].measures[m].notes.findIndex(x => x.id === bare);
            if (i >= 0) return { partIdx: p, mIdx: m, nIdx: i };
          }
        }
        return null;
      };
      const flatItemIds = (partIdx: number): Array<{ mIdx: number; nIdx: number; id: string }> => {
        const out: Array<{ mIdx: number; nIdx: number; id: string }> = [];
        const part = scoreRef.current.parts[partIdx];
        if (!part) return out;
        part.measures.forEach((m, mIdx) => {
          if (m.notes.length === 0) {
            out.push({ mIdx, nIdx: -1, id: `mrest|${partIdx}|${mIdx}` });
          } else {
            m.notes.forEach((n, nIdx) => out.push({ mIdx, nIdx, id: n.id }));
          }
        });
        return out;
      };
      const applyItemRange = (targetId: string): boolean => {
        const target = positionOf(targetId);
        if (!target) return false;
        const state = useEditorStore.getState();
        // Find first selected item on the same stave.
        let anchor: { mIdx: number; nIdx: number } | null = null;
        for (const idKey of state.selectedIds) {
          const pos = positionOf(idKey);
          if (pos && pos.partIdx === target.partIdx) {
            anchor = { mIdx: pos.mIdx, nIdx: pos.nIdx };
            break;
          }
        }
        if (!anchor) return false;
        const flat = flatItemIds(target.partIdx);
        const aIdx = flat.findIndex(x => x.mIdx === anchor!.mIdx && x.nIdx === anchor!.nIdx);
        const tIdx = flat.findIndex(x => x.mIdx === target.mIdx && x.nIdx === target.nIdx);
        if (aIdx < 0 || tIdx < 0) return false;
        const [lo, hi] = aIdx < tIdx ? [aIdx, tIdx] : [tIdx, aIdx];
        state.setSelectedIds(new Set(flat.slice(lo, hi + 1).map(x => x.id)));
        return true;
      };

      // In Note Input mode we only treat clicks on existing notes/rests/chords
      // as selection (so digits build chord intervals from the clicked pitch).
      // Clicks on empty space stay with the ghost commit path.
      // Sync cursor to the just-clicked item so the next keyboard input lands
      // in the right measure. Critical for mRest: clicking an empty bar then
      // typing a letter must insert into THAT bar, not measure 0.
      const syncCursorToClick = (id: string) => {
        const pos = positionOf(id);
        if (pos) {
          moveCursor({
            partIndex: pos.partIdx,
            measureIndex: pos.mIdx,
            noteIndex: pos.nIdx === -1 ? 0 : pos.nIdx,
          });
        }
      };

      if (mode === 'note-input') {
        if (!noteHit) return;
        // In Note Input, a click on a rest / mRest is treated as "insert
        // here" — propagate to onScoreClick so the ghost-commit replaces or
        // splits that rest. Without this, the padded-measure model makes
        // every visual slot a g.rest and ghost-commit can never fire.
        // We also let clicks on existing g.note / g.chord fall through —
        // ghost-commit will either chord-stack (same beat, new pitch) or
        // insert in adjacent rest space. Users shouldn't be locked out of
        // an area just because there's a note there.
        const cls = noteHit.getAttribute('class') ?? '';
        if (/\b(rest|mRest|note|chord)\b/.test(cls)) return;

        const modelId = resolveItemId(noteHit);
        if (!modelId) return;
        if (e.shiftKey && applyItemRange(modelId)) {
          selectionSourceRef.current = 'user';
          e.stopPropagation();
          return;
        }
        useEditorStore.getState().toggleSelection(modelId, e.shiftKey);
        selectionSourceRef.current = 'user';
        syncCursorToClick(modelId);
        e.stopPropagation();
        return;
      }

      // Selection mode — fall back to geometric staff hit ONLY when the
      // click lands within the staff's own band (top↔bottom of the 5 staff
      // lines). Clicks above / below the staff in the white margin between
      // staves used to slam-select the nearest one, which made it impossible
      // to deselect by clicking empty paper. Now those clicks fall through
      // to clearSelection().
      if (!noteHit && !staffHit) {
        const m = findMeasureAtPoint(measuresRef.current, e.clientX, e.clientY);
        if (m && m.staves.length > 0) {
          for (const s of m.staves) {
            if (e.clientY >= s.topY && e.clientY <= s.bottomY) {
              staffHit = s.el;
              break;
            }
          }
        }
      }

      const hit = noteHit ?? staffHit;
      if (hit) {
        const modelId = noteHit
          ? (resolveItemId(noteHit) ?? (hit as SVGGElement).id)
          : (veroviToModelRef.current.get((hit as SVGGElement).id) ?? (hit as SVGGElement).id);

        // Shift+click on an item — range fill across the part.
        if (e.shiftKey && noteHit && applyItemRange(modelId)) {
          selectionSourceRef.current = 'user';
          e.stopPropagation();
          return;
        }

        // Shift+click on two staves fills a range between them, *but only
        // within the same staff row* — i.e. treble stays in treble, bass
        // stays in bass. We compute each staff's (measure-index, staff-index-
        // within-measure) and only include staves at the same staff-index.
        if (e.shiftKey && staffHit === hit && !noteHit) {
          const state = useEditorStore.getState();
          const currentStaves = [...state.selectedIds].filter((id) => {
            const g = svg.getElementById(id);
            return g && /\bstaff\b/.test(g.getAttribute('class') ?? '');
          });
          if (currentStaves.length > 0) {
            const allMeasures = Array.from(svg.querySelectorAll('g.measure')) as SVGGElement[];

            const positionOf = (id: string) => {
              const s = svg.getElementById(id);
              if (!s) return null;
              const m = s.closest('g.measure') as SVGGElement | null;
              if (!m) return null;
              const staves = Array.from(m.querySelectorAll(':scope > g.staff')) as SVGGElement[];
              const measureIdx = allMeasures.indexOf(m);
              const staffIdx = staves.indexOf(s as SVGGElement);
              return { measureIdx, staffIdx };
            };

            const anchorPos = positionOf(currentStaves[0]);
            const targetPos = positionOf(modelId);

            if (anchorPos && targetPos) {
              const [mLo, mHi] = anchorPos.measureIdx < targetPos.measureIdx
                ? [anchorPos.measureIdx, targetPos.measureIdx]
                : [targetPos.measureIdx, anchorPos.measureIdx];
              const sameRow = anchorPos.staffIdx === targetPos.staffIdx;
              const [sLo, sHi] = sameRow
                ? [anchorPos.staffIdx, anchorPos.staffIdx]
                : anchorPos.staffIdx < targetPos.staffIdx
                  ? [anchorPos.staffIdx, targetPos.staffIdx]
                  : [targetPos.staffIdx, anchorPos.staffIdx];
              const range = new Set<string>();
              for (let i = mLo; i <= mHi; i++) {
                const stavesInM = Array.from(allMeasures[i].querySelectorAll(':scope > g.staff')) as SVGGElement[];
                for (let s = sLo; s <= sHi; s++) {
                  if (stavesInM[s]?.id) range.add(stavesInM[s].id);
                }
              }
              state.setSelectedIds(range);
              selectionSourceRef.current = 'user';
              e.stopPropagation();
              return;
            }
          }
        }

        useEditorStore.getState().toggleSelection(modelId, e.shiftKey);
        selectionSourceRef.current = 'user';
        syncCursorToClick(modelId);
        e.stopPropagation();
        return;
      }
      useEditorStore.getState().clearSelection();
      selectionSourceRef.current = null;
    };

    svg.addEventListener('click', onSvgClick);
    // Replace any previous listener — we attached new one on the new svg.
    (svg as any)._onClickListener = onSvgClick;

    // Double-click on a chord notehead → select the WHOLE chord (main pitch
    // + every chord-note composite id). Single click selects just the
    // individual head, so this gives a quick "select all of this chord"
    // gesture without breaking per-head selection.
    const onSvgDblClick = (e: MouseEvent) => {
      let el = e.target as Element | null;
      while (el && el !== svg) {
        if (el.tagName === 'g') {
          const cls = el.getAttribute('class') ?? '';
          if (/\b(note|chord)\b/.test(cls)) {
            const chord = el.closest('g.chord') as SVGGElement | null;
            // For a bare note (no chord container), nothing to expand — let
            // the single-click selection stand.
            if (!chord) return;
            const baseId = veroviToModelRef.current.get(chord.id);
            if (!baseId) return;
            // Build {main, "main|0", "main|1", ...} for the full chord.
            const ids = new Set<string>([baseId]);
            for (const part of scoreRef.current.parts) {
              for (const m of part.measures) {
                const n = m.notes.find((x) => x.id === baseId && x.type === 'note');
                if (n && n.type === 'note' && n.chordNotes) {
                  n.chordNotes.forEach((_, i) => ids.add(`${baseId}|${i}`));
                }
              }
            }
            useEditorStore.getState().setSelectedIds(ids);
            selectionSourceRef.current = 'user';
            e.preventDefault();
            e.stopPropagation();
            return;
          }
        }
        el = el.parentElement;
      }
    };
    svg.addEventListener('dblclick', onSvgDblClick);
  }, []);

  // Apply data-selected. For notes/rests/chords this tints them blue. For
  // measures we also tint every note + rest inside so the whole bar reads
  // as selected (the bar-level outline comes from the HTML overlay below).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.querySelectorAll('g[data-selected]').forEach((g) => g.removeAttribute('data-selected'));

    selectedIds.forEach((id) => {
      // Whole-measure rest — synthetic id, no SVG element to look up directly.
      if (id.startsWith('mrest|')) {
        const [, pStr, mStr] = id.split('|');
        const partIdx = Number(pStr), measureIdx = Number(mStr);
        const measureEl = svg.querySelectorAll('g.measure')[measureIdx];
        if (!measureEl) return;
        const staffEl = measureEl.querySelectorAll(':scope > g.staff')[partIdx];
        if (!staffEl) return;
        const mrestEl = staffEl.querySelector('g.mRest');
        if (mrestEl) mrestEl.setAttribute('data-selected', 'true');
        return;
      }
      const verovioId = modelToVerovioRef.current.get(id);
      const direct = verovioId ? svg.getElementById(verovioId) : svg.getElementById(id);
      if (!direct) return;
      direct.setAttribute('data-selected', 'true');
      // Selecting a staff cascades to every notation-bearing element inside
      // the bar. We use a generic class-name filter so newly added notation
      // types (fermata, articulation marks, ornaments, dynamics, …) light
      // up automatically without having to extend a hardcoded list.
      // Span elements (tie / slur / slide / gliss) are NOT cascaded here —
      // they live as siblings of g.staff inside g.measure and would also
      // catch the OTHER staff's spans; the second pass below handles them
      // via data-startid / data-endid attributes.
      if (/\bstaff\b/.test(direct.getAttribute('class') ?? '')) {
        const NOTATION_KEYS = /\b(note|rest|chord|mRest|artic|fermata|dynam|dir|tempo|harm|text|fing|trill|mordent|turn|arpeggio|tuplet|beam|stem|notehead|accid|dot|flag|ornament|bend|breath|caesura|gliss|slide|pedal|octave|lyrics|verse)\b/;
        const SPAN_KEYS = /\b(tie|slur)\b/;
        direct.querySelectorAll('g').forEach((g) => {
          const cls = g.getAttribute('class') ?? '';
          if (SPAN_KEYS.test(cls)) return;
          if (NOTATION_KEYS.test(cls)) g.setAttribute('data-selected', 'true');
        });
      }
    });

    // Second pass: for every note now marked data-selected (whether directly
    // or via staff cascade), highlight any tie / slur whose @startid or
    // @endid references it. Ties live at measure level in Verovio's SVG —
    // outside g.staff — so a per-note query must scan globally.
    // Verovio versions differ in how they expose the link: some output
    // `data-startid="#noteid"`, some `data-startid="noteid"`, some emit a
    // geometric proximity test instead. We try the attribute first; if no
    // tie matches, fall back to bounding-box proximity (a tie whose path
    // endpoints sit close to the selected notehead is considered linked).
    const selectedNoteEls = Array.from(
      svg.querySelectorAll('g.note[data-selected="true"], g.chord[data-selected="true"]'),
    ) as SVGGElement[];
    if (selectedNoteEls.length > 0) {
      const selectedIdSet = new Set<string>();
      selectedNoteEls.forEach((g) => {
        if (g.id) { selectedIdSet.add(g.id); selectedIdSet.add(`#${g.id}`); }
      });
      const noteCenters = selectedNoteEls.map((g) => {
        const r = g.getBoundingClientRect();
        return { cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2 };
      });

      svg.querySelectorAll('g.tie, g.slur, g.slide, g.gliss').forEach((tie) => {
        let linked = false;
        // Attribute-based link.
        for (const attr of ['data-startid', 'data-endid', 'startid', 'endid']) {
          const v = tie.getAttribute(attr);
          if (v && selectedIdSet.has(v)) { linked = true; break; }
        }
        // Geometric fallback — does the tie's bbox sit between (or touch)
        // any selected notehead?
        if (!linked) {
          const r = (tie as SVGGElement).getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
            const PAD = 18;
            for (const nc of noteCenters) {
              const inX = nc.cx >= r.left - PAD && nc.cx <= r.right + PAD;
              const inY = nc.cy >= r.top - PAD && nc.cy <= r.bottom + PAD;
              if (inX && inY) { linked = true; break; }
            }
          }
        }
        if (linked) tie.setAttribute('data-selected', 'true');
      });
    }

    // Custom ties (path.custom-tie) — attrs carry model note ids directly,
    // so we match on selection (note id OR composite key starting with it,
    // OR the synthetic "tie|startId|endId|pitch" key for direct click on
    // the arc).
    svg.querySelectorAll('path.custom-tie').forEach((tie) => {
      const s = tie.getAttribute('data-tie-start');
      const e = tie.getAttribute('data-tie-end');
      const p = tie.getAttribute('data-tie-pitch');
      const isNoteSelected = (id: string | null): boolean => {
        if (!id) return false;
        // Direct id, composite chord-note "id|N", or staff cascade (its
        // verovio note got data-selected).
        if (selectedIds.has(id)) return true;
        for (const sel of selectedIds) {
          if (sel.startsWith(`${id}|`)) return true;
        }
        const vId = modelToVerovioRef.current.get(id);
        if (vId) {
          const el = svg.getElementById(vId);
          if (el && el.getAttribute('data-selected') === 'true') return true;
        }
        return false;
      };
      const tieKey = s && e && p ? `tie|${s}|${e}|${p}` : null;
      const tieSelected = tieKey ? selectedIds.has(tieKey) : false;
      if (tieSelected || isNoteSelected(s) || isNoteSelected(e)) {
        tie.setAttribute('data-selected', 'true');
      } else {
        tie.removeAttribute('data-selected');
      }
    });

    // Custom slurs (path.custom-slur) — same rule as ties: highlight when
    // either endpoint note is selected, OR when the slur itself is
    // explicitly selected via the synthetic id "slur|startId|endId".
    svg.querySelectorAll('path.custom-slur').forEach((slur) => {
      const s = slur.getAttribute('data-slur-start');
      const e = slur.getAttribute('data-slur-end');
      const isNoteSelected = (id: string | null): boolean => {
        if (!id) return false;
        if (selectedIds.has(id)) return true;
        for (const sel of selectedIds) {
          if (sel.startsWith(`${id}|`)) return true;
        }
        const vId = modelToVerovioRef.current.get(id);
        if (vId) {
          const el = svg.getElementById(vId);
          if (el && el.getAttribute('data-selected') === 'true') return true;
        }
        return false;
      };
      const slurKey = s && e ? `slur|${s}|${e}` : null;
      const slurSelected = slurKey ? selectedIds.has(slurKey) : false;
      if (slurSelected || isNoteSelected(s) || isNoteSelected(e)) {
        slur.setAttribute('data-selected', 'true');
      } else {
        slur.removeAttribute('data-selected');
      }
    });
  }, [selectedIds, deferredXml, svgRenderTick]);

  // ── Custom ties: draw our own flat-dome curves over Verovio's wide arcs ──
  // Verovio's tie path drops far below/above the noteheads — a deep "bowl"
  // shape. MuseScore (and standard engraving) uses a tight shallow dome that
  // attaches near the outer edges of the noteheads. We compute pairs from
  // the model (note.tieStart → next note in same part, skipping rests) and
  // append our own <path> elements on top. Verovio's <g class="tie"> is
  // hidden in globals.css.
  const renderCustomTies = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;

    // SVG ↔ client coord conversion (Verovio uses viewBox).
    const ctm = svg.getScreenCTM?.();
    if (!ctm) return;
    const inv = ctm.inverse();
    const toSvg = (clientX: number, clientY: number) => {
      const pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      return pt.matrixTransform(inv);
    };

    // In-place update: reuse existing path elements by tie-key
    // (`startId|endId`) and only update their `d` attribute. This avoids the
    // delete-and-recreate flicker that made ties "jump" between keystrokes.
    const existing = new Map<string, SVGPathElement>();
    svg.querySelectorAll('path.custom-tie').forEach((p) => {
      const s = p.getAttribute('data-tie-start');
      const e = p.getAttribute('data-tie-end');
      if (s && e) existing.set(`${s}|${e}`, p as SVGPathElement);
    });
    const keepKeys = new Set<string>();

    // Helper: bbox of the notehead at a specific pitch inside a chord. For
    // single notes the fallback rect is just the note element's bbox. For
    // chords we sort inner g.note rects by Y (top→bottom) and match against
    // pitches sorted high→low — Verovio renders top notehead = highest pitch.
    const bboxForPitch = (
      rawEl: SVGGElement,
      chord: SVGGElement | null,
      pitches: number[],
      midi: number,
    ): DOMRect | null => {
      if (!chord) {
        return pitches[0] === midi ? rawEl.getBoundingClientRect() : null;
      }
      const heads = Array.from(chord.querySelectorAll('g.note')) as SVGGElement[];
      const rects = heads.map((h) => h.getBoundingClientRect())
                         .filter((r) => r.width > 0)
                         .sort((a, b) => a.top - b.top); // top→bottom
      const sortedDesc = pitches.slice().sort((a, b) => b - a); // high→low
      const idx = sortedDesc.indexOf(midi);
      if (idx < 0 || idx >= rects.length) return null;
      return rects[idx];
    };

    // Walk each part linearly; a tie chains tieStart→next note (rests pass
    // through so auto-pad rests don't break the connection).
    for (const part of scoreRef.current.parts) {
      let pending: { noteId: string; pitches: number[] } | null = null;
      for (const measure of part.measures) {
        for (const item of measure.notes) {
          if (item.type !== 'note') continue;
          const itemPitches = [item.pitch.midi, ...(item.chordNotes ?? []).map((p) => p.midi)];

          // Engraving rule: a tie connects same-pitch notes only. If a
          // chord shares NO pitches with the previous tieStart chord, the
          // tie is broken (model flag stays — removing the intruder note
          // restores the ties automatically).
          let matched: number[] = [];
          if (pending) {
            matched = itemPitches.filter((m) => pending!.pitches.includes(m));
          }

          if (pending && matched.length > 0) {
            const startVId = modelToVerovioRef.current.get(pending.noteId);
            const endVId   = modelToVerovioRef.current.get(item.id);
            if (startVId && endVId) {
              const rawStart = svg.getElementById(startVId) as SVGGElement | null;
              const rawEnd   = svg.getElementById(endVId)   as SVGGElement | null;
              if (rawStart && rawEnd) {
                const startChord = rawStart.closest('g.chord') as SVGGElement | null;
                const endChord   = rawEnd.closest('g.chord')   as SVGGElement | null;

                // Read stem direction from the chord (or single note).
                const stemEl = (startChord ?? rawStart).querySelector('g.stem') as SVGGElement | null;
                let stemUp = true;  // default for low notes
                if (stemEl) {
                  const stemR = stemEl.getBoundingClientRect();
                  const refR  = (startChord ?? rawStart).getBoundingClientRect();
                  const headCenter = (refR.top + refR.bottom) / 2;
                  const stemCenter = (stemR.top + stemR.bottom) / 2;
                  stemUp = stemCenter < headCenter;
                } else {
                  stemUp = item.pitch.midi < 71;
                }

                const minP = Math.min(...pending.pitches);
                const maxP = Math.max(...pending.pitches);

                // Draw a tie per matched pitch. Placement:
                //   • highest pitch    → above
                //   • lowest pitch     → below
                //   • middle pitches   → below if stem-up, above if stem-down
                for (const midi of matched) {
                  const sr = bboxForPitch(rawStart, startChord, pending.pitches, midi);
                  const er = bboxForPitch(rawEnd, endChord, itemPitches, midi);
                  if (!sr || !er || sr.width <= 0 || er.width <= 0) continue;

                  let above: boolean;
                  if (midi === maxP) above = true;
                  else if (midi === minP) above = false;
                  else above = !stemUp;   // middle voice

                  const noteH = sr.bottom - sr.top;
                  const attachOffsetClientY = noteH * 0.02;
                  const startClientY = above
                    ? sr.top    - attachOffsetClientY
                    : sr.bottom + attachOffsetClientY;
                  const endClientY = above
                    ? er.top    - attachOffsetClientY
                    : er.bottom + attachOffsetClientY;
                  const startClientX = sr.right - sr.width * 0.15;
                  const endClientX   = er.left  + er.width  * 0.15;
                  const dx = Math.max(1, endClientX - startClientX);
                  // Depth scales with span width. Floor (noteH * 0.15)
                  // keeps tiny same-beat ties from collapsing to a line;
                  // ceiling (noteH * 0.7) caps very long ties from
                  // ballooning. Short ties stay shallow — they shouldn't
                  // look as deep as long ones.
                  const depth = Math.min(
                    noteH * 0.7,
                    Math.max(noteH * 0.15, dx * 0.05),
                  );
                  const peakClientY = above
                    ? Math.min(startClientY, endClientY) - depth
                    : Math.max(startClientY, endClientY) + depth;

                  const a = toSvg(startClientX, startClientY);
                  const b = toSvg(endClientX,   endClientY);
                  const peakSvg = toSvg(startClientX, peakClientY);
                  const totalDx = b.x - a.x;
                  // 20 / 80 split (was 30 / 70) — control points closer to
                  // mid-span makes the cubic Bézier round through the peak
                  // instead of holding it as a long flat top.
                  const cp1x = a.x + totalDx * 0.2;
                  const cp2x = a.x + totalDx * 0.8;

                  const scale = ctm.a || 1;
                  const noteH_user = noteH / scale;
                  // Tie thickness — engravers draw ties as a delicate
                  // line that thickens slightly at the midpoint. Pulled
                  // further down (was 0.18 / 0.13) for a finer crescent.
                  const thickness = Math.max(
                    noteH_user * 0.12,
                    noteH_user * 0.08 + (b.x - a.x) * 0.0017,
                  );
                  const outerPeakY = above ? peakSvg.y - thickness / 2 : peakSvg.y + thickness / 2;
                  const innerPeakY = above ? peakSvg.y + thickness / 2 : peakSvg.y - thickness / 2;

                  const d =
                    `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} ` +
                    `C ${cp1x.toFixed(2)} ${outerPeakY.toFixed(2)}, ${cp2x.toFixed(2)} ${outerPeakY.toFixed(2)}, ${b.x.toFixed(2)} ${b.y.toFixed(2)} ` +
                    `C ${cp2x.toFixed(2)} ${innerPeakY.toFixed(2)}, ${cp1x.toFixed(2)} ${innerPeakY.toFixed(2)}, ${a.x.toFixed(2)} ${a.y.toFixed(2)} Z`;
                  const key = `${pending.noteId}|${item.id}|${midi}`;
                  keepKeys.add(key);
                  let path = existing.get(key);
                  if (path) {
                    path.setAttribute('d', d);
                  } else {
                    path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    path.setAttribute('d', d);
                    // Allow pointer events so the tie can be clicked to
                    // select it independently (synthetic id "tie|s|e|p").
                    path.setAttribute('style', 'fill: #000; stroke: none; cursor: pointer;');
                    path.classList.add('custom-tie');
                    path.setAttribute('data-tie-start', pending.noteId);
                    path.setAttribute('data-tie-end', item.id);
                    path.setAttribute('data-tie-pitch', String(midi));
                    svg.appendChild(path);
                  }
                }
              }
            }
          }
          pending = item.tieStart ? { noteId: item.id, pitches: itemPitches } : null;
        }
      }
    }
    // Remove only paths that no longer correspond to any model tie — leaves
    // the rest unchanged so the DOM identity is stable across renders.
    existing.forEach((p, key) => { if (!keepKeys.has(key)) p.remove(); });
  }, []);

  // ── Custom slurs: flat-dome arc instead of Verovio's wide bowl ────────────
  //
  // Same idea as renderCustomTies but a SINGLE slur spans many notes (not
  // just same-pitch pairs). We walk each part linearly; when we hit a
  // note with slurStart we remember it. When we later hit a note with
  // slurEnd in the same part we draw ONE arc from the start note's
  // attach-point to the end note's attach-point. The arc clears the
  // intermediate notes by computing a peak Y that sits above the highest
  // (or below the lowest) notehead in the span.
  //
  // Verovio's <g class="slur"> is hidden in globals.css so only our path
  // shows. Path carries data-slur-start / data-slur-end so the selection
  // effect can tint it.
  const renderCustomSlurs = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const ctm = svg.getScreenCTM?.();
    if (!ctm) return;
    const inv = ctm.inverse();
    const toSvg = (clientX: number, clientY: number) => {
      const pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      return pt.matrixTransform(inv);
    };

    // In-place update by `startId|endId` key — avoid delete+recreate flicker.
    const existing = new Map<string, SVGPathElement>();
    svg.querySelectorAll('path.custom-slur').forEach((p) => {
      const s = p.getAttribute('data-slur-start');
      const e = p.getAttribute('data-slur-end');
      if (s && e) existing.set(`${s}|${e}`, p as SVGPathElement);
    });
    const keepKeys = new Set<string>();

    // SVG-element bbox for a model note id. Returns:
    //   • rect       — bbox of the notehead (or chord container)
    //   • stemUp     — whether the stem points up
    //   • stemTipY   — clientY of the stem's far end (the tip — the point
    //                  AWAY from the notehead). Used when a slur attaches
    //                  on the same side as the stem: engraving rule says
    //                  the slur's endpoint sits at the stem tip, not at
    //                  the notehead. When there's no stem (whole note),
    //                  stemTipY falls back to the notehead's far edge.
    const bboxFor = (modelId: string): { rect: DOMRect; stemUp: boolean; stemTipY: number } | null => {
      const vId = modelToVerovioRef.current.get(modelId);
      if (!vId) return null;
      const el = svg.getElementById(vId) as SVGGElement | null;
      if (!el) return null;
      const chord = el.closest('g.chord') as SVGGElement | null;
      const refEl = (chord ?? el) as SVGGElement;
      const r = refEl.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return null;
      const stemEl = refEl.querySelector('g.stem') as SVGGElement | null;
      let stemUp = true;
      let stemTipY = r.top;
      if (stemEl) {
        const stemR = stemEl.getBoundingClientRect();
        const headCenter = (r.top + r.bottom) / 2;
        const stemCenter = (stemR.top + stemR.bottom) / 2;
        stemUp = stemCenter < headCenter;
        // Stem tip = the END of the stem furthest from the notehead.
        // For stem-up: tip is at the TOP of the stem rect.
        // For stem-down: tip is at the BOTTOM.
        stemTipY = stemUp ? stemR.top : stemR.bottom;
      } else {
        // Whole note / no stem — attach point is just the notehead's
        // far edge on the slur's side; we'll resolve "side" later.
        stemTipY = r.top;
      }
      return { rect: r, stemUp, stemTipY };
    };

    for (const part of scoreRef.current.parts) {
      // Linear walk per part — slur can cross barlines.
      let pending: { id: string; idx: number } | null = null;
      let absIdx = 0;
      const flat: Array<{ id: string; note: Note }> = [];
      for (const m of part.measures) {
        for (const n of m.notes) {
          if (n.type === 'note') flat.push({ id: n.id, note: n });
        }
      }
      for (let i = 0; i < flat.length; i++) {
        const { id, note } = flat[i];
        if (note.slurStart && !pending) pending = { id, idx: i };
        if (pending && note.slurEnd && i > pending.idx) {
          const startBox = bboxFor(pending.id);
          const endBox = bboxFor(id);
          if (startBox && endBox) {
            // Decide above vs below: opposite of average stem direction.
            // If most notes in span are stem-up → slur goes BELOW; else
            // ABOVE. This matches engraving convention.
            let stemUpCount = 0;
            for (let k = pending.idx; k <= i; k++) {
              const b = bboxFor(flat[k].id);
              if (b?.stemUp) stemUpCount++;
            }
            const above = stemUpCount <= (i - pending.idx) / 2;

            // Find the extreme Y across all notes in the span — the arc
            // peak has to clear them. Use clientY from each note's bbox.
            let extremeY = above ? Infinity : -Infinity;
            for (let k = pending.idx; k <= i; k++) {
              const b = bboxFor(flat[k].id);
              if (!b) continue;
              const y = above ? b.rect.top : b.rect.bottom;
              if (above ? y < extremeY : y > extremeY) extremeY = y;
            }
            if (!isFinite(extremeY)) {
              extremeY = above ? startBox.rect.top : startBox.rect.bottom;
            }

            const sr = startBox.rect;
            const er = endBox.rect;
            const noteH = sr.bottom - sr.top;

            // ── Endpoint Y rule ──
            // Same-side as stem  → attach at STEM TIP (far end of stem)
            // Opposite of stem   → attach at NOTEHEAD outer edge
            // No stem (whole)    → attach at notehead outer edge
            //
            // This is the engraving rule the user asked for: "должен
            // заканчиваться на штиле, а не на середине штиля". When the
            // slur sits above and the stem is up, the endpoint sits at
            // the stem's top tip — not on the notehead, not on the
            // mid-stem.
            const attachY = (
              box: { rect: DOMRect; stemUp: boolean; stemTipY: number },
            ): number => {
              const sameSide = above ? box.stemUp : !box.stemUp;
              if (sameSide) {
                // At the stem tip. Push outward by a hair so the curve
                // doesn't visually touch the stem's terminal pixel.
                return above
                  ? box.stemTipY - noteH * 0.05
                  : box.stemTipY + noteH * 0.05;
              }
              // Opposite side — attach at the notehead's far edge.
              const r = box.rect;
              return above
                ? r.top - noteH * 0.15
                : r.bottom + noteH * 0.15;
            };

            const startClientX = sr.left + sr.width * 0.5;
            const endClientX = er.left + er.width * 0.5;
            const startClientY = attachY(startBox);
            const endClientY = attachY(endBox);

            // ── Peak Y (symmetric, width-proportional) ──
            // SYMMETRY: peak X is the midpoint of the span. Peak Y rises
            // by `dome` above (or below) the endpoint-average Y.
            // ROUNDNESS: depth scales with span width — SHORT slurs stay
            // shallow, long slurs arch higher. A hard floor (noteH * 0.2)
            // keeps very tiny spans visible without making them puffy.
            // A ceiling (noteH * 1.6) prevents monster arches on very
            // long phrases.
            const dx = Math.abs(endClientX - startClientX);
            const dome = Math.min(
              noteH * 1.6,
              Math.max(noteH * 0.2, dx * 0.13),
            );
            const avgEndpointY = (startClientY + endClientY) / 2;
            // Make sure the peak still clears the highest/lowest note in
            // the span — for very tall ranges the extreme matters more
            // than the endpoint average.
            const clearanceFromExtreme = above
              ? extremeY - noteH * 0.55
              : extremeY + noteH * 0.55;
            const peakClientY = above
              ? Math.min(avgEndpointY - dome, clearanceFromExtreme)
              : Math.max(avgEndpointY + dome, clearanceFromExtreme);

            const a = toSvg(startClientX, startClientY);
            const b = toSvg(endClientX, endClientY);
            const peakSvg = toSvg((startClientX + endClientX) / 2, peakClientY);
            const totalDx = b.x - a.x;
            // SYMMETRY: control points at 25 / 75 mirror around the
            // midpoint, giving a perfectly symmetric Bézier.
            const cp1x = a.x + totalDx * 0.25;
            const cp2x = a.x + totalDx * 0.75;

            const scale = ctm.a || 1;
            const noteH_user = noteH / scale;
            // Slurs slightly thinner than ties even at peak — the curve
            // is longer so it'd read heavier at the same line weight.
            const thickness = Math.max(
              noteH_user * 0.11,
              noteH_user * 0.075 + Math.abs(b.x - a.x) * 0.0017,
            );
            const outerPeakY = above
              ? peakSvg.y - thickness / 2
              : peakSvg.y + thickness / 2;
            const innerPeakY = above
              ? peakSvg.y + thickness / 2
              : peakSvg.y - thickness / 2;

            const d =
              `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} ` +
              `C ${cp1x.toFixed(2)} ${outerPeakY.toFixed(2)}, ${cp2x.toFixed(2)} ${outerPeakY.toFixed(2)}, ${b.x.toFixed(2)} ${b.y.toFixed(2)} ` +
              `C ${cp2x.toFixed(2)} ${innerPeakY.toFixed(2)}, ${cp1x.toFixed(2)} ${innerPeakY.toFixed(2)}, ${a.x.toFixed(2)} ${a.y.toFixed(2)} Z`;
            const key = `${pending.id}|${id}`;
            keepKeys.add(key);
            let path = existing.get(key);
            if (path) {
              path.setAttribute('d', d);
            } else {
              path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
              path.setAttribute('d', d);
              path.setAttribute('style', 'fill: #000; stroke: none; cursor: pointer;');
              path.classList.add('custom-slur');
              path.setAttribute('data-slur-start', pending.id);
              path.setAttribute('data-slur-end', id);
              svg.appendChild(path);
            }
          }
          pending = null;
        }
        absIdx++;
      }
    }
    existing.forEach((p, key) => { if (!keepKeys.has(key)) p.remove(); });
  }, []);

  // Run synchronously after every Verovio render (svgRenderTick is bumped at
  // the end of onSvgRendered). We also invoke renderCustomTies INSIDE
  // onSvgRendered for the no-paint-flicker path; this effect is the safety
  // net for cases the inline call doesn't cover (e.g. selection re-renders).
  useEffect(() => {
    renderCustomTies();
    renderCustomSlurs();
  }, [svgRenderTick, renderCustomTies, renderCustomSlurs]);

  // ── Ghost preview via Verovio: mouse → spec → MusicXML → engraved note. ──

  const onScoreMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Pan in progress?
    const ps = panStartRef.current;
    if (ps) {
      const el = scoreScrollRef.current;
      if (el) {
        el.scrollLeft = ps.left - (e.clientX - ps.x);
        el.scrollTop  = ps.top  - (e.clientY - ps.y);
      }
      return;
    }

    // Track where the mouse is — used by the Space-release handler to
    // resume the ghost preview at the right spot once pan ends.
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };

    // In normal mode, also drive marquee selection if dragging.
    if (marqueeStartRef.current) onScoreMouseDrag(e);

    if (mode !== 'note-input') {
      if (ghostSpec) setGhostSpec(null);
      if (cursorGhostPos) setCursorGhostPos(null);
      return;
    }
    // While Space is held the user is panning, not editing — kill the
    // ghost preview so the grab cursor reads cleanly and the ghost-note
    // doesn't visually compete with the canvas drag. Read through the
    // REF (not the React state) so the synthetic mousemove dispatched on
    // Space-release sees the up-to-date value.
    if (isSpaceHeldRef.current) {
      if (ghostSpec) setGhostSpec(null);
      if (cursorGhostPos) setCursorGhostPos(null);
      return;
    }

    const svg = svgRef.current;
    const measures = measuresRef.current;
    if (!svg || measures.length === 0) {
      if (ghostSpec) setGhostSpec(null);
      if (cursorGhostPos) setCursorGhostPos(null);
      return;
    }

    const cx = e.clientX, cy = e.clientY;

    // Measure stickiness — stay in the previous measure as long as X is in its
    // range AND Y is within a generous vertical buffer. Without this, when the
    // mouse goes below the bass on a low ghost note, findMeasureAtPoint can
    // flip to the next system's measure, sending the ghost across the score.
    const prevPitchSnap = prevPitchSnapRef.current;
    let measure: ReturnType<typeof findMeasureAtPoint> = null;
    if (prevPitchSnap) {
      const prevStaffInfo = staffMapRef.current.get(prevPitchSnap.staffElId);
      const prevMeasure = prevStaffInfo ? measures[prevStaffInfo.measureIdx] ?? null : null;
      if (prevMeasure && prevMeasure.staves.length > 0) {
        const sp = prevMeasure.staves[0].lineSpacing;
        const yBuffer = sp * 10;            // ~10 ledger lines of slack
        if (cx >= prevMeasure.leftX && cx <= prevMeasure.rightX &&
            cy >= prevMeasure.topY - yBuffer && cy <= prevMeasure.bottomY + yBuffer) {
          measure = prevMeasure;
        }
      }
    }
    if (!measure) measure = findMeasureAtPoint(measures, cx, cy);
    if (!measure || measure.staves.length === 0) {
      if (ghostSpec) setGhostSpec(null);
      if (cursorGhostPos) setCursorGhostPos(null);
      return;
    }

    // Staff stickiness within the chosen measure — bonus to the previously
    // active staff so a tiny mouse move past the midpoint doesn't flip
    // treble ↔ bass.
    let staffIdx = 0;
    let bestScore = -Infinity;
    const STAFF_HYST_PX = (measure.staves[0]?.lineSpacing ?? 12) * 3;
    for (let i = 0; i < measure.staves.length; i++) {
      const s = measure.staves[i];
      const center = (s.topY + s.bottomY) / 2;
      let score = -Math.abs(cy - center);
      if (prevPitchSnap && (s.el as SVGGElement).id === prevPitchSnap.staffElId) {
        score += STAFF_HYST_PX;
      }
      if (score > bestScore) { bestScore = score; staffIdx = i; }
    }
    const staff = measure.staves[staffIdx];

    // Pitch hysteresis with reflow compensation: if the staff shifted between
    // frames (Verovio added ledger lines for a low ghost → whole stave moved
    // up a few px), slide the anchor mouseY by the same delta. That way the
    // hysteresis zone follows the staff, and the cursor's relative position
    // to the chosen pitch stays stable — no feedback dance.
    const staffElId = (staff.el as SVGGElement).id ?? '';
    const halfStepPx = staff.lineSpacing / 2;
    const PITCH_HYST_PX = halfStepPx * 0.6;
    const prevSnap = prevPitchSnapRef.current;
    const sameStaff = !!prevSnap && prevSnap.staffElId === staffElId;
    const anchorMouseY = sameStaff
      ? prevSnap!.mouseY + (staff.topY - prevSnap!.staffTopY)  // compensate staff drift
      : 0;
    const stickPrev = sameStaff && Math.abs(cy - anchorMouseY) < PITCH_HYST_PX;
    const ySnap = snapYToStaff(staff, staffIdx, cy, stickPrev ? prevSnap!.stepIndex : undefined);
    // Anchor updates: when step changes → reset anchor to current (cy, topY).
    // When step stays the same → just refresh staffTopY so the next frame can
    // compensate further drift. mouseY stays put (otherwise sticky behavior
    // erodes frame by frame).
    if (!prevSnap || prevSnap.staffElId !== staffElId || prevSnap.stepIndex !== ySnap.stepIndex) {
      prevPitchSnapRef.current = { staffElId, stepIndex: ySnap.stepIndex, mouseY: cy, staffTopY: staff.topY };
    } else {
      prevSnap.mouseY = anchorMouseY;
      prevSnap.staffTopY = staff.topY;
    }
    const measureBeats = beatsPerMeasure(score.metadata.timeSig);
    const noteBeats = durationBeats({ base: activeDuration, dots: activeDots });
    // RULE:
    //   • Empty measure (first note) → valid beats are the WHOLE beats
    //     (1, 2, 3, 4 in 4/4). User can pick the rhythmic anchor.
    //   • Non-empty measure → valid beats are the natural-duration grid
    //     positions (0, noteBeats, 2*noteBeats, …) that fall inside an
    //     existing rest. Notes never displace other notes; new notes only
    //     land in rest space.
    const measureModel = scoreRef.current.parts[staffIdx]?.measures[measure.measureIndex];
    const isEmpty = !measureModel || measureModel.notes.length === 0;
    const validBeats: number[] = [];
    if (isEmpty) {
      for (let b = 0; b + noteBeats <= measureBeats + 0.001; b += 1) {
        validBeats.push(b);
      }
    } else {
      const restRanges: Array<[number, number]> = [];
      let beat = 0;
      for (const item of measureModel.notes) {
        const ib = durationBeats(item.duration);
        if (item.type === 'rest') restRanges.push([beat, beat + ib]);
        beat += ib;
      }
      for (let b = 0; b + noteBeats <= measureBeats + 0.001; b += noteBeats) {
        if (restRanges.some(([s, e]) => b >= s - 0.001 && b + noteBeats <= e + 0.001)) {
          validBeats.push(b);
        }
      }
    }
    if (validBeats.length === 0) {
      // No room for this duration anywhere in the measure.
      if (ghostSpec) setGhostSpec(null);
      if (cursorGhostPos) setCursorGhostPos(null);
      return;
    }

    // Convert cursor X to a beat in [0, measureBeats] and pick the nearest
    // valid beat. STICKY SNAP: if the previous frame chose a slot in this
    // measure, give that slot a 40% slot-width "moat" — the cursor has to
    // move past that buffer before we'll consider a different beat. Keeps
    // the ghost from flickering between adjacent slots when the cursor
    // hovers near a boundary, which is the #1 complaint about precision
    // input. The moat shrinks for tiny slot widths so it never traps the
    // user — a real cursor move always wins.
    const totalWidth = measure.rightX - measure.leftX;
    const leftSkip = measure.measureIndex === 0 ? totalWidth * 0.15 : totalWidth * 0.03;
    const rightSkip = totalWidth * 0.03;
    const usableLeftX = measure.leftX + leftSkip;
    const usableRightX = measure.rightX - rightSkip;
    const usableWidth = Math.max(1, usableRightX - usableLeftX);
    const cursorBeat = Math.max(0, Math.min(measureBeats, ((cx - usableLeftX) / usableWidth) * measureBeats));
    let snappedBeat = validBeats[0];
    let minDist = Infinity;
    for (const vb of validBeats) {
      const d = Math.abs(cursorBeat - vb);
      if (d < minDist) { minDist = d; snappedBeat = vb; }
    }

    // Slot encoding for commit: slotsTotal = ms-beats so commit beat
    // recovers snappedBeat with no rounding error.
    const slotsInMeasure = 10000;

    // Apply X-snap hysteresis: stay on previous beat unless the cursor
    // crossed half-way to a different valid beat. (Name avoids `prevSnap`
    // which is already used above for the Y-axis pitch hysteresis.)
    const slotSpacing = validBeats.length > 1
      ? Math.abs(validBeats[1] - validBeats[0])
      : measureBeats;
    const stickyMoat = slotSpacing * 0.4;
    const prevSlotSnap = prevSlotSnapRef.current;
    if (prevSlotSnap && prevSlotSnap.measureIdx === measure.measureIndex) {
      const prevBeat = (prevSlotSnap.slotIndex / slotsInMeasure) * measureBeats;
      // Is the previous beat still a valid slot AND closer than the
      // sticky threshold? Then keep it.
      if (validBeats.some((vb) => Math.abs(vb - prevBeat) < 0.0001)
          && Math.abs(cursorBeat - prevBeat) < stickyMoat) {
        snappedBeat = prevBeat;
      }
    }

    const xSnap = { slotIndex: Math.round(snappedBeat / measureBeats * slotsInMeasure) };
    prevSlotSnapRef.current = { measureIdx: measure.measureIndex, slotIndex: xSnap.slotIndex };

    const alter = pendingAlter !== 0 ? pendingAlter : 0;
    // ySnap.pitch comes back as { step, octave } from the staff-geometry
    // helpers. We convert to the music-model Pitch shape ({ midi, alter })
    // that scoreToMusicXml expects, so Verovio gets a real note.
    const ghostMidi = stepOctaveToMidi(
      (ySnap.pitch as unknown as { step: string }).step,
      (ySnap.pitch as unknown as { octave: number }).octave,
      alter,
    );
    const next: GhostSpec = {
      partIndex: staffIdx,
      measureIndex: measure.measureIndex,
      slotIndex: xSnap.slotIndex,
      slotsTotal: slotsInMeasure,
      pitch: { midi: ghostMidi, alter },
      base: activeDuration,
      dots: activeDots,
    };
    // Only update state when the resolved spec actually changes — avoids
    // re-renders while the mouse stays inside a single slot.
    setGhostSpec(prev => {
      if (prev &&
          prev.partIndex === next.partIndex &&
          prev.measureIndex === next.measureIndex &&
          prev.slotIndex === next.slotIndex &&
          prev.pitch.midi === next.pitch.midi &&
          prev.pitch.alter === next.pitch.alter &&
          prev.base === next.base &&
          prev.dots === next.dots) return prev;
      return next;
    });

    // Visual ghost lives on the snapped beat (not the raw cursor X) so it
    // jumps cleanly between valid positions — "плясать не будет".
    const scrollEl = scoreScrollRef.current;
    if (scrollEl) {
      const cRect = scrollEl.getBoundingClientRect();
      const snappedClientX = usableLeftX + (snappedBeat / measureBeats) * usableWidth;
      const relX = snappedClientX - cRect.left + scrollEl.scrollLeft;
      const relY = ySnap.svgY - cRect.top + scrollEl.scrollTop;
      const staffTopY = staff.topY - cRect.top + scrollEl.scrollTop;
      const staffBottomY = staff.bottomY - cRect.top + scrollEl.scrollTop;
      // 1-indexed beat for the user. snappedBeat is in 0-based quarter-note
      // units (4/4: 0, 1, 2, 3 = beats 1, 2, 3, 4). Adding 1 makes it human.
      const beat = snappedBeat + 1;
      // measureIndex is 0-based; users count from 1.
      const measureNumber = measure.measureIndex + 1;
      setCursorGhostPos((prev) => {
        if (
          prev &&
          Math.abs(prev.relX - relX) < 0.5 &&
          Math.abs(prev.relY - relY) < 0.5 &&
          prev.base === activeDuration &&
          prev.dots === activeDots &&
          Math.abs(prev.beat - beat) < 0.01 &&
          prev.measureNumber === measureNumber
        ) return prev;
        return {
          relX, relY,
          base: activeDuration, dots: activeDots,
          beat, measureNumber,
          staffTopY, staffBottomY,
        };
      });
    }
  }, [mode, pendingAlter, ghostSpec, cursorGhostPos, score.metadata.timeSig, activeDuration, activeDots]);

  const onScoreMouseLeave = useCallback(() => {
    setGhostSpec(null);
    setCursorGhostPos(null);
    // Mouse left the canvas — don't try to resume the ghost here on
    // Space-release; the user would have to wander back in first.
    lastMousePosRef.current = null;
  }, []);

  // HTML overlay rectangles for selected measures, merged into a single box
  // per system: consecutive measures on the same horizontal band become one
  // continuous outline instead of N separate squares.
  const [selectedMeasureBoxes, setSelectedMeasureBoxes] = useState<
    Array<{ left: number; top: number; width: number; height: number }>
  >([]);
  useEffect(() => {
    const svg = svgRef.current;
    const scrollEl = scoreScrollRef.current;

    function recompute() {
      if (!svg) { setSelectedMeasureBoxes([]); return; }
      const container = scoreScrollRef.current;
      if (!container) { setSelectedMeasureBoxes([]); return; }
      // Coordinates expressed inside the scroll container's content box so
      // overlays scroll with the score AND are clipped by the canvas overflow.
      const cRect = container.getBoundingClientRect();
      const sLeft = container.scrollLeft;
      const sTop  = container.scrollTop;

      // Resolve every selected id to a concrete SVG element so we can read its
      // bbox. Handles all forms: UUID, "uuid|N" (chord-note → its own
      // notehead, not the parent's), "mrest|p|m" (synthetic), staff
      // verovio-id.
      const resolveToElement = (id: string): SVGGElement | null => {
        if (id.startsWith('mrest|')) {
          const [, pStr, mStr] = id.split('|');
          const measureEl = svg.querySelectorAll('g.measure')[Number(mStr)];
          if (!measureEl) return null;
          const staffEl = measureEl.querySelectorAll(':scope > g.staff')[Number(pStr)];
          if (!staffEl) return null;
          return staffEl.querySelector('g.mRest') as SVGGElement | null;
        }
        // Try full composite id first (chord-note "uuid|N" has its own entry
        // in modelToVerovio pointing at the inner g.note); fall back to the
        // base id if the composite isn't mapped (e.g. selection of plain
        // notes).
        const bareId = id.split('|')[0];
        const verovioId = modelToVerovioRef.current.get(id)
                       ?? modelToVerovioRef.current.get(bareId);
        if (verovioId) return svg.getElementById(verovioId) as SVGGElement | null;
        return svg.getElementById(id) as SVGGElement | null;
      };

      const systemMap = new Map<Element, { rects: DOMRect[]; hasStaff: boolean }>();
      selectedIds.forEach((id) => {
        const g = resolveToElement(id);
        if (!g) return;
        const r = g.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        const sys = g.closest('g.system') ?? g.closest('g.page-margin') ?? svg;
        const isStaff = /\bstaff\b/.test(g.getAttribute('class') ?? '');
        if (!systemMap.has(sys)) systemMap.set(sys, { rects: [], hasStaff: false });
        const entry = systemMap.get(sys)!;
        entry.rects.push(r);
        if (isStaff) entry.hasStaff = true;
      });

      // Detect range selection: 2+ note ids, all in the same part, AT
      // CONSECUTIVE positions in the model's flat note sequence. A shift+
      // click "fill" gives consecutive items → box; a scattered shift+click
      // multi-select gives non-consecutive → no box.
      const isRange = (() => {
        const noteIds: string[] = [];
        for (const id of selectedIds) {
          if (id.startsWith('mrest|')) continue;
          noteIds.push(id.split('|')[0]);
        }
        const unique = Array.from(new Set(noteIds));
        if (unique.length < 2) return false;
        const flats: Array<Array<string>> = score.parts.map((p) => {
          const out: string[] = [];
          for (const m of p.measures) {
            for (const n of m.notes) out.push(n.id);
          }
          return out;
        });
        // Group by part, then verify consecutiveness within each part.
        // Supports multi-staff marquee selections (treble + bass together).
        const byPart = new Map<number, number[]>();
        for (const nid of unique) {
          let found = false;
          for (let p = 0; p < flats.length; p++) {
            const fi = flats[p].indexOf(nid);
            if (fi >= 0) {
              if (!byPart.has(p)) byPart.set(p, []);
              byPart.get(p)!.push(fi);
              found = true;
              break;
            }
          }
          if (!found) return false;
        }
        for (const [, indices] of byPart) {
          indices.sort((a, b) => a - b);
          for (let i = 1; i < indices.length; i++) {
            if (indices[i] !== indices[i - 1] + 1) return false;
          }
        }
        return true;
      })();

      // Marquee selections ALWAYS get a frame around what the user
      // grabbed — even if the picks aren't contiguous in the model. Single
      // click / Ctrl+click is a pointed selection and skips the frame.
      const isMarquee = selectionSourceRef.current === 'marquee';
      const next: Array<{ left: number; top: number; width: number; height: number }> = [];
      for (const [, { rects, hasStaff }] of systemMap) {
        // Draw a frame for: STAFF/measure selections, contiguous shift+click
        // ranges, and any marquee drag. Skip for single notes and scattered
        // multi-select via click — the blue tint on noteheads is enough.
        if (!hasStaff && !isRange && !isMarquee) continue;
        const left   = Math.min(...rects.map((b) => b.left));
        const top    = Math.min(...rects.map((b) => b.top));
        const right  = Math.max(...rects.map((b) => b.right));
        const bottom = Math.max(...rects.map((b) => b.bottom));
        next.push({
          left: left - cRect.left + sLeft,
          top:  top  - cRect.top  + sTop,
          width:  right - left,
          height: bottom - top,
        });
      }

      setSelectedMeasureBoxes((prev) => {
        if (prev.length === 0 && next.length === 0) return prev;
        if (prev.length === next.length) {
          const same = prev.every((b, i) =>
            b.left === next[i].left && b.top === next[i].top &&
            b.width === next[i].width && b.height === next[i].height,
          );
          if (same) return prev;
        }
        return next;
      });
    }

    recompute();

    // Keep the overlay rectangles in sync with scrolling, panning, zoom and
    // window resizes — `getBoundingClientRect` returns viewport-relative
    // coords that drift the moment the content moves underneath.
    if (scrollEl) {
      scrollEl.addEventListener('scroll', recompute, { passive: true });
    }
    window.addEventListener('resize', recompute);
    return () => {
      if (scrollEl) scrollEl.removeEventListener('scroll', recompute);
      window.removeEventListener('resize', recompute);
    };
  }, [selectedIds, deferredXml, zoom, svgRenderTick]);

  // ── Marquee (box) selection in normal mode ──────────────────────────────
  const marqueeStartRef = useRef<{ x: number; y: number } | null>(null);
  const wasMarqueeRef   = useRef<boolean>(false);
  const [marquee, setMarquee] = useState<
    { x0: number; y0: number; x1: number; y1: number } | null
  >(null);

  const onScoreMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    // Pan tool wins over everything when Space is held.
    if (isSpaceHeld) {
      const el = scoreScrollRef.current;
      if (!el) return;
      panStartRef.current = {
        x: e.clientX, y: e.clientY,
        left: el.scrollLeft, top: el.scrollTop,
      };
      setIsPanning(true);
      e.preventDefault();
      return;
    }
    if (mode !== 'normal') return;
    const target = e.target as Element;
    if (target.closest('g[id]')) return;
    marqueeStartRef.current = { x: e.clientX, y: e.clientY };
  }, [mode, isSpaceHeld]);

  // Track marquee dragging alongside the existing ghost mousemove.
  const onScoreMouseDrag = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const start = marqueeStartRef.current;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      setMarquee({
        x0: Math.min(start.x, e.clientX),
        y0: Math.min(start.y, e.clientY),
        x1: Math.max(start.x, e.clientX),
        y1: Math.max(start.y, e.clientY),
      });
    }
  }, []);

  const onScoreMouseUp = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // End pan first.
    if (panStartRef.current) {
      panStartRef.current = null;
      setIsPanning(false);
      // Swallow the click that follows so it doesn't clear selection.
      wasMarqueeRef.current = true;
      return;
    }

    const svg = svgRef.current;
    if (marquee && svg) {
      // Precision marquee: an item is selected when the CENTRE of its
      // notehead sits inside the marquee box. Using bbox-intersection meant
      // a stem or flag poking into the box also flipped that note's
      // selection — too "loose". Centre-in-box matches what the user sees.
      const pointInBox = (cx: number, cy: number) =>
        cx >= marquee.x0 && cx <= marquee.x1 &&
        cy >= marquee.y0 && cy <= marquee.y1;

      const ids = new Set<string>();

      // Marquee picks up individual items — notes / rests / chords (by
      // notehead centre) PLUS engraving primitives (beam, stem, flag,
      // accid, dot, tuplet) by their bbox centre. Whole-measure selection
      // is reserved for click.
      //
      // For the notehead pass we use g.notehead's bbox so a stem or beam
      // poking down into the box doesn't accidentally trigger a note
      // selection — the centre-in-box test stays on the actual head.
      const heads = svg.querySelectorAll('g.note, g.rest, g.chord');
      heads.forEach((el) => {
        const headEl = (el.querySelector('g.notehead') ?? el) as SVGGraphicsElement;
        const r = headEl.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        const cx = (r.left + r.right) / 2;
        const cy = (r.top + r.bottom) / 2;
        if (pointInBox(cx, cy)) {
          const modelId = veroviToModelRef.current.get((el as SVGGElement).id)
                       ?? (el as SVGGElement).id;
          ids.add(modelId);
        }
      });

      // Engraving primitives — beams, stems, flags, accidentals, augmentation
      // dots, tuplet brackets. Each is selectable independently so the user
      // can grab a single beam without dragging across all its noteheads.
      // We use the element's own bbox centre — a beam's centre tracks the
      // midpoint of its angled segment, which is what the user aims at when
      // marquee-selecting "this beam".
      const primitives = svg.querySelectorAll(
        'g.beam, g.stem, g.flag, g.accid, g.dot, g.tuplet',
      );
      primitives.forEach((el) => {
        const gEl = el as SVGGElement;
        if (!gEl.id) return;
        const r = gEl.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        const cx = (r.left + r.right) / 2;
        const cy = (r.top + r.bottom) / 2;
        if (pointInBox(cx, cy)) {
          const modelId = veroviToModelRef.current.get(gEl.id) ?? gEl.id;
          ids.add(modelId);
        }
      });

      const additive = e.shiftKey || e.ctrlKey || e.metaKey;
      const next = additive
        ? new Set([...useEditorStore.getState().selectedIds, ...ids])
        : ids;
      // Set the source BEFORE dispatching to the store so the
      // selectedMeasureBoxes useEffect (which reads this ref) sees
      // 'marquee' the moment it re-runs in response to the new selection.
      selectionSourceRef.current = 'marquee';
      wasMarqueeRef.current = true;
      useEditorStore.getState().setSelectedIds(next);
    }
    marqueeStartRef.current = null;
    setMarquee(null);
  }, [marquee]);

  // Click in note-input mode: commit ghost → real note. Three modes:
  //   - target slot holds a matching rest → REPLACE rest with the note
  //   - measure is empty / slot is after existing items → INSERT (pad rests)
  //   - slot conflicts with a real note → ignored
  const onScoreClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Suppress the click that fires after a marquee drag.
    if (wasMarqueeRef.current) { wasMarqueeRef.current = false; return; }
    if (mode !== 'note-input' || !ghostSpec) return;
    // Clicks that land ON an existing note/rest/chord notehead are handled by
    // the SVG-level selection handler instead — they SELECT the clicked pitch
    // so subsequent digits build chord intervals from it.
    const target = e.target as Element;
    // Clicks on a NOTE/CHORD notehead go to the SVG selection handler
    // (chord-stack / range / edit). Clicks on a REST or mRest fall through
    // here so ghost-commit can replace/split the rest into the new note —
    // critical with the padded-measure model where every visual slot is a
    // g.rest and "click on empty space" no longer exists.
    //
    // EXCEPTION: the ghost preview is also a g.note (rendered red by Verovio
    // via the color attribute). When the mouse sits directly on top of the
    // ghost, the closest() match resolves to the ghost itself — without the
    // explicit colour check below we'd refuse to commit, and the user has
    // to inch the cursor sideways to make the click "take". That's exactly
    // the bug the user hit. Walking up to the enclosing g.note/g.chord and
    // looking at its color attribute lets us recognise the ghost and
    // proceed with commit.
    const hit = target.closest('g.note, g.chord');
    if (hit) {
      const isGhostHit =
        ((hit as Element).getAttribute('color') ?? '').toLowerCase() === '#c0392b' ||
        !!hit.querySelector('[color="#c0392b"], [fill="#c0392b"]');
      if (!isGhostHit) return;
      // It IS the ghost — fall through to commit.
    }

    try {
      const ghostNote: Note = {
        type: 'note',
        id: crypto.randomUUID(),
        pitch: ghostSpec.pitch,
        duration: { base: ghostSpec.base, dots: ghostSpec.dots },
      };

      // Find which existing item (if any) sits at the target slot.
      const measure = score.parts[ghostSpec.partIndex]?.measures[ghostSpec.measureIndex];
      const ghostBeats = durationBeats({ base: ghostSpec.base, dots: ghostSpec.dots });
      const measureBeats = (4 * score.metadata.timeSig.num / score.metadata.timeSig.den);
      // ghostSpec.slotIndex encodes the snapped beat directly (slotsTotal
      // is fine enough that recovering beat is essentially lossless).
      const slotStartBeat = Math.max(
        0,
        Math.min(measureBeats - ghostBeats, ghostSpec.slotIndex / ghostSpec.slotsTotal * measureBeats),
      );

      // Chord-stack check: slot must exactly align with an existing note's
      // start AND match its duration AND pitch must not already be in the chord.
      let chordTargetIdx = -1;
      if (measure) {
        let beat = 0;
        for (let i = 0; i < measure.notes.length; i++) {
          const ib = durationBeats(measure.notes[i].duration);
          if (Math.abs(beat - slotStartBeat) < 0.001 && Math.abs(ib - ghostBeats) < 0.001) {
            const it = measure.notes[i];
            if (it.type === 'note') {
              const existing = [it.pitch.midi, ...(it.chordNotes ?? []).map(p => p.midi)];
              if (!existing.includes(ghostSpec.pitch.midi)) chordTargetIdx = i;
            }
            break;
          }
          if (beat > slotStartBeat + 0.001) break;
          beat += ib;
        }
      }

      if (chordTargetIdx >= 0 && measure) {
        const existing = measure.notes[chordTargetIdx];
        if (existing.type === 'note') {
          addToChord(existing.id, ghostSpec.pitch);
          lastInsertedNoteRef.current = {
            id: existing.id,
            partIndex: ghostSpec.partIndex,
            measureIndex: ghostSpec.measureIndex,
            noteIndex: chordTargetIdx,
          };
          moveCursor({
            partIndex: ghostSpec.partIndex,
            measureIndex: ghostSpec.measureIndex,
            noteIndex: chordTargetIdx,
          });
          useEditorStore.getState().setSelectedIds(new Set([existing.id]));
          selectionSourceRef.current = 'typed';
        }
      } else {
        // Beat-based insert — reducer splits a containing rest at the exact
        // beat, builds [leading, note, trailing], and pads as needed.
        insertNoteAtBeat(ghostSpec.partIndex, ghostSpec.measureIndex, slotStartBeat, ghostNote);
        lastInsertedNoteRef.current = {
          id: ghostNote.id,
          partIndex: ghostSpec.partIndex,
          measureIndex: ghostSpec.measureIndex,
          noteIndex: 0, // reducer will resolve real index; this is a soft fallback
        };
        useEditorStore.getState().setSelectedIds(new Set([ghostNote.id]));
        selectionSourceRef.current = 'typed';
      }

      lastMidiRef.current = ghostSpec.pitch.midi;
      if (pendingAlter !== 0) useEditorStore.getState().setPendingAlter(0);
      setGhostSpec(null);
      setCursorGhostPos(null);
    } catch (err) {
      console.error('[v2] click-commit failed', err);
    }
  }, [mode, ghostSpec, score, pendingAlter, insertNote, insertRest, replaceAtIndex, addToChord, moveCursor]);

  // Duration button click: change every selected note/rest to the new
  // duration (reducer pads the diff with trailing rests on shrink, or eats
  // following rest space on expand). Also updates the store's activeDuration
  // so subsequent typed notes use this duration.
  const handleDurationClick = useCallback((d: DurationBase) => {
    const store = useEditorStore.getState();
    const sel = store.selectedIds;
    const targets: string[] = [];
    for (const idKey of sel) {
      if (idKey.startsWith('mrest|')) continue;       // synthetic — nothing to retime
      if (idKey.includes('|')) continue;              // chord-notes follow parent's duration
      // Skip staff verovio IDs (not in model).
      const bareId = idKey;
      let isModelItem = false;
      for (const part of score.parts) {
        for (const m of part.measures) {
          if (m.notes.some(n => n.id === bareId)) { isModelItem = true; break; }
        }
        if (isModelItem) break;
      }
      if (isModelItem) targets.push(bareId);
    }
    for (const id of targets) changeDuration(id, { base: d, dots: 0 });
    store.setActiveDuration(d);
  }, [score, changeDuration]);

  // Apply an accidental to every selected note (and chord-note). When
  // selection is empty, fall back to setting pendingAlter for next keyboard
  // input (matches the keyboard shortcut behaviour).
  const handleAccidentalClick = useCallback((alter: -1 | 0 | 1) => {
    const store = useEditorStore.getState();
    const sel = store.selectedIds;
    if (sel.size === 0) {
      store.setPendingAlter(alter);
      return;
    }
    for (const idKey of sel) {
      if (idKey.startsWith('mrest|')) continue;
      const [baseId, chordStr] = idKey.split('|');
      const chordIdx = chordStr !== undefined ? parseInt(chordStr, 10) : -1;
      // Find the note in score (closure read — scoreRef would be safer but
      // score is a dep of this callback too).
      let target: { note: Note; pitch: Pitch } | null = null;
      for (const part of score.parts) {
        for (const m of part.measures) {
          const n = m.notes.find(x => x.id === baseId && x.type === 'note');
          if (n && n.type === 'note') {
            const p = chordIdx < 0 ? n.pitch : n.chordNotes?.[chordIdx];
            if (p) target = { note: n, pitch: p };
            break;
          }
        }
        if (target) break;
      }
      if (!target) continue;

      // Natural button = two-stage behaviour:
      //   • If the note has an explicit alteration (alter ≠ 0) → first click
      //     CLEARS it (back to alter=0). Doesn't add a ♮ glyph yet — engraving
      //     wise the note now just inherits its measure context.
      //   • If alter is already 0 → toggle the explicit bekar mark, which
      //     forces a ♮ to render. Lets the user place a courtesy natural OR
      //     cancel an inherited measure-context alteration.
      if (alter === 0) {
        if (target.pitch.alter !== 0) {
          // Clear the explicit alter; bekarMark stays off.
          const naturalMidi = target.pitch.midi - target.pitch.alter;
          if (chordIdx < 0) changePitch(baseId, naturalMidi, 0);
          else changeChordPitch(baseId, chordIdx, naturalMidi, 0);
          if (target.note.bekarMark) setBekarMark(baseId, false);
        } else {
          // Toggle explicit ♮ display.
          setBekarMark(baseId, !target.note.bekarMark);
        }
        if (target.note.accidentalDisplay) {
          setAccidentalDisplay(baseId, null);
        }
        continue;
      }

      // Sharp / Flat / etc — toggle alter, clear conflicting display overrides
      // and the bekarMark (a fresh alteration kills any pending natural sign).
      const newAlter = target.pitch.alter === alter ? 0 : alter;
      const naturalMidi = target.pitch.midi - target.pitch.alter;
      const newMidi = naturalMidi + newAlter;
      if (chordIdx < 0) changePitch(baseId, newMidi, newAlter);
      else changeChordPitch(baseId, chordIdx, newMidi, newAlter);
      if (target.note.accidentalDisplay) {
        setAccidentalDisplay(baseId, null);
      }
      if (target.note.bekarMark) {
        setBekarMark(baseId, false);
      }
    }
  }, [score, changePitch, changeChordPitch, setAccidentalDisplay, setBekarMark]);

  // Resolve all selected base-note ids. Expands staff/measure selections
  // into every note that lives in that bar so tool-bar ops work uniformly
  // whether the user picked individual notes, a range, or a whole staff.
  // Skips mRest (no notes) and dedupes chord-note composite keys to their
  // parent.
  const collectSelectedNoteIds = useCallback((): string[] => {
    const sel = useEditorStore.getState().selectedIds;
    const out = new Set<string>();
    for (const idKey of sel) {
      if (idKey.startsWith('mrest|')) continue;
      const staffInfo = staffMapRef.current.get(idKey);
      if (staffInfo) {
        const part = score.parts[staffInfo.partIdx];
        const measure = part?.measures[staffInfo.measureIdx];
        if (measure) {
          for (const n of measure.notes) {
            if (n.type === 'note') out.add(n.id);
          }
        }
        continue;
      }
      const baseId = idKey.split('|')[0];
      for (const part of score.parts) {
        for (const m of part.measures) {
          if (m.notes.some(n => n.id === baseId && n.type === 'note')) {
            out.add(baseId); break;
          }
        }
      }
    }
    return Array.from(out);
  }, [score]);

  // Universal toolbar dispatcher — handles tie / dots / rest insert /
  // ornament / dynamics / words / stem direction / tremolo. Each op operates
  // on the current selection (notes only), except for `rest` which inserts a
  // rest at the cursor when nothing is selected.
  const handleOp = useCallback((op: ToolbarOp) => {
    switch (op.kind) {
      case 'tie': {
        const ids = collectSelectedNoteIds();
        for (const id of ids) toggleTie(id);
        return;
      }
      case 'dots-more': {
        // Each click adds one more dot. If the next dot count wouldn't fit
        // (would need trailing rest space the measure doesn't have), cycle
        // back to 0. Operates on selection.
        const sel = useEditorStore.getState().selectedIds;
        for (const idKey of sel) {
          if (idKey.startsWith('mrest|')) continue;
          if (idKey.includes('|')) continue;
          const bareId = idKey;
          // Locate the item to inspect its measure context.
          let foundDur: { base: DurationBase; dots: 0 | 1 | 2 | 3 } | null = null;
          let measureNotes: Array<{ type: 'note' | 'rest'; duration: { base: DurationBase; dots: 0 | 1 | 2 | 3 } }> | null = null;
          let idx = -1;
          outer: for (const part of score.parts) {
            for (const m of part.measures) {
              const i = m.notes.findIndex((n) => n.id === bareId);
              if (i >= 0) {
                foundDur = { base: m.notes[i].duration.base, dots: m.notes[i].duration.dots };
                measureNotes = m.notes as typeof measureNotes;
                idx = i;
                break outer;
              }
            }
          }
          if (!foundDur || !measureNotes) continue;
          const beatsFor = (d: 0|1|2|3) =>
            durationBeats({ base: foundDur!.base, dots: d });
          // Available trailing rest space (consecutive rests after the item).
          let trailingRestBeats = 0;
          for (let j = idx + 1; j < measureNotes.length; j++) {
            const it = measureNotes[j] as { type: string; duration: { base: DurationBase; dots: 0|1|2|3 } };
            if (it.type !== 'rest') break;
            trailingRestBeats += durationBeats(it.duration);
          }
          const currentBeats = beatsFor(foundDur.dots);
          const availableForExpand = currentBeats + trailingRestBeats;
          // Try next dot count; if it doesn't fit OR we're already at 3, wrap to 0.
          const nextCandidate = ((foundDur.dots + 1) % 4) as 0 | 1 | 2 | 3;
          const nextBeats = beatsFor(nextCandidate);
          const fits = nextBeats <= availableForExpand + 0.001;
          const finalDots = fits ? nextCandidate : 0;
          changeDuration(bareId, { base: foundDur.base, dots: finalDots });
        }
        return;
      }
      case 'dots': {
        const sel = useEditorStore.getState().selectedIds;
        // Apply to every selected note/rest in the model. If nothing is
        // selected, just store the dots level for the next typed input.
        let touched = false;
        for (const idKey of sel) {
          if (idKey.startsWith('mrest|')) continue;
          if (idKey.includes('|')) continue;          // chord-notes follow parent
          const [baseId] = idKey.split('|');
          let cur: { base: DurationBase; dots: 0|1|2 } | null = null;
          for (const part of score.parts) {
            for (const m of part.measures) {
              const it = m.notes.find(n => n.id === baseId);
              if (it) cur = { base: it.duration.base, dots: it.duration.dots };
            }
          }
          if (!cur) continue;
          // Toggle: same dots already → clear, else apply.
          const nextDots = cur.dots === op.dots ? 0 : op.dots;
          changeDuration(baseId, { base: cur.base, dots: nextDots });
          touched = true;
        }
        if (!touched) {
          useEditorStore.setState({ activeDots: op.dots });
        }
        return;
      }
      case 'rest': {
        // Two modes:
        //   • Selection has notes → each note is sliced into rests of the
        //     button's duration that tile the original slot. So a quarter
        //     note + click "eighth rest" → two eighth rests; a half + click
        //     "16th rest" → eight 16th rests. If the requested rest is
        //     LARGER than the note's slot, fall back to a single rest of
        //     the note's original duration.
        //   • Otherwise → insert a rest of the button's duration at the
        //     cursor and update activeDuration so subsequent typing matches.
        const store = useEditorStore.getState();
        const sel = store.selectedIds;
        const noteIdsToConvert: string[] = [];
        for (const idKey of sel) {
          if (idKey.startsWith('mrest|')) continue;
          if (idKey.includes('|')) continue;          // chord-notes follow parent
          const bareId = idKey;
          let isNote = false;
          for (const part of score.parts) {
            for (const m of part.measures) {
              if (m.notes.some((n) => n.id === bareId && n.type === 'note')) {
                isNote = true; break;
              }
            }
            if (isNote) break;
          }
          if (isNote) noteIdsToConvert.push(bareId);
        }
        if (noteIdsToConvert.length > 0) {
          convertToRests(noteIdsToConvert, op.base);
          store.setActiveDuration(op.base);
          return;
        }
        const rest: Rest = {
          type: 'rest',
          id: crypto.randomUUID(),
          duration: { base: op.base, dots: 0 },
        };
        store.enterNoteInput();
        store.setActiveDuration(op.base);
        insertRest(rest);
        store.setSelectedIds(new Set([rest.id]));
        selectionSourceRef.current = 'typed';
        return;
      }
      case 'ornament': {
        const ids = collectSelectedNoteIds();
        for (const id of ids) toggleOrnament(id, op.name);
        return;
      }
      case 'dynamics': {
        const ids = collectSelectedNoteIds();
        for (const id of ids) setDynamics(id, op.value);
        return;
      }
      case 'words': {
        const ids = collectSelectedNoteIds();
        for (const id of ids) toggleWords(id, op.text);
        return;
      }
      case 'stem': {
        const ids = collectSelectedNoteIds();
        for (const id of ids) setStemDir(id, op.dir);
        return;
      }
      case 'flip-stem': {
        // For each selected note read its current stemDir from the live
        // score and toggle. 'auto' (undefined) defaults to 'down' on first
        // flip — Verovio's auto rules cover most cases as 'up', so 'down'
        // is the productive first toggle. Re-press flips to 'up'.
        const ids = collectSelectedNoteIds();
        const live = scoreRef.current;
        for (const id of ids) {
          let cur: 'up' | 'down' | undefined;
          outer: for (const part of live.parts) {
            for (const m of part.measures) {
              const n = m.notes.find((x) => x.id === id && x.type === 'note');
              if (n && n.type === 'note') { cur = n.stemDir; break outer; }
            }
          }
          const next: 'up' | 'down' = cur === 'up' ? 'down' : 'up';
          setStemDir(id, next);
        }
        return;
      }
      case 'beam': {
        const ids = collectSelectedNoteIds();
        for (const id of ids) setBeam(id, op.mode);
        return;
      }
      case 'tremolo': {
        const ids = collectSelectedNoteIds();
        for (const id of ids) setTremolo(id, op.count);
        return;
      }
      case 'alter-ext': {
        // Set an extended-range alter (±2, ±3) with the same toggle rule:
        // clicking the same alter twice in a row returns to natural. Also
        // clear any microtonal/courtesy display override.
        const sel = useEditorStore.getState().selectedIds;
        for (const idKey of sel) {
          if (idKey.startsWith('mrest|')) continue;
          const [baseId, chordStr] = idKey.split('|');
          const chordIdx = chordStr !== undefined ? parseInt(chordStr, 10) : -1;
          for (const part of score.parts) {
            for (const m of part.measures) {
              const n = m.notes.find((x) => x.id === baseId && x.type === 'note');
              if (n && n.type === 'note') {
                const p = chordIdx < 0 ? n.pitch : n.chordNotes?.[chordIdx];
                if (!p) continue;
                const newAlter = p.alter === op.alter ? 0 : op.alter;
                const naturalMidi = p.midi - p.alter;
                const newMidi = naturalMidi + newAlter;
                if (chordIdx < 0) changePitch(baseId, newMidi, newAlter);
                else changeChordPitch(baseId, chordIdx, newMidi, newAlter);
                if (n.accidentalDisplay) {
                  setAccidentalDisplay(baseId, null);
                }
                if (n.bekarMark) {
                  setBekarMark(baseId, false);
                }
              }
            }
          }
        }
        return;
      }
      case 'accidental-display': {
        // Set a non-derivable accidental glyph (microtonal / courtesy natural).
        // Doesn't shift MIDI — it's a visual override.
        const ids = collectSelectedNoteIds();
        for (const id of ids) setAccidentalDisplay(id, op.value);
        return;
      }
      case 'bracket-accidental': {
        const ids = collectSelectedNoteIds();
        for (const id of ids) toggleBracketAccidental(id);
        return;
      }
      case 'cue-size': {
        const ids = collectSelectedNoteIds();
        for (const id of ids) toggleCueSize(id);
        return;
      }
      case 'grace': {
        // If any SELECTED ids are grace-note composite keys (`uuid:grace:N`)
        // we re-classify them in place — converting acciaccatura to
        // appoggiatura (or vice versa) instead of adding a new grace to the
        // main note. Only when no grace is selected does the click fall
        // back to the original "toggle a new grace on each selected note".
        const sel = useEditorStore.getState().selectedIds;
        let touchedAnyGrace = false;
        for (const idKey of sel) {
          const gm = idKey.match(/^(.+):grace:(\d+)$/);
          if (gm) {
            setGraceKind(gm[1], parseInt(gm[2], 10), op.graceKind);
            touchedAnyGrace = true;
          }
        }
        if (touchedAnyGrace) return;
        const ids = collectSelectedNoteIds();
        for (const id of ids) toggleGrace(id, op.graceKind);
        return;
      }
      case 'notehead': {
        const ids = collectSelectedNoteIds();
        for (const id of ids) setNotehead(id, op.shape);
        return;
      }
      case 'pre-bend': {
        // Pre-bend = "convert this note into a grace note attached to the
        // next note". Acciaccatura kind (slashed 8th) because it's the
        // shortest grace style — closest to the percussive pre-bend feel.
        const ids = collectSelectedNoteIds();
        for (const id of ids) convertToGrace(id, 'acciaccatura');
        return;
      }
      case 'barline': {
        // Resolve which measure(s) the user wants to mark. Sources:
        //   • Staff selection — staffMapRef gives the measureIdx directly.
        //   • Note / chord-note selection — walk score to find the measure
        //     containing that id.
        //   • mRest composite key — embeds the measureIdx itself.
        // If nothing is selected, apply to the cursor's current measure so
        // the toolbar still works without a click-select first.
        const sel = useEditorStore.getState().selectedIds;
        const measureIndices = new Set<number>();
        for (const id of sel) {
          if (id.startsWith('mrest|')) {
            const [, , mStr] = id.split('|');
            measureIndices.add(Number(mStr));
            continue;
          }
          const staffInfo = staffMapRef.current.get(id);
          if (staffInfo) { measureIndices.add(staffInfo.measureIdx); continue; }
          const bareId = id.split('|')[0];
          for (let pIdx = 0; pIdx < score.parts.length; pIdx++) {
            for (let mIdx = 0; mIdx < score.parts[pIdx].measures.length; mIdx++) {
              if (score.parts[pIdx].measures[mIdx].notes.some((n) => n.id === bareId)) {
                measureIndices.add(mIdx);
              }
            }
          }
        }
        if (measureIndices.size === 0) {
          measureIndices.add(cursor.measureIndex);
        }
        for (const mIdx of measureIndices) {
          setBarline(mIdx, op.side, op.style);
        }
        return;
      }
      case 'slide': {
        // Slide always needs TWO notes: a start and an end with different
        // pitches. We reuse the slur's "find next note in part" logic so a
        // single selection auto-pairs to the following note.
        const ids = collectSelectedNoteIds();
        if (ids.length === 0) return;
        const flat: Array<{ partIdx: number; id: string }> = [];
        for (let p = 0; p < score.parts.length; p++) {
          for (const m of score.parts[p].measures) {
            for (const n of m.notes) {
              if (n.type === 'note') flat.push({ partIdx: p, id: n.id });
            }
          }
        }
        const posOf = (id: string) => flat.findIndex(f => f.id === id);
        const ordered = ids.slice().sort((a, b) => posOf(a) - posOf(b));
        const startId = ordered[0];
        let endId: string | undefined = ordered.length > 1 ? ordered[ordered.length - 1] : undefined;
        if (!endId) {
          const startPos = posOf(startId);
          const startPart = flat[startPos]?.partIdx;
          for (let i = startPos + 1; i < flat.length; i++) {
            if (flat[i].partIdx === startPart) { endId = flat[i].id; break; }
          }
        }
        if (!endId) return;
        toggleSlide(startId, endId);
        return;
      }
      case 'hairpin':
      case 'octave-shift':
      case 'pedal': {
        // Generic span over selected notes: same pattern as `slur`. Single
        // selection → auto-pair to the next note in the same part. Range →
        // start on first, end on last.
        const ids = collectSelectedNoteIds();
        if (ids.length === 0) return;
        const flat: Array<{ partIdx: number; id: string }> = [];
        for (let p = 0; p < score.parts.length; p++) {
          for (const m of score.parts[p].measures) {
            for (const n of m.notes) {
              if (n.type === 'note') flat.push({ partIdx: p, id: n.id });
            }
          }
        }
        const posOf = (id: string) => flat.findIndex(f => f.id === id);
        const ordered = ids.slice().sort((a, b) => posOf(a) - posOf(b));
        const startId = ordered[0];
        let endId: string | undefined = ordered.length > 1 ? ordered[ordered.length - 1] : undefined;
        if (!endId) {
          const startPos = posOf(startId);
          const startPart = flat[startPos]?.partIdx;
          for (let i = startPos + 1; i < flat.length; i++) {
            if (flat[i].partIdx === startPart) { endId = flat[i].id; break; }
          }
        }
        if (op.kind === 'hairpin') toggleHairpin(startId, op.hairpinKind, endId);
        else if (op.kind === 'octave-shift') toggleOctaveShift(startId, op.shift, endId);
        else togglePedal(startId, endId);
        return;
      }
      case 'clef-change': {
        const ids = collectSelectedNoteIds();
        for (const id of ids) setClefChange(id, op.clef);
        return;
      }
      case 'time-sig-change': {
        const ids = collectSelectedNoteIds();
        for (const id of ids) setTimeSigChange(id, op.num, op.den);
        return;
      }
      case 'tuplet': {
        // Tuplet button:
        //   • Note/rest selected and NOT in a tuplet → wrap it into a tuplet
        //     of `op.num` sub-items of one-smaller duration each.
        //   • Selection already inside a tuplet → collapse back to plain.
        // Single-item selection only — multi-item tupletizing isn't supported
        // yet (would require a separate "fit beats to ratio" reshaping step).
        const sel = useEditorStore.getState().selectedIds;
        const targets = new Set<string>();
        for (const idKey of sel) {
          if (idKey.startsWith('mrest|')) continue;
          if (idKey.includes('|')) continue;
          if (idKey.includes(':grace:')) continue;
          targets.add(idKey);
        }
        for (const id of targets) toggleTuplet(id, op.num);
        return;
      }
      case 'slur': {
        // Slur over the selected notes. Range selected (2+) → start on the
        // FIRST selected, stop on the LAST (by model order). Single
        // selection → look up the next note in the same part and slur to
        // it (a slur with only `slurStart` and no matching `slurEnd` won't
        // render anywhere — Verovio needs a paired stop).
        const ids = collectSelectedNoteIds();
        if (ids.length === 0) return;
        // Build a flat ordered list of (part, noteId) so we can sort the
        // selection and find "next note after X".
        const flat: Array<{ partIdx: number; id: string }> = [];
        for (let p = 0; p < score.parts.length; p++) {
          for (const m of score.parts[p].measures) {
            for (const n of m.notes) {
              if (n.type === 'note') flat.push({ partIdx: p, id: n.id });
            }
          }
        }
        const posOf = (id: string) => flat.findIndex(f => f.id === id);
        const ordered = ids.slice().sort((a, b) => posOf(a) - posOf(b));
        const startId = ordered[0];
        let endId: string | undefined = ordered.length > 1 ? ordered[ordered.length - 1] : undefined;
        if (!endId) {
          // Single selection — find the next note in the same part as start.
          const startPos = posOf(startId);
          const startPart = flat[startPos]?.partIdx;
          for (let i = startPos + 1; i < flat.length; i++) {
            if (flat[i].partIdx === startPart) { endId = flat[i].id; break; }
          }
        }
        if (!endId) return; // no next note to slur to
        toggleSlur(startId, endId);
        return;
      }
      case 'articulations': {
        // Stacked combo (accent+staccato, tenuto+staccato, …) across the
        // SELECTION. Decision is made for the whole group at once so a
        // range click doesn't end with mixed states:
        //   • Every selected note already has EVERY atom → remove all
        //     atoms from all notes.
        //   • Otherwise → add the missing atoms to each note so the full
        //     set is present everywhere.
        const ids = collectSelectedNoteIds();
        if (ids.length === 0) return;
        const targets: Array<{ id: string; current: string[] }> = [];
        for (const id of ids) {
          outer: for (const part of score.parts) {
            for (const m of part.measures) {
              const n = m.notes.find((x) => x.id === id && x.type === 'note');
              if (n && n.type === 'note') {
                targets.push({ id, current: n.articulations ?? [] });
                break outer;
              }
            }
          }
        }
        const allHaveAll = targets.every(t => op.names.every(name => t.current.includes(name)));
        if (allHaveAll) {
          for (const t of targets) {
            for (const name of op.names) toggleArticulation(t.id, name);
          }
        } else {
          for (const t of targets) {
            for (const name of op.names) {
              if (!t.current.includes(name)) toggleArticulation(t.id, name);
            }
          }
        }
        return;
      }
    }
  }, [
    collectSelectedNoteIds, toggleTie, toggleSlur, toggleSlide, toggleOrnament, setDynamics, toggleWords,
    setStemDir, setBeam, setTremolo, changeDuration, insertRest, score, toggleArticulation,
    convertToRests, setBarline, cursor.measureIndex,
    changePitch, changeChordPitch, setAccidentalDisplay, toggleBracketAccidental, toggleCueSize, setBekarMark, toggleGrace,
    setNotehead, togglePreBend, convertToGrace, setGraceKind,
    toggleHairpin, toggleOctaveShift, togglePedal, setClefChange, setTimeSigChange,
    toggleTuplet,
  ]);

  // Resolve the user's selection into a flat list of model note ids,
  // EXPANDING any staff/measure selection into all the notes that live in
  // that bar (otherwise tool-bar actions silently do nothing when the
  // whole staff is selected — staffs aren't note ids).
  const collectNotesFromSelection = useCallback((): string[] => {
    const sel = useEditorStore.getState().selectedIds;
    const out = new Set<string>();
    for (const idKey of sel) {
      if (idKey.startsWith('mrest|')) continue;
      const staffInfo = staffMapRef.current.get(idKey);
      if (staffInfo) {
        const part = score.parts[staffInfo.partIdx];
        const measure = part?.measures[staffInfo.measureIdx];
        if (measure) {
          for (const n of measure.notes) {
            if (n.type === 'note') out.add(n.id);
          }
        }
        continue;
      }
      const baseId = idKey.split('|')[0];
      // Verify it's a real note before adding.
      for (const part of score.parts) {
        for (const m of part.measures) {
          if (m.notes.some(n => n.id === baseId && n.type === 'note')) {
            out.add(baseId); break;
          }
        }
      }
    }
    return Array.from(out);
  }, [score]);

  // Articulation across a SELECTION (single note, range, or whole staff):
  //   • If every target note already carries the articulation → remove it
  //     from all of them.
  //   • Otherwise → add it to the ones that don't have it yet.
  const handleArticulationClick = useCallback((name: string) => {
    const ids = collectNotesFromSelection();
    if (ids.length === 0) return;
    const targets: Array<{ id: string; hasIt: boolean }> = [];
    for (const id of ids) {
      outer: for (const part of score.parts) {
        for (const m of part.measures) {
          const n = m.notes.find(x => x.id === id && x.type === 'note');
          if (n && n.type === 'note') {
            targets.push({ id, hasIt: (n.articulations ?? []).includes(name) });
            break outer;
          }
        }
      }
    }
    if (targets.length === 0) return;
    const allHave = targets.every(t => t.hasIt);
    if (allHave) {
      for (const t of targets) toggleArticulation(t.id, name);
    } else {
      for (const t of targets) {
        if (!t.hasIt) toggleArticulation(t.id, name);
      }
    }
  }, [score, toggleArticulation, collectNotesFromSelection]);

  const displayTitle = score.metadata.title || 'New Project';

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        background: C.bg,
        color: C.text,
        outline: 'none',
      }}
    >
      <TabBar projectName={displayTitle} />
      <EditorTopBar
        projectName={displayTitle}
        zoom={zoom}
        onZoomChange={setZoom}
        palettesOpen={palettesOpen}
        onPalettesToggle={() => setPalettesOpen(o => !o)}
      />

      <div style={{
        flex: 1,
        display: 'flex',
        overflow: 'hidden',
        position: 'relative',
      }}>
        <div
          ref={scoreScrollRef}
          className={mode === 'note-input' ? 'mode-input' : 'mode-select'}
          onMouseDown={onScoreMouseDown}
          onMouseMove={onScoreMouseMove}
          onMouseUp={onScoreMouseUp}
          onMouseLeave={onScoreMouseLeave}
          onClick={onScoreClick}
          style={{
            flex: 1,
            overflow: 'auto',
            background: C.bg,
            cursor: isPanning ? 'grabbing' : isSpaceHeld ? 'grab' : 'default',
            position: 'relative',
            userSelect: 'none',
          }}
        >
          {/* Figma-style infinite canvas: an OUTER pad-box that's much bigger
              than the zoomed score in every direction so you can pan it fully
              off-screen in any direction. The score is centered inside the
              pad-box; the surrounding empty area is just scroll-real-estate. */}
          <div style={{
            width: 794 * (zoom / 100) + 4000,
            height: 1123 * (zoom / 100) + 4000,
            position: 'relative',
          }}>
            {/* Zoomed wrapper: post-scale footprint so scroll knows the size. */}
            <div style={{
              width: 794 * (zoom / 100),
              minHeight: 1123 * (zoom / 100),
              position: 'absolute',
              top: 2000,
              left: 2000,
            }}>
              <div style={{
                width: 794,
                minHeight: 1123,
                background: '#fff',
                boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
                borderRadius: 2,
                padding: '24px',
                transform: `scale(${zoom / 100})`,
                transformOrigin: 'top left',
                // No transition — animating the transform meant bbox samples
                // during the animation returned intermediate sizes, and any
                // clicks/hovers landing in those few frames missed the right
                // note. Instant zoom keeps geometry truthful at every moment.
                position: 'absolute',
                top: 0,
                left: 0,
              }}>
                <VerovioRenderer musicXml={deferredXml} onSvgRendered={onSvgRendered} />
              </div>
            </div>
          </div>

          {/* Selected-staff overlays live inside the scroll container so they
              clip naturally against the canvas borders (no leaking past the
              top bar). Coords above are translated to scroll-content space. */}
          {selectedMeasureBoxes.map((b, i) => (
            <div
              key={`mbox-${i}`}
              style={{
                position: 'absolute',
                left: b.left,
                top: b.top,
                width: b.width,
                height: b.height,
                border: '2px solid #2563eb',
                background: 'rgba(37, 99, 235, 0.06)',
                pointerEvents: 'none',
                borderRadius: 2,
              }}
            />
          ))}

          {/* Beat snap guide — thin vertical line marking the snapped beat
              the click will commit to. Visible only in note-input mode
              while the ghost is tracking. No text badge — the line + ghost
              colour are sufficient feedback (badge tested as too noisy). */}
          {mode === 'note-input' && cursorGhostPos && (
            <div
              style={{
                position: 'absolute',
                left: cursorGhostPos.relX,
                top: cursorGhostPos.staffTopY - 8,
                width: 1,
                height: (cursorGhostPos.staffBottomY - cursorGhostPos.staffTopY) + 16,
                background: 'rgba(192, 57, 43, 0.55)',
                pointerEvents: 'none',
                zIndex: 5,
              }}
            />
          )}
        </div>

        <RightSidebar />
        <BottomPanel
          onDurationClick={handleDurationClick}
          onAccidentalClick={handleAccidentalClick}
          onArticulationClick={handleArticulationClick}
          onOp={handleOp}
        />

        {/* Palettes side panel (MuseScore-style, slide-out drawer). The
            toggle lives in EditorTopBar — small icon next to the project tab. */}
        <PalettePanel open={palettesOpen} onClose={() => setPalettesOpen(false)} />
      </div>

      {/* Marquee overlay — drawn in client (fixed) coords */}
      {marquee && (
        <div style={{
          position: 'fixed',
          left:   marquee.x0,
          top:    marquee.y0,
          width:  marquee.x1 - marquee.x0,
          height: marquee.y1 - marquee.y0,
          background: 'rgba(37, 99, 235, 0.12)',
          border:     '1px solid #2563eb',
          pointerEvents: 'none',
          zIndex: 100,
        }} />
      )}

      <div style={{
        position: 'absolute',
        left: '50%',
        transform: 'translateX(-50%)',
        top: 52,
        padding: '4px 12px',
        background: mode === 'note-input' ? C.red : 'rgba(255,255,255,0.04)',
        color: mode === 'note-input' ? '#fff' : C.muted,
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: 0.4,
        zIndex: 5,
        pointerEvents: 'none',
      }}>
        {mode === 'note-input'
          ? `● NOTE INPUT — ${activeDuration}${activeDots ? '·'.repeat(activeDots) : ''}${pendingAlter === 1 ? ' ♯' : pendingAlter === -1 ? ' ♭' : ''}  ·  ${score.parts[cursor.partIndex]?.clef ?? '?'} staff (Tab / ↑↓ to switch)`
          : 'V select  ·  N note input  ·  A–G notes  ·  2–9 chord interval  ·  R rest  ·  ←→ move cursor  ·  Tab switch staff'}
      </div>

      <div style={{
        position: 'absolute',
        right: 300, bottom: 20,
        padding: '4px 10px',
        background: 'rgba(255,255,255,0.06)',
        color: C.dimmed,
        borderRadius: 4,
        fontSize: 10,
        fontFamily: 'monospace',
        zIndex: 5,
        pointerEvents: 'none',
      }}>
        cursor: P{cursor.partIndex}·M{cursor.measureIndex + 1}·N{cursor.noteIndex}
        {canUndo && '  ⤺'}{canRedo && '  ⤻'}
      </div>
    </div>
  );
}
