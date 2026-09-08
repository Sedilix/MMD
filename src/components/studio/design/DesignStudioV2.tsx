/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Design Canvas — Studio Shell (v2)
 *
 * Figma-class workspace that combines:
 *   - top toolbar (tool rail, zoom, share, present, export)
 *   - left rail (pages, assets, shapes, text, templates, AI)
 *   - central canvas (rulers, smart guides, multi-select, marquee)
 *   - right rail (layers tree, properties inspector)
 *   - status bar (cursor, selection bbox, snap toggle, zoom)
 *   - command palette (Ctrl+K)
 *   - present mode (full-screen)
 *   - share modal
 *
 * Wires the keyboard layer + export listener + presence cursors.
 */
'use client';

import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { StudioShell } from '../StudioShell';
// Lazy-load every heavy panel so Turbopack only compiles the toolbar
// shell up-front. The renderer alone is ~1350 lines of dense JSX, and
// the left/properties/layers panels each pull in their own icon + state
// surface. Code-splitting them means the design studio mount is light
// enough not to peg the CPU during dev-server compilation.
const DesignToolbarV2 = lazy(() => import('./DesignToolbarV2').then((m) => ({ default: m.DesignToolbarV2 })));
const LeftPanelV2 = lazy(() => import('./LeftPanelV2').then((m) => ({ default: m.LeftPanelV2 })));
const LayersPanelV2 = lazy(() => import('./LayersPanelV2').then((m) => ({ default: m.LayersPanelV2 })));
const PropertiesPanelV2 = lazy(() => import('./PropertiesPanelV2').then((m) => ({ default: m.PropertiesPanelV2 })));
const StatusBar = lazy(() => import('./StatusBar').then((m) => ({ default: m.StatusBar })));
const CommandPalette = lazy(() => import('./CommandPalette').then((m) => ({ default: m.CommandPalette })));
const PresentMode = lazy(() => import('./PresentMode').then((m) => ({ default: m.PresentMode })));
const ShareModal = lazy(() => import('./ShareModal').then((m) => ({ default: m.ShareModal })));
const DesignCanvasView = lazy(() =>
  import('./core/renderer').then((m) => ({ default: m.DesignCanvasView })),
);
import { useDesignKeyboardShortcuts } from './core/keyboard';
import { getStore } from './core/store';
// Exporters + the action helpers are tiny; keep them eager so the
// toolbar's export menu can fire synchronously without a round-trip.
import { copyToClipboard, download, exportJSON, exportPNG, exportSVG, exportTSX } from './core/exporter';
import { useToast } from '@/hooks/use-toast';
import type { Cursor } from './core/types';

