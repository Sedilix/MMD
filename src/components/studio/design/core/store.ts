/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Design Canvas — Document Store
 *
 * A tiny, dependency-free, immutable-style state container for `CanvasDocument`
 * with built-in undo/redo. We intentionally avoid Redux/Zustand to keep the
 * canvas drop-in friendly. The store exposes:
 *
 *   - `useDocument()` — read snapshot
 *   - `api.update / add / remove / reorder / etc.` — mutate via a single
 *     `commit` so every change lands on the undo stack
 *   - `subscribe` — for cross-component awareness (presence cursors,
 *     comment pins, …)
 *
 * The store keeps the design entirely serialisable so we can persist it to
 * Firestore or transport it to a CRDT for multiplayer later.
 */
'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import type {
  BlendMode,
  CanvasDocument,
  CanvasNode,
  CommentPin,
  Fill,
  Geometry,
  NodeKind,
  Selection,
  Stroke,
  Tool,
} from './types';

const HISTORY_LIMIT = 200;
// localStorage key for the auto-persisted document. The document is fully
// serialisable by design, so we debounce-write it on every commit and
// rehydrate on store creation — without this the canvas loses all work on a
// refresh, tab close, or studio re-open. History is stripped before persist
// to keep the blob small and avoid restoring a stale undo stack.
const STORAGE_KEY = 'cybrdeck:design-doc:v1';
const PERSIST_DEBOUNCE_MS = 500;

let counter = 0;
export const uid = (prefix = 'n') => `${prefix}_${Date.now().toString(36)}_${(counter++).toString(36)}`;

const defaultFill = (): Fill => ({ type: 'solid', value: '#0ea5e9', opacity: 1 });
const defaultStroke = (): Stroke => ({
  enabled: false,
  color: '#0b1220',
  width: 1,
  align: 'center',
  dashArray: [],
  cap: 'butt',
  join: 'miter',
});

const defaultGeometry = (x: number, y: number, w: number, h: number): Geometry => ({
  x,
  y,
  w,
  h,
  rotation: 0,
  flip: 'none',
  radius: [0, 0, 0, 0],
});

export function makeNode(partial: Partial<CanvasNode> & { kind: NodeKind }): CanvasNode {
  const id = partial.id ?? uid(partial.kind);
  const base: CanvasNode = {
    id,
    kind: partial.kind,
    parentId: partial.parentId ?? null,
    name: partial.name ?? guessName(partial.kind),
    visible: partial.visible ?? true,
    locked: partial.locked ?? false,
    z: partial.z ?? 0,
    blend: (partial.blend ?? 'normal') as BlendMode,
    opacity: partial.opacity ?? 1,
    geometry: partial.geometry ?? defaultGeometry(0, 0, 100, 100),
    fill: partial.fill ?? defaultFill(),
    stroke: partial.stroke ?? defaultStroke(),
    effects: partial.effects ?? [],
    children: partial.children,
    meta: partial.meta,
  };
  if (partial.kind === 'text' && !partial.text) {
    base.text = {
      content: 'Text',
      fontFamily: 'Inter',
      fontSize: 18,
      fontWeight: 500,
      italic: false,
      underline: false,
      strikethrough: false,
      align: 'left',
      lineHeight: 1.4,
      letterSpacing: 0,
      color: '#0b1220',
      opacity: 1,
      textTransform: 'none',
    };
  }
  if (partial.kind === 'image' && partial.image) base.image = partial.image;
  if (partial.text) base.text = partial.text;
  return base;
}

function guessName(k: NodeKind): string {
  switch (k) {
    case 'frame':
      return 'Frame';
    case 'rect':
      return 'Rectangle';
    case 'ellipse':
      return 'Ellipse';
    case 'triangle':
      return 'Triangle';
    case 'line':
      return 'Line';
    case 'polygon':
      return 'Polygon';
    case 'star':
      return 'Star';
    case 'text':
      return 'Text';
    case 'image':
      return 'Image';
    case 'path':
      return 'Vector';
    case 'group':
      return 'Group';
  }
}

const newDoc = (w = 1280, h = 720): CanvasDocument => ({
  id: uid('doc'),
  name: 'Untitled Design',
  width: w,
  height: h,
  // A brand-new artboard defaults to a white board on a light-gray
  // workspace, matching the chrome's own light theme (was a dark board on
  // a near-black workspace, matching the old dark chrome). Existing saved
  // documents keep whatever colors they were saved with — this only
  // affects documents created from now on.
  background: '#FFFFFF',
  workspace: '#EDEDF1',
  rootIds: [],
  nodes: {},
  history: { past: [], future: [] },
  comments: [],
});

type Listener = () => void;

