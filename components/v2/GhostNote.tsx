'use client';

import React from 'react';
import type { DurationBase } from '@/lib/v2/editor-store';

interface Props {
  /** Position in client (page) coords — center of the notehead. */
  x: number;
  y: number;
  base: DurationBase;
  dots: 0 | 1 | 2;
  alter?: -1 | 0 | 1;
  /** Notehead vertical diameter in px (= 1 staff space). */
  noteheadHeight: number;
  /** Steps from top staff line (0 = top line, positive = down). */
  stepIndex: number;
  /** Highlight color (allows distinguishing staves / voices). */
  color?: string;
}

// ─── Ghost note ──────────────────────────────────────────────────────────────
// Semi-transparent SVG of a notehead + stem + flags + ledger lines + accidental.
// Used as a hover preview in Note Input mode. The whole thing is positioned
// absolutely in client coords and ignores pointer events.

export default function GhostNote({
  x, y, base, dots, alter, noteheadHeight, stepIndex, color = '#c0392b',
}: Props) {
  const space = noteheadHeight;           // 1 staff-space height
  const halfSpace = space / 2;
  const headRY = space * 0.5;             // diameter = 1 space
  const headRX = headRY * 1.3;
  const stemH  = space * 3.5;
  const stemX  = headRX * 0.85;
  const isHollow = base === 'whole' || base === 'half';
  const flags = ({ whole: 0, half: 0, quarter: 0, eighth: 1, '16th': 2, '32nd': 3, '64th': 4 } as Record<DurationBase, number>)[base];
  const showStem = base !== 'whole';

  // ── Ledger lines ──
  // stepIndex 0 = top staff line. Each half-step down/up = 1 line/space.
  // Staff has 5 lines → bottom line is stepIndex 8 (4 spaces × 2 half-steps).
  // Above top: ledger lines at stepIndex = -2, -4, -6, ...
  // Below bottom: ledger lines at stepIndex = 10, 12, 14, ...
  const ledgerLines: number[] = [];   // Y offsets from notehead center
  if (stepIndex < 0) {
    // Above the staff
    for (let s = -2; s >= stepIndex; s -= 2) {
      const offsetSteps = s - stepIndex;       // 0 means at the notehead itself
      ledgerLines.push(offsetSteps * halfSpace);
    }
  } else if (stepIndex > 8) {
    // Below the staff
    for (let s = 10; s <= stepIndex; s += 2) {
      const offsetSteps = s - stepIndex;
      ledgerLines.push(offsetSteps * halfSpace);
    }
  }

  // SVG canvas size. Account for stem going up + ledger lines.
  const ledgerExtent = ledgerLines.length > 0
    ? Math.max(...ledgerLines.map(l => Math.abs(l)))
    : 0;
  const topPad    = Math.max(stemH, ledgerExtent + halfSpace) + 4;
  const bottomPad = Math.max(headRY, ledgerExtent + halfSpace) + 4;

  const width  = headRX * 2 + stemX + 10;
  const height = topPad + bottomPad;
  const innerCx = headRX + 4;             // small left padding for accidentals
  const innerCy = topPad;

  return (
    <div
      style={{
        position: 'absolute',
        left: x - innerCx,
        top:  y - innerCy,
        pointerEvents: 'none',
        opacity: 0.6,
        zIndex: 10,
        transition: 'left 30ms linear, top 30ms linear',
        willChange: 'left, top',
      }}
    >
      <svg
        width={width + 20}
        height={height}
        viewBox={`-10 0 ${width + 20} ${height}`}
        style={{ display: 'block', overflow: 'visible' }}
      >
        {/* Accidental glyph left of the head */}
        {alter === 1 && (
          <text x={-4} y={innerCy + headRY * 0.6} fontSize={headRY * 3.2}
                fontFamily="serif" fill={color}>♯</text>
        )}
        {alter === -1 && (
          <text x={-4} y={innerCy + headRY * 0.6} fontSize={headRY * 3.2}
                fontFamily="serif" fill={color}>♭</text>
        )}

        {/* Ledger lines through the notehead and toward the staff */}
        {ledgerLines.map((dy, i) => (
          <line
            key={i}
            x1={innerCx - headRX * 1.6}
            y1={innerCy + dy}
            x2={innerCx + headRX * 1.6}
            y2={innerCy + dy}
            stroke={color}
            strokeWidth={Math.max(1, halfSpace * 0.32)}
            strokeLinecap="square"
          />
        ))}

        {/* Stem (behind notehead). For above-staff notes stem points down; for
            below-staff notes — up. For on-staff — up by default. */}
        {showStem && (
          <line
            x1={innerCx + (stepIndex < 4 ? stemX : -stemX * 0.9)}
            y1={innerCy}
            x2={innerCx + (stepIndex < 4 ? stemX : -stemX * 0.9)}
            y2={innerCy + (stepIndex < 4 ? stemH : -stemH)}
            stroke={color}
            strokeWidth={Math.max(0.9, headRY * 0.22)}
          />
        )}

        {/* Notehead */}
        <ellipse
          cx={innerCx}
          cy={innerCy}
          rx={headRX}
          ry={headRY}
          transform={`rotate(-18 ${innerCx} ${innerCy})`}
          fill={isHollow ? 'none' : color}
          stroke={color}
          strokeWidth={Math.max(1, headRY * 0.32)}
        />

        {/* Flags */}
        {showStem && Array.from({ length: flags }).map((_, i) => {
          const dir = stepIndex < 4 ? 1 : -1;
          const baseY = innerCy + (stepIndex < 4 ? stemH : -stemH);
          const fy = baseY - i * (space * 0.7) * dir;
          const x0 = innerCx + (stepIndex < 4 ? stemX : -stemX * 0.9);
          return (
            <path
              key={i}
              d={`M${x0} ${fy} C${x0 + headRX * 1.6 * dir} ${fy + headRY * 1.1 * dir}, ${x0 + headRX * 1.6 * dir} ${fy + headRY * 2.3 * dir}, ${x0} ${fy + headRY * 2.9 * dir}`}
              stroke={color}
              strokeWidth={Math.max(0.9, headRY * 0.32)}
              fill="none"
              strokeLinecap="round"
            />
          );
        })}

        {/* Augmentation dots */}
        {dots > 0 && (
          <circle cx={innerCx + headRX * 1.7} cy={innerCy} r={headRY * 0.3} fill={color} />
        )}
        {dots > 1 && (
          <circle cx={innerCx + headRX * 2.4} cy={innerCy} r={headRY * 0.3} fill={color} />
        )}
      </svg>
    </div>
  );
}
