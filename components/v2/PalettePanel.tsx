'use client';

import React, { useMemo, useState } from 'react';
import { C } from '@/lib/theme';

// ─── Item ────────────────────────────────────────────────────────────────────

interface PaletteItem {
  /** Path under /icons/, e.g. "smufl/clefs/gClef.png". Mutually-exclusive with `glyph`. */
  icon?: string;
  /** Bravura SMuFL codepoint hex (e.g. "E1D5"). Mutually-exclusive with `icon`. */
  glyph?: string;
  label: string;
  /** Use dark→white inversion (for dark PNGs). */
  invert?: boolean;
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
      { icon: 'smufl/clefs/gClef.png',      label: 'Treble',                   invert: true },
      { icon: 'smufl/clefs/gClef8va.png',   label: 'Treble 8va',               invert: true },
      { icon: 'smufl/clefs/gClef8vb.png',   label: 'Treble 8vb',               invert: true },
      { icon: 'smufl/clefs/gClef15ma.png',  label: 'Treble 15ma',              invert: true },
      { icon: 'smufl/clefs/fClef.png',      label: 'Bass',                     invert: true },
      { icon: 'smufl/clefs/fClef8va.png',   label: 'Bass 8va',                 invert: true },
      { icon: 'smufl/clefs/fClef8vb.png',   label: 'Bass 8vb',                 invert: true },
      { icon: 'smufl/clefs/cClef.png',      label: 'C clef (alto/tenor)',      invert: true },
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
      { glyph: 'E260', label: '1 flat' },
      { glyph: 'E260', label: '2 flats' },
      { glyph: 'E260', label: '3 flats' },
      { glyph: 'E260', label: '4 flats' },
      { glyph: 'E260', label: '5 flats' },
      { glyph: 'E261', label: 'C major / a minor' },
      { glyph: 'E262', label: '1 sharp' },
      { glyph: 'E262', label: '2 sharps' },
      { glyph: 'E262', label: '3 sharps' },
      { glyph: 'E262', label: '4 sharps' },
      { glyph: 'E262', label: '5 sharps' },
    ],
  },
  {
    name: 'Time signatures',
    defaultVisible: 8,
    items: [
      { icon: 'smufl/timesigs/timeSigCommon.svg',    label: 'Common time' },
      { icon: 'smufl/timesigs/timeSigCutCommon.svg', label: 'Cut time' },
      { icon: 'smufl/timesigs/timeSig2over4.svg',    label: '2/4' },
      { icon: 'smufl/timesigs/timeSig3over4.svg',    label: '3/4' },
      { icon: 'smufl/timesigs/timeSig4over4.svg',    label: '4/4' },
      { icon: 'smufl/timesigs/timeSig5over4.svg',    label: '5/4' },
      { icon: 'smufl/timesigs/timeSig6over4.svg',    label: '6/4' },
      { icon: 'smufl/timesigs/timeSig6over8.svg',    label: '6/8' },
      // More
      { icon: 'smufl/timesigs/timeSig2over2.svg',    label: '2/2' },
      { icon: 'smufl/timesigs/timeSig3over2.svg',    label: '3/2' },
      { icon: 'smufl/timesigs/timeSig3over8.svg',    label: '3/8' },
      { icon: 'smufl/timesigs/timeSig5over8.svg',    label: '5/8' },
      { icon: 'smufl/timesigs/timeSig7over8.svg',    label: '7/8' },
      { icon: 'smufl/timesigs/timeSig9over8.svg',    label: '9/8' },
      { icon: 'smufl/timesigs/timeSig12over8.svg',   label: '12/8' },
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
      { glyph: 'E520', label: 'Largo' },
      { glyph: 'E520', label: 'Adagio' },
      // More
      { glyph: 'E520', label: 'Andante' },
      { glyph: 'E520', label: 'Moderato' },
      { glyph: 'E520', label: 'Allegro' },
      { glyph: 'E520', label: 'Presto' },
      { glyph: 'E520', label: 'Prestissimo' },
      { glyph: 'E520', label: 'Accelerando' },
      { glyph: 'E520', label: 'Ritardando' },
      { glyph: 'E520', label: 'rit.' },
      { glyph: 'E520', label: 'accel.' },
    ],
  },
  {
    name: 'Accidentals',
    defaultVisible: 8,
    items: [
      { icon: 'smufl/accidentals/accidentalDoubleFlat.svg',   label: 'Double flat' },
      { icon: 'smufl/accidentals/accidentalFlat.svg',         label: 'Flat' },
      { icon: 'smufl/accidentals/accidentalNatural.svg',      label: 'Natural' },
      { icon: 'smufl/accidentals/accidentalSharp.svg',        label: 'Sharp' },
      { icon: 'smufl/accidentals/accidentalDoubleSharp.svg',  label: 'Double sharp' },
      { icon: 'smufl/accidentals/accidentalTripleFlat.svg',   label: 'Triple flat' },
      { icon: 'smufl/accidentals/accidentalTripleSharp.svg',  label: 'Triple sharp' },
      { icon: 'smufl/accidentals/BracketAccidental.svg',      label: 'Bracketed' },
      // More
      { icon: 'smufl/accidentals/accidentalNaturalFlat.svg',  label: 'Natural flat' },
      { icon: 'smufl/accidentals/accidentalNaturalSharp.svg', label: 'Natural sharp' },
      { icon: 'smufl/accidentals/accidentalSharpSharp.svg',   label: 'Sharp-sharp' },
      { icon: 'smufl/accidentals/accidentalFlatParens.svg',     label: '(♭)' },
      { icon: 'smufl/accidentals/accidentalNaturalParens.svg',  label: '(♮)' },
      { icon: 'smufl/accidentals/accidentalSharpParens.svg',    label: '(♯)' },
      { icon: 'smufl/accidentals/accidentalDoubleFlatParens.svg',  label: '(♭♭)' },
      { icon: 'smufl/accidentals/accidentalDoubleSharpParens.svg', label: '(𝄪)' },
      { icon: 'smufl/accidentals/accidentalQuarterToneFlatStein.svg',          label: 'Quarter-tone ♭' },
      { icon: 'smufl/accidentals/accidentalQuarterToneSharpStein.svg',         label: 'Quarter-tone ♯' },
      { icon: 'smufl/accidentals/accidentalThreeQuarterTonesFlatZimmermann.svg', label: '¾-tone ♭ (Zimm.)' },
      { icon: 'smufl/accidentals/accidentalThreeQuarterTonesSharpStein.svg',     label: '¾-tone ♯ (Stein)' },
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
      { glyph: 'E52B', label: 'pp (pianissimo)' },
      { glyph: 'E520', label: 'p (piano)' },
      { glyph: 'E52C', label: 'mp (mezzo piano)' },
      { glyph: 'E52D', label: 'mf (mezzo forte)' },
      { glyph: 'E522', label: 'f (forte)' },
      { glyph: 'E52F', label: 'ff (fortissimo)' },
      { glyph: 'E53E', label: 'Crescendo hairpin' },
      { glyph: 'E53F', label: 'Diminuendo hairpin' },
      // More
      { glyph: 'E52A', label: 'ppp' },
      { glyph: 'E531', label: 'fff' },
      { glyph: 'E539', label: 'sfz (sforzando)' },
      { glyph: 'E537', label: 'sf' },
      { glyph: 'E53C', label: 'sffz' },
      { glyph: 'E535', label: 'fp' },
      { glyph: 'E534', label: 'pf' },
      { glyph: 'E541', label: 'niente (n)' },
      { glyph: 'E538', label: 'rfz (rinforzando)' },
      { glyph: 'E536', label: 'fz' },
      { glyph: 'E529', label: 'pppp' },
      { glyph: 'E532', label: 'ffff' },
    ],
  },
  {
    name: 'Articulations',
    defaultVisible: 8,
    items: [
      { icon: 'buttons/articulations/articAccentAbove.svg',          label: 'Accent' },
      { icon: 'buttons/articulations/articStaccatoAbove.svg',        label: 'Staccato' },
      { icon: 'buttons/articulations/articStaccatissimoAbove.svg',   label: 'Staccatissimo' },
      { icon: 'buttons/articulations/articMarcatoAbove.svg',         label: 'Marcato' },
      { icon: 'buttons/articulations/fermataAbove.svg',              label: 'Fermata' },
      { icon: 'buttons/articulations/breathMarkComma.svg',           label: 'Breath mark' },
      { icon: 'buttons/articulations/stringsDownBow.svg',            label: 'Down bow' },
      { icon: 'buttons/articulations/stringsUpBow.svg',              label: 'Up bow' },
      // More
      { icon: 'buttons/articulations/articAccentStaccatoAbove.svg',  label: 'Accent + staccato' },
      { icon: 'buttons/articulations/articTenutoAccentAbove.svg',    label: 'Tenuto + accent' },
      { icon: 'buttons/articulations/articTenutoStaccatoAbove.svg',  label: 'Tenuto + staccato' },
      { icon: 'buttons/articulations/articMarcatoStaccatoAbove.svg', label: 'Marcato + staccato' },
      { icon: 'buttons/articulations/articMarcatoTenutoAbove.svg',   label: 'Marcato + tenuto' },
      { icon: 'buttons/articulations/articUnstressBelow.svg',        label: 'Unstress' },
      { icon: 'buttons/articulations/fermataShortAbove.svg',         label: 'Short fermata' },
      { icon: 'buttons/articulations/fermataLongAbove.svg',          label: 'Long fermata' },
      { icon: 'buttons/articulations/fermataVeryLongAbove.svg',      label: 'Very long fermata' },
      { icon: 'buttons/articulations/Caesura.svg',                   label: 'Caesura' },
      { icon: 'buttons/articulations/stringsHarmonic.svg',           label: 'Harmonic' },
      { icon: 'buttons/articulations/stringsThumbPosition.svg',      label: 'Thumb position' },
      { icon: 'buttons/articulations/Mute on.svg',                   label: 'Mute on' },
      { icon: 'buttons/articulations/Mute off.svg',                  label: 'Mute off' },
      { glyph: 'E4BA', label: 'Laissez vibrer' },
      { glyph: 'E4B6', label: 'Stress' },
      { glyph: 'E4B7', label: 'Unstress (above)' },
    ],
  },
  {
    name: 'Ornaments',
    defaultVisible: 8,
    items: [
      { glyph: 'E566', label: 'Trill' },
      { glyph: 'E56C', label: 'Short mordent' },
      { glyph: 'E56D', label: 'Mordent' },
      { glyph: 'E567', label: 'Turn' },
      { glyph: 'E568', label: 'Inverted turn' },
      { glyph: 'E569', label: 'Turn slash' },
      { glyph: 'E5B0', label: 'Tremolo 1 (single)' },
      { glyph: 'E5B1', label: 'Tremolo 2' },
      // More
      { glyph: 'E5B2', label: 'Tremolo 3' },
      { glyph: 'E5B3', label: 'Tremolo 4' },
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
      { icon: 'smufl/repeats/repeatLeft.svg',          label: 'Repeat start' },
      { icon: 'smufl/repeats/repeatRight.svg',         label: 'Repeat end' },
      { icon: 'smufl/repeats/repeatRightLeft.svg',     label: 'Repeat both' },
      { icon: 'smufl/repeats/daCapo.svg',              label: 'D.C.' },
      { icon: 'smufl/repeats/dalSegno.svg',            label: 'D.S.' },
      { icon: 'smufl/repeats/coda.svg',                label: 'Coda' },
      { icon: 'smufl/repeats/segno.svg',               label: 'Segno' },
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
      { icon: 'smufl/barlines/barlineDouble.svg',        label: 'Double' },
      { icon: 'smufl/barlines/barlineFinal.svg',         label: 'Final' },
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
      { glyph: 'E650', label: 'Pedal mark (Ped.)' },
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

function PaletteItemBtn({ item }: { item: PaletteItem }) {
  const [hov, setHov] = useState(false);
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
      title={item.label}
      onClick={item.onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: 50, height: 50,
        background: hov ? 'rgba(255,255,255,0.06)' : 'transparent',
        border: `1px solid ${hov ? C.btnBorder : 'transparent'}`,
        borderRadius: 6,
        cursor: 'pointer',
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
  group, open, onToggle, filter,
}: { group: PaletteGroup; open: boolean; onToggle: () => void; filter: string }) {
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
            {visibleItems.map((it, i) => <PaletteItemBtn key={`${it.icon ?? it.glyph}-${i}`} item={it} />)}
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

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function PalettePanel({ open, onClose }: Props) {
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
          />
        ))}
      </div>
    </aside>
  );
}
