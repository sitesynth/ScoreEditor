'use client';

import { useEffect, useRef, useCallback } from 'react';
import type { Score, CursorPosition } from '@/lib/music-model';
import type { EditorMode, StaveLayout } from '@/lib/editor-state';
import { renderScore } from '@/lib/vexflow-renderer';

interface Props {
  score: Score;
  cursor: CursorPosition;
  mode: EditorMode;
  selectedNoteIds: Set<string>;
  zoom: number;
  onLayoutsChange?: (layouts: StaveLayout[]) => void;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}

export default function ScoreRenderer({
  score,
  cursor,
  mode,
  selectedNoteIds,
  zoom,
  onLayoutsChange,
  onClick,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const renderRef = useRef<() => void>(() => {});

  const doRender = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;
    try {
      const layouts = await renderScore(el, score, cursor, mode, selectedNoteIds, zoom);
      onLayoutsChange?.(layouts);
    } catch (err) {
      console.error('VexFlow render error:', err);
    }
  }, [score, cursor, mode, selectedNoteIds, zoom, onLayoutsChange]);

  renderRef.current = doRender;

  useEffect(() => {
    renderRef.current();
  }, [score, cursor, mode, selectedNoteIds, zoom]);

  // Re-render on container resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => renderRef.current());
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const scale = zoom / 100;

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        background: '#f0ede8',
        padding: '24px',
      }}
    >
      {/* Sheet paper */}
      <div
        style={{
          background: '#fff',
          borderRadius: 4,
          boxShadow: '0 2px 16px rgba(0,0,0,0.12)',
          padding: '32px 16px',
          transformOrigin: 'top left',
          transform: `scale(${scale})`,
          width: zoom !== 100 ? `${100 / scale}%` : '100%',
        }}
      >
        {/* Score title */}
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Georgia, serif' }}>
            {score.metadata.title}
          </div>
          {score.metadata.composer && (
            <div style={{ fontSize: 13, color: '#555', marginTop: 4 }}>
              {score.metadata.composer}
            </div>
          )}
        </div>

        {/* VexFlow target */}
        <div
          ref={containerRef}
          onClick={onClick}
          style={{ cursor: mode === 'note-input' ? 'crosshair' : 'default' }}
        />
      </div>
    </div>
  );
}
