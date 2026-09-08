'use client';

import React, { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface WaveConfig {
  baseYPercent: number; // 0.0 to 1.0 (vertical center anchor)
  amplitude: number;     // px
  wavelength: number;    // px
  speed: number;         // radians per second (positive = flows to the right)
  phase: number;         // initial phase offset
  harmonicAmp: number;   // secondary harmonic amplitude
  harmonicRatio: number; // secondary harmonic frequency multiplier
  harmonicSpeed: number; // secondary harmonic speed
  strokeWidth: number;   // varied line thickness (e.g. 0.8px to 2.5px)
  color: string;         // passive slate rgba stroke color
  bioColor?: string;     // Pandora vibrant bioluminescent stroke color
  bioGlow?: string;      // Bloom shadow color
  bioCore?: string;      // Hot white-lavender core highlight
}

interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

function parseRgba(str: string): RGBA {
  const match = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d\.]+))?\)/);
  if (!match) return { r: 200, g: 200, b: 200, a: 0.5 };
  return {
    r: parseInt(match[1], 10),
    g: parseInt(match[2], 10),
    b: parseInt(match[3], 10),
    a: match[4] !== undefined ? parseFloat(match[4]) : 1.0,
  };
}

function lerpRgba(c1: RGBA, c2: RGBA, t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const r = Math.round(c1.r + (c2.r - c1.r) * clamped);
  const g = Math.round(c1.g + (c2.g - c1.g) * clamped);
  const b = Math.round(c1.b + (c2.b - c1.b) * clamped);
  const a = c1.a + (c2.a - c1.a) * clamped;
  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
}

/* Deterministic value noise with Ken Perlin's quintic smootherstep (C2 continuity)
 * eliminates sharp derivative acceleration kinks for silk-smooth contours. */
function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function vnoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  // Quintic smootherstep: 6t^5 - 15t^4 + 10t^3 (zero 1st & 2nd derivatives at boundaries)
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(x: number, y: number): number {
  let v = 0;
  let amp = 0.62;
  let f = 1;
  for (let o = 0; o < 3; o++) {
    v += amp * (vnoise(x * f, y * f) * 2 - 1);
    amp *= 0.42; // steeper roll-off to preserve smooth, sweeping elegance
    f *= 2.05;
  }
  return v; // ≈ -1..1
}

const DEFAULT_WAVES: WaveConfig[] = [
  // Wave 1: Primary Heavy Contour (Ascending sweep) -> Electric Pandora Violet / Lilac
  {
    baseYPercent: 0.58,
    amplitude: 14,
    wavelength: 520,
    speed: 0.72,
    phase: 0.4,
    harmonicAmp: 4,
    harmonicRatio: 2.1,
    harmonicSpeed: 1.1,
    strokeWidth: 2.4,
    color: 'rgba(226, 232, 240, 0.46)',
    bioColor: 'rgba(192, 132, 252, 0.95)',
    bioGlow: 'rgba(168, 85, 247, 0.95)',
    bioCore: 'rgba(245, 208, 254, 1.0)',
  },
  // Wave 2: Whisper-Thin Ripple (Fast drift) -> Radiant Pandora Aqua / Cyan
  {
    baseYPercent: 0.36,
    amplitude: 8,
    wavelength: 310,
    speed: 1.38,
    phase: 2.1,
    harmonicAmp: 2.5,
    harmonicRatio: 1.8,
    harmonicSpeed: 1.9,
    strokeWidth: 0.85,
    color: 'rgba(148, 163, 184, 0.28)',
    bioColor: 'rgba(216, 166, 87, 0.95)',
    bioGlow: 'rgba(198, 143, 61, 0.95)',
    bioCore: 'rgba(250, 240, 217, 1.0)',
  },
  // Wave 3: Medium Structural Harmonic -> Vivid Orchid / Neon Fuchsia
  {
    baseYPercent: 0.72,
    amplitude: 16,
    wavelength: 680,
    speed: 0.54,
    phase: 4.3,
    harmonicAmp: 5,
    harmonicRatio: 2.4,
    harmonicSpeed: 0.8,
    strokeWidth: 1.8,
    color: 'rgba(203, 213, 225, 0.38)',
    bioColor: 'rgba(232, 121, 249, 0.92)',
    bioGlow: 'rgba(217, 70, 239, 0.92)',
    bioCore: 'rgba(250, 232, 255, 1.0)',
  },
  // Wave 4: Crisp Crest -> White-Hot Celestial Cyan
  {
    baseYPercent: 0.24,
    amplitude: 9,
    wavelength: 260,
    speed: 1.62,
    phase: 1.2,
    harmonicAmp: 3,
    harmonicRatio: 2.0,
    harmonicSpeed: 2.1,
    strokeWidth: 1.15,
    color: 'rgba(226, 232, 240, 0.32)',
    bioColor: 'rgba(255, 255, 255, 0.98)',
    bioGlow: 'rgba(56, 189, 248, 0.95)',
    bioCore: 'rgba(255, 255, 255, 1.0)',
  },
  // Wave 5: Central Harmonic Stabilizer -> Luminous Ultramarine / Indigo-Lilac
  {
    baseYPercent: 0.46,
    amplitude: 11,
    wavelength: 410,
    speed: 0.94,
    phase: 5.7,
    harmonicAmp: 3.5,
    harmonicRatio: 1.9,
    harmonicSpeed: 1.4,
    strokeWidth: 2.0,
    color: 'rgba(148, 163, 184, 0.36)',
    bioColor: 'rgba(165, 180, 252, 0.92)',
    bioGlow: 'rgba(129, 140, 248, 0.9)',
    bioCore: 'rgba(224, 231, 255, 1.0)',
  },
];

