'use client';

import React, { useMemo } from 'react';

// ─── Piano geometry ───────────────────────────────────────────────────────────

const WHITE_W = 22;   // white key width px
const WHITE_H = 96;   // white key height px
const BLACK_W = 13;   // black key width px
const BLACK_H = 60;   // black key height px
const LABEL_H = 18;   // label area below keys

// pitch class → white key? (C=0, C#=1, D=2, D#=3, E=4, F=5, F#=6, G=7, G#=8, A=9, A#=10, B=11)
const IS_WHITE = [true, false, true, false, true, true, false, true, false, true, false, true];

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

interface KeyInfo {
  midi: number;
  isWhite: boolean;
  x: number;
  noteLabel?: string; // C notes get octave label
}

function buildPianoKeys(): KeyInfo[] {
  // First pass: assign x positions to all white keys
  const whiteX = new Map<number, number>();
  let wx = 0;
  for (let midi = 21; midi <= 108; midi++) {
    const pc = midi % 12;
    if (IS_WHITE[pc]) {
      whiteX.set(midi, wx);
      wx += WHITE_W;
    }
  }

  const keys: KeyInfo[] = [];

  for (let midi = 21; midi <= 108; midi++) {
    const pc = midi % 12;
    const oct = Math.floor(midi / 12) - 1;

    if (IS_WHITE[pc]) {
      keys.push({
        midi,
        isWhite: true,
        x: whiteX.get(midi)!,
        // Label C notes with octave number
        noteLabel: pc === 0 ? `C${oct}` : undefined,
      });
    } else {
      // Black key: position between the white key below (midi-1) and above
      const leftX = whiteX.get(midi - 1)!;
      keys.push({
        midi,
        isWhite: false,
        x: leftX + WHITE_W - Math.round(BLACK_W / 2),
      });
    }
  }

  return keys;
}

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  mode: 'normal' | 'note-input';
  activeMidi?: number;  // currently playing / selected note
  onKeyClick: (midi: number, alter: -1 | 0 | 1) => void;
}

export default function PianoKeyboard({ mode, activeMidi, onKeyClick }: Props) {
  const keys = useMemo(buildPianoKeys, []);
  const totalWidth = 52 * WHITE_W; // 52 white keys
  const totalHeight = WHITE_H + LABEL_H;
  const interactive = mode === 'note-input';

  function handleClick(key: KeyInfo) {
    if (!interactive) return;
    const pc = key.midi % 12;
    // Black keys default to sharp
    const alter: -1 | 0 | 1 = IS_WHITE[pc] ? 0 : 1;
    onKeyClick(key.midi, alter);
  }

  // Separate white and black keys for proper z-ordering
  const whiteKeys = keys.filter(k => k.isWhite);
  const blackKeys = keys.filter(k => !k.isWhite);

  return (
    <div style={{
      height: totalHeight + 12,
      background: '#16181e',
      borderTop: '1px solid rgba(255,255,255,0.08)',
      overflowX: 'auto',
      overflowY: 'hidden',
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      padding: '6px 0 0',
    }}>
      {/* Center keyboard */}
      <div style={{
        position: 'relative',
        width: totalWidth,
        height: totalHeight,
        margin: '0 auto',
        flexShrink: 0,
      }}>

        {/* White keys */}
        {whiteKeys.map(key => {
          const isActive = key.midi === activeMidi;
          const isMiddleC = key.midi === 60;
          return (
            <div
              key={key.midi}
              onClick={() => handleClick(key)}
              title={`${NOTE_NAMES[key.midi % 12]}${Math.floor(key.midi / 12) - 1} (MIDI ${key.midi})`}
              style={{
                position: 'absolute',
                left: key.x,
                top: 0,
                width: WHITE_W - 1,
                height: WHITE_H,
                background: isActive ? '#e74c3c' : '#fff',
                border: '1px solid #bbb',
                borderTop: '1px solid #aaa',
                borderRadius: '0 0 4px 4px',
                cursor: interactive ? 'pointer' : 'default',
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'center',
                paddingBottom: 5,
                userSelect: 'none',
                transition: 'background 0.07s',
              }}
            >
              {/* Middle C dot */}
              {isMiddleC && !isActive && (
                <div style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: '#c0392b', marginBottom: 3,
                }}/>
              )}
              {/* Octave label on C notes */}
              {key.noteLabel && (
                <span style={{
                  fontSize: 8, color: isActive ? 'rgba(255,255,255,0.8)' : '#aaa',
                  position: 'absolute', bottom: 4,
                }}>
                  {key.noteLabel}
                </span>
              )}
            </div>
          );
        })}

        {/* Black keys (on top) */}
        {blackKeys.map(key => {
          const isActive = key.midi === activeMidi;
          return (
            <div
              key={key.midi}
              onClick={() => handleClick(key)}
              title={`${NOTE_NAMES[key.midi % 12]}${Math.floor(key.midi / 12) - 1} (MIDI ${key.midi})`}
              style={{
                position: 'absolute',
                left: key.x,
                top: 0,
                width: BLACK_W,
                height: BLACK_H,
                background: isActive ? '#e74c3c' : '#111',
                borderRadius: '0 0 4px 4px',
                cursor: interactive ? 'pointer' : 'default',
                zIndex: 2,
                boxShadow: '0 4px 6px rgba(0,0,0,0.5)',
                userSelect: 'none',
                transition: 'background 0.07s',
              }}
            />
          );
        })}

        {/* Octave labels below keyboard */}
        {whiteKeys
          .filter(k => k.midi % 12 === 0) // C notes
          .map(key => {
            const oct = Math.floor(key.midi / 12) - 1;
            return (
              <div
                key={`label-${key.midi}`}
                style={{
                  position: 'absolute',
                  left: key.x,
                  top: WHITE_H + 2,
                  width: WHITE_W * 7,
                  fontSize: 9,
                  color: 'rgba(255,255,255,0.3)',
                  textAlign: 'left',
                  paddingLeft: 2,
                  userSelect: 'none',
                }}
              >
                C{oct}
              </div>
            );
          })}
      </div>
    </div>
  );
}
