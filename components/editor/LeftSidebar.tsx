'use client';

import React, { useState } from 'react';
import type { Score, TimeSig } from '@/lib/music-model';

// ─── Key signature names ──────────────────────────────────────────────────────

const KEY_NAMES: Record<number, string> = {
  '-7': 'C♭', '-6': 'G♭', '-5': 'D♭', '-4': 'A♭', '-3': 'E♭', '-2': 'B♭', '-1': 'F',
  '0': 'C',
  '1': 'G', '2': 'D', '3': 'A', '4': 'E', '5': 'B', '6': 'F♯', '7': 'C♯',
};

const KEY_ORDER = [-7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7];

const TIME_PRESETS: TimeSig[] = [
  { num: 2, den: 4 },
  { num: 3, den: 4 },
  { num: 4, den: 4 },
  { num: 6, den: 8 },
  { num: 3, den: 8 },
  { num: 5, den: 4 },
];

// ─── Styles ──────────────────────────────────────────────────────────────────

const TAB_W = 240;

const sectionLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.08em',
  color: '#999',
  textTransform: 'uppercase',
  marginBottom: 6,
  paddingLeft: 1,
};

const smallBtn = (active: boolean): React.CSSProperties => ({
  padding: '4px 8px',
  borderRadius: 5,
  fontSize: 12,
  cursor: 'pointer',
  background: active ? '#1a1a2e' : '#f0ede8',
  color: active ? '#fff' : '#444',
  border: active ? '1px solid #1a1a2e' : '1px solid #ddd',
});

const gridBtn = (active: boolean): React.CSSProperties => ({
  padding: '5px 0',
  borderRadius: 5,
  fontSize: 11,
  cursor: 'pointer',
  textAlign: 'center' as const,
  background: active ? '#1a1a2e' : '#f0ede8',
  color: active ? '#fff' : '#444',
  border: active ? '1px solid #1a1a2e' : '1px solid #ddd',
});

// ─── Component ───────────────────────────────────────────────────────────────

type SidebarTab = 'notation' | 'instruments' | 'layout';

interface Props {
  score: Score;
  cursorPartIndex: number;
  onSetKeySig: (k: number) => void;
  onSetTimeSig: (num: number, den: number) => void;
  onSetTempo: (bpm: number) => void;
}

