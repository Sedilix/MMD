'use client';

/**
 * `ParamsSidebar` — per-column adaptive parameters popover.
 *
 * Hosts:
 *   - Temperature slider (0–2, step 0.05) for non-reasoning models.
 *   - Top-P slider (0–1, step 0.05).
 *   - Max Tokens input (capped to the model's `maxTokens` upper bound).
 *   - Reasoning-effort `<select>` for models that support the ladder
 *     (`supportsReasoningEffort === true`, currently GPT-5.x only).
 *
 * The page holds the live values in a single `useState<ParamValues>` and
 * fans them out via `send(prompt, opts)`. The popover writes back via
 * `onChange`. An "Apply to all columns" toggle is included so the user can
 * flip the same values across every active column in one click.
 */

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/icon';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ModelRegistryEntry } from '@/lib/playground/types';
import type { PlaygroundStreamSendOptions } from '@/lib/playground/hooks/usePlaygroundStream';

// ─── Public types ───────────────────────────────────────────────────────────

export interface ParamValues extends PlaygroundStreamSendOptions {
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    reasoningEffort?: 'none' | 'light' | 'standard' | 'xhigh';
    modeId?: string;
}

export interface ParamsSidebarProps {
    model: ModelRegistryEntry;
    values: ParamValues;
    onChange(values: ParamValues): void;
    /** When true, broadcasts to every active column via the page. */
    applyToAll: boolean;
    onApplyToAllChange(apply: boolean): void;
    /** Open the global system-prompt editor (rendered by the page). */
    onEditSystemPrompt?(): void;
    /** Optional custom trigger element */
    trigger?: React.ReactNode;
}

// ─── Component ──────────────────────────────────────────────────────────────

const REASONING_OPTIONS: ReadonlyArray<{
    value: 'none' | 'light' | 'standard' | 'xhigh';
    label: string;
}> = [
        { value: 'none', label: 'None — fast' },
        { value: 'light', label: 'Light' },
        { value: 'standard', label: 'Standard' },
        { value: 'xhigh', label: 'XHigh — deepest' },
    ];

