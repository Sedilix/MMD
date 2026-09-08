'use client';

/**
 * ChipRow — the capability-chip lane of the workbench prompt bar.
 *
 * Primary lane: AI-inferred chips (semantic inference over the draft prompt).
 * Fallback lane: static capability chips while inference is cold or rejected.
 * Toggled chips ride along as contract lines at send time; they never mutate
 * the textarea.
 */

import React from 'react';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { STATIC_CAPABILITY_CHIPS } from '@/lib/playground/prompt-chips';
import type { BuildSuggestion } from '@/lib/playground/types';

interface ChipRowProps {
    /** Chips inferred from the draft prompt; empty = fall back to static lane. */
    inferred: BuildSuggestion[];
    inferredLoading: boolean;
    /** Guests keep the static lane only — inference is signed-in-tier billed. */
    guestMode?: boolean;
    selectedStatic: string[];
    selectedInferred: string[];
    onToggleStatic: (id: string) => void;
    onToggleInferred: (title: string) => void;
}

const chipClass = (on: boolean): string => cn(
    'px-2.5 py-1 rounded-full border text-[11px] font-medium transition-all whitespace-nowrap',
    on
        ? 'bg-brand-500/20 border-brand-400/60 text-brand-200 shadow-sm'
        : 'bg-white/5 border-white/15 text-white/80 hover:bg-white/10 hover:border-white/30'
);

export function ChipRow({
    inferred,
    inferredLoading,
    guestMode = false,
    selectedStatic,
    selectedInferred,
    onToggleStatic,
    onToggleInferred,
}: ChipRowProps) {
    const showInferred = inferredLoading || inferred.length > 0;

    return (
        <div className="flex flex-wrap items-center gap-1.5 px-2 sm:px-4 pt-2">
            <span className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest text-brand-300/80 select-none">
                <Sparkles className="h-3 w-3" />
                {showInferred ? 'Suggested for this app' : 'Build chips'}
            </span>
            {guestMode && !showInferred && (
                <span className="text-[9px] italic text-white/40 select-none" title="AI chip suggestions are billed to a signed-in account's credits">
                    Sign in for AI-suggested chips
                </span>
            )}

            {inferredLoading && (
                <>
                    {[0, 1, 2].map((i) => (
                        <span key={i} className="h-6 w-16 animate-pulse rounded-full bg-white/10" />
                    ))}
                </>
            )}

            {!inferredLoading && showInferred && inferred.map((s) => {
                const on = selectedInferred.includes(s.title);
                return (
                    <button
                        key={s.title}
                        type="button"
                        title={s.detail || s.title}
                        onClick={() => onToggleInferred(s.title)}
                        className={chipClass(on)}
                    >
                        {s.title}
                    </button>
                );
            })}

            {!showInferred && STATIC_CAPABILITY_CHIPS.map((c) => {
                const on = selectedStatic.includes(c.id);
                return (
                    <button
                        key={c.id}
                        type="button"
                        title={c.contract}
                        onClick={() => onToggleStatic(c.id)}
                        className={chipClass(on)}
                    >
                        {c.label}
                    </button>
                );
            })}
        </div>
    );
}
