'use client';

import { useState, useEffect, useRef } from 'react';
import { Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ModelRegistryEntry } from '@/lib/playground/types';
import { ThinkingDrawer } from './ThinkingDrawer';

const THOUGHT_LEVELS = [
    { value: 'none', label: 'OFF', color: 'text-white/60', glow: '' },
    { value: 'light', label: 'Light', color: 'text-brand-300', glow: 'shadow-[0_0_10px_rgba(216,166,87,0.4)]' },
    { value: 'standard', label: 'Std', color: 'text-brand-400', glow: 'shadow-[0_0_14px_rgba(216,166,87,0.55)]' },
    { value: 'xhigh', label: 'High', color: 'text-white', glow: 'shadow-[0_0_18px_rgba(216,166,87,0.7)]' },
];

interface Props {
    value: 'none' | 'light' | 'standard' | 'xhigh';
    onChange: (next: 'none' | 'light' | 'standard' | 'xhigh') => void;
    models: (ModelRegistryEntry | undefined)[];
}

export function ThinkingPowerSelector({ value, onChange, models }: Props) {
    const [drawerOpen, setDrawerOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const hasThinkingModel = models.some((m) => m && m.supportsReasoningEffort === true);
    if (!hasThinkingModel) return null;

    // DashScope models (Qwen, AMS third-party) use a boolean `enable_thinking`
    // toggle, not the OpenAI-style 4-level reasoning-effort ladder. When all
    // selected models are DashScope, we render a simple ON/OFF button instead
    // of the level selector so users aren't guessing what "Light" vs "High"
    // means for a binary parameter.
    const isDashScope = models.every((m) => m?.provider === 'alibaba');

    const isOn = value !== 'none';

    // Close drawer on outside click or Escape
    useEffect(() => {
        if (!drawerOpen) return;
        const onClick = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setDrawerOpen(false);
            }
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setDrawerOpen(false);
        };
        document.addEventListener('mousedown', onClick);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onClick);
            document.removeEventListener('keydown', onKey);
        };
    }, [drawerOpen]);

    // ── DashScope binary toggle ──────────────────────────────────────────
    if (isDashScope) {
        return (
            <div ref={containerRef} className="relative">
                <button
                    type="button"
                    onClick={() => onChange(isOn ? 'none' : 'standard')}
                    title={`Thinking: ${isOn ? 'ON' : 'OFF'} — click to toggle`}
                    className={cn(
                        'group/thk relative flex flex-col items-center justify-center gap-0.5 rounded-lg border px-2 py-1.5 h-[48px] sm:h-[56px] transition-all duration-300 cursor-pointer flex-shrink-0',
                        'bg-zinc-900/90 border-white/15 hover:border-brand-400/40',
                        isOn && 'shadow-[0_0_14px_rgba(216,166,87,0.55)] border-brand-400/60',
                    )}
                >
                    <span aria-hidden className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-brand-400/20 to-transparent transition-transform duration-700 ease-out group-hover/thk:translate-x-full" />
                    <span className="relative flex items-center gap-1">
                        <Zap className={cn('h-4 w-4 transition-colors', isOn ? 'text-brand-400' : 'text-white/60')} />
                        <span className={cn('text-[9px] font-bold tracking-wider transition-colors', isOn ? 'text-brand-400' : 'text-white/60')}>
                            {isOn ? 'ON' : 'OFF'}
                        </span>
                    </span>
                    <span className="relative text-[8px] text-white/40 uppercase tracking-widest">Thinking</span>
                </button>
            </div>
        );
    }

    // ── OpenAI-style 4-level ladder ──────────────────────────────────────
    const currentIdx = THOUGHT_LEVELS.findIndex((l) => l.value === value);
    const level = THOUGHT_LEVELS[currentIdx >= 0 ? currentIdx : 0];

    return (
        <div ref={containerRef} className="relative">
            <button
                type="button"
                onClick={() => setDrawerOpen((prev) => !prev)}
                title={`Thinking: ${level.label} — click to change`}
                className={cn(
                    'group/thk relative flex flex-col items-center justify-center gap-0.5 rounded-lg border px-2 py-1.5 h-[48px] sm:h-[56px] transition-all duration-300 cursor-pointer flex-shrink-0',
                    'bg-zinc-900/90 border-white/15 hover:border-brand-400/40',
                    level.glow,
                    drawerOpen && 'border-brand-400/60',
                )}
            >
                <span aria-hidden className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-brand-400/20 to-transparent transition-transform duration-700 ease-out group-hover/thk:translate-x-full" />
                <span className="relative flex items-center gap-1">
                    <Zap className={cn('h-4 w-4 transition-colors', level.color)} />
                    <span className={cn('text-[9px] font-bold tracking-wider transition-colors', level.color)}>{level.label}</span>
                </span>
                <span className="relative text-[8px] text-white/40 uppercase tracking-widest">Thinking</span>
            </button>

            <ThinkingDrawer
                value={value}
                onChange={onChange}
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
            />
        </div>
    );
}