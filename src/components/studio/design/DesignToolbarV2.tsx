/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Design Canvas — Toolbar (v2)
 *
 * Figma-class toolbar with three regions:
 *   - left:   file name (editable), undo/redo, history count
 *   - center: tool rail (select, hand, frame, rect, ellipse, line, polygon,
 *             star, pen, text, comment)
 *   - right:  zoom controls, share button, present, export menu
 */
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';
import { getStore, useDocument, useTool, useZoom } from './core/store';
import type { Tool } from './core/types';
import { ICON } from './core/icons';

const TOOLS: { id: Tool; icon: string; label: string; shortcut?: string }[] = [
  { id: 'select', icon: ICON.select, label: 'Move', shortcut: 'V' },
  { id: 'hand', icon: ICON.hand, label: 'Hand', shortcut: 'H' },
  { id: 'frame', icon: ICON.frame, label: 'Frame', shortcut: 'F' },
  { id: 'rect', icon: ICON.rect, label: 'Rectangle', shortcut: 'R' },
  { id: 'ellipse', icon: ICON.ellipse, label: 'Ellipse', shortcut: 'O' },
  { id: 'line', icon: ICON.line, label: 'Line', shortcut: 'L' },
  { id: 'polygon', icon: ICON.polygon, label: 'Polygon', shortcut: '' },
  { id: 'star', icon: ICON.star, label: 'Star', shortcut: '' },
  { id: 'text', icon: ICON.text, label: 'Text', shortcut: 'T' },
  { id: 'pen', icon: ICON.pen, label: 'Pen', shortcut: 'P' },
  { id: 'comment', icon: ICON.comment, label: 'Comment', shortcut: 'C' },
];

export function DesignToolbarV2() {
  const tool = useTool();
  const zoom = useZoom();
  const doc = useDocument();
  // Re-render on any store change (zoom/pan/tool/selection/history) so the
  // undo/redo + zoom readouts stay live. `useDocument` alone only catches
  // document mutations, not viewport/selection changes.
  const [, force] = useState(0);
  useEffect(() => {
    const unsub = getStore().subscribe(() => force((x: number) => x + 1));
    return () => { unsub(); };
  }, []);

  const canUndo = doc.history.past.length > 0;
  const canRedo = doc.history.future.length > 0;

  return (
    <div className="flex h-12 w-full items-center justify-between border-b border-slate-200 bg-white px-3 backdrop-blur-md select-none">
      {/* Left: file name + history */}
      <div className="flex items-center gap-1.5">
        <div className="flex items-center gap-1 text-slate-600 mr-1">
          <Icon name={ICON.shapes} className="h-3.5 w-3.5 text-blue-600" />
          <input
            value={doc.name}
            onChange={(e) => {
              getStore().commit((d) => { d.name = e.target.value; }, { history: false });
            }}
            className="bg-transparent text-[12px] font-semibold text-slate-900 focus:outline-none focus:bg-slate-50 rounded px-1 w-40"
          />
          <span className="text-[9px] text-slate-500">·</span>
          <span className="text-[9px] text-slate-500 font-mono">{doc.width}×{doc.height}</span>
        </div>

        <Divider />
        <ToolbarBtn icon={ICON.undo} title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={() => getStore().undo()} />
        <ToolbarBtn icon={ICON.redo} title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={() => getStore().redo()} />
        <span className="text-[9px] text-slate-500 font-mono ml-1">{doc.history.past.length}</span>
      </div>

      {/* Center: tool rail */}
      <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            onClick={() => getStore().setTool(t.id)}
            title={`${t.label}${t.shortcut ? ` (${t.shortcut})` : ''}`}
            aria-label={t.label}
            aria-pressed={tool === t.id}
            className={cn(
              'h-8 w-8 grid place-items-center rounded-md transition',
              tool === t.id ? 'bg-blue-600/20 text-blue-600' : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200',
            )}
          >
            <Icon name={t.icon} className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>

      {/* Right: zoom + share + export */}
      <div className="flex items-center gap-1.5">
        <div className="flex items-center gap-0.5 rounded-md border border-slate-200 bg-slate-50 px-1 h-8">
          <ToolbarBtn icon={ICON.zoomOut} title="Zoom out" onClick={() => zoomOut()} />
          <span className="text-[10px] font-mono font-semibold w-10 text-center text-slate-900">
            {Math.round(zoom.zoom * 100)}%
          </span>
          <ToolbarBtn icon={ICON.zoomIn} title="Zoom in" onClick={() => zoomIn()} />
          <Divider />
          <ZoomMenu />
        </div>

        <button
          onClick={() => window.dispatchEvent(new CustomEvent('design:command', { detail: { id: 'present' } }))}
          className="h-8 px-2.5 rounded-md border border-slate-200 bg-slate-50 text-[10px] font-semibold text-slate-700 hover:text-slate-900 hover:border-slate-700 flex items-center gap-1.5"
        >
          <Icon name={ICON.play} className="h-3.5 w-3.5" /> Present
        </button>

        <button
          onClick={() => window.dispatchEvent(new CustomEvent('design:command', { detail: { id: 'share' } }))}
          className="h-8 w-8 rounded-md border border-slate-200 bg-slate-50 text-slate-700 hover:text-slate-900 hover:border-slate-700 grid place-items-center"
          title="Share"
          aria-label="Share"
        >
          <Icon name={ICON.share} className="h-3.5 w-3.5" />
        </button>

        <ExportMenu />
      </div>
    </div>
  );
}

function Divider() {
  return <div className="h-5 w-px bg-slate-200 mx-0.5" />;
}

