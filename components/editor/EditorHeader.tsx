'use client';

import React from 'react';

interface Props {
  title: string;
  composer?: string;
  canUndo: boolean;
  canRedo: boolean;
  zoom: number;
  onUndo: () => void;
  onRedo: () => void;
  onZoomChange: (z: number) => void;
  onNewScore: () => void;
  onExportXml: () => void;
}

const ZOOM_LEVELS = [50, 75, 100, 125, 150, 200];

const btn: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: 5,
  fontSize: 12,
  cursor: 'pointer',
  background: 'rgba(255,255,255,0.07)',
  border: '1px solid rgba(255,255,255,0.11)',
  color: 'rgba(255,255,255,0.8)',
  whiteSpace: 'nowrap',
};

const iconBtn: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 5,
  border: '1px solid rgba(255,255,255,0.11)',
  color: 'rgba(255,255,255,0.8)',
  background: 'rgba(255,255,255,0.06)',
  cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 14, flexShrink: 0,
};

const iconBtnDisabled: React.CSSProperties = {
  ...iconBtn, opacity: 0.22, cursor: 'default',
};

const sep: React.CSSProperties = {
  width: 1, height: 20, background: 'rgba(255,255,255,0.09)',
  margin: '0 6px', flexShrink: 0,
};

export default function EditorHeader({
  title, composer, canUndo, canRedo, zoom,
  onUndo, onRedo, onZoomChange, onNewScore, onExportXml,
}: Props) {
  return (
    <div style={{
      height: 46,
      background: '#1b1d23',
      display: 'flex',
      alignItems: 'center',
      padding: '0 12px',
      gap: 5,
      flexShrink: 0,
      borderBottom: '1px solid rgba(255,255,255,0.06)',
    }}>
      {/* Logo */}
      <div style={{
        width: 30, height: 30, borderRadius: 7,
        background: '#c0392b',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 17, color: '#fff', flexShrink: 0, marginRight: 6,
        userSelect: 'none',
      }}>
        ♩
      </div>

      <button onClick={onNewScore} style={btn}>+ New</button>
      <button onClick={onExportXml} style={btn}>⬇ XML</button>

      <div style={sep} />

      {/* Title (center) */}
      <div style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.9)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {title || 'Untitled Score'}
        </div>
        {composer && (
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)', marginTop: 1 }}>
            {composer}
          </div>
        )}
      </div>

      <div style={sep} />

      {/* Undo / Redo */}
      <button
        onClick={onUndo} disabled={!canUndo}
        style={canUndo ? iconBtn : iconBtnDisabled}
        title="Undo (Ctrl+Z)"
      >↩</button>
      <button
        onClick={onRedo} disabled={!canRedo}
        style={canRedo ? iconBtn : iconBtnDisabled}
        title="Redo (Ctrl+Y)"
      >↪</button>

      <div style={sep} />

      {/* Zoom */}
      <select
        value={zoom}
        onChange={e => onZoomChange(Number(e.target.value))}
        style={{
          background: 'rgba(255,255,255,0.07)',
          border: '1px solid rgba(255,255,255,0.11)',
          color: 'rgba(255,255,255,0.8)',
          borderRadius: 5,
          padding: '4px 6px',
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        {ZOOM_LEVELS.map(z => (
          <option key={z} value={z} style={{ background: '#1b1d23' }}>{z}%</option>
        ))}
      </select>
    </div>
  );
}
