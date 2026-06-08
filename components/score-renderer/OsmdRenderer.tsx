'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { Score } from '@/lib/music-model';
import { exportMusicXml } from '@/lib/musicxml';

interface Props {
  score: Score;
  rawXml?: string | null;   // если задан — рендерим его напрямую, минуя конвертацию
  zoom?: number;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}

export default function OsmdRenderer({ score, rawXml, zoom = 100, onClick }: Props) {
  const wrapRef      = useRef<HTMLDivElement>(null);
  const osmdRef      = useRef<any>(null);
  const loadedXmlRef = useRef<string>('');
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [errMsg, setErrMsg] = useState('');

  const doRender = useCallback(async () => {
    const container = wrapRef.current;
    if (!container) return;

    setStatus('loading');
    try {
      // Dynamic import — OSMD requires browser DOM
      const { OpenSheetMusicDisplay } = await import('opensheetmusicdisplay');

      // Create OSMD instance once
      if (!osmdRef.current) {
        osmdRef.current = new OpenSheetMusicDisplay(container, {
          autoResize:        false,
          backend:           'svg',
          drawingParameters: 'default',
          drawCredits:       false,   // заголовок рисуем сами
          defaultColorMusic: '#111111',
        });
      }

      const xml = rawXml ?? exportMusicXml(score);

      // Only reload if XML actually changed (avoids flicker on cursor moves)
      if (xml !== loadedXmlRef.current) {
        await osmdRef.current.load(xml);
        loadedXmlRef.current = xml;
      }

      osmdRef.current.zoom = zoom / 100;
      osmdRef.current.render();
      setStatus('ok');
    } catch (e: any) {
      console.error('[OSMD]', e);
      setErrMsg(String(e?.message ?? e));
      setStatus('error');
    }
  }, [score, rawXml, zoom]);

  // Re-render when score / zoom / rawXml change
  useEffect(() => { doRender(); }, [doRender]);

  // Re-render on container resize
  useEffect(() => {
    const el = wrapRef.current?.parentElement;
    if (!el) return;
    const obs = new ResizeObserver(() => {
      if (osmdRef.current?.IsReadyToRender?.()) {
        osmdRef.current.zoom = zoom / 100;
        osmdRef.current.render();
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [zoom]);

  return (
    <div style={{ position: 'relative' }} onClick={onClick}>
      {status === 'loading' && (
        <div style={{
          position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)',
          fontSize: 12, color: '#aaa', pointerEvents: 'none',
        }}>
          Rendering…
        </div>
      )}
      {status === 'error' && (
        <div style={{
          padding: 16, color: '#c0392b', fontSize: 12,
          fontFamily: 'monospace', background: '#fff8f8', borderRadius: 6,
          margin: 16,
        }}>
          <strong>Render error:</strong> {errMsg}
        </div>
      )}
      <div ref={wrapRef} />
    </div>
  );
}
