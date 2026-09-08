/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Design Canvas — Renderer
 *
 * Pure HTML/CSS-renderer for the design document. We render every node as a
 * transformed `<div>` (with `<canvas>` / `<svg>` for image raster + pen
 * paths) instead of going through Fabric.js, because:
 *
 *   - text is selectable / editable using the native DOM
 *   - transforms, blend modes and CSS filters are essentially free
 *   - layout debug is trivial (inspect element)
 *   - the state we render is the same JSON we persist / sync
 *
 * The renderer is a single subscription-driven component tree, with two
 * layers:
 *   1. `<NodeRenderer>` — per-node div
 *   2. `<Overlay>` — selection chrome (handles, marquee, smart guides,
 *      comment pins, presence cursors)
 *
 * Pan / zoom is implemented with a CSS `transform: matrix()` on a single
 * root container — letting us hit 60 fps while dragging a thousand nodes.
 */
'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';
import { getStore, makeNode, subscribe, uid, useDocument, useSelection, useTool, useZoom } from './store';
import { snapMove } from './snap';
import { addShape, addTextPreset, alignSelection, deleteSelection, duplicateSelection, groupSelection, updateNode } from './actions';
import { ICON } from './icons';
import type { CanvasNode, CommentPin, Cursor, NodeKind, Tool } from './types';

/* ===================================================================
 * Helpers
 * =================================================================== */