class DocStore {
  doc: CanvasDocument = newDoc();
  selection: Selection = { ids: [], primary: null };
  tool: Tool = 'select';
  zoom = 1;
  panX = 0;
  panY = 0;
  activePageId: string | null = null;
  // Snap options live on the store so the StatusBar toggles can drive the
  // renderer's snapping (was: StatusBar kept local-only state that nothing
  // read). Snap defaults match snap.ts `defaultSnap`. Referentially stable
  // snapshot for useSyncExternalStore consumers.
  snap: { enabled: boolean; toCanvas: boolean; toNodes: boolean; toGrid: boolean; gridSize: number } = {
    enabled: true,
    toCanvas: true,
    toNodes: true,
    toGrid: false,
    gridSize: 8,
  };
  showGrid: boolean = false;

  // Cached snapshot for `useZoom`. `useSyncExternalStore` requires the
  // snapshot to be referentially stable when nothing has changed, so we
  // only rebuild this object when zoom/pan values actually change.
  private zoomSnapshot: { zoom: number; panX: number; panY: number } = { zoom: 1, panX: 0, panY: 0 };

  private listeners = new Set<Listener>();
  private paused = false;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Rehydrate the last-saved document before first render. We strip the
    // history array (see STORAGE_KEY note) and reset the selection. If the
    // stored doc fails a basic shape check we fall back to a fresh one.
    const restored = loadPersisted();
    if (restored) this.doc = restored;
  }

  getZoomSnapshot() {
    if (this.zoom !== this.zoomSnapshot.zoom || this.panX !== this.zoomSnapshot.panX || this.panY !== this.zoomSnapshot.panY) {
      this.zoomSnapshot = { zoom: this.zoom, panX: this.panX, panY: this.panY };
    }
    return this.zoomSnapshot;
  }

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  private emit() {
    if (this.paused) return;
    this.listeners.forEach((l) => l());
    this.schedulePersist();
  }

  /** Debounced auto-persist. Skipped on the server (no window). */
  private schedulePersist() {
    if (typeof window === 'undefined') return;
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      persistDocument(this.doc);
    }, PERSIST_DEBOUNCE_MS);
  }

  /** Flush any pending debounced write immediately (e.g. on `pagehide`). */
  flushPersist() {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    persistDocument(this.doc);
  }

  pause() {
    this.paused = true;
  }
  resume() {
    this.paused = false;
    this.emit();
  }

  /** Replace the document wholesale, clearing history (used for imports). */
  replace(doc: CanvasDocument) {
    this.doc = doc;
    this.doc.history = { past: [], future: [] };
    this.emit();
  }

  /**
   * Mutate via a producer so we can persist a single undo entry per user
   * action. We snapshot the *whole* document — fine at this scale; if perf
   * becomes a concern, swap for Immer patches keyed by node id.
   *
   * The snapshot pushed onto the stack always excludes `history` itself.
   * `history` lives *inside* `CanvasDocument`, so a naive
   * `JSON.stringify(this.doc)` would embed the document's own past/future
   * arrays in the new entry — which already embedded the entries before
   * them, and so on. Every commit would roughly double the doc's in-memory
   * size, and 20-30 ordinary edits (trivial in one session) would balloon
   * it to hundreds of megabytes and freeze the tab. `undo`/`redo` always
   * overwrite `history` on the restored doc with the live `{past, future}`
   * anyway (see below), so the embedded copy was never actually read —
   * stripping it before serializing changes nothing observable.
   */
  commit = (mutator: (draft: CanvasDocument) => void, opts: { history?: boolean; label?: string } = {}) => {
    const before = this.doc;
    const next: CanvasDocument = JSON.parse(JSON.stringify(this.doc));
    mutator(next);
    if (opts.history !== false) {
      const { history: _beforeHistory, ...beforeSnapshot } = before;
      next.history.past.push(JSON.stringify(beforeSnapshot));
      if (next.history.past.length > HISTORY_LIMIT) next.history.past.shift();
      next.history.future = [];
    }
    this.doc = next;
    this.emit();
  };

  undo = () => {
    const { past, future } = this.doc.history;
    if (past.length === 0) return;
    const prev = past.pop()!;
    const { history: _curHistory, ...currentSnapshot } = this.doc;
    future.push(JSON.stringify(currentSnapshot));
    this.doc = { ...JSON.parse(prev), history: { past, future } };
    this.emit();
  };

  redo = () => {
    const { past, future } = this.doc.history;
    if (future.length === 0) return;
    const next = future.pop()!;
    const { history: _curHistory, ...currentSnapshot } = this.doc;
    past.push(JSON.stringify(currentSnapshot));
    this.doc = { ...JSON.parse(next), history: { past, future } };
    this.emit();
  };

  setSelection = (ids: string[]) => {
    const filtered = ids.filter((id) => this.doc.nodes[id]);
    this.selection = { ids: filtered, primary: filtered[0] ?? null };
    this.emit();
  };

  setTool = (t: Tool) => {
    this.tool = t;
    this.emit();
  };

  setZoom = (z: number, panX?: number, panY?: number) => {
    this.zoom = Math.min(8, Math.max(0.05, z));
    if (typeof panX === 'number') this.panX = panX;
    if (typeof panY === 'number') this.panY = panY;
    this.emit();
  };

  setPan = (x: number, y: number) => {
    this.panX = x;
    this.panY = y;
    this.emit();
  };

  setSnap = (patch: Partial<{ enabled: boolean; toCanvas: boolean; toNodes: boolean; toGrid: boolean; gridSize: number }>) => {
    this.snap = { ...this.snap, ...patch };
    this.emit();
  };

  setShowGrid = (v: boolean) => {
    this.showGrid = v;
    this.emit();
  };

  /**
   * Add a comment pin. Not pushed onto the undo stack — an accidental
   * comment shouldn't consume a Ctrl+Z the user meant for a design edit,
   * matching how Figma treats comments as separate from design history.
   */
  addComment = (pin: CommentPin) => {
    this.commit((doc) => {
      doc.comments = [...(doc.comments ?? []), pin];
    }, { history: false });
  };
}

