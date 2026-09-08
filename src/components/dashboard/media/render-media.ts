/**
 * Drive a studio render to a finished media URL.
 *
 * Images return their URL from the POST. **Video does not** — it answers
 * `{ status: 'queued', taskId, ... }` and the caller has to poll
 * `GET /api/studio/video?taskId=…` until it reports `completed`.
 *
 * Treating that job handle as a finished render is what produced
 * "the video request succeeded but carried no media URL": the POST was
 * a 200, the payload was correct, and the caller was simply reading it
 * as the wrong kind of thing.
 *
 * Two consequences worth knowing:
 *
 *   - **Credits are deducted on the poll that observes completion**, not
 *     on submit. Abandoning a poll therefore leaves a rendered video
 *     that was never billed and never recorded — so a timeout surfaces
 *     the task id rather than discarding it.
 *   - The queued payload carries every parameter the GET needs, so the
 *     poll query is built from the response rather than re-derived from
 *     the request. Re-deriving would drift the moment the route adds a
 *     field.
 */

export type RenderKind = 'image' | 'video' | 'audio' | 'music';

export interface RenderRequest {
    kind: RenderKind;
    prompt: string;
    model: string;
    /** Video only. Seconds. */
    durationSec?: number;
    /** Audio only. The script to synthesise; the TTS route reads `text`. */
    text?: string;
    /** Image/video edit source. */
    imageUrl?: string;
    /** Inpainting mask (data URL or https). Image kinds only. */
    maskUrl?: string;
    /** Extra body fields, e.g. compiled parameter deltas. */
    extra?: Record<string, unknown>;
    headers: Record<string, string>;
    /** Called with elapsed seconds while a video job runs. */
    onProgress?: (elapsedSec: number) => void;
    signal?: AbortSignal;
}

export interface RenderResult {
    url: string;
    /** Present when the render went through the async path. */
    taskId?: string;
}

export class RenderTimeoutError extends Error {
    constructor(
        message: string,
        readonly taskId: string,
    ) {
        super(message);
        this.name = 'RenderTimeoutError';
    }
}

/** Poll cadence. Video jobs typically take 30–180s. */
const POLL_INTERVAL_MS = 5000;
/** Ceiling. Beyond this we hand the task id back rather than wait forever. */
const POLL_TIMEOUT_MS = 6 * 60 * 1000;

function imageUrlFrom(data: unknown): string | null {
    if (!data || typeof data !== 'object') return null;
    const d = data as Record<string, unknown>;
    const arr = d.data;
    if (Array.isArray(arr) && arr[0] && typeof arr[0] === 'object') {
        const first = arr[0] as Record<string, unknown>;
        if (typeof first.url === 'string') return first.url;
    }
    return typeof d.imageUrl === 'string' ? d.imageUrl : null;
}

/** Build the poll query from the queued payload, not from the request. */
function pollQuery(queued: Record<string, unknown>): string {
    const params = new URLSearchParams();
    for (const key of [
        'taskId',
        'provider',
        'model',
        'userId',
        'estimatedCredits',
        'duration',
        'prompt',
        'cameraMotion',
        'aspectRatio',
    ]) {
        const v = queued[key];
        if (v !== undefined && v !== null && v !== '') params.set(key, String(v));
    }
    return params.toString();
}

const ROUTE_FOR_KIND: Record<RenderKind, string> = {
    image: '/api/studio/image',
    video: '/api/studio/video',
    audio: '/api/tts',
    music: '/api/studio/music',
};

export async function renderMedia(req: RenderRequest): Promise<RenderResult> {
    const route = ROUTE_FOR_KIND[req.kind];

    const body: Record<string, unknown> = {
        prompt: req.prompt,
        model: req.model,
        ...(req.kind === 'video' ? { duration: req.durationSec ?? 5 } : {}),
        ...(req.kind === 'music' ? { duration: req.durationSec ?? 30 } : {}),
        ...(req.kind === 'image' ? { n: 1 } : {}),
        // The TTS route reads `text`, not `prompt`. Both are sent so a
        // caller does not have to know which; the route ignores the other.
        ...(req.kind === 'audio' ? { text: req.text ?? req.prompt } : {}),
        ...(req.imageUrl ? { imageUrl: req.imageUrl } : {}),
        ...(req.maskUrl ? { maskUrl: req.maskUrl } : {}),
        ...(req.extra ?? {}),
    };

    const res = await fetch(route, {
        method: 'POST',
        headers: req.headers,
        body: JSON.stringify(body),
        signal: req.signal,
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    if (!res.ok) {
        throw new Error(
            (json.message as string) ?? (json.error as string) ?? `${req.kind} generation failed.`,
        );
    }

    if (req.kind === 'image') {
        const url = imageUrlFrom(json);
        if (!url) throw new Error('The image generated but returned no URL.');
        return { url };
    }

    if (req.kind === 'audio' || req.kind === 'music') {
        const url = typeof json.audioUrl === 'string' ? json.audioUrl : '';
        if (!url) {
            throw new Error(
                `The ${req.kind === 'music' ? 'music track' : 'voiceover'} generated but returned no URL — keys: ${Object.keys(json).join(', ')}.`,
            );
        }
        return { url };
    }

    // Video may complete inline on a fast model; take the URL if it is there.
    if (typeof json.videoUrl === 'string' && json.videoUrl) {
        return { url: json.videoUrl };
    }

    const taskId = typeof json.taskId === 'string' ? json.taskId : '';
    if (!taskId) {
        throw new Error(
            `The video request succeeded but carried neither a URL nor a task id — keys: ${Object.keys(json).join(', ')}.`,
        );
    }

    const query = pollQuery(json);
    const startedAt = Date.now();

    for (;;) {
        if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
            throw new RenderTimeoutError(
                `The video is still rendering after ${Math.round(POLL_TIMEOUT_MS / 60000)} minutes. ` +
                    `It has not been lost — task ${taskId} continues on the provider, and the Studio ` +
                    `will show it when it finishes. Do not resubmit; that would render and charge twice.`,
                taskId,
            );
        }

        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        req.onProgress?.(Math.round((Date.now() - startedAt) / 1000));

        const pollRes = await fetch(`/api/studio/video?${query}`, {
            headers: req.headers,
            signal: req.signal,
        });
        const pollJson = (await pollRes.json().catch(() => ({}))) as Record<string, unknown>;

        if (!pollRes.ok) {
            throw new Error(
                (pollJson.message as string) ??
                    (pollJson.error as string) ??
                    `Polling the video job failed (${pollRes.status}).`,
            );
        }

        const status = typeof pollJson.status === 'string' ? pollJson.status : '';
        if (status === 'completed') {
            const url = typeof pollJson.videoUrl === 'string' ? pollJson.videoUrl : '';
            if (!url) {
                throw new Error(
                    `The video reported completed without a URL — keys: ${Object.keys(pollJson).join(', ')}.`,
                );
            }
            return { url, taskId };
        }
        if (status === 'failed' || status === 'error') {
            throw new Error((pollJson.message as string) ?? 'The video job failed upstream.');
        }
        // in_progress / queued / anything unrecognised → keep waiting until
        // the timeout, which is the only state that ends this loop badly.
    }
}
