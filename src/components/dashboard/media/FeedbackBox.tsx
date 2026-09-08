'use client';

/**
 * Conversational critique input — "Feedback to One" (Phase 2.5).
 *
 * The admin types plain English; the compiler returns a rewritten
 * prompt, parameter deltas and a rationale. This component shows all
 * three **before** anything is rendered, and only then offers the
 * regenerate button.
 *
 * That two-step is the point. Compilation costs one cheap text call;
 * a video regeneration costs real credits and a minute of waiting. If
 * the compiler misread "make it punchier" as "make it shorter", the
 * admin should find out for the price of the cheap call. A one-click
 * "regenerate from feedback" would hide the misreading until the
 * expensive result came back looking wrong for reasons nobody can see.
 */

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export interface CompiledPreview {
    ok: boolean;
    nextPrompt: string;
    paramDeltas: Record<string, number | string>;
    rationale: string;
    /** Model One picked for this edit, if it was offered a choice. */
    selectedModelId?: string | null;
    /** Why it picked that tier — shown so the spend is justified, not just charged. */
    modelRationale?: string | null;
    detail?: string;
}

export interface FeedbackBoxProps {
    /** Prompt behind the version currently shown. */
    currentPrompt: string;
    /** Compile the critique. Should not render anything. */
    onCompile: (feedback: string) => Promise<CompiledPreview>;
    /** Render with the approved prompt + deltas, then append a version. */
    onRegenerate: (compiled: CompiledPreview, feedback: string) => Promise<void>;
    disabled?: boolean;
    className?: string;
}

/** Human labels for the closed delta set the compiler may return. */
const DELTA_LABELS: Record<string, string> = {
    speechRate: 'Speech rate',
    pitch: 'Pitch',
    voicePersona: 'Voice',
    brightness: 'Brightness',
    contrast: 'Contrast',
    pacing: 'Pacing',
};

function formatDelta(key: string, value: number | string): string {
    const label = DELTA_LABELS[key] ?? key;
    if (typeof value === 'string') return `${label}: ${value}`;
    const sign = value > 0 ? '+' : '';
    return `${label} ${sign}${value}`;
}

export function FeedbackBox({
    currentPrompt,
    onCompile,
    onRegenerate,
    disabled = false,
    className,
}: FeedbackBoxProps) {
    const [feedback, setFeedback] = useState('');
    const [compiled, setCompiled] = useState<CompiledPreview | null>(null);
    const [phase, setPhase] = useState<'idle' | 'compiling' | 'regenerating'>('idle');
    const [error, setError] = useState<string | null>(null);

    const busy = phase !== 'idle' || disabled;

    async function handleCompile() {
        if (!feedback.trim()) return;
        setPhase('compiling');
        setError(null);
        try {
            const result = await onCompile(feedback.trim());
            setCompiled(result);
            if (!result.ok) {
                setError(result.detail ?? 'Could not interpret that feedback.');
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Compilation failed.');
        } finally {
            setPhase('idle');
        }
    }

    async function handleRegenerate() {
        if (!compiled) return;
        setPhase('regenerating');
        setError(null);
        try {
            await onRegenerate(compiled, feedback.trim());
            // Reset only on success. A failed render should leave the
            // critique in the box — retyping it is pure friction.
            setFeedback('');
            setCompiled(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Regeneration failed.');
        } finally {
            setPhase('idle');
        }
    }

    const deltas = compiled ? Object.entries(compiled.paramDeltas ?? {}) : [];

    return (
        <div className={cn('space-y-2', className)}>
            <label
                htmlFor="media-feedback"
                className="block text-[11px] uppercase tracking-wider text-foreground/50"
            >
                Feedback to One
            </label>

            <Textarea
                id="media-feedback"
                value={feedback}
                onChange={(e) => {
                    setFeedback(e.target.value);
                    // A stale preview beside edited text is worse than
                    // no preview: it invites approving a rewrite of
                    // something the admin has since changed their mind about.
                    if (compiled) setCompiled(null);
                }}
                disabled={busy}
                rows={2}
                maxLength={2000}
                placeholder="e.g. the background is too bright, and the voiceover should sound more authoritative"
            />

            <div className="flex flex-wrap items-center gap-2">
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy || !feedback.trim()}
                    onClick={handleCompile}
                    className="text-[11px]"
                >
                    {phase === 'compiling' ? 'Reading…' : 'Preview change'}
                </Button>
                {compiled?.ok && (
                    <Button
                        type="button"
                        size="sm"
                        disabled={busy}
                        onClick={handleRegenerate}
                        className="text-[11px]"
                    >
                        {phase === 'regenerating' ? 'Rendering…' : 'Regenerate'}
                    </Button>
                )}
                <span className="text-[10px] text-foreground/40">
                    Preview is free. Regenerate spends credits.
                </span>
            </div>

            {error && (
                <p className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-800 dark:text-amber-200">
                    {error}
                </p>
            )}

            {compiled?.ok && (
                <div className="space-y-2 rounded border border-border bg-card/50 p-2">
                    <p className="text-[11px] text-foreground/70">
                        <span className="text-foreground/40">One understood: </span>
                        {compiled.rationale}
                    </p>

                    {compiled.modelRationale && (
                        <p className="text-[11px] text-foreground/70">
                            <span className="text-foreground/40">Model: </span>
                            {compiled.modelRationale}
                        </p>
                    )}

                    {deltas.length > 0 && (
                        <ul className="flex flex-wrap gap-1">
                            {deltas.map(([k, v]) => (
                                <li
                                    key={k}
                                    className="rounded border border-brand-500/40 bg-brand-500/10 px-1.5 py-0.5 font-mono text-[10px] text-brand-700 dark:text-brand-300"
                                >
                                    {formatDelta(k, v)}
                                </li>
                            ))}
                        </ul>
                    )}

                    <details className="text-[11px]">
                        <summary className="cursor-pointer text-foreground/50 hover:text-foreground/80">
                            Compare prompts
                        </summary>
                        <div className="mt-1 space-y-1">
                            <p className="text-foreground/40">Before</p>
                            <p className="rounded bg-muted/30 p-1.5 font-mono text-[10px] text-foreground/60">
                                {currentPrompt}
                            </p>
                            <p className="text-foreground/40">After</p>
                            <p className="rounded bg-muted/30 p-1.5 font-mono text-[10px] text-foreground/80">
                                {compiled.nextPrompt}
                            </p>
                        </div>
                    </details>
                </div>
            )}
        </div>
    );
}

export default FeedbackBox;
