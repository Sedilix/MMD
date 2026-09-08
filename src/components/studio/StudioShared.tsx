'use client';

import React from 'react';
import { Icon } from '@/components/ui/icon';
import { Cpu } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Shared "Model used" badge for generated results across all five studios.
 *
 * Every studio route now echoes the model that produced the output (the image
 * route passes the requested model through on the client; video/music/outline
 * echo it in the success payload). Users always need to see which model made
 * the artifact they're looking at — recognition over recall, and it makes a
 * fallback or a wrong-model situation immediately visible instead of silent.
 *
 * Visual identity stays inside the existing neon-tinged dark world:
 * monospace label, subtle border, cyan/neutral tint. No new design system.
 */
export interface ModelUsedBadgeProps {
    /** Model id or display name. Falls back gracefully to whatever string is present. */
    model: string;
    /** Optional label prefix (e.g. "Engine"). Defaults to "Model". */
    label?: string;
    /** Optional extra detail to show after the model, e.g. an aspect ratio. */
    detail?: string;
    className?: string;
    /** When true, render at a slightly larger size for result-card footers. */
    size?: 'sm' | 'md';
}

export function ModelUsedBadge({
    model,
    label = 'Model',
    detail,
    className,
    size = 'sm',
}: ModelUsedBadgeProps) {
    if (!model) return null;
    const display = model.trim();
    if (!display) return null;
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-zinc-950/70 font-mono text-brand-300/90 select-none',
                size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-[11px]',
                className,
            )}
            // Title gives the full string on hover without crowding the badge.
            title={`${label}: ${display}${detail ? ` · ${detail}` : ''}`}
        >
            <Cpu className={size === 'sm' ? 'h-3 w-3 text-brand-400/80' : 'h-3.5 w-3.5 text-brand-400/80'} aria-hidden="true" />
            <span className="uppercase tracking-wider text-zinc-500">{label}</span>
            <span className="text-zinc-200">{display}</span>
            {detail && <span className="text-zinc-500">· {detail}</span>}
        </span>
    );
}

/**
 * Cancel button for long-running generation. Used by Image (multi-image batch)
 * and Video (multi-minute jobs). The caller owns the AbortController; this is
 * purely the affordance — a clearly labeled secondary control that sits next
 * to the generate button / loading state and is wired to `onCancel`.
 */
export interface CancelButtonProps {
    onCancel: () => void;
    /** Disable when there's nothing to cancel (defensive; caller usually hides instead). */
    disabled?: boolean;
    label?: string;
    className?: string;
}

export function CancelButton({ onCancel, disabled, label = 'Cancel', className }: CancelButtonProps) {
    return (
        <button
            type="button"
            onClick={onCancel}
            disabled={disabled}
            aria-label={label}
            className={cn(
                'inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-white/15 bg-zinc-950 text-xs font-semibold text-zinc-300 hover:text-white hover:border-white/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
                className,
            )}
        >
            <Icon name="close-md" className="h-3.5 w-3.5" aria-hidden="true" />
            {label}
        </button>
    );
}

/**
 * Inline loading region with `aria-live="polite"` so screen readers announce
 * generation start/progress. Operate surfaces keep feedback honest: name the
 * real operation, show determinate progress when available, else an indeterminate
 * bar with elapsed time. Never invent progress.
 */
export interface LoadingRegionProps {
    /** Short, honest label of the operation in progress, e.g. "Generating 2 of 4…" */
    label: string;
    /** Optional determinate progress 0..1. When omitted, renders an indeterminate bar. */
    progress?: number;
    /** Optional elapsed seconds string (e.g. "12s") to set an honest expectation. */
    elapsedLabel?: string;
    className?: string;
}

export function LoadingRegion({ label, progress, elapsedLabel, className }: LoadingRegionProps) {
    const hasProgress = typeof progress === 'number' && !Number.isNaN(progress) && progress >= 0;
    const pct = hasProgress ? Math.max(0, Math.min(100, Math.round((progress as number) * 100))) : null;
    return (
        <div
            role="status"
            aria-live="polite"
            className={cn('flex flex-col gap-2 select-none', className)}
        >
            <div className="flex items-center justify-between gap-3 text-xs text-zinc-300">
                <span className="flex items-center gap-2 font-medium">
                    <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-brand-400/40 border-t-brand-400 animate-spin" aria-hidden="true" />
                    {label}
                </span>
                {elapsedLabel && <span className="font-mono text-[10px] text-zinc-500">{elapsedLabel}</span>}
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                {pct != null ? (
                    <div
                        className="h-full rounded-full bg-brand-500 transition-all duration-300"
                        style={{ width: `${pct}%` }}
                    />
                ) : (
                    <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-brand-500 to-transparent animate-[indeterminate_1.4s_ease-in-out_infinite]" />
                )}
            </div>
        </div>
    );
}

/**
 * Inline error region with `aria-live="assertive"` so screen readers catch
 * failures immediately. Pairs a friendly per-code message (from
 * `resolveStudioError`) with an optional Retry action. Used by studios that
 * surface failures inline next to the output, in addition to the toast.
 */
export interface ErrorRegionProps {
    title: string;
    description: string;
    onRetry?: () => void;
    /** Optional secondary action label + handler. */
    secondaryAction?: { label: string; onClick: () => void };
    className?: string;
}

export function ErrorRegion({ title, description, onRetry, secondaryAction, className }: ErrorRegionProps) {
    return (
        <div
            role="alert"
            aria-live="assertive"
            className={cn(
                'flex flex-col gap-2 rounded-xl border border-rose-500/40 bg-rose-950/30 p-4 text-xs text-rose-100 select-none',
                className,
            )}
        >
            <div className="font-semibold text-rose-200">{title}</div>
            <div className="text-rose-200/90 leading-relaxed">{description}</div>
            {(onRetry || secondaryAction) && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                    {onRetry && (
                        <button
                            type="button"
                            onClick={onRetry}
                            className="h-7 px-3 rounded-md border border-rose-400/50 bg-rose-500/10 text-[11px] font-semibold text-rose-100 hover:bg-rose-500/20 transition-colors"
                        >
                            Retry
                        </button>
                    )}
                    {secondaryAction && (
                        <button
                            type="button"
                            onClick={secondaryAction.onClick}
                            className="h-7 px-3 rounded-md border border-white/20 bg-white/5 text-[11px] font-semibold text-zinc-200 hover:bg-white/10 transition-colors"
                        >
                            {secondaryAction.label}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}