'use client';

import React, { useState, useRef, useEffect } from 'react';
import { C } from '@/lib/theme';

interface Props {
  projectName?: string;
  zoom?: number;
  onZoomChange?: (z: number) => void;
  palettesOpen?: boolean;
  onPalettesToggle?: () => void;
}

const ZOOM_MIN = 25;
const ZOOM_MAX = 400;
const PRESETS: Array<{ label: string; value: number | 'fit'; shortcut?: string }> = [
  { label: 'Zoom in',      value: 'fit', shortcut: 'Ctrl++' },
  { label: 'Zoom out',     value: 'fit', shortcut: 'Ctrl+−' },
  { label: 'Zoom to 50%',  value: 50 },
  { label: 'Zoom to 100%', value: 100, shortcut: 'Ctrl+0' },
  { label: 'Zoom to 200%', value: 200 },
];

const MENU_SECTIONS: Array<Array<{ label: string; expandable?: boolean }>> = [
  [
    { label: 'File',    expandable: true },
    { label: 'Edit',    expandable: true },
    { label: 'View',    expandable: true },
    { label: 'Object',  expandable: true },
    { label: 'Text',    expandable: true },
    { label: 'Arrange', expandable: true },
    { label: 'Vector',  expandable: true },
  ],
  [
    { label: 'Plugins',     expandable: true },
    { label: 'Widgets',     expandable: true },
    { label: 'Preferences', expandable: true },
    { label: 'Libraries' },
  ],
  [
    { label: 'AI balance',       expandable: true },
    { label: 'Help and account', expandable: true },
  ],
];

