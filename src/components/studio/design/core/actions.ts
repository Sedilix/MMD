/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Design Canvas — Actions
 *
 * High-level operations that components dispatch. They wrap `store.commit`
 * with predictable semantics so panels never reach into the raw document.
 * Each function returns the new node ids (when applicable) so callers can
 * immediately re-select the freshly created objects.
 */
'use client';

import type { CanvasDocument, CanvasNode, NodeKind } from './types';
import { getStore, makeNode, uid } from './store';

/* ---------- helpers ---------- */

function siblingZ(doc: CanvasDocument, parentId: string | null): number {
  // `doc.rootIds` only ever holds nodes whose parentId is null — filtering
  // it for a non-null parentId always returned an empty array, so every
  // node added under a real parent silently got z=0 regardless of how many
  // siblings it already had. No current caller passes a non-null parentId
  // (every creation action here hardcodes `null`), so this was dead rather
  // than visibly broken — but it's a landmine for the next feature that
  // creates a node directly inside a frame or group.
  const ids = parentId ? (doc.nodes[parentId]?.children ?? []) : doc.rootIds;
  if (ids.length === 0) return 0;
  return Math.max(...ids.map((id) => doc.nodes[id]?.z ?? 0)) + 1;
}

function addNodeToDoc(doc: CanvasDocument, node: CanvasNode, parentId: string | null) {
  node.parentId = parentId;
  node.z = siblingZ(doc, parentId);
  doc.nodes[node.id] = node;
  if (parentId && doc.nodes[parentId]) {
    const parent = doc.nodes[parentId];
    parent.children = [...(parent.children ?? []), node.id];
  } else {
    doc.rootIds.push(node.id);
  }
}

function removeNodeFromDoc(doc: CanvasDocument, id: string) {
  const node = doc.nodes[id];
  if (!node) return;
  // Recursively remove children
  (node.children ?? []).slice().forEach((c) => removeNodeFromDoc(doc, c));
  if (node.parentId && doc.nodes[node.parentId]) {
    const p = doc.nodes[node.parentId];
    p.children = (p.children ?? []).filter((c) => c !== id);
  } else {
    doc.rootIds = doc.rootIds.filter((c) => c !== id);
  }
  delete doc.nodes[id];
}

/* ---------- creation ---------- */

export function addShape(kind: NodeKind, opts: Partial<CanvasNode> = {}) {
  const store = getStore();
  let id = '';
  store.commit((doc) => {
    const cx = doc.width / 2 - 60;
    const cy = doc.height / 2 - 60;
    const node = makeNode({
      kind,
      name: opts.name,
      geometry: { x: cx, y: cy, w: 120, h: 120, rotation: 0, flip: 'none', radius: [0, 0, 0, 0] },
      ...opts,
    });
    // Style defaults per kind for a nice first-paint
    if (kind === 'rect') {
      node.fill = { type: 'solid', value: '#0ea5e9', opacity: 1 };
      node.geometry.radius = [10, 10, 10, 10];
    } else if (kind === 'ellipse') {
      node.fill = { type: 'solid', value: '#6366f1', opacity: 1 };
    } else if (kind === 'triangle') {
      node.fill = { type: 'solid', value: '#d8a657', opacity: 1 };
    } else if (kind === 'star') {
      node.fill = { type: 'solid', value: '#f59e0b', opacity: 1 };
    } else if (kind === 'polygon') {
      node.fill = { type: 'solid', value: '#a855f7', opacity: 1 };
    } else if (kind === 'line') {
      node.stroke = { ...node.stroke, enabled: true, color: '#38bdf8', width: 4, cap: 'round' };
      node.geometry.w = 200;
      node.geometry.h = 0;
    } else if (kind === 'text') {
      node.text = {
        ...(node.text as any),
        content: 'Insert text',
        fontSize: 24,
        fontWeight: 600,
        color: '#0f172a',
      };
      node.geometry.w = 220;
      node.geometry.h = 36;
    } else if (kind === 'frame') {
      node.fill = { type: 'solid', value: '#0b1220', opacity: 1 };
      node.geometry.w = 480;
      node.geometry.h = 320;
      node.geometry.radius = [16, 16, 16, 16];
    }
    addNodeToDoc(doc, node, null);
    id = node.id;
  });
  store.setSelection([id]);
  return id;
}

export function addImageFromUrl(url: string) {
  const store = getStore();
  let id = '';
  store.commit((doc) => {
    const node = makeNode({
      kind: 'image',
      name: 'Image',
      geometry: { x: doc.width / 2 - 150, y: doc.height / 2 - 100, w: 300, h: 200, rotation: 0, flip: 'none', radius: [0, 0, 0, 0] },
      image: { url },
    });
    addNodeToDoc(doc, node, null);
    id = node.id;
  });
  store.setSelection([id]);
  return id;
}