export function ParamsSidebar({
    model,
    values,
    onChange,
    applyToAll,
    onApplyToAllChange,
    onEditSystemPrompt,
    trigger,
}: ParamsSidebarProps) {
    const [open, setOpen] = useState(false);
    const popoverRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLDivElement | HTMLButtonElement>(null);

    // Click-outside + Escape close.
    useEffect(() => {
        if (!open) return;
        const onClick = (e: MouseEvent): void => {
            const target = e.target as Node;
            if (
                popoverRef.current &&
                !popoverRef.current.contains(target) &&
                triggerRef.current &&
                !triggerRef.current.contains(target)
            ) {
                setOpen(false);
            }
        };
        const onKey = (e: KeyboardEvent): void => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onClick);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onClick);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const updateField = <K extends keyof ParamValues>(key: K, value: ParamValues[K]): void => {
        onChange({ ...values, [key]: value });
    };

    const supportsReasoning = model.supportsReasoningEffort === true;
    const isDashScope = model.provider === 'alibaba';

    const temperature = typeof values.temperature === 'number' ? values.temperature : 0.7;
    const topP = typeof values.topP === 'number' ? values.topP : 0.95;
    const maxTokens = typeof values.maxTokens === 'number' ? values.maxTokens : Math.min(4096, model.maxTokens);
    const maxTokensCap = model.maxTokens;
    const reasoningEffort = values.reasoningEffort ?? 'none';

    return (
        <div className="relative inline-block">
            {trigger ? (
                <div ref={triggerRef as any} onClick={(): void => setOpen((v) => !v)} className="cursor-pointer">
                    {trigger}
                </div>
            ) : (
                <button
                    ref={triggerRef as any}
                    type="button"
                    onClick={(): void => setOpen((v) => !v)}
                    aria-haspopup="dialog"
                    aria-expanded={open}
                    aria-label="Open parameters sidebar"
                    className={cn(
                        'inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
                        open && 'bg-muted text-foreground',
                    )}
                >
                    <Icon name="settings" className="h-3.5 w-3.5" aria-hidden />
                </button>
            )}

            {open ? (
                <div
                    ref={popoverRef}
                    role="dialog"
                    aria-label="Stream parameters"
                    className="absolute right-0 top-9 z-40 w-72 origin-top-right rounded-md border border-border bg-popover p-4 text-popover-foreground shadow-xl"
                >
                    <div className="mb-3 flex items-center justify-between">
                        <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                            Stream Parameters
                        </div>
                        <span
                            className={cn(
                                'rounded-full px-2 py-0.5 text-[10px] font-medium',
                                model.tier === 'premium'
                                    ? 'bg-amber-500/15 text-amber-400'
                                    : model.tier === 'local'
                                        ? 'bg-emerald-500/15 text-emerald-400'
                                        : 'bg-sky-500/15 text-sky-400',
                            )}
                        >
                            {model.tier}
                        </span>
                    </div>

                    {/* Reasoning effort — dropdown for OpenAI/Anthropic, toggle for DashScope. */}
                    {supportsReasoning ? (
                        isDashScope ? (
                            <div className="mb-3">
                                <div className="flex items-center justify-between">
                                    <label
                                        htmlFor={`enable-thinking-${model.id}`}
                                        className="text-xs font-medium text-foreground"
                                    >
                                        Enable Thinking
                                    </label>
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={reasoningEffort !== 'none'}
                                        id={`enable-thinking-${model.id}`}
                                        onClick={() =>
                                            updateField(
                                                'reasoningEffort',
                                                reasoningEffort !== 'none' ? 'none' : 'standard',
                                            )
                                        }
                                        className={cn(
                                            'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
                                            reasoningEffort !== 'none'
                                                ? 'bg-brand-500'
                                                : 'bg-white/15',
                                        )}
                                    >
                                        <span
                                            aria-hidden
                                            className={cn(
                                                'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow ring-0 transition-transform duration-200 ease-in-out',
                                                reasoningEffort !== 'none' ? 'translate-x-4' : 'translate-x-0',
                                            )}
                                        />
                                    </button>
                                </div>
                                <p className="mt-1 text-[10px] text-muted-foreground">
                                    {reasoningEffort !== 'none'
                                        ? 'Model will think before responding.'
                                        : 'Model responds directly without extended thinking.'}
                                </p>
                            </div>
                        ) : (
                            <div className="mb-3">
                                <label
                                    htmlFor={`reasoning-effort-${model.id}`}
                                    className="text-xs font-medium text-foreground"
                                >
                                    Reasoning Effort
                                </label>
                                <select
                                    id={`reasoning-effort-${model.id}`}
                                    value={reasoningEffort}
                                    onChange={(e): void =>
                                        updateField(
                                            'reasoningEffort',
                                            e.target.value as ParamValues['reasoningEffort'],
                                        )
                                    }
                                    className="mt-1 block h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                                >
                                    {REASONING_OPTIONS.map((opt) => (
                                        <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </option>
                                    ))}
                                </select>
                                <p className="mt-1 text-[10px] text-muted-foreground">
                                    Reasoning models ignore temperature when effort is set above "None".
                                </p>
                            </div>
                        )
                    ) : null}

                    {/* Temperature — hidden for pure reasoning-mode profiles. */}
                    {!supportsReasoning || reasoningEffort === 'none' ? (
                        <div className="mb-3">
                            <div className="flex items-center justify-between">
                                <label
                                    htmlFor={`temperature-${model.id}`}
                                    className="text-xs font-medium text-foreground"
                                >
                                    Temperature
                                </label>
                                <span className="font-mono text-[11px] text-muted-foreground">
                                    {temperature.toFixed(2)}
                                </span>
                            </div>
                            <input
                                id={`temperature-${model.id}`}
                                type="range"
                                min={0}
                                max={2}
                                step={0.05}
                                value={temperature}
                                onChange={(e): void => updateField('temperature', Number(e.target.value))}
                                className="mt-1 w-full accent-primary"
                            />
                        </div>
                    ) : null}

                    {/* Top-P — only meaningful for non-reasoning profiles. */}
                    {!supportsReasoning || reasoningEffort === 'none' ? (
                        <div className="mb-3">
                            <div className="flex items-center justify-between">
                                <label
                                    htmlFor={`top-p-${model.id}`}
                                    className="text-xs font-medium text-foreground"
                                >
                                    Top-P
                                </label>
                                <span className="font-mono text-[11px] text-muted-foreground">
                                    {topP.toFixed(2)}
                                </span>
                            </div>
                            <input
                                id={`top-p-${model.id}`}
                                type="range"
                                min={0}
                                max={1}
                                step={0.05}
                                value={topP}
                                onChange={(e): void => updateField('topP', Number(e.target.value))}
                                className="mt-1 w-full accent-primary"
                            />
                        </div>
                    ) : null}

                    {/* Max tokens — always visible, capped to model upper bound. */}
                    <div className="mb-3">
                        <label
                            htmlFor={`max-tokens-${model.id}`}
                            className="text-xs font-medium text-foreground"
                        >
                            Max Tokens
                        </label>
                        <Input
                            id={`max-tokens-${model.id}`}
                            type="number"
                            min={1}
                            max={maxTokensCap}
                            value={maxTokens}
                            onChange={(e): void => {
                                const next = Number(e.target.value);
                                if (!Number.isFinite(next)) return;
                                updateField('maxTokens', Math.max(1, Math.min(maxTokensCap, Math.floor(next))));
                            }}
                            className="mt-1 h-9"
                        />
                        <p className="mt-1 text-[10px] text-muted-foreground">
                            Capped at this model's context window ({maxTokensCap.toLocaleString()} tokens).
                        </p>
                    </div>

                    {/* System prompt — surfaced as a quick-launch button. */}
                    {onEditSystemPrompt ? (
                        <div className="mb-3">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={onEditSystemPrompt}
                                className="h-7 w-full justify-start px-2 text-xs"
                            >
                                {values.systemPrompt && values.systemPrompt.trim().length > 0
                                    ? 'Edit system prompt'
                                    : 'Add system prompt'}
                            </Button>
                        </div>
                    ) : null}

                    <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                        <label
                            htmlFor={`apply-all-${model.id}`}
                            className="flex items-center gap-2 text-xs text-muted-foreground"
                        >
                            <input
                                id={`apply-all-${model.id}`}
                                type="checkbox"
                                checked={applyToAll}
                                onChange={(e): void => onApplyToAllChange(e.target.checked)}
                                className="h-3.5 w-3.5 rounded border-input bg-background accent-primary"
                            />
                            Apply to all columns
                        </label>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={(): void => setOpen(false)}
                            className="h-7 px-2 text-xs"
                        >
                            Close
                        </Button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}