function hexWithAlpha(hex: string, a: number): string {
  if (!hex) return `rgba(0,0,0,${a})`;
  if (hex.startsWith('rgba') || hex.startsWith('rgb')) return hex;
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/**
 * Axis-aligned bounding box of a rotated rectangle. Rotates the four corners
 * around the rectangle's center by `rotationDeg` (matching the CSS
 * `transform: rotate()` which rotates around center) and returns the min/max
 * extents. Used by the marquee hit-test so a rotated node is selectable over
 * its visible footprint, not its un-rotated AABB.
 */
function rotatedAABB(x: number, y: number, w: number, h: number, rotationDeg: number): {
  minX: number; minY: number; maxX: number; maxY: number;
} {
  if (!rotationDeg) return { minX: x, minY: y, maxX: x + w, maxY: y + h };
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const corners = [
    [x, y], [x + w, y], [x + w, y + h], [x, y + h],
  ].map(([px, py]) => {
    const dx = px - cx;
    const dy = py - cy;
    return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
  });
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

function effectsToCSS(effects: CanvasNode['effects']): React.CSSProperties {
  const props: React.CSSProperties = {};
  const boxShadows: string[] = [];
  const filters: string[] = [];
  effects?.forEach((eff) => {
    if (!eff.enabled) return;
    if (eff.type === 'shadow' && eff.shadow) {
      const sh = eff.shadow;
      const css = `${sh.x}px ${sh.y}px ${sh.blur}px ${sh.spread ?? 0}px ${hexWithAlpha(sh.color, sh.opacity)}`;
      boxShadows.push(sh.type === 'inner' ? `inset ${css}` : css);
    } else if (eff.type === 'blur' && eff.blur) {
      filters.push(`blur(${eff.blur}px)`);
    } else if (eff.type === 'glow' && eff.shadow) {
      const sh = eff.shadow;
      boxShadows.push(`0 0 ${sh.blur}px ${sh.spread}px ${hexWithAlpha(sh.color, sh.opacity)}`);
    }
  });
  if (boxShadows.length) (props as any).boxShadow = boxShadows.join(', ');
  if (filters.length) (props as any).filter = filters.join(' ');
  return props;
}

function fillToBackground(fill: CanvasNode['fill']): React.CSSProperties {
  if (!fill || fill.type === 'none') return { background: 'transparent' };
  if (fill.type === 'solid') return { background: hexWithAlpha(fill.value, fill.opacity) };
  if (fill.type === 'linear-gradient' || fill.type === 'radial-gradient') return { backgroundImage: fill.value };
  return {};
}

/* ===================================================================
 * Node Renderer
 * =================================================================== */

function NodeView({ node }: { node: CanvasNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const sel = useSelection();
  const isSelected = sel.ids.includes(node.id);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(node.text?.content ?? '');

  const sx = node.geometry.flip === 'x' ? -1 : 1;
  const sy = node.geometry.flip === 'y' ? -1 : 1;
  const transform = `translate(${node.geometry.x}px, ${node.geometry.y}px) rotate(${node.geometry.rotation}deg) scale(${sx}, ${sy})`;
  const radiusCss = node.geometry.radius.map((r) => `${r}px`).join(' ');

  const baseStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: node.geometry.w,
    height: node.geometry.h,
    transform,
    opacity: node.opacity,
    mixBlendMode: (node.blend === 'normal' ? undefined : (node.blend as any)),
    borderRadius: radiusCss,
    pointerEvents: node.locked ? 'none' : 'auto',
    ...fillToBackground(node.fill),
    ...(node.stroke.enabled
      ? {
          boxShadow: `0 0 0 ${node.stroke.width}px ${hexWithAlpha(node.stroke.color, 1)}`,
        }
      : {}),
    ...effectsToCSS(node.effects),
  };

  if (node.kind === 'text' && node.text) {
    const t = node.text;
    return (
      <div
        ref={ref}
        data-node-id={node.id}
        style={{
          ...baseStyle,
          background: 'transparent',
          boxShadow: 'none',
          color: hexWithAlpha(t.color, t.opacity),
          fontFamily: t.fontFamily,
          fontSize: t.fontSize,
          fontWeight: t.fontWeight,
          fontStyle: t.italic ? 'italic' : 'normal',
          textDecoration: `${t.underline ? 'underline ' : ''}${t.strikethrough ? 'line-through' : ''}`.trim() || 'none',
          textAlign: t.align,
          lineHeight: t.lineHeight,
          letterSpacing: `${t.letterSpacing}px`,
          textTransform: t.textTransform,
          display: 'flex',
          alignItems: 'flex-start',
          padding: '2px 4px',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          overflow: 'hidden',
          cursor: isSelected && editing ? 'text' : 'move',
        } as any}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (node.locked) return;
          setDraft(t.content);
          setEditing(true);
          setTimeout(() => {
            const el = ref.current?.querySelector('[data-textarea]') as HTMLTextAreaElement | null;
            el?.focus();
            el?.setSelectionRange(el.value.length, el.value.length);
          }, 0);
        }}
        onMouseDown={(e) => {
          if (editing) return;
          e.stopPropagation();
          onNodeMouseDown(node.id, e);
        }}
      >
        {editing ? (
          <textarea
            data-textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              setEditing(false);
              updateNode(node.id, { text: { ...(node.text as any), content: draft } } as any);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setEditing(false);
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                setEditing(false);
                updateNode(node.id, { text: { ...(node.text as any), content: draft } } as any);
              }
              e.stopPropagation();
            }}
            style={{
              width: '100%',
              height: '100%',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'inherit',
              font: 'inherit',
              resize: 'none',
              padding: 0,
            }}
          />
        ) : (
          <span style={{ width: '100%' }}>{t.content}</span>
        )}
      </div>
    );
  }

  if (node.kind === 'image' && node.image) {
    return (
      <div
        ref={ref}
        data-node-id={node.id}
        style={{ ...baseStyle, overflow: 'hidden' }}
        onMouseDown={(e) => onNodeMouseDown(node.id, e)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={node.image.url}
          alt={node.name}
          draggable={false}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            userSelect: 'none',
            pointerEvents: 'none',
          }}
        />
      </div>
    );
  }

  if (node.kind === 'star') {
    const points = 5;
    const outer = 50;
    const inner = 22;
    let path = '';
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = (Math.PI / points) * i - Math.PI / 2;
      const x = 50 + Math.cos(a) * r;
      const y = 50 + Math.sin(a) * r;
      path += (i === 0 ? 'M' : 'L') + x + ' ' + y + ' ';
    }
    path += 'Z';
    return (
      <div
        ref={ref}
        data-node-id={node.id}
        style={{ ...baseStyle, background: 'transparent', boxShadow: node.stroke.enabled ? baseStyle.boxShadow : 'none' }}
        onMouseDown={(e) => onNodeMouseDown(node.id, e)}
      >
        <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ overflow: 'visible' }}>
          <path d={path} fill={node.fill.value} fillOpacity={node.fill.opacity} stroke={node.stroke.enabled ? node.stroke.color : 'none'} strokeWidth={node.stroke.enabled ? node.stroke.width : 0} />
        </svg>
      </div>
    );
  }

  if (node.kind === 'polygon') {
    const sides = 6;
    let path = '';
    for (let i = 0; i < sides; i++) {
      const a = (Math.PI * 2 / sides) * i - Math.PI / 2;
      const x = 50 + Math.cos(a) * 50;
      const y = 50 + Math.sin(a) * 50;
      path += (i === 0 ? 'M' : 'L') + x + ' ' + y + ' ';
    }
    path += 'Z';
    return (
      <div
        ref={ref}
        data-node-id={node.id}
        style={{ ...baseStyle, background: 'transparent', boxShadow: node.stroke.enabled ? baseStyle.boxShadow : 'none' }}
        onMouseDown={(e) => onNodeMouseDown(node.id, e)}
      >
        <svg viewBox="0 0 100 100" width="100%" height="100%">
          <path d={path} fill={node.fill.value} fillOpacity={node.fill.opacity} stroke={node.stroke.enabled ? node.stroke.color : 'none'} strokeWidth={node.stroke.enabled ? node.stroke.width : 0} />
        </svg>
      </div>
    );
  }

  if (node.kind === 'triangle') {
    return (
      <div
        ref={ref}
        data-node-id={node.id}
        style={{ ...baseStyle, background: 'transparent', boxShadow: node.stroke.enabled ? baseStyle.boxShadow : 'none' }}
        onMouseDown={(e) => onNodeMouseDown(node.id, e)}
      >
        <svg viewBox="0 0 100 100" width="100%" height="100%">
          <polygon points="50,4 96,90 4,90" fill={node.fill.value} fillOpacity={node.fill.opacity} stroke={node.stroke.enabled ? node.stroke.color : 'none'} strokeWidth={node.stroke.enabled ? node.stroke.width : 0} />
        </svg>
      </div>
    );
  }

  if (node.kind === 'line') {
    // A line's geometry can carry a *signed* height to indicate direction
    // (negative = drawn upward). The container always uses |h| for its
    // CSS height (a negative CSS height would collapse to 0), and the SVG
    // swaps its endpoints so the visible stroke runs in the right direction.
    const absH = Math.max(1, Math.abs(node.geometry.h) || 2);
    const goingUp = node.geometry.h < 0;
    return (
      <div
        ref={ref}
        data-node-id={node.id}
        style={{ ...baseStyle, height: absH, background: 'transparent', boxShadow: 'none' }}
        onMouseDown={(e) => onNodeMouseDown(node.id, e)}
      >
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${Math.max(1, node.geometry.w)} ${absH}`}
          preserveAspectRatio="none"
        >
          <line
            x1={0}
            y1={goingUp ? absH : 0}
            x2={node.geometry.w}
            y2={goingUp ? 0 : absH}
            stroke={node.stroke.enabled ? node.stroke.color : node.fill.value || '#0f172a'}
            strokeWidth={node.stroke.enabled ? node.stroke.width : 2}
            strokeLinecap={node.stroke.cap}
            strokeDasharray={node.stroke.dashArray.length ? node.stroke.dashArray.join(' ') : undefined}
          />
        </svg>
      </div>
    );
  }

  if (node.kind === 'group') {
    return (
      <div
        ref={ref}
        data-node-id={node.id}
        style={{
          position: 'absolute',
          top: node.geometry.y,
          left: node.geometry.x,
          width: node.geometry.w,
          height: node.geometry.h,
          transform: `rotate(${node.geometry.rotation}deg)`,
          opacity: node.opacity,
          outline: isSelected ? '1px dashed #2563eb' : 'none',
          outlineOffset: 1,
          pointerEvents: 'none',
        }}
      />
    );
  }

  if (node.kind === 'ellipse') {
    return (
      <div
        ref={ref}
        data-node-id={node.id}
        style={{ ...baseStyle, borderRadius: '50%' }}
        onMouseDown={(e) => onNodeMouseDown(node.id, e)}
      />
    );
  }

  // default: rect/frame
  return (
    <div
      ref={ref}
      data-node-id={node.id}
      style={baseStyle}
      onMouseDown={(e) => onNodeMouseDown(node.id, e)}
    />
  );
}

/* ===================================================================
 * Node interaction
 * =================================================================== */

function onNodeMouseDown(id: string, e: React.MouseEvent) {
  const store = getStore();
  const sel = store.selection;
  if (e.shiftKey) {
    const set = new Set(sel.ids);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    store.setSelection(Array.from(set));
  } else if (!sel.ids.includes(id)) {
    store.setSelection([id]);
  }

  const node = store.doc.nodes[id];
  if (!node || node.locked) return;
  if (store.tool !== 'select') return;

  e.preventDefault();
  const startX = e.clientX;
  const startY = e.clientY;
  const startGeoms = new Map<string, { x: number; y: number }>();
  store.selection.ids.forEach((sid) => {
    const n = store.doc.nodes[sid];
    if (n) startGeoms.set(sid, { x: n.geometry.x, y: n.geometry.y });
  });

  const onMove = (ev: MouseEvent) => {
    const dx = (ev.clientX - startX) / store.zoom;
    const dy = (ev.clientY - startY) / store.zoom;
    let allGuides: { axis: 'x' | 'y'; value: number }[] = [];
    startGeoms.forEach((g, sid) => {
      const n = store.doc.nodes[sid];
      if (!n) return;
      // Pass the live zoom so the snap threshold is screen-px consistent.
      // Use the store's live snap options (driven by the StatusBar toggle)
      // instead of a static defaultSnap.
      const result = snapMove(store.doc, n, g.x + dx, g.y + dy, { ...store.snap }, store.zoom);
      // Transient: no undo entry per pixel. A single history entry is
      // pushed on mouseup (see onUp). This prevents the doc-clone and
      // history stack from blowing up during a long drag.
      updateNode(
        sid,
        { geometry: { ...n.geometry, x: result.x, y: result.y } } as any,
        { transient: true },
      );
      allGuides = allGuides.concat(result.guides);
    });
    window.dispatchEvent(new CustomEvent('design:guides', { detail: allGuides }));
  };

  const onUp = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    window.dispatchEvent(new CustomEvent('design:guides', { detail: [] }));
    // One history entry per drag. Re-commit the first node's current
    // geometry non-transiently so the final state lands on the undo
    // stack as a single entry (Figma's "one undo per drag").
    const ids = Array.from(startGeoms.keys());
    if (ids.length > 0) {
      const sid = ids[0];
      const n = getStore().doc.nodes[sid];
      if (n) updateNode(sid, { geometry: n.geometry });
    }
  };

  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

/* ===================================================================
 * Selection chrome
 * =================================================================== */

/**
 * Selection chrome — the blue outline + 8 resize handles + rotation handle.
 *
 * IMPORTANT coordinate contract:
 *   `SelectionChrome` is mounted in **surface space** (screen pixels
 *   relative to the canvas surface), NOT inside a `scale(zoom)` container.
 *   So every position/size is `panX + artboardX * zoom` and handles are a
 *   fixed 9px screen size regardless of zoom level. This keeps the outline
 *   glued to the node and the handles always grabbable — Figma behaviour.
 */
function SelectionChrome() {
  const doc = useDocument();
  const sel = useSelection();
  const zoom = useZoom();

  if (sel.ids.length === 0) return null;

  return (
    <>
      {sel.ids.map((id) => {
        const node = doc.nodes[id];
        if (!node) return null;
        const isGroup = node.kind === 'group';
        // Surface-space box: panX + x*zoom. The outline rotates around the
        // node centre so it tracks `node.geometry.rotation` exactly.
        const left = zoom.panX + node.geometry.x * zoom.zoom;
        const top = zoom.panY + node.geometry.y * zoom.zoom;
        const w = node.geometry.w * zoom.zoom;
        const h = node.geometry.h * zoom.zoom;
        return (
          <div
            key={id}
            className="absolute"
            style={{
              left,
              top,
              width: w,
              height: h,
              transform: `rotate(${node.geometry.rotation}deg)`,
              transformOrigin: 'center center',
              outline: isGroup ? '1.5px dashed #2563eb' : '1.5px solid #2563eb',
              outlineOffset: 0,
              pointerEvents: 'none',
              zIndex: 50,
            }}
          >
            {!isGroup && (
              <>
                {(['tl', 't', 'tr', 'r', 'br', 'b', 'bl', 'l'] as const).map((h) => (
                  <Handle key={h} which={h} nodeId={id} />
                ))}
                <RotationHandle nodeId={id} />
              </>
            )}
          </div>
        );
      })}
    </>
  );
}

function Handle({
  which,
  nodeId,
}: {
  which: 'tl' | 't' | 'tr' | 'r' | 'br' | 'b' | 'bl' | 'l';
  nodeId: string;
}) {
  const zoom = useZoom();
  const baseStyle: React.CSSProperties = {
    position: 'absolute',
    width: 9,
    height: 9,
    background: '#FFFFFF',
    border: '1.5px solid #2563eb',
    borderRadius: 2,
    pointerEvents: 'auto',
    cursor: cursorFor(which),
  };
  const pos: Record<typeof which, React.CSSProperties> = {
    tl: { left: -5, top: -5 },
    t: { left: '50%', top: -5, transform: 'translateX(-50%)' },
    tr: { right: -5, top: -5 },
    r: { right: -5, top: '50%', transform: 'translateY(-50%)' },
    br: { right: -5, bottom: -5 },
    b: { left: '50%', bottom: -5, transform: 'translateX(-50%)' },
    bl: { left: -5, bottom: -5 },
    l: { left: -5, top: '50%', transform: 'translateY(-50%)' },
  };

  return (
    <div
      style={{ ...baseStyle, ...pos[which] }}
      onMouseDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
        const store = getStore();
        const node = store.doc.nodes[nodeId];
        if (!node) return;
        const startX = e.clientX;
        const startY = e.clientY;
        const startGeom = { ...node.geometry };
        const aspect = startGeom.w / startGeom.h || 1;

        const onMove = (ev: MouseEvent) => {
          // Convert screen delta → artboard delta so the resize tracks the
          // cursor 1:1 at any zoom level.
          const dx = (ev.clientX - startX) / zoom.zoom;
          const dy = (ev.clientY - startY) / zoom.zoom;
          const next = { ...startGeom };
          // Shift is checked per-move (not snapshotted at mousedown) so the
          // user can engage/disengage aspect-lock mid-drag — matches Figma.
          if (which === 'tl' || which === 'tr' || which === 'bl' || which === 'br') {
            if (which.includes('l')) {
              next.w = Math.max(2, startGeom.w - dx);
              next.x = startGeom.x + (startGeom.w - next.w);
            } else if (which.includes('r')) {
              next.w = Math.max(2, startGeom.w + dx);
            }
            if (which.includes('t')) {
              next.h = Math.max(2, startGeom.h - dy);
              next.y = startGeom.y + (startGeom.h - next.h);
            } else if (which.includes('b')) {
              next.h = Math.max(2, startGeom.h + dy);
            }
            // Aspect-lock from the corner being dragged's opposite anchor.
            if (ev.shiftKey) {
              const newH = next.w / aspect;
              // Re-derive x/y so the opposite corner stays anchored.
              if (which.includes('t')) next.y = startGeom.y + (startGeom.h - newH);
              next.h = newH;
            }
          } else {
            if (which === 'l') {
              next.w = Math.max(2, startGeom.w - dx);
              next.x = startGeom.x + (startGeom.w - next.w);
            }
            if (which === 'r') next.w = Math.max(2, startGeom.w + dx);
            if (which === 't') {
              next.h = Math.max(2, startGeom.h - dy);
              next.y = startGeom.y + (startGeom.h - next.h);
            }
            if (which === 'b') next.h = Math.max(2, startGeom.h + dy);
            // Centre-anchored resize on edge handles with Shift (Photoshop).
            if (ev.shiftKey) {
              if (which === 'l' || which === 'r') {
                const delta = next.w - startGeom.w;
                next.x = startGeom.x - delta;
                next.w = startGeom.w + delta * 2;
              } else {
                const delta = next.h - startGeom.h;
                next.y = startGeom.y - delta;
                next.h = startGeom.h + delta * 2;
              }
            }
          }
          // Transient: no undo entry per pixel; onUp pushes one for the
          // whole drag (see below).
          updateNode(nodeId, { geometry: next }, { transient: true });
        };
        const onUp = () => {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
          // One history entry per drag.
          const n = getStore().doc.nodes[nodeId];
          if (n) updateNode(nodeId, { geometry: n.geometry });
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      }}
    />
  );
}

function RotationHandle({ nodeId }: { nodeId: string }) {
  const zoom = useZoom();
  const ref = useRef<HTMLDivElement | null>(null);
  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        left: '50%',
        top: -28,
        transform: 'translateX(-50%)',
        width: 12,
        height: 12,
        background: '#FFFFFF',
        border: '1.5px solid #2563eb',
        borderRadius: '50%',
        pointerEvents: 'auto',
        cursor: 'crosshair',
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
        const store = getStore();
        const node = store.doc.nodes[nodeId];
        if (!node || !ref.current) return;
        // Compute the node centre directly in screen space from the
        // artboard geometry + surface rect. This is robust against the
        // node being rotated — `getBoundingClientRect()` of a rotated
        // element returns its axis-aligned bbox, which would offset the
        // centre and break the rotation pivot.
        const surface = (ref.current.ownerDocument.querySelector('[data-canvas-surface]') as HTMLElement | null)?.getBoundingClientRect();
        if (!surface) return;
        const cx = surface.left + zoom.panX + (node.geometry.x + node.geometry.w / 2) * zoom.zoom;
        const cy = surface.top + zoom.panY + (node.geometry.y + node.geometry.h / 2) * zoom.zoom;
        const startAngle = Math.atan2(e.clientY - cy, e.clientX - cx);
        const startRot = node.geometry.rotation;
        // Snap to 15° increments when Shift is held (Figma/Photoshop behaviour).
        const onMove = (ev: MouseEvent) => {
          const a = Math.atan2(ev.clientY - cy, ev.clientX - cx);
          let deg = ((a - startAngle) * 180) / Math.PI + startRot;
          if (ev.shiftKey) deg = Math.round(deg / 15) * 15;
          // Transient: no undo entry per pixel; onUp pushes one.
          updateNode(nodeId, { geometry: { ...node.geometry, rotation: Math.round(deg) } }, { transient: true });
        };
        const onUp = () => {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
          // One history entry per rotation drag.
          const n = getStore().doc.nodes[nodeId];
          if (n) updateNode(nodeId, { geometry: n.geometry });
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      }}
    />
  );
}

function cursorFor(w: 'tl' | 't' | 'tr' | 'r' | 'br' | 'b' | 'bl' | 'l') {
  const map: Record<string, string> = {
    tl: 'nwse-resize',
    t: 'ns-resize',
    tr: 'nesw-resize',
    r: 'ew-resize',
    br: 'nwse-resize',
    b: 'ns-resize',
    bl: 'nesw-resize',
    l: 'ew-resize',
  };
  return map[w];
}

/* ===================================================================
 * Marquee
 * =================================================================== */

/**
 * Marquee selection rectangle.
 *
 * `start` and `current` are in **artboard space** (the same coordinate
 * system as `node.geometry`). We render the rectangle in **surface space**
 * by converting back through `panX/panY` and `zoom`:
 *
 *   surfaceX = panX + artboardX * zoom
 *
 * Keeping the marquee in artboard space means the hit-test in `startMarquee`
 * compares against `node.geometry` directly — no fudgy `panX/zoom` offset
 * math that drifted away from the cursor when the artboard was panned.
 */
function Marquee({
  start,
  current,
  zoom,
  panX,
  panY,
}: {
  start: { x: number; y: number };
  current: { x: number; y: number };
  zoom: number;
  panX: number;
  panY: number;
}) {
  const ax = Math.min(start.x, current.x);
  const ay = Math.min(start.y, current.y);
  const aw = Math.abs(current.x - start.x);
  const ah = Math.abs(current.y - start.y);
  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: panX + ax * zoom,
        top: panY + ay * zoom,
        width: aw * zoom,
        height: ah * zoom,
        background: 'rgba(37, 99, 235, 0.08)',
        border: '1px solid #2563eb',
        borderRadius: 1,
        zIndex: 9998,
      }}
    />
  );
}

/* ===================================================================
 * Smart guides
 * =================================================================== */

function SmartGuides() {
  const [guides, setGuides] = useState<{ axis: 'x' | 'y'; value: number }[]>([]);
  const zoom = useZoom();
  useEffect(() => {
    const handler = (e: any) => setGuides(e.detail || []);
    window.addEventListener('design:guides', handler as any);
    return () => window.removeEventListener('design:guides', handler as any);
  }, []);
  if (guides.length === 0) return null;
  return (
    <>
      {guides.map((g, i) => (
        <div
          key={i}
          className="absolute pointer-events-none"
          style={{
            ...(g.axis === 'x'
              ? { left: g.value * zoom.zoom + zoom.panX, top: zoom.panY, width: 1, height: '100dvh' }
              : { top: g.value * zoom.zoom + zoom.panY, left: zoom.panX, height: 1, width: '100vw' }),
            background: '#f43f5e',
            zIndex: 9999,
          }}
        />
      ))}
    </>
  );
}

/* ===================================================================
 * Rulers
 * =================================================================== */

function Ruler({
  orientation,
  length,
  zoom,
  offset,
}: {
  orientation: 'h' | 'v';
  length: number;
  zoom: number;
  offset: number;
}) {
  const steps: number[] = [];
  const major = 100;
  const minor = 20;
  for (let i = 0; i <= length; i += minor) steps.push(i);
  return (
    <div
      className="absolute bg-white text-[8px] text-slate-500 font-mono select-none"
      style={{
        ...(orientation === 'h'
          ? { left: offset, top: 0, width: length * zoom, height: 18 }
          : { top: offset, left: 0, width: 18, height: length * zoom }),
        overflow: 'hidden',
        zIndex: 30,
      }}
    >
      {steps.map((s) => {
        const isMajor = s % major === 0;
        const size = isMajor ? 8 : 4;
        return (
          <div
            key={s}
            className="absolute"
            style={{
              ...(orientation === 'h'
                ? {
                    left: s * zoom,
                    top: 18 - size,
                    width: 1,
                    height: size,
                    background: isMajor ? '#94a3b8' : '#e2e8f0',
                  }
                : {
                    top: s * zoom,
                    left: 18 - size,
                    height: 1,
                    width: size,
                    background: isMajor ? '#94a3b8' : '#e2e8f0',
                  }),
            }}
          >
            {isMajor && orientation === 'h' && (
              <span style={{ position: 'absolute', left: 3, top: 1, fontSize: 8 }}>{s}</span>
            )}
            {isMajor && orientation === 'v' && (
              <span style={{ position: 'absolute', top: 3, left: 1, fontSize: 8, writingMode: 'vertical-rl' }}>{s}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ===================================================================
 * Floating multi-select toolbar
 * =================================================================== */

function FloatingToolbar() {
  const sel = useSelection();
  if (sel.ids.length < 2) return null;
  return (
    <div
      className="absolute z-[10000] flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white backdrop-blur-md shadow-2xl shadow-black/20 px-1 py-1 text-slate-700"
      style={{ left: '50%', top: 12, transform: 'translateX(-50%)' }}
    >
      <ToolButton icon={ICON.alignLeft} title="Align Left" onClick={() => alignSelection('left')} />
      <ToolButton icon={ICON.alignCenter} title="Align Center" onClick={() => alignSelection('center')} />
      <ToolButton icon={ICON.alignRight} title="Align Right" onClick={() => alignSelection('right')} />
      <ToolButton icon={ICON.alignTop} title="Align Top" onClick={() => alignSelection('top')} />
      <ToolButton icon={ICON.alignMiddle} title="Align Middle" onClick={() => alignSelection('middle')} />
      <ToolButton icon={ICON.alignBottom} title="Align Bottom" onClick={() => alignSelection('bottom')} />
      <Divider />
      <ToolButton icon={ICON.duplicate} title="Duplicate" onClick={() => duplicateSelection()} />
      <ToolButton icon={ICON.delete} title="Delete" onClick={() => deleteSelection()} />
      <ToolButton icon={ICON.group} title="Group" onClick={() => groupSelection()} />
    </div>
  );
}

function Divider() {
  return <div className="mx-1 h-4 w-px bg-slate-200" />;
}

function ToolButton({ icon, title, onClick, active }: { icon: string; title: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        'h-7 w-7 grid place-items-center rounded-md hover:bg-slate-200 transition',
        active && 'bg-slate-200 text-blue-600',
      )}
    >
      <Icon name={icon} className="h-3.5 w-3.5" />
    </button>
  );
}

/* ===================================================================
 * Comment pin
 * =================================================================== */

function CommentPinView({ comment }: { comment: CommentPin }) {
  const zoom = useZoom();
  return (
    <div
      className="absolute"
      style={{
        left: zoom.panX + comment.x * zoom.zoom - 10,
        top: zoom.panY + comment.y * zoom.zoom - 10,
        zIndex: 100,
      }}
    >
      <div className="h-5 w-5 rounded-full bg-amber-600 text-amber-900 text-[10px] font-bold grid place-items-center shadow-lg ring-2 ring-amber-200/40">
        {comment.author[0]?.toUpperCase() ?? '?'}
      </div>
      <div className="mt-1 max-w-[200px] rounded-lg border border-slate-200 bg-white backdrop-blur-md px-2 py-1 text-[10px] text-slate-700 shadow-lg">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold">{comment.author}</span>
          {comment.resolved && <span className="text-emerald-600">Resolved</span>}
        </div>
        <p className="mt-0.5 text-slate-700 whitespace-pre-wrap">{comment.text}</p>
      </div>
    </div>
  );
}

function PresenceCursor({ cursor }: { cursor: Cursor }) {
  const zoom = useZoom();
  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: zoom.panX + cursor.x * zoom.zoom,
        top: zoom.panY + cursor.y * zoom.zoom,
        zIndex: 200,
      }}
    >
      <svg width="20" height="20" viewBox="0 0 20 20">
        <path d="M2 2 L18 9 L11 11 L9 18 Z" fill={cursor.color} stroke="white" strokeWidth="1.2" />
      </svg>
      <div
        className="ml-3 -mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium text-white shadow-md"
        style={{ background: cursor.color }}
      >
        {cursor.name}
      </div>
    </div>
  );
}

/* ===================================================================
 * Page surface (the artboard viewport)
 * =================================================================== */

interface PageProps {
  comments: CommentPin[];
  cursors: Cursor[];
  onAddComment: (x: number, y: number) => void;
  onMoveCursor: (x: number, y: number) => void;
}

function PageSurface({ comments, cursors, onAddComment, onMoveCursor }: PageProps) {
  const doc = useDocument();
  const zoom = useZoom();
  const sel = useSelection();
  const tool = useTool();
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  // Throttle timestamp for status-bar cursor dispatch so a mousemove storm
  // doesn't fire a CustomEvent on every frame.
  const lastCursorDispatchAt = useRef(0);
  const [ghost, setGhost] = useState<{ kind: Tool; geometry: { x: number; y: number; w: number; h: number } } | null>(null);
  const [marquee, setMarquee] = useState<{
    start: { x: number; y: number };
    current: { x: number; y: number };
    zoom: number;
    panX: number;
    panY: number;
  } | null>(null);

  const renderNode = (id: string): React.ReactNode => {
    const n = doc.nodes[id];
    if (!n || !n.visible) return null;
    if (n.kind === 'group') {
      // A group's own opacity/blend used to be stored on the node but never
      // applied anywhere — the Properties Panel offered working-looking
      // controls for it that silently did nothing. Wrapping the children in
      // a compositing layer makes them real. Children carry *absolute*
      // canvas-space coordinates (see actions.ts's unionBBox comment), so
      // the wrapper must sit at `inset: 0` over the same coordinate space
      // rather than being offset to the group's own bbox, or every child
      // would be shifted by the group's x/y on top of its own.
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
          <NodeView node={n} />
          {(n.children ?? [])
            .slice()
            .sort((a, b) => doc.nodes[a].z - doc.nodes[b].z)
            .map((c) => renderNode(c))}
        </div>
      );
    }
    return <NodeView key={n.id} node={n} />;
  };

  const onMouseDown = (e: React.MouseEvent) => {
    // Click on a node — let the node handler deal with it
    if ((e.target as HTMLElement).closest('[data-node-id]')) return;
    if (e.button === 1 || e.altKey) {
      startPan(e);
      return;
    }
    if (tool === 'hand') {
      startPan(e);
      return;
    }
    if (tool === 'comment') {
      const rect = surfaceRef.current!.getBoundingClientRect();
      const x = (e.clientX - rect.left) / zoom.zoom - zoom.panX / zoom.zoom;
      const y = (e.clientY - rect.top) / zoom.zoom - zoom.panY / zoom.zoom;
      onAddComment(x, y);
      return;
    }
    if (
      tool === 'rect' ||
      tool === 'ellipse' ||
      tool === 'triangle' ||
      tool === 'frame' ||
      tool === 'line' ||
      tool === 'star' ||
      tool === 'polygon' ||
      tool === 'text'
    ) {
      startShapeDraw(e);
      return;
    }
    // marquee select
    startMarquee(e);
  };

  const startPan = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const store = getStore();
    const start = { x: store.panX, y: store.panY };
    const onMove = (ev: MouseEvent) => {
      store.setPan(start.x + (ev.clientX - startX), start.y + (ev.clientY - startY));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const startShapeDraw = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const rect = surfaceRef.current!.getBoundingClientRect();
    const startX = (e.clientX - rect.left - zoom.panX) / zoom.zoom;
    const startY = (e.clientY - rect.top - zoom.panY) / zoom.zoom;
    const isLine = tool === 'line';

    const onMove = (ev: MouseEvent) => {
      const x = (ev.clientX - rect.left - zoom.panX) / zoom.zoom;
      const y = (ev.clientY - rect.top - zoom.panY) / zoom.zoom;
      if (isLine) {
        // Lines preserve direction: the ghost box spans from the start
        // point to the current cursor, with a *signed* delta so the line
        // can point in any of the 4 diagonal directions — Illustrator style.
        const nx = Math.min(startX, x);
        const ny = Math.min(startY, y);
        const w = Math.abs(x - startX);
        // signed height: negative when the cursor is above the start point
        const h = y - startY;
        setGhost({ kind: tool, geometry: { x: nx, y: ny, w, h: Math.abs(h) } });
      } else {
        // Shift locks aspect ratio to a square (Figma/Photoshop behaviour).
        let w = Math.abs(x - startX);
        let h = Math.abs(y - startY);
        if (ev.shiftKey && w > 0 && h > 0) {
          const m = Math.max(w, h);
          w = m;
          h = m;
        }
        const nx = Math.min(startX, x);
        const ny = Math.min(startY, y);
        setGhost({ kind: tool, geometry: { x: nx, y: ny, w, h } });
      }
    };
    const onUp = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const x = (ev.clientX - rect.left - zoom.panX) / zoom.zoom;
      const y = (ev.clientY - rect.top - zoom.panY) / zoom.zoom;
      if (isLine) {
        // Pass the signed delta through a side channel so createFromDrag
        // can build a directional line. We stash it on the window.
        (window as any).__designLineDir = { dy: y - startY };
        const w = Math.abs(x - startX);
        const h = Math.abs(y - startY);
        const nx = Math.min(startX, x);
        const ny = Math.min(startY, y);
        createFromDrag(tool, nx, ny, w, h);
        (window as any).__designLineDir = null;
      } else {
        let w = Math.abs(x - startX);
        let h = Math.abs(y - startY);
        if (ev.shiftKey && w > 0 && h > 0) {
          const m = Math.max(w, h);
          w = m;
          h = m;
        }
        const nx = Math.min(startX, x);
        const ny = Math.min(startY, y);
        createFromDrag(tool, nx, ny, w, h);
      }
      setGhost(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const startMarquee = (e: React.MouseEvent) => {
    const rect = surfaceRef.current!.getBoundingClientRect();
    // Convert screen → artboard space: ax = (clientX - rect.left - panX) / zoom.
    // We snapshot the starting pan/zoom so the marquee stays anchored to the
    // artboard even if the user (somehow) pans mid-drag.
    const panX0 = zoom.panX;
    const panY0 = zoom.panY;
    const zoom0 = zoom.zoom;
    const sx = (e.clientX - rect.left - panX0) / zoom0;
    const sy = (e.clientY - rect.top - panY0) / zoom0;
    setMarquee({ start: { x: sx, y: sy }, current: { x: sx, y: sy }, zoom: zoom0, panX: panX0, panY: panY0 });
    let last = { x: e.clientX, y: e.clientY };
    const onMove = (ev: MouseEvent) => {
      last = { x: ev.clientX, y: ev.clientY };
      const cx = (ev.clientX - rect.left - panX0) / zoom0;
      const cy = (ev.clientY - rect.top - panY0) / zoom0;
      setMarquee((m) => (m ? { ...m, current: { x: cx, y: cy } } : m));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const cx = (last.x - rect.left - panX0) / zoom0;
      const cy = (last.y - rect.top - panY0) / zoom0;
      const minX = Math.min(sx, cx);
      const maxX = Math.max(sx, cx);
      const minY = Math.min(sy, cy);
      const maxY = Math.max(sy, cy);
      const hits: string[] = [];
      // `node.geometry` is in artboard space, so the marquee is too —
      // the hit-test now lines up exactly with the rectangle the user
      // drew on screen, regardless of pan/zoom.
      //
      // We no longer skip parented children or groups: anything visible and
      // unlocked whose axis-aligned bounding box intersects the marquee is
      // selected (was: contained). For rotated nodes we expand the AABB to
      // the rotated corners so a 45° square is selectable over its visible
      // diamond extent. Groups are hit-testable as objects so a whole group
      // can be marquee-selected at once.
      Object.values(doc.nodes).forEach((n) => {
        if (!n.visible || n.locked) return;
        const g = n.geometry;
        const bbox = rotatedAABB(g.x, g.y, g.w, g.h, g.rotation);
        const intersects =
          bbox.minX <= maxX && bbox.maxX >= minX && bbox.minY <= maxY && bbox.maxY >= minY;
        if (intersects) hits.push(n.id);
      });
      getStore().setSelection(hits);
      setMarquee(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    const rect = surfaceRef.current!.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoom.zoom - zoom.panX / zoom.zoom;
    const y = (e.clientY - rect.top) / zoom.zoom - zoom.panY / zoom.zoom;
    onMoveCursor(x, y);
    // Feed the status bar's cursor readout (throttled to ~15fps so a 60fps
    // mousemove storm doesn't thrash a global event listener dispatch).
    const now = performance.now();
    if (now - lastCursorDispatchAt.current > 66) {
      lastCursorDispatchAt.current = now;
      window.dispatchEvent(new CustomEvent('design:status-cursor', { detail: { x, y } }));
    }
  };

  // Wheel zoom / pan
  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const store = getStore();
      if (e.ctrlKey || e.metaKey) {
        const factor = e.deltaY < 0 ? 1.1 : 0.9;
        const next = Math.min(8, Math.max(0.05, store.zoom * factor));
        const rect = el.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const px = (cx - store.panX) / store.zoom;
        const py = (cy - store.panY) / store.zoom;
        store.setZoom(next, cx - px * next, cy - py * next);
      } else {
        store.setPan(store.panX - e.deltaX, store.panY - e.deltaY);
      }
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler as any);
  }, []);

  return (
    <div
      ref={surfaceRef}
      className="absolute inset-0 overflow-hidden select-none"
      style={{
        background: doc.workspace,
        backgroundImage: 'radial-gradient(circle, rgba(100,116,139,0.12) 1px, transparent 1px)',
        backgroundSize: `${20 * zoom.zoom}px ${20 * zoom.zoom}px`,
        backgroundPosition: `${zoom.panX}px ${zoom.panY}px`,
        cursor:
          tool === 'hand'
            ? 'grab'
            : tool === 'comment'
            ? 'crosshair'
            : tool === 'select'
            ? 'default'
            : 'crosshair',
      }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
    >
      {/* Artboard surface */}
      <div
        className="absolute shadow-2xl shadow-black/80"
        style={{
          left: zoom.panX,
          top: zoom.panY,
          width: doc.width * zoom.zoom,
          height: doc.height * zoom.zoom,
          background: doc.background,
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            transform: `scale(${zoom.zoom})`,
            transformOrigin: '0 0',
            width: doc.width,
            height: doc.height,
          }}
        >
          {/* Pixel-grid overlay — toggled from the StatusBar. Drawn behind the
              nodes so it reads as a guide, not as content. */}
          {getStore().showGrid && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backgroundImage: `linear-gradient(rgba(71,85,105,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(71,85,105,0.18) 1px, transparent 1px)`,
                backgroundSize: `${getStore().snap.gridSize}px ${getStore().snap.gridSize}px`,
                pointerEvents: 'none',
              }}
            />
          )}

          {doc.rootIds
            .slice()
            .sort((a, b) => doc.nodes[a].z - doc.nodes[b].z)
            .map(renderNode)}

          {/* Ghost preview */}
          {ghost && (
            <div
              style={{
                position: 'absolute',
                left: ghost.geometry.x,
                top: ghost.geometry.y,
                width: ghost.geometry.w,
                height: ghost.geometry.h,
                outline: '1.5px dashed #2563eb',
                background: 'rgba(37,99,235,0.08)',
                borderRadius: ghost.kind === 'ellipse' ? '50%' : 0,
                pointerEvents: 'none',
              }}
            />
          )}
        </div>
      </div>

      {/* Rulers */}
      <Ruler orientation="h" length={doc.width} zoom={zoom.zoom} offset={18 + zoom.panX} />
      <Ruler orientation="v" length={doc.height} zoom={zoom.zoom} offset={18 + zoom.panY} />
      <div
        className="absolute left-0 top-0 bg-white border-r border-b border-slate-200 z-30"
        style={{ width: 18, height: 18 }}
      />

      {/* Selection chrome — rendered in surface space so the outline stays
          glued to the node and handles stay a fixed 9px at any zoom. The
          container itself is just a positioned, non-scaled host. */}
      <div className="absolute pointer-events-none" style={{ left: 0, top: 0, width: 0, height: 0 }}>
        <SelectionChrome />
      </div>
      <SmartGuides />
      {marquee && <Marquee {...marquee} />}

      {/* Comment pins */}
      {comments.map((c) => (
        <CommentPinView key={c.id} comment={c} />
      ))}

      {/* Presence cursors */}
      {cursors.map((c) => (
        <PresenceCursor key={c.id} cursor={c} />
      ))}

      <FloatingToolbar />
    </div>
  );
}

function createFromDrag(tool: Tool, x: number, y: number, w: number, h: number) {
  const map: Partial<Record<Tool, NodeKind>> = {
    rect: 'rect',
    ellipse: 'ellipse',
    triangle: 'triangle',
    line: 'line',
    frame: 'frame',
    star: 'star',
    polygon: 'polygon',
    text: 'text',
  };
  const kind = map[tool];
  if (!kind) return;

  if (kind === 'text') {
    addTextPreset('body');
    getStore().setTool('select');
    return;
  }
  if (kind === 'frame') {
    addShape('frame', {
      geometry: { x, y, w: Math.max(20, w), h: Math.max(20, h), rotation: 0, flip: 'none', radius: [12, 12, 12, 12] },
    });
    getStore().setTool('select');
    return;
  }
  if (kind === 'line') {
    // Directional line: read the signed dy stashed by startShapeDraw so the
    // line points from the drag start toward the cursor (any direction).
    const dir = (window as any).__designLineDir as { dy: number } | null;
    const signedH = dir ? (dir.dy < 0 ? -Math.max(2, h) : Math.max(2, h)) : Math.max(2, h);
    addShape('line', {
      geometry: { x, y, w: Math.max(2, w), h: signedH, rotation: 0, flip: 'none', radius: [0, 0, 0, 0] },
    });
    getStore().setTool('select');
    return;
  }
  addShape(kind, {
    geometry: { x, y, w: Math.max(2, w), h: Math.max(2, h), rotation: 0, flip: 'none', radius: [0, 0, 0, 0] },
  });
  getStore().setTool('select');
}

/* ===================================================================
 * Public renderer
 * =================================================================== */

export interface DesignCanvasViewProps {
  cursors?: Cursor[];
  onCommentsChange?: (comments: CommentPin[]) => void;
  onCursorsChange?: (cursors: Cursor[]) => void;
  onSelfCursorChange?: (x: number, y: number) => void;
}

export function DesignCanvasView({
  cursors: externalCursors,
  onCommentsChange,
  onCursorsChange,
  onSelfCursorChange,
}: DesignCanvasViewProps) {
  // Comments now live on the document (store.ts) instead of local state, so
  // they persist through the same commit/localStorage path as every other
  // edit — previously they were pure `useState` and vanished on refresh or
  // on leaving Design Studio.
  const doc = useDocument();
  const comments = doc.comments ?? [];
  const cursors = externalCursors ?? [];

  useEffect(() => onCommentsChange?.(comments), [comments, onCommentsChange]);
  useEffect(() => onCursorsChange?.(cursors), [cursors, onCursorsChange]);

  return (
    <PageSurface
      comments={comments}
      cursors={cursors}
      onAddComment={(x, y) =>
        getStore().addComment({
          id: uid('cmt'),
          x,
          y,
          author: 'You',
          text: 'New comment — click to edit',
          resolved: false,
          createdAt: Date.now(),
        })
      }
      onMoveCursor={(x, y) => onSelfCursorChange?.(x, y)}
    />
  );
}