export function addTextPreset(preset: 'header' | 'subheader' | 'body' | 'caption') {
  // Colors assume a white artboard (the new default — see store.ts's
  // newDoc). They used to be near-white, assuming the old dark default
  // artboard; left as-is they'd insert invisible white-on-white text now.
  const presets: Record<string, { content: string; fontSize: number; fontWeight: number; color: string; align: 'left' | 'center' | 'right' }> = {
    header: { content: 'Heading', fontSize: 48, fontWeight: 700, color: '#0f172a', align: 'left' },
    subheader: { content: 'Subheading', fontSize: 24, fontWeight: 600, color: '#1e293b', align: 'left' },
    body: { content: 'Body copy — click to edit. Lorem ipsum dolor sit amet, consectetur adipiscing elit.', fontSize: 16, fontWeight: 400, color: '#334155', align: 'left' },
    caption: { content: 'Caption', fontSize: 12, fontWeight: 500, color: '#64748b', align: 'left' },
  };
  const p = presets[preset];
  const store = getStore();
  let id = '';
  store.commit((doc) => {
    const w = preset === 'body' ? 360 : 240;
    const node = makeNode({
      kind: 'text',
      name: preset[0].toUpperCase() + preset.slice(1),
      geometry: { x: doc.width / 2 - w / 2, y: doc.height / 2 - 24, w, h: 48, rotation: 0, flip: 'none', radius: [0, 0, 0, 0] },
      text: {
        content: p.content,
        fontFamily: 'Inter',
        fontSize: p.fontSize,
        fontWeight: p.fontWeight,
        italic: false,
        underline: false,
        strikethrough: false,
        align: p.align,
        lineHeight: 1.4,
        letterSpacing: 0,
        color: p.color,
        opacity: 1,
        textTransform: 'none',
      },
    });
    addNodeToDoc(doc, node, null);
    id = node.id;
  });
  store.setSelection([id]);
  return id;
}

/* ---------- mutation ---------- */

/**
 * Patch a single node.
 *
 * Pass `{ transient: true }` for high-frequency updates (slider drags,
 * live transform) so the change doesn't push a new undo entry on every
 * tick. The caller is responsible for issuing one final non-transient
 * `updateNode` (or a `commit`) when the interaction ends to capture the
 * settled state on the undo stack.
 */
export function updateNode(id: string, patch: Partial<CanvasNode>, opts: { transient?: boolean } = {}) {
  const store = getStore();
  store.commit(
    (doc) => {
      const node = doc.nodes[id];
      if (!node) return;
      Object.assign(node, patch);
      if (patch.geometry) node.geometry = { ...node.geometry, ...patch.geometry };
      if (patch.fill) node.fill = { ...node.fill, ...patch.fill } as any;
      if (patch.stroke) node.stroke = { ...node.stroke, ...patch.stroke } as any;
      if (patch.text) node.text = { ...(node.text as any), ...patch.text };
    },
    { history: !opts.transient },
  );
}

export function updateNodes(ids: string[], patch: Partial<CanvasNode>) {
  const store = getStore();
  store.commit((doc) => {
    ids.forEach((id) => {
      const node = doc.nodes[id];
      if (!node) return;
      Object.assign(node, patch);
      if (patch.geometry) node.geometry = { ...node.geometry, ...patch.geometry };
      if (patch.fill) node.fill = { ...node.fill, ...patch.fill } as any;
      if (patch.stroke) node.stroke = { ...node.stroke, ...patch.stroke } as any;
      if (patch.text) node.text = { ...(node.text as any), ...patch.text };
    });
  });
}

export function deleteSelection() {
  const store = getStore();
  const ids = store.selection.ids;
  if (ids.length === 0) return;
  store.commit((doc) => {
    ids.forEach((id) => removeNodeFromDoc(doc, id));
  });
  store.setSelection([]);
}

