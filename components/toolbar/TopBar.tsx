'use client';

interface Props {
  title: string;
  canUndo: boolean;
  canRedo: boolean;
  mode: 'normal' | 'note-input';
  zoom: number;
  onUndo: () => void;
  onRedo: () => void;
  onToggleNoteInput: () => void;
  onZoomChange: (z: number) => void;
  onNewScore: () => void;
  onExportXml: () => void;
}

const btnBase: React.CSSProperties = {
  padding: '5px 12px',
  borderRadius: 5,
  fontSize: 12,
  cursor: 'pointer',
  border: '1px solid rgba(255,255,255,0.15)',
  color: '#fff',
  background: 'rgba(255,255,255,0.08)',
  transition: 'background 0.1s',
};

const btnActive: React.CSSProperties = {
  ...btnBase,
  background: '#c0392b',
  border: '1px solid #c0392b',
};

const iconBtn: React.CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 5,
  border: '1px solid rgba(255,255,255,0.15)',
  color: '#fff',
  background: 'rgba(255,255,255,0.08)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 14,
};

const iconBtnDisabled: React.CSSProperties = {
  ...iconBtn,
  opacity: 0.3,
  cursor: 'default',
};

const ZOOM_LEVELS = [50, 75, 100, 125, 150, 200];

export default function TopBar({
  title, canUndo, canRedo, mode, zoom,
  onUndo, onRedo, onToggleNoteInput, onZoomChange, onNewScore, onExportXml,
}: Props) {
  return (
    <div style={{
      height: 44,
      background: '#1a1a2e',
      display: 'flex',
      alignItems: 'center',
      padding: '0 16px',
      gap: 8,
      flexShrink: 0,
      borderBottom: '1px solid rgba(255,255,255,0.08)',
    }}>
      {/* Logo / New */}
      <button onClick={onNewScore} style={{ ...btnBase, marginRight: 8 }}>
        + New
      </button>

      <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.12)', margin: '0 4px' }} />

      {/* Title */}
      <span style={{
        fontSize: 13,
        color: 'rgba(255,255,255,0.7)',
        flex: 1,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        maxWidth: 200,
      }}>
        {title || 'Untitled Score'}
      </span>

      <div style={{ flex: 1 }} />

      {/* Note input mode */}
      <button
        onClick={onToggleNoteInput}
        style={mode === 'note-input' ? btnActive : btnBase}
        title="Toggle note input mode (N)"
      >
        ✏️ Note Input
      </button>

      <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.12)', margin: '0 4px' }} />

      {/* Undo / Redo */}
      <button
        onClick={onUndo}
        disabled={!canUndo}
        style={canUndo ? iconBtn : iconBtnDisabled}
        title="Undo (Ctrl+Z)"
      >↩</button>
      <button
        onClick={onRedo}
        disabled={!canRedo}
        style={canRedo ? iconBtn : iconBtnDisabled}
        title="Redo (Ctrl+Y)"
      >↪</button>

      <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.12)', margin: '0 4px' }} />

      {/* Zoom */}
      <select
        value={zoom}
        onChange={e => onZoomChange(Number(e.target.value))}
        style={{
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.15)',
          color: '#fff',
          borderRadius: 5,
          padding: '3px 6px',
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        {ZOOM_LEVELS.map(z => (
          <option key={z} value={z} style={{ background: '#1a1a2e' }}>{z}%</option>
        ))}
      </select>

      <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.12)', margin: '0 4px' }} />

      {/* Export */}
      <button onClick={onExportXml} style={btnBase} title="Export MusicXML">
        ⬇ XML
      </button>
    </div>
  );
}
