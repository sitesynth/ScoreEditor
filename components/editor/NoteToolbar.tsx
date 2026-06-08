'use client';

import React from 'react';
import type { DurationBase, Duration } from '@/lib/music-model';

// ─── Note duration SVG icons ─────────────────────────────────────────────────

const NX = 7;   // note head center x
const NY = 20;  // note head center y
const NRX = 6;  // note head rx
const NRY = 4;  // note head ry
const SX = 12.5; // stem x
const SY_TOP = 2; // stem top y

function NoteIcon({ base }: { base: DurationBase }) {
  const isFilled = base !== 'whole' && base !== 'half';
  const nFlags = (
    { whole: 0, half: 0, quarter: 0, eighth: 1, '16th': 2, '32nd': 3, '64th': 4 } as Record<DurationBase, number>
  )[base];

  if (base === 'whole') {
    return (
      <svg width="17" height="12" viewBox="0 0 17 12" style={{ display: 'block' }}>
        <ellipse cx="8.5" cy="6" rx="7.5" ry="4.5" fill="none" stroke="currentColor" strokeWidth="2.3"/>
      </svg>
    );
  }

  const W = nFlags > 0 ? 21 : 17;
  const H = 26;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      {/* stem behind notehead */}
      <line x1={SX} y1={NY} x2={SX} y2={SY_TOP} stroke="currentColor" strokeWidth="1.4"/>
      {/* note head on top */}
      <ellipse
        cx={NX} cy={NY} rx={NRX} ry={NRY}
        fill={isFilled ? 'currentColor' : 'none'}
        stroke="currentColor" strokeWidth="1.7"
        transform={`rotate(-18 ${NX} ${NY})`}
      />
      {/* flags */}
      {Array.from({ length: nFlags }, (_, i) => {
        const fy = SY_TOP + i * 5;
        return (
          <path
            key={i}
            d={`M${SX} ${fy} C${SX + 7} ${fy + 2.5}, ${SX + 7} ${fy + 6.5}, ${SX} ${fy + 8}`}
            stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

function DotIcon({ count }: { count: 0 | 1 | 2 }) {
  if (count === 0) return <span style={{ fontSize: 20, lineHeight: 1 }}>·</span>;
  if (count === 1) return <span style={{ fontSize: 20, lineHeight: 1, letterSpacing: -1 }}>·</span>;
  return <span style={{ fontSize: 20, lineHeight: 1 }}>··</span>;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DURATIONS: DurationBase[] = ['whole', 'half', 'quarter', 'eighth', '16th', '32nd', '64th'];

const DUR_KEY: Record<DurationBase, string> = {
  whole: '7', half: '6', quarter: '5', eighth: '4', '16th': '3', '32nd': '2', '64th': '1',
};

const DUR_LABEL: Record<DurationBase, string> = {
  whole: 'Whole', half: 'Half', quarter: 'Quarter', eighth: 'Eighth',
  '16th': '16th', '32nd': '32nd', '64th': '64th',
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const toolBtn = (active: boolean, dimmed: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  minWidth: 32, height: 34, borderRadius: 5,
  border: active ? '1px solid rgba(192,57,43,0.6)' : '1px solid transparent',
  cursor: 'pointer',
  background: active ? 'rgba(192,57,43,0.22)' : 'transparent',
  color: active ? '#e74c3c' : dimmed ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.75)',
  padding: '0 5px',
  transition: 'background 0.1s, color 0.1s',
});

const sep: React.CSSProperties = {
  width: 1, height: 22, background: 'rgba(255,255,255,0.1)', margin: '0 5px', flexShrink: 0,
};

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  mode: 'normal' | 'note-input';
  selectedDuration: Duration;
  pendingAlter: -1 | 0 | 1;
  onToggleNoteInput: () => void;
  onSelectDuration: (base: DurationBase) => void;
  onToggleDot: () => void;
  onSetAlter: (alter: -1 | 0 | 1) => void;
  onInsertRest: () => void;
}

export default function NoteToolbar({
  mode, selectedDuration, pendingAlter,
  onToggleNoteInput, onSelectDuration, onToggleDot, onSetAlter, onInsertRest,
}: Props) {
  const isNoteInput = mode === 'note-input';
  const dimmed = !isNoteInput;

  // selectDuration already switches mode to note-input internally
  function handleDuration(base: DurationBase) {
    onSelectDuration(base);
  }

  return (
    <div style={{
      height: 46,
      background: '#23262d',
      display: 'flex',
      alignItems: 'center',
      padding: '0 10px',
      gap: 2,
      flexShrink: 0,
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      overflowX: 'auto',
    }}>

      {/* Note Input toggle */}
      <button
        onClick={onToggleNoteInput}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '0 10px', height: 34, borderRadius: 5,
          border: isNoteInput ? '1px solid #c0392b' : '1px solid rgba(255,255,255,0.11)',
          cursor: 'pointer',
          background: isNoteInput ? '#c0392b' : 'rgba(255,255,255,0.06)',
          color: isNoteInput ? '#fff' : 'rgba(255,255,255,0.7)',
          fontSize: 12, fontWeight: isNoteInput ? 600 : 400,
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
        title="Toggle note input mode (N)"
      >
        <span style={{ fontSize: 13 }}>✏</span> Note Input
      </button>

      <div style={sep} />

      {/* Duration buttons */}
      {DURATIONS.map(dur => {
        const isActive = isNoteInput && selectedDuration.base === dur;
        return (
          <button
            key={dur}
            onClick={() => handleDuration(dur)}
            style={toolBtn(isActive, false)}
            title={`${DUR_LABEL[dur]} (${DUR_KEY[dur]})`}
          >
            <NoteIcon base={dur} />
          </button>
        );
      })}

      {/* Augmentation dot */}
      <button
        onClick={() => { if (isNoteInput) onToggleDot(); }}
        style={{
          ...toolBtn(isNoteInput && selectedDuration.dots > 0, dimmed),
          fontSize: 18, fontWeight: 700, minWidth: 28,
        }}
        title="Augmentation dot (.)"
      >
        {selectedDuration.dots === 2 ? '··' : '·'}
      </button>

      <div style={sep} />

      {/* Accidentals */}
      {([-1, 0, 1] as const).map(alter => {
        const symbol = alter === -1 ? '♭' : alter === 0 ? '♮' : '♯';
        const isActive = isNoteInput && pendingAlter === alter && alter !== 0;
        return (
          <button
            key={alter}
            onClick={() => {
              if (!isNoteInput) return;
              onSetAlter(pendingAlter === alter ? 0 : alter as -1 | 0 | 1);
            }}
            style={{ ...toolBtn(isActive, dimmed), fontSize: 16, minWidth: 30 }}
            title={`${symbol} (${alter === -1 ? '−' : alter === 0 ? '♮' : '+'})`}
          >
            {symbol}
          </button>
        );
      })}

      <div style={sep} />

      {/* Rest button */}
      <button
        onClick={() => { if (isNoteInput) onInsertRest(); }}
        style={{
          ...toolBtn(false, dimmed),
          padding: '0 8px',
          fontSize: 12,
          gap: 4,
          whiteSpace: 'nowrap',
        }}
        title="Insert rest (0)"
      >
        {/* Simple rest icon: two horizontal lines like a half-rest */}
        <svg width="12" height="10" viewBox="0 0 12 10" style={{ display: 'block', flexShrink: 0 }}>
          <rect x="1" y="0" width="10" height="5" fill="currentColor" rx="1"/>
          <line x1="0" y1="5" x2="12" y2="5" stroke="currentColor" strokeWidth="1.2"/>
        </svg>
        Rest
      </button>

      <div style={sep} />

      {/* Keyboard hint */}
      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', whiteSpace: 'nowrap', paddingLeft: 4, flexShrink: 0 }}>
        A–G = notes &nbsp;·&nbsp; 0 = rest &nbsp;·&nbsp; Del = delete &nbsp;·&nbsp; N = toggle input
      </span>
    </div>
  );
}
