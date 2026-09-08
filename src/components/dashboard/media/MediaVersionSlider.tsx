'use client';

/**
 * Version history scrubber for a media asset — Phase 2.5.
 *
 * Every regeneration adds a version, and the point of keeping them is
 * that "the third one was better" is a thing people say constantly.
 * This makes stepping back a click rather than a re-render.
 *
 * Two things it is careful about:
 *
 *   - **Reverting is not regenerating.** Selecting an earlier version
 *     moves a pointer; it spends nothing and creates nothing. The UI
 *     says so, because a slider that silently costs credits is a slider
 *     people stop touching.
 *   - **The retention cap is visible.** Versions past the cap are
 *     genuinely gone, not hidden, so the control shows what is retained
 *     rather than implying a full history it cannot deliver.
 */

import React from 'react';
import { cn } from '@/lib/utils';

export interface MediaVersionSummary {
    version: number;
    storageUrl: string;
    prompt: string;
    editInstruction?: string;
    model: string;
    createdAt: string;
    createdBy: string;
}

export interface MediaVersionSliderProps {
    versions: MediaVersionSummary[];
    currentVersion: number;
    /** Fired when the operator picks a different version. */
    onSelect: (version: number) => void;
    /** True while a revert request is in flight. */
    busy?: boolean;
    /** Retention cap, for the "oldest pruned" hint. */
    maxVersions?: number;
    className?: string;
}

function relativeTime(iso: string): string {
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '';
    const seconds = Math.round((Date.now() - then) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.round(hours / 24)}d ago`;
}

export function MediaVersionSlider({
    versions,
    currentVersion,
    onSelect,
    busy = false,
    maxVersions = 10,
    className,
}: MediaVersionSliderProps) {
    if (versions.length === 0) {
        return (
            <p className={cn('text-[11px] text-foreground/50', className)}>
                No renders yet.
            </p>
        );
    }

    const ordered = [...versions].sort((a, b) => a.version - b.version);
    const active = ordered.find((v) => v.version === currentVersion) ?? ordered[ordered.length - 1];
    const oldestRetained = ordered[0].version;
    const somethingPruned = oldestRetained > 1;

    return (
        <div className={cn('space-y-2', className)}>
            <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] uppercase tracking-wider text-foreground/50">
                    Version history
                </span>
                <span className="text-[11px] text-foreground/50">
                    v{active.version} of {ordered[ordered.length - 1].version}
                </span>
            </div>

            <div
                className="flex flex-wrap items-center gap-1"
                role="radiogroup"
                aria-label="Media version"
            >
                {ordered.map((v) => {
                    const isActive = v.version === active.version;
                    return (
                        <button
                            key={v.version}
                            type="button"
                            role="radio"
                            aria-checked={isActive}
                            disabled={busy}
                            onClick={() => !isActive && onSelect(v.version)}
                            title={
                                v.editInstruction
                                    ? `v${v.version} — ${v.editInstruction}`
                                    : `v${v.version} — original render`
                            }
                            className={cn(
                                'min-w-[2.25rem] rounded border px-2 py-1 font-mono text-[11px] transition-colors',
                                isActive
                                    ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                                    : 'border-border bg-card/50 text-foreground/70 hover:text-foreground hover:border-foreground/30',
                                busy && 'cursor-not-allowed opacity-60',
                            )}
                        >
                            v{v.version}
                        </button>
                    );
                })}
            </div>

            <dl className="space-y-1 text-[11px] text-foreground/60">
                <div className="flex gap-2">
                    <dt className="shrink-0 text-foreground/40">Rendered</dt>
                    <dd className="font-mono">
                        {active.model} · {relativeTime(active.createdAt)} ·{' '}
                        {active.createdBy === 'one' ? 'by One' : 'by admin'}
                    </dd>
                </div>
                {active.editInstruction && (
                    <div className="flex gap-2">
                        <dt className="shrink-0 text-foreground/40">Feedback</dt>
                        <dd className="italic">&ldquo;{active.editInstruction}&rdquo;</dd>
                    </div>
                )}
                <div className="flex gap-2">
                    <dt className="shrink-0 text-foreground/40">Prompt</dt>
                    <dd className="line-clamp-2">{active.prompt}</dd>
                </div>
            </dl>

            <p className="text-[10px] text-foreground/40">
                Switching versions costs nothing — it moves a pointer and does not re-render.
                {somethingPruned &&
                    ` Only the last ${maxVersions} renders are kept; v1–v${oldestRetained - 1} have been deleted.`}
            </p>
        </div>
    );
}

export default MediaVersionSlider;
