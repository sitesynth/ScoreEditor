'use client';

import React, { useState } from 'react';
import { C } from '@/lib/theme';

// ─── Pill toggle (General / Play) ────────────────────────────────────────────

function PillToggle({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{
      display: 'flex',
      background: 'rgba(255,255,255,0.05)',
      borderRadius: 8,
      padding: 2,
    }}>
      {options.map(o => (
        <button
          key={o}
          onClick={() => onChange(o)}
          style={{
            flex: 1,
            padding: '6px 16px',
            borderRadius: 6,
            border: 'none',
            cursor: 'pointer',
            fontSize: 12,
            fontFamily: 'inherit',
            background: value === o ? 'rgba(255,255,255,0.12)' : 'transparent',
            color: value === o ? C.text : C.muted,
            transition: 'background 0.15s, color 0.15s',
          }}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

// ─── Collapsible section ─────────────────────────────────────────────────────

function Section({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children?: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const hasContent = !!children;
  return (
    <div style={{ borderBottom: `1px solid ${C.border}` }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '13px 18px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: C.text,
          fontSize: 12.5,
          fontWeight: 500,
          fontFamily: 'inherit',
        }}
      >
        <span>{title}</span>
        <span style={{ color: C.muted, fontSize: 14, lineHeight: 1 }}>
          {open ? '−' : '+'}
        </span>
      </button>
      {open && hasContent && (
        <div style={{ padding: '0 18px 14px' }}>{children}</div>
      )}
    </div>
  );
}

// ─── Color swatch ────────────────────────────────────────────────────────────

function ColorSwatch({ label, hex, bg }: { label: string; hex: string; bg: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 11, color: C.muted }}>{label}</span>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '5px 8px',
        background: C.btnBg,
        border: `1px solid ${C.btnBorder}`,
        borderRadius: 6,
        cursor: 'pointer',
      }}>
        <div style={{
          width: 18, height: 18, borderRadius: 3, background: bg,
          border: '1px solid rgba(0,0,0,0.25)',
        }} />
        <span style={{ fontSize: 11, color: C.text, fontFamily: 'monospace', letterSpacing: 0.5 }}>
          {hex}
        </span>
      </div>
    </div>
  );
}

// ─── Instrument row ──────────────────────────────────────────────────────────

interface InstrumentRowProps {
  label: string;
  expanded?: boolean;
  voices?: Array<{ label: string; color: string }>;
  onToggle?: () => void;
}

function InstrumentRow({ label, expanded, voices, onToggle }: InstrumentRowProps) {
  return (
    <div>
      <div
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 10px',
          borderRadius: 6,
          cursor: 'pointer',
          background: expanded ? 'rgba(255,255,255,0.04)' : 'transparent',
        }}
      >
        {/* Instrument silhouette placeholder */}
        <div style={{
          width: 20, height: 20, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: C.muted, fontSize: 14, lineHeight: 1,
        }}>
          ♪
        </div>
        <span style={{ flex: 1, fontSize: 12, color: C.dimmed }}>{label}</span>
        <span style={{ color: C.muted, fontSize: 10, lineHeight: 1 }}>
          {expanded ? '▴' : '▾'}
        </span>
      </div>

      {expanded && voices && (
        <div style={{ paddingLeft: 10, paddingBottom: 4 }}>
          {voices.map((v, i) => (
            <div key={i} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '6px 10px',
              borderRadius: 6,
              cursor: 'pointer',
            }}>
              <div style={{
                width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                background: v.color,
              }} />
              <span style={{ flex: 1, fontSize: 12, color: C.dimmed }}>{v.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

export default function RightSidebar() {
  const [view, setView] = useState('General');
  const [orientation, setOrientation] = useState('Portrait');
  const [expandedInstr, setExpandedInstr] = useState<string | null>('Violin II');

  const instruments = [
    { label: 'Clarinet in A' },
    { label: 'Horn in F' },
    { label: 'Violin I' },
    { label: 'Violin II', voices: [
      { label: '1 voice', color: C.red },
      { label: '2 voice', color: C.yellow },
    ]},
    { label: 'Viola' },
    { label: 'Cello' },
    { label: 'Double Bass' },
  ];

  return (
    <aside style={{
      width: 280,
      background: C.panel,
      borderLeft: `1px solid ${C.border}`,
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      overflowY: 'auto',
    }}>
      {/* Header: General/Play toggle + menu + collapse */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '14px 16px',
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ flex: 1 }}>
          <PillToggle options={['General', 'Play']} value={view} onChange={setView} />
        </div>
        <button style={{
          width: 28, height: 28, padding: 0,
          color: C.muted, fontSize: 14, lineHeight: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 4,
        }} title="Menu">≡</button>
        <button style={{
          width: 28, height: 28, padding: 0,
          color: C.muted, fontSize: 10, lineHeight: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 4,
        }} title="Collapse sidebar">▾</button>
      </div>

      {/* Sections */}
      <Section title="Format" defaultOpen>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <PillToggle
              options={['Portrait', 'Landscape']}
              value={orientation}
              onChange={setOrientation}
            />
          </div>
          <select style={{
            padding: '6px 10px',
            background: C.btnBg,
            border: `1px solid ${C.btnBorder}`,
            color: C.text,
            borderRadius: 6,
            fontSize: 11.5,
            cursor: 'pointer',
            outline: 'none',
            fontFamily: 'inherit',
          }}>
            <option>A4</option>
            <option>A3</option>
            <option>Letter</option>
          </select>
        </div>
      </Section>

      <Section title="Color" defaultOpen>
        <div style={{ display: 'flex', gap: 18 }}>
          <ColorSwatch label="Page" hex="FFFFFF" bg="#fff" />
          <ColorSwatch label="Line" hex="000000" bg="#000" />
        </div>
      </Section>

      <Section title="Layout" />
      <Section title="Bars" />
      <Section title="Plugins" />
      <Section title="Export" />

      <Section title="Instruments and voices" defaultOpen>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {instruments.map(ins => (
            <InstrumentRow
              key={ins.label}
              label={ins.label}
              expanded={expandedInstr === ins.label}
              voices={ins.voices}
              onToggle={() =>
                setExpandedInstr(expandedInstr === ins.label ? null : ins.label)
              }
            />
          ))}
        </div>
      </Section>
    </aside>
  );
}
