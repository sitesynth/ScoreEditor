'use client';

import { useState } from 'react';
import type { TimeSig } from '@/lib/music-model';

const KEY_LABELS: { value: number; label: string; accidentals: string }[] = [
  { value: -7, label: 'Cb', accidentals: '7♭' },
  { value: -6, label: 'Gb', accidentals: '6♭' },
  { value: -5, label: 'Db', accidentals: '5♭' },
  { value: -4, label: 'Ab', accidentals: '4♭' },
  { value: -3, label: 'Eb', accidentals: '3♭' },
  { value: -2, label: 'Bb', accidentals: '2♭' },
  { value: -1, label: 'F',  accidentals: '1♭' },
  { value:  0, label: 'C',  accidentals: '—'  },
  { value:  1, label: 'G',  accidentals: '1♯' },
  { value:  2, label: 'D',  accidentals: '2♯' },
  { value:  3, label: 'A',  accidentals: '3♯' },
  { value:  4, label: 'E',  accidentals: '4♯' },
  { value:  5, label: 'B',  accidentals: '5♯' },
  { value:  6, label: 'F#', accidentals: '6♯' },
  { value:  7, label: 'C#', accidentals: '7♯' },
];

const TIME_PRESETS: TimeSig[] = [
  { num: 2, den: 4 },
  { num: 3, den: 4 },
  { num: 4, den: 4 },
  { num: 6, den: 8 },
  { num: 9, den: 8 },
  { num: 12, den: 8 },
];

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: '#555',
  marginBottom: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

interface Props {
  keySig: number;
  timeSig: TimeSig;
  onChangeKey: (k: number) => void;
  onChangeTime: (t: TimeSig) => void;
}

export default function StepSignatures({ keySig, timeSig, onChangeKey, onChangeTime }: Props) {
  const [customNum, setCustomNum] = useState(String(timeSig.num));
  const [customDen, setCustomDen] = useState(String(timeSig.den));
  const [useCustom, setUseCustom] = useState(false);

  const isPreset = TIME_PRESETS.some(p => p.num === timeSig.num && p.den === timeSig.den);

  function applyCustom() {
    const n = parseInt(customNum, 10);
    const d = parseInt(customDen, 10);
    if (n > 0 && d > 0) onChangeTime({ num: n, den: d });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Key signature */}
      <div>
        <label style={labelStyle}>Key Signature</label>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {KEY_LABELS.map(k => (
            <button
              key={k.value}
              onClick={() => onChangeKey(k.value)}
              title={k.accidentals}
              style={{
                width: 44,
                padding: '6px 4px',
                border: keySig === k.value ? '2px solid #1a1a2e' : '1px solid #ccc',
                borderRadius: 6,
                background: keySig === k.value ? '#1a1a2e' : '#faf9f7',
                color: keySig === k.value ? '#fff' : '#1a1a1a',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
              }}
            >
              <span style={{ fontWeight: 700, fontSize: 14 }}>{k.label}</span>
              <span style={{ fontSize: 9, opacity: 0.7 }}>{k.accidentals}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Time signature */}
      <div>
        <label style={labelStyle}>Time Signature</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {TIME_PRESETS.map(p => {
            const active = !useCustom && timeSig.num === p.num && timeSig.den === p.den;
            return (
              <button
                key={`${p.num}/${p.den}`}
                onClick={() => { onChangeTime(p); setUseCustom(false); }}
                style={{
                  width: 52,
                  padding: '8px 4px',
                  border: active ? '2px solid #1a1a2e' : '1px solid #ccc',
                  borderRadius: 6,
                  background: active ? '#1a1a2e' : '#faf9f7',
                  color: active ? '#fff' : '#1a1a1a',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  lineHeight: 1.1,
                }}
              >
                <span style={{ fontWeight: 700, fontSize: 14 }}>{p.num}</span>
                <span style={{ fontSize: 11, borderTop: `1px solid ${active ? 'rgba(255,255,255,0.4)' : '#ccc'}`, paddingTop: 2, width: '60%', textAlign: 'center' }}>{p.den}</span>
              </button>
            );
          })}

          {/* Custom */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
            <span style={{ fontSize: 12, color: '#888' }}>Custom:</span>
            <input
              style={{ width: 36, padding: '5px 6px', border: '1px solid #ccc', borderRadius: 5, fontSize: 13, textAlign: 'center' }}
              value={customNum}
              onChange={e => setCustomNum(e.target.value)}
              onBlur={applyCustom}
            />
            <span style={{ fontSize: 14, color: '#888' }}>/</span>
            <input
              style={{ width: 36, padding: '5px 6px', border: '1px solid #ccc', borderRadius: 5, fontSize: 13, textAlign: 'center' }}
              value={customDen}
              onChange={e => setCustomDen(e.target.value)}
              onBlur={applyCustom}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