export default function EditorTopBar({
  projectName = 'New Project',
  zoom = 100,
  onZoomChange,
  palettesOpen,
  onPalettesToggle,
}: Props) {
  const [zoomOpen, setZoomOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const zoomWrap = useRef<HTMLDivElement>(null);
  const menuWrap = useRef<HTMLDivElement>(null);

  const setZ = (z: number) => onZoomChange?.(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(z))));

  useEffect(() => {
    if (!zoomOpen && !menuOpen) return;
    function onDown(e: MouseEvent) {
      if (zoomWrap.current && !zoomWrap.current.contains(e.target as Node)) setZoomOpen(false);
      if (menuWrap.current && !menuWrap.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [zoomOpen, menuOpen]);

  return (
    <div style={{
      // "Second bar" — not really a full bar, just floating pills on a
      // transparent strip. Has a small height to give the pills room.
      height: 52,
      display: 'flex',
      alignItems: 'center',
      padding: '0 12px',
      gap: 8,
      flexShrink: 0,
      position: 'relative',
      // The strip is transparent so the score canvas's background shows
      // through; pills sit on top of that.
      background: 'transparent',
    }}>
      {/* ─── Left floating pill: logo dropdown + project name + sidebar ─── */}
      <div
        ref={menuWrap}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: 4,
          background: 'rgba(28, 28, 32, 0.85)',
          backdropFilter: 'blur(8px)',
          borderRadius: 10,
          height: 40,
          boxShadow: '0 2px 10px rgba(0,0,0,0.35)',
          position: 'relative',
        }}
      >
        {/* ScoreSynth-style logo + chevron (opens dropdown) */}
        <button
          onClick={() => setMenuOpen(o => !o)}
          title="Project menu"
          style={{
            display: 'flex', alignItems: 'center', gap: 2,
            padding: '0 6px 0 8px',
            height: 32,
            borderRadius: 6,
            background: menuOpen ? 'rgba(255,255,255,0.10)' : 'transparent',
            border: 'none',
            color: C.text,
            cursor: 'pointer',
          }}
        >
          {/* ScoreSynth brand mark */}
          <img
            src="/logo-scoresynth-mark.svg"
            alt="ScoreSynth"
            width={22}
            height={22}
            draggable={false}
            style={{ display: 'block', pointerEvents: 'none' }}
          />
          <span style={{ fontSize: 9, color: C.muted, marginLeft: 1, lineHeight: 1 }}>▾</span>
        </button>

        {/* Label — this pill is the palette opener, hence "Palettes" (not
            the project name; the project name lives in the TabBar above). */}
        <span style={{
          color: C.text,
          fontSize: 13,
          fontWeight: 500,
          padding: '0 6px',
          whiteSpace: 'nowrap',
        }}>
          Palettes
        </span>

        {/* Sidebar toggle — bass clef glyph, reveals additional notation */}
        {onPalettesToggle && (
          <button
            onClick={onPalettesToggle}
            title={palettesOpen ? 'Hide palettes' : 'Show palettes'}
            style={{
              width: 36, height: 32,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 6,
              background: palettesOpen ? 'rgba(255,255,255,0.10)' : 'transparent',
              color: palettesOpen ? C.text : C.muted,
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            <span
              className="smufl"
              style={{
                fontSize: 22,
                lineHeight: 1,
                color: 'inherit',
                display: 'inline-block',
                marginTop: -2,
              }}
            >
              {String.fromCodePoint(0xE062)}
            </span>
          </button>
        )}

        {menuOpen && (
          <div style={{
            position: 'absolute',
            top: 48,
            left: 0,
            minWidth: 240,
            background: C.topbar,
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            padding: 6,
            zIndex: 100,
            boxShadow: '0 12px 36px rgba(0,0,0,0.6)',
            display: 'flex', flexDirection: 'column', gap: 1,
          }}>
            <button style={{
              display: 'flex', alignItems: 'center', gap: 8,
              width: '100%', padding: '8px 10px',
              background: 'transparent', border: 'none',
              color: C.text, fontSize: 12.5,
              cursor: 'pointer', borderRadius: 6, fontFamily: 'inherit',
              textAlign: 'left',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <span style={{ flex: 1 }}>Actions…</span>
              <span style={{ color: C.muted, fontSize: 10 }}>Ctrl+K</span>
            </button>

            {MENU_SECTIONS.map((section, si) => (
              <React.Fragment key={si}>
                <div style={{ height: 1, background: C.border, margin: '6px 4px' }} />
                {section.map((it, i) => (
                  <button
                    key={i}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      width: '100%', padding: '7px 10px',
                      background: 'transparent', border: 'none',
                      color: C.text, fontSize: 12.5,
                      cursor: 'pointer', borderRadius: 6, fontFamily: 'inherit',
                      textAlign: 'left',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={{ flex: 1 }}>{it.label}</span>
                    {it.expandable && <span style={{ color: C.muted, fontSize: 9 }}>›</span>}
                  </button>
                ))}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      <div style={{ flex: 1 }} />

      {/* ─── Right floating pill: zoom controls ─────────────────────────── */}
      <div
        ref={zoomWrap}
        style={{
          display: 'flex', alignItems: 'center', gap: 2,
          padding: 3,
          background: 'rgba(28, 28, 32, 0.85)',
          backdropFilter: 'blur(8px)',
          borderRadius: 10,
          height: 40,
          boxShadow: '0 2px 10px rgba(0,0,0,0.35)',
        }}
      >
        <button onClick={() => setZ(zoom - 10)} title="Zoom out (Ctrl+−)" style={zoomBtnStyle}>−</button>
        <button
          onClick={() => setZoomOpen(o => !o)}
          style={{ ...zoomBtnStyle, width: 60, fontVariantNumeric: 'tabular-nums', color: C.text }}
          title="Zoom presets"
        >
          {zoom}%
        </button>
        <button onClick={() => setZ(zoom + 10)} title="Zoom in (Ctrl++)" style={zoomBtnStyle}>+</button>
      </div>

      {zoomOpen && (
        <div style={{
          position: 'absolute', top: 48, right: 12,
          minWidth: 240,
          background: C.topbar,
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          padding: 6,
          zIndex: 100,
          boxShadow: '0 12px 36px rgba(0,0,0,0.6)',
          display: 'flex', flexDirection: 'column', gap: 2,
        }}>
          {PRESETS.map((p, i) => (
            <button
              key={i}
              onClick={() => {
                if (typeof p.value === 'number') setZ(p.value);
                setZoomOpen(false);
              }}
              style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '6px 10px',
                background: 'transparent', border: 'none',
                color: C.text, fontSize: 12,
                cursor: 'pointer', borderRadius: 6, fontFamily: 'inherit',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span>{p.label}</span>
              {p.shortcut && <span style={{ color: C.muted, fontSize: 10 }}>{p.shortcut}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const zoomBtnStyle: React.CSSProperties = {
  width: 30, height: 30, padding: 0,
  color: C.muted, fontSize: 14, lineHeight: 1,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: 6,
  background: 'transparent', border: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
};
