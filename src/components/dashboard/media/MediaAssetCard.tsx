'use client';

/**
 * One media asset with its full edit loop — Phase 2.5.
 *
 * Composes preview + version history + feedback into the unit the
 * gallery repeats. This is the only file that knows the API shapes, so
 * the three presentational components stay dumb and testable.
 *
 * ## The regeneration sequence lives here
 *
 *   1. POST /api/marketing/media/compile-feedback   (cheap, no render)
 *   2. POST /api/studio/{image,video} | /api/tts    (bills the caller)
 *   3. POST /api/marketing/media/assets action=append
 *
 * It runs client-side on purpose. The studio routes own credit
 * deduction and rate limiting for the caller's identity, so re-entering
 * them from a server route would either bypass those guards or
 * double-charge.
 *
 * Step 3 is the fragile one: a render that succeeds but fails to record
 * has been paid for and lost. So an append failure surfaces the URL
 * rather than swallowing it — the operator can still retrieve what they
 * paid for while we fix the record.
 *
 * ## Regeneration EDITS; it does not re-generate
 *
 * An image regeneration uses an `imageEdit` model and passes the
 * current version as `imageUrl`. This matters more than it sounds.
 * Feedback like "add a user in front of the computer" means *this*
 * picture with a user added — a text-to-image model handed the
 * rewritten prompt would produce an unrelated picture that merely
 * matches the description, silently discarding the render the operator
 * had been iterating on.
 */

import React, { useCallback, useState } from 'react';
import { cn } from '@/lib/utils';
import { MediaPreview, type MediaKind, type MediaStatus } from './MediaPreview';
import { MediaVersionSlider, type MediaVersionSummary } from './MediaVersionSlider';
import { FeedbackBox, type CompiledPreview } from './FeedbackBox';
import { MaskCanvas } from './MaskCanvas';
import { renderMedia, RenderTimeoutError } from './render-media';
import {
    IMAGE_EDIT_MODELS,
    IMAGE_MASK_MODELS,
    VIDEO_GENERATE_MODELS,
    priceLabel,
    type MediaModelOption,
} from './model-options';

export interface MediaAssetView {
    assetId: string;
    campaignId: string;
    kind: MediaKind;
    status: MediaStatus;
    /** Marked to go out with the post. Absent on pre-selection assets. */
    selected?: boolean;
    /** 1-based position among the attachments. */
    selectionOrder?: number;
    currentVersion: number;
    versions: MediaVersionSummary[];
}

export interface MediaAssetCardProps {
    asset: MediaAssetView;
    /**
     * Returns a fresh Firebase ID token. A getter rather than a string
     * because tokens expire after an hour, and a regeneration can take
     * a minute — capturing the token up front would 401 the append
     * after the render had already been paid for.
     */
    getToken: () => Promise<string>;
    /** Called after any mutation so the parent can refetch. */
    onChanged: () => void;
    /** Campaign this asset belongs to. Required to delete it. */
    campaignId?: string;
    /**
     * `plain` drops the card chrome so this can sit inside a panel that
     * already owns its surface. A card within a card is two elevations
     * claiming the same depth, and reads as clutter rather than
     * structure.
     */
    chrome?: 'card' | 'plain';
    className?: string;
}

/** Extract a media URL from the studio routes, whose shapes differ. */
function urlFromStudioResponse(kind: MediaKind, data: unknown): string | null {
    if (!data || typeof data !== 'object') return null;
    const d = data as Record<string, unknown>;

    // The three routes disagree on their success shape:
    //   image → { success, data: [{ url }] }
    //   video → { videoUrl }
    //   tts   → { audioUrl }
    // Normalised here rather than in each caller.
    if (kind === 'image') {
        const arr = d.data;
        if (Array.isArray(arr) && arr[0] && typeof arr[0] === 'object') {
            const first = arr[0] as Record<string, unknown>;
            if (typeof first.url === 'string') return first.url;
        }
        return typeof d.imageUrl === 'string' ? d.imageUrl : null;
    }
    if (kind === 'video') return typeof d.videoUrl === 'string' ? d.videoUrl : null;
    return typeof d.audioUrl === 'string' ? d.audioUrl : null;
}

