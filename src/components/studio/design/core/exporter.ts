/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Design Canvas — Exporter
 *
 * Renders the document to PNG (via foreignObject SVG), SVG (native), JSON
 * (the source of truth), PDF (via window.print) and React TSX (transpiled
 * to a Tailwind className string for each node).
 */
'use client';

import type { CanvasDocument, CanvasNode, Fill } from './types';

function hexToRgba(hex: string, a = 1): string {
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

function renderNodeSVG(node: CanvasNode, doc: CanvasDocument): string {
  if (!node.visible) return '';
  const g = node.geometry;
  const t = `translate(${g.x} ${g.y}) rotate(${g.rotation} ${g.w / 2} ${g.h / 2})`;
  const flip = `scale(${g.flip === 'x' ? -1 : 1} ${g.flip === 'y' ? -1 : 1})`;
  const transform = `${t} ${flip} translate(${-g.x} ${-g.y})`;
  const fill = node.fill.type === 'solid' ? hexToRgba(node.fill.value, node.fill.opacity) : 'none';
  const stroke = node.stroke.enabled ? hexToRgba(node.stroke.color, 1) : 'none';
  const strokeWidth = node.stroke.enabled ? node.stroke.width : 0;
  const radius = node.geometry.radius;

  // Build a single combined <filter> that chains every enabled effect, then
  // reference it once. The old code emitted one <filter> per effect but
  // hardcoded the reference to index 0 — so only the first effect ever
  // applied, and blur-after-shadow was silently dropped. The defs are
  // emitted once by exportSVG (see FILTER_DEFS below).
  const filterPrimitives: string[] = [];
  node.effects
    .filter((e) => e.enabled)
    .forEach((e) => {
      if (e.type === 'shadow' && e.shadow) {
        const sh = e.shadow;
        filterPrimitives.push(
          sh.type === 'inner'
            ? `<feComponentTransfer in="SourceAlpha"><feFuncA type="table" tableValues="1 0"/></feComponentTransfer>`
            : `<feDropShadow dx="${sh.x}" dy="${sh.y}" stdDeviation="${sh.blur}" flood-color="${sh.color}" flood-opacity="${sh.opacity}"/>`,
        );
      } else if (e.type === 'blur' && e.blur) {
        filterPrimitives.push(`<feGaussianBlur stdDeviation="${e.blur}"/>`);
      } else if (e.type === 'glow' && e.shadow) {
        const sh = e.shadow;
        filterPrimitives.push(
          `<feDropShadow dx="0" dy="0" stdDeviation="${sh.blur}" flood-color="${sh.color}" flood-opacity="${sh.opacity}"/>`,
        );
      }
    });
  const hasFilter = filterPrimitives.length > 0;
  const filterAttr = hasFilter
    ? `filter="url(#eff-${escapeXml(node.id)})"`
    : '';
  const filterDef = hasFilter
    ? `<filter id="eff-${escapeXml(node.id)}">${filterPrimitives.join('')}</filter>`
    : '';

  // Each node's filter <defs> are inlined right before its element. SVG
  // permits <filter> definitions anywhere in the tree, so this is valid and
  // keeps renderNodeSVG self-contained (no external def collector needed).
  if (node.kind === 'rect' || node.kind === 'frame') {
    return `${filterDef}<g transform="${transform}" ${filterAttr}><rect x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" rx="${radius[0]}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" /></g>`;
  }
  if (node.kind === 'ellipse') {
    return `${filterDef}<g transform="${transform}" ${filterAttr}><ellipse cx="${g.x + g.w / 2}" cy="${g.y + g.h / 2}" rx="${g.w / 2}" ry="${g.h / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" /></g>`;
  }
  if (node.kind === 'text' && node.text) {
    const t = node.text;
    return `${filterDef}<g transform="${transform}" ${filterAttr}><text x="${g.x}" y="${g.y + t.fontSize}" fill="${hexToRgba(t.color, t.opacity)}" font-family="${escapeXml(t.fontFamily)}" font-size="${t.fontSize}" font-weight="${t.fontWeight}" font-style="${t.italic ? 'italic' : 'normal'}" text-anchor="${t.align === 'center' ? 'middle' : t.align === 'right' ? 'end' : 'start'}">${escapeXml(t.content)}</text></g>`;
  }
  if (node.kind === 'image' && node.image) {
    return `${filterDef}<g transform="${transform}" ${filterAttr}><image x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" href="${escapeXml(node.image.url)}" preserveAspectRatio="xMidYMid slice" /></g>`;
  }
  if (node.kind === 'line') {
    return `${filterDef}<g transform="${transform}" ${filterAttr}><line x1="${g.x}" y1="${g.y}" x2="${g.x + g.w}" y2="${g.y + (g.h || 0)}" stroke="${stroke !== 'none' ? stroke : fill}" stroke-width="${strokeWidth || 2}" stroke-linecap="${node.stroke.cap}" /></g>`;
  }
  if (node.kind === 'triangle') {
    const points = `${g.x + g.w / 2},${g.y} ${g.x + g.w},${g.y + g.h} ${g.x},${g.y + g.h}`;
    return `${filterDef}<g transform="${transform}" ${filterAttr}><polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" /></g>`;
  }
  if (node.kind === 'star') {
    const points = 5;
    const cx = g.x + g.w / 2;
    const cy = g.y + g.h / 2;
    const outer = Math.min(g.w, g.h) / 2;
    const inner = outer * 0.45;
    let d = '';
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = (Math.PI / points) * i - Math.PI / 2;
      d += (i === 0 ? 'M' : 'L') + (cx + Math.cos(a) * r) + ' ' + (cy + Math.sin(a) * r) + ' ';
    }
    d += 'Z';
    return `${filterDef}<g transform="${transform}" ${filterAttr}><path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" /></g>`;
  }
  if (node.kind === 'polygon') {
    const sides = 6;
    const cx = g.x + g.w / 2;
    const cy = g.y + g.h / 2;
    const r = Math.min(g.w, g.h) / 2;
    let d = '';
    for (let i = 0; i < sides; i++) {
      const a = (Math.PI * 2 / sides) * i - Math.PI / 2;
      d += (i === 0 ? 'M' : 'L') + (cx + Math.cos(a) * r) + ' ' + (cy + Math.sin(a) * r) + ' ';
    }
    d += 'Z';
    return `${filterDef}<g transform="${transform}" ${filterAttr}><path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" /></g>`;
  }
  if (node.kind === 'group') {
    // A group's own opacity/blend were previously dropped on export — the
    // exported file didn't match what the editor showed once that became
    // real (see core/renderer.tsx). Children carry absolute coordinates
    // already, so a plain (untransformed) <g> is enough to carry the
    // compositing without touching their positions.
    const inner = (node.children ?? []).map((c) => renderNodeSVG(doc.nodes[c], doc)).join('');
    const opacityAttr = node.opacity !== 1 ? ` opacity="${node.opacity}"` : '';
    const hasBlend = node.blend !== 'normal';
    const blendAttr = hasBlend ? ` style="mix-blend-mode:${escapeXml(node.blend)};isolation:isolate"` : '';
    return `<g${opacityAttr}${blendAttr}>${inner}</g>`;
  }
  return '';
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c] as string));
}

