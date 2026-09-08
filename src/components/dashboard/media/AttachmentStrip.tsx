'use client';

/**
 * The drafts One made, and which of them go out with the post.
 *
 * A contact sheet, not a grid of cards. The operator's job here is
 * comparison — four variations of one idea, judged against each other —
 * and cards separate what comparison needs adjacent. Tiles share a
 * single surface so the eye moves across them rather than between
 * containers.
 *
 * ## Selection order is the interaction, not a checkbox
 *
 * X and Instagram both render attachments in the order supplied, so
 * "which ones" and "in what order" are the same decision. The badge
 * shows an asset's position in the post rather than a tick, and
 * clicking an already-selected tile removes it and renumbers the rest.
 * A checkbox would hide the ordering entirely and then surprise the
 * operator with it after publishing.
 *
 * ## Limits are stated before they are hit
 *
 * A tile that cannot be added says why on hover and in its
 * `aria-disabled` description — "X cannot mix images and video" —
 * rather than simply refusing the click. The rule is genuinely
 * unintuitive (X has the same one-kind restriction as LinkedIn, and
 * only Instagram carousels escape it), so silence would read as a bug.
 */

import React, { useCallback, useMemo } from 'react';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';
import { Clapperboard } from 'lucide-react';
import { validateSelection, type SelectionItem } from '@/lib/marketing/platform-media';
import type { CampaignPlatform } from '@/lib/marketing/constraints';
import type { MediaAssetView } from './MediaAssetCard';

export interface AttachmentStripProps {
    assets: readonly MediaAssetView[];
    /** Asset ids in attach order. */
    selectedIds: readonly string[];
    onSelectionChange: (ids: string[]) => void;
    /** Which draft is open in the inspector below. */
    focusedId: string | null;
    onFocus: (assetId: string) => void;
    platforms: readonly CampaignPlatform[];
    busy?: boolean;
    className?: string;
}

/** Attachable kinds only. Audio is a voiceover track, not a post attachment. */
function isAttachable(a: MediaAssetView): boolean {
    return a.kind === 'image' || a.kind === 'video';
}

export default function AttachmentStrip({
    assets,
    selectedIds,
    onSelectionChange,
    focusedId,
    onFocus,
    platforms,
    busy = false,
    className,
}: AttachmentStripProps) {
    const order = useMemo(() => new Map(selectedIds.map((id, i) => [id, i + 1])), [selectedIds]);

    /**
     * Would adding this asset break a platform rule?
     *
     * Evaluated per tile against the prospective selection, so the
     * answer names the platform and the reason rather than reporting a
     * generic "limit reached".
     */
    const blockedReason = useCallback(
        (asset: MediaAssetView): string | null => {
            if (order.has(asset.assetId)) return null; // Removing is always allowed.
            const prospective: SelectionItem[] = [
                ...selectedIds
                    .map((id) => assets.find((a) => a.assetId === id))
                    .filter((a): a is MediaAssetView => Boolean(a) && isAttachable(a as MediaAssetView))
                    .map((a) => ({ kind: a.kind as 'image' | 'video' })),
                { kind: asset.kind as 'image' | 'video' },
            ];
            for (const platform of platforms) {
                const verdict = validateSelection(platform, prospective);
                if (!verdict.ok) return verdict.reason ?? 'Not allowed on this platform.';
            }
            return null;
        },
        [assets, selectedIds, order, platforms],
    );

    const toggle = useCallback(
        (asset: MediaAssetView) => {
            if (order.has(asset.assetId)) {
                onSelectionChange(selectedIds.filter((id) => id !== asset.assetId));
            } else {
                onSelectionChange([...selectedIds, asset.assetId]);
            }
        },
        [order, selectedIds, onSelectionChange],
    );

    const attachable = assets.filter(isAttachable);
    if (attachable.length === 0) return null;

    return (
        <ul
            className={cn(
                'flex snap-x gap-3 overflow-x-auto pb-1',
                // Wide content scrolls inside its own container so the
                // dashboard never scrolls sideways.
                className,
            )}
            aria-label="Generated drafts"
        >
            {attachable.map((asset) => {
                const position = order.get(asset.assetId);
                const selected = position !== undefined;
                const focused = focusedId === asset.assetId;
                const rendering = asset.status === 'generating';
                const failed = asset.status === 'failed';
                const reason = rendering || failed ? null : blockedReason(asset);
                const disabled = busy || rendering || failed || (!selected && reason !== null);
                const url = asset.versions?.[asset.versions.length - 1]?.storageUrl;
                const isVideoKind = asset.kind === 'video';

                return (
                    <li key={asset.assetId} className="shrink-0 snap-start">
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => onFocus(asset.assetId)}
                                aria-current={focused ? 'true' : undefined}
                                className={cn(
                                    'group relative block h-28 w-40 overflow-hidden rounded-xl bg-muted text-left transition',
                                    'ring-1 ring-inset',
                                    focused ? 'ring-primary' : 'ring-white/10 hover:ring-white/25',
                                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                )}
                            >
                                {url && !rendering ? (
                                    asset.kind === 'video' ? (
                                        <video
                                            src={url}
                                            muted
                                            playsInline
                                            preload="metadata"
                                            className="h-full w-full object-cover opacity-90 transition group-hover:opacity-100"
                                        />
                                    ) : (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={url}
                                            alt={asset.versions?.[asset.versions.length - 1]?.prompt ?? 'Generated draft'}
                                            className="h-full w-full object-cover opacity-90 transition group-hover:opacity-100"
                                        />
                                    )
                                ) : (
                                    <span className="flex h-full w-full items-center justify-center text-muted-foreground/60">
                                        {rendering ? (
                                            <Icon name="loading" className="h-5 w-5 animate-spin" />
                                        ) : failed ? (
                                            <Icon name="triangle-warning" className="h-5 w-5 text-destructive" />
                                        ) : isVideoKind ? (
                                            <Clapperboard className="h-5 w-5" />
                                        ) : (
                                            <Icon name="image" className="h-5 w-5" />
                                        )}
                                    </span>
                                )}

                                <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-background to-transparent px-2 pb-1.5 pt-4 text-[10px] uppercase tracking-wider text-foreground/80">
                                    {isVideoKind ? <Clapperboard className="h-3 w-3" /> : <Icon name="image" className="h-3 w-3" />}
                                    {rendering ? 'Rendering' : failed ? 'Failed' : asset.kind}
                                </span>
                            </button>

                            {/* Selection is its own control. Overlaying it on the
                                preview button would make "look at this" and
                                "attach this" the same click. */}
                            <button
                                type="button"
                                disabled={disabled}
                                onClick={() => toggle(asset)}
                                title={reason ?? (selected ? 'Remove from post' : 'Attach to post')}
                                aria-label={
                                    selected
                                        ? `Remove draft from position ${position}`
                                        : reason
                                          ? `Cannot attach: ${reason}`
                                          : 'Attach draft to post'
                                }
                                className={cn(
                                    'absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full text-[11px] font-semibold tabular-nums transition',
                                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                    selected
                                        ? 'bg-primary text-primary-foreground'
                                        : disabled
                                          ? 'cursor-not-allowed bg-black/50 text-white/25'
                                          : 'bg-black/55 text-white/70 hover:bg-black/75 hover:text-white',
                                )}
                            >
                                {selected ? position : <Icon name="check" className="h-3.5 w-3.5" />}
                            </button>
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}
