'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ContourGlassButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  size?: 'sm' | 'default' | 'lg' | 'xl';
  variant?: 'primary' | 'secondary' | 'ghost' | 'glow';
  patternSeed?: number;
  /**
   * Hover effect language.
   * - 'iridescent' (default): static black pill at rest; on hover a liquid-light
   *   spectral ribbon ignites inside — warm white pool in the left cap, cool
   *   white pool in the right cap, rainbow filaments undulating between them,
   *   attracted to the cursor with spring lag, bloom leaking outside the pill.
   *   Intensity is capped at the "faded strands" level so individual
   *   filaments stay legible and the white label is never overpowered.
   *   Recreation of the reference demo (Jakub Wuzik, recent.design
   *   gb11uv7-iridescent-button-motion).
   * - 'elastic': legacy volumetric light-band (kept for the playground card).
   * - 'rim': spectral liquid-light confined to the pill perimeter — the
   *   iridescent ribbon orbits the edge instead of filling the face, so the
   *   label always sits on dark glass (pricing CTAs).
   */
  effect?: 'iridescent' | 'elastic' | 'rim';
  /**
   * Geometry shape:
   * - 'pill' (default): rounded-full stadium capsule
   * - 'rectangle': rounded-xl rectangular block button
   */
  shape?: 'pill' | 'rectangle';
}

/* ── Rim spectral ring ─────────────────────────────────────────────────────
 * Dispersion band plus an orbiting specular, after the iridescent-button
 * reference (recent.design eo2zyqk), adapted from that demo's circular icon
 * to the crystal-glass pill: the ring traces the button's whole outline and
 * its bloom leaks past the chassis instead of filling the face.
 *
 * The band itself never changes, so it is baked once into an offscreen buffer;
 * each frame only re-masks it with an envelope centred on the travelling
 * highlight and strokes three cached ring paths for the highlight itself.
 * That keeps a frame at roughly a dozen draw calls. Both the envelope and the
 * highlight are gradients rather than per-segment strokes on purpose —
 * stroking them segment by segment seams at every join and beads the band.
 */
const RIM = {
  PERIOD: 4.6, // seconds per orbit
  PAD: 30, // css px the canvas is inflated past the pill, so bloom can escape
  NF: 7, // filaments across the band
  BAND: 4.4, // band width, css px
  SPAN: 0.62, // spectrum traversed across the band
  HUEDRIFT: 1.3, // spectrum sweeps this many times around the rim
  GRATING: 2.4, // striation pitch, css px
  GRAT_A: 0.2, // striation contrast
  // filament lean. Kept incommensurate with GRATING: when the shear across the
  // band equals a whole striation period every filament peaks together and the
  // band beads into pearls instead of reading as a diagonal grating.
  SHEAR: 1.7,
  FIL_A: 0.42,
  FLOOR: 0.18, // band brightness on the unlit arc
  ENV_R: 2.4, // lit-arc radius, in button-heights
  HOTARC: 2.2, // specular length, in button-heights
  CORE_A: 1.0,
  CA_A: 0.55, // chromatic fringe either side of the white core
  PULL: 0.28, // how far the highlight leans toward the pointer
  BLOOM_OUT: 38,
  BLOOM_OUT_A: 0.13,
  BLOOM_IN: 17,
  BLOOM_IN_A: 0.44,
  BLOOM_STRETCH: 2.2, // bloom is stretched along the rim: light off an edge
};

const RIM_SPECTRUM: ReadonlyArray<readonly [number, number, number]> = [
  [255, 46, 66],
  [255, 132, 28],
  [255, 226, 92],
  [104, 255, 132],
  [56, 226, 255],
  [72, 120, 255],
  [176, 74, 255],
];

