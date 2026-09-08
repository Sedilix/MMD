'use client';

/**
 * What the selected media can and cannot do, per platform.
 *
 * Two jobs in one panel, because they are the same question asked at
 * two moments: "how many drafts should One make?" and "will what I
 * picked actually post?"
 *
 * ## Designed to answer before it refuses
 *
 * The rules here are unintuitive — X has the same one-kind-per-post
 * restriction as LinkedIn, and Instagram cannot post text at all — so
 * an operator who is only told "invalid selection" has to guess, and
 * the guess is usually "it's broken". Every row therefore states the
 * limit up front, and turns into the specific reason the moment the
 * current selection breaks it.
 *
 * Status is per platform rather than global: a selection that is fine
 * for Instagram and illegal on X is a normal, common state, and
 * collapsing it to one verdict would hide which platform to fix.
 *
 * ## It does not pretend media is attached
 *
 * Video reaches no connector yet, and the honesty lives in
 * `connectorAttachesMedia`: X and LinkedIn attach images only (no
 * chunked/video upload flow), Instagram consumes whatever image the
 * publish route resolves. `connectorAttachesMedia` carries that per
 * platform, and the notice below states it plainly. A picker that
 * silently discards the selection at publish time would be worse than
 * no picker.
 */

import React, { useMemo } from 'react';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';
import { Clapperboard } from 'lucide-react';
import {
    PLATFORM_MEDIA,
    validateSelection,
    MAX_MEDIA_DRAFTS,
    type SelectionItem,
} from '@/lib/marketing/platform-media';
import { ALL_PLATFORMS, type CampaignPlatform } from '@/lib/marketing/constraints';

export interface MediaPlatformPanelProps {
    /** Platforms this campaign targets. Defaults to all three. */
    platforms?: readonly CampaignPlatform[];
    /** What the operator has ticked in the gallery. */
    selected?: readonly SelectionItem[];
    /** How many drafts One should generate. */
    draftCount?: number;
    onDraftCountChange?: (n: number) => void;
    /** Credits per draft, so the cost of asking for four is visible. */
    creditsPerDraft?: number;
    className?: string;
}

function KindCount({ icon, n, max }: { icon: React.ReactNode; n: number; max: number }) {
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1 tabular-nums',
                n > max ? 'text-red-400' : n > 0 ? 'text-foreground' : 'text-muted-foreground',
            )}
        >
            {icon}
            {n}/{max}
        </span>
    );
}

