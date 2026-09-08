'use client';

/**
 * One generates the visuals; the operator picks between them.
 *
 * Previously the gallery only rendered what someone clicked "Generate"
 * for, which made `imagePrompt` decorative text and left every campaign
 * without media unless a human remembered to ask. One writes the visual
 * idea as part of the copy; this makes it produce the visual too.
 *
 * ## Why this runs client-side
 *
 * The studio routes own credit deduction and rate limiting for the
 * caller's identity. A server route calling them would have to forward
 * the operator's credentials to itself, and would either bypass those
 * guards or bill twice. The client already holds a valid token, so
 * letting it drive keeps one billing path — the same reasoning that
 * put the regeneration loop in `MediaAssetCard`.
 *
 * ## Sequential, not parallel
 *
 * Three renders at once would arrive together after one long wait, and
 * any rate limit would fail two of them. One at a time means the first
 * tile appears in about fifteen seconds and the rest fill in behind it,
 * which is the difference between "working" and "frozen".
 *
 * ## Variation comes from the model, not from invented direction
 *
 * All drafts use One's prompt verbatim. Image models are stochastic, so
 * the same prompt yields genuinely different images — whereas appending
 * "but make it moodier" to draft two would be the tool inventing art
 * direction nobody asked for, and burying the operator's actual brief.
 */

import { renderMedia, RenderTimeoutError } from './render-media';

export interface AutoDraftRequest {
    campaignId: string;
    /** One's visual prompt, used verbatim for every draft. */
    prompt: string;
    modelId: string;
    count: number;
    headers: Record<string, string>;
    /** Called after each draft is recorded so tiles appear as they land. */
    onDraft?: (index: number, total: number) => void;
    /** Elapsed seconds for the draft currently rendering. */
    onProgress?: (seconds: number) => void;
}

export interface AutoDraftResult {
    created: number;
    /** Renders that were paid for but could not be recorded. */
    orphanedUrls: string[];
    errors: string[];
}

/**
 * Has this campaign already had drafts generated in this tab?
 *
 * Guards the case that costs real money: a component remount, a route
 * change, or a re-render firing the generation a second time. The
 * marker is per-tab rather than global because a fresh session that
 * still finds zero assets means the previous attempt genuinely failed,
 * and that is worth retrying.
 */
function markerKey(campaignId: string): string {
    return `cybrdeck:auto-drafts:${campaignId}`;
}

export function hasAttemptedDrafts(campaignId: string): boolean {
    try {
        return sessionStorage.getItem(markerKey(campaignId)) !== null;
    } catch {
        // Private mode or storage disabled. Failing closed would mean
        // never generating; the caller's zero-assets check still stops
        // a duplicate in the common path.
        return false;
    }
}

export function markDraftsAttempted(campaignId: string): void {
    try {
        sessionStorage.setItem(markerKey(campaignId), new Date().toISOString());
    } catch {
        /* storage unavailable; see above */
    }
}

export async function generateDrafts(req: AutoDraftRequest): Promise<AutoDraftResult> {
    const result: AutoDraftResult = { created: 0, orphanedUrls: [], errors: [] };
    // Marked before the first render, not after the last. A crash
    // midway must not leave the campaign eligible for a second full
    // round on the next mount.
    markDraftsAttempted(req.campaignId);

    for (let i = 0; i < req.count; i++) {
        try {
            const { url } = await renderMedia({
                kind: 'image',
                prompt: req.prompt,
                model: req.modelId,
                headers: req.headers,
                onProgress: req.onProgress,
            });

            const res = await fetch('/api/marketing/media/assets', {
                method: 'POST',
                headers: req.headers,
                body: JSON.stringify({
                    action: 'create',
                    campaignId: req.campaignId,
                    kind: 'image',
                    prompt: req.prompt,
                    model: req.modelId,
                    storageUrl: url,
                }),
            });

            if (!res.ok) {
                // Paid for, not recorded. Surfaced rather than dropped —
                // the operator can still retrieve what they bought.
                result.orphanedUrls.push(url);
                const json = await res.json().catch(() => ({}));
                result.errors.push(json?.message ?? `Draft ${i + 1} rendered but could not be saved.`);
                continue;
            }

            result.created++;
            req.onDraft?.(i + 1, req.count);
        } catch (e) {
            // One failed draft does not abandon the rest: two usable
            // options beat none, and the operator sees what arrived.
            result.errors.push(
                e instanceof RenderTimeoutError
                    ? `Draft ${i + 1} timed out.`
                    : e instanceof Error
                      ? e.message
                      : `Draft ${i + 1} failed.`,
            );
        }
    }

    return result;
}
