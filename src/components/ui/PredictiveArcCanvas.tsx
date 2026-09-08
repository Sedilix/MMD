'use client';

import React, { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * PredictiveArcCanvas — Variant: Signal Particles
 * 
 * Direct reference implementation from ThreeUI (neuform-isolated/signal-particles):
 * - Spacing: 16px micro-lattice pitch
 * - Dot radius: 1.5px crisp antialiased signal particles
 * - Dual-wave interference producing continuous diagonal fluid wavefront flow:
 *     wave1 = sin(nx + time * 0.5) * cos(ny - time * 0.3)
 *     wave2 = sin(nx * 0.5 - ny * 0.5 + time * 0.8)
 * - Deterministic signal highlights:
 *     highlightCheck > 0.98 -> #3b82f6 (Vivid Blue / Cyan)
 *     highlightCheck < -0.98 -> #8b5cf6 (Vivid Purple / Violet)
 *     standard -> rgba(148, 163, 184, alpha)
 * - Canvas 2D with High-DPI scaling & IntersectionObserver lifecycle
 */

export interface PredictiveArcCanvasProps {
  className?: string;
  variant?: 'signal-particles' | 'predictive' | 'data-pixel' | 'override-grid';
  mode?: 'dark' | 'light';
  speed?: number;
  spacing?: number;
  dotRadius?: number;
  opacity?: number;
  hue?: number;
}

export function PredictiveArcCanvas({
  className,
  variant = 'signal-particles',
  mode = 'dark',
  speed = 1.0,
  spacing = 16,
  dotRadius = 1.5,
  opacity = 0.9,
  hue = 0,
}: PredictiveArcCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let time = 0;
    let animId = 0;
    let running = false;
    let inView = true;

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    const resize = () => {
      const rect = container.getBoundingClientRect();
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));

      // Cap at 1.5 rather than 2: this canvas spans the full page height, so
      // on a 3x phone display a dpr-2 backing store is a multi-megapixel fill
      // every frame for a background the dots barely resolve at.
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Reduced motion draws one settled frame on every resize.
      if (motionQuery.matches) drawFrame();
    };

    const drawFrame = () => {
      ctx.clearRect(0, 0, width, height);

      // Phone-sized widths get a coarser lattice: the wave reads identically
      // at a wider pitch, and the per-frame dot count drops ~2.25x.
      const step = width < 640 ? Math.round(spacing * 1.5) : spacing;
      const cols = Math.floor(width / step);
      const rows = Math.floor(height / step);

      const offsetX = (width - cols * step) / 2;
      const offsetY = (height - rows * step) / 2;

      for (let i = 0; i <= cols; i++) {
        const nx = i * 0.1;
        const x = offsetX + i * step;

        for (let j = 0; j <= rows; j++) {
          const ny = j * 0.1;
          const y = offsetY + j * step;

          // ThreeUI Wave Equations:
          const wave1 = Math.sin(nx + time * 0.5) * Math.cos(ny - time * 0.3);
          const wave2 = Math.sin(nx * 0.5 - ny * 0.5 + time * 0.8);
          const value = wave1 + wave2;

          if (value > 0.1) {
            ctx.beginPath();
            ctx.arc(x, y, dotRadius, 0, Math.PI * 2);

            // Deterministic spatial hash for signal particle beacons
            const highlightCheck = Math.sin(i * 12.34) * Math.cos(j * 56.78);

            if (highlightCheck > 0.98) {
              // Glowing Blue / Cyan Signal Beacon
              ctx.fillStyle = '#3b82f6';
              ctx.shadowColor = '#3b82f6';
              ctx.shadowBlur = 6;
            } else if (highlightCheck < -0.98) {
              // Glowing Purple / Violet Signal Beacon
              ctx.fillStyle = '#8b5cf6';
              ctx.shadowColor = '#8b5cf6';
              ctx.shadowBlur = 6;
            } else {
              // Standard Ambient Halftone Signal Dot
              const alpha = Math.min(0.65, (value - 0.1) * 0.85) * opacity;
              ctx.fillStyle = `rgba(148, 163, 184, ${alpha})`;
              ctx.shadowBlur = 0;
            }

            ctx.fill();
          }
        }
      }

      // Reset shadow blur
      ctx.shadowBlur = 0;
    };

    const tick = () => {
      drawFrame();
      time += 0.02 * speed;
      animId = requestAnimationFrame(tick);
    };

    // Lifecycle follows the ThreeUI upstream: the rAF loop is fully cancelled
    // when the canvas scrolls out of view or the tab hides, not left spinning
    // an early-return — an idle loop on a page-tall canvas still costs.
    const start = () => {
      if (running || motionQuery.matches) return;
      running = true;
      animId = requestAnimationFrame(tick);
    };
    const stop = () => {
      if (!running) return;
      running = false;
      cancelAnimationFrame(animId);
      animId = 0;
    };

    const onMotionChange = () => {
      if (motionQuery.matches) {
        stop();
        drawFrame();
      } else if (inView && !document.hidden) {
        start();
      }
    };

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    const intersectionObserver = new IntersectionObserver(([entry]) => {
      inView = entry?.isIntersecting ?? true;
      if (inView && !document.hidden) start();
      else stop();
    });
    intersectionObserver.observe(container);

    const onVisibility = () => {
      if (document.hidden) stop();
      else if (inView) start();
    };
    document.addEventListener('visibilitychange', onVisibility);
    motionQuery.addEventListener('change', onMotionChange);

    if (motionQuery.matches) drawFrame();
    else start();

    return () => {
      stop();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      motionQuery.removeEventListener('change', onMotionChange);
    };
  }, [speed, spacing, dotRadius, opacity]);

  return (
    <div
      ref={containerRef}
      style={{ filter: hue ? `hue-rotate(${hue}deg)` : undefined }}
      className={cn(
        'pointer-events-none absolute inset-0 w-full h-full z-0 overflow-hidden will-change-transform',
        className
      )}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full block opacity-95 transition-opacity duration-700"
      />
    </div>
  );
}
