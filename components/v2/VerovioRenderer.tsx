'use client';

import React, { useEffect, useRef, useState } from 'react';
import { C } from '@/lib/theme';

// Verovio loads its WebAssembly module lazily on the client.
// We keep the toolkit instance in module-level state so the WASM is
// only initialized once across re-mounts.

let toolkitPromise: Promise<any> | null = null;

async function getToolkit(): Promise<any> {
  if (toolkitPromise) return toolkitPromise;
  toolkitPromise = (async () => {
    // Both modules are ESM. Dynamic imports keep them out of the SSR bundle.
    const VerovioModuleNS = await import('verovio/wasm');
    const VerovioModule = (VerovioModuleNS as any).default ?? VerovioModuleNS;
    const { VerovioToolkit } = await import('verovio/esm');
    const wasm = await VerovioModule();
    return new VerovioToolkit(wasm);
  })();
  return toolkitPromise;
}

// ─── Options ─────────────────────────────────────────────────────────────────

interface VerovioOptions {
  /** SMuFL font name. Bravura is the default and is bundled with Verovio. */
  font?: 'Bravura' | 'Leland' | 'Petaluma' | 'Leipzig';
  /** Score scale in percent. Default 40 (small). */
  scale?: number;
  /** Page width in MEI virtual units (1/100mm). */
  pageWidth?: number;
  /** Page height in MEI virtual units. */
  pageHeight?: number;
  /** Auto-fit page height to content. */
  adjustPageHeight?: boolean;
}

interface Props {
  musicXml: string;
  options?: VerovioOptions;
  /** Called once with the SVG root after each render, for selection/wiring. */
  onSvgRendered?: (root: SVGSVGElement) => void;
}

// ─── Renderer ────────────────────────────────────────────────────────────────

export default function VerovioRenderer({ musicXml, options, onSvgRendered }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const toolkit = await getToolkit();
        if (cancelled) return;

        toolkit.setOptions({
          font: options?.font ?? 'Bravura',
          scale: options?.scale ?? 40,
          pageWidth: options?.pageWidth ?? 2100,
          pageHeight: options?.pageHeight ?? 2970,
          adjustPageHeight: options?.adjustPageHeight ?? true,
          // Honour <print new-system="yes"/> from MusicXML so system breaks
          // stay where score-to-musicxml.ts puts them, instead of Verovio
          // reflowing rows on every keystroke.
          breaks: 'encoded',
          // KILL vertical reflow entirely. Verovio's defaults grow/shrink
          // spacing based on content (ledger lines, etc.) — when a low ghost
          // note appears, the bass staff slides up a few px, the pitch snap
          // zone moves out from under the cursor, and the ghost dances.
          // justificationSystem/Staff: 0 packs everything at fixed spacing
          // regardless of content. spacingSystem/Staff bumped so there's
          // always room for ledger lines without any reflow.
          justificationSystem: 0,
          justificationStaff: 0,
          spacingSystem: 18,
          spacingStaff: 14,
          // Render hints that make selection easier later
          svgViewBox: true,
          svgRemoveXlink: true,
          // No borders/margins around the SVG box itself
          pageMarginTop: 50,
          pageMarginBottom: 50,
          pageMarginLeft: 50,
          pageMarginRight: 50,
        });

        toolkit.loadData(musicXml);
        const svg = toolkit.renderToSVG(1);

        if (!ref.current || cancelled) return;
        ref.current.innerHTML = svg;
        setStatus('ready');

        const svgEl = ref.current.querySelector('svg') as SVGSVGElement | null;
        if (svgEl && onSvgRendered) onSvgRendered(svgEl);
      } catch (err: any) {
        if (cancelled) return;
        console.error('Verovio render error:', err);
        setErrorMsg(err?.message ?? String(err));
        setStatus('error');
      }
    })();

    return () => { cancelled = true; };
  }, [musicXml, options?.font, options?.scale, options?.pageWidth, options?.pageHeight, options?.adjustPageHeight, onSvgRendered]);

  return (
    <div style={{
      position: 'relative',
      width: '100%',
    }}>
      {status === 'loading' && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: C.muted, fontSize: 13,
          background: 'rgba(255,255,255,0.5)',
          backdropFilter: 'blur(2px)',
          zIndex: 1,
        }}>
          Loading Verovio…
        </div>
      )}
      {status === 'error' && (
        <div style={{
          padding: 20, color: '#900',
          background: '#fee', borderRadius: 6,
          fontSize: 12, fontFamily: 'monospace', whiteSpace: 'pre-wrap',
        }}>
          Verovio failed to load:{'\n'}{errorMsg}
        </div>
      )}
      <div
        ref={ref}
        style={{
          width: '100%',
          // Verovio output SVG sizes itself; we let the page-shaped wrapper around it do the framing.
        }}
      />
    </div>
  );
}