export default function LeftSidebar({
  score, cursorPartIndex, onSetKeySig, onSetTimeSig, onSetTempo,
}: Props) {
  const [tab, setTab] = useState<SidebarTab>('notation');

  const { keySig, timeSig, tempo } = score.metadata;

  return (
    <div style={{
      width: TAB_W,
      background: '#f7f6f4',
      borderRight: '1px solid #ddd',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      overflowY: 'auto',
    }}>
      {/* Tab bar */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid #ddd',
        background: '#fff',
        flexShrink: 0,
      }}>
        {(['notation', 'instruments', 'layout'] as SidebarTab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1,
              padding: '10px 4px',
              fontSize: 11,
              fontWeight: tab === t ? 600 : 400,
              cursor: 'pointer',
              background: 'none',
              color: tab === t ? '#1a1a2e' : '#888',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              borderBottom: tab === t ? '2px solid #c0392b' : '2px solid transparent',
              textTransform: 'capitalize' as const,
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── NOTATION TAB ─────────────────────────── */}
        {tab === 'notation' && (
          <>
            {/* Key Signature */}
            <section>
              <div style={sectionLabel}>Key Signature</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
                {KEY_ORDER.map(k => (
                  <button
                    key={k}
                    onClick={() => onSetKeySig(k)}
                    style={gridBtn(keySig === k)}
                    title={`${KEY_NAMES[k as keyof typeof KEY_NAMES]} major / ${k >= 0 ? k + '♯' : Math.abs(k) + '♭'}`}
                  >
                    {KEY_NAMES[k as keyof typeof KEY_NAMES]}
                  </button>
                ))}
              </div>
              <div style={{ marginTop: 6, fontSize: 11, color: '#666', textAlign: 'center' }}>
                Current: <strong>{KEY_NAMES[keySig as keyof typeof KEY_NAMES]}</strong>
                {' '}({keySig === 0 ? 'no accidentals' : keySig > 0 ? `${keySig}♯` : `${Math.abs(keySig)}♭`})
              </div>
            </section>

            {/* Time Signature */}
            <section>
              <div style={sectionLabel}>Time Signature</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                {TIME_PRESETS.map(ts => {
                  const active = timeSig.num === ts.num && timeSig.den === ts.den;
                  return (
                    <button
                      key={`${ts.num}/${ts.den}`}
                      onClick={() => onSetTimeSig(ts.num, ts.den)}
                      style={gridBtn(active)}
                    >
                      {ts.num}/{ts.den}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Tempo */}
            <section>
              <div style={sectionLabel}>Tempo</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={() => onSetTempo(Math.max(20, tempo - 5))}
                  style={{ ...smallBtn(false), width: 28, textAlign: 'center' as const, padding: '4px 0' }}
                >−</button>
                <div style={{ flex: 1, textAlign: 'center', fontSize: 14, fontWeight: 600, color: '#1a1a2e' }}>
                  ♩ = {tempo}
                </div>
                <button
                  onClick={() => onSetTempo(Math.min(300, tempo + 5))}
                  style={{ ...smallBtn(false), width: 28, textAlign: 'center' as const, padding: '4px 0' }}
                >+</button>
              </div>
              {/* Quick tempo presets */}
              <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                {[60, 80, 100, 120, 140, 160].map(bpm => (
                  <button
                    key={bpm}
                    onClick={() => onSetTempo(bpm)}
                    style={{ ...smallBtn(tempo === bpm), fontSize: 10, padding: '3px 5px' }}
                  >
                    {bpm}
                  </button>
                ))}
              </div>
            </section>

            {/* Clef info */}
            <section>
              <div style={sectionLabel}>Staves</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {score.parts.map((part, i) => (
                  <div
                    key={part.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '5px 8px', borderRadius: 5,
                      background: i === cursorPartIndex ? '#1a1a2e' : '#f0ede8',
                      color: i === cursorPartIndex ? '#fff' : '#444',
                      fontSize: 12,
                    }}
                  >
                    <span style={{ fontSize: 15, width: 20, textAlign: 'center' }}>
                      {part.clef === 'treble' ? '𝄞' : part.clef === 'bass' ? '𝄢' : '𝄡'}
                    </span>
                    <span style={{ flex: 1 }}>{part.name}</span>
                    <span style={{ fontSize: 10, opacity: 0.6 }}>
                      {part.clef}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {/* ── INSTRUMENTS TAB ──────────────────────── */}
        {tab === 'instruments' && (
          <>
            <section>
              <div style={sectionLabel}>Parts in Score</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {score.parts.map((part, i) => (
                  <div
                    key={part.id}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 6,
                      background: '#fff',
                      border: '1px solid #e0dbd4',
                      display: 'flex', alignItems: 'center', gap: 10,
                    }}
                  >
                    <div style={{
                      width: 32, height: 32, borderRadius: 6,
                      background: '#1a1a2e', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, flexShrink: 0,
                    }}>
                      {part.clef === 'treble' ? '𝄞' : part.clef === 'bass' ? '𝄢' : '𝄡'}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a2e' }}>{part.name}</div>
                      <div style={{ fontSize: 10, color: '#888' }}>{part.clef} clef · part {i + 1}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <div style={{ fontSize: 12, color: '#aaa', textAlign: 'center', padding: '8px 0' }}>
                To change instruments, create a new score with + New
              </div>
            </section>
          </>
        )}

        {/* ── LAYOUT TAB ───────────────────────────── */}
        {tab === 'layout' && (
          <>
            <section>
              <div style={sectionLabel}>Page</div>
              <div style={{ fontSize: 12, color: '#888', lineHeight: 1.6 }}>
                <div>Format: A4</div>
                <div>Orientation: Portrait</div>
                <div>Margins: 20mm</div>
              </div>
            </section>

            <section>
              <div style={sectionLabel}>Score Info</div>
              <div style={{ fontSize: 12, color: '#555', lineHeight: 1.8 }}>
                <div><span style={{ color: '#999' }}>Title:</span> {score.metadata.title}</div>
                {score.metadata.composer && (
                  <div><span style={{ color: '#999' }}>Composer:</span> {score.metadata.composer}</div>
                )}
                <div><span style={{ color: '#999' }}>Measures:</span> {score.parts[0]?.measures.length ?? 0}</div>
                <div><span style={{ color: '#999' }}>Parts:</span> {score.parts.length}</div>
              </div>
            </section>

            <section>
              <div style={{ fontSize: 11, color: '#bbb', textAlign: 'center', padding: '6px 0' }}>
                More layout options coming soon
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