export function MediaAssetCard({ asset, getToken, onChanged, chrome = 'card', className }: MediaAssetCardProps) {
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    // Two-step delete rather than a modal. The asset is on screen, so a
    // dialog would only re-describe what the operator is already looking
    // at; asking twice in place is enough friction to stop a misclick
    // without interrupting the person clearing out ten test renders.
    const [confirmDelete, setConfirmDelete] = useState(false);
    // Inpainting mask, as a data URL. Only offered for images: video and
    // audio have no equivalent region-selection story here.
    const [maskDataUrl, setMaskDataUrl] = useState<string | null>(null);
    const [masking, setMasking] = useState(false);

    // Which model performs the regeneration. Images default to the
    // cheapest EDIT model rather than the one that produced the
    // original, because the original was a text-to-image model and
    // reusing it would ignore the current render entirely.
    const regenModels: MediaModelOption[] =
        asset.kind === 'image'
            ? maskDataUrl
                ? IMAGE_MASK_MODELS
                : IMAGE_EDIT_MODELS
            : asset.kind === 'video'
              ? VIDEO_GENERATE_MODELS
              : [];
    // Empty means "let One decide". Only set when the operator
    // deliberately overrides, so the default path stays One's call.
    const [overrideModelId, setOverrideModelId] = useState('');

    const current =
        asset.versions.find((v) => v.version === asset.currentVersion) ??
        asset.versions[asset.versions.length - 1];

    const authHeaders = useCallback(
        async () => ({
            'Content-Type': 'application/json',
            Authorization: `Bearer ${await getToken()}`,
        }),
        [getToken],
    );

    const handleRevert = useCallback(
        async (version: number) => {
            setBusy(true);
            setNotice(null);
            try {
                const res = await fetch('/api/marketing/media/assets', {
                    method: 'POST',
                    headers: await authHeaders(),
                    body: JSON.stringify({
                        action: 'revert',
                        campaignId: asset.campaignId,
                        assetId: asset.assetId,
                        version,
                    }),
                });
                const json = await res.json();
                if (!res.ok) throw new Error(json?.message ?? 'Revert failed.');
                onChanged();
            } catch (e) {
                setNotice(e instanceof Error ? e.message : 'Revert failed.');
            } finally {
                setBusy(false);
            }
        },
        [asset.assetId, asset.campaignId, authHeaders, onChanged],
    );

    const handleCompile = useCallback(
        async (feedback: string): Promise<CompiledPreview> => {
            const res = await fetch('/api/marketing/media/compile-feedback', {
                method: 'POST',
                headers: await authHeaders(),
                body: JSON.stringify({
                    kind: asset.kind,
                    currentPrompt: current?.prompt ?? '',
                    feedback,
                    priorFeedback: asset.versions
                        .map((v) => v.editInstruction)
                        .filter((x): x is string => typeof x === 'string'),
                    // One picks the tier. The operator has no basis for
                    // judging whether this edit warrants 45 credits or
                    // 85; the model that just read the feedback does.
                    candidateModels: regenModels.map((m) => ({
                        id: m.id,
                        label: m.label,
                        credits: m.credits,
                        description: m.description,
                    })),
                }),
            });
            const json = await res.json();
            if (!res.ok && !json?.nextPrompt) {
                throw new Error(json?.message ?? 'Could not compile the feedback.');
            }
            return {
                ok: Boolean(json.ok),
                nextPrompt: json.nextPrompt,
                paramDeltas: json.paramDeltas ?? {},
                rationale: json.rationale ?? '',
                selectedModelId: json.selectedModelId ?? null,
                modelRationale: json.modelRationale ?? null,
                detail: json.detail,
            };
        },
        [asset.kind, asset.versions, current?.prompt, regenModels, authHeaders],
    );

    const handleRegenerate = useCallback(
        async (compiled: CompiledPreview, feedback: string) => {
            setBusy(true);
            setNotice(null);
            // Audio has no separate edit tier — re-synthesis from the
            // rewritten script IS the edit — so it reuses its own model.
            // Precedence: an explicit operator override, then One's
            // choice, then whatever produced the current version.
            const model =
                asset.kind === 'audio'
                    ? (current?.model ?? '')
                    : overrideModelId || compiled.selectedModelId || regenModels[0]?.id || (current?.model ?? '');
            try {
                // 2. Render. This route bills the caller. Video returns a job
                // handle rather than a URL, so `renderMedia` polls it to
                // completion; images resolve immediately.
                const { url } = await renderMedia({
                    kind: asset.kind,
                    prompt: compiled.nextPrompt,
                    model,
                    headers: await authHeaders(),
                    // The source image is what makes this an edit rather than
                    // a fresh render.
                    ...(asset.kind !== 'audio' && current?.storageUrl
                        ? { imageUrl: current.storageUrl }
                        : {}),
                    ...(asset.kind === 'image' && maskDataUrl ? { maskUrl: maskDataUrl } : {}),
                    extra: { ...compiled.paramDeltas },
                });

                // 3. Record it. A failure here means the operator has
                // paid for a render we did not save, so surface the URL
                // instead of losing it silently.
                const appendRes = await fetch('/api/marketing/media/assets', {
                    method: 'POST',
                    headers: await authHeaders(),
                    body: JSON.stringify({
                        action: 'append',
                        campaignId: asset.campaignId,
                        assetId: asset.assetId,
                        storageUrl: url,
                        prompt: compiled.nextPrompt,
                        model,
                        editInstruction: feedback,
                    }),
                });
                const appendJson = await appendRes.json();
                if (!appendRes.ok) {
                    setNotice(
                        `The render succeeded but could not be saved (${
                            appendJson?.message ?? 'unknown error'
                        }). Your media is at: ${url}`,
                    );
                    return;
                }
                onChanged();
            } catch (e) {
                if (e instanceof RenderTimeoutError) {
                    setNotice(e.message);
                    return;
                }
                throw e;
            } finally {
                setBusy(false);
            }
        },
        [asset, current?.model, current?.storageUrl, overrideModelId, regenModels, maskDataUrl, authHeaders, onChanged],
    );

    const handleDelete = useCallback(async () => {
        setBusy(true);
        setNotice(null);
        try {
            const token = await getToken();
            const res = await fetch(
                `/api/marketing/media/assets?campaignId=${encodeURIComponent(asset.campaignId)}&assetId=${encodeURIComponent(asset.assetId)}`,
                { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
            );
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.message ?? `Delete failed (${res.status})`);
            // Parent refetches; this card unmounts, so no state reset.
            onChanged();
        } catch (e) {
            setNotice(e instanceof Error ? e.message : 'Could not delete this asset.');
            setConfirmDelete(false);
            setBusy(false);
        }
    }, [asset.campaignId, asset.assetId, getToken, onChanged]);

    return (
        <article
            className={cn(
                'space-y-3',
                chrome === 'card' && 'rounded-xl border border-border bg-card/50 p-3',
                className,
            )}
        >
            <header className="flex items-center justify-between gap-2">
                <span className="text-[11px] uppercase tracking-wider text-foreground/50">
                    {asset.kind}
                </span>
                <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-foreground/40">
                        {asset.assetId.slice(0, 8)}
                    </span>
                    {confirmDelete ? (
                        <span className="flex items-center gap-1">
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => void handleDelete()}
                                className="rounded border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                            >
                                {busy ? 'Deleting…' : 'Delete'}
                            </button>
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => setConfirmDelete(false)}
                                className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground hover:bg-muted disabled:opacity-50"
                            >
                                Keep
                            </button>
                        </span>
                    ) : (
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => setConfirmDelete(true)}
                            // States the consequence, because it is not
                            // recoverable and the versions go with it.
                            title={`Delete this ${asset.kind} and all ${asset.versions.length} version(s). Cannot be undone.`}
                            aria-label={`Delete this ${asset.kind}`}
                            className="rounded border border-transparent px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-foreground/40 hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
                        >
                            Delete
                        </button>
                    )}
                </div>
            </header>

            <MediaPreview
                kind={asset.kind}
                status={asset.status}
                url={current?.storageUrl}
                prompt={current?.prompt ?? ''}
            />

            {notice && (
                <p className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] break-all text-amber-800 dark:text-amber-200">
                    {notice}
                </p>
            )}

            <MediaVersionSlider
                versions={asset.versions}
                currentVersion={asset.currentVersion}
                onSelect={handleRevert}
                busy={busy}
            />

            {asset.kind === 'image' && current?.storageUrl && (
                <div className="space-y-2">
                    <button
                        type="button"
                        onClick={() => {
                            setMasking((v) => !v);
                            if (masking) setMaskDataUrl(null);
                        }}
                        disabled={busy}
                        className="text-[10px] uppercase tracking-wider text-foreground/50 hover:text-foreground"
                    >
                        {masking ? 'Cancel mask' : 'Edit a region →'}
                    </button>

                    {masking && (
                        <>
                            <MaskCanvas
                                imageUrl={current.storageUrl}
                                onMaskChange={setMaskDataUrl}
                                disabled={busy}
                            />
                            {maskDataUrl && (
                                <p className="text-[10px] text-brand-700 dark:text-brand-300">
                                    Mask ready. Your next regeneration will change only the painted
                                    area — describe what should appear there in the feedback box.
                                </p>
                            )}
                        </>
                    )}
                </div>
            )}

            {regenModels.length > 0 && (
                <label className="flex flex-wrap items-center gap-2 text-[11px] text-foreground/50">
                    <span className="uppercase tracking-wider">
                        {asset.kind === 'image' ? 'Edit model' : 'Regenerate with'}
                    </span>
                    <select
                        value={overrideModelId}
                        onChange={(e) => setOverrideModelId(e.target.value)}
                        disabled={busy}
                        className="rounded border border-border bg-card/50 px-2 py-1 text-[11px] text-foreground/80"
                    >
                        {/* Default is One's judgement, not a fixed tier.
                            The operator can pin one, but is not asked to
                            price an edit they have not seen yet. */}
                        <option value="">One decides</option>
                        {regenModels.map((m) => (
                            <option key={m.id} value={m.id}>
                                {m.label} · {priceLabel(m)}
                            </option>
                        ))}
                    </select>
                </label>
            )}

            <FeedbackBox
                currentPrompt={current?.prompt ?? ''}
                onCompile={handleCompile}
                onRegenerate={handleRegenerate}
                disabled={busy || asset.status === 'generating'}
            />
        </article>
    );
}

export default MediaAssetCard;
