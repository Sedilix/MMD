'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';

interface VoiceStateOrbProps {
  state?: VoiceState;
  size?: 'sm' | 'md' | 'lg' | 'xl' | number;
  className?: string;
  interactive?: boolean;
  onStateChange?: (nextState: VoiceState) => void;
  showStateLabel?: boolean;
  accentColor?: string; // default cyan
  iconSrc?: string; // e.g. '/cybrdeck-logo/cybrdeck_icon.png'
}

const SIZE_MAP = {
  sm: 36,
  md: 52,
  lg: 84,
  xl: 140,
};

/**
 * Particle Starburst Voice Orb
 *
 * Recreation of the reference demo (Jakub Wuzik, x.com/tojawuzik/status/
 * 2059026237599723933): a positionally static sphere of hundreds of radially
 * oriented ice-white sparkle streaks around an incandescent core, with a
 * steady cool blue-grey halo. All life is stochastic per-particle twinkle —
 * no macro motion, no breathing, no rotation at idle. Voice states modulate
 * the same particle language: listening brightens and breathes the halo,
 * thinking adds a slow angular drift, speaking sends radial brightness waves
 * out through the field.
 */

/* Deterministic RNG so the starburst is identical across re-renders */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Particle {
  ang: number; // radial direction
  r: number; // distance from center, fraction of sphere radius
  len: number; // streak length, fraction of sphere radius
  width: number; // stroke width in css px
  b: number; // base brightness
  phase: number;
  speed: number; // twinkle speed (rad/s)
  tint: number; // 0 = white, 1 = ice blue
}

