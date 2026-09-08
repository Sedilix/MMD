'use client';

/**
 * Generate a first media asset for a campaign — Phase 2.
 *
 * One's variants already carry an `imagePrompt` — a concrete visual
 * brief it wrote for exactly this purpose — but until now it was
 * rendered as read-only text with no way to act on it. This closes that
 * loop: pick a suggested prompt, generate, and the result becomes a
 * versioned asset the feedback editor can iterate on.
 *
 * ## Cost is stated before the click, not after
 *
 * Image models here range from 30 to 70 credits and the operator has no
 * way to know that from the model id. The button names the price. A
 * generate button that spends an unstated amount is one people either
 * avoid or resent.
 *
 * ## Sequence
 *
 *   1. POST /api/studio/image        ← bills the caller
 *   2. POST /api/marketing/media/assets  action:"create"
 *
 * Step 2 failing means a paid render was not recorded, so the URL is
 * surfaced rather than swallowed — the same contract as regeneration.
 */

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { priceLabel, type MediaModelOption } from './model-options';
import { renderMedia, RenderTimeoutError } from './render-media';

export interface SuggestedPrompt {
    /** Where the prompt came from, e.g. "x" — shown so the operator can tell them apart. */
    source: string;
    prompt: string;
}

/** Re-exported so callers importing from this module keep working. */
export type ImageModelOption = MediaModelOption;

export type CreateKind = 'image' | 'video';

export interface MediaCreateBarProps {
    campaignId: string;
    getToken: () => Promise<string>;
    /** Prompts One suggested, usually one per platform variant. */
    suggestions: SuggestedPrompt[];
    models: MediaModelOption[];
    /** Text-to-video models. Omit to hide the video option entirely. */
    videoModels?: MediaModelOption[];
    /** Called after an asset is created so the gallery can refetch. */
    onCreated: () => void;
    className?: string;
}

function urlFromResponse(kind: CreateKind, data: unknown): string | null {
    if (kind === 'video') {
        const d = data as Record<string, unknown> | null;
        if (!d) return null;
        // The route's success payload is `{ success, videoUrl, ... }`, but
        // accept the alternates too — a long DashScope job can come back
        // as a task handle instead of a finished asset, and that is worth
        // surfacing distinctly rather than as "no URL".
        for (const key of ['videoUrl', 'video_url', 'url']) {
            const v = d[key];
            if (typeof v === 'string' && v.length > 0) return v;
        }
        return null;
    }
    return urlFromImageResponse(data);
}

/**
 * Describe an unexpected success payload without dumping it.
 *
 * "returned no URL" is a dead end for whoever has to fix it: it says
 * the field was missing but not what arrived instead. Listing the keys
 * distinguishes a task handle awaiting a poll from an empty body from a
 * shape that changed upstream.
 */
function describePayload(data: unknown): string {
    if (!data || typeof data !== 'object') return `body was ${typeof data}`;
    const keys = Object.keys(data as Record<string, unknown>);
    if (keys.length === 0) return 'body was an empty object';
    return `keys: ${keys.slice(0, 12).join(', ')}`;
}

function urlFromImageResponse(data: unknown): string | null {
    if (!data || typeof data !== 'object') return null;
    const d = data as Record<string, unknown>;
    const arr = d.data;
    if (Array.isArray(arr) && arr[0] && typeof arr[0] === 'object') {
        const first = arr[0] as Record<string, unknown>;
        if (typeof first.url === 'string') return first.url;
    }
    return typeof d.imageUrl === 'string' ? d.imageUrl : null;
}