function rimSpectral(p: number): [number, number, number] {
  const q = p - Math.floor(p);
  const n = RIM_SPECTRUM.length;
  const f = q * n;
  const i = Math.floor(f) % n;
  const a = RIM_SPECTRUM[i];
  const b = RIM_SPECTRUM[(i + 1) % n];
  const k = f - Math.floor(f);
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

/** Wrap to [-0.5, 0.5): signed distance the short way round a unit loop. */
function rimWrap(x: number) {
  const f = x - Math.floor(x);
  return f > 0.5 ? f - 1 : f;
}

interface RimPoint {
  x: number;
  y: number;
  nx: number;
  ny: number;
}

/** Walk the pill or rounded-rectangle outline by arc length, in device pixels. */
function rimGeom(W: number, H: number, dpr: number, shape: 'pill' | 'rectangle' = 'pill') {
  const pad = RIM.PAD * dpr;
  const bw = W - 2 * pad;
  const bh = H - 2 * pad;
  const rr = shape === 'rectangle' ? Math.min(14 * dpr, bh / 2) : bh / 2;
  const straightW = Math.max(0, bw - 2 * rr);
  const straightH = Math.max(0, bh - 2 * rr);
  const cornerArc = (Math.PI / 2) * rr;
  const perim = 2 * straightW + 2 * straightH + 4 * cornerArc;

  const point = (d: number): RimPoint => {
    const t = perim > 0 ? ((d % perim) + perim) % perim : 0;
    // 1. Top edge (left to right)
    if (t < straightW) {
      return { x: pad + rr + t, y: pad, nx: 0, ny: -1 };
    }
    // 2. Top-right corner arc (-pi/2 to 0)
    let acc = straightW;
    if (t < acc + cornerArc) {
      const a = -Math.PI / 2 + (t - acc) / rr;
      return {
        x: pad + bw - rr + Math.cos(a) * rr,
        y: pad + rr + Math.sin(a) * rr,
        nx: Math.cos(a),
        ny: Math.sin(a),
      };
    }
    // 3. Right edge (top to bottom)
    acc += cornerArc;
    if (t < acc + straightH) {
      return { x: pad + bw, y: pad + rr + (t - acc), nx: 1, ny: 0 };
    }
    // 4. Bottom-right corner arc (0 to pi/2)
    acc += straightH;
    if (t < acc + cornerArc) {
      const a = (t - acc) / rr;
      return {
        x: pad + bw - rr + Math.cos(a) * rr,
        y: pad + bh - rr + Math.sin(a) * rr,
        nx: Math.cos(a),
        ny: Math.sin(a),
      };
    }
    // 5. Bottom edge (right to left)
    acc += cornerArc;
    if (t < acc + straightW) {
      return { x: pad + bw - rr - (t - acc), y: pad + bh, nx: 0, ny: 1 };
    }
    // 6. Bottom-left corner arc (pi/2 to pi)
    acc += straightW;
    if (t < acc + cornerArc) {
      const a = Math.PI / 2 + (t - acc) / rr;
      return {
        x: pad + rr + Math.cos(a) * rr,
        y: pad + bh - rr + Math.sin(a) * rr,
        nx: Math.cos(a),
        ny: Math.sin(a),
      };
    }
    // 7. Left edge (bottom to top)
    acc += cornerArc;
    if (t < acc + straightH) {
      return { x: pad, y: pad + bh - rr - (t - acc), nx: -1, ny: 0 };
    }
    // 8. Top-left corner arc (pi to 3pi/2)
    acc += straightH;
    const a = Math.PI + (t - acc) / rr;
    return {
      x: pad + rr + Math.cos(a) * rr,
      y: pad + rr + Math.sin(a) * rr,
      nx: Math.cos(a),
      ny: Math.sin(a),
    };
  };
  return { bh, perim, point };
}

/** The unlit spectral band. Rendered once per geometry, not per frame. */
function bakeRimBand(W: number, H: number, dpr: number, shape: 'pill' | 'rectangle' = 'pill'): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const { perim, point } = rimGeom(W, H, dpr, shape);
  if (!ctx || perim <= 0) return c;
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'butt';
  const segs = Math.max(240, Math.round(perim / 1.5));
  const band = RIM.BAND * dpr;
  const gfreq = perim / (RIM.GRATING * dpr);
  ctx.lineWidth = (band / RIM.NF) * 1.6;
  for (let i = 0; i < RIM.NF; i++) {
    const fi = i / (RIM.NF - 1);
    const shear = (fi - 0.5) * RIM.SHEAR * dpr;
    const off = (fi - 0.5) * band;
    let prev: { x: number; y: number } | null = null;
    for (let k = 0; k <= segs; k++) {
      const u = k / segs;
      const p = point(u * perim + shear);
      const cur = { x: p.x + p.nx * off, y: p.y + p.ny * off };
      if (prev) {
        const g = 1 - RIM.GRAT_A + RIM.GRAT_A * Math.sin(u * 2 * Math.PI * gfreq);
        const [r, gg, b] = rimSpectral(fi * RIM.SPAN + RIM.HUEDRIFT * u);
        ctx.strokeStyle = `rgba(${r | 0},${gg | 0},${b | 0},${(RIM.FIL_A * g).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(cur.x, cur.y);
        ctx.stroke();
      }
      prev = cur;
    }
  }
  return c;
}

/** Ring outlines at fixed radial offsets, re-stroked every frame. */
function bakeRimPaths(W: number, H: number, dpr: number, shape: 'pill' | 'rectangle' = 'pill') {
  const { perim, point } = rimGeom(W, H, dpr, shape);
  const segs = 160;
  const mk = (off: number) => {
    const p = new Path2D();
    for (let k = 0; k <= segs; k++) {
      const q = point((k / segs) * perim);
      const x = q.x + q.nx * off * dpr;
      const y = q.y + q.ny * off * dpr;
      if (k === 0) p.moveTo(x, y);
      else p.lineTo(x, y);
    }
    p.closePath();
    return p;
  };
  return { core: mk(0), warm: mk(-1.5), cool: mk(1.5) };
}

/**
 * Iridescent Liquid-Light CTA Button
 *
 * Rest state: flat dark pill, 1px hairline border, zero animation.
 * Hover: ~200ms ignite of an inner clipped canvas ribbon that flows
 * autonomously (~5s loop) and sags toward the cursor with lerped spring lag;
 * hover-out fades ~300ms and the loop sleeps. Reduced motion freezes the
 * autonomous undulation (pointer dip + fade remain).
 */
export const ContourGlassButton = React.forwardRef<
  HTMLButtonElement,
  ContourGlassButtonProps
>(
  (
    {
      className,
      asChild = false,
      size = 'default',
      variant = 'secondary',
      shape = 'pill',
      // Declared for call-site compatibility; intentionally omitted from
      // the DOM spread so React never sees an unknown attribute.
      patternSeed: _patternSeed,
      effect = 'iridescent',
      children,
      onMouseMove,
      onMouseEnter,
      onMouseLeave,
      style,
      ...props
    },
    forwardedRef
  ) => {
    const innerRef = React.useRef<HTMLButtonElement | null>(null);
    const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

    // Merge forwarded ref with innerRef
    React.useImperativeHandle(forwardedRef, () => innerRef.current as HTMLButtonElement);

    const animRef = React.useRef<number | null>(null);
    const startLoopRef = React.useRef<() => void>(() => {});
    const stateRef = React.useRef({
      isHovered: false,
      targetX: 50,
      targetY: 50,
      currentX: 50,
      currentY: 50,
      intensity: 0,
      targetIntensity: 0,
      startTime: Date.now(),
    });

    const isIridescent = effect === 'iridescent';
    const isRim = effect === 'rim';
    const isElastic = effect === 'elastic';

    // ── Legacy elastic physics (CSS-var light-band, playground card) ──
    const updatePhysics = () => {
      const el = innerRef.current;
      const s = stateRef.current;

      s.currentX += (s.targetX - s.currentX) * 0.12;
      s.currentY += (s.targetY - s.currentY) * 0.12;
      s.intensity += (s.targetIntensity - s.intensity) * 0.08;

      const elapsed = Date.now() - s.startTime;
      const ripple = Math.sin(elapsed * 0.0035) * 8;
      const pulse = 1 + Math.sin(elapsed * 0.004) * 0.15;

      const activeX = s.currentX + (s.isHovered ? ripple : 0);

      if (el) {
        el.style.setProperty('--elastic-x', `${activeX.toFixed(2)}%`);
        el.style.setProperty('--elastic-y', `${s.currentY.toFixed(2)}%`);
        el.style.setProperty('--elastic-intensity', `${(s.intensity * pulse).toFixed(3)}`);
      }

      animRef.current = requestAnimationFrame(updatePhysics);
    };

    React.useEffect(() => {
      if (!isElastic) return;
      animRef.current = requestAnimationFrame(updatePhysics);
      return () => {
        if (animRef.current) cancelAnimationFrame(animRef.current);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isElastic]);

    // ── Iridescent liquid-light ribbon ──
    React.useEffect(() => {
      if (!isIridescent) return;
      const canvas = canvasRef.current;
      const el = innerRef.current;
      if (!canvas || !el) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const resize = () => {
        // offsetWidth/Height are layout-box sizes, immune to the 3D tilt /
        // flip transforms that make getBoundingClientRect lie on mount
        const cssW = el.offsetWidth;
        const cssH = el.offsetHeight;
        // Size and place the CSS box from the border box, not `inset-0`:
        // `100%` on an absolutely positioned child resolves against the
        // *padding* box, so a CSS-sized canvas comes out one border narrower
        // and shorter than its backing store. The ribbon then renders squashed
        // (~4% on a 48px pill) and a pixel high, so its horizontal layers stop
        // short of the pill's bottom curve and read as hard-edged slabs.
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;
        canvas.style.left = `${-el.clientLeft}px`;
        canvas.style.top = `${-el.clientTop}px`;
        canvas.width = Math.max(2, Math.round(cssW * dpr));
        canvas.height = Math.max(2, Math.round(cssH * dpr));
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(el);

      let raf = 0;
      let running = false;
      let tPrev = performance.now();
      let phase = 2.2;

      // procedural flow: traveling value-noise so the liquid advects
      // downstream (pattern moves left → right) instead of wobbling in place
      const hashN = (n: number) => {
        const s = Math.sin(n) * 43758.5453123;
        return s - Math.floor(s);
      };
      const vnoise = (x: number) => {
        const i = Math.floor(x);
        const f = x - i;
        const u = f * f * (3 - 2 * f);
        return hashN(i) + (hashN(i + 1) - hashN(i)) * u;
      };
      const fbm = (x: number) =>
        vnoise(x) * 0.6 + vnoise(x * 2.7 + 13.7) * 0.3 + vnoise(x * 6.1 + 41.3) * 0.1;

      const draw = () => {
        const w = canvas.width;
        const h = canvas.height;
        const s = stateRef.current;
        // hold at the faded-strand look: full intensity white-outs the body
        // and overpowers the label; ~45% keeps every filament legible
        const I = s.intensity * 0.45;
        ctx.clearRect(0, 0, w, h);
        if (I <= 0.01) return;
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';

        const t = phase;
        const cx = (s.currentX / 100) * w;
        const cy = (s.currentY / 100) * h;

        // Caps fill the rounded ends full-height; the rope rides just above a
        // white-hot bottom rim; the middle-top stays dark for the label.
        const lean = (cx - w * 0.5) * 0.05;
        const xL = h * 0.42 + lean; // cap pool anchors
        const xR = w - h * 0.42 + lean;
        const sag = (x: number) =>
          Math.exp(-(((x - cx) / (w * 0.24)) ** 2)) * (cy - h * 0.5) * 0.18;

        // traveling wave packets: localized bulges that run downstream so
        // the fluid visibly ripples instead of holding a stable shape
        const ripple = (x: number, tt: number) => {
          const p1 = ((tt * 0.22) % 1.3) - 0.15;
          const p2 = ((tt * 0.14 + 0.55) % 1.3) - 0.15;
          const p3 = ((tt * 0.3 + 0.9) % 1.3) - 0.15;
          const u = x / w;
          return (
            Math.exp(-(((u - p1) / 0.09) ** 2)) * 0.6 +
            Math.exp(-(((u - p2) / 0.14) ** 2)) * 0.4 +
            Math.exp(-(((u - p3) / 0.06) ** 2)) * 0.5
          );
        };

        // ── 1. white-hot bottom rim, full width ──
        const edge = ctx.createLinearGradient(0, h * 0.72, 0, h);
        edge.addColorStop(0, 'rgba(0,0,0,0)');
        edge.addColorStop(0.45, `rgba(120,200,255,${(0.16 * I).toFixed(3)})`);
        edge.addColorStop(0.8, `rgba(225,246,255,${(0.75 * I).toFixed(3)})`);
        edge.addColorStop(1, `rgba(255,255,255,${(0.98 * I).toFixed(3)})`);
        ctx.fillStyle = edge;
        ctx.fillRect(0, h * 0.72, w, h * 0.28);

        // ── 1b. molten fluid body: fills the lower half ──
        // fine segmentation: a coarse polyline facets into visible "cube"
        // ticks along the surface fringe at zoom / high-DPI
        //
        // The surface used to carry a carve — a dip the width of the measured
        // label, to hold the fluid off the text. It read as a notch cut to fit
        // the words. Instead the whole body now rests below the text baseline
        // and the caps climb harder, so the surface is one continuous curve
        // that happens to clear the label rather than a shape moulded to it.
        const segs = 140;
        const top: Array<{ x: number; y: number }> = [];
        for (let k = 0; k <= segs; k++) {
          const x = (w * k) / segs;
          const rise =
            Math.exp(-(((x - xL) / (h * 0.55)) ** 2)) +
            Math.exp(-(((x - xR) / (h * 0.55)) ** 2));
          const y = Math.min(
            h * 0.88,
            Math.max(
              h * 0.12,
              h * 0.72 - // rest below the label rather than dipping under it
                h * 0.47 * rise + // fluid climbs the rounded caps
                (fbm((x / w) * 3 - t * 0.45 + 7.3) - 0.5) * h * 0.09 +
                Math.sin((x / w) * 26 - t * 5.2) * h * 0.015 -
                ripple(x, t) * h * 0.05 +
                sag(x) * 0.6
            )
          );
          top.push({ x, y });
        }
        const traceTop = (dy: number) => {
          ctx.beginPath();
          for (let k = 0; k <= segs; k++) {
            const p = top[k];
            if (k === 0) ctx.moveTo(p.x, p.y + dy);
            else ctx.lineTo(p.x, p.y + dy);
          }
          ctx.stroke();
        };

        // ── fluid volume: spectral filaments flowing left → right ──
        const bodyPath = new Path2D();
        bodyPath.moveTo(0, top[0].y);
        for (let k = 1; k <= segs; k++) bodyPath.lineTo(top[k].x, top[k].y);
        bodyPath.lineTo(w, h);
        bodyPath.lineTo(0, h);
        bodyPath.closePath();

        // deep luminous base tint (never flat white, never black)
        const bodyG = ctx.createLinearGradient(0, h * 0.2, 0, h);
        bodyG.addColorStop(0, `rgba(25,60,140,${(0.35 * I).toFixed(3)})`);
        bodyG.addColorStop(1, `rgba(70,160,255,${(0.4 * I).toFixed(3)})`);
        ctx.fillStyle = bodyG;
        ctx.fill(bodyPath);

        // horizontal spectral sweeps: warm left → rainbow mid → cool right
        const mkSweep = (shift: number) => {
          const lg = ctx.createLinearGradient(0, 0, w, 0);
          const stops: Array<[number, number]> = [
            [0, 15 + shift],
            [0.16, 40 + shift],
            [0.34, 65 + shift * 0.5],
            [0.5, 140],
            [0.66, 190],
            [0.82, 215],
            [1, 235],
          ];
          for (const [p, hu] of stops)
            lg.addColorStop(p, `hsla(${hu},95%,62%,1)`);
          return lg;
        };
        const SWEEPS = [mkSweep(0), mkSweep(28), mkSweep(-14)];

        // 18 undulating filaments fill the volume with molten colour
        const FILS = 18;
        for (let i = 0; i < FILS; i++) {
          const f = 0.1 + (0.88 * i) / (FILS - 1);
          ctx.strokeStyle = SWEEPS[i % 3];
          ctx.globalAlpha =
            (0.26 +
              0.08 * Math.sin(i * 2.3) +
              0.07 * Math.sin(t * 2.1 + i * 0.9)) *
            I;
          ctx.lineWidth =
            h *
            (0.055 + 0.02 * Math.sin(i * 1.7) + 0.014 * Math.sin(t * 1.6 + i));
          ctx.beginPath();
          for (let k = 0; k <= segs; k++) {
            const p = top[k];
            const y =
              p.y +
              (h - p.y) * f +
              (fbm((p.x / w) * 4 - t * (0.5 + (i % 5) * 0.12) + i * 3.7) - 0.5) *
                h *
                (0.1 + 0.05 * Math.sin(t * 0.7 + i * 1.3)) +
              Math.sin((p.x / w) * 14 - t * 1.1 + i * 0.8) * h * 0.02 +
              Math.sin((p.x / w) * 30 - t * 6 + i) * h * 0.012 -
              ripple(p.x, t + i * 0.12) * h * 0.06 * f;
            if (k === 0) ctx.moveTo(p.x, y);
            else ctx.lineTo(p.x, y);
          }
          ctx.stroke();
        }
        ctx.globalAlpha = 1;

        // incandescent convergence: heat clipped to the fluid shape so the
        // caps glow as part of the flow, not as isolated balls
        ctx.save();
        ctx.clip(bodyPath);
        const heatL = ctx.createLinearGradient(0, 0, h * 1.5, 0);
        heatL.addColorStop(0, `rgba(255,255,255,${(0.95 * I).toFixed(3)})`);
        heatL.addColorStop(0.45, `rgba(255,190,90,${(0.55 * I).toFixed(3)})`);
        heatL.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = heatL;
        ctx.fillRect(0, 0, h * 1.5, h);
        const heatR = ctx.createLinearGradient(w, 0, w - h * 1.5, 0);
        heatR.addColorStop(0, `rgba(255,255,255,${(0.95 * I).toFixed(3)})`);
        heatR.addColorStop(0.45, `rgba(90,190,255,${(0.55 * I).toFixed(3)})`);
        heatR.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = heatR;
        ctx.fillRect(w - h * 1.5, 0, h * 1.5, h);
        const heatB = ctx.createLinearGradient(0, h * 0.55, 0, h);
        heatB.addColorStop(0, 'rgba(0,0,0,0)');
        heatB.addColorStop(1, `rgba(255,255,255,${(0.5 * I).toFixed(3)})`);
        ctx.fillStyle = heatB;
        ctx.fillRect(0, h * 0.55, w, h * 0.45);
        ctx.restore();

        // rainbow braid twisting through the mid-flow
        const BRAID = [350, 20, 55, 140, 190, 225, 310];
        for (let i = 0; i < BRAID.length; i++) {
          ctx.strokeStyle = `hsla(${BRAID[i]},95%,64%,${(0.4 * I).toFixed(3)})`;
          ctx.lineWidth = h * 0.028;
          ctx.beginPath();
          for (let k = 0; k <= segs; k++) {
            const u = k / segs;
            const p = top[k];
            const env = Math.pow(Math.sin(u * Math.PI), 0.6);
            const y =
              p.y +
              (h - p.y) * 0.45 +
              Math.sin(u * 6.5 + t * 1.15 + i * 2.1) * h * 0.09 * env +
              Math.sin(u * 11 - t * 0.8 + i * 1.3) * h * 0.05 * env +
              (fbm(u * 5 - t * 0.6 + i * 9.1) - 0.5) * h * 0.08 * env -
              ripple(p.x, t + i * 0.1) * h * 0.05 * env;
            if (k === 0) ctx.moveTo(p.x, y);
            else ctx.lineTo(p.x, y);
          }
          ctx.stroke();
        }

        // traveling glints: bright pulses riding the flow
        ctx.setLineDash([h * 0.6, w * 1.2]);
        for (let i = 0; i < 5; i++) {
          const f = 0.2 + i * 0.16;
          ctx.lineDashOffset = -((t * (0.1 + i * 0.03) + i * 0.21) % 1.8) * w;
          ctx.strokeStyle = `rgba(255,255,255,${(0.5 * I).toFixed(3)})`;
          ctx.lineWidth = h * 0.02;
          ctx.beginPath();
          for (let k = 0; k <= segs; k++) {
            const p = top[k];
            const y =
              p.y +
              (h - p.y) * f +
              Math.sin((p.x / w) * 9 - t * 1.4 + i * 2) * h * 0.03;
            if (k === 0) ctx.moveTo(p.x, y);
            else ctx.lineTo(p.x, y);
          }
          ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.lineDashOffset = 0;

        // dispersion fringe hugging the surface from above (stroke widths
        // kept ≥1 css px so subpixel AA can't dash them into blocks)
        const SHEEN = [0, 25, 55, 140, 190, 225];
        for (let i = 0; i < SHEEN.length; i++) {
          ctx.strokeStyle = `hsla(${SHEEN[i]},95%,62%,${(0.45 * I).toFixed(3)})`;
          ctx.lineWidth = h * 0.02;
          traceTop(-h * (0.012 + i * 0.014));
        }

        // incandescent surface line
        ctx.strokeStyle = `rgba(255,255,255,${(0.9 * I).toFixed(3)})`;
        ctx.lineWidth = h * 0.028;
        traceTop(0);

        // ── 2. right cap comb striations ──
        ctx.lineWidth = Math.max(1, h * 0.014);
        const yC = h * 1.17 + (cy - h * 0.5) * 0.08; // comb arc centre
        for (let k = 0; k < 10; k++) {
          const rr = h * (0.34 + k * 0.07);
          ctx.strokeStyle = `hsla(${203 + k * 3},95%,${72 - k * 1.6}%,${(
            0.14 * I
          ).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(
            xR - h * 0.05,
            yC,
            rr,
            -Math.PI * 0.52,
            -Math.PI * 0.08
          );
          ctx.stroke();
        }
      };

      const loop = (now: number) => {
        raf = 0;
        const s = stateRef.current;
        s.currentX += (s.targetX - s.currentX) * 0.12;
        s.currentY += (s.targetY - s.currentY) * 0.12;
        s.intensity += (s.targetIntensity - s.intensity) * 0.1;
        if (!reduced) phase += (now - tPrev) / 1000;
        tPrev = now;
        draw();
        if (s.isHovered || s.intensity > 0.01) {
          raf = requestAnimationFrame(loop);
        } else {
          running = false;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      };

      startLoopRef.current = () => {
        if (!running) {
          running = true;
          tPrev = performance.now();
          raf = requestAnimationFrame(loop);
        }
      };

      return () => {
        cancelAnimationFrame(raf);
        running = false;
        startLoopRef.current = () => {};
        ro.disconnect();
      };
    }, [isIridescent]);

    // ── Rim spectral ring (dispersion band + orbiting specular) ──
    React.useEffect(() => {
      if (!isRim) return;
      const canvas = canvasRef.current;
      const el = innerRef.current;
      if (!canvas || !el) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      const mask = document.createElement('canvas');
      let band: HTMLCanvasElement | null = null;
      let paths: ReturnType<typeof bakeRimPaths> | null = null;
      let bakeTimer: number | null = null;
      let geomW = 0;
      let geomH = 0;

      const resize = () => {
        // offsetWidth/Height are layout-box sizes, immune to the 3D tilt /
        // flip transforms that make getBoundingClientRect lie on mount
        const cssW = el.offsetWidth + RIM.PAD * 2;
        const cssH = el.offsetHeight + RIM.PAD * 2;
        const w = Math.max(2, Math.round(cssW * dpr));
        const h = Math.max(2, Math.round(cssH * dpr));
        // Size the CSS box from the same measurement as the backing store, and
        // offset by the border too: `left/top/100%` on an absolute child
        // resolve against the *padding* box, so a calc() sizing would stretch
        // the ring off the button's outline instead of tracing it.
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;
        canvas.style.left = `${-(RIM.PAD + el.clientLeft)}px`;
        canvas.style.top = `${-(RIM.PAD + el.clientTop)}px`;
        geomW = w;
        geomH = h;
        if (canvas.width === w && canvas.height === h && band) return;
        canvas.width = w;
        canvas.height = h;
        mask.width = w;
        mask.height = h;
        band = null;
        paths = null;
        // baking walks the rim once per filament; it only has to be ready by
        // the first hover, so keep it off the mount path
        if (bakeTimer !== null) window.clearTimeout(bakeTimer);
        bakeTimer = window.setTimeout(() => {
          bakeTimer = null;
          band = bakeRimBand(w, h, dpr, shape);
          paths = bakeRimPaths(w, h, dpr, shape);
        }, 0);
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(el);

      let raf = 0;
      let running = false;
      let tPrev = performance.now();
      let phase = 1.3;

      const draw = () => {
        const W = canvas.width;
        const H = canvas.height;
        const s = stateRef.current;
        const I = s.intensity;
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.clearRect(0, 0, W, H);
        if (I <= 0.01 || !band || !paths) return;
        // drawing into a backing store that no longer matches the CSS box
        // stretches the ring off the button's outline — skip until resize
        // catches up rather than render it wrong
        if (W !== geomW || H !== geomH) return;
        const { bh, perim, point } = rimGeom(W, H, dpr, shape);
        if (perim <= 0) return;

        // autonomous orbit, leaning toward the pointer
        const orbitU = reduced ? 0.08 : (phase / RIM.PERIOD) % 1;
        const pad = RIM.PAD * dpr;
        const px = pad + (s.currentX / 100) * (W - 2 * pad);
        const py = pad + (s.currentY / 100) * (H - 2 * pad);
        let nearU = orbitU;
        let nearD = Infinity;
        for (let k = 0; k < 48; k++) {
          const u = k / 48;
          const q = point(u * perim);
          const d = (q.x - px) ** 2 + (q.y - py) ** 2;
          if (d < nearD) {
            nearD = d;
            nearU = u;
          }
        }
        const du = rimWrap(nearU - orbitU);
        // fade the pull out near the antipode, where the short way round flips
        // sign and would snap the highlight across the pill
        const ease = 1 - Math.min(1, Math.max(0, (Math.abs(du) - 0.35) / 0.15));
        const headU = orbitU + du * RIM.PULL * ease;
        const headP = point(headU * perim);

        ctx.globalCompositeOperation = 'lighter';

        // ── bloom, stretched along the rim tangent ──
        const tangent = Math.atan2(-headP.nx, headP.ny);
        const bloom = (r: number, a: number, col: string) => {
          ctx.save();
          ctx.translate(headP.x, headP.y);
          ctx.rotate(tangent);
          ctx.scale(RIM.BLOOM_STRETCH, 1);
          const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * dpr);
          g.addColorStop(0, `rgba(${col},${a})`);
          g.addColorStop(0.35, `rgba(${col},${a * 0.3})`);
          g.addColorStop(0.7, `rgba(${col},${a * 0.06})`);
          g.addColorStop(1, `rgba(${col},0)`);
          ctx.fillStyle = g;
          ctx.fillRect(-W, -H, 2 * W, 2 * H);
          ctx.restore();
        };
        bloom(RIM.BLOOM_OUT, RIM.BLOOM_OUT_A * I, '175,205,255');
        bloom(RIM.BLOOM_IN, RIM.BLOOM_IN_A * I, '255,238,205');

        // ── band: a constant ambient ring, plus the lit arc revealed
        //    through a smooth envelope centred on the specular ──
        const mc = mask.getContext('2d');
        if (mc) {
          mc.globalCompositeOperation = 'source-over';
          mc.clearRect(0, 0, W, H);
          mc.drawImage(band, 0, 0);
          mc.globalCompositeOperation = 'destination-in';
          const env = mc.createRadialGradient(
            headP.x,
            headP.y,
            0,
            headP.x,
            headP.y,
            RIM.ENV_R * bh
          );
          env.addColorStop(0, 'rgba(255,255,255,1)');
          env.addColorStop(0.18, 'rgba(255,255,255,0.72)');
          env.addColorStop(0.45, 'rgba(255,255,255,0.3)');
          env.addColorStop(0.75, 'rgba(255,255,255,0.08)');
          env.addColorStop(1, 'rgba(255,255,255,0)');
          mc.fillStyle = env;
          mc.fillRect(0, 0, W, H);
        }
        ctx.globalAlpha = I * RIM.FLOOR;
        ctx.drawImage(band, 0, 0);
        ctx.globalAlpha = I;
        ctx.drawImage(mask, 0, 0);
        ctx.globalAlpha = 1;

        // ── specular: blown-out white core, warm inside / cool outside ──
        const hot = RIM.HOTARC * bh * 0.75;
        const rg = (col: string, stops: [number, number][]) => {
          const g = ctx.createRadialGradient(headP.x, headP.y, 0, headP.x, headP.y, hot);
          for (const [at, a] of stops) {
            g.addColorStop(at, `rgba(${col},${(a * I).toFixed(3)})`);
          }
          return g;
        };
        ctx.lineWidth = 3.0 * dpr;
        ctx.strokeStyle = rg('255,255,255', [
          [0, RIM.CORE_A],
          [0.22, RIM.CORE_A * 0.38],
          [0.55, RIM.CORE_A * 0.07],
          [1, 0],
        ]);
        ctx.stroke(paths.core);
        // the fringe peaks at the shoulders, where the spectrum splits either
        // side of the white core
        const fringe: [number, number][] = [
          [0, RIM.CA_A * 0.25],
          [0.3, RIM.CA_A],
          [0.75, RIM.CA_A * 0.1],
          [1, 0],
        ];
        ctx.lineWidth = 1.6 * dpr;
        ctx.strokeStyle = rg('255,206,130', fringe);
        ctx.stroke(paths.warm);
        ctx.strokeStyle = rg('150,222,255', fringe);
        ctx.stroke(paths.cool);
      };

      const loop = (now: number) => {
        raf = 0;
        const s = stateRef.current;
        s.currentX += (s.targetX - s.currentX) * 0.12;
        s.currentY += (s.targetY - s.currentY) * 0.12;
        s.intensity += (s.targetIntensity - s.intensity) * 0.1;
        const dt = Math.min(0.05, (now - tPrev) / 1000);
        tPrev = now;
        if (!reduced) phase += dt;
        draw();
        if (s.isHovered || s.intensity > 0.01) {
          raf = requestAnimationFrame(loop);
        } else {
          running = false;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      };

      startLoopRef.current = () => {
        if (!running) {
          running = true;
          tPrev = performance.now();
          raf = requestAnimationFrame(loop);
        }
      };

      return () => {
        cancelAnimationFrame(raf);
        if (bakeTimer !== null) window.clearTimeout(bakeTimer);
        running = false;
        startLoopRef.current = () => {};
        ro.disconnect();
      };
    }, [isRim, shape]);

    const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
      const el = innerRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        stateRef.current.targetX = ((e.clientX - rect.left) / rect.width) * 100;
        stateRef.current.targetY = ((e.clientY - rect.top) / rect.height) * 100;
      }
      onMouseMove?.(e);
    };

    const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
      stateRef.current.isHovered = true;
      stateRef.current.targetIntensity = 1;
      startLoopRef.current();
      onMouseEnter?.(e);
    };

    const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
      stateRef.current.isHovered = false;
      stateRef.current.targetIntensity = 0;
      stateRef.current.targetX = 50;
      stateRef.current.targetY = 50;
      onMouseLeave?.(e);
    };

    const sizeClasses = shape === 'rectangle'
      ? {
          sm: 'h-8 px-4 text-xs rounded-xl',
          default: 'h-10 px-5 text-xs font-medium rounded-xl',
          lg: 'h-11 px-6 text-sm font-semibold rounded-xl',
          xl: 'h-12 px-6 text-sm font-semibold rounded-xl',
        }[size]
      : {
          sm: 'h-8 px-4 text-xs rounded-full',
          default: 'h-10 px-5 text-xs font-medium rounded-full',
          lg: 'h-11 px-6 text-sm font-semibold rounded-full',
          xl: 'h-12 px-7 text-sm font-semibold rounded-full',
        }[size];

    const buttonClasses = cn(
      'relative inline-flex items-center justify-center gap-2 select-none whitespace-nowrap cursor-pointer',
      // inner ribbon must clip to the container; the rim ring leaks outside it
      !isRim && 'overflow-hidden',
      // Core chassis: dark obsidian glass with precision hairline + bevel
      'backdrop-blur-xl text-white font-medium',
      variant === 'secondary'
        ? 'bg-white/[0.04] border border-white/10 shadow-[0_4px_24px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.15)] hover:bg-white/[0.08] hover:border-white/25'
        : variant === 'ghost'
        ? 'bg-transparent border border-transparent hover:bg-white/[0.05] hover:border-white/10'
        : 'bg-[#060a12]/90 border border-white/15 shadow-[0_4px_24px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-1px_0_rgba(0,0,0,0.5)] hover:border-white/30 hover:shadow-[0_8px_32px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.35)]',
      // Physical press depression
      'active:scale-[0.96] active:translate-y-[1px] active:duration-75 active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.9),0_2px_8px_rgba(0,0,0,0.5)]',
      'transition-[transform,box-shadow,border-color,background-color] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/70',
      (isIridescent || isRim) && 'group',
      // Elastic volumetric light-band (legacy playground look only)
      isElastic &&
        'after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:transition-opacity after:duration-250',
      isElastic &&
        'after:bg-[radial-gradient(ellipse_55%_45%_at_var(--elastic-x,50%)_100%,rgba(255,255,255,0.95)_0%,rgba(253,224,71,0.75)_25%,rgba(56,189,248,0.5)_50%,transparent_85%),radial-gradient(ellipse_70%_70%_at_var(--elastic-x,50%)_90%,rgba(255,255,255,0.2)_0%,rgba(56,189,248,0.08)_40%,transparent_75%)]',
      isElastic && 'after:opacity-[calc(var(--elastic-intensity,0)*1)]',
      sizeClasses,
      className
    );

    const buttonStyle = isElastic
      ? {
          ['--elastic-x' as string]: '50%',
          ['--elastic-y' as string]: '50%',
          ['--elastic-intensity' as string]: '0',
          ...style,
        }
      : style;

    const inner = (content: React.ReactNode) => (
      <>
        {effect !== 'elastic' && (
          <>
            {/* Bloom leaking outside the pill: warm left, cool right.
                'rim' draws its own bloom on the canvas, travelling with the
                highlight, so a fixed box-shadow would fight it. */}
            {isIridescent && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                style={{
                  boxShadow:
                    '-28px 12px 56px -18px rgba(245,158,11,0.45), 28px 12px 56px -18px rgba(56,189,248,0.5), 0 6px 32px -8px rgba(150,190,255,0.25)',
                }}
              />
            )}
            {/* Liquid-light spectral ribbon. 'iridescent' is clipped by the
                pill; 'rim' is inflated past it so its bloom can escape — and
                its box is sized in JS from the same measurement the ring
                geometry uses, so the two can never disagree. */}
            <canvas
              ref={canvasRef}
              aria-hidden
              className="pointer-events-none absolute"
              // both effects size their own box in resize(), from the same
              // measurement their geometry uses
              style={{ left: 0, top: 0, width: 0, height: 0 }}
            />
          </>
        )}
        <span className="relative z-10 inline-flex items-center gap-2">{content}</span>
      </>
    );

    // asChild: clone the caller's element and merge our chassis onto it.
    // (Radix Slot accepts a single element child, so the decoration layers
    // have to be injected inside the cloned element instead of beside it.)
    if (asChild && React.isValidElement(children)) {
      const child = children as React.ReactElement<{
        className?: string;
        style?: React.CSSProperties;
        children?: React.ReactNode;
        ref?: React.Ref<HTMLElement>;
        onMouseMove?: React.MouseEventHandler<HTMLElement>;
        onMouseEnter?: React.MouseEventHandler<HTMLElement>;
        onMouseLeave?: React.MouseEventHandler<HTMLElement>;
      }>;
      return React.cloneElement(
        child,
        {
          ...props,
          ref: innerRef,
          className: cn(buttonClasses, child.props.className),
          style: { ...buttonStyle, ...child.props.style },
          onMouseMove: handleMouseMove,
          onMouseEnter: handleMouseEnter,
          onMouseLeave: handleMouseLeave,
        },
        inner(child.props.children)
      );
    }

    return (
      <button
        ref={innerRef}
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={buttonClasses}
        style={buttonStyle}
        {...props}
      >
        {inner(children)}
      </button>
    );
  }
);

ContourGlassButton.displayName = 'ContourGlassButton';