export function duplicateSelection() {
  const store = getStore();
  const ids = store.selection.ids;
  if (ids.length === 0) return [] as string[];
  const newIds: string[] = [];
  store.commit((doc) => {
    ids.forEach((id) => {
      const original = doc.nodes[id];
      if (!original) return;
      const copy = JSON.parse(JSON.stringify(original)) as CanvasNode;
      copy.id = uid(original.kind);
      copy.name = `${original.name} copy`;
      copy.geometry = { ...copy.geometry, x: copy.geometry.x + 20, y: copy.geometry.y + 20 };
      // Re-parent children to the copy
      if (copy.children) {
        const newChildren: string[] = [];
        copy.children.forEach((childId) => {
          const child = doc.nodes[childId];
          if (child) {
            const childCopy = JSON.parse(JSON.stringify(child)) as CanvasNode;
            childCopy.id = uid(child.kind);
            childCopy.parentId = copy.id;
            doc.nodes[childCopy.id] = childCopy;
            newChildren.push(childCopy.id);
          }
        });
        copy.children = newChildren;
      }
      addNodeToDoc(doc, copy, null);
      newIds.push(copy.id);
    });
  });
  store.setSelection(newIds);
  return newIds;
}

/* ---------- reordering ---------- */

export function reorder(id: string, action: 'front' | 'back' | 'forward' | 'backward') {
  const store = getStore();
  store.commit((doc) => {
    const node = doc.nodes[id];
    if (!node) return;
    const parentId = node.parentId;
    const siblings = (parentId ? doc.nodes[parentId]?.children ?? [] : doc.rootIds).filter(
      (s) => doc.nodes[s],
    );
    if (siblings.length === 0) return;
    // Sort once by current z, then rewrite z as clean integers so the move
    // actually swaps paint order (the old +1/-1 nudged the node's z but left
    // it between its neighbours, so "forward" often did nothing) and so
    // fractional drift from drag-reorder never accumulates.
    const ordered = siblings.slice().sort((a, b) => doc.nodes[a].z - doc.nodes[b].z);
    const idx = ordered.indexOf(id);
    if (idx === -1) return;
    if (action === 'forward' && idx < ordered.length - 1) {
      ordered.splice(idx, 1);
      ordered.splice(idx + 1, 0, id);
    } else if (action === 'backward' && idx > 0) {
      ordered.splice(idx, 1);
      ordered.splice(idx - 1, 0, id);
    } else if (action === 'front') {
      ordered.splice(idx, 1);
      ordered.push(id);
    } else if (action === 'back') {
      ordered.splice(idx, 1);
      ordered.unshift(id);
    }
    ordered.forEach((sibId, i) => { doc.nodes[sibId].z = i; });
    // Keep the children array (if any) in the same order for LayersPanel.
    if (parentId && doc.nodes[parentId]) {
      doc.nodes[parentId].children = ordered;
    }
  });
}

/* ---------- groups ---------- */

/**
 * Compute the axis-aligned bounding box of a set of nodes. Used to give a
 * group node a real geometry so the renderer can draw its selection outline
 * and the snap / marquee systems treat it as a real object. The group keeps
 * children at their absolute coordinates (no nesting offset) so we take the
 * union of child bboxes in document space.
 */
