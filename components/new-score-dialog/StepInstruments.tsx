'use client';

import { useState } from 'react';
import type { Instrument, InstrumentFamily } from '@/lib/music-model';
import { INSTRUMENTS, FAMILY_LABELS, getInstrumentsByFamily } from '@/lib/instruments';

const FAMILIES: InstrumentFamily[] = ['keyboard', 'strings', 'woodwinds', 'brass', 'percussion', 'voice'];

const C = {
  tabActive:   { background: '#1a1a2e', color: '#fff', borderTop: 'none', borderLeft: 'none', borderRight: 'none', borderBottom: '2px solid #c0392b' },
  tabInactive: { background: 'none', color: '#555', borderTop: 'none', borderLeft: 'none', borderRight: 'none', borderBottom: '2px solid transparent' },
  btn:         { padding: '8px 12px', borderRadius: 6, fontSize: 13, cursor: 'pointer', textAlign: 'left' as const, transition: 'all 0.1s' },
  btnSelected: { background: '#1a1a2e', color: '#fff' },
  btnHover:    { background: '#e8e4de' },
  chip:        { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#1a1a2e', color: '#fff', borderRadius: 20, padding: '3px 10px 3px 12px', fontSize: 12 },
};

interface Props {
  selected: Instrument[];
  onChange: (instruments: Instrument[]) => void;
}

export default function StepInstruments({ selected, onChange }: Props) {
  const [family, setFamily] = useState<InstrumentFamily>('keyboard');
  const [hovered, setHovered] = useState<string | null>(null);

  const instruments = getInstrumentsByFamily(family);
  const selectedIds = new Set(selected.map(i => i.id));

  function toggle(inst: Instrument) {
    if (selectedIds.has(inst.id)) {
      onChange(selected.filter(i => i.id !== inst.id));
    } else {
      onChange([...selected, inst]);
    }
  }

  function remove(id: string) {
    onChange(selected.filter(i => i.id !== id));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Family tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #ddd', gap: 0 }}>
        {FAMILIES.map(f => (
          <button
            key={f}
            onClick={() => setFamily(f)}
            style={{
              padding: '8px 14px',
              fontSize: 13,
              ...(family === f ? C.tabActive : C.tabInactive),
              fontWeight: family === f ? 600 : 400,
              cursor: 'pointer',
            }}
          >
            {FAMILY_LABELS[f]}
          </button>
        ))}
      </div>

      {/* Instrument grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
        {instruments.map(inst => {
          const isSelected = selectedIds.has(inst.id);
          return (
            <button
              key={inst.id}
              onClick={() => toggle(inst)}
              onMouseEnter={() => setHovered(inst.id)}
              onMouseLeave={() => setHovered(null)}
              style={{
                ...C.btn,
                background: isSelected ? '#1a1a2e' : hovered === inst.id ? '#e8e4de' : '#f5f2ed',
                color: isSelected ? '#fff' : '#1a1a1a',
                border: isSelected ? '1px solid #1a1a2e' : '1px solid #ddd',
              }}
            >
              {inst.name}
              {inst.secondaryClef && (
                <span style={{ fontSize: 10, opacity: 0.6, marginLeft: 4 }}>(2 staves)</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected chips */}
      <div style={{ minHeight: 36, display: 'flex', flexWrap: 'wrap', gap: 6, padding: '6px 0', borderTop: '1px solid #eee' }}>
        {selected.length === 0 && (
          <span style={{ fontSize: 12, color: '#999', alignSelf: 'center' }}>
            No instruments selected — pick at least one
          </span>
        )}
        {selected.map(inst => (
          <div key={inst.id} style={C.chip}>
            <span>{inst.name}</span>
            <button
              onClick={() => remove(inst.id)}
              style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
