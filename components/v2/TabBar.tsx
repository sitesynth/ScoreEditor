'use client';

import React, { useState } from 'react';
import { C } from '@/lib/theme';

// ─── Tab pill ────────────────────────────────────────────────────────────────

interface Tab {
  id: string;
  name: string;
  active?: boolean;
}

function TabPill({ tab, onClose, onClick }: {
  tab: Tab;
  onClose?: (id: string) => void;
  onClick?: (id: string) => void;
}) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={() => onClick?.(tab.id)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 8px 6px 10px',
        background: tab.active ? 'rgba(255,255,255,0.06)' : 'transparent',
        borderRadius: 6,
        cursor: 'pointer',
        height: 32,
        maxWidth: 220,
        flexShrink: 0,
        position: 'relative',
      }}
    >
      {/* Red rounded square with a white music note inside */}
      <span
        style={{
          width: 18, height: 18,
          background: C.red,
          borderRadius: 4,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          color: '#fff',
          fontSize: 13,
          lineHeight: 1,
          fontFamily: 'serif',
        }}
      >
        ♪
      </span>
      <span
        style={{
          color: tab.active ? C.text : C.dimmed,
          fontSize: 12,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          flex: 1,
        }}
      >
        {tab.name}
      </span>
      {(tab.active || hov) && (
        <button
          onClick={(e) => { e.stopPropagation(); onClose?.(tab.id); }}
          title="Close"
          style={{
            width: 16, height: 16, padding: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: C.muted, fontSize: 13, lineHeight: 1,
            background: 'transparent', border: 'none',
            borderRadius: 3, cursor: 'pointer', flexShrink: 0,
          }}
        >×</button>
      )}
    </div>
  );
}

// ─── Tab bar ─────────────────────────────────────────────────────────────────

interface Props {
  /** Project tabs. If omitted, one tab is synthesised from `projectName`. */
  tabs?: Tab[];
  /** Used when `tabs` is not provided — single active tab gets this name. */
  projectName?: string;
  onHome?: () => void;
  onNewTab?: () => void;
  onCloseTab?: (id: string) => void;
  onPickTab?: (id: string) => void;
}

export default function TabBar({
  tabs,
  projectName = 'Untitled',
  onHome,
  onNewTab,
  onCloseTab,
  onPickTab,
}: Props) {
  const effectiveTabs: Tab[] = tabs ?? [
    { id: 'current', name: projectName, active: true },
  ];
  return (
    <div style={{
      height: 40,
      background: C.topbar,
      display: 'flex',
      alignItems: 'center',
      padding: '0 8px',
      gap: 4,
      flexShrink: 0,
      borderBottom: `1px solid ${C.border}`,
    }}>
      {/* Home */}
      <button
        onClick={onHome}
        title="Home"
        style={{
          width: 32, height: 32, padding: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: C.text, background: 'transparent', border: 'none',
          borderRadius: 6, cursor: 'pointer',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2h-4a1 1 0 0 1-1-1v-6h-4v6a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2z" />
        </svg>
      </button>

      <div style={{ width: 1, height: 20, background: C.border, margin: '0 4px' }} />

      {/* Tabs (scroll horizontally if many) */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 2,
        flex: 1, minWidth: 0,
        overflowX: 'auto',
      }}>
        {effectiveTabs.map(t => (
          <TabPill key={t.id} tab={t} onClick={onPickTab} onClose={onCloseTab} />
        ))}
        <button
          onClick={onNewTab}
          title="New tab"
          style={{
            width: 28, height: 28, padding: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: C.muted, fontSize: 16, lineHeight: 1,
            background: 'transparent', border: 'none',
            borderRadius: 4, cursor: 'pointer', flexShrink: 0,
            marginLeft: 4,
          }}
        >+</button>
      </div>
    </div>
  );
}