function unionBBox(doc: CanvasDocument, ids: string[]): { x: number; y: number; w: number; h: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  ids.forEach((id) => {
    const n = doc.nodes[id];
    if (!n) return;
    minX = Math.min(minX, n.geometry.x);
    minY = Math.min(minY, n.geometry.y);
    maxX = Math.max(maxX, n.geometry.x + n.geometry.w);
    maxY = Math.max(maxY, n.geometry.y + n.geometry.h);
  });
  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function groupSelection() {
  const store = getStore();
  const ids = store.selection.ids;
  if (ids.length < 2) return null;
  let groupId = '';
  store.commit((doc) => {
    // Give the group a real bounding box up front (was 0×0) so the renderer,
    // snap, marquee and selection-outline all treat it as a real object.
    const bbox = unionBBox(doc, ids);
    const group = makeNode({
      kind: 'group',
      name: 'Group',
      geometry: { x: bbox.x, y: bbox.y, w: bbox.w, h: bbox.h, rotation: 0, flip: 'none', radius: [0, 0, 0, 0] },
      fill: { type: 'none', value: '', opacity: 0 },
    });
    addNodeToDoc(doc, group, null);
    ids.forEach((id) => {
      const child = doc.nodes[id];
      if (!child) return;
      // Detach from current parent
      if (child.parentId && doc.nodes[child.parentId]) {
        const p = doc.nodes[child.parentId];
        p.children = (p.children ?? []).filter((c) => c !== id);
      } else {
        doc.rootIds = doc.rootIds.filter((c) => c !== id);
      }
      child.parentId = group.id;
      group.children = [...(group.children ?? []), id];
    });
    groupId = group.id;
  });
  store.setSelection([groupId]);
  return groupId;
}

/**
 * Recompute integer z-index for a parent's children, preserving the current
 * sort order. Called after drag-reorder and the ±0.5 nudges so z values stay
 * clean integers instead of accumulating fractional drift (e.g. 12.5, 13.5)
 * that would eventually break `reorder`'s `maxZ ± 1` logic.
 */
function normalizeSiblingZ(doc: CanvasDocument, parentId: string | null) {
  const ids = (parentId ? doc.nodes[parentId]?.children ?? [] : doc.rootIds).slice();
  ids
    .map((id) => ({ id, node: doc.nodes[id] }))
    .filter((x) => x.node)
    .sort((a, b) => a.node.z - b.node.z)
    .forEach((x, i) => { x.node.z = i; });
}

export function ungroupSelection() {
  const store = getStore();
  const ids = store.selection.ids;
  if (ids.length === 0) return;
  const newSelection: string[] = [];
  store.commit((doc) => {
    ids.forEach((id) => {
      const group = doc.nodes[id];
      if (!group || group.kind !== 'group') {
        newSelection.push(id);
        return;
      }
      const children = group.children ?? [];
      children.forEach((cid) => {
        const child = doc.nodes[cid];
        if (!child) return;
        child.parentId = null;
        addNodeToDoc(doc, child, null);
        newSelection.push(cid);
      });
      // Remove the empty group
      doc.rootIds = doc.rootIds.filter((c) => c !== id);
      delete doc.nodes[id];
    });
  });
  // Set selection AFTER the commit closes. Calling a store setter from
  // inside a commit mutator (the previous code) is a layering violation that
  // races with emit and reads from a doc being deep-cloned.
  if (newSelection.length > 0) store.setSelection(newSelection);
}

/* ---------- align / distribute ---------- */

export function alignSelection(dir: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') {
  const store = getStore();
  const ids = store.selection.ids;
  if (ids.length < 2) return;
  store.commit((doc) => {
    const items = ids.map((id) => doc.nodes[id]).filter(Boolean);
    const xs = items.map((n) => n.geometry.x);
    const ys = items.map((n) => n.geometry.y);
    const rights = items.map((n) => n.geometry.x + n.geometry.w);
    const bottoms = items.map((n) => n.geometry.y + n.geometry.h);
    let anchor: number;
    items.forEach((n) => {
      switch (dir) {
        case 'left':
          n.geometry.x = Math.min(...xs);
          break;
        case 'right':
          n.geometry.x = Math.max(...rights) - n.geometry.w;
          break;
        case 'center': {
          const mid = (Math.min(...xs) + Math.max(...rights)) / 2;
          n.geometry.x = mid - n.geometry.w / 2;
          break;
        }
        case 'top':
          n.geometry.y = Math.min(...ys);
          break;
        case 'bottom':
          n.geometry.y = Math.max(...bottoms) - n.geometry.h;
          break;
        case 'middle': {
          const mid = (Math.min(...ys) + Math.max(...bottoms)) / 2;
          n.geometry.y = mid - n.geometry.h / 2;
          break;
        }
      }
    });
  });
}

export function distributeSelection(dir: 'horizontal' | 'vertical') {
  const store = getStore();
  const ids = store.selection.ids;
  if (ids.length < 3) return;
  store.commit((doc) => {
    const items = ids.map((id) => doc.nodes[id]).filter(Boolean);
    items.sort((a, b) => (dir === 'horizontal' ? a.geometry.x - b.geometry.x : a.geometry.y - b.geometry.y));
    const first = items[0];
    const last = items[items.length - 1];
    if (dir === 'horizontal') {
      const startX = first.geometry.x;
      const endX = last.geometry.x;
      const step = (endX - startX) / (items.length - 1);
      items.forEach((n, i) => {
        n.geometry.x = startX + step * i;
      });
    } else {
      const startY = first.geometry.y;
      const endY = last.geometry.y;
      const step = (endY - startY) / (items.length - 1);
      items.forEach((n, i) => {
        n.geometry.y = startY + step * i;
      });
    }
  });
}

/* ---------- document-level ---------- */

export function resizeArtboard(w: number, h: number) {
  const store = getStore();
  store.commit((doc) => {
    doc.width = Math.max(16, Math.round(w));
    doc.height = Math.max(16, Math.round(h));
  });
}

export function setArtboardBackground(color: string) {
  const store = getStore();
  store.commit((doc) => {
    doc.background = color;
  });
}

export function setDocumentName(name: string) {
  const store = getStore();
  store.commit((doc) => {
    doc.name = name;
  });
}

export function clearDocument() {
  const store = getStore();
  store.commit((doc) => {
    doc.rootIds = [];
    doc.nodes = {};
  });
  store.setSelection([]);
}
