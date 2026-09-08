/**
 * Model lists for the media editor, derived from the studio registries.
 *
 * Derived rather than hardcoded so a registry addition shows up without
 * a code change — an earlier hardcoded list of three image models
 * missed `z-image-turbo` entirely, which at 15 credits is half the
 * price of what was defaulting.
 *
 * The important split is **capability**. The registries mix models that
 * cannot be used interchangeably:
 *
 *   - `t2i` / `t2v`  — generate from a prompt alone. Correct for a
 *                      FIRST render.
 *   - `imageEdit`    — modify a source image. Correct for a
 *                      REGENERATION, where "add a user in front of the
 *                      computer" means *this* picture with a user
 *                      added, not a fresh picture of that description.
 *   - `i2v`          — animate a source image.
 *
 * Offering the wrong class is not a cosmetic error: an edit model with
 * no source image fails upstream after taking the credits, and a t2i
 * model on a regeneration silently discards the image the operator was
 * iterating on.
 */

import imageModelsData from '@/data/studio/image-models.json';
import videoModelsData from '@/data/studio/video-models.json';

export interface MediaModelOption {
    id: string;
    label: string;
    /** Flat credit cost, or cost per second for video. */
    credits: number;
    /** True when `credits` is per-second rather than per-render. */
    perSecond?: boolean;
    maxDurationSec?: number;
    /** Registry description — what this tier is actually good at. Fed to One. */
    description?: string;
    /** Upstream provider. Used to exclude tiers the account cannot reach. */
    provider?: string;
}

interface ImageRegistryEntry {
    id: string;
    displayName?: string;
    capabilities?: string[];
    credits?: number;
    description?: string;
    provider?: string;
}

/** Video entries use `capability` (singular) and `creditsPerSec`. */
interface VideoRegistryEntry {
    id: string;
    displayName?: string;
    provider?: string;
    capability?: string;
    creditsPerSec?: number;
    maxDurationSec?: number;
    description?: string;
}

const images = imageModelsData as ImageRegistryEntry[];

/**
 * The two registries have different top-level shapes: images are a bare
 * array, videos are an object carrying `providerCaps`, `creditTiers`
 * and `models`. Read defensively rather than assuming either.
 */
const videos: VideoRegistryEntry[] = Array.isArray(videoModelsData)
    ? (videoModelsData as VideoRegistryEntry[])
    : ((videoModelsData as { models?: VideoRegistryEntry[] }).models ?? []);

function fromImage(m: ImageRegistryEntry): MediaModelOption {
    return {
        id: m.id,
        label: m.displayName ?? m.id,
        credits: m.credits ?? 0,
        ...(m.description ? { description: m.description } : {}),
        ...(m.provider ? { provider: m.provider } : {}),
    };
}

function fromVideo(m: VideoRegistryEntry): MediaModelOption {
    return {
        id: m.id,
        label: m.displayName ?? m.id,
        credits: m.creditsPerSec ?? 0,
        perSecond: true,
        ...(m.maxDurationSec !== undefined ? { maxDurationSec: m.maxDurationSec } : {}),
        ...(m.description ? { description: m.description } : {}),
        ...(m.provider ? { provider: m.provider } : {}),
    };
}

const byPrice = (a: MediaModelOption, b: MediaModelOption) => a.credits - b.credits;

/** Text-to-image. For a first render. Cheapest first, so the default is cheapest. */
export const IMAGE_GENERATE_MODELS: MediaModelOption[] = images
    .filter((m) => (m.capabilities ?? []).includes('t2i'))
    .map(fromImage)
    .sort(byPrice);

/** Image editing. For regenerating an existing asset from feedback. */
export const IMAGE_EDIT_MODELS: MediaModelOption[] = images
    .filter((m) => (m.capabilities ?? []).includes('imageEdit'))
    .map(fromImage)
    .sort(byPrice);

/**
 * Edit models that honour an inpainting mask.
 *
 * Masking is implemented by passing the mask as a second inline image
 * with an instruction explaining what it is — a Gemini `generateContent`
 * shape. The DashScope edit models take their image inputs positionally
 * and have no notion of a mask channel, so a mask sent to
 * `qwen-image-edit` is not rejected; it is treated as another reference
 * image and quietly ignored. The render then succeeds while editing the
 * whole frame, which is worse than failing.
 *
 * So a masked regeneration is restricted to these.
 */
export const IMAGE_MASK_MODELS: MediaModelOption[] = IMAGE_EDIT_MODELS.filter(
    (m) => m.provider === 'google-direct',
);

/**
 * Providers offered for video generation.
 *
 * LLMAPI's video models are catalogued and verified — `POST /v1/videos`
 * resolves them and rejects only bad parameters. The earlier 404s were
 * caused by using the wrong endpoint (`/v1/video/generations` instead of
 * `/v1/videos`). That has been fixed and LLMAPI video generation is
 * verified end to end.
 *
 * AMS/DashScope is verified end to end — a real video has been generated
 * and recorded through it. Veo (`google-direct`) is likewise verified:
 * submission, polling and re-hosting were all exercised against the live
 * API before being offered here.
 */
const REACHABLE_VIDEO_PROVIDERS = new Set(['alibaba', 'google-direct', 'llmapi']);

/**
 * Text-to-video. Capped to the cheapest handful: even after the
 * provider filter, a long dropdown turns a two-click action into a
 * research task.
 */
export const VIDEO_GENERATE_MODELS: MediaModelOption[] = videos
    .filter((m) => m.capability === 't2v' && REACHABLE_VIDEO_PROVIDERS.has(String(m.provider)))
    .map(fromVideo)
    .sort(byPrice)
    .slice(0, 6);

/** Image-to-video, for animating a still the operator already has. */
export const VIDEO_FROM_IMAGE_MODELS: MediaModelOption[] = videos
    .filter((m) => m.capability === 'i2v' && REACHABLE_VIDEO_PROVIDERS.has(String(m.provider)))
    .map(fromVideo)
    .sort(byPrice)
    .slice(0, 6);

/** "30 credits" or "120 credits/sec · max 10s". */
export function priceLabel(m: MediaModelOption): string {
    if (!m.perSecond) return `${m.credits} credits`;
    const max = m.maxDurationSec ? ` · max ${m.maxDurationSec}s` : '';
    return `${m.credits} credits/sec${max}`;
}
