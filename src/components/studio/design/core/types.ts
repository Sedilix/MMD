/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Design Canvas — Shared Type Definitions
 *
 * Unified type contracts between the canvas engine, the layers panel, the
 * properties panel and the toolbar. These types model the Figma "design node"
 * concept: every drawable thing on the canvas is a `CanvasNode` with a
 * stable `id`, hierarchical `parentId` and a discriminated `kind`.
 */

export type NodeKind =
  | 'frame'
  | 'rect'
  | 'ellipse'
  | 'triangle'
  | 'line'
  | 'polygon'
  | 'star'
  | 'text'
  | 'image'
  | 'path'
  | 'group';

export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion';

export interface Fill {
  type: 'solid' | 'linear-gradient' | 'radial-gradient' | 'none';
  /** Hex / rgba string for solid, gradient stops for gradients. */
  value: string;
  /** 0..1 */
  opacity: number;
}

export interface Stroke {
  enabled: boolean;
  color: string;
  width: number;
  /** 'inside' | 'center' | 'outside' */
  align: 'center' | 'inside' | 'outside';
  /** [dash, gap, dash, gap, ...] */
  dashArray: number[];
  cap: 'butt' | 'round' | 'square';
  join: 'miter' | 'round' | 'bevel';
}

export interface Shadow {
  type: 'drop' | 'inner';
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: string;
  opacity: number;
}

export interface Effect {
  id: string;
  type: 'shadow' | 'blur' | 'glow';
  enabled: boolean;
  shadow?: Shadow;
  blur?: number;
}

export interface Geometry {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Rotation in degrees, clockwise */
  rotation: number;
  /** 'none' | 'x' | 'y' */
  flip: 'none' | 'x' | 'y';
  /** Corner radii in order: TL, TR, BR, BL (px). */
  radius: [number, number, number, number];
}

export interface Typography {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  align: 'left' | 'center' | 'right' | 'justify';
  lineHeight: number; // 1.0..3.0
  letterSpacing: number; // in px
  /** Hex */
  color: string;
  /** 0..1 */
  opacity: number;
  /** Uppercase / lowercase toggles. */
  textTransform: 'none' | 'uppercase' | 'lowercase';
}

export interface CanvasNode {
  id: string;
  kind: NodeKind;
  parentId: string | null;
  name: string;
  visible: boolean;
  locked: boolean;
  /** z-order among siblings, lower = behind */
  z: number;
  blend: BlendMode;
  /** 0..1 */
  opacity: number;
  geometry: Geometry;
  fill: Fill;
  stroke: Stroke;
  effects: Effect[];
  /** Text-specific */
  text?: Typography & { content: string };
  /** Image-specific */
  image?: {
    url: string;
    crop?: { x: number; y: number; w: number; h: number };
    tint?: string;
  };
  /** Children for group/frame */
  children?: string[];
  /** User-defined metadata */
  meta?: Record<string, unknown>;
}

export interface CanvasDocument {
  id: string;
  name: string;
  width: number;
  height: number;
  /** Background hex */
  background: string;
  /** Page colour (workspace) */
  workspace: string;
  rootIds: string[];
  nodes: Record<string, CanvasNode>;
  /** History for undo/redo */
  history: { past: string[]; future: string[] };
  /**
   * Comment pins. Previously lived only in a component's `useState` (see
   * DesignCanvasView), so unlike every other part of the document —
   * geometry, layers, artboard size — comments silently vanished on
   * refresh or on leaving Design Studio. They now round-trip through the
   * same commit/persist path as node edits.
   */
  comments: CommentPin[];
}

export interface Selection {
  ids: string[];
  primary: string | null;
}

export type Tool =
  | 'select'
  | 'move'
  | 'hand'
  | 'frame'
  | 'rect'
  | 'ellipse'
  | 'triangle'
  | 'line'
  | 'polygon'
  | 'star'
  | 'text'
  | 'pen'
  | 'comment';

export interface Cursor {
  /** clientId from the awareness layer */
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  tool?: Tool;
}

export interface CommentPin {
  id: string;
  x: number;
  y: number;
  author: string;
  text: string;
  resolved: boolean;
  createdAt: number;
}

export interface DesignCommand {
  id: string;
  label: string;
  /** Small icon name from coolicons set */
  icon?: string;
  shortcut?: string;
  run: (api: DesignAPI) => void | Promise<void>;
}

export interface DesignAPI {
  document: CanvasDocument;
  selection: Selection;
  setSelection: (ids: string[]) => void;
  updateNode: (id: string, patch: Partial<CanvasNode>) => void;
  addNode: (node: Partial<CanvasNode> & { kind: NodeKind }) => string;
  removeNodes: (ids: string[]) => void;
  group: (ids: string[]) => string | null;
  ungroup: (id: string) => void;
  reorder: (id: string, dir: 'front' | 'back' | 'forward' | 'backward') => void;
  duplicate: (ids: string[]) => string[];
  undo: () => void;
  redo: () => void;
  setZoom: (z: number) => void;
  zoomToFit: () => void;
  setTool: (t: Tool) => void;
}