export function MediaCreateBar({
    campaignId,
    getToken,
    suggestions,
    models,
    videoModels = [],
    onCreated,
    className,
}: MediaCreateBarProps) {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [kind, setKind] = useState<CreateKind>('image');
    const [modelId, setModelId] = useState(models[0]?.id ?? '');
    const [videoModelId, setVideoModelId] = useState(videoModels[0]?.id ?? '');
    const [durationSec, setDurationSec] = useState(5);
    const [busy, setBusy] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const [notice, setNotice] = useState<string | null>(null);

    if (suggestions.length === 0) return null;

    const chosen = suggestions[Math.min(selectedIndex, suggestions.length - 1)];
    const activeModels = kind === 'video' ? videoModels : models;
    const chosenModel =
        kind === 'video'
            ? (videoModels.find((m) => m.id === videoModelId) ?? videoModels[0])
            : (models.find((m) => m.id === modelId) ?? models[0]);

    // Video bills per second, so the real cost is rate x duration. The
    // button shows the total, not the rate — a "120 credits/sec" label
    // beside a Generate button invites a 10-second click that costs
    // 1200.
    const maxDuration = chosenModel?.maxDurationSec ?? 10;
    const effectiveDuration = Math.min(durationSec, maxDuration);
    const totalCredits = chosenModel
        ? chosenModel.perSecond
            ? chosenModel.credits * effectiveDuration
            : chosenModel.credits
        : 0;

    async function handleGenerate() {
        if (!chosen || !chosenModel) return;
        setBusy(true);
        setNotice(null);
        try {
            const headers = {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${await getToken()}`,
            };

            // Images resolve from the POST; video returns a job handle and
            // is polled to completion. `renderMedia` owns that difference so
            // neither call site has to know which kind is async.
            const { url } = await renderMedia({
                kind,
                prompt: chosen.prompt,
                model: chosenModel.id,
                durationSec: effectiveDuration,
                headers,
                onProgress: setElapsed,
            });

            const createRes = await fetch('/api/marketing/media/assets', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    action: 'create',
                    campaignId,
                    kind,
                    prompt: chosen.prompt,
                    model: chosenModel.id,
                    storageUrl: url,
                }),
            });
            const createJson = await createRes.json();
            if (!createRes.ok) {
                // Paid for, not recorded. Give the operator the URL
                // rather than losing what they just bought.
                setNotice(
                    `The ${kind} generated but could not be saved (${
                        createJson?.message ?? 'unknown error'
                    }). Your ${kind} is at: ${url}`,
                );
                return;
            }
            onCreated();
        } catch (e) {
            if (e instanceof RenderTimeoutError) {
                // Not a failure — the render continues on the provider.
                // Saying "failed" here invites a resubmit that renders and
                // charges a second time.
                setNotice(e.message);
            } else {
                setNotice(e instanceof Error ? e.message : 'Generation failed.');
            }
        } finally {
            setBusy(false);
            setElapsed(0);
        }
    }

    return (
        <div className={cn('space-y-2 rounded-lg border border-border bg-muted/20 p-3', className)}>
            <p className="text-[11px] uppercase tracking-wider text-foreground/50">
                Generate from One&rsquo;s suggested visual
            </p>

            {suggestions.length > 1 && (
                <div className="flex flex-wrap gap-1">
                    {suggestions.map((s, i) => (
                        <button
                            key={`${s.source}-${i}`}
                            type="button"
                            disabled={busy}
                            onClick={() => setSelectedIndex(i)}
                            className={cn(
                                'rounded border px-2 py-0.5 text-[10px] uppercase tracking-wider transition-colors',
                                i === selectedIndex
                                    ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                                    : 'border-border text-foreground/60 hover:text-foreground',
                            )}
                        >
                            {s.source}
                        </button>
                    ))}
                </div>
            )}

            <p className="rounded bg-card/50 p-2 text-xs leading-relaxed text-foreground/80">
                {chosen?.prompt}
            </p>

            <div className="flex flex-wrap items-center gap-2">
                {videoModels.length > 0 && (
                    <div className="flex rounded border border-border">
                        {(['image', 'video'] as CreateKind[]).map((k) => (
                            <button
                                key={k}
                                type="button"
                                disabled={busy}
                                onClick={() => setKind(k)}
                                className={cn(
                                    'px-2 py-1 text-[11px] capitalize transition-colors',
                                    kind === k
                                        ? 'bg-brand-500/15 text-brand-700 dark:text-brand-300'
                                        : 'text-foreground/60 hover:text-foreground',
                                )}
                            >
                                {k}
                            </button>
                        ))}
                    </div>
                )}

                <select
                    value={kind === 'video' ? videoModelId : modelId}
                    onChange={(e) =>
                        kind === 'video'
                            ? setVideoModelId(e.target.value)
                            : setModelId(e.target.value)
                    }
                    disabled={busy}
                    aria-label={`${kind} model`}
                    className="rounded border border-border bg-card/50 px-2 py-1 text-[11px] text-foreground/80"
                >
                    {activeModels.map((m) => (
                        <option key={m.id} value={m.id}>
                            {m.label} · {priceLabel(m)}
                        </option>
                    ))}
                </select>

                {kind === 'video' && (
                    <label className="flex items-center gap-1 text-[11px] text-foreground/60">
                        <input
                            type="number"
                            min={1}
                            max={maxDuration}
                            value={effectiveDuration}
                            onChange={(e) => setDurationSec(Number(e.target.value) || 1)}
                            disabled={busy}
                            className="w-14 rounded border border-border bg-card/50 px-1.5 py-1 text-[11px] text-foreground/80"
                        />
                        sec
                    </label>
                )}

                <Button
                    type="button"
                    size="sm"
                    disabled={busy || !chosen || !chosenModel}
                    onClick={handleGenerate}
                    className="text-[11px]"
                >
                    {busy
                        ? elapsed > 0
                            ? `Rendering… ${elapsed}s`
                            : 'Generating…'
                        : `Generate ${kind} · ${totalCredits} credits`}
                </Button>
            </div>

            {notice && (
                <p className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] break-all text-amber-800 dark:text-amber-200">
                    {notice}
                </p>
            )}
        </div>
    );
}

export default MediaCreateBar;
