/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Design Canvas — Present Mode
 *
 * Full-screen "Figma-style" presentation overlay that renders the document
 * scaled to fit the viewport. Press ESC or click the close button to exit.
 */
'use client';

import React, { useEffect, useRef } from 'react';
import { Icon } from '@/components/ui/icon';
import { getStore, useDocument, useStoreTick } from './core/store';
import { ICON } from './core/icons';

export function PresentMode({ onClose }: { onClose: () => void }) {
  const doc = useDocument();
  useStoreTick();
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const renderNode = (id: string): React.ReactNode => {
    const n = doc.nodes[id];
    if (!n || !n.visible) return null;
    if (n.kind === 'group') {
      // Mirrors the editor canvas's group wrapper (core/renderer.tsx) so a
      // group's opacity/blend mode look the same in Present Mode as in the
      // editor, instead of being silently dropped. Children carry absolute
      // canvas-space coordinates, so the wrapper stays at `inset: 0`.
      const hasBlend = n.blend !== 'normal';
      return (
        <div
          key={n.id}
          style={{
            position: 'absolute',
            inset: 0,
            opacity: n.opacity,
            mixBlendMode: hasBlend ? (n.blend as any) : undefined,
            isolation: hasBlend ? 'isolate' : undefined,
            pointerEvents: 'none',
          }}
        >
          {(n.children ?? []).slice().sort((a, b) => doc.nodes[a].z - doc.nodes[b].z).map((c) => renderNode(c))}
        </div>
      );
    }
    const g = n.geometry;
    const style: React.CSSProperties = {
      position: 'absolute',
      left: g.x,
      top: g.y,
      width: g.w,
      height: g.h,
      transform: `rotate(${g.rotation}deg) scale(${n.geometry.flip === 'x' ? -1 : 1}, ${n.geometry.flip === 'y' ? -1 : 1})`,
      opacity: n.opacity,
      mixBlendMode: (n.blend === 'normal' ? undefined : (n.blend as any)),
      borderRadius: n.geometry.radius.map((r) => `${r}px`).join(' '),
      pointerEvents: 'none',
    };
    if (n.kind === 'text' && n.text) {
      const t = n.text;
      return (
        <div
          key={n.id}
          style={{
            ...style,
            color: t.color,
            fontFamily: t.fontFamily,
            fontSize: t.fontSize,
            fontWeight: t.fontWeight,
            fontStyle: t.italic ? 'italic' : 'normal',
            textAlign: t.align,
            lineHeight: t.lineHeight,
            letterSpacing: `${t.letterSpacing}px`,
            textTransform: t.textTransform,
            // Apply underline / strikethrough so the present view matches the
            // editor (was: these Typography fields were silently dropped).
            textDecoration: [t.underline ? 'underline' : '', t.strikethrough ? 'line-through' : ''].filter(Boolean).join(' ') || 'none',
            background: 'transparent',
            display: 'flex',
            alignItems: 'flex-start',
            padding: '2px 4px',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            overflow: 'hidden',
          }}
        >
          {t.content}
        </div>
      );
    }
    if (n.kind === 'image' && n.image) {
      return (
        <div key={n.id} style={{ ...style, overflow: 'hidden' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={n.image.url} alt={n.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      );
    }
    if (n.kind === 'line') {
      return (
        <div key={n.id} style={{ ...style, background: 'transparent' }}>
          <svg width="100%" height="100%" viewBox={`0 0 ${g.w} ${Math.max(1, Math.abs(g.h) || 2)}`} preserveAspectRatio="none">
            <line x1={0} y1={g.h < 0 ? Math.abs(g.h) : 0} x2={g.w} y2={g.h < 0 ? 0 : g.h || 0} stroke={n.stroke.enabled ? n.stroke.color : n.fill.value || '#0f172a'} strokeWidth={n.stroke.enabled ? n.stroke.width : 2} />
          </svg>
        </div>
      );
    }
    // rect / ellipse / frame / etc
    const fill = n.fill.type === 'solid' ? n.fill.value : 'transparent';
    return <div key={n.id} style={{ ...style, background: fill, borderRadius: n.kind === 'ellipse' ? '50%' : n.geometry.radius[0] }} />;
  };

  // Scale to fit
  let scale = 1;
  if (wrapRef.current) {
    const pad = 80;
    const rect = wrapRef.current.getBoundingClientRect();
    scale = Math.min((rect.width - pad) / doc.width, (rect.height - pad) / doc.height);
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-sm flex flex-col">
      <div className="flex h-12 items-center justify-between border-b border-slate-800 bg-slate-950/80 px-4">
        <div className="flex items-center gap-2 text-slate-200 text-sm">
          <Icon name={ICON.play} className="h-4 w-4 text-brand-300" />
          <span>Presenting</span>
          <span className="text-slate-500">·</span>
          <span className="text-slate-400">{doc.name}</span>
        </div>
        <button
          onClick={onClose}
          className="h-8 px-2.5 rounded-md text-[10px] font-semibold uppercase tracking-wider text-slate-300 hover:text-foreground border border-slate-800 hover:border-slate-700"
        >
          <Icon name={ICON.close} className="h-3.5 w-3.5 inline mr-1" /> Exit
        </button>
      </div>
      <div ref={wrapRef} className="flex-1 grid place-items-center overflow-hidden">
        <div
          style={{
            width: doc.width,
            height: doc.height,
            background: doc.background,
            transform: `scale(${scale})`,
            transformOrigin: 'center center',
            position: 'relative',
            boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
            borderRadius: 4,
          }}
        >
          {doc.rootIds.slice().sort((a, b) => doc.nodes[a].z - doc.nodes[b].z).map((id) => renderNode(id))}
        </div>
      </div>
      <div className="h-8 flex items-center justify-center text-[10px] text-slate-500 border-t border-slate-800 bg-slate-950/80">
        Press <kbd className="mx-1 border border-slate-700 rounded px-1">ESC</kbd> to exit
      </div>
    </div>
  );
}
