'use client';

/**
 * Media assets for a campaign — Phase 2.5.
 *
 * Fetches the campaign's assets and renders one editable card per
 * asset. This is the piece MarketingAgent mounts; everything below it
 * is presentational.
 *
 * The empty state is doing real work. A campaign starts with zero
 * assets and a section that renders nothing looks broken, so it says
 * what will populate it and why nothing has yet.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

import { MediaAssetCard, type MediaAssetView } from './MediaAssetCard';
import MediaPlatformPanel from './MediaPlatformPanel';
import AttachmentStrip from './AttachmentStrip';
import { generateDrafts, hasAttemptedDrafts } from './auto-drafts';
import { MAX_MEDIA_DRAFTS } from '@/lib/marketing/platform-media';
import { ALL_PLATFORMS, type CampaignPlatform } from '@/lib/marketing/constraints';
import { MediaCreateBar, type SuggestedPrompt, type ImageModelOption } from './MediaCreateBar';

import { IMAGE_GENERATE_MODELS, VIDEO_GENERATE_MODELS } from './model-options';

export interface MediaGalleryProps {
    campaignId: string;
    /**
     * Returns a fresh Firebase ID token. A getter rather than a string
     * because tokens expire after an hour — a value captured when the
     * dashboard mounted would 401 every request for anyone who left the
     * tab open, and `getIdToken()` refreshes transparently.
     */
    getToken: () => Promise<string>;
    /**
     * Visual prompts One wrote into the campaign variants. Without
     * these the gallery can only display media, never originate it —
     * which left `imagePrompt` as decorative text.
     */
    suggestions?: SuggestedPrompt[];
    /**
     * The platforms this campaign actually targets. Selection rules are
     * checked against these only — an X-only campaign must not inherit
     * Instagram's media requirement. Defaults to all three.
     */
    platforms?: readonly CampaignPlatform[];
    className?: string;
}

