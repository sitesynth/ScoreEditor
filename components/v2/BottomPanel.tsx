'use client';

import React, { useState } from 'react';
import { C } from '@/lib/theme';
import { useEditorStore, type DurationBase } from '@/lib/v2/editor-store';

// ─── Tabs ────────────────────────────────────────────────────────────────────

export type PanelTab = 'Common' | 'More Notes' | 'Articulation' | 'Groups' | 'Symbols';
const TABS: PanelTab[] = ['Common', 'More Notes', 'Articulation', 'Groups', 'Symbols'];

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
  | { kind: 'tremolo'; count: number }
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
  | { kind: 'tuplet'; num: 3 | 4 | 5 | 6 | 7 | 9 };

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
      { icon: 'buttons/common/articTenutoStaccatoAbove.svg',     label: 'Tenuto + staccato',  group: 3, op: { kind: 'articulations', names: ['staccato', 'tenuto'] } },
      { icon: 'buttons/common/articAccentAbove.svg',             label: 'Accent',             group: 3, articulation: 'accent' },
      { icon: 'buttons/common/articAccentStaccatoAbove.svg',     label: 'Accent + staccato',  group: 3, op: { kind: 'articulations', names: ['staccato', 'accent'] } },
      { icon: 'buttons/common/articTenutoAccentAbove.svg',       label: 'Tenuto + accent',    group: 3, op: { kind: 'articulations', names: ['tenuto', 'accent'] } },
    ],
  },
  'More Notes': {
    // Mirrors Common's structure: [main set] | [single utility] | [related
    // set], with two group-dividers per row.
    //   Row 1: 5 extended durations  | Double dotted | 6 effects/grace
    //   Row 2: 5 extended sharps     | Bracket       | 6 extended flats
    row1: [
      { icon: 'buttons/more-notes/noteDoubleWhole.svg',                          label: 'Double whole (breve)',   group: 1, duration: 'breve'  },
      { icon: 'buttons/more-notes/note64thUp.svg',                               label: '64th note',              group: 1, duration: '64th'   },
      { icon: 'buttons/more-notes/note128thUp.svg',                              label: '128th note',             group: 1, duration: '128th'  },
      // 256th — fills the gap between 128th and 512th AND shifts the Slur
      // slot to position 7 so it lines up vertically with the single-utility
      // slot in row 2.
      { icon: 'buttons/more-notes/note256thUp.svg',                              label: '256th note',             group: 1, duration: '256th'  },
      { icon: 'buttons/more-notes/note512thUp.svg',                              label: '512th note',             group: 1, duration: '512th'  },
      { icon: 'buttons/more-notes/note1024thUp.svg',                             label: '1024th note',            group: 1, duration: '1024th' },
      // Slur — single-utility slot, mirrors Bracket accidental's position
      // in row 2 group 2.
      { icon: 'buttons/more-notes/Slide.svg',                                    label: 'Slide',                  group: 2, op: { kind: 'slide' } },
      // Grace / effects, dots moved here at the end.
      { icon: 'buttons/more-notes/acciaccatura.svg',                             label: 'Acciaccatura',           group: 3, op: { kind: 'grace', graceKind: 'acciaccatura' } },
      { icon: 'buttons/more-notes/appogiatura.svg',                              label: 'Appogiatura',            group: 3, op: { kind: 'grace', graceKind: 'appoggiatura' } },
      { icon: 'buttons/more-notes/pre-bend note.svg',                            label: 'Pre-bend',               group: 3, op: { kind: 'pre-bend' } },
      { icon: 'buttons/more-notes/breakedNotehead.svg',                          label: 'Broken notehead',        group: 3, op: { kind: 'notehead', shape: 'slashed' } },
      { icon: 'buttons/more-notes/DoubleDot.svg',                                label: 'More dots (cycle 0–3)',  group: 3, op: { kind: 'dots-more' } },
    ],
    // Row 2 — accidentals ordered ASCENDING by alter value, from the
    //   deepest flat (−3) up through natural (0) to the highest sharp
    //   (+1.5 three-quarter). So flats come first.
    row2: [
      { icon: 'buttons/more-notes/accidentalTripleFlat.svg',                     label: 'Triple flat',            group: 1, op: { kind: 'alter-ext', alter: -3 } },
      { icon: 'buttons/more-notes/accidentalDoubleFlat.svg',                     label: 'Double flat',            group: 1, op: { kind: 'alter-ext', alter: -2 } },
      { icon: 'buttons/more-notes/accidentalThreeQuarterTonesFlatZimmermann.svg',label: 'Three-quarter flat',     group: 1, op: { kind: 'accidental-display', value: 'three-quarters-flat' } },
      { icon: 'buttons/more-notes/accidentalFlat.svg',                           label: 'Flat',                   group: 1, alter: -1 },
      { icon: 'buttons/more-notes/accidentalQuarterToneFlatStein.svg',           label: 'Quarter-tone flat',      group: 1, op: { kind: 'accidental-display', value: 'quarter-flat' } },
      { icon: 'buttons/more-notes/accidentalNaturalFlat.svg',                    label: 'Natural flat',           group: 1, op: { kind: 'accidental-display', value: 'natural-flat' } },
      // Single-utility slot, mirrors Slur position in row 1 group 2.
      // Cue size = render notehead small (optional / accompaniment notes).
      { icon: 'buttons/more-notes/onoff.svg',                                    label: 'Cue size on/off',        group: 2, op: { kind: 'cue-size' } },
      { icon: 'buttons/more-notes/accidentalNaturalSharp.svg',                   label: 'Natural sharp',          group: 3, op: { kind: 'accidental-display', value: 'natural-sharp' } },
      { icon: 'buttons/more-notes/accidentalQuarterToneSharpStein.svg',          label: 'Quarter-tone sharp',     group: 3, op: { kind: 'accidental-display', value: 'quarter-sharp' } },
      { icon: 'buttons/more-notes/accidentalSharp.svg',                          label: 'Sharp',                  group: 3, alter: 1 },
      { icon: 'buttons/more-notes/accidentalThreeQuarterTonesSharpStein.svg',    label: 'Three-quarter sharp',    group: 3, op: { kind: 'accidental-display', value: 'three-quarters-sharp' } },
      { icon: 'buttons/more-notes/accidentalThreeQuarterTonesSharpStein-1.svg',  label: 'Three-quarter sharp (var)', group: 3, op: { kind: 'accidental-display', value: 'three-quarters-sharp' } },
    ],
  },
  'Articulation': {
    row1: [
      { icon: 'buttons/articulations/articAccentAbove.svg',         label: 'Accent',              group: 1, articulation: 'accent' },
      { icon: 'buttons/articulations/articAccentStaccatoAbove.svg', label: 'Accent + staccato',   group: 1, op: { kind: 'articulations', names: ['staccato', 'accent'] } },
      { icon: 'buttons/articulations/articStaccatissimoAbove.svg',  label: 'Staccatissimo',       group: 1, articulation: 'staccatissimo' },
      { icon: 'buttons/articulations/articStaccatoAbove.svg',       label: 'Staccato',            group: 1, articulation: 'staccato' },
      { icon: 'buttons/articulations/articTenutoAccentAbove.svg',   label: 'Tenuto + accent',     group: 1, op: { kind: 'articulations', names: ['tenuto', 'accent'] } },
      { icon: 'buttons/articulations/articTenutoStaccatoAbove.svg', label: 'Tenuto + staccato',   group: 1, op: { kind: 'articulations', names: ['staccato', 'tenuto'] } },
      { icon: 'buttons/articulations/slur.svg',                     label: 'Slur (legato)',       group: 2, op: { kind: 'slur' } },
      { icon: 'buttons/articulations/stringsDownBow.svg',           label: 'Down bow',            group: 2, articulation: 'down-bow' },
      { icon: 'buttons/articulations/stringsUpBow.svg',             label: 'Up bow',              group: 2, articulation: 'up-bow' },
      { icon: 'buttons/articulations/stringsHarmonic.svg',          label: 'Harmonic',            group: 2, articulation: 'harmonic' },
      { icon: 'buttons/articulations/Mute on.svg',                  label: 'Mute on',             group: 2, articulation: 'mute-on' },
    ],
    row2: [
      { icon: 'buttons/articulations/articMarcatoAbove.svg',          label: 'Marcato',           group: 1, articulation: 'strong-accent' },
      { icon: 'buttons/articulations/articMarcatoStaccatoAbove.svg',  label: 'Marcato + staccato',group: 1, op: { kind: 'articulations', names: ['staccato', 'strong-accent'] } },
      { icon: 'buttons/articulations/articMarcatoTenutoAbove.svg',    label: 'Marcato + tenuto',  group: 1, op: { kind: 'articulations', names: ['tenuto', 'strong-accent'] } },
      { icon: 'buttons/articulations/fermataAbove.svg',               label: 'Fermata',           group: 2, articulation: 'fermata' },
      { icon: 'buttons/articulations/breathMarkComma.svg',            label: 'Breath mark',       group: 2, articulation: 'breath-mark' },
      { icon: 'buttons/articulations/Caesura.svg',                    label: 'Caesura',           group: 2, articulation: 'caesura' },
      { icon: 'buttons/articulations/fermataShortAbove.svg',          label: 'Short fermata',     group: 3, articulation: 'fermata-short' },
      { icon: 'buttons/articulations/fermataLongAbove.svg',           label: 'Long fermata',      group: 3, articulation: 'fermata-long' },
      { icon: 'buttons/articulations/fermataVeryLongAbove.svg',       label: 'Very long fermata', group: 3, articulation: 'fermata-very-long' },
      { icon: 'buttons/articulations/articUnstressBelow.svg',         label: 'Unstress',          group: 3, articulation: 'unstress' },
      { icon: 'buttons/articulations/Mute off.svg',                   label: 'Mute off',          group: 3, articulation: 'mute-off' },
    ],
  },
  'Groups': {
    row1: [
      { glyph: 'E883', label: 'Triplet',           group: 1, op: { kind: 'tuplet', num: 3 } },
      { glyph: 'E884', label: 'Quadruplet',        group: 1, op: { kind: 'tuplet', num: 4 } },
      { glyph: 'E885', label: 'Quintuplet',        group: 1, op: { kind: 'tuplet', num: 5 } },
      { glyph: 'E886', label: 'Sextuplet',         group: 1, op: { kind: 'tuplet', num: 6 } },
      { glyph: 'E887', label: 'Septuplet',         group: 1, op: { kind: 'tuplet', num: 7 } },
      { glyph: 'E889', label: 'Nonuplet',          group: 1, op: { kind: 'tuplet', num: 9 } },
      { glyph: 'E040', label: 'Repeat start',      group: 2, op: { kind: 'barline', side: 'left',  style: 'repeat-start' } },
      { glyph: 'E041', label: 'Repeat end',        group: 2, op: { kind: 'barline', side: 'right', style: 'repeat-end'   } },
      { glyph: 'E031', label: 'Double bar',        group: 2, op: { kind: 'barline', side: 'right', style: 'double'       } },
      { glyph: 'E032', label: 'Final bar',         group: 2, op: { kind: 'barline', side: 'right', style: 'final'        } },
      { sym:   '1.',  label: '1st volta',          group: 2 },
      { sym:   '2.',  label: '2nd volta',          group: 2 },
    ],
    row2: [
      { glyph: 'E210', label: 'Stem up',           group: 1, op: { kind: 'stem', dir: 'up' } },
      { glyph: 'E211', label: 'Stem down',         group: 1, op: { kind: 'stem', dir: 'down' } },
      { glyph: 'E215', label: 'Stem auto',         group: 1, op: { kind: 'stem', dir: 'auto' } },
      { glyph: 'E220', label: 'Tremolo 1',         group: 2, op: { kind: 'tremolo', count: 1 } },
      { glyph: 'E221', label: 'Tremolo 2',         group: 2, op: { kind: 'tremolo', count: 2 } },
      { glyph: 'E222', label: 'Tremolo 3',         group: 2, op: { kind: 'tremolo', count: 3 } },
      { glyph: 'E224', label: 'Tremolo 4',         group: 2, op: { kind: 'tremolo', count: 4 } },
      { glyph: 'E225', label: 'Tremolo 5',         group: 2, op: { kind: 'tremolo', count: 5 } },
      { glyph: 'E045', label: 'Da Capo',           group: 4, op: { kind: 'words', text: 'D.C.' } },
      { glyph: 'E046', label: 'Dal Segno',         group: 4, op: { kind: 'words', text: 'D.S.' } },
      { glyph: 'E047', label: 'Coda',              group: 4, op: { kind: 'words', text: 'Coda' } },
      { glyph: 'E048', label: 'Segno',             group: 4, op: { kind: 'words', text: 'Segno' } },
    ],
  },
  'Symbols': {
    row1: [
      // Dynamics
      { glyph: 'E52B', label: 'pianissimo',        group: 1, op: { kind: 'dynamics', value: 'pp' } },
      { glyph: 'E520', label: 'piano',             group: 1, op: { kind: 'dynamics', value: 'p'  } },
      { glyph: 'E52C', label: 'mezzo piano',       group: 1, op: { kind: 'dynamics', value: 'mp' } },
      { glyph: 'E52D', label: 'mezzo forte',       group: 1, op: { kind: 'dynamics', value: 'mf' } },
      { glyph: 'E522', label: 'forte',             group: 1, op: { kind: 'dynamics', value: 'f'  } },
      { glyph: 'E52F', label: 'fortissimo',        group: 1, op: { kind: 'dynamics', value: 'ff' } },
      { glyph: 'E539', label: 'sforzando',         group: 1, op: { kind: 'dynamics', value: 'sfz'} },
      // Hairpins — real wedge spans. Single selection auto-pairs to the
      // next note in the part; range selection spans first→last selected.
      { glyph: 'E53E', label: 'Crescendo',         group: 2, op: { kind: 'hairpin', hairpinKind: 'crescendo' } },
      { glyph: 'E53F', label: 'Diminuendo',        group: 2, op: { kind: 'hairpin', hairpinKind: 'diminuendo' } },
      // Ornaments
      { glyph: 'E566', label: 'Trill',             group: 3, op: { kind: 'ornament', name: 'trill-mark' } },
      { glyph: 'E56C', label: 'Mordent',           group: 3, op: { kind: 'ornament', name: 'mordent' } },
      { glyph: 'E567', label: 'Turn',              group: 3, op: { kind: 'ornament', name: 'turn' } },
    ],
    row2: [
      // Clefs — mid-measure clef change before the selected note.
      { glyph: 'E050', label: 'Treble clef',       group: 1, op: { kind: 'clef-change', clef: 'treble' } },
      { glyph: 'E062', label: 'Bass clef',         group: 1, op: { kind: 'clef-change', clef: 'bass'   } },
      { glyph: 'E05C', label: 'Alto/Tenor clef',   group: 1, op: { kind: 'clef-change', clef: 'alto'   } },
      // Time sig change before selected note.
      { glyph: 'E08A', label: 'Common time',       group: 2, op: { kind: 'time-sig-change', num: 4, den: 4 } },
      { glyph: 'E08B', label: 'Cut time',          group: 2, op: { kind: 'time-sig-change', num: 2, den: 2 } },
      { glyph: 'E084', label: '3/4',               group: 2, op: { kind: 'time-sig-change', num: 3, den: 4 } },
      // Octave-shift / pedal spans.
      { sym: '8va',    label: '8va (octave up)',    group: 3, op: { kind: 'octave-shift', shift: '8va-up' } },
      { sym: '8vb',    label: '8vb (octave down)',  group: 3, op: { kind: 'octave-shift', shift: '8va-down' } },
      { sym: '15ma',   label: '15ma (two oct up)',  group: 3, op: { kind: 'octave-shift', shift: '15ma-up' } },
      { glyph: 'E650', label: 'Pedal down',        group: 4, op: { kind: 'pedal' } },
      // Techniques — text directions (toggle on selected notes).
      { sym: 'pizz.',  label: 'Pizzicato',         group: 5, op: { kind: 'words', text: 'pizz.' } },
      { sym: 'arco',   label: 'Arco',              group: 5, op: { kind: 'words', text: 'arco'  } },
      { sym: 'sord.',  label: 'With mute',         group: 5, op: { kind: 'words', text: 'sord.' } },
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 4 }}>
          <ButtonRow
            items={content.row1}
            onDurationClick={handleDurationClick}
            onAccidentalClick={onAccidentalClick}
            onArticulationClick={onArticulationClick}
            onOp={onOp}
          />
          <ButtonRow
            items={content.row2}
            onDurationClick={handleDurationClick}
            onAccidentalClick={onAccidentalClick}
            onArticulationClick={onArticulationClick}
            onOp={onOp}
          />
        </div>
      </div>
    </div>
  );
}
