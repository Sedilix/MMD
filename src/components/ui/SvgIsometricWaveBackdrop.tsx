'use client';

import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface SvgIsometricWaveBackdropProps {
  className?: string;
  intensity?: number;
}

export function SvgIsometricWaveBackdrop({
  className,
  intensity = 1.0,
}: SvgIsometricWaveBackdropProps) {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0, rawX: 720, rawY: 450 });
  const [isHovered, setIsHovered] = useState(false);
  const animFrameRef = useRef<number | null>(null);
  const timeRef = useRef(0);
  const [, setRenderTick] = useState(0);

  // 60fps wave elevation animation loop
  useEffect(() => {
    let lastTime = performance.now();

    const loop = (now: number) => {
      const delta = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;
      timeRef.current += delta * (isHovered ? 0.9 : 0.45);
      setRenderTick((v) => (v + 1) % 10000);
      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isHovered]);

  const handlePointerMove = (e: React.PointerEvent) => {
    const { clientX, clientY, currentTarget } = e;
    const rect = currentTarget.getBoundingClientRect();
    const nx = (clientX - rect.left) / rect.width - 0.5;
    const ny = (clientY - rect.top) / rect.height - 0.5;
    const rawSvgX = (clientX - rect.left) * (1440 / rect.width);
    const rawSvgY = (clientY - rect.top) * (900 / rect.height);

    setMousePos({ x: nx, y: ny, rawX: rawSvgX, rawY: rawSvgY });
    setIsHovered(true);
  };

  const handlePointerLeave = () => {
    setIsHovered(false);
    setMousePos((prev) => ({ ...prev, x: 0, y: 0 }));
  };

  // Full-Page Procedural Topographical Grid
  const cols = 48;
  const rows = 32;
  const cellWidth = 34;
  const sx = cellWidth * Math.cos(Math.PI / 6); // ~29.4px
  const sy = cellWidth * Math.sin(Math.PI / 6); // 17px
  const originX = 720;
  const originY = -30;

  const t = timeRef.current;
  const mx = mousePos.x * 3.5;
  const my = mousePos.y * 3.5;

  // Compute multi-octave 3D isometric topographical wave elevation
  const getPoint = (c: number, r: number) => {
    const dx = (c - cols / 2) / (cols / 2);
    const dy = (r - rows / 2) / (rows / 2);
    const distToCenter = Math.hypot(dx - mx, dy - my);

    // Multi-octave harmonic landscape
    const wave1 = Math.sin(c * 0.22 + t * 1.1) * Math.cos(r * 0.24 + t * 0.85);
    const wave2 = Math.sin((c * 0.18 + r * 0.26) - t * 1.2) * 0.75;
    const wave3 = Math.cos(c * 0.12 - r * 0.18 + t * 0.7) * 0.5;
    const diagonalRidge = Math.sin((c - r * 0.75) * 0.25 + t * 0.9) * 0.6;
    const cursorRipple = isHovered
      ? Math.exp(-distToCenter * 2.2) * Math.sin(distToCenter * 8 - t * 3.0) * 26
      : 0;

    const elevation = (wave1 * 22 + wave2 * 15 + wave3 * 10 + diagonalRidge * 12 + cursorRipple) * intensity;
    const screenX = originX + (c - r) * sx;
    const screenY = originY + (c + r) * sy - elevation;
    return { x: screenX, y: screenY, elevation };
  };

  // Horizontal Grid Lines across full mesh
  const horizontalPaths: string[] = [];
  for (let r = 0; r < rows; r++) {
    let d = '';
    for (let c = 0; c < cols; c++) {
      const p = getPoint(c, r);
      d += (c === 0 ? `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}` : ` L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
    }
    horizontalPaths.push(d);
  }

  // Vertical Grid Lines across full mesh
  const verticalPaths: string[] = [];
  for (let c = 0; c < cols; c++) {
    let d = '';
    for (let r = 0; r < rows; r++) {
      const p = getPoint(c, r);
      d += (r === 0 ? `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}` : ` L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
    }
    verticalPaths.push(d);
  }

  // Primary High-Visibility Topographical Ridge Isolines
  const primaryRidgeRows = [4, 9, 15, 21, 27];
  const secondaryRidgeCols = [8, 18, 28, 38];

  // Sweeping Smooth Topographical Elevation Splines
  const contourSplines: string[] = [];
  for (let i = 0; i < 5; i++) {
    const r = 5 + i * 5;
    let d = '';
    for (let c = 0; c < cols; c += 2) {
      const p = getPoint(c, r);
      d += (c === 0 ? `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}` : ` S ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
    }
    contourSplines.push(d);
  }

  return (
    <div
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className={cn(
        'pointer-events-auto absolute inset-0 overflow-hidden select-none bg-[#01040a]',
        className
      )}
    >
      {/* 1. Luminous Atmospheric Ambient Glows */}
      <div className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 w-[1000px] h-[550px] bg-gradient-to-b from-white/15 via-brand-400/[0.06] to-transparent rounded-full blur-3xl opacity-85" />
      <div className="pointer-events-none absolute top-1/4 right-0 w-[700px] h-[700px] bg-gradient-to-bl from-white/[0.08] via-transparent to-transparent rounded-full blur-3xl opacity-75" />
      <div className="pointer-events-none absolute bottom-0 left-0 w-[800px] h-[700px] bg-gradient-to-tr from-brand-500/[0.1] via-white/[0.04] to-transparent rounded-full blur-3xl opacity-80" />

      {/* Dynamic Cursor Light Spotlight */}
      {isHovered && (
        <div
          className="pointer-events-none absolute w-[550px] h-[550px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/[0.1] blur-3xl transition-transform duration-75 ease-out"
          style={{ left: mousePos.rawX, top: mousePos.rawY }}
        />
      )}

      {/* 2. Interactive High-Visibility Procedural Topographical Mesh */}
      <svg
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        className="w-full h-full opacity-90 transition-opacity duration-500"
      >
        <defs>
          {/* Base Grid Gradient */}
          <linearGradient id="whiteMeshGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(255, 255, 255, 0.38)" />
            <stop offset="50%" stopColor="rgba(255, 255, 255, 0.22)" />
            <stop offset="100%" stopColor="rgba(255, 255, 255, 0.35)" />
          </linearGradient>

          {/* Primary Topographical Ridge Brightness Gradient */}
          <linearGradient id="primaryRidgeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(255, 255, 255, 0.15)" />
            <stop offset="25%" stopColor="rgba(226, 232, 240, 0.85)" />
            <stop offset="50%" stopColor="rgba(255, 255, 255, 0.95)" />
            <stop offset="75%" stopColor="rgba(203, 213, 225, 0.8)" />
            <stop offset="100%" stopColor="rgba(255, 255, 255, 0.15)" />
          </linearGradient>

          {/* Secondary Cyan-Tipped Ridge */}
          <linearGradient id="accentRidgeGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(255, 255, 255, 0.7)" />
            <stop offset="50%" stopColor="rgba(216, 166, 87, 0.65)" />
            <stop offset="100%" stopColor="rgba(255, 255, 255, 0.2)" />
          </linearGradient>
        </defs>

        {/* Base Crisp White Isometric Mesh */}
        <g stroke="url(#whiteMeshGrad)" strokeWidth="0.95" fill="none">
          {horizontalPaths.map((d, i) => (
            <path key={`h-${i}`} d={d} />
          ))}
          {verticalPaths.map((d, i) => (
            <path key={`v-${i}`} d={d} />
          ))}
        </g>

        {/* High-Visibility Primary Topographical Ridge Curves */}
        <g fill="none">
          {primaryRidgeRows.map((r) => (
            <path
              key={`h-ridge-${r}`}
              d={horizontalPaths[r]}
              stroke="url(#primaryRidgeGrad)"
              strokeWidth="2.2"
            />
          ))}
          {secondaryRidgeCols.map((c) => (
            <path
              key={`v-ridge-${c}`}
              d={verticalPaths[c]}
              stroke="url(#accentRidgeGrad)"
              strokeWidth="1.8"
              strokeDasharray="6 4"
            />
          ))}
        </g>

        {/* Organic Flowing Topographical Splines */}
        <g fill="none">
          {contourSplines.map((d, i) => (
            <path
              key={`spline-${i}`}
              d={d}
              stroke="rgba(255, 255, 255, 0.45)"
              strokeWidth="1.4"
            />
          ))}
        </g>

        {/* Peripheral Registration Coordinates */}
        <g fill="rgba(255, 255, 255, 0.55)" fontSize="9" fontFamily="monospace" letterSpacing="0.12em">
          <text x="70" y="120">+ PROCEDURAL_TOPOGRAPHY // 37.77° N</text>
          <text x="70" y="138">ELEVATION_FIELD: HARMONIC_WAVE</text>
          <text x="1200" y="120">+ MONOCHROME_SURFACE // V2.0</text>
          <text x="1200" y="138">ISOLINE_RESOLUTION: ACTIVE</text>
        </g>
      </svg>

      {/* 3. Subtle Vignette (Lightened so background contours remain crisp and clearly visible) */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(1,4,10,0.15)_0%,rgba(1,4,10,0.45)_70%,#01040a_98%)]" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#01040a]/40 via-transparent to-[#01040a]/65" />
    </div>
  );
}