export default function MediaPlatformPanel({
    platforms = ALL_PLATFORMS,
    selected = [],
    draftCount = 2,
    onDraftCountChange,
    creditsPerDraft,
    className,
}: MediaPlatformPanelProps) {
    const images = selected.filter((s) => s.kind === 'image').length;
    const videos = selected.filter((s) => s.kind === 'video').length;

    const rows = useMemo(
        () =>
            platforms.map((p) => {
                const cap = PLATFORM_MEDIA[p];
                const verdict = validateSelection(p, selected);
                return { cap, verdict };
            }),
        [platforms, selected],
    );

    const anyBlocked = rows.some((r) => !r.verdict.ok);
    const attaching = rows.map((r) => r.cap).filter((c) => c.connectorAttachesMedia);
    const notAttaching = rows.map((r) => r.cap).filter((c) => !c.connectorAttachesMedia);
    const hasSelection = selected.length > 0;

    return (
        <section
            className={cn('rounded-xl border border-border bg-card/50', className)}
            aria-label="Media limits per platform"
        >
            <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4">
                <div>
                    <h3 className="text-sm font-semibold text-foreground">Attachments</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        {hasSelection
                            ? `${images} image${images === 1 ? '' : 's'}, ${videos} video${videos === 1 ? '' : 's'} selected.`
                            : 'Nothing selected yet — tick the drafts you want to use.'}
                    </p>
                </div>

                {onDraftCountChange && (
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Drafts</span>
                        <div className="flex overflow-hidden rounded-md border border-border" role="group" aria-label="Number of drafts to generate">
                            {Array.from({ length: MAX_MEDIA_DRAFTS }, (_, i) => i + 1).map((n) => (
                                <button
                                    key={n}
                                    type="button"
                                    aria-pressed={draftCount === n}
                                    onClick={() => onDraftCountChange(n)}
                                    className={cn(
                                        'w-8 py-1 text-xs font-medium tabular-nums transition-colors',
                                        draftCount === n
                                            ? 'bg-primary/15 text-primary'
                                            : 'bg-background text-muted-foreground hover:bg-muted',
                                    )}
                                >
                                    {n}
                                </button>
                            ))}
                        </div>
                        {typeof creditsPerDraft === 'number' && (
                            <span className="text-xs tabular-nums text-muted-foreground">
                                ≈{creditsPerDraft * draftCount} credits
                            </span>
                        )}
                    </div>
                )}
            </header>

            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <caption className="sr-only">
                        Media limits for each platform, and whether the current selection is valid
                    </caption>
                    <thead>
                        <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                            <th scope="col" className="px-4 py-2 font-semibold">Platform</th>
                            <th scope="col" className="px-4 py-2 font-semibold">Images</th>
                            <th scope="col" className="px-4 py-2 font-semibold">Video</th>
                            <th scope="col" className="px-4 py-2 font-semibold">Mixing</th>
                            <th scope="col" className="px-4 py-2 font-semibold">This selection</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(({ cap, verdict }) => (
                            <tr key={cap.platform} className="border-b border-border/60 last:border-0 align-top">
                                <th scope="row" className="px-4 py-3 text-left font-medium text-foreground">
                                    {cap.label}
                                    {cap.requiresMedia && (
                                        <span className="ml-2 rounded border border-amber-500/30 bg-amber-500/10 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-400">
                                            media required
                                        </span>
                                    )}
                                    <div className="mt-1 max-w-[22rem] text-xs font-normal text-muted-foreground">
                                        {cap.note}
                                    </div>
                                </th>
                                <td className="px-4 py-3">
                                    <KindCount icon={<Icon name="image" className="h-3.5 w-3.5" />} n={images} max={cap.maxImages} />
                                </td>
                                <td className="px-4 py-3">
                                    <KindCount icon={<Clapperboard className="h-3.5 w-3.5" />} n={videos} max={cap.maxVideos} />
                                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                                        ≤{cap.maxVideoSeconds}s
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-xs">
                                    {cap.allowsMixedKinds ? (
                                        <span className="text-foreground">Images + video</span>
                                    ) : (
                                        <span className="text-muted-foreground">One kind only</span>
                                    )}
                                </td>
                                <td className="px-4 py-3">
                                    {verdict.ok ? (
                                        !hasSelection && cap.requiresMedia ? (
                                            // A warning, not a block: nothing is selected, and
                                            // publishing is per-platform — the operator may send
                                            // this campaign to a text-only platform and never
                                            // touch this one. The publish step refuses this
                                            // platform itself when the time comes.
                                            <span className="inline-flex items-start gap-1.5 text-xs text-amber-400">
                                                <Icon name="triangle-warning" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                                <span className="max-w-[18rem]">Nothing selected — this platform cannot post until media is attached.</span>
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
                                                <Icon name="check" className="h-3.5 w-3.5" />
                                                {hasSelection ? 'Can post' : 'Nothing to check'}
                                            </span>
                                        )
                                    ) : (
                                        <span className="inline-flex items-start gap-1.5 text-xs text-amber-400">
                                            <Icon name="triangle-warning" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                            <span className="max-w-[18rem]">{verdict.reason}</span>
                                        </span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Stated once, at the bottom, rather than as a badge on every
                row — it is a property of the build, not of a platform. */}
            <footer className="flex items-start gap-2 border-t border-border p-3 text-xs text-muted-foreground">
                <Icon name="info" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                    {attaching.length > 0 && (
                        <>
                            <strong className="font-medium text-foreground">
                                {attaching.map((c) => c.label).join(' and ')}
                            </strong>{' '}
                            {attaching.length === 1 ? 'attaches' : 'attach'} the campaign&apos;s most recent ready
                            image automatically.{' '}
                        </>
                    )}
                    {notAttaching.length > 0 && (
                        <>
                            {attaching.length > 0 ? 'For ' : ''}
                            <strong className="font-medium text-foreground">
                                {notAttaching.map((c) => c.label).join(' and ')}
                            </strong>
                            , selections are saved and used for editing but do not go out with the post yet — those
                            connectors still publish text only.
                        </>
                    )}
                </span>
            </footer>

            {anyBlocked && (
                <div className="sr-only" role="status">
                    The current selection cannot be posted to at least one platform.
                </div>
            )}
        </section>
    );
}
