/**
 * Pure attachment-compatibility helper for the Playground workbench.
 *
 * Given a {@link ModelRegistryEntry} and a MIME type, return one of three
 * levels describing how well the model can ingest that attachment:
 *
 *   - `'full'`    The model natively accepts the attachment's modality.
 *   - `'partial'` The model is text-only but the attachment is itself text
 *                 (e.g. `.txt`, `.md`, `.csv`, `.json`); we can transcribe /
 *                 inline the file as plain text without losing meaning.
 *   - `'none'`    The model is text-only and the attachment is a binary
 *                 modality (image / audio / video / arbitrary binary) the
 *                 model cannot interpret at all.
 *
 * The result feeds the per-column compatibility badges in the attachment
 * dock (green ✓ / yellow ⚠ / red ✗). The helper is pure and side-effect
 * free so it is safe to call from both client and server contexts.
 */

import type { ModelRegistryEntry } from './types';

/** Coarse compatibility verdict rendered as a badge. */
export type AttachmentCompat = 'full' | 'partial' | 'none';

/** Aggregate per-modality matrix on the model, defaulted to all-false. */
function attachmentSupport(model: ModelRegistryEntry): {
    image: boolean;
    audio: boolean;
    video: boolean;
    text: boolean;
} {
    const s = model.supportsAttachments;
    return {
        image: s?.image ?? false,
        audio: s?.audio ?? false,
        video: s?.video ?? false,
        text: s?.text ?? false,
    };
}

/**
 * Categorise a MIME type into one of our four input modalities. Anything
 * we can't classify falls through to `'binary'`, which is treated the
 * same as image / audio / video for the purposes of this helper (i.e.
 * requires a multimodal model to ingest directly).
 */
function mimeCategory(mimeType: string): 'image' | 'audio' | 'video' | 'text' | 'binary' {
    const lower = (mimeType ?? '').toLowerCase();
    if (lower.startsWith('image/')) return 'image';
    if (lower.startsWith('audio/')) return 'audio';
    if (lower.startsWith('video/')) return 'video';
    // A short allow-list of "text-ish" MIME types we treat as inlineable
    // plain text. This deliberately errs on the side of "text" so the dock
    // shows a yellow ⚠ badge (transcribable) instead of red ✗ (rejected)
    // for common dev file formats.
    if (
        lower === 'text/plain' ||
        lower === 'text/markdown' ||
        lower === 'text/csv' ||
        lower === 'text/html' ||
        lower === 'application/json' ||
        lower === 'application/javascript' ||
        lower === 'application/typescript' ||
        lower === 'application/xml' ||
        lower.startsWith('text/') ||
        lower.endsWith('+json') ||
        lower.endsWith('+xml')
    ) {
        return 'text';
    }
    return 'binary';
}

/**
 * Decide compatibility for a single `(model, mime)` pair.
 *
 * Rules:
 *   - If the model supports the attachment's modality natively → `'full'`.
 *   - Else if the attachment is a text-classified file AND the model
 *     supports `text` input → `'partial'` (we can inline it as text).
 *   - Else → `'none'` (binary modality the model cannot interpret).
 */
export function attachmentCompatibility(
    model: ModelRegistryEntry,
    mimeType: string,
): AttachmentCompat {
    const support = attachmentSupport(model);
    const category = mimeCategory(mimeType);

    switch (category) {
        case 'image':
            return support.image ? 'full' : 'none';
        case 'audio':
            return support.audio ? 'full' : 'none';
        case 'video':
            return support.video ? 'full' : 'none';
        case 'text':
            // Text files: full when the model advertises text support, else
            // `none` — there's no graceful fallback for a model that can't
            // take text at all (none in the registry today, but defensive).
            return support.text ? 'full' : 'none';
        case 'binary':
        default:
            // Unclassified binary blob. A truly multimodal model (image+audio+
            // video) might still accept it; otherwise we can't help.
            if (support.image && support.audio && support.video) return 'full';
            if (support.text) return 'partial';
            return 'none';
    }
}

/**
 * Aggregate a model against a list of attachments. Returns the worst-case
 * verdict so the column badge reflects "can this column handle everything
 * staged in the dock right now".
 *
 *   - All attachments `'full'`     → `'full'`  (green ✓)
 *   - Any `'none'` present          → `'none'`  (red ✗)
 *   - Otherwise                     → `'partial'` (yellow ⚠)
 */
export function columnAttachmentCompatibility(
    model: ModelRegistryEntry,
    mimeTypes: readonly string[],
): AttachmentCompat {
    if (mimeTypes.length === 0) return 'full';
    let sawPartial = false;
    for (const mime of mimeTypes) {
        const v = attachmentCompatibility(model, mime);
        if (v === 'none') return 'none';
        if (v === 'partial') sawPartial = true;
    }
    return sawPartial ? 'partial' : 'full';
}