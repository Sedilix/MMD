'use client';

import React, { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface Point {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  maxAge: number;
  size: number;
}

interface SpectralFluidCanvasProps {
  className?: string;
  intensity?: number;
}

export function SpectralFluidCanvas({
  className,
  intensity = 1.0,
}: SpectralFluidCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointsRef = useRef<Point[]>([]);
  const lastMouseRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    const addPoint = (x: number, y: number, vx: number, vy: number) => {
      const speed = Math.hypot(vx, vy);
      pointsRef.current.push({
        x,
        y,
        vx: vx * 0.25,
        vy: vy * 0.25,
        age: 0,
        maxAge: 45 + Math.min(speed * 0.9, 35),
        size: (30 + Math.min(speed * 0.65, 45)) * intensity,
      });
      if (pointsRef.current.length > 90) pointsRef.current.shift();
    };

    const handlePointerMove = (e: PointerEvent) => {
      const now = performance.now();
      const x = e.clientX;
      const y = e.clientY;

      if (lastMouseRef.current) {
        const dt = Math.max((now - lastMouseRef.current.time) / 1000, 0.016);
        const vx = (x - lastMouseRef.current.x) / dt;
        const vy = (y - lastMouseRef.current.y) / dt;

        // Interpolate points along the path for silky smooth continuity
        const dist = Math.hypot(x - lastMouseRef.current.x, y - lastMouseRef.current.y);
        const steps = Math.max(Math.floor(dist / 8), 1);
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const ix = lastMouseRef.current.x + (x - lastMouseRef.current.x) * t;
          const iy = lastMouseRef.current.y + (y - lastMouseRef.current.y) * t;
          addPoint(ix, iy, vx, vy);
        }
      }

      lastMouseRef.current = { x, y, time: now };
    };

    window.addEventListener('pointermove', handlePointerMove);

    // Initial ambient trigger so screen has life on load
    const startX = width * 0.5;
    const startY = height * 0.4;
    addPoint(startX, startY, 40, -20);
    addPoint(startX + 10, startY + 5, 30, -15);

    // Render loop
    const render = () => {
      // Obsidian clear
      ctx.fillStyle = '#01040c';
      ctx.fillRect(0, 0, width, height);

      // Additive screen blend mode for spectral light dispersion
      ctx.globalCompositeOperation = 'screen';

      const points = pointsRef.current;
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        p.age++;
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.94;
        p.vy *= 0.94;

        const progress = p.age / p.maxAge;
        if (progress >= 1) continue;

        const alpha = Math.sin(progress * Math.PI) * (1 - progress * 0.4);
        const radius = p.size * (1 + progress * 1.5);

        // 1. Fiery Amber / Red Wavelength (Expanding & Dispersing)
        const radG1 = ctx.createRadialGradient(
          p.x - p.vx * 0.09,
          p.y - p.vy * 0.09,
          0,
          p.x,
          p.y,
          radius * 1.25
        );
        radG1.addColorStop(0, `rgba(251, 146, 60, ${0.5 * alpha})`);
        radG1.addColorStop(0.45, `rgba(239, 68, 68, ${0.3 * alpha})`);
        radG1.addColorStop(0.8, `rgba(168, 85, 247, ${0.15 * alpha})`);
        radG1.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = radG1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius * 1.25, 0, Math.PI * 2);
        ctx.fill();

        // 2. Electric Cyan / Azure Wavelength (Focused Leading Edge)
        const radG2 = ctx.createRadialGradient(
          p.x + p.vx * 0.09,
          p.y + p.vy * 0.09,
          0,
          p.x,
          p.y,
          radius * 1.15
        );
        radG2.addColorStop(0, `rgba(216, 166, 87, ${0.65 * alpha})`);
        radG2.addColorStop(0.5, `rgba(59, 130, 246, ${0.35 * alpha})`);
        radG2.addColorStop(0.85, `rgba(147, 51, 234, ${0.15 * alpha})`);
        radG2.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = radG2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius * 1.15, 0, Math.PI * 2);
        ctx.fill();

        // 3. White-Hot Bloom Core
        const radCore = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius * 0.42);
        radCore.addColorStop(0, `rgba(255, 255, 255, ${0.98 * alpha})`);
        radCore.addColorStop(0.35, `rgba(224, 242, 254, ${0.7 * alpha})`);
        radCore.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = radCore;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius * 0.42, 0, Math.PI * 2);
        ctx.fill();
      }

      // Filter out completed points
      pointsRef.current = points.filter((p) => p.age < p.maxAge);
      ctx.globalCompositeOperation = 'source-over';

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('pointermove', handlePointerMove);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [intensity]);

  return (
    <canvas
      ref={canvasRef}
      className={cn('absolute inset-0 w-full h-full pointer-events-auto select-none', className)}
    />
  );
}
