'use client';

import React, { useState, useEffect, useRef } from 'react';
import { C } from '@/lib/theme';
import { useEditorStore, type DurationBase } from '@/lib/v2/editor-store';

// ─── Tabs ────────────────────────────────────────────────────────────────────

export type PanelTab = 'Common' | 'More Notes' | 'Articulation' | 'Groups' | 'Bars' | 'Symbols';
const TABS: PanelTab[] = ['Common', 'More Notes', 'Articulation', 'Groups', 'Bars', 'Symbols'];

// ─── Generic toolbar op ──────────────────────────────────────────────────────
// Anything that isn't a duration / alter / articulation goes through here.
// page.tsx dispatches to the matching reducer action, applied to current
// selection (or cursor, for `rest`).

export type ToolbarOp =
  | { kind: 'tie' }
  | { kind: 'dots'; dots: 0 | 1 | 2 | 3 }
  /** Cycle dots on each selected note: 0 → 1 → 2 → 3 → 0. If the next
   *  dot count wouldn't fit in the measure (need trailing rest space that
   *  isn't there), skip to 0. */
  | { kind: 'dots-more' }
  | { kind: 'rest'; base: DurationBase }
  | { kind: 'ornament'; name: string }
  | { kind: 'dynamics'; value: string }
  | { kind: 'words'; text: string }
  | { kind: 'stem'; dir: 'up' | 'down' | 'auto' }
  /** Toggle stem direction on selected notes: up ↔ down. Notes currently
   *  on 'auto' are forced to 'down' on first press (next press flips up). */
  | { kind: 'flip-stem' }
  /** Explicit beam grouping for the selected note(s).
   *  • auto     — let the engraver decide (default)
   *  • start    — this note opens a beam group
   *  • continue — this note is mid-beam
   *  • end      — this note closes a beam group
   *  • none     — render with a flag, no beam */
  | { kind: 'beam'; mode: 'auto' | 'start' | 'continue' | 'end' | 'none' }
  /** "Start secondary beam" — break the SECONDARY (16th+) beam at the selected
   *  note while keeping the PRIMARY (8th) beam continuous through it. */
  | { kind: 'secondary-beam' }
  /** "Stemlet" — convert the selected beamed note into a rest with the beam
   *  drawn over it (or toggle stemlet on a rest). */
  | { kind: 'stemlet' }
  | { kind: 'tremolo'; count: number }
  | { kind: 'buzz-roll' }
  | { kind: 'tremolo-between' }
  | { kind: 'feathered'; dir: 'accel' | 'rit' }
  /** Toggle a SET of atomic articulations together. Used for combination
   *  buttons (accent+staccato, tenuto+accent, …) — stacked marks aren't
   *  expressible as a single MusicXML element, so we apply the atoms
   *  individually and the converter emits each as its own tag. Toggle rule:
   *  if all atoms are present on the note, remove them all; else add any
   *  missing ones so the full set is present. */
  | { kind: 'articulations'; names: string[] }
  /** Toggle a slur over the selected notes. Single selection = 1-note slur
   *  (chained to the next note); range selection = start on first, end on
   *  last. */
  | { kind: 'slur' }
  /** Toggle a slide (glissando) line between selected note and the next. */
  | { kind: 'slide' }
  /** Toggle a barline (or repeat marker) on the measure containing each
   *  selected item. Clicking the same style again clears it. */
  | { kind: 'barline'; side: 'left' | 'right'; style: 'double' | 'final' | 'repeat-start' | 'repeat-end' }
  /** Apply an extended-range accidental (alter ±2, ±3 — double/triple
   *  sharps and flats). MIDI shifts by `alter`; the glyph is derived. */
  | { kind: 'alter-ext'; alter: -3 | -2 | 2 | 3 }
  /** Set a non-derivable accidental display glyph (microtones, courtesy
   *  naturals). Doesn't change MIDI. */
  | { kind: 'accidental-display'; value: 'natural-sharp' | 'natural-flat' | 'quarter-sharp' | 'three-quarters-sharp' | 'quarter-flat' | 'three-quarters-flat' }
  /** Toggle the bracket/parentheses wrapper around the rendered accidental. */
  | { kind: 'bracket-accidental' }
  /** Toggle cue-size rendering (small notehead) on selected notes. */
  | { kind: 'cue-size' }
  /** Toggle a grace note (acciaccatura = slashed 8th, appoggiatura = plain)
   *  before each selected note. Default pitch is one step above the main. */
  | { kind: 'grace'; graceKind: 'acciaccatura' | 'appoggiatura' }
  /** Set / toggle notehead shape (broken / slash / x / diamond / …). Same
   *  shape clicked twice clears it back to the default oval. */
  | { kind: 'notehead'; shape: 'slashed' | 'slash' | 'x' | 'diamond' | 'triangle' | 'square' | 'cluster' }
  /** Toggle the pre-bend technical marker on selected note(s). */
  | { kind: 'pre-bend' }
  /** Toggle a crescendo / diminuendo hairpin span over selected notes. */
  | { kind: 'hairpin'; hairpinKind: 'crescendo' | 'diminuendo' }
  /** Toggle an 8va / 8vb / 15ma / 15mb bracket span over selected notes. */
  | { kind: 'octave-shift'; shift: '8va-up' | '8va-down' | '15ma-up' | '15ma-down' }
  /** Toggle a sustain-pedal span over selected notes. */
  | { kind: 'pedal' }
  /** Insert a mid-measure clef change before the selected note(s). */
  | { kind: 'clef-change'; clef: 'treble' | 'bass' | 'alto' }
  /** Insert a mid-measure time-signature change before the selected note(s). */
  | { kind: 'time-sig-change'; num: number; den: number }
  /** Wrap the selected items in a tuplet of N actual notes per `den` normal
   *  notes (3:2 = triplet, 5:4 = quintuplet, …). When the existing selection
   *  is a single item, it's split into `num` items occupying the same beat
   *  span. When the selection already lives inside a tuplet, the tuplet is
   *  unwrapped back to a single non-tuplet item. */
  | { kind: 'tuplet'; num: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 };

// ─── Tool button ─────────────────────────────────────────────────────────────
// Square-ish icon button, 32×30. Transparent default, hover lights it,
// active = red (Note Input style).

