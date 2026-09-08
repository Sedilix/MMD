/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Design Canvas — Snapping & Smart Guides
 *
 * Pure functions for snapping a moving node to:
 *   - the artboard edges / centre
 *   - other nodes' edges / centres
 *   - a configurable pixel grid
 *
 * Returns the snapped `x/y` and a list of guides (x/y in canvas space) that
 * the renderer should draw as coloured dashed lines (Figma-style).
 */
'use client';

import type { CanvasDocument, CanvasNode } from './types';

export interface SnapResult {
  x: number;
  y: number;
  guides: { axis: 'x' | 'y'; value: number }[];
}

const SNAP_PX = 4;
const GUIDE_PX = 1.5;

export interface SnapOptions {
  enabled: boolean;
  toCanvas: boolean;
  toNodes: boolean;
  toGrid: boolean;
  gridSize: number;
}

export const defaultSnap: SnapOptions = {
  enabled: true,
  toCanvas: true,
  toNodes: true,
  toGrid: false,
  gridSize: 8,
};

interface SnapTarget {
  /** axis-aligned edges + center */
  xs: number[];
  ys: number[];
}

function collectTargets(doc: CanvasDocument, excludeIds: string[]): SnapTarget {
  const xs: number[] = [0, doc.width / 2, doc.width];
  const ys: number[] = [0, doc.height / 2, doc.height];

  Object.values(doc.nodes).forEach((n) => {
    if (excludeIds.includes(n.id)) return;
    if (n.kind === 'group') return; // groups don't contribute their own bbox until we want to
    const g = n.geometry;
    xs.push(g.x, g.x + g.w / 2, g.x + g.w);
    ys.push(g.y, g.y + g.h / 2, g.y + g.h);
  });
  return { xs, ys };
}

/**
 * Snap a moving node's next position to nearby targets.
 *
 * The snap threshold is expressed in **screen pixels** (`SNAP_PX`) and
 * converted to artboard space by dividing by `zoom`. This keeps the snap
 * feel consistent at any zoom level — at 200% a 6px screen threshold is
 * 3 artboard px, at 50% it's 12 artboard px — so the user always gets the
 * same "magnetism" on screen regardless of how far they've zoomed.
 */
export function snapMove(
  doc: CanvasDocument,
  node: CanvasNode,
  nextX: number,
  nextY: number,
  opts: SnapOptions = defaultSnap,
  zoom = 1,
): SnapResult {
  if (!opts.enabled) return { x: nextX, y: nextY, guides: [] };
  const target = collectTargets(doc, [node.id, ...(node.parentId ? [node.parentId] : [])]);

  const w = node.geometry.w;
  const h = node.geometry.h;
  const movingXs = [nextX, nextX + w / 2, nextX + w];
  const movingYs = [nextY, nextY + h / 2, nextY + h];

  // Screen-px threshold → artboard-px threshold.
  const threshold = SNAP_PX / Math.max(0.05, zoom);
  let bestDx = threshold + 0.001;
  let bestDy = threshold + 0.001;
  let snapX: number | null = null;
  let snapY: number | null = null;
  const guidesX: number[] = [];
  const guidesY: number[] = [];

  if (opts.toCanvas || opts.toNodes) {
    movingXs.forEach((mx) => {
      target.xs.forEach((tx) => {
        const dx = tx - mx;
        if (Math.abs(dx) < Math.abs(bestDx)) {
          bestDx = dx;
          snapX = tx;
        }
      });
    });
    movingYs.forEach((my) => {
      target.ys.forEach((ty) => {
        const dy = ty - my;
        if (Math.abs(dy) < Math.abs(bestDy)) {
          bestDy = dy;
          snapY = ty;
        }
      });
    });
  }

  let finalX = nextX;
  let finalY = nextY;
  if (snapX !== null && Math.abs(bestDx) <= threshold) {
    finalX = nextX + bestDx;
    guidesX.push(snapX);
  }
  if (snapY !== null && Math.abs(bestDy) <= threshold) {
    finalY = nextY + bestDy;
    guidesY.push(snapY);
  }

  if (opts.toGrid) {
    const g = Math.max(1, opts.gridSize);
    finalX = Math.round(finalX / g) * g;
    finalY = Math.round(finalY / g) * g;
  }

  return {
    x: finalX,
    y: finalY,
    guides: [
      ...guidesX.map((v) => ({ axis: 'x' as const, value: v })),
      ...guidesY.map((v) => ({ axis: 'y' as const, value: v })),
    ],
  };
}

export { GUIDE_PX, SNAP_PX };
