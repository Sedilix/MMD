'use client';

import React, { useEffect, useRef, useState } from 'react';
import { buildScene, drawFrame, getCrownScreenBounds, type Scene, type TickerEntry } from './scene';
import { TowerCrown3D } from './TowerCrown3D';

interface TowerCanvasProps {
  className?: string;
  /** Lowers city density and animated-cell count. Set on small viewports. */
  quality?: 'high' | 'low';
  /** Horizontal placement of the tower, 0–1 across the canvas. */
  focusX?: number;
  /**
   * Fractional floor range to light up, 0 (ground) to 1 (roof). The band eases
   * in and out rather than snapping, so pointer movement across a list of
   * capabilities reads as the building responding, not as a flicker.
   */
  highlight?: { from: number; to: number } | null;
  /** Decoded partner logos to stream around the ticker floors. */
  partners?: TickerEntry[] | null;
}

/**
 * Hosts the procedural city scene.
 *
 * The scene is expensive to build and cheap to animate, so it is baked into an
 * offscreen canvas on mount and on settled resizes only; the frame loop just
 * blits that bitmap and redraws the handful of moving elements on top. The loop
 * is suspended whenever the hero scrolls out of view, and never starts at all
 * under `prefers-reduced-motion` — a single settled frame is drawn instead.
 */