interface ToolBtnProps {
  children: React.ReactNode;
  active?: boolean;
  label?: string;
  onClick?: () => void;
  width?: number;
  /** When set, button represents a duration; clicking selects it in the store. */
  duration?: DurationBase;
}

// SMuFL/custom icons live under /icons/toolbar/. The SVGs already have
// fill="white", and PNG rests are dark — for PNGs we tint via invert. To
// distinguish, we treat .png as needing the invert+brightness filter.
function ToolIcon({ src, size = 56 }: { src: string; size?: number }) {
  const isPng = src.toLowerCase().endsWith('.png');
  // URL-encode each path segment so filenames with spaces or special chars
  // resolve. "Mute on.svg" → "Mute%20on.svg".
  const encoded = src.split('/').map(encodeURIComponent).join('/');
  return (
    <img
      src={`/icons/${encoded}`}
      alt=""
      draggable={false}
      style={{
        width: size,
        height: size,
        objectFit: 'contain',
        // White SVGs render as-is; dark PNG rests get inverted to white.
        filter: isPng ? 'brightness(0) invert(1)' : undefined,
        pointerEvents: 'none',
      }}
    />
  );
}

// Render a SMuFL Bravura glyph by hex codepoint string like "E1D5".
// Same vector source Verovio uses for the score — pixel-perfect with engraved
// notation, scales to any size, white by default for the dark panel.
function SmuflGlyph({ code, size = 22 }: { code: string; size?: number }) {
  const char = String.fromCodePoint(parseInt(code, 16));
  return (
    <span
      className="smufl"
      style={{
        fontSize: size,
        color: 'inherit',
        pointerEvents: 'none',
        display: 'inline-block',
        lineHeight: 1,
      }}
    >
      {char}
    </span>
  );
}

function ToolBtn({ children, active, label, onClick, width = 56, duration }: ToolBtnProps) {
  const storeDuration = useEditorStore((s) => s.activeDuration);
  // If this button represents a duration, "active" reflects the store; the
  // click handler is provided by the parent (so it can also re-time selected
  // notes, not just set activeDuration for future input).
  const isDurationActive = duration ? duration === storeDuration : false;
  const finalActive = duration ? isDurationActive : !!active;
  const finalClick = onClick;
  const [hov, setHov] = useState(false);
  return (
    <button
      title={label}
      onClick={finalClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width,
        height: 52,
        borderRadius: 6,
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: finalActive ? C.activeRed : hov ? C.btnHover : 'transparent',
        color: finalActive ? '#fff' : C.text,
        fontSize: 14,
        lineHeight: 1,
        transition: 'background 0.1s, color 0.1s',
        flexShrink: 0,
        padding: 0,
      }}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div style={{ width: 1, height: 32, background: C.border, flexShrink: 0, margin: '0 8px' }} />;
}

// ─── Tab pill ────────────────────────────────────────────────────────────────

function TabPill({ label, active, onClick }: { label: PanelTab; active: boolean; onClick: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: '5px 14px',
        borderRadius: 6,
        border: 'none',
        cursor: 'pointer',
        fontSize: 12,
        fontFamily: 'inherit',
        whiteSpace: 'nowrap',
        background: active ? C.activeBg : hov ? 'rgba(255,255,255,0.05)' : 'transparent',
        color: active ? C.text : C.muted,
        transition: 'background 0.1s, color 0.1s',
      }}
    >
      {label}
    </button>
  );
}

// ─── Note Input button (red, left side) ─────────────────────────────────────

function NoteInputBlock({
  active,
  onToggle,
  onAddVoice,
}: {
  active: boolean;
  onToggle: () => void;
  onAddVoice: () => void;
}) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 6,
      paddingRight: 14,
      borderRight: `1px solid ${C.border}`,
      marginRight: 6,
    }}>
      {/* Red button + dropdown chevron */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button
          onClick={onToggle}
          title="Note Input (N)"
          style={{
            width: 56,
            height: 56,
            borderRadius: 12,
            border: 'none',
            cursor: 'pointer',
            background: C.red,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: active ? `0 0 0 2px rgba(255,255,255,0.15)` : 'none',
            transition: 'box-shadow 0.15s',
            flexShrink: 0,
          }}
        >
          {/* Pointer cursor icon */}
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 3l6 17 2.5-6.5L20 11z" fill="currentColor" />
          </svg>
        </button>
        <span style={{ color: C.muted, fontSize: 10, lineHeight: 1 }}>▾</span>
      </div>
      {/* Add voice */}
      <button
        onClick={onAddVoice}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          background: 'transparent',
          border: 'none',
          color: C.dimmed,
          fontSize: 10.5,
          cursor: 'pointer',
          padding: '2px 4px',
          borderRadius: 4,
        }}
        title="Add voice"
      >
        Add voice <span style={{ fontSize: 12, lineHeight: 1 }}>+</span>
      </button>
    </div>
  );
}

// ─── Tab content rows ────────────────────────────────────────────────────────
// Each tab = 2 rows of icon buttons. Symbols below are placeholders using
// Unicode — final version will use Bravura/SMuFL glyphs via @font-face.

interface RowItem {
  /** Unicode fallback glyph — used when `icon`/`glyph` is not provided. */
  sym?: string;
  /** Path under /icons/toolbar/, e.g. "combo/tie.svg". Used for custom
   *  combination illustrations that aren't a single SMuFL glyph. */
  icon?: string;
  /** SMuFL Bravura codepoint as hex string, e.g. "E1D5" for quarter note.
   *  Preferred over `icon` for standard glyphs — renders via webfont, scales
   *  cleanly, matches the engraved score's Bravura. */
  glyph?: string;
  label: string;
  group?: number;
  /** If set, this button selects an active duration in the store. */
  duration?: DurationBase;
  /** If set, this button applies an accidental (alter -1 / 0 / 1) to the
   *  selected note(s) — or queues pendingAlter if nothing is selected. */
  alter?: -1 | 0 | 1;
  /** If set, this button toggles a MusicXML articulation tag on the selected
   *  note(s) (e.g. "accent", "staccato", "tenuto-staccato", "fermata"). */
  articulation?: string;
  /** Generic toolbar operation — tie, dots, rest insert, ornament, dynamics,
   *  words, stem direction, tremolo. Routed to page.tsx onOp handler. */
  op?: ToolbarOp;
  onClick?: () => void;
  /** When set, the button is a DROPDOWN: clicking opens a floating popup
   *  with these child items. The main button's icon/glyph/sym is used as
   *  the always-visible "primary" affordance + a small ▾ chevron. The
   *  popup auto-closes when the user clicks outside or picks an item. */
  dropdown?: RowItem[];
}

