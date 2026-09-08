/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Design Canvas — Keyboard Shortcuts
 *
 * Figma-class keyboard handling. Mounts a single `keydown`/`keyup` listener
 * on `window` and dispatches to actions based on the focused element.
 *
 * Implemented bindings (subset of the Figma defaults; we add the ones that
 * matter for a web-based design canvas):
 *
 *   V             — Select tool
 *   H             — Hand tool
 *   F             — Frame tool
 *   R / O         — Rectangle / Ellipse
 *   L             — Line
 *   T             — Text
 *   P             — Pen
 *   C             — Comment
 *   Ctrl/Cmd+Z    — Undo
 *   Ctrl/Cmd+Shift+Z — Redo
 *   Ctrl/Cmd+D    — Duplicate
 *   Ctrl/Cmd+G    — Group
 *   Ctrl/Cmd+Shift+G — Ungroup
 *   Ctrl/Cmd+]    — Bring forward
 *   Ctrl/Cmd+[    — Send backward
 *   Ctrl/Cmd+K    — Command palette
 *   Ctrl/Cmd+/    — Toggle snap
 *   Delete        — Delete selection
 *   Backspace     — Delete selection
 *   Esc           — Cancel / deselect / current tool → select
 *   Arrow keys    — Nudge 1px (Shift = 10px, Alt = 0.1px)
 *   Shift+Arrow   — Resize 10px
 *   Enter         — Edit text
 *   0             — Zoom to fit
 *   1             — Zoom to 100%
 *   2             — Zoom to 200%
 *   Space (hold)  — Hand tool temporary
 */
'use client';

import { useEffect } from 'react';
import { getStore } from './store';
import {
  addShape,
  addTextPreset,
  alignSelection,
  deleteSelection,
  distributeSelection,
  duplicateSelection,
  groupSelection,
  reorder,
  ungroupSelection,
} from './actions';

/**
 * Zoom to an absolute level while keeping the surface's current center
 * point fixed. `store.setZoom(z)` alone (the previous behavior of the 1/2/3
 * shortcuts) resets pan to whatever it already was, so the view jumps to a
 * new, unrelated point instead of zooming in/out around where the user was
 * looking — inconsistent with every other zoom control (scroll-zoom, the
 * toolbar +/- buttons, and the zoom menu presets all recenter like this).
 */
function zoomToLevelCentered(store: ReturnType<typeof getStore>, z: number): void {
  const surface = document.querySelector('[data-canvas-surface]') as HTMLElement | null;
  const cx = surface ? surface.clientWidth / 2 : window.innerWidth / 2;
  const cy = surface ? surface.clientHeight / 2 : window.innerHeight / 2;
  const px = (cx - store.panX) / store.zoom;
  const py = (cy - store.panY) / store.zoom;
  store.setZoom(z, cx - px * z, cy - py * z);
}

export function useDesignKeyboardShortcuts(opts: { onCommandPalette?: () => void; onPresent?: () => void } = {}) {
  useEffect(() => {
    const isTextInput = (el: EventTarget | null) => {
      const node = el as HTMLElement | null;
      if (!node) return false;
      const tag = node.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
      if ((node as any).isContentEditable) return true;
      return false;
    };

    const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);
    const mod = (e: KeyboardEvent) => (isMac ? e.metaKey : e.ctrlKey);

    // Snapshot of the active tool before the user holds Space, so releasing
    // Space restores the tool they were actually using instead of always
    // forcing 'select'. The previous keyup handler blindly set 'select',
    // destroying an in-progress rect/pen/text tool.
    let toolBeforeSpace: string | null = null;

    const down = (e: KeyboardEvent) => {
      const store = getStore();

      // Always allow undo/redo/duplicate/group even in inputs
      if (mod(e) && (e.key === 'z' || e.key === 'Z')) {
        if (e.shiftKey) store.redo();
        else store.undo();
        e.preventDefault();
        return;
      }
      if (mod(e) && (e.key === 'd' || e.key === 'D')) {
        duplicateSelection();
        e.preventDefault();
        return;
      }
      if (mod(e) && (e.key === 'g' || e.key === 'G') && !e.shiftKey) {
        groupSelection();
        e.preventDefault();
        return;
      }
      if (mod(e) && (e.key === 'g' || e.key === 'G') && e.shiftKey) {
        ungroupSelection();
        e.preventDefault();
        return;
      }
      if (mod(e) && e.key === ']') {
        const sel = store.selection;
        if (sel.primary) reorder(sel.primary, 'forward');
        e.preventDefault();
        return;
      }
      if (mod(e) && e.key === '[') {
        const sel = store.selection;
        if (sel.primary) reorder(sel.primary, 'backward');
        e.preventDefault();
        return;
      }
      if (mod(e) && e.shiftKey && (e.key === ']' || e.key === '}')) {
        const sel = store.selection;
        if (sel.primary) reorder(sel.primary, 'front');
        e.preventDefault();
        return;
      }
      if (mod(e) && e.shiftKey && (e.key === '[' || e.key === '{')) {
        const sel = store.selection;
        if (sel.primary) reorder(sel.primary, 'back');
        e.preventDefault();
        return;
      }
      if (mod(e) && (e.key === 'k' || e.key === 'K')) {
        opts.onCommandPalette?.();
        e.preventDefault();
        return;
      }

      if (isTextInput(e.target)) return;

      // Tool shortcuts
      if (e.key === 'v' || e.key === 'V') { store.setTool('select'); e.preventDefault(); return; }
      if (e.key === 'h' || e.key === 'H') { store.setTool('hand'); e.preventDefault(); return; }
      if (e.key === 'f' || e.key === 'F') { store.setTool('frame'); e.preventDefault(); return; }
      if (e.key === 'r' || e.key === 'R') { store.setTool('rect'); e.preventDefault(); return; }
      if (e.key === 'o' || e.key === 'O') { store.setTool('ellipse'); e.preventDefault(); return; }
      if (e.key === 'l' || e.key === 'L') { store.setTool('line'); e.preventDefault(); return; }
      if (e.key === 't' || e.key === 'T') { store.setTool('text'); e.preventDefault(); return; }
      if (e.key === 'p' || e.key === 'P') { store.setTool('pen'); e.preventDefault(); return; }
      if (e.key === 'c' || e.key === 'C') { store.setTool('comment'); e.preventDefault(); return; }

      // Delete
      if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelection();
        e.preventDefault();
        return;
      }

      // Escape — deselect or revert tool
      if (e.key === 'Escape') {
        if (store.selection.ids.length > 0) store.setSelection([]);
        else if (store.tool !== 'select') store.setTool('select');
        return;
      }

      // Space — hand (hold). Snapshot the current tool first so releasing
      // Space restores it (was: always restored to 'select').
      if (e.code === 'Space') {
        if (toolBeforeSpace === null) toolBeforeSpace = store.tool;
        store.setTool('hand');
        e.preventDefault();
        return;
      }

      // Zoom
      if (e.key === '0') {
        window.dispatchEvent(new CustomEvent('design:zoom-fit'));
        return;
      }
      if (e.key === '1') { zoomToLevelCentered(store, 1); return; }
      if (e.key === '2') { zoomToLevelCentered(store, 2); return; }
      if (e.key === '3') { zoomToLevelCentered(store, 3); return; }

      // Align shortcuts
      if (mod(e) && e.shiftKey && (e.key === 'a' || e.key === 'A')) {
        alignSelection('left');
        e.preventDefault();
        return;
      }

      // Nudge
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        const step = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        const ids = store.selection.ids;
        if (ids.length === 0) {
          // Pan
          store.setPan(store.panX + dx * 10, store.panY + dy * 10);
        } else {
          store.commit((doc) => {
            ids.forEach((id) => {
              const n = doc.nodes[id];
              if (!n) return;
              n.geometry = { ...n.geometry, x: n.geometry.x + dx, y: n.geometry.y + dy };
            });
          });
        }
        e.preventDefault();
        return;
      }

      // Quick presets — drop a shape/text and return to the select tool so
      // the toolbar highlight matches the now-active tool (was: left the
      // previously-active tool highlighted, which misled users).
      if (e.key === 'q' || e.key === 'Q') {
        addShape('rect');
        store.setTool('select');
        return;
      }
      if (e.key === 'w' || e.key === 'W') {
        addTextPreset('header');
        store.setTool('select');
        return;
      }
    };

    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        // Restore the tool the user was using before they held Space, rather
        // than always forcing 'select'. Falls back to 'select' if we somehow
        // never captured a previous tool.
        const prev = toolBeforeSpace ?? 'select';
        toolBeforeSpace = null;
        getStore().setTool(prev as any);
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [opts]);
}
