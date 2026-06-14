'use client';

import React, { useMemo, useState } from 'react';
import { C } from '@/lib/theme';
import { type ToolbarOp } from './BottomPanel';
import type { DurationBase } from '@/lib/v2/music-model';

/** The four dispatch handlers the palette shares with the BottomPanel toolbar,
 *  so a palette button behaves EXACTLY like the same button in the toolbar. */
export interface PaletteHandlers {
  onOp?: (op: ToolbarOp) => void;
  onArticulationClick?: (name: string) => void;
  onDurationClick?: (d: DurationBase) => void;
  onAccidentalClick?: (alter: -1 | 0 | 1) => void;
}

// ─── Item ────────────────────────────────────────────────────────────────────

interface PaletteItem {
  /** Path under /icons/, e.g. "smufl/clefs/gClef.png". Mutually-exclusive with `glyph`. */
  icon?: string;
  /** Bravura SMuFL codepoint hex (e.g. "E1D5"). Mutually-exclusive with `icon`. */
  glyph?: string;
  label: string;
  /** Use dark→white inversion (for dark PNGs). */
  invert?: boolean;
  // ── Action (mirror BottomPanel's RowItem so a palette button dispatches the
  //    SAME notation op as the toolbar). Exactly one is set on a live button;
  //    items with none are inert catalog glyphs (no backend op yet). ──
  /** Generic op → onOp (tie, dynamics, ornament, barline, clef-change, …). */
  op?: ToolbarOp;
  /** Articulation MusicXML name → onArticulationClick. */
  articulation?: string;
  /** Basic accidental alter → onAccidentalClick (applies to selection or arms next note). */
  alter?: -1 | 0 | 1;
  /** Duration → onDurationClick. */
  duration?: DurationBase;
  /** Escape hatch for bespoke handlers (rarely used). */
  onClick?: () => void;
}

interface PaletteGroup {
  name: string;
  defaultOpen?: boolean;
  /** How many items to show before the "More" button. Default 8. */
  defaultVisible?: number;
  items: PaletteItem[];
}

// ─── Item lists (popular first, then more variants) ─────────────────────────
// Bravura covers all standard SMuFL glyphs via the webfont; SVG/PNG used where
// we have the file in public/icons/.