export function MediaGallery({ campaignId, getToken, suggestions = [], platforms = ALL_PLATFORMS, className }: MediaGalleryProps) {
    const [assets, setAssets] = useState<MediaAssetView[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [focusedId, setFocusedId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [limitNotice, setLimitNotice] = useState<string | null>(null);
    /** How many drafts One makes. Three balances choice against spend. */
    const [draftCount, setDraftCount] = useState(3);
    const [drafting, setDrafting] = useState<{ done: number; total: number } | null>(null);
    const [draftNotice, setDraftNotice] = useState<string | null>(null);
    // Survives re-renders within a mount; the sessionStorage marker in
    // auto-drafts covers remounts. Both exist because each render costs
    // credits and a duplicate round is real money.
    const autoRan = useRef<string | null>(null);

    const load = useCallback(async () => {
        setError(null);
        try {
            const token = await getToken();
            const res = await fetch(
                `/api/marketing/media/assets?campaignId=${encodeURIComponent(campaignId)}`,
                { headers: { Authorization: `Bearer ${token}` } },
            );
            const json = await res.json();
            if (!res.ok) throw new Error(json?.message ?? 'Could not load media.');
            const next = (json.assets ?? []) as MediaAssetView[];
            setAssets(next);
            // Selection lives on the server, so a reload after a
            // regeneration keeps whatever was chosen rather than
            // quietly clearing it.
            setSelectedIds(
                next
                    .filter((a) => a.selected)
                    .sort((a, b) => (a.selectionOrder ?? 99) - (b.selectionOrder ?? 99))
                    .map((a) => a.assetId),
            );
            setFocusedId((prev) => (prev && next.some((a) => a.assetId === prev) ? prev : (next[0]?.assetId ?? null)));
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not load media.');
            // Distinguish "failed" from "none yet": leaving `assets`
            // null would render the empty state, which claims there is
            // nothing here when we simply do not know.
            setAssets((prev) => prev ?? []);
        }
    }, [campaignId, getToken]);

    useEffect(() => {
        if (campaignId) void load();
    }, [campaignId, load]);

    /**
     * Persist immediately rather than behind a Save button.
     *
     * The selection is one field, the operator is picking from what is
     * already on screen, and a Save step would let them approve a draft
     * whose attachments were never stored. Optimistic locally, reverted
     * on refusal — the server re-checks the platform rules because they
     * are a property of the set, not of any one tile.
     */
    const persistSelection = useCallback(
        async (ids: string[]) => {
            const previous = selectedIds;
            setSelectedIds(ids);
            setLimitNotice(null);
            setSaving(true);
            try {
                const token = await getToken();
                const res = await fetch('/api/marketing/media/assets', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    // Only the platforms this campaign targets. A selection
                    // that Instagram would refuse must not block an X-only
                    // send — the publish step re-checks per platform anyway.
                    body: JSON.stringify({ campaignId, assetIds: ids, platforms }),
                });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) {
                    setSelectedIds(previous);
                    setLimitNotice(json?.message ?? 'That selection was refused.');
                }
            } catch {
                setSelectedIds(previous);
                setLimitNotice('Could not save the selection.');
            } finally {
                setSaving(false);
            }
        },
        [campaignId, getToken, selectedIds, platforms],
    );

    /**
     * Generate One's drafts once, when a campaign has none.
     *
     * Three guards, because every render bills: the campaign must have
     * no assets at all, this mount must not have run already, and the
     * tab must not have attempted this campaign before. The zero-assets
     * check is the meaningful one — a campaign that already has drafts
     * is never re-drafted, whatever the other two say.
     */
    useEffect(() => {
        if (!campaignId || assets === null) return;
        if (assets.length > 0) return;
        if (autoRan.current === campaignId) return;
        if (hasAttemptedDrafts(campaignId)) return;

        const prompt = suggestions[0]?.prompt?.trim();
        const model = IMAGE_GENERATE_MODELS[0]?.id;
        // Without a visual prompt there is nothing to draw. Silent by
        // design: a campaign whose copy carries no image idea is a
        // normal state, not an error to report.
        if (!prompt || !model) return;

        autoRan.current = campaignId;
        void (async () => {
            setDrafting({ done: 0, total: draftCount });
            setDraftNotice(null);
            try {
                const headers = {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${await getToken()}`,
                };
                const result = await generateDrafts({
                    campaignId,
                    prompt,
                    modelId: model,
                    count: draftCount,
                    headers,
                    onDraft: (done, total) => {
                        setDrafting({ done, total });
                        // Refetch per draft so tiles appear as they land
                        // rather than all at once at the end.
                        void load();
                    },
                });
                if (result.errors.length > 0) {
                    setDraftNotice(
                        result.orphanedUrls.length > 0
                            ? `${result.errors[0]} The render is at: ${result.orphanedUrls[0]}`
                            : result.errors[0],
                    );
                }
                await load();
            } catch (e) {
                setDraftNotice(e instanceof Error ? e.message : 'Could not generate drafts.');
            } finally {
                setDrafting(null);
            }
        })();
    }, [campaignId, assets, suggestions, draftCount, getToken, load]);

    const attachableCount = (assets ?? []).filter((a) => a.kind === 'image' || a.kind === 'video').length;
    const focused = (assets ?? []).find((a) => a.assetId === focusedId) ?? null;
    const selectedAttachables = selectedIds
        .map((id) => (assets ?? []).find((a) => a.assetId === id))
        .filter((a): a is MediaAssetView => Boolean(a) && (a!.kind === 'image' || a!.kind === 'video'))
        .map((a) => ({ kind: a.kind as 'image' | 'video' }));

    if (!campaignId) return null;

    return (
        <section className={cn('space-y-3', className)}>
            <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
                <h2 className="text-sm font-semibold tracking-tight">Media</h2>
                <button
                    type="button"
                    onClick={() => void load()}
                    className="text-[10px] uppercase tracking-wider text-foreground/50 hover:text-foreground"
                >
                    Refresh
                </button>
            </div>

            {error && (
                <p className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-800 dark:text-amber-200">
                    {error}
                </p>
            )}

            <MediaCreateBar
                campaignId={campaignId}
                getToken={getToken}
                suggestions={suggestions}
                models={IMAGE_GENERATE_MODELS}
                videoModels={VIDEO_GENERATE_MODELS}
                onCreated={() => void load()}
            />

            {assets === null ? (
                <p className="text-[11px] text-foreground/50">Loading drafts…</p>
            ) : assets.length === 0 ? (
                drafting ? (
                    <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <Icon name="loading" className="h-3.5 w-3.5 animate-spin" />
                        One is drawing {drafting.total} draft{drafting.total === 1 ? '' : 's'} — {drafting.done} ready
                    </p>
                ) : (
                    <p className="max-w-prose text-[11px] leading-relaxed text-foreground/50">
                        No drafts yet. One draws visuals alongside the copy; anything it makes for this
                        campaign appears here to review, revise and attach.
                    </p>
                )
            ) : (
                <div className="overflow-hidden rounded-2xl border border-border bg-card/40 backdrop-blur-xl">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 pt-4">
                        <h3 className="text-sm font-semibold tracking-tight text-foreground">
                            Attachments
                        </h3>
                        <div className="flex items-center gap-3">
                            <p className="text-[11px] tabular-nums text-muted-foreground">
                                {drafting
                                    ? `drawing ${drafting.done}/${drafting.total}`
                                    : selectedIds.length === 0
                                      ? `${attachableCount} draft${attachableCount === 1 ? '' : 's'} · none attached`
                                      : `${selectedIds.length} of ${attachableCount} attached`}
                                {saving && ' · saving'}
                            </p>

                            {/* Sets how many One draws NEXT time, so the label
                                says so — changing it does not re-spend on
                                drafts that already exist. */}
                            <div
                                className="flex overflow-hidden rounded-md border border-border"
                                role="group"
                                aria-label="Drafts One generates for a new campaign"
                            >
                                {Array.from({ length: MAX_MEDIA_DRAFTS }, (_, i) => i + 1).map((n) => (
                                    <button
                                        key={n}
                                        type="button"
                                        aria-pressed={draftCount === n}
                                        onClick={() => setDraftCount(n)}
                                        title={`Draw ${n} draft${n === 1 ? '' : 's'} for the next campaign`}
                                        className={cn(
                                            'w-7 py-0.5 text-[11px] font-medium tabular-nums transition-colors',
                                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                            draftCount === n
                                                ? 'bg-primary/15 text-primary'
                                                : 'bg-background text-muted-foreground hover:bg-muted',
                                        )}
                                    >
                                        {n}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <p className="max-w-prose px-4 pb-3 pt-1 text-[11px] leading-relaxed text-muted-foreground">
                        Pick what goes out with the post. Numbers show the order they will appear in.
                    </p>

                    <div className="px-4">
                        <AttachmentStrip
                            assets={assets}
                            selectedIds={selectedIds}
                            onSelectionChange={(ids) => void persistSelection(ids)}
                            focusedId={focusedId}
                            onFocus={setFocusedId}
                            platforms={platforms}
                            busy={saving}
                        />
                    </div>

                    {draftNotice && (
                        <p
                            role="status"
                            className="mx-4 mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200"
                        >
                            <Icon name="triangle-warning" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            {draftNotice}
                        </p>
                    )}

                    {limitNotice && (
                        <p
                            role="status"
                            className="mx-4 mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200"
                        >
                            <Icon name="triangle-warning" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            {limitNotice}
                        </p>
                    )}

                    {/* One hairline, one elevation. The inspector is a zone of
                        this panel rather than a card inside it. */}
                    {focused && (
                        <div className="mt-4 border-t border-border p-4">
                            <MediaAssetCard
                                key={focused.assetId}
                                asset={focused}
                                getToken={getToken}
                                onChanged={() => void load()}
                                chrome="plain"
                            />
                        </div>
                    )}

                    <div className="border-t border-border">
                        <MediaPlatformPanel
                            className="rounded-none border-0 bg-transparent"
                            platforms={platforms}
                            selected={selectedAttachables}
                        />
                    </div>
                </div>
            )}
        </section>
    );
}

export default MediaGallery;
