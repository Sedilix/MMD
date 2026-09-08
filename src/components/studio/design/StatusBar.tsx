/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Design Canvas — Status Bar
 *
 * Figma-class bottom bar showing:
 *   - cursor position (canvas-space)
 *   - selection bbox
 *   - current zoom
 *   - snap toggle
 *   - rule toggle
 *   - export button
 */
'use client';

import React, { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';
import { getStore, useDocument, useSelection, useStoreTick } from './core/store';
import { ICON } from './core/icons';

export function StatusBar() {
  const doc = useDocument();
  const sel = useSelection();
  useStoreTick();
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [tick, setTick] = useState(0);
  // Snap/Grid read live from the store so the toggles actually drive the
  // renderer (was: local-only state that nothing consumed). The store is
  // the single source of truth.
  const snap = getStore().snap;
  const showGrid = getStore().showGrid;
  useEffect(() => {
    const unsub = getStore().subscribe(() => setTick((x) => x + 1));
    return () => { unsub(); };
  }, []);

  useEffect(() => {
    const handler = (e: any) => setCursor(e.detail);
    window.addEventListener('design:status-cursor', handler);
    return () => window.removeEventListener('design:status-cursor', handler);
  }, []);

  // When selection has a single node, show its bbox; else show multi-summary
  let info: string = '—';
  if (sel.ids.length === 1) {
    const n = doc.nodes[sel.ids[0]];
    if (n) info = `${Math.round(n.geometry.w)} × ${Math.round(n.geometry.h)} · ${Math.round(n.geometry.x)}, ${Math.round(n.geometry.y)}`;
  } else if (sel.ids.length > 1) {
    info = `${sel.ids.length} elements selected`;
  }

  return (
    <div className="flex h-7 items-center justify-between border-t border-slate-200 bg-white px-2 text-[10px] text-slate-600 select-none backdrop-blur-md">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1 font-mono">
          <Icon name={ICON.select} className="h-3 w-3" />
          {cursor ? `${Math.round(cursor.x)}, ${Math.round(cursor.y)}` : '—'}
        </span>
        <span className="text-slate-700">|</span>
        <span className="font-mono">{info}</span>
      </div>
      <div className="flex items-center gap-2">
        <Toggle label="Snap" icon={ICON.alignMiddle} on={snap.enabled} onChange={(v) => getStore().setSnap({ enabled: v })} />
        <Toggle label="Grid" icon={ICON.grid} on={showGrid} onChange={(v) => getStore().setShowGrid(v)} />
        <span className="text-slate-700">|</span>
        <span className="font-mono">{doc.rootIds.length} objects</span>
        <span className="font-mono">{Math.round(getStore().zoom * 100)}%</span>
      </div>
    </div>
  );
}

function Toggle({ label, icon, on, onChange }: { label: string; icon: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={cn(
        'flex items-center gap-1 rounded px-1.5 py-0.5 transition',
        on ? 'bg-blue-600/15 text-blue-600' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50',
      )}
      title={label}
    >
      <Icon name={icon} className="h-3 w-3" />
      {label}
    </button>
  );
}