const PALETTES: PaletteGroup[] = [
  {
    name: 'Clefs',
    defaultOpen: true,
    defaultVisible: 8,
    items: [
      { icon: 'smufl/clefs/gClef.png',      label: 'Treble',                   invert: true, op: { kind: 'clef-change', clef: 'treble' } },
      { icon: 'smufl/clefs/gClef8va.png',   label: 'Treble 8va',               invert: true },
      { icon: 'smufl/clefs/gClef8vb.png',   label: 'Treble 8vb',               invert: true },
      { icon: 'smufl/clefs/gClef15ma.png',  label: 'Treble 15ma',              invert: true },
      { icon: 'smufl/clefs/fClef.png',      label: 'Bass',                     invert: true, op: { kind: 'clef-change', clef: 'bass' } },
      { icon: 'smufl/clefs/fClef8va.png',   label: 'Bass 8va',                 invert: true },
      { icon: 'smufl/clefs/fClef8vb.png',   label: 'Bass 8vb',                 invert: true },
      { icon: 'smufl/clefs/cClef.png',      label: 'C clef (alto/tenor)',      invert: true, op: { kind: 'clef-change', clef: 'alto' } },
      // ── More variants ──
      { icon: 'smufl/clefs/gClef15mb.png',  label: 'Treble 15mb',              invert: true },
      { icon: 'smufl/clefs/cClef8vb.png',   label: 'C clef 8vb',               invert: true },
      { icon: 'smufl/clefs/fClef15ma.png',  label: 'Bass 15ma',                invert: true },
      { icon: 'smufl/clefs/fClef15mb.png',  label: 'Bass 15mb',                invert: true },
      { icon: 'smufl/clefs/cClefFrench.png',     label: 'C clef French',       invert: true },
      { icon: 'smufl/clefs/cClefReversed.png',   label: 'C clef reversed',     invert: true },
      { icon: 'smufl/clefs/cClefSmall.png',      label: 'C clef small',        invert: true },
      { icon: 'smufl/clefs/cClefSquare.png',     label: 'C clef square',       invert: true },
      { icon: 'smufl/clefs/fClef19thCentury.png',label: 'Bass 19th century',   invert: true },
      { icon: 'smufl/clefs/6stringTabClef.png',  label: '6-string TAB',        invert: true },
      { icon: 'smufl/clefs/4stringTabClef.png',  label: '4-string TAB',        invert: true },
      { icon: 'smufl/clefs/accdnDiatonicClef.png',label: 'Accordion diatonic', invert: true },
      { icon: 'smufl/clefs/bridgeClef.png',      label: 'Bridge',              invert: true },
    ],
  },
  {
    name: 'Key signatures',
    defaultVisible: 8,
    items: [
      { glyph: 'E260', label: '1 flat',   op: { kind: 'key-sig', fifths: -1 } },
      { glyph: 'E260', label: '2 flats',  op: { kind: 'key-sig', fifths: -2 } },
      { glyph: 'E260', label: '3 flats',  op: { kind: 'key-sig', fifths: -3 } },
      { glyph: 'E260', label: '4 flats',  op: { kind: 'key-sig', fifths: -4 } },
      { glyph: 'E260', label: '5 flats',  op: { kind: 'key-sig', fifths: -5 } },
      { glyph: 'E261', label: 'C major / a minor', op: { kind: 'key-sig', fifths: 0 } },
      { glyph: 'E262', label: '1 sharp',  op: { kind: 'key-sig', fifths: 1 } },
      { glyph: 'E262', label: '2 sharps', op: { kind: 'key-sig', fifths: 2 } },
      { glyph: 'E262', label: '3 sharps', op: { kind: 'key-sig', fifths: 3 } },
      { glyph: 'E262', label: '4 sharps', op: { kind: 'key-sig', fifths: 4 } },
      { glyph: 'E262', label: '5 sharps', op: { kind: 'key-sig', fifths: 5 } },
    ],
  },
  {
    name: 'Time signatures',
    defaultVisible: 8,
    items: [
      { icon: 'smufl/timesigs/timeSigCommon.svg',    label: 'Common time', op: { kind: 'time-sig-change', num: 4, den: 4 } },
      { icon: 'smufl/timesigs/timeSigCutCommon.svg', label: 'Cut time',    op: { kind: 'time-sig-change', num: 2, den: 2 } },
      { icon: 'smufl/timesigs/timeSig2over4.svg',    label: '2/4',  op: { kind: 'time-sig-change', num: 2,  den: 4 } },
      { icon: 'smufl/timesigs/timeSig3over4.svg',    label: '3/4',  op: { kind: 'time-sig-change', num: 3,  den: 4 } },
      { icon: 'smufl/timesigs/timeSig4over4.svg',    label: '4/4',  op: { kind: 'time-sig-change', num: 4,  den: 4 } },
      { icon: 'smufl/timesigs/timeSig5over4.svg',    label: '5/4',  op: { kind: 'time-sig-change', num: 5,  den: 4 } },
      { icon: 'smufl/timesigs/timeSig6over4.svg',    label: '6/4',  op: { kind: 'time-sig-change', num: 6,  den: 4 } },
      { icon: 'smufl/timesigs/timeSig6over8.svg',    label: '6/8',  op: { kind: 'time-sig-change', num: 6,  den: 8 } },
      // More
      { icon: 'smufl/timesigs/timeSig2over2.svg',    label: '2/2',  op: { kind: 'time-sig-change', num: 2,  den: 2 } },
      { icon: 'smufl/timesigs/timeSig3over2.svg',    label: '3/2',  op: { kind: 'time-sig-change', num: 3,  den: 2 } },
      { icon: 'smufl/timesigs/timeSig3over8.svg',    label: '3/8',  op: { kind: 'time-sig-change', num: 3,  den: 8 } },
      { icon: 'smufl/timesigs/timeSig5over8.svg',    label: '5/8',  op: { kind: 'time-sig-change', num: 5,  den: 8 } },
      { icon: 'smufl/timesigs/timeSig7over8.svg',    label: '7/8',  op: { kind: 'time-sig-change', num: 7,  den: 8 } },
      { icon: 'smufl/timesigs/timeSig9over8.svg',    label: '9/8',  op: { kind: 'time-sig-change', num: 9,  den: 8 } },
      { icon: 'smufl/timesigs/timeSig12over8.svg',   label: '12/8', op: { kind: 'time-sig-change', num: 12, den: 8 } },
    ],
  },
  {
    name: 'Tempo',
    defaultVisible: 6,
    items: [
      { glyph: 'E1D5', label: 'Quarter = bpm' },
      { glyph: 'E1D3', label: 'Half = bpm' },
      { glyph: 'E1D7', label: 'Eighth = bpm' },
      { glyph: 'E1D5', label: 'Dotted ♩ = bpm' },
      { glyph: 'E520', label: 'Largo',       op: { kind: 'words', text: 'Largo' } },
      { glyph: 'E520', label: 'Adagio',      op: { kind: 'words', text: 'Adagio' } },
      // More
      { glyph: 'E520', label: 'Andante',     op: { kind: 'words', text: 'Andante' } },
      { glyph: 'E520', label: 'Moderato',    op: { kind: 'words', text: 'Moderato' } },
      { glyph: 'E520', label: 'Allegro',     op: { kind: 'words', text: 'Allegro' } },
      { glyph: 'E520', label: 'Presto',      op: { kind: 'words', text: 'Presto' } },
      { glyph: 'E520', label: 'Prestissimo', op: { kind: 'words', text: 'Prestissimo' } },
      { glyph: 'E520', label: 'Accelerando', op: { kind: 'words', text: 'accel.' } },
      { glyph: 'E520', label: 'Ritardando',  op: { kind: 'words', text: 'rit.' } },
      { glyph: 'E520', label: 'rit.',        op: { kind: 'words', text: 'rit.' } },
      { glyph: 'E520', label: 'accel.',      op: { kind: 'words', text: 'accel.' } },
    ],
  },
  {
    name: 'Accidentals',
    defaultVisible: 8,
    items: [
      { icon: 'smufl/accidentals/accidentalDoubleFlat.svg',   label: 'Double flat',  op: { kind: 'alter-ext', alter: -2 } },
      { icon: 'smufl/accidentals/accidentalFlat.svg',         label: 'Flat',         alter: -1 },
      { icon: 'smufl/accidentals/accidentalNatural.svg',      label: 'Natural',      alter: 0 },
      { icon: 'smufl/accidentals/accidentalSharp.svg',        label: 'Sharp',        alter: 1 },
      { icon: 'smufl/accidentals/accidentalDoubleSharp.svg',  label: 'Double sharp', op: { kind: 'alter-ext', alter: 2 } },
      { icon: 'smufl/accidentals/accidentalTripleFlat.svg',   label: 'Triple flat',  op: { kind: 'alter-ext', alter: -3 } },
      { icon: 'smufl/accidentals/accidentalTripleSharp.svg',  label: 'Triple sharp', op: { kind: 'alter-ext', alter: 3 } },
      { icon: 'smufl/accidentals/BracketAccidental.svg',      label: 'Bracketed',    op: { kind: 'bracket-accidental' } },
      // More
      { icon: 'smufl/accidentals/accidentalNaturalFlat.svg',  label: 'Natural flat',  op: { kind: 'accidental-display', value: 'natural-flat' } },
      { icon: 'smufl/accidentals/accidentalNaturalSharp.svg', label: 'Natural sharp', op: { kind: 'accidental-display', value: 'natural-sharp' } },
      { icon: 'smufl/accidentals/accidentalSharpSharp.svg',   label: 'Sharp-sharp',   op: { kind: 'alter-ext', alter: 2 } },
      { icon: 'smufl/accidentals/accidentalFlatParens.svg',     label: '(♭)' },
      { icon: 'smufl/accidentals/accidentalNaturalParens.svg',  label: '(♮)' },
      { icon: 'smufl/accidentals/accidentalSharpParens.svg',    label: '(♯)' },
      { icon: 'smufl/accidentals/accidentalDoubleFlatParens.svg',  label: '(♭♭)' },
      { icon: 'smufl/accidentals/accidentalDoubleSharpParens.svg', label: '(𝄪)' },
      { icon: 'smufl/accidentals/accidentalQuarterToneFlatStein.svg',          label: 'Quarter-tone ♭', op: { kind: 'accidental-display', value: 'quarter-flat' } },
      { icon: 'smufl/accidentals/accidentalQuarterToneSharpStein.svg',         label: 'Quarter-tone ♯', op: { kind: 'accidental-display', value: 'quarter-sharp' } },
      { icon: 'smufl/accidentals/accidentalThreeQuarterTonesFlatZimmermann.svg', label: '¾-tone ♭ (Zimm.)', op: { kind: 'accidental-display', value: 'three-quarters-flat' } },
      { icon: 'smufl/accidentals/accidentalThreeQuarterTonesSharpStein.svg',     label: '¾-tone ♯ (Stein)', op: { kind: 'accidental-display', value: 'three-quarters-sharp' } },
      { icon: 'smufl/accidentals/accidentalNarrowReversedFlat.svg',     label: 'Narrow rev. ♭' },
      { icon: 'smufl/accidentals/accidentalNarrowReversedFlatAndFlat.svg', label: 'Narrow rev. ♭ + ♭' },
      // Bravura microtonal extras
      { glyph: 'E270', label: 'Half-tone ♯ (arrow up)' },
      { glyph: 'E271', label: 'Half-tone ♭ (arrow down)' },
      { glyph: 'E272', label: 'Quarter-tone ♯ (arrow up)' },
      { glyph: 'E273', label: 'Quarter-tone ♭ (arrow down)' },
      { glyph: 'E280', label: 'Buyuk mucenneb ♭' },
      { glyph: 'E281', label: 'Bakiye ♭' },
      { glyph: 'E2C0', label: 'Sori (Persian)' },
      { glyph: 'E2C1', label: 'Koron (Persian)' },
    ],
  },
  {
    name: 'Dynamics',
    defaultVisible: 8,
    items: [
      { glyph: 'E52B', label: 'pp (pianissimo)',  op: { kind: 'dynamics', value: 'pp'  } },
      { glyph: 'E520', label: 'p (piano)',        op: { kind: 'dynamics', value: 'p'   } },
      { glyph: 'E52C', label: 'mp (mezzo piano)', op: { kind: 'dynamics', value: 'mp'  } },
      { glyph: 'E52D', label: 'mf (mezzo forte)', op: { kind: 'dynamics', value: 'mf'  } },
      { glyph: 'E522', label: 'f (forte)',        op: { kind: 'dynamics', value: 'f'   } },
      { glyph: 'E52F', label: 'ff (fortissimo)',  op: { kind: 'dynamics', value: 'ff'  } },
      { glyph: 'E53E', label: 'Crescendo hairpin',  op: { kind: 'hairpin', hairpinKind: 'crescendo'  } },
      { glyph: 'E53F', label: 'Diminuendo hairpin', op: { kind: 'hairpin', hairpinKind: 'diminuendo' } },
      // More
      { glyph: 'E52A', label: 'ppp',              op: { kind: 'dynamics', value: 'ppp'  } },
      { glyph: 'E531', label: 'fff',              op: { kind: 'dynamics', value: 'fff'  } },
      { glyph: 'E539', label: 'sfz (sforzando)',  op: { kind: 'dynamics', value: 'sfz'  } },
      { glyph: 'E537', label: 'sf',               op: { kind: 'dynamics', value: 'sf'   } },
      { glyph: 'E53C', label: 'sffz',             op: { kind: 'dynamics', value: 'sffz' } },
      { glyph: 'E535', label: 'fp',               op: { kind: 'dynamics', value: 'fp'   } },
      { glyph: 'E534', label: 'pf',               op: { kind: 'dynamics', value: 'pf'   } },
      { glyph: 'E541', label: 'niente (n)',       op: { kind: 'dynamics', value: 'n'    } },
      { glyph: 'E538', label: 'rfz (rinforzando)',op: { kind: 'dynamics', value: 'rfz'  } },
      { glyph: 'E536', label: 'fz',               op: { kind: 'dynamics', value: 'fz'   } },
      { glyph: 'E529', label: 'pppp',             op: { kind: 'dynamics', value: 'pppp' } },
      { glyph: 'E532', label: 'ffff',             op: { kind: 'dynamics', value: 'ffff' } },
    ],
  },
  {
    name: 'Articulations',
    defaultVisible: 8,
    items: [
      { icon: 'buttons/articulations/articAccentAbove.svg',          label: 'Accent',        articulation: 'accent' },
      { icon: 'buttons/articulations/articStaccatoAbove.svg',        label: 'Staccato',      articulation: 'staccato' },
      { icon: 'buttons/articulations/articStaccatissimoAbove.svg',   label: 'Staccatissimo', articulation: 'staccatissimo' },
      { icon: 'buttons/articulations/articMarcatoAbove.svg',         label: 'Marcato',       articulation: 'strong-accent' },
      { icon: 'buttons/articulations/fermataAbove.svg',              label: 'Fermata',       articulation: 'fermata' },
      { icon: 'buttons/articulations/breathMarkComma.svg',           label: 'Breath mark',   articulation: 'breath-mark' },
      { icon: 'buttons/articulations/stringsDownBow.svg',            label: 'Down bow',      articulation: 'down-bow' },
      { icon: 'buttons/articulations/stringsUpBow.svg',              label: 'Up bow',        articulation: 'up-bow' },
      // More
      { icon: 'buttons/articulations/articAccentStaccatoAbove.svg',  label: 'Accent + staccato',   op: { kind: 'articulations', names: ['staccato', 'accent'] } },
      { icon: 'buttons/articulations/articTenutoAccentAbove.svg',    label: 'Tenuto + accent',     op: { kind: 'articulations', names: ['tenuto', 'accent'] } },
      { icon: 'buttons/articulations/articTenutoStaccatoAbove.svg',  label: 'Tenuto + staccato',   op: { kind: 'articulations', names: ['staccato', 'tenuto'] } },
      { icon: 'buttons/articulations/articMarcatoStaccatoAbove.svg', label: 'Marcato + staccato',  op: { kind: 'articulations', names: ['staccato', 'strong-accent'] } },
      { icon: 'buttons/articulations/articMarcatoTenutoAbove.svg',   label: 'Marcato + tenuto',    op: { kind: 'articulations', names: ['tenuto', 'strong-accent'] } },
      { icon: 'buttons/articulations/articUnstressBelow.svg',        label: 'Unstress',      articulation: 'unstress' },
      { icon: 'buttons/articulations/fermataShortAbove.svg',         label: 'Short fermata',     articulation: 'fermata-short' },
      { icon: 'buttons/articulations/fermataLongAbove.svg',          label: 'Long fermata',      articulation: 'fermata-long' },
      { icon: 'buttons/articulations/fermataVeryLongAbove.svg',      label: 'Very long fermata', articulation: 'fermata-very-long' },
      { icon: 'buttons/articulations/Caesura.svg',                   label: 'Caesura',       articulation: 'caesura' },
      { icon: 'buttons/articulations/stringsHarmonic.svg',           label: 'Harmonic',      articulation: 'harmonic' },
      { icon: 'buttons/articulations/stringsThumbPosition.svg',      label: 'Thumb position' },
      { icon: 'buttons/articulations/Mute on.svg',                   label: 'Mute on' },
      { icon: 'buttons/articulations/Mute off.svg',                  label: 'Mute off' },
      { glyph: 'E4BA', label: 'Laissez vibrer' },
      { glyph: 'E4B6', label: 'Stress',          articulation: 'stress' },
      { glyph: 'E4B7', label: 'Unstress (above)', articulation: 'unstress' },
    ],
  },
  {
    name: 'Ornaments',
    defaultVisible: 8,
    items: [
      { glyph: 'E566', label: 'Trill',         op: { kind: 'ornament', name: 'trill-mark' } },
      { glyph: 'E56C', label: 'Short mordent', op: { kind: 'ornament', name: 'mordent' } },
      { glyph: 'E56D', label: 'Mordent',       op: { kind: 'ornament', name: 'inverted-mordent' } },
      { glyph: 'E567', label: 'Turn',          op: { kind: 'ornament', name: 'turn' } },
      { glyph: 'E568', label: 'Inverted turn', op: { kind: 'ornament', name: 'inverted-turn' } },
      { glyph: 'E569', label: 'Turn slash' },
      { glyph: 'E5B0', label: 'Tremolo 1 (single)', op: { kind: 'tremolo', count: 1 } },
      { glyph: 'E5B1', label: 'Tremolo 2',     op: { kind: 'tremolo', count: 2 } },
      // More
      { glyph: 'E5B2', label: 'Tremolo 3',     op: { kind: 'tremolo', count: 3 } },
      { glyph: 'E5B3', label: 'Tremolo 4',     op: { kind: 'tremolo', count: 4 } },
      { glyph: 'E56A', label: 'Turn with slash' },
      { glyph: 'E56B', label: 'Turn up' },
      { glyph: 'E56E', label: 'Mordent with upper prefix' },
      { glyph: 'E56F', label: 'Mordent with lower prefix' },
      { glyph: 'E570', label: 'Trill with mordent' },
      { glyph: 'E571', label: 'Pre-beat slide' },
      { glyph: 'E572', label: 'Schleifer' },
      { glyph: 'E573', label: 'Haydn ornament' },
      { glyph: 'E59D', label: 'Trill wiggle segment' },
    ],
  },
  {
    name: 'Repeats & jumps',
    defaultVisible: 8,
    items: [
      { icon: 'smufl/repeats/repeatLeft.svg',          label: 'Repeat start', op: { kind: 'barline', side: 'left',  style: 'repeat-start' } },
      { icon: 'smufl/repeats/repeatRight.svg',         label: 'Repeat end',   op: { kind: 'barline', side: 'right', style: 'repeat-end' } },
      { icon: 'smufl/repeats/repeatRightLeft.svg',     label: 'Repeat both' },
      { icon: 'smufl/repeats/daCapo.svg',              label: 'D.C.',   op: { kind: 'words', text: 'D.C.' } },
      { icon: 'smufl/repeats/dalSegno.svg',            label: 'D.S.',   op: { kind: 'words', text: 'D.S.' } },
      { icon: 'smufl/repeats/coda.svg',                label: 'Coda',   op: { kind: 'words', text: 'Coda' } },
      { icon: 'smufl/repeats/segno.svg',               label: 'Segno',  op: { kind: 'words', text: 'Segno' } },
      { icon: 'smufl/repeats/repeatDots.svg',          label: 'Repeat dots' },
      // More
      { icon: 'smufl/repeats/repeatRightLeftThick.svg',label: 'Thick both' },
      { icon: 'smufl/repeats/leftRepeatSmall.svg',     label: 'Small left' },
      { icon: 'smufl/repeats/rightRepeatSmall.svg',    label: 'Small right' },
      { icon: 'smufl/repeats/repeatDot.svg',           label: 'Repeat dot' },
      { icon: 'smufl/repeats/codaSquare.svg',          label: 'Square coda' },
      { icon: 'smufl/repeats/codaJapanese.svg',        label: 'Japanese coda' },
      { icon: 'smufl/repeats/segnoSerpent1.svg',       label: 'Serpent segno' },
      { icon: 'smufl/repeats/segnoSerpent2.svg',       label: 'Serpent segno 2' },
      { icon: 'smufl/repeats/segnoJapanese.svg',       label: 'Japanese segno' },
    ],
  },
  {
    name: 'Barlines',
    defaultVisible: 8,
    items: [
      { icon: 'smufl/barlines/barlineSingle.svg',        label: 'Single' },
      { icon: 'smufl/barlines/barlineDouble.svg',        label: 'Double', op: { kind: 'barline', side: 'right', style: 'double' } },
      { icon: 'smufl/barlines/barlineFinal.svg',         label: 'Final',  op: { kind: 'barline', side: 'right', style: 'final' } },
      { icon: 'smufl/barlines/barlineReverseFinal.svg',  label: 'Reverse final' },
      { icon: 'smufl/barlines/barlineDashed.svg',        label: 'Dashed' },
      { icon: 'smufl/barlines/barlineDotted.svg',        label: 'Dotted' },
      { icon: 'smufl/barlines/barlineShort.svg',         label: 'Short' },
      { icon: 'smufl/barlines/barlineTick.svg',          label: 'Tick' },
    ],
  },
  {
    name: 'Keyboard',
    defaultVisible: 6,
    items: [
      { glyph: 'E650', label: 'Pedal mark (Ped.)', op: { kind: 'pedal' } },
      { glyph: 'E655', label: 'Pedal up (*)' },
      { glyph: 'E659', label: 'Half pedal' },
      { glyph: 'E658', label: 'Pedal heel toe' },
      { glyph: 'E65A', label: 'Soft pedal (una corda)' },
      { glyph: 'E65B', label: 'Soft pedal release' },
      // More
      { glyph: 'E660', label: 'Sostenuto pedal' },
      { glyph: 'E661', label: 'Sostenuto pedal release' },
      { glyph: 'E66A', label: 'Pedal P' },
      { glyph: 'E66B', label: 'Pedal D' },
      { glyph: 'E664', label: 'Heel toe combined' },
    ],
  },
  {
    name: 'Brackets & staves',
    defaultVisible: 8,
    items: [
      { icon: 'smufl/brackets/Brace.svg',                label: 'Brace' },
      { icon: 'smufl/brackets/reversedBrace.svg',        label: 'Reversed brace' },
      { icon: 'smufl/brackets/bracket.svg',              label: 'Bracket' },
      { icon: 'smufl/brackets/bracketTop.svg',           label: 'Bracket top' },
      { icon: 'smufl/brackets/bracketBottom.svg',        label: 'Bracket bottom' },
      { icon: 'smufl/brackets/reversedBracketTop.svg',   label: 'Reversed bracket top' },
      { icon: 'smufl/brackets/splitBarDivider.svg',      label: 'Split bar divider' },
      { icon: 'smufl/barlines/staff5LinesWide.svg',      label: '5-line staff' },
      // More
      { icon: 'smufl/barlines/staff6LinesWide.svg',      label: '6-line staff' },
      { icon: 'smufl/brackets/staffDivideArrowDown.svg', label: 'Divider ↓' },
      { icon: 'smufl/brackets/staffDivideArrowUp.svg',   label: 'Divider ↑' },
      { icon: 'smufl/brackets/staffDivideArrowUpDown.svg', label: 'Divider ↕' },
      { icon: 'smufl/brackets/systemDividerLong.svg',    label: 'System divider' },
      { icon: 'smufl/brackets/systemDividerExtraLong.svg', label: 'System divider (long)' },
    ],
  },
];

