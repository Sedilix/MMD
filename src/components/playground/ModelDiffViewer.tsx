'use client';

/**
 * Side-by-side semantic diff of two model outputs (Phase 1.4).
 *
 * Token-level LCS, computed in a `useMemo`, with no new dependencies —
 * a diff library would be several hundred kilobytes for an algorithm
 * that fits in forty lines.
 *
 * Two deliberate choices:
 *
 *   - **Word tokens, not characters.** Character diffs of prose produce
 *     confetti: every shared "the" lights up as a match inside an
 *     otherwise-rewritten sentence. Splitting on word boundaries while
 *     keeping whitespace as its own token gives changes that map to
 *     what a reader would call a change.
 *   - **A size ceiling.** Classic LCS is O(n·m) in both time and
 *     memory. Two 8k-token answers would allocate a 64-million-cell
 *     table and lock the main thread. Past `MAX_DIFF_TOKENS` we fall
 *     back to a line-level diff, which is coarser but bounded — a
 *     degraded diff beats a frozen tab.
 */

import React, { useMemo, useState } from 'react';

import {
    computeDiff,
    diffStats,
    type DiffOp,
    type DiffPart,
} from '@/lib/playground/text-diff';

export interface ModelDiffViewerProps {
    left: { modelId: string; text: string };
    right: { modelId: string; text: string };
    /** Optional starting mode. */
    defaultMode?: DiffMode;
    className?: string;
}

export type DiffMode = 'unified' | 'split';

/**
 * Colours are defined against both themes explicitly rather than
 * relying on a single palette, so the diff stays legible whichever way
 * the viewer's system preference falls. Green/red alone would fail for
 * the ~8% of men with red-green colour vision deficiency, so each side
 * also carries a sign character and a left border.
 */
const OP_CLASS: Record<DiffOp, string> = {
    equal: 'text-foreground/80',
    insert:
        'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border-l-2 border-emerald-500/70',
    delete:
        'bg-rose-500/15 text-rose-800 dark:text-rose-200 border-l-2 border-rose-500/70 line-through decoration-rose-500/50',
};

function DiffRun({ part }: { part: DiffPart }) {
    if (part.op === 'equal') {
        return <span className={OP_CLASS.equal}>{part.text}</span>;
    }
    return (
        <span className={OP_CLASS[part.op]} data-op={part.op}>
            {part.text}
        </span>
    );
}

export function ModelDiffViewer({
    left,
    right,
    defaultMode = 'unified',
    className,
}: ModelDiffViewerProps) {
    const [mode, setMode] = useState<DiffMode>(defaultMode);

    const { parts, degraded } = useMemo(
        () => computeDiff(left.text, right.text),
        [left.text, right.text],
    );

    const stats = useMemo(() => diffStats(parts), [parts]);

    const leftParts = parts.filter((p) => p.op !== 'insert');
    const rightParts = parts.filter((p) => p.op !== 'delete');

    return (
        <section className={className}>
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
                <div className="flex items-center gap-3 text-xs">
                    <span className="font-mono text-foreground/70">{left.modelId}</span>
                    <span aria-hidden="true" className="text-foreground/40">
                        ↔
                    </span>
                    <span className="font-mono text-foreground/70">{right.modelId}</span>
                </div>
                <div className="flex items-center gap-3 text-[11px]">
                    <span className="text-foreground/60">
                        {stats.similarity}% similar
                    </span>
                    <span className="text-emerald-700 dark:text-emerald-300">
                        +{stats.added}
                    </span>
                    <span className="text-rose-700 dark:text-rose-300">
                        −{stats.removed}
                    </span>
                    <button
                        type="button"
                        onClick={() => setMode(mode === 'unified' ? 'split' : 'unified')}
                        className="rounded border border-border px-2 py-0.5 text-foreground/70 hover:text-foreground"
                    >
                        {mode === 'unified' ? 'Split' : 'Unified'}
                    </button>
                </div>
            </header>

            {degraded && (
                <p className="mt-2 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-800 dark:text-amber-200">
                    These answers are long, so this is a line-level diff rather than
                    word-level. Differences inside a line are shown as a whole-line change.
                </p>
            )}

            {mode === 'unified' ? (
                <pre className="mt-2 max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded bg-card/50 p-3 font-mono text-xs leading-relaxed">
                    {parts.map((p, i) => (
                        <DiffRun key={i} part={p} />
                    ))}
                </pre>
            ) : (
                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                    <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded bg-card/50 p-3 font-mono text-xs leading-relaxed">
                        {leftParts.map((p, i) => (
                            <DiffRun key={i} part={p} />
                        ))}
                    </pre>
                    <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded bg-card/50 p-3 font-mono text-xs leading-relaxed">
                        {rightParts.map((p, i) => (
                            <DiffRun key={i} part={p} />
                        ))}
                    </pre>
                </div>
            )}

            {/* Screen readers get the counts rather than colour alone. */}
            <p className="sr-only">
                {stats.added} characters added, {stats.removed} characters removed,{' '}
                {stats.similarity} percent similar.
            </p>
        </section>
    );
}

export default ModelDiffViewer;