/**
 * True if the point falls inside a rounded rectangle, corners included.
 * A plain bounding-box test lights the effect up while the cursor is still in
 * the dead space outside a rounded corner, which reads as the navbar reacting
 * before you have actually reached it.
 */
function insideRoundedRect(px: number, py: number, rect: DOMRect, radius: number): boolean {
  if (px < rect.left || px > rect.right || py < rect.top || py > rect.bottom) return false;
  const r = Math.min(radius, rect.width / 2, rect.height / 2);
  if (r <= 0) return true;
  // Clamp into the inner rect; anything there is inside outright, and what is
  // left is measured against the corner arc.
  const cx = Math.min(Math.max(px, rect.left + r), rect.right - r);
  const cy = Math.min(Math.max(py, rect.top + r), rect.bottom - r);
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

interface ProceduralWaveContourProps {
  className?: string;
  waves?: WaveConfig[];
  opacity?: number;
  /**
   * The element whose visible boundary gates the effect. The canvas is only a
   * strip inside the navbar, so testing against the canvas activates on the
   * wrong shape. Falls back to the canvas when not supplied.
   */
  hostRef?: React.RefObject<HTMLElement | null>;
  /** Smoke model: fbm turbulence advected horizontally (soot on a crosswind)
   *  and bent by the cursor. Off = the original harmonic sine model. */
  smoke?: boolean;
  /** Avatar-style bioluminescent vibrancy and bloom when cursor enters navbar. Default true. */
  glowOnHover?: boolean;
}

export function ProceduralWaveContour({
  className,
  waves = DEFAULT_WAVES,
  opacity = 0.55,
  hostRef,
  smoke = false,
  glowOnHover = true,
}: ProceduralWaveContourProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number | null>(null);

  // Precompute RGBA representations once to prevent runtime allocation in the 60fps loop
  const parsedWaves = React.useMemo(() => {
    return waves.map((w) => ({
      ...w,
      cIdle: parseRgba(w.color),
      cBio: parseRgba(w.bioColor || w.color),
      cGlow: parseRgba(w.bioGlow || 'rgba(168, 85, 247, 0.95)'),
      cCore: parseRgba(w.bioCore || w.bioColor || 'rgba(255, 255, 255, 1.0)'),
    }));
  }, [waves]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let width = (canvas.width = canvas.offsetWidth);
    let height = (canvas.height = canvas.offsetHeight);

    /* Cursor probe (smoke mode): lerped position + vertical wake, with an
     * influence that eases out once the pointer leaves the bar's area. */
    const pointer = {
      x: -9999,
      y: -9999,
      sx: -9999,
      sy: -9999,
      vy: 0,
      lastY: -9999,
      influence: 0,
      target: 0,
      lastMoveTime: performance.now(),
    };

    const startTime = performance.now();
    const FROZEN_T = 12.34; // reduced-motion: one authored instant of smoke

    const render = (elapsed: number) => {
      // Clear previous frame
      ctx.clearRect(0, 0, width, height);

      if (smoke) {
        // Immediate latch on first entry so the aura doesn't sweep across from -9999
        if (pointer.sx < -5000 && pointer.x > -5000) {
          pointer.sx = pointer.x;
          pointer.sy = pointer.y;
          pointer.lastY = pointer.y;
          pointer.vy = 0;
        } else {
          pointer.sx += (pointer.x - pointer.sx) * 0.16;
          pointer.sy += (pointer.y - pointer.sy) * 0.16;
          if (pointer.lastY > -5000) {
            pointer.vy += (pointer.y - pointer.lastY - pointer.vy) * 0.2;
            pointer.vy = Math.max(-15, Math.min(15, pointer.vy));
          }
          pointer.lastY = pointer.y;
        }

        // Phosphorescent excitation: swift ignition on hover (~150ms).
        // Lingering organic decay on exit or after 2.4s of mouse stillness (~850ms).
        const timeSinceMove = performance.now() - pointer.lastMoveTime;
        const isIdle = timeSinceMove > 2400;
        const effectiveTarget = isIdle ? 0 : pointer.target;

        const lerpRate = effectiveTarget > pointer.influence ? 0.14 : 0.032;
        pointer.influence += (effectiveTarget - pointer.influence) * lerpRate;
        if (pointer.influence < 0.0005) {
          pointer.influence = 0;
        }

        // Dynamically swell canvas opacity with smoothstep so it arrives smoothly at 0 without popping
        if (canvas) {
          const t = pointer.influence;
          const smoothT = t * t * (3 - 2 * t);
          const targetCanvasOpacity = opacity + (0.95 - opacity) * smoothT;
          canvas.style.opacity = targetCanvasOpacity.toFixed(3);
        }
      }

      // Overscan bounds: Extend calculations 40px beyond edges so tail ends are 100% hidden
      const startX = -40;
      const endX = width + 40;
      const step = 8; // refined control-point resolution for smooth Bézier splines

      parsedWaves.forEach((w) => {
        const baseY = height * w.baseYPercent;
        const k1 = (2 * Math.PI) / w.wavelength;
        const k2 = (2 * Math.PI) / (w.wavelength / w.harmonicRatio);

        // Smoke advection: horizontal drift px/s + per-line seed and evolve rate
        const drift = w.speed * 36;
        const seed = w.phase * 17.31;
        const evolve = elapsed * (0.14 + w.speed * 0.06) + w.phase;

        const points: { x: number; y: number }[] = [];

        for (let x = startX; x <= endX; x += step) {
          let y: number;
          if (smoke) {
            // Elegant fluid meander: silky low-frequency swell + subtle secondary contour
            const sx = (x - drift * elapsed) * 0.008 + seed;
            const swell = 0.72 + 0.42 * vnoise(sx * 0.5 + 31.7, evolve * 0.7);
            y =
              baseY +
              w.amplitude * 1.1 * swell * fbm(sx, evolve) +
              w.harmonicAmp * 0.75 * fbm(sx * 1.8 + 13.7, evolve * 1.4 + 7.3);

            // Smooth cursor wake deflection: contours gracefully part around the pointer
            if (pointer.influence > 0.0001) {
              const dx = x - pointer.sx;
              const dy0 = y - pointer.sy;
              const g = pointer.influence * Math.exp(-(dx * dx + dy0 * dy0) / 18000);
              const smoothPush = dy0 / (Math.abs(dy0) + 10);
              y += g * 24 * smoothPush + g * pointer.vy * 0.12;
            }
          } else {
            // Harmonic sine wave moving to the right
            const y1 = w.amplitude * Math.sin(k1 * x - w.speed * elapsed + w.phase);
            const y2 = w.harmonicAmp * Math.cos(k2 * x - w.harmonicSpeed * elapsed + w.phase * 1.5);
            y = baseY + y1 + y2;
          }

          points.push({ x, y });
        }

        if (points.length < 2) return;

        const t = pointer.influence;

        ctx.beginPath();
        ctx.lineWidth = w.strokeWidth * (1 + 0.3 * t);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Continuous Avatar bioluminescent styling with zero threshold cliff
        if (glowOnHover && t > 0 && w.bioColor) {
          const auraRadius = Math.max(width * 0.5, 360);
          const grad = ctx.createRadialGradient(
            pointer.sx,
            pointer.sy,
            12,
            pointer.sx,
            pointer.sy,
            auraRadius
          );

          // Every stop continuously blends with t down to w.cIdle (the resting color)
          grad.addColorStop(0, lerpRgba(w.cIdle, w.cCore, t));
          grad.addColorStop(0.32, lerpRgba(w.cIdle, w.cBio, t * 0.95));
          grad.addColorStop(0.68, lerpRgba(w.cIdle, w.cBio, t * 0.45));
          grad.addColorStop(1, w.color);
          ctx.strokeStyle = grad;

          if (w.bioGlow) {
            // Smooth quadratic ease for bloom shadow so it fades to 0 before disappearing
            ctx.shadowColor = lerpRgba({ ...w.cGlow, a: 0 }, w.cGlow, t);
            ctx.shadowBlur = Math.round(20 * (t * t));
          }
        } else {
          ctx.strokeStyle = w.color;
          ctx.shadowBlur = 0;
        }

        // Render with smooth Catmull-Rom to Cubic Bézier spline interpolation
        ctx.moveTo(points[0].x, points[0].y);

        const tension = 0.85; // Silky curvature factor
        const numSegments = points.length - 1;

        for (let i = 0; i < numSegments; i++) {
          const p0 = i > 0 ? points[i - 1] : points[0];
          const p1 = points[i];
          const p2 = points[i + 1];
          const p3 = i + 2 < points.length ? points[i + 2] : p2;

          // Compute cubic Bézier control points
          const cp1x = p1.x + ((p2.x - p0.x) / 6) * tension;
          const cp1y = p1.y + ((p2.y - p0.y) / 6) * tension;
          const cp2x = p2.x - ((p3.x - p1.x) / 6) * tension;
          const cp2y = p2.y - ((p3.y - p1.y) / 6) * tension;

          ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
        }

        ctx.stroke();

        // Second pass: Additive hot-white core filament for authentic Pandora bioluminescence
        // Scaled by t^2 so it gently evaporates to 0 alpha without any pop
        if (glowOnHover && t > 0.02 && w.bioCore) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.lineWidth = Math.max(0.7, w.strokeWidth * 0.4);
          const coreAlpha = (0.85 * t * t).toFixed(3);
          ctx.strokeStyle = `rgba(255, 255, 255, ${coreAlpha})`;
          ctx.shadowColor = lerpRgba({ ...w.cGlow, a: 0 }, w.cGlow, t * t);
          ctx.shadowBlur = Math.round(10 * (t * t));
          ctx.stroke();
          ctx.restore();
        }
      });
    };

    // Reduced-motion: no idle loop; re-render on demand (pointer/resize only).
    let queued = false;
    const queueRender = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        render(FROZEN_T);
      });
    };

    const handleResize = () => {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.offsetWidth;
      height = canvas.offsetHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      // Reset transform before scaling to prevent DPR accumulation
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reduce) queueRender();
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(handleResize) : null;
    if (resizeObserver) resizeObserver.observe(canvas);

    const onPointerMove = (e: PointerEvent) => {
      if (!smoke) return;
      pointer.lastMoveTime = performance.now();
      const r = canvas.getBoundingClientRect();
      pointer.x = e.clientX - r.left;
      pointer.y = e.clientY - r.top;

      // Gate on the navbar's real boundary. This previously tested the canvas
      // bounding box inflated by 15-20px, so the effect fired while the cursor
      // was still outside the bar; and because the bar is rounded, even an
      // unpadded box test would light up in the corner dead space.
      const host = hostRef?.current ?? canvas;
      const hostRect = host.getBoundingClientRect();
      const radius = parseFloat(getComputedStyle(host).borderTopLeftRadius) || 0;
      pointer.target = insideRoundedRect(e.clientX, e.clientY, hostRect, radius) ? 1 : 0;
      if (reduce) {
        // No continuous loop to converge the lerp: snap the probe instead.
        pointer.sx = pointer.x;
        pointer.sy = pointer.y;
        pointer.influence = pointer.target;
        queueRender();
      }
    };
    window.addEventListener('pointermove', onPointerMove);

    const onPointerLeave = () => {
      pointer.target = 0;
    };
    window.addEventListener('pointerleave', onPointerLeave);

    const onBlur = () => {
      pointer.target = 0;
    };
    window.addEventListener('blur', onBlur);

    const loop = (now: number) => {
      render((now - startTime) / 1000);
      animFrameRef.current = requestAnimationFrame(loop);
    };

    if (reduce) queueRender();
    else animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (resizeObserver) resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('blur', onBlur);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [parsedWaves, smoke, glowOnHover, opacity, hostRef]);

  return (
    <canvas
      ref={canvasRef}
      style={{ opacity }}
      className={cn(
        'pointer-events-none absolute inset-0 h-full w-full overflow-hidden will-change-transform',
        // Linear fade mask on left and right edges so lines dissolve seamlessly
        '[mask-image:linear-gradient(to_right,transparent_0%,black_6%,black_94%,transparent_100%)]',
        className
      )}
    />
  );
}