// ─── Item button ─────────────────────────────────────────────────────────────

function PaletteItemBtn({ item, handlers }: { item: PaletteItem; handlers: PaletteHandlers }) {
  const [hov, setHov] = useState(false);
  // Resolve the click to the matching handler — identical precedence to the
  // toolbar's ItemBtn so a palette button == the toolbar button.
  const click =
    item.duration       ? () => handlers.onDurationClick?.(item.duration!)
    : item.alter !== undefined ? () => handlers.onAccidentalClick?.(item.alter!)
    : item.articulation ? () => handlers.onArticulationClick?.(item.articulation!)
    : item.op           ? () => handlers.onOp?.(item.op!)
    : item.onClick;
  const wired = !!click;  // false = inert catalog glyph (no backend op yet)
  const inner = item.icon ? (
    <img
      src={`/icons/${item.icon.split('/').map(encodeURIComponent).join('/')}`}
      alt=""
      draggable={false}
      style={{
        width: 38, height: 38, objectFit: 'contain',
        filter: item.invert ? 'brightness(0) invert(1)' : undefined,
        pointerEvents: 'none',
      }}
    />
  ) : item.glyph ? (
    <span
      className="smufl"
      style={{
        fontSize: 26,
        color: C.text,
        pointerEvents: 'none',
        lineHeight: 1,
      }}
    >
      {String.fromCodePoint(parseInt(item.glyph, 16))}
    </span>
  ) : null;

  return (
    <button
      title={wired ? item.label : `${item.label} (not wired yet)`}
      onClick={click}
      disabled={!wired}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: 50, height: 50,
        background: hov && wired ? 'rgba(255,255,255,0.06)' : 'transparent',
        border: `1px solid ${hov && wired ? C.btnBorder : 'transparent'}`,
        borderRadius: 6,
        opacity: wired ? 1 : 0.32,
        cursor: wired ? 'pointer' : 'default',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        transition: 'background 0.1s, border-color 0.1s',
      }}
    >
      {inner}
    </button>
  );
}