/* ---------- persistence helpers ---------- */

/**
 * Minimal runtime shape check so a corrupt / tampered localStorage value
 * never replaces the working doc with garbage. We only require the fields
 * the renderer + actions read unconditionally; everything else is optional.
 */
function isValidDocShape(d: unknown): d is CanvasDocument {
  if (!d || typeof d !== 'object') return false;
  const o = d as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.name === 'string' &&
    typeof o.width === 'number' &&
    typeof o.height === 'number' &&
    Array.isArray(o.rootIds) &&
    o.nodes !== null &&
    typeof o.nodes === 'object'
  );
}

function loadPersisted(): CanvasDocument | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isValidDocShape(parsed)) return null;
    // Never restore a stale undo stack — start fresh so the user's first
    // action after reload isn't a surprise undo of a half-saved state.
    parsed.history = { past: [], future: [] };
    // Docs persisted before comments moved into the document (previously
    // ephemeral component state) won't have this field — default it rather
    // than let every comment-reading call site handle `undefined`.
    if (!Array.isArray((parsed as any).comments)) parsed.comments = [];
    return parsed as CanvasDocument;
  } catch {
    return null;
  }
}

function persistDocument(doc: CanvasDocument): void {
  if (typeof window === 'undefined') return;
  try {
    // Strip history before writing — it can grow to HISTORY_LIMIT full doc
    // clones and bloats localStorage / risks quota errors. We persist only
    // the current state.
    const { history, ...rest } = doc;
    void history;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
  } catch {
    // Quota exceeded or storage disabled — best-effort, swallow. The user
    // keeps working in memory for this session.
  }
}

let _store: DocStore | null = null;
export function getStore(): DocStore {
  if (typeof window === 'undefined') {
    // SSR: return a single throwaway module-scoped instance so every SSR
    // render of a hypothetical consumer sees the same object (previously
    // this returned a fresh DocStore per call, which would have silently
    // broken any future eager import). The canvas itself is dynamically
    // imported with `ssr: false`, so this path is a safety net.
    if (!_ssrStore) _ssrStore = new DocStore();
    return _ssrStore;
  }
  if (!_store) _store = new DocStore();
  return _store;
}
let _ssrStore: DocStore | null = null;

export function useDocument(): CanvasDocument {
  return useSyncExternalStore(
    (l) => getStore().subscribe(l),
    () => getStore().doc,
  );
}

export function useSelection(): Selection {
  return useSyncExternalStore(
    (l) => getStore().subscribe(l),
    () => getStore().selection,
  );
}

export function useTool(): Tool {
  return useSyncExternalStore(
    (l) => getStore().subscribe(l),
    () => getStore().tool,
  );
}

// IMPORTANT: `getSnapshot` must return a *referentially stable* value when
// nothing has changed, otherwise `useSyncExternalStore` re-renders in an
// infinite loop. We cache the zoom/pan snapshot on the store and only
// replace it when the values actually change.
export function useZoom(): { zoom: number; panX: number; panY: number } {
  const store = getStore();
  return useSyncExternalStore(
    (l) => store.subscribe(l),
    () => store.getZoomSnapshot(),
  );
}

/** One-shot subscription for non-React code (e.g. canvas renderer). */
export function subscribe(listener: Listener) {
  return getStore().subscribe(listener);
}

/** Convenience for ad-hoc React-only consumers. */
export function useStoreTick() {
  const [, set] = useState(0);
  useEffect(() => {
    const unsub = subscribe(() => set((x) => x + 1));
    return () => { unsub(); };
  }, []);
}