// Lightweight fallback shown while a panel is being code-split. Keeps the
// studio layout from popping in and out.
function PanelFallback({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-slate-200 ${className}`} />;
}

export interface DesignStudioProps { onClose: () => void }

export default function DesignStudioV2({ onClose }: DesignStudioProps) {
  const { toast } = useToast();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [present, setPresent] = useState(false);
  const [share, setShare] = useState(false);

  // Presence cursors are empty until real multiplayer lands. The previous
  // implementation rendered a static fake "Mei Lin" cursor permanently,
  // implying a teammate was present who wasn't. The Cursor type is kept
  // imported so the canvas renderer's `cursors` prop stays typed for the
  // future Yjs awareness feed.
  const presenceCursors = useMemo<Cursor[]>(() => [], []);

  // Mount keyboard layer
  useDesignKeyboardShortcuts({
    onCommandPalette: () => setPaletteOpen(true),
    onPresent: () => setPresent(true),
  });

  // Flush any pending debounced document persist on tab close / hide so the
  // user never loses the most recent edit. The store auto-persists on commit
  // (debounced 500ms); this covers the close-while-debounce-pending window.
  useEffect(() => {
    const flush = () => getStore().flushPersist();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
    return () => window.removeEventListener('pagehide', flush);
  }, []);

  // Listen for top-bar buttons that need a global handler.
  // (Effects never depend on the document/selection — they only wire
  // window listeners — so they don't trigger re-renders.)
  useEffect(() => {
    const onCommand = (e: any) => {
      if (e.detail?.id === 'share') setShare(true);
      if (e.detail?.id === 'present') setPresent(true);
    };
    const onExport = async (e: any) => {
      const format = e.detail as 'png' | 'svg' | 'json' | 'tsx' | 'pdf';
      try {
        const d = getStore().doc;
        if (format === 'png') {
          const blob = await exportPNG(d);
          download(blob, `${d.name}.png`);
        } else if (format === 'svg') {
          const svg = exportSVG(d);
          download(new Blob([svg], { type: 'image/svg+xml' }), `${d.name}.svg`);
        } else if (format === 'json') {
          const json = exportJSON(d);
          download(new Blob([json], { type: 'application/json' }), `${d.name}.json`);
        } else if (format === 'tsx') {
          const tsx = exportTSX(d);
          await copyToClipboard(tsx);
          toast({ title: 'React TSX copied', description: 'Paste the component into any Next.js file.' });
          return;
        } else if (format === 'pdf') {
          window.print();
          return;
        }
        toast({ title: 'Exported', description: `${format.toUpperCase()} download started.` });
      } catch (err: any) {
        toast({ title: 'Export failed', description: err?.message || 'Unknown error', variant: 'destructive' });
      }
    };
    const onZoomFit = () => {
      const surface = document.querySelector('[data-canvas-surface]') as HTMLElement | null;
      if (!surface) return;
      const d = getStore().doc;
      const pad = 80;
      const sw = surface.clientWidth - pad * 2;
      const sh = surface.clientHeight - pad * 2;
      const z = Math.min(sw / d.width, sh / d.height);
      const store = getStore();
      const cx = surface.clientWidth / 2;
      const cy = surface.clientHeight / 2;
      store.setZoom(z, cx - (d.width * z) / 2, cy - (d.height * z) / 2);
    };

    window.addEventListener('design:command', onCommand as any);
    window.addEventListener('design:export', onExport as any);
    window.addEventListener('design:zoom-fit', onZoomFit as any);
    return () => {
      window.removeEventListener('design:command', onCommand as any);
      window.removeEventListener('design:export', onExport as any);
      window.removeEventListener('design:zoom-fit', onZoomFit as any);
    };
  }, [toast]);

  return (
    <StudioShell
      title="Design Canvas"
      description="Figma-class visual workspace with smart guides, presence and AI generation."
      onClose={onClose}
    >
      <div className="flex h-full flex-1 flex-col overflow-hidden bg-white">
        <Suspense fallback={<PanelFallback className="h-12" />}>
          <DesignToolbarV2 />
        </Suspense>
        <div className="flex flex-1 min-h-0">
          <Suspense fallback={<PanelFallback className="w-64" />}>
            <LeftPanelV2 />
          </Suspense>
          <div className="flex-1 min-w-0 relative" data-canvas-surface>
            <Suspense fallback={<PanelFallback className="absolute inset-0" />}>
              <DesignCanvasView cursors={presenceCursors} />
            </Suspense>
          </div>
          <div className="w-72 shrink-0 border-l border-slate-200 bg-slate-100 flex flex-col">
            <div className="flex-1 min-h-0 overflow-auto">
              <Suspense fallback={<PanelFallback className="h-full" />}>
                <PropertiesPanelV2 />
              </Suspense>
            </div>
            <div className="h-1/2 min-h-[180px] border-t border-slate-200 overflow-auto">
              <Suspense fallback={<PanelFallback className="h-full" />}>
                <LayersPanelV2 />
              </Suspense>
            </div>
          </div>
        </div>
        <Suspense fallback={<PanelFallback className="h-7" />}>
          <StatusBar />
        </Suspense>
      </div>

      <Suspense fallback={null}>
        {paletteOpen && <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />}
      </Suspense>
      <Suspense fallback={null}>
        {present && <PresentMode onClose={() => setPresent(false)} />}
      </Suspense>
      <Suspense fallback={null}>
        {share && <ShareModal open={share} onClose={() => setShare(false)} />}
      </Suspense>
    </StudioShell>
  );
}
