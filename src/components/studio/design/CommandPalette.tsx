/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Design Canvas — Command Palette
 *
 * Ctrl/Cmd+K to open. Fuzzy search through every command and immediately
 * dispatch. Figma-class quick action surface.
 */
'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';
import { ICON } from './core/icons';
import { getStore } from './core/store';
import {
  addImageFromUrl,
  addShape,
  addTextPreset,
  alignSelection,
  clearDocument,
  deleteSelection,
  distributeSelection,
  duplicateSelection,
  groupSelection,
  reorder,
  ungroupSelection,
  resizeArtboard,
} from './core/actions';
import type { DesignCommand } from './core/types';

const COMMANDS: (DesignCommand & { group: string })[] = [
  // tools
  { id: 'tool-select', group: 'Tools', label: 'Select tool (V)', icon: ICON.select, shortcut: 'V', run: () => getStore().setTool('select') },
  { id: 'tool-hand', group: 'Tools', label: 'Hand tool (H)', icon: ICON.hand, shortcut: 'H', run: () => getStore().setTool('hand') },
  { id: 'tool-frame', group: 'Tools', label: 'Frame tool (F)', icon: ICON.frame, shortcut: 'F', run: () => getStore().setTool('frame') },
  { id: 'tool-rect', group: 'Tools', label: 'Rectangle tool (R)', icon: ICON.rect, shortcut: 'R', run: () => getStore().setTool('rect') },
  { id: 'tool-ellipse', group: 'Tools', label: 'Ellipse tool (O)', icon: ICON.ellipse, shortcut: 'O', run: () => getStore().setTool('ellipse') },
  { id: 'tool-line', group: 'Tools', label: 'Line tool (L)', icon: ICON.line, shortcut: 'L', run: () => getStore().setTool('line') },
  { id: 'tool-text', group: 'Tools', label: 'Text tool (T)', icon: ICON.text, shortcut: 'T', run: () => getStore().setTool('text') },
  { id: 'tool-pen', group: 'Tools', label: 'Pen tool (P)', icon: ICON.pen, shortcut: 'P', run: () => getStore().setTool('pen') },

  // insert
  { id: 'add-rect', group: 'Insert', label: 'Add rectangle', icon: ICON.rect, run: () => { addShape('rect'); } },
  { id: 'add-ellipse', group: 'Insert', label: 'Add ellipse', icon: ICON.ellipse, run: () => { addShape('ellipse'); } },
  { id: 'add-triangle', group: 'Insert', label: 'Add triangle', icon: ICON.triangle, run: () => { addShape('triangle'); } },
  { id: 'add-star', group: 'Insert', label: 'Add star', icon: ICON.star, run: () => { addShape('star'); } },
  { id: 'add-line', group: 'Insert', label: 'Add line', icon: ICON.line, run: () => { addShape('line'); } },
  { id: 'add-polygon', group: 'Insert', label: 'Add hexagon', icon: ICON.polygon, run: () => { addShape('polygon'); } },
  { id: 'add-frame', group: 'Insert', label: 'Add frame', icon: ICON.frame, run: () => { addShape('frame'); } },
  { id: 'add-text', group: 'Insert', label: 'Add text', icon: ICON.text, run: () => { addTextPreset('body'); } },
  { id: 'add-header', group: 'Insert', label: 'Add heading', icon: ICON.text, run: () => { addTextPreset('header'); } },

  // arrange
  { id: 'arrange-front', group: 'Arrange', label: 'Bring to front', icon: ICON.bringFront, run: () => { const id = getStore().selection.primary; if (id) reorder(id, 'front'); } },
  { id: 'arrange-back', group: 'Arrange', label: 'Send to back', icon: ICON.sendBack, run: () => { const id = getStore().selection.primary; if (id) reorder(id, 'back'); } },
  { id: 'arrange-forward', group: 'Arrange', label: 'Bring forward', icon: ICON.bringForward, run: () => { const id = getStore().selection.primary; if (id) reorder(id, 'forward'); } },
  { id: 'arrange-backward', group: 'Arrange', label: 'Send backward', icon: ICON.sendBackward, run: () => { const id = getStore().selection.primary; if (id) reorder(id, 'backward'); } },
  { id: 'align-left', group: 'Arrange', label: 'Align left', icon: ICON.alignLeft, run: () => alignSelection('left') },
  { id: 'align-center', group: 'Arrange', label: 'Align center', icon: ICON.alignCenter, run: () => alignSelection('center') },
  { id: 'align-right', group: 'Arrange', label: 'Align right', icon: ICON.alignRight, run: () => alignSelection('right') },
  { id: 'align-top', group: 'Arrange', label: 'Align top', icon: ICON.alignTop, run: () => alignSelection('top') },
  { id: 'align-middle', group: 'Arrange', label: 'Align middle', icon: ICON.alignMiddle, run: () => alignSelection('middle') },
  { id: 'align-bottom', group: 'Arrange', label: 'Align bottom', icon: ICON.alignBottom, run: () => alignSelection('bottom') },
  { id: 'dist-h', group: 'Arrange', label: 'Distribute horizontally', icon: ICON.distributeH, run: () => distributeSelection('horizontal') },
  { id: 'dist-v', group: 'Arrange', label: 'Distribute vertically', icon: ICON.distributeV, run: () => distributeSelection('vertical') },

  // edit
  { id: 'duplicate', group: 'Edit', label: 'Duplicate', icon: ICON.duplicate, shortcut: 'Ctrl+D', run: () => { duplicateSelection(); } },
  { id: 'group', group: 'Edit', label: 'Group selection', icon: ICON.group, shortcut: 'Ctrl+G', run: () => { groupSelection(); } },
  { id: 'ungroup', group: 'Edit', label: 'Ungroup', icon: ICON.ungroup, shortcut: 'Ctrl+Shift+G', run: () => { ungroupSelection(); } },
  { id: 'delete', group: 'Edit', label: 'Delete', icon: ICON.delete, shortcut: 'Del', run: () => deleteSelection() },
  { id: 'undo', group: 'Edit', label: 'Undo', icon: ICON.undo, shortcut: 'Ctrl+Z', run: () => getStore().undo() },
  { id: 'redo', group: 'Edit', label: 'Redo', icon: ICON.redo, shortcut: 'Ctrl+Shift+Z', run: () => getStore().redo() },
  { id: 'clear', group: 'Edit', label: 'Clear canvas', icon: ICON.refresh, run: () => clearDocument() },

  // artboard
  { id: 'artboard-square', group: 'Artboard', label: 'Resize artboard to 1080×1080', icon: ICON.frame, run: () => resizeArtboard(1080, 1080) },
  { id: 'artboard-169', group: 'Artboard', label: 'Resize artboard to 1920×1080', icon: ICON.frame, run: () => resizeArtboard(1920, 1080) },
  { id: 'artboard-mobile', group: 'Artboard', label: 'Resize artboard to 390×844 (iPhone)', icon: ICON.frame, run: () => resizeArtboard(390, 844) },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

function fuzzy(s: string, q: string): number {
  q = q.toLowerCase();
  s = s.toLowerCase();
  let qi = 0;
  let score = 0;
  for (let i = 0; i < s.length && qi < q.length; i++) {
    if (s[i] === q[qi]) {
      score += 1;
      qi++;
    }
  }
  return qi === q.length ? score : -1;
}

export function CommandPalette({ open, onClose }: Props) {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (open) { setQ(''); setIdx(0); }
  }, [open]);

  const filtered = useMemo(() => {
    if (!q.trim()) return COMMANDS;
    return COMMANDS.map((c) => ({ c, s: fuzzy(c.label, q) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.c);
  }, [q]);

  if (!open) return null;
  const groups = groupBy(filtered, 'group');
  const flat: DesignCommand[] = [];
  Object.values(groups).forEach((g) => g.forEach((c) => flat.push(c)));
  const item = flat[idx];

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-32 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[480px] max-w-[90vw] rounded-xl border border-slate-200 bg-white shadow-2xl shadow-black/80 overflow-hidden"
      >
        <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2.5">
          <Icon name={ICON.search} className="h-4 w-4 text-slate-500" />
          <input
            autoFocus
            value={q}
            onChange={(e) => { setQ(e.target.value); setIdx(0); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { setIdx((i) => Math.min(flat.length - 1, i + 1)); e.preventDefault(); }
              if (e.key === 'ArrowUp') { setIdx((i) => Math.max(0, i - 1)); e.preventDefault(); }
              if (e.key === 'Enter' && item) { item.run({} as any); onClose(); }
              if (e.key === 'Escape') onClose();
            }}
            placeholder="Search commands, tools, insert…"
            className="flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none"
          />
          <span className="text-[9px] text-slate-500 font-mono border border-slate-200 rounded px-1.5 py-0.5">ESC</span>
        </div>
        <div className="max-h-80 overflow-auto py-1">
          {flat.length === 0 ? (
            <div className="text-center text-[11px] text-slate-500 py-12">No commands match.</div>
          ) : (
            Object.entries(groups).map(([groupName, cmds]) => (
              <div key={groupName} className="mb-1">
                <div className="px-3 py-1 text-[9px] font-semibold text-slate-500 uppercase tracking-wider">{groupName}</div>
                {cmds.map((c) => {
                  const i = flat.indexOf(c);
                  return (
                    <button
                      key={c.id}
                      onMouseEnter={() => setIdx(i)}
                      onClick={() => { c.run({} as any); onClose(); }}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-left',
                        i === idx ? 'bg-blue-600/15 text-slate-900' : 'text-slate-700 hover:bg-slate-50',
                      )}
                    >
                      <Icon name={c.icon || ICON.shapes} className={cn('h-3.5 w-3.5', i === idx ? 'text-blue-600' : 'text-slate-500')} />
                      <span className="flex-1 truncate">{c.label}</span>
                      {c.shortcut && <span className="text-[9px] font-mono text-slate-500 border border-slate-200 rounded px-1.5 py-0.5">{c.shortcut}</span>}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function groupBy<T extends { group: string }>(arr: T[], key: 'group'): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  arr.forEach((a) => {
    const k = (a as any)[key];
    if (!out[k]) out[k] = [];
    out[k].push(a);
  });
  return out;
}