function ToolbarBtn({ icon, title, onClick, disabled }: { icon: string; title: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={cn(
        'h-6 w-7 grid place-items-center rounded text-slate-700 hover:text-slate-900 hover:bg-slate-200 transition',
        disabled && 'opacity-30 pointer-events-none',
      )}
    >
      <Icon name={icon} className="h-3.5 w-3.5" />
    </button>
  );
}

function ZoomMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as any)) setOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, []);

  const setZoom = (z: number) => {
    const store = getStore();
    const rect = (document.querySelector('[data-canvas-surface]') as HTMLElement | null)?.getBoundingClientRect();
    const cx = rect ? rect.width / 2 : window.innerWidth / 2;
    const cy = rect ? rect.height / 2 : window.innerHeight / 2;
    const px = (cx - store.panX) / store.zoom;
    const py = (cy - store.panY) / store.zoom;
    store.setZoom(z, cx - px * z, cy - py * z);
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        title="Zoom options"
        aria-label="Zoom options"
        aria-haspopup="menu"
        aria-expanded={open}
        className="h-6 w-5 grid place-items-center text-slate-700 hover:text-slate-900"
      >
        <Icon name={ICON.chevronDown} className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute right-0 top-7 z-50 w-32 rounded-md border border-slate-200 bg-white shadow-2xl shadow-black/60 p-1">
          {[
            { label: 'Fit', z: 'fit' as const },
            { label: 'Selection', z: 'selection' as const },
            { label: '50%', z: 0.5 },
            { label: '100%', z: 1 },
            { label: '150%', z: 1.5 },
            { label: '200%', z: 2 },
            { label: '400%', z: 4 },
          ].map((opt) => (
            <button
              key={String(opt.z)}
              onClick={() => {
                if (opt.z === 'fit') zoomToFit();
                else if (opt.z === 'selection') zoomToSelection();
                else setZoom(opt.z as number);
              }}
              className="w-full text-left px-2 py-1.5 text-[10px] text-slate-700 hover:bg-slate-100 rounded"
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function zoomIn() {
  const store = getStore();
  const rect = (document.querySelector('[data-canvas-surface]') as HTMLElement | null)?.getBoundingClientRect();
  const cx = rect ? rect.width / 2 : window.innerWidth / 2;
  const cy = rect ? rect.height / 2 : window.innerHeight / 2;
  const next = Math.min(8, store.zoom * 1.2);
  const px = (cx - store.panX) / store.zoom;
  const py = (cy - store.panY) / store.zoom;
  store.setZoom(next, cx - px * next, cy - py * next);
}

function zoomOut() {
  const store = getStore();
  const rect = (document.querySelector('[data-canvas-surface]') as HTMLElement | null)?.getBoundingClientRect();
  const cx = rect ? rect.width / 2 : window.innerWidth / 2;
  const cy = rect ? rect.height / 2 : window.innerHeight / 2;
  const next = Math.max(0.05, store.zoom / 1.2);
  const px = (cx - store.panX) / store.zoom;
  const py = (cy - store.panY) / store.zoom;
  store.setZoom(next, cx - px * next, cy - py * next);
}

function zoomToFit() {
  const surface = document.querySelector('[data-canvas-surface]') as HTMLElement | null;
  if (!surface) return;
  const doc = getStore().doc;
  const pad = 80;
  const sw = surface.clientWidth - pad * 2;
  const sh = surface.clientHeight - pad * 2;
  const z = Math.min(sw / doc.width, sh / doc.height);
  const store = getStore();
  const cx = surface.clientWidth / 2;
  const cy = surface.clientHeight / 2;
  store.setZoom(z, cx - (doc.width * z) / 2, cy - (doc.height * z) / 2);
}

function zoomToSelection() {
  const surface = document.querySelector('[data-canvas-surface]') as HTMLElement | null;
  if (!surface) return;
  const sel = getStore().selection;
  const doc = getStore().doc;
  if (sel.ids.length === 0) return zoomToFit();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  sel.ids.forEach((id) => {
    const n = doc.nodes[id];
    if (!n) return;
    minX = Math.min(minX, n.geometry.x);
    minY = Math.min(minY, n.geometry.y);
    maxX = Math.max(maxX, n.geometry.x + n.geometry.w);
    maxY = Math.max(maxY, n.geometry.y + n.geometry.h);
  });
  const pad = 60;
  const sw = maxX - minX + pad * 2;
  const sh = maxY - minY + pad * 2;
  const z = Math.min(surface.clientWidth / sw, surface.clientHeight / sh, 8);
  const store = getStore();
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  store.setZoom(z, surface.clientWidth / 2 - cx * z, surface.clientHeight / 2 - cy * z);
}

function ExportMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as any)) setOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="h-8 px-2.5 rounded-md bg-blue-600 text-white text-[10px] font-bold uppercase tracking-wider hover:bg-blue-700 flex items-center gap-1.5"
      >
        <Icon name={ICON.download} className="h-3.5 w-3.5" /> Export
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-50 w-44 rounded-md border border-slate-200 bg-white shadow-2xl shadow-black/60 p-1">
          {[
            { id: 'png', label: 'PNG image', icon: ICON.image },
            { id: 'svg', label: 'SVG vector', icon: ICON.shapes },
            { id: 'json', label: 'Design JSON', icon: ICON.code },
            { id: 'tsx', label: 'React TSX', icon: ICON.code },
            { id: 'pdf', label: 'PDF document', icon: ICON.file },
          ].map((opt) => (
            <button
              key={opt.id}
              onClick={() => {
                window.dispatchEvent(new CustomEvent('design:export', { detail: opt.id }));
                setOpen(false);
              }}
              className="w-full text-left px-2 py-1.5 text-[10px] text-slate-700 hover:bg-slate-100 rounded flex items-center gap-2"
            >
              <Icon name={opt.icon} className="h-3 w-3 text-blue-600" />
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