// ─── Group section ───────────────────────────────────────────────────────────

function GroupSection({
  group, open, onToggle, filter, handlers,
}: { group: PaletteGroup; open: boolean; onToggle: () => void; filter: string; handlers: PaletteHandlers }) {
  const [expanded, setExpanded] = useState(false);

  const filtered = filter
    ? group.items.filter(i => i.label.toLowerCase().includes(filter.toLowerCase()))
    : group.items;
  if (filter && filtered.length === 0) return null;

  const shown = filter ? true : open;
  const visibleCount = filter
    ? filtered.length
    : (expanded ? filtered.length : Math.min(group.defaultVisible ?? 8, filtered.length));
  const visibleItems = filtered.slice(0, visibleCount);
  const hasMore = !filter && filtered.length > (group.defaultVisible ?? 8);

  return (
    <div style={{ marginBottom: 6 }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 10px',
          background: 'rgba(255,255,255,0.04)',
          border: 'none',
          borderRadius: 6,
          color: C.text,
          fontSize: 12.5,
          fontWeight: 500,
          fontFamily: 'inherit',
          cursor: 'pointer',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: C.muted, fontSize: 9 }}>{shown ? '▼' : '▶'}</span>
          {group.name}
        </span>
        <span style={{ color: C.muted, fontSize: 11 }}>
          {filter ? filtered.length : group.items.length}
        </span>
      </button>
      {shown && (
        <>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(50px, 1fr))',
            gap: 4,
            padding: '8px 4px 4px',
          }}>
            {visibleItems.map((it, i) => <PaletteItemBtn key={`${it.icon ?? it.glyph}-${i}`} item={it} handlers={handlers} />)}
          </div>
          {hasMore && (
            <button
              onClick={() => setExpanded(e => !e)}
              style={{
                width: '100%',
                padding: '6px 10px',
                marginBottom: 8,
                background: 'rgba(255,255,255,0.05)',
                border: `1px solid ${C.btnBorder}`,
                borderRadius: 6,
                color: C.dimmed,
                fontSize: 11,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {expanded ? '↑ Less' : `↓ More (${filtered.length - (group.defaultVisible ?? 8)})`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ─── Panel ───────────────────────────────────────────────────────────────────

interface Props extends PaletteHandlers {
  open: boolean;
  onClose: () => void;
}

export default function PalettePanel({ open, onClose, ...handlers }: Props) {
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    new Set(PALETTES.filter(g => g.defaultOpen).map(g => g.name)),
  );
  const [filter, setFilter] = useState('');

  const toggle = (name: string) => {
    setOpenGroups(prev => {
      const n = new Set(prev);
      if (n.has(name)) n.delete(name); else n.add(name);
      return n;
    });
  };

  const totalCount = useMemo(
    () => PALETTES.reduce((s, g) => s + g.items.length, 0),
    [],
  );

  return (
    <aside
      style={{
        position: 'fixed',
        top: 86,
        left: 0,
        bottom: 0,
        width: 280,
        background: C.panel,
        borderRight: `1px solid ${C.border}`,
        transform: open ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.2s ease',
        zIndex: 40,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '12px 12px 6px',
      }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: C.text, flex: 1 }}>
          Palettes <span style={{ color: C.muted, fontWeight: 400 }}>· {totalCount}</span>
        </span>
        <button
          onClick={onClose}
          title="Hide palettes"
          style={{
            width: 24, height: 24, borderRadius: 4, border: 'none',
            background: 'transparent', color: C.muted, cursor: 'pointer',
            fontSize: 14, lineHeight: 1,
          }}
        >×</button>
      </div>

      {/* Search */}
      <div style={{ padding: '0 12px 10px' }}>
        <input
          type="text"
          placeholder="Search symbols…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{
            width: '100%',
            padding: '7px 10px',
            background: C.btnBg,
            border: `1px solid ${C.btnBorder}`,
            borderRadius: 6,
            color: C.text,
            fontSize: 12,
            outline: 'none',
            fontFamily: 'inherit',
          }}
        />
      </div>

      {/* Groups */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '0 8px 12px',
      }}>
        {PALETTES.map(g => (
          <GroupSection
            key={g.name}
            group={g}
            open={openGroups.has(g.name)}
            onToggle={() => toggle(g.name)}
            filter={filter}
            handlers={handlers}
          />
        ))}
      </div>
    </aside>
  );
}