function buildParticles(count: number, seed: number): Particle[] {
  const rnd = mulberry32(seed);
  const ps: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const shell = rnd() < 0.72;
    ps.push({
      ang: rnd() * Math.PI * 2,
      // outer shell biased toward the rim (crisp silhouette), inner field sparse
      r: shell ? 0.55 + 0.45 * Math.sqrt(rnd()) : 0.22 + 0.5 * rnd(),
      len: shell ? 0.09 + 0.15 * rnd() : 0.05 + 0.09 * rnd(),
      width: 0.8 + rnd() * 1.2,
      b: 0.45 + 0.55 * rnd(),
      phase: rnd() * Math.PI * 2,
      speed: 1.6 + rnd() * 3.2,
      tint: rnd(),
    });
  }
  return ps;
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [34, 211, 238];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function VoiceStateOrb({
  state = 'idle',
  size = 'md',
  className,
  interactive = false,
  onStateChange,
  showStateLabel = false,
  accentColor = '#d8a657',
  iconSrc,
}: VoiceStateOrbProps) {
  const pixelSize = typeof size === 'number' ? size : SIZE_MAP[size] || 52;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<VoiceState>(state);
  const redrawRef = useRef<() => void>(() => {});

  useEffect(() => {
    stateRef.current = state;
    redrawRef.current();
  }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const S = Math.round(pixelSize * 2.2); // room for the halo beyond the sphere
    canvas.width = Math.round(S * dpr);
    canvas.height = Math.round(S * dpr);
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const R = (pixelSize / 2) * 0.94 * dpr;

    const count = Math.max(60, Math.min(420, Math.round(pixelSize * 3)));
    const particles = buildParticles(count, 7);
    const [ar, ag, ab] = hexToRgb(accentColor);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coreDim = iconSrc ? 0.62 : 1; // let the suspended emblem read

    const t0 = performance.now();

    const draw = (now: number) => {
      const t = (now - t0) / 1000;
      const s = stateRef.current;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';

      // ── Steady cool halo (breathes only while listening) ──
      const haloScale = s === 'listening' ? 1 + 0.06 * Math.sin(t * 2.4) : 1;
      const haloR = R * 1.85 * haloScale;
      const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, haloR);
      halo.addColorStop(0, 'rgba(126,146,176,0.18)');
      halo.addColorStop(0.5, 'rgba(70,82,100,0.10)');
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // ── Incandescent core bloom ──
      const corePulse =
        s === 'speaking'
          ? 1 + 0.1 * Math.sin(t * 7.5)
          : s === 'listening'
          ? 1 + 0.05 * Math.sin(t * 4.8)
          : 1;
      const coreR = R * 0.42 * corePulse;
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
      core.addColorStop(0, `rgba(255,255,255,${0.95 * coreDim})`);
      if (s === 'idle') {
        core.addColorStop(0.45, `rgba(214,232,250,${0.5 * coreDim})`);
      } else {
        core.addColorStop(
          0.45,
          `rgba(${Math.round(214 * 0.6 + ar * 0.4)},${Math.round(
            232 * 0.6 + ag * 0.4
          )},${Math.round(250 * 0.6 + ab * 0.4)},${0.5 * coreDim})`
        );
      }
      core.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
      ctx.fill();

      // ── Radial sparkle streaks ──
      const rot = s === 'thinking' ? t * 0.22 : 0;
      for (const p of particles) {
        const tw = 0.5 + 0.5 * Math.sin(t * p.speed + p.phase);
        let a = (0.16 + 0.84 * tw * tw) * p.b;
        if (s === 'speaking') {
          const w = 0.5 + 0.5 * Math.sin(p.r * 6 - t * 5);
          a *= 1 + 0.55 * w * w * w;
        } else if (s === 'listening') {
          a *= 1.15;
        }
        if (a <= 0.02) continue;
        a = Math.min(1, a);
        const cr = Math.round(255 - (255 - 191) * p.tint);
        const cg = Math.round(255 - (255 - 217) * p.tint);
        const cb = Math.round(255 - (255 - 240) * p.tint);
        const a0 = p.ang + rot;
        const c = Math.cos(a0);
        const sn = Math.sin(a0);
        const rr = p.r * R;
        const ll = p.len * R;
        const x1 = cx + c * (rr - ll / 2);
        const y1 = cy + sn * (rr - ll / 2);
        const x2 = cx + c * (rr + ll / 2);
        const y2 = cy + sn * (rr + ll / 2);
        // soft bloom pass
        ctx.strokeStyle = `rgba(${cr},${cg},${cb},${(a * 0.22).toFixed(3)})`;
        ctx.lineWidth = p.width * dpr * 2.6;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        // bright streak pass
        ctx.strokeStyle = `rgba(${cr},${cg},${cb},${a.toFixed(3)})`;
        ctx.lineWidth = p.width * dpr;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    };

    let raf = 0;
    if (reduced) {
      // static starburst: one deterministic frame, redrawn on state change
      redrawRef.current = () => draw(t0 + 1700);
      redrawRef.current();
    } else {
      redrawRef.current = () => {};
      const loop = (now: number) => {
        draw(now);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }
    return () => cancelAnimationFrame(raf);
  }, [pixelSize, accentColor, iconSrc]);

  const cycleState = () => {
    if (!interactive || !onStateChange) return;
    const states: VoiceState[] = ['idle', 'listening', 'thinking', 'speaking'];
    const nextIdx = (states.indexOf(state) + 1) % states.length;
    onStateChange(states[nextIdx]);
  };

  const canvasSize = Math.round(pixelSize * 2.2);

  return (
    <div
      onClick={cycleState}
      className={cn(
        'relative inline-flex flex-col items-center justify-center select-none',
        interactive && 'cursor-pointer group',
        className
      )}
      style={{ width: pixelSize, height: pixelSize }}
    >
      {/* Particle starburst sphere + core bloom + halo */}
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{ width: canvasSize, height: canvasSize }}
      />

      {/* Optional Cybrdeck emblem suspended in the core */}
      {iconSrc && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div
            className="relative flex items-center justify-center"
            style={{
              width: Math.round(pixelSize * 0.46),
              height: Math.round(pixelSize * 0.46),
            }}
          >
            <Image
              src={iconSrc}
              alt="Cybrdeck emblem"
              width={Math.round(pixelSize * 0.46)}
              height={Math.round(pixelSize * 0.46)}
              priority
              className="h-full w-full object-contain opacity-95 drop-shadow-[0_0_6px_rgba(140,200,255,0.5)]"
            />
          </div>
        </div>
      )}

      {/* Optional State Label */}
      {showStateLabel && (
        <span className="mt-2 text-[10px] font-medium tracking-wide text-zinc-400">
          {state}
        </span>
      )}
    </div>
  );
}