export function exportSVG(doc: CanvasDocument): string {
  const body = doc.rootIds
    .slice()
    .sort((a, b) => doc.nodes[a].z - doc.nodes[b].z)
    .map((id) => renderNodeSVG(doc.nodes[id], doc))
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${doc.width}" height="${doc.height}" viewBox="0 0 ${doc.width} ${doc.height}">${body}</svg>`;
}

export function exportJSON(doc: CanvasDocument): string {
  return JSON.stringify(doc, null, 2);
}

// Emit a single style value as a valid TS object-literal fragment, escaping
// any user-supplied string via JSON.stringify so an apostrophe in text ("don't")
// or a quote in a URL can't break the generated file. Numbers are emitted raw.
function tsxStyleItem(key: string, value: string | number): string {
  return typeof value === 'number' ? `${key}: ${value}` : `${key}: ${JSON.stringify(value)}`;
}

function renderNodeTSX(node: CanvasNode, doc: CanvasDocument, depth: number): string {
  if (!node.visible) return '';
  const indent = '      ' + '  '.repeat(depth);
  const g = node.geometry;

  // Groups recurse into children so grouped content is no longer dropped
  // from the exported component (was: only rootIds walked).
  if (node.kind === 'group') {
    const children = (node.children ?? [])
      .map((c) => doc.nodes[c])
      .filter(Boolean)
      .sort((a, b) => a.z - b.z);
    if (children.length === 0) return '';
    const inner = children.map((c) => renderNodeTSX(c, doc, depth + 1)).join('\n');
    // Children carry *absolute* canvas-space coordinates (see actions.ts's
    // unionBBox comment) — they are not relative to the group's own bbox.
    // Positioning this wrapper at the group's `left: g.x, top: g.y` (the
    // previous code) double-offset every child, since the browser adds the
    // wrapper's own offset on top of each child's already-absolute left/top.
    // `inset: 0` keeps the wrapper's coordinate space identical to the
    // canvas root's, so children land exactly where their own left/top says.
    const groupStyle: string[] = [tsxStyleItem('position', 'absolute'), tsxStyleItem('inset', 0)];
    if (node.opacity !== 1) groupStyle.push(tsxStyleItem('opacity', node.opacity));
    if (node.blend !== 'normal') {
      groupStyle.push(tsxStyleItem('mixBlendMode', node.blend), tsxStyleItem('isolation', 'isolate'));
    }
    return `${indent}<div style={{ ${groupStyle.join(', ')} }}>\n${inner}\n${indent}</div>`;
  }

  const style: string[] = [];
  style.push(tsxStyleItem('left', `${g.x}px`));
  style.push(tsxStyleItem('top', `${g.y}px`));
  style.push(tsxStyleItem('width', `${g.w}px`));
  style.push(tsxStyleItem('height', `${g.h}px`));
  if (g.rotation) style.push(tsxStyleItem('transform', `rotate(${g.rotation}deg)`));
  if (node.fill.type === 'solid' && node.fill.value) {
    style.push(tsxStyleItem('background', hexToRgba(node.fill.value, node.fill.opacity)));
  }
  if (node.stroke.enabled) {
    style.push(tsxStyleItem('border', `${node.stroke.width}px solid ${node.stroke.color}`));
  }
  style.push(tsxStyleItem('opacity', node.opacity));
  const radiusCss = g.radius.map((r) => `${r}px`).join(' ');
  style.push(tsxStyleItem('borderRadius', radiusCss));

  if (node.kind === 'text' && node.text) {
    const t = node.text;
    const textProps: string[] = [
      tsxStyleItem('color', t.color),
      tsxStyleItem('fontFamily', t.fontFamily),
      tsxStyleItem('fontSize', `${t.fontSize}px`),
      tsxStyleItem('fontWeight', t.fontWeight),
      tsxStyleItem('textAlign', t.align),
      tsxStyleItem('textDecoration', [t.underline ? 'underline' : '', t.strikethrough ? 'line-through' : ''].filter(Boolean).join(' ') || 'none'),
      tsxStyleItem('fontStyle', t.italic ? 'italic' : 'normal'),
    ];
    // Escape text content for JSX so </>-like input can't break the file.
    const safeContent = jsxEscape(t.content);
    return `${indent}<p style={{ position: 'absolute', ${style.join(', ')}, ${textProps.join(', ')} }}>${safeContent}</p>`;
  }
  if (node.kind === 'image' && node.image) {
    return `${indent}<img src=${JSON.stringify(node.image.url)} alt=${JSON.stringify(node.name)} style={{ position: 'absolute', ${style.join(', ')}, objectFit: 'cover' }} />`;
  }
  return `${indent}<div style={{ position: 'absolute', ${style.join(', ')} }} />`;
}

function jsxEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function exportTSX(doc: CanvasDocument): string {
  const elements = doc.rootIds
    .slice()
    .sort((a, b) => doc.nodes[a].z - doc.nodes[b].z)
    .map((id) => renderNodeTSX(doc.nodes[id], doc, 0))
    .filter(Boolean);

  return `'use client';

import React from 'react';

export default function CybrdeckDesign() {
  return (
    <div style={{ position: 'relative', width: ${doc.width}, height: ${doc.height}, background: ${JSON.stringify(doc.background)} }}>
${elements.join('\n')}
    </div>
  );
}
`;
}

/**
 * Fetch an image URL and return a base64 data URL. We use this to inline
 * image nodes before rasterizing the SVG, because `drawImage` on a
 * cross-origin <image> (Unsplash, AI-generated assets, etc.) taints the
 * canvas and `toBlob` throws SecurityError — the old export silently failed
 * for any doc containing a remote image. Data URLs are same-origin, so the
 * rasterized canvas stays clean. Failures fall back to the original URL
 * (best-effort) rather than aborting the whole export.
 */
async function inlineImageAsDataUrl(url: string): Promise<string> {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return url;
    const blob = await res.blob();
    // Cap at ~4MB so a single huge image can't blow up the SVG string.
    if (blob.size > 4 * 1024 * 1024) return url;
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : url);
      reader.onerror = () => resolve(url);
      reader.readAsDataURL(blob);
    });
  } catch {
    return url;
  }
}

export async function exportPNG(doc: CanvasDocument): Promise<Blob> {
  // Inline every image node so the rasterized canvas can't be tainted by a
  // cross-origin <image>. Build a shallow clone with rewritten image URLs.
  const inlined: CanvasDocument = { ...doc, nodes: { ...doc.nodes } };
  await Promise.all(
    Object.values(inlined.nodes).map(async (n) => {
      if (n.kind === 'image' && n.image && /^https?:/i.test(n.image.url)) {
        const dataUrl = await inlineImageAsDataUrl(n.image.url);
        if (dataUrl !== n.image.url) {
          inlined.nodes[n.id] = { ...n, image: { ...n.image, url: dataUrl } };
        }
      }
    }),
  );

  const svg = exportSVG(inlined);
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const scale = Math.min(4, Math.max(2, typeof window !== 'undefined' ? (window.devicePixelRatio || 1) * 2 : 2));
  return new Promise<Blob>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = async () => {
      try {
        // Wait for the image to fully decode before drawing — some engines
        // fire onload before decode completes, producing a blank draw.
        if (typeof img.decode === 'function') {
          await img.decode().catch(() => void 0);
        }
        const c = document.createElement('canvas');
        c.width = doc.width * scale;
        c.height = doc.height * scale;
        const ctx = c.getContext('2d');
        if (!ctx) { URL.revokeObjectURL(url); reject(new Error('No 2D context')); return; }
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);
        c.toBlob((b) => {
          URL.revokeObjectURL(url);
          if (b) resolve(b);
          else reject(new Error('toBlob returned null'));
        }, 'image/png');
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function copyToClipboard(text: string) {
  if (navigator?.clipboard) {
    return navigator.clipboard.writeText(text);
  }
  return Promise.resolve();
}