interface RowProps {
  items: RowItem[];
  onDurationClick?: (d: DurationBase) => void;
  onAccidentalClick?: (alter: -1 | 0 | 1) => void;
  onArticulationClick?: (name: string) => void;
  onOp?: (op: ToolbarOp) => void;
}

function ButtonRow({ items, onDurationClick, onAccidentalClick, onArticulationClick, onOp }: RowProps) {
  let lastGroup = items[0]?.group ?? 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'nowrap' }}>
      {items.map((it, i) => {
        const sep = it.group !== undefined && it.group !== lastGroup;
        lastGroup = it.group ?? lastGroup;
        const click = it.duration
          ? () => onDurationClick?.(it.duration!)
          : it.alter !== undefined
            ? () => onAccidentalClick?.(it.alter!)
            : it.articulation
              ? () => onArticulationClick?.(it.articulation!)
              : it.op
                ? () => onOp?.(it.op!)
                : it.onClick;
        return (
          <React.Fragment key={i}>
            {sep && <Divider />}
            <ToolBtn label={it.label} duration={it.duration} onClick={click}>
              {it.glyph
                ? <SmuflGlyph code={it.glyph} />
                : it.icon
                  ? <ToolIcon src={it.icon} />
                  : <span style={{ fontSize: (it.sym ?? '').length > 1 ? 12 : 15, fontFamily: 'serif' }}>{it.sym}</span>}
            </ToolBtn>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Single item button (extracted from ButtonRow for use in TwoRowGrouped) ──

function ItemBtn({ item, onDurationClick, onAccidentalClick, onArticulationClick, onOp }: {
  item: RowItem;
  onDurationClick?: (d: DurationBase) => void;
  onAccidentalClick?: (alter: -1 | 0 | 1) => void;
  onArticulationClick?: (name: string) => void;
  onOp?: (op: ToolbarOp) => void;
}) {
  // Dropdown path: clicking opens a floating popup with child items.
  // We render the primary face inline so the icon stays visible.
  if (item.dropdown && item.dropdown.length > 0) {
    return (
      <DropdownBtn
        item={item}
        onDurationClick={onDurationClick}
        onAccidentalClick={onAccidentalClick}
        onArticulationClick={onArticulationClick}
        onOp={onOp}
      />
    );
  }

  const click = item.duration
    ? () => onDurationClick?.(item.duration!)
    : item.alter !== undefined
      ? () => onAccidentalClick?.(item.alter!)
      : item.articulation
        ? () => onArticulationClick?.(item.articulation!)
        : item.op
          ? () => onOp?.(item.op!)
          : item.onClick;
  return (
    <ToolBtn label={item.label} duration={item.duration} onClick={click}>
      {item.glyph
        ? <SmuflGlyph code={item.glyph} />
        : item.icon
          ? <ToolIcon src={item.icon} />
          : <span style={{ fontSize: (item.sym ?? '').length > 1 ? 12 : 15, fontFamily: 'serif' }}>{item.sym}</span>}
    </ToolBtn>
  );
}

// ─── Dropdown button (used for the Tuplets selector) ────────────────────────
// Renders the parent button + ▾ chevron. Clicking opens a popup of children
// rendered as a grid. Picking a child closes the popup AND fires the child's
// onClick/op. Click outside closes without firing.
function DropdownBtn({
  item, onDurationClick, onAccidentalClick, onArticulationClick, onOp,
}: {
  item: RowItem;
  onDurationClick?: (d: DurationBase) => void;
  onAccidentalClick?: (alter: -1 | 0 | 1) => void;
  onArticulationClick?: (name: string) => void;
  onOp?: (op: ToolbarOp) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Outside click → close.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const pickChild = (child: RowItem) => {
    if (child.op) onOp?.(child.op);
    else if (child.duration) onDurationClick?.(child.duration);
    else if (child.alter !== undefined) onAccidentalClick?.(child.alter);
    else if (child.articulation) onArticulationClick?.(child.articulation);
    else child.onClick?.();
    setOpen(false);
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>
      <ToolBtn label={item.label} onClick={() => setOpen((v) => !v)}>
        {/* Position relative so the chevron badge can anchor to bottom-right
            of the button without shifting the primary icon. */}
        <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {item.glyph
            ? <SmuflGlyph code={item.glyph} />
            : item.icon
              ? <ToolIcon src={item.icon} />
              : <span style={{ fontSize: 15, fontFamily: 'serif' }}>{item.sym}</span>}
          {/* Chevron — bottom-right corner, larger + brighter than a plain
              text glyph so it reads as a "this opens a menu" affordance. */}
          <span
            style={{
              position: 'absolute',
              right: 4,
              bottom: 2,
              fontSize: 16,
              lineHeight: 1,
              color: '#fff',
              fontWeight: 700,
              pointerEvents: 'none',
              textShadow: '0 0 3px rgba(0,0,0,0.85)',
              transform: open ? 'rotate(180deg)' : undefined,
              transformOrigin: 'center',
              transition: 'transform 0.15s',
            }}
          >
            ▾
          </span>
        </div>
      </ToolBtn>
      {open && (
        <div
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 6px)',
            left: 0,
            background: C.panel,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: 6,
            boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 56px)',
            gap: 2,
            zIndex: 1000,
          }}
        >
          {item.dropdown!.map((child, i) => {
            const click = () => pickChild(child);
            return (
              <button
                key={i}
                onClick={click}
                title={child.label}
                style={{
                  width: 56, height: 52,
                  borderRadius: 6, border: 'none',
                  cursor: 'pointer',
                  background: 'transparent',
                  color: C.text,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: 0,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = C.btnHover)}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                {child.glyph
                  ? <SmuflGlyph code={child.glyph} />
                  : child.icon
                    ? <ToolIcon src={child.icon} />
                    : <span style={{ fontSize: 15, fontFamily: 'serif' }}>{child.sym}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Two-row grouped layout ───────────────────────────────────────────────────
// Groups row1 + row2 items by their `group` number and renders them as paired
// columns. Between groups a single vertical line spans BOTH rows — like the
// full-height column separators in the screenshot — instead of two separate
// short dividers that don't visually connect.

function TwoRowGrouped({
  row1, row2,
  onDurationClick, onAccidentalClick, onArticulationClick, onOp,
}: {
  row1: RowItem[];
  row2: RowItem[];
  onDurationClick?: (d: DurationBase) => void;
  onAccidentalClick?: (alter: -1 | 0 | 1) => void;
  onArticulationClick?: (name: string) => void;
  onOp?: (op: ToolbarOp) => void;
}) {
  // Preserve group order as they appear in the data
  const seen = new Set<number>();
  const allGroups: number[] = [];
  for (const it of [...row1, ...row2]) {
    const g = it.group ?? 0;
    if (!seen.has(g)) { seen.add(g); allGroups.push(g); }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'stretch', paddingLeft: 4 }}>
      {allGroups.map((g, idx) => {
        const r1 = row1.filter(i => (i.group ?? 0) === g);
        const r2 = row2.filter(i => (i.group ?? 0) === g);
        return (
          <React.Fragment key={g}>
            {idx > 0 && (
              <div style={{
                width: 1,
                alignSelf: 'stretch',
                background: C.border,
                flexShrink: 0,
                margin: '0 8px',
              }} />
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                {r1.map((it, i) => (
                  <ItemBtn key={i} item={it}
                    onDurationClick={onDurationClick}
                    onAccidentalClick={onAccidentalClick}
                    onArticulationClick={onArticulationClick}
                    onOp={onOp}
                  />
                ))}
              </div>
              <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                {r2.map((it, i) => (
                  <ItemBtn key={i} item={it}
                    onDurationClick={onDurationClick}
                    onAccidentalClick={onAccidentalClick}
                    onArticulationClick={onArticulationClick}
                    onOp={onOp}
                  />
                ))}
              </div>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Tab data ────────────────────────────────────────────────────────────────
// Symbols use Unicode codepoints from the SMuFL standard that are most likely
// to render in stock fonts. Will be replaced by Bravura @font-face in step 2.

const TAB_CONTENT: Record<PanelTab, { row1: RowItem[]; row2: RowItem[] }> = {
  'Common': {
    row1: [
      { icon: 'buttons/common/noteWhole.svg',                    label: 'Whole note',         group: 1, duration: 'whole'   },
      { icon: 'buttons/common/noteHalfUp.svg',                   label: 'Half note',          group: 1, duration: 'half'    },
      { icon: 'buttons/common/noteQuarterUp.svg',                label: 'Quarter note',       group: 1, duration: 'quarter' },
      { icon: 'buttons/common/note8thUp.svg',                    label: 'Eighth note',        group: 1, duration: 'eighth'  },
      { icon: 'buttons/common/note16thUp.svg',                   label: '16th note',          group: 1, duration: '16th'    },
      { icon: 'buttons/common/note32ndUp.svg',                   label: '32nd note',          group: 1, duration: '32nd'    },
      { icon: 'buttons/common/noteQuarterUpaugmentationDot.svg', label: 'Dotted note',        group: 2, op: { kind: 'dots', dots: 1 } },
      { icon: 'buttons/common/restWholeLegerLine.svg',           label: 'Whole rest',         group: 3, op: { kind: 'rest', base: 'whole' } },
      { icon: 'buttons/common/restHalfLegerLine.svg',            label: 'Half rest',          group: 3, op: { kind: 'rest', base: 'half' } },
      { icon: 'buttons/common/restQuarter.svg',                  label: 'Quarter rest',       group: 3, op: { kind: 'rest', base: 'quarter' } },
      { icon: 'buttons/common/rest8th.svg',                      label: 'Eighth rest',        group: 3, op: { kind: 'rest', base: 'eighth' } },
      { icon: 'buttons/common/rest16th.svg',                     label: '16th rest',          group: 3, op: { kind: 'rest', base: '16th' } },
      { icon: 'buttons/common/rest32nd.svg',                     label: '32nd rest',          group: 3, op: { kind: 'rest', base: '32nd' } },
    ],
    row2: [
      { icon: 'buttons/common/accidentalDoubleFlat.svg',         label: 'Double flat',        group: 1, op: { kind: 'alter-ext', alter: -2 } },
      { icon: 'buttons/common/accidentalFlat.svg',               label: 'Flat',               group: 1, alter: -1 },
      { icon: 'buttons/common/accidentalNatural.svg',            label: 'Natural',            group: 1, alter: 0 },
      { icon: 'buttons/common/accidentalSharp.svg',              label: 'Sharp',              group: 1, alter: 1 },
      { icon: 'buttons/common/accidentalDoubleSharp.svg',        label: 'Double sharp',       group: 1, op: { kind: 'alter-ext', alter: 2 } },
      { icon: 'buttons/common/BracketAccidental.svg',            label: 'Bracket accidental', group: 1, op: { kind: 'bracket-accidental' } },
      { icon: 'buttons/common/tie.svg',                          label: 'Tie',                group: 2, op: { kind: 'tie' } },
      // Articulations ordered from simplest to most complex, lightest to
      // strongest — MuseScore-style: bare staccato (+ its variant) first,
      // then the tenuto-staccato (portato) pair, then accent and its
      // compounds. Reads left-to-right as "softer → stronger emphasis".
      // Order in `names` matters: the FIRST entry sits closest to the
      // notehead in Verovio's stack, the second sits further out. Engraving
      // rule (Ultimate Music Theory): staccato dot / tenuto dash closest to
      // notehead, the stronger accent / marcato wedge on the outside with
      // the pointy end aimed away from the head.
      { icon: 'buttons/common/articStaccatoAbove.svg',           label: 'Staccato',           group: 3, articulation: 'staccato' },
      { glyph: 'E4A4',                                           label: 'Tenuto',             group: 3, articulation: 'tenuto' },
      { icon: 'buttons/common/articTenutoStaccatoAbove.svg',     label: 'Tenuto + staccato',  group: 3, op: { kind: 'articulations', names: ['staccato', 'tenuto'] } },
      { icon: 'buttons/common/articAccentAbove.svg',             label: 'Accent',             group: 3, articulation: 'accent' },
      { icon: 'buttons/common/articAccentStaccatoAbove.svg',     label: 'Accent + staccato',  group: 3, op: { kind: 'articulations', names: ['staccato', 'accent'] } },
      { icon: 'buttons/common/articTenutoAccentAbove.svg',       label: 'Tenuto + accent',    group: 3, op: { kind: 'articulations', names: ['tenuto', 'accent'] } },
    ],
  },
  'More Notes': {
    // Three-group layout with single-utility middle slot, dividers on
    // both sides of it. Mirrors Common's structure visually.
    //   Row 1: [6 durations] | [Slide]    | [5 sharps]
    //   Row 2: [5 effects]   | [Cue size] | [6 flats]
    // All accidentals are on the RIGHT (group 3), non-accidentals on the
    // LEFT (group 1), and the central column holds the two utility slots.
    row1: [
      // ── Group 1 (LEFT): Extended durations (6) ──
      { icon: 'buttons/more-notes/noteDoubleWhole.svg',                          label: 'Double whole (breve)',   group: 1, duration: 'breve'  },
      { icon: 'buttons/more-notes/note64thUp.svg',                               label: '64th note',              group: 1, duration: '64th'   },
      { icon: 'buttons/more-notes/note128thUp.svg',                              label: '128th note',             group: 1, duration: '128th'  },
      { icon: 'buttons/more-notes/note256thUp.svg',                              label: '256th note',             group: 1, duration: '256th'  },
      { icon: 'buttons/more-notes/note512thUp.svg',                              label: '512th note',             group: 1, duration: '512th'  },
      { icon: 'buttons/more-notes/note1024thUp.svg',                             label: '1024th note',            group: 1, duration: '1024th' },
      // ── Group 2 (CENTER single-utility): Slide ──
      { icon: 'buttons/more-notes/Slide.svg',                                    label: 'Slide',                  group: 2, op: { kind: 'slide' } },
      // ── Group 3 (RIGHT): Sharps (6) — mild → extreme, mirrors flats row ──
      { icon: 'buttons/more-notes/accidentalNaturalSharp.svg',                   label: 'Natural sharp',          group: 3, op: { kind: 'accidental-display', value: 'natural-sharp' } },
      { icon: 'buttons/more-notes/accidentalQuarterToneSharpStein.svg',          label: 'Quarter-tone sharp',     group: 3, op: { kind: 'accidental-display', value: 'quarter-sharp' } },
      { icon: 'buttons/more-notes/accidentalSharp.svg',                          label: 'Sharp',                  group: 3, alter: 1 },
      { icon: 'buttons/more-notes/accidentalThreeQuarterTonesSharpStein.svg',    label: 'Three-quarter sharp',    group: 3, op: { kind: 'accidental-display', value: 'three-quarters-sharp' } },
      { icon: 'buttons/more-notes/accidentalThreeQuarterTonesSharpStein-1.svg',  label: 'Three-quarter sharp (var)', group: 3, op: { kind: 'accidental-display', value: 'three-quarters-sharp' } },
      { icon: 'buttons/common/accidentalDoubleSharp.svg',                        label: 'Double sharp (×)',       group: 3, op: { kind: 'alter-ext', alter: 2 } },
    ],
    row2: [
      // ── Group 1 (LEFT): Grace notes + effects + dots (5) ──
      { icon: 'buttons/more-notes/acciaccatura.svg',                             label: 'Acciaccatura',           group: 1, op: { kind: 'grace', graceKind: 'acciaccatura' } },
      { icon: 'buttons/more-notes/appogiatura.svg',                              label: 'Appogiatura',            group: 1, op: { kind: 'grace', graceKind: 'appoggiatura' } },
      { icon: 'buttons/more-notes/pre-bend note.svg',                            label: 'Pre-bend',               group: 1, op: { kind: 'pre-bend' } },
      { icon: 'buttons/more-notes/breakedNotehead.svg',                          label: 'Broken notehead',        group: 1, op: { kind: 'notehead', shape: 'slashed' } },
      { icon: 'buttons/more-notes/DoubleDot.svg',                                label: 'More dots (cycle 0–3)',  group: 1, op: { kind: 'dots-more' } },
      // ── Group 2 (CENTER single-utility): Cue size on/off ──
      { icon: 'buttons/more-notes/onoff.svg',                                    label: 'Cue size on/off',        group: 2, op: { kind: 'cue-size' } },
      // ── Group 3 (RIGHT): Flats (6) — mild → extreme ──
      { icon: 'buttons/more-notes/accidentalNaturalFlat.svg',                    label: 'Natural flat',           group: 3, op: { kind: 'accidental-display', value: 'natural-flat' } },
      { icon: 'buttons/more-notes/accidentalQuarterToneFlatStein.svg',           label: 'Quarter-tone flat',      group: 3, op: { kind: 'accidental-display', value: 'quarter-flat' } },
      { icon: 'buttons/more-notes/accidentalFlat.svg',                           label: 'Flat',                   group: 3, alter: -1 },
      { icon: 'buttons/more-notes/accidentalThreeQuarterTonesFlatZimmermann.svg',label: 'Three-quarter flat',     group: 3, op: { kind: 'accidental-display', value: 'three-quarters-flat' } },
      { icon: 'buttons/more-notes/accidentalDoubleFlat.svg',                     label: 'Double flat',            group: 3, op: { kind: 'alter-ext', alter: -2 } },
      { icon: 'buttons/more-notes/accidentalTripleFlat.svg',                     label: 'Triple flat',            group: 3, op: { kind: 'alter-ext', alter: -3 } },
    ],
  },
  'Articulation': {
    // Layout 5+5 / 3+1 / 3+3 — row1 = SIMPLE marks, row2 = COMBINED marks
    // (where applicable), so reading vertically gives "atom → combo".
    // (Group 2 row2 has just Harmonic since Mute on/off were removed.)
    row1: [
      // ── Group 1: Simple articulation marks (5) ──
      { icon: 'buttons/articulations/articStaccatoAbove.svg',       label: 'Staccato',            group: 1, articulation: 'staccato' },
      { icon: 'buttons/articulations/articStaccatissimoAbove.svg',  label: 'Staccatissimo',       group: 1, articulation: 'staccatissimo' },
      { glyph: 'E4A4',                                              label: 'Tenuto',              group: 1, articulation: 'tenuto' },
      { icon: 'buttons/articulations/articAccentAbove.svg',         label: 'Accent',              group: 1, articulation: 'accent' },
      { icon: 'buttons/articulations/articMarcatoAbove.svg',        label: 'Marcato',             group: 1, articulation: 'strong-accent' },
      // ── Group 2: Slur + bowing (3) ──
      { icon: 'buttons/articulations/slur.svg',                     label: 'Slur (legato)',       group: 2, op: { kind: 'slur' } },
      { icon: 'buttons/articulations/stringsDownBow.svg',           label: 'Down bow',            group: 2, articulation: 'down-bow' },
      { icon: 'buttons/articulations/stringsUpBow.svg',             label: 'Up bow',              group: 2, articulation: 'up-bow' },
      // ── Group 3: Fermata + breath (3) ──
      { icon: 'buttons/articulations/fermataAbove.svg',             label: 'Fermata',             group: 3, articulation: 'fermata' },
      { icon: 'buttons/articulations/breathMarkComma.svg',          label: 'Breath mark',         group: 3, articulation: 'breath-mark' },
      { icon: 'buttons/articulations/Caesura.svg',                  label: 'Caesura',             group: 3, articulation: 'caesura' },
    ],
    row2: [
      // ── Group 1: Combined articulations (5) ──
      { icon: 'buttons/articulations/articTenutoStaccatoAbove.svg', label: 'Tenuto + staccato',   group: 1, op: { kind: 'articulations', names: ['staccato', 'tenuto'] } },
      { icon: 'buttons/articulations/articTenutoAccentAbove.svg',   label: 'Tenuto + accent',     group: 1, op: { kind: 'articulations', names: ['tenuto', 'accent'] } },
      { icon: 'buttons/articulations/articAccentStaccatoAbove.svg', label: 'Accent + staccato',   group: 1, op: { kind: 'articulations', names: ['staccato', 'accent'] } },
      { icon: 'buttons/articulations/articMarcatoStaccatoAbove.svg',label: 'Marcato + staccato',  group: 1, op: { kind: 'articulations', names: ['staccato', 'strong-accent'] } },
      { icon: 'buttons/articulations/articMarcatoTenutoAbove.svg',  label: 'Marcato + tenuto',    group: 1, op: { kind: 'articulations', names: ['tenuto', 'strong-accent'] } },
      // ── Group 2: Harmonic (1) ──
      // Mute on/off removed — no clean MusicXML/Verovio notation for them
      // (they rendered nothing). Removed per user 2026-06-10.
      { icon: 'buttons/articulations/stringsHarmonic.svg',          label: 'Harmonic',            group: 2, articulation: 'harmonic' },
      // ── Group 3: Fermata variants (3) ──
      { icon: 'buttons/articulations/fermataShortAbove.svg',        label: 'Short fermata',       group: 3, articulation: 'fermata-short' },
      { icon: 'buttons/articulations/fermataLongAbove.svg',         label: 'Long fermata',        group: 3, articulation: 'fermata-long' },
      { icon: 'buttons/articulations/fermataVeryLongAbove.svg',     label: 'Very long fermata',   group: 3, articulation: 'fermata-very-long' },
    ],
  },
  'Groups': {
    // Strictly note-grouping controls. Icons live in public/icons/buttons/groups/.
    //
    // Layout: 9+9 — three symmetric groups, 18 buttons total.
    //   Group 1 (3+3): Beam direction
    //   Group 2 (3+3): Tremolos (slashes + buzz roll)
    //   Group 3 (3+3): Advanced beam + phrase / stem helpers
    row1: [
      // ── Group 1: Beam direction — start side (3) ──
      { icon: 'buttons/groups/startbeam.svg',          label: 'Begin beam',                group: 1, op: { kind: 'beam', mode: 'start' } },
      { icon: 'buttons/groups/startsecondarybeam.svg', label: 'Start secondary beam',      group: 1, op: { kind: 'secondary-beam' } },
      { icon: 'buttons/groups/stemlet.svg',            label: 'Stemlet (beam over rest)',  group: 1, op: { kind: 'stemlet' } },
      // ── Group 2: Tremolos 1-3 slashes (3) ──
      { icon: 'buttons/groups/2tremolos.svg',          label: 'Tremolo (1 slash)',         group: 2, op: { kind: 'tremolo', count: 1 } },
      { icon: 'buttons/groups/4tremolos.svg',          label: 'Tremolo (2 slash)',         group: 2, op: { kind: 'tremolo', count: 2 } },
      { icon: 'buttons/groups/8tremolos.svg',          label: 'Tremolo (3 slash)',         group: 2, op: { kind: 'tremolo', count: 3 } },
      // ── Group 3: Advanced / phrase (3) ──
      { icon: 'buttons/groups/tremolowithnextstem.svg', label: 'Tremolo with next stem (click cycles 2→3→4→off)', group: 3, op: { kind: 'tremolo-between' } },
      { icon: 'buttons/groups/featherbeamaccel.svg',   label: 'Feathered beam (accel.)',   group: 3, op: { kind: 'feathered', dir: 'accel' } },
      // Tuplets — single dropdown button covering 2 → 9.
      {
        icon: 'buttons/groups/tuplet3.svg',
        label: 'Tuplets — pick figure',
        group: 3,
        dropdown: [
          { icon: 'buttons/groups/tuplet2.svg', label: 'Duplet (2 in 3)', op: { kind: 'tuplet', num: 2 } },
          { icon: 'buttons/groups/tuplet3.svg', label: 'Triplet',         op: { kind: 'tuplet', num: 3 } },
          { icon: 'buttons/groups/tuplet4.svg', label: 'Quadruplet',      op: { kind: 'tuplet', num: 4 } },
          { icon: 'buttons/groups/tuplet5.svg', label: 'Quintuplet',      op: { kind: 'tuplet', num: 5 } },
          { icon: 'buttons/groups/tuplet6.svg', label: 'Sextuplet',       op: { kind: 'tuplet', num: 6 } },
          { icon: 'buttons/groups/tuplet7.svg', label: 'Septuplet',       op: { kind: 'tuplet', num: 7 } },
          { icon: 'buttons/groups/tuplet8.svg', label: 'Octuplet',        op: { kind: 'tuplet', num: 8 } },
          { icon: 'buttons/groups/tuplet9.svg', label: 'Nonuplet',        op: { kind: 'tuplet', num: 9 } },
        ],
      },
    ],
    row2: [
      // ── Group 1: Beam direction — end side (3) ──
      { icon: 'buttons/groups/endbeam.svg',            label: 'End beam',                   group: 1, op: { kind: 'beam', mode: 'end' } },
      { icon: 'buttons/groups/middleofbeam.svg',       label: 'Middle of beam',             group: 1, op: { kind: 'beam', mode: 'continue' } },
      { icon: 'buttons/groups/nobeam.svg',             label: 'No beam (flag)',             group: 1, op: { kind: 'beam', mode: 'none' } },
      // ── Group 2: Tremolos 4-5 slashes + buzz roll (3) ──
      { icon: 'buttons/groups/16tremolos.svg',         label: 'Tremolo (4 slash)',          group: 2, op: { kind: 'tremolo', count: 4 } },
      { icon: 'buttons/groups/32tremolos.svg',         label: 'Tremolo (5 slash)',          group: 2, op: { kind: 'tremolo', count: 5 } },
      { icon: 'buttons/groups/buzzrolzonstem.svg',     label: 'Buzz roll on stem (z)',      group: 2, op: { kind: 'buzz-roll' } },
      // ── Group 3: Advanced finish + phrase (3) ──
      { icon: 'buttons/groups/featherbeamrit.svg',     label: 'Feathered beam (rit.)',      group: 3, op: { kind: 'feathered', dir: 'rit' } },
      { icon: 'buttons/articulations/slur.svg',        label: 'Slur (legato phrase)',       group: 3, op: { kind: 'slur' } },
      { icon: 'buttons/groups/Flip.svg',               label: 'Flip stem (up ↔ down)',      group: 3, op: { kind: 'flip-stem' } },
    ],
  },
  'Bars': {
    // Bar-level / structural markup. 10+10 = 20 buttons total.
    //   Group 1: Barlines     ↔ Navigation labels
    //   Group 2: Voltas       ↔ Time-signature changes
    //   Group 3: Text markers ↔ More time-signature options
    row1: [
      // ── Group 1: Barlines (4) ──
      { glyph: 'E040', label: 'Repeat start',      group: 1, op: { kind: 'barline', side: 'left',  style: 'repeat-start' } },
      { glyph: 'E041', label: 'Repeat end',        group: 1, op: { kind: 'barline', side: 'right', style: 'repeat-end'   } },
      { glyph: 'E031', label: 'Double bar',        group: 1, op: { kind: 'barline', side: 'right', style: 'double'       } },
      { glyph: 'E032', label: 'Final bar',         group: 1, op: { kind: 'barline', side: 'right', style: 'final'        } },
      // ── Group 2: Voltas (3) ──
      { sym:   '1.',  label: '1st volta',          group: 2 },
      { sym:   '2.',  label: '2nd volta',          group: 2 },
      { sym:   '3.',  label: '3rd volta',          group: 2 },
      // ── Group 3: Text markers (3) — flow control directions ──
      { sym: 'Fine',         label: 'Fine',         group: 3, op: { kind: 'words', text: 'Fine' } },
      { sym: 'To Coda',      label: 'To Coda',      group: 3, op: { kind: 'words', text: 'To Coda' } },
      { sym: 'D.C. al Fine', label: 'D.C. al Fine', group: 3, op: { kind: 'words', text: 'D.C. al Fine' } },
    ],
    row2: [
      // ── Group 1: Navigation labels (4) ──
      { glyph: 'E045', label: 'Da Capo',           group: 1, op: { kind: 'words', text: 'D.C.' } },
      { glyph: 'E046', label: 'Dal Segno',         group: 1, op: { kind: 'words', text: 'D.S.' } },
      { glyph: 'E047', label: 'Coda',              group: 1, op: { kind: 'words', text: 'Coda' } },
      { glyph: 'E048', label: 'Segno',             group: 1, op: { kind: 'words', text: 'Segno' } },
      // ── Group 2: Time-sig changes — simple meters (3) ──
      { glyph: 'E08A', label: 'Common time (4/4)', group: 2, op: { kind: 'time-sig-change', num: 4, den: 4 } },
      { glyph: 'E08B', label: 'Cut time (2/2)',    group: 2, op: { kind: 'time-sig-change', num: 2, den: 2 } },
      { sym: '3/4',    label: '3/4',                group: 2, op: { kind: 'time-sig-change', num: 3, den: 4 } },
      // ── Group 3: Time-sig changes — compound / odd meters (3) ──
      { sym: '6/8',   label: '6/8',                group: 3, op: { kind: 'time-sig-change', num: 6, den: 8 } },
      { sym: '9/8',   label: '9/8',                group: 3, op: { kind: 'time-sig-change', num: 9, den: 8 } },
      { sym: '12/8',  label: '12/8',               group: 3, op: { kind: 'time-sig-change', num: 12, den: 8 } },
    ],
  },
  'Symbols': {
    // Symmetric 7+7 / 2+2 / 3+3 layout. Vertically:
    //   • dynamics (volume)      ↔ clefs + pedal + ornaments
    //   • hairpins               ↔ octave shifts (gradient pitch range)
    //   • ornaments (decoration) ↔ techniques (style directions)
    // Time-sig changes moved to the new "Bars" tab.
    row1: [
      // ── Group 1: Dynamics (7) ──
      { glyph: 'E52B', label: 'pianissimo',         group: 1, op: { kind: 'dynamics', value: 'pp' } },
      { glyph: 'E520', label: 'piano',              group: 1, op: { kind: 'dynamics', value: 'p'  } },
      { glyph: 'E52C', label: 'mezzo piano',        group: 1, op: { kind: 'dynamics', value: 'mp' } },
      { glyph: 'E52D', label: 'mezzo forte',        group: 1, op: { kind: 'dynamics', value: 'mf' } },
      { glyph: 'E522', label: 'forte',              group: 1, op: { kind: 'dynamics', value: 'f'  } },
      { glyph: 'E52F', label: 'fortissimo',         group: 1, op: { kind: 'dynamics', value: 'ff' } },
      { glyph: 'E539', label: 'sforzando',          group: 1, op: { kind: 'dynamics', value: 'sfz'} },
      // ── Group 2: Hairpins + Pedal (3) ──
      { glyph: 'E53E', label: 'Crescendo',          group: 2, op: { kind: 'hairpin', hairpinKind: 'crescendo' } },
      { glyph: 'E53F', label: 'Diminuendo',         group: 2, op: { kind: 'hairpin', hairpinKind: 'diminuendo' } },
      { glyph: 'E650', label: 'Pedal down',         group: 2, op: { kind: 'pedal' } },
      // ── Group 3: Ornaments (3) ──
      { glyph: 'E566', label: 'Trill',              group: 3, op: { kind: 'ornament', name: 'trill-mark' } },
      { glyph: 'E56C', label: 'Mordent',            group: 3, op: { kind: 'ornament', name: 'mordent' } },
      { glyph: 'E567', label: 'Turn',               group: 3, op: { kind: 'ornament', name: 'turn' } },
    ],
    row2: [
      // ── Group 1: Clefs (3) + … to match dynamics, we just put 3 clefs + 4 octave-line markers? ──
      // Keep it clean: 7 = clefs(3) + octave-shifts(3) + 1 unused...
      // Simpler: split so each row2 group matches row1 count.
      // Row1 group1 = 7 → Row2 group1 = 7 = 3 clefs + 3 octave shifts + 1 sustain symbol? Pedal already moved up.
      // Use: 3 clefs + 4 string-technique words (pizz/arco/sord/...) instead.
      // Decision below: 3 clefs + 3 octave shifts + 1 placeholder = ugly.
      // Better: keep 3 clefs only in group1, drop down to 3, and re-balance row1.
      // We re-balanced row1: dynamics(7)|hairpins+pedal(3)|ornaments(3) = 13.
      // So row2 must be 13 too: clefs(3)|octave-shifts(3)|techniques(3) = 9 ≠ 13.
      // Add 4 more useful items: D.C./D.S./Coda/Segno were moved to Bars,
      // so keep here some text directions or repeat tempo markings.
      // Final choice — row2: clefs(3)+key-sig-glyphs(4)=7 | octave(3) | techniques(3).
      // Since key-sig changes don't have a backend op yet, fill group1 with
      // 4 string-bow technique words: "ord." (ordinario), "sul pont.",
      // "sul tasto", "col legno" — all real performance directions.
      { glyph: 'E050', label: 'Treble clef',        group: 1, op: { kind: 'clef-change', clef: 'treble' } },
      { glyph: 'E062', label: 'Bass clef',          group: 1, op: { kind: 'clef-change', clef: 'bass'   } },
      { glyph: 'E05C', label: 'Alto/Tenor clef',    group: 1, op: { kind: 'clef-change', clef: 'alto'   } },
      { sym: 'ord.',   label: 'Ordinario',          group: 1, op: { kind: 'words', text: 'ord.' } },
      { sym: 's.p.',   label: 'Sul ponticello',     group: 1, op: { kind: 'words', text: 'sul pont.' } },
      { sym: 's.t.',   label: 'Sul tasto',          group: 1, op: { kind: 'words', text: 'sul tasto' } },
      { sym: 'c.l.',   label: 'Col legno',          group: 1, op: { kind: 'words', text: 'col legno' } },
      // ── Group 2: Octave shifts (3) ──
      { sym: '8va',    label: '8va (octave up)',    group: 2, op: { kind: 'octave-shift', shift: '8va-up' } },
      { sym: '8vb',    label: '8vb (octave down)',  group: 2, op: { kind: 'octave-shift', shift: '8va-down' } },
      { sym: '15ma',   label: '15ma (two oct up)',  group: 2, op: { kind: 'octave-shift', shift: '15ma-up' } },
      // ── Group 3: Techniques (3) ──
      { sym: 'pizz.',  label: 'Pizzicato',          group: 3, op: { kind: 'words', text: 'pizz.' } },
      { sym: 'arco',   label: 'Arco',               group: 3, op: { kind: 'words', text: 'arco'  } },
      { sym: 'sord.',  label: 'With mute',          group: 3, op: { kind: 'words', text: 'sord.' } },
    ],
  },
};

// ─── Main panel ──────────────────────────────────────────────────────────────

interface BottomPanelProps {
  onAddVoice?: () => void;
  /** Called when a duration button is clicked. Receives the new duration.
   *  Page-level handler can both change selected items' duration AND update
   *  `activeDuration` in the editor store. If not provided, falls back to
   *  just setting active duration in the store. */
  onDurationClick?: (d: DurationBase) => void;
  /** Called when an accidental button is clicked. Applies alter to selected
   *  notes — or sets `pendingAlter` for the next keyboard input when nothing
   *  is selected. */
  onAccidentalClick?: (alter: -1 | 0 | 1) => void;
  /** Called when an articulation button is clicked. Toggles the named
   *  articulation (MusicXML tag) on every selected note. */
  onArticulationClick?: (name: string) => void;
  /** Generic op dispatcher for tie / dots / rest insert / ornament / dynamics
   *  / words / stem / tremolo. */
  onOp?: (op: ToolbarOp) => void;
}

export default function BottomPanel({
  onAddVoice = () => {},
  onDurationClick,
  onAccidentalClick,
  onArticulationClick,
  onOp,
}: BottomPanelProps) {
  const [tab, setTab] = useState<PanelTab>('Common');
  const content = TAB_CONTENT[tab];
  const noteInputActive = useEditorStore((s) => s.mode === 'note-input');
  const onToggleNoteInput = useEditorStore((s) => s.toggleNoteInput);
  const setActiveDuration = useEditorStore((s) => s.setActiveDuration);
  const handleDurationClick = onDurationClick ?? setActiveDuration;

  return (
    <div style={{
      // Float in the center horizontally
      position: 'absolute',
      left: '50%',
      bottom: 24,
      transform: 'translateX(-50%)',
      background: C.panel,
      border: `1px solid ${C.border}`,
      borderRadius: 14,
      padding: '10px 16px 14px',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      // Some headroom so wide tabs don't clip
      minWidth: 720,
    }}>
      {/* Tabs row, centered */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: 2,
      }}>
        {TABS.map(t => (
          <TabPill key={t} label={t} active={tab === t} onClick={() => setTab(t)} />
        ))}
      </div>

      {/* Main row: Note Input + content */}
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
        <NoteInputBlock
          active={noteInputActive}
          onToggle={onToggleNoteInput}
          onAddVoice={onAddVoice}
        />

        <TwoRowGrouped
          row1={content.row1}
          row2={content.row2}
          onDurationClick={handleDurationClick}
          onAccidentalClick={onAccidentalClick}
          onArticulationClick={onArticulationClick}
          onOp={onOp}
        />
      </div>
    </div>
  );
}