export function TowerCanvas({
  className,
  quality = 'high',
  focusX = 0.5,
  highlight = null,
  partners = null,
}: TowerCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const rafRef = useRef<number | null>(null);
  const visibleRef = useRef(true);
  const highlightRef = useRef<TowerCanvasProps['highlight']>(null);
  const strengthRef = useRef(0);
  /**
   * Cursor position in canvas CSS pixels, and how faded-in the window-lighting
   * is. Position is kept after the cursor leaves so the pooled light can fade
   * out from where it was rather than vanishing.
   */
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const pointerStrengthRef = useRef(0);
  const pointerInsideRef = useRef(false);
  /** Last resolved band, kept so the glow can fade out after the pointer leaves. */
  const lastBandRef = useRef<{ from: number; to: number } | null>(null);
  const redrawRef = useRef<(() => void) | null>(null);
  const partnersRef = useRef<TickerEntry[] | null>(null);
  const [ready, setReady] = useState(false);
  const [crownBounds, setCrownBounds] = useState<{
    midX: number;
    midY: number;
    width: number;
    height: number;
    boxSize: number;
  } | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    partnersRef.current = partners;
    redrawRef.current?.();
  }, [partners]);

  useEffect(() => {
    highlightRef.current = highlight;
    // Under reduced motion there is no frame loop to pick this up, so the
    // highlight has to repaint itself.
    redrawRef.current?.();
  }, [highlight]);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reduced = motionQuery.matches;
    let start = 0;
    let resizeTimer: number | undefined;

    const render = (t: number | null) => {
      const scene = sceneRef.current;
      if (!scene) return;
      const want = highlightRef.current;

      // Ease the band's strength toward its target. Under reduced motion it
      // snaps, because there is no loop to animate it.
      const target = want ? 1 : 0;
      if (reduced) {
        strengthRef.current = target;
      } else {
        strengthRef.current += (target - strengthRef.current) * 0.16;
      }

      const s = strengthRef.current;
      const band =
        want && s > 0.001
          ? {
              from: Math.round(want.from * (scene.floorCount - 1)),
              to: Math.round(want.to * (scene.floorCount - 1)),
              strength: s,
            }
          : lastBandRef.current && s > 0.001
            ? { ...lastBandRef.current, strength: s }
            : null;

      if (want) lastBandRef.current = { from: band!.from, to: band!.to };

      // Same easing treatment as the floor band: `drawFrame` takes the strength
      // rather than deriving it, so the pooled light can keep fading from the
      // last known position after the cursor has already left the canvas.
      const pTarget = pointerInsideRef.current ? 1 : 0;
      if (reduced) {
        pointerStrengthRef.current = pTarget;
      } else {
        pointerStrengthRef.current += (pTarget - pointerStrengthRef.current) * 0.12;
      }
      const p = pointerRef.current;
      const pointer =
        p && pointerStrengthRef.current > 0.004
          ? { x: p.x, y: p.y, strength: pointerStrengthRef.current }
          : null;

      drawFrame(ctx, scene, t, band, partnersRef.current, pointer);
    };
    redrawRef.current = () => render(reduced ? null : (performance.now() - start) / 1000);

    const build = () => {
      const rect = host.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      // Cap DPR: past 2x the extra pixels are invisible and the bake cost is real.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;

      const scene = buildScene(w, h, dpr, { quality, focusX });
      sceneRef.current = scene;
      const bounds = getCrownScreenBounds(scene);
      setCrownBounds(bounds);
      setReady(true);
      render(reduced ? null : (performance.now() - start) / 1000);
    };

    const loop = (now: number) => {
      if (!start) start = now;
      if (visibleRef.current) render((now - start) / 1000);
      rafRef.current = requestAnimationFrame(loop);
    };

    const startLoop = () => {
      if (reduced || rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(loop);
    };

    const stopLoop = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };

    setReducedMotion(reduced);
    build();
    startLoop();

    // Rebuild only once a resize settles — the bake is far too costly to run
    // on every intermediate frame of a window drag.
    let lastW = host.getBoundingClientRect().width;
    let lastH = host.getBoundingClientRect().height;
    const ro = new ResizeObserver(() => {
      const r = host.getBoundingClientRect();
      // Mobile browsers fire a resize as the URL bar collapses; a pure height
      // change under ~120px is that, and rebaking on it causes a visible hitch.
      if (Math.abs(r.width - lastW) < 2 && Math.abs(r.height - lastH) < 120) return;
      lastW = r.width;
      lastH = r.height;
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(build, 180);
    });
    ro.observe(host);

    const io = new IntersectionObserver(
      ([entry]) => {
        visibleRef.current = entry.isIntersecting;
        if (entry.isIntersecting) startLoop();
        else stopLoop();
      },
      { rootMargin: '120px' },
    );
    io.observe(host);

    // Cursor tracking for the window-lighting pass.
    //
    // Listened for on the window rather than the canvas: the hero stacks copy,
    // buttons and the floor directory over this canvas, so canvas-local events
    // would cut out the moment the cursor crossed any of them — and the effect
    // is meant to follow the cursor across the whole hero. Coordinates are
    // converted into canvas CSS pixels, which is the space `scene.dormant`
    // stores its window centres in.
    const onPointerMove = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      pointerInsideRef.current = x >= 0 && x <= r.width && y >= 0 && y <= r.height;
      if (pointerInsideRef.current) pointerRef.current = { x, y };
      if (reduced) redrawRef.current?.();
    };
    const onPointerLeave = () => {
      pointerInsideRef.current = false;
      if (reduced) redrawRef.current?.();
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('pointerleave', onPointerLeave);

    const onMotionChange = () => {
      reduced = motionQuery.matches;
      setReducedMotion(reduced);
      if (reduced) {
        stopLoop();
        render(null);
      } else {
        start = 0;
        startLoop();
      }
    };
    motionQuery.addEventListener('change', onMotionChange);

    return () => {
      stopLoop();
      ro.disconnect();
      io.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerleave', onPointerLeave);
      motionQuery.removeEventListener('change', onMotionChange);
      window.clearTimeout(resizeTimer);
      redrawRef.current = null;
    };
  }, [quality, focusX]);

  return (
    <div ref={hostRef} className={`${className} relative will-change-transform`} aria-hidden="true">
      <canvas
        ref={canvasRef}
        className={
          'block h-full w-full transition-opacity duration-200 ' +
          (ready ? 'opacity-100' : 'opacity-0')
        }
      />
      {ready && crownBounds && (
        <div
          style={{
            position: 'absolute',
            left: `${crownBounds.midX - crownBounds.boxSize / 2}px`,
            top: `${crownBounds.midY - crownBounds.boxSize / 2}px`,
            width: `${crownBounds.boxSize}px`,
            height: `${crownBounds.boxSize}px`,
            pointerEvents: 'none',
          }}
        >
          {/* The crown refracts the cityscape it stands in front of, so it is
              handed this canvas and the exact region it covers. Same numbers
              as the wrapper's own offsets — they must not drift apart, or the
              refracted image steps sideways against the real skyline. */}
          <TowerCrown3D
            still={reducedMotion}
            sourceCanvas={canvasRef.current}
            sourceRect={{
              x: crownBounds.midX - crownBounds.boxSize / 2,
              y: crownBounds.midY - crownBounds.boxSize / 2,
              w: crownBounds.boxSize,
              h: crownBounds.boxSize,
            }}
          />
        </div>
      )}
    </div>
  );
}
