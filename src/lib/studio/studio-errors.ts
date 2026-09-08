/**
 * Shared studio error UX helpers.
 *
 * All five studios hit routes that return a short machine-readable `code`
 * (or `error`) on failure: `model_fallback`, `insufficient_credits`,
 * `rate_limited`, `upstream_failed`, `content_blocked`, `concurrency_limited`,
 * `upstream_*` variants, etc. The raw upstream message is for operators, not
 * users — so every studio resolves a code → friendly, actionable message the
 * same way, mirroring the per-code copy already in the Playground error block
 * (`src/app/playground/page.tsx`). One source of truth, used by every studio.
 *
 * The friendly text answers clarify.md's three questions:
 *   1. what failed
 *   2. why (when known and useful)
 *   3. how to recover / what alternative remains
 */

export type StudioErrorKind =
    | 'model_fallback'
    | 'insufficient_credits'
    | 'rate_limited'
    | 'concurrency_limited'
    | 'upstream_failed'
    | 'upstream_timeout'
    | 'upstream_error'
    | 'content_blocked'
    | 'missing_provider_key'
    | 'auth_required'
    | 'unknown';

/** The recovery action a UI can offer inline next to the friendly message. */
export type StudioErrorAction =
    | 'switch_model'
    | 'top_up'
    | 'retry'
    | 'wait'
    | 'none';

export interface ResolvedStudioError {
    /** Stable, lowercase code — drives the friendly copy below. */
    kind: StudioErrorKind;
    /** User-facing title (short, plain language). */
    title: string;
    /** User-facing description (what happened + recovery). */
    description: string;
    /** The inline action that makes sense for this failure, if any. */
    action: StudioErrorAction;
    /**
     * The original raw code string from the API, for diagnostics only.
     * Populated even when `kind === 'unknown'` — see the format note on
     * `throwStudioError` for the synthetic `status NNN: body…` form.
     */
    rawCode?: string;
    /**
     * HTTP status code of the failed response. Optional because the
     * function can be called from a thrown network error (no status
     * available). When present, this is the most useful diagnostic
     * field — a 502 with no body and a 200 with a missing image are
     * very different failures.
     */
    status?: number;
    /**
     * First 200 chars of the response body when JSON parsing failed.
     * Most upstream errors return JSON, but a CDN/proxy 502 or a
     * truncated response is a plain string and that string is the
     * only signal of the actual cause.
     */
    bodySnippet?: string;
}

/**
 * Friendly copy per code. Mirrors the Playground's mapping and adds the
 * studio-specific codes the routes emit (`concurrency_limited`, `content_blocked`,
 * `upstream_timeout`, …). When a code is unrecognized we fall back to a
 * generic-but-still-honest "something went wrong, try again" — never the raw
 * upstream text, which is for operators.
 */
const FRIENDLY: Record<StudioErrorKind, { title: string; description: string; action: StudioErrorAction }> = {
    model_fallback: {
        title: 'Model unavailable on your plan',
        description: "This model isn't available on your current plan. Try another model, or upgrade to unlock it.",
        action: 'switch_model',
    },
    insufficient_credits: {
        title: 'Out of credits',
        description: "You're out of credits for this workspace. Top up to continue generating.",
        action: 'top_up',
    },
    rate_limited: {
        title: 'Slow down a moment',
        description: 'Too many requests in a short window. Wait a few seconds and try again.',
        action: 'wait',
    },
    concurrency_limited: {
        title: 'A generation is already running',
        description: 'You can only run one of these at a time. Wait for the active job to finish, then retry.',
        action: 'wait',
    },
    upstream_failed: {
        title: 'The model provider failed',
        description: 'The upstream service could not complete the request. Please retry, or pick another model.',
        action: 'retry',
    },
    upstream_timeout: {
        title: 'Generation timed out',
        description: 'The job did not finish within the polling window. Please retry — long or complex prompts can need more time.',
        action: 'retry',
    },
    upstream_error: {
        title: 'Generation failed',
        description: 'The upstream service returned an error. Please retry, or try a different model.',
        action: 'retry',
    },
    content_blocked: {
        title: 'Content blocked by safety policy',
        description: 'The output was flagged by content moderation. Adjust your prompt and try again.',
        action: 'none',
    },
    missing_provider_key: {
        title: 'Service not configured',
        description: 'This model is not configured on the server yet. Try another model, or contact support.',
        action: 'switch_model',
    },
    auth_required: {
        title: 'Sign in required',
        description: 'You must be signed in to use this studio.',
        action: 'none',
    },
    unknown: {
        title: 'Something went wrong',
        description: 'We could not complete that. Please retry, and try another model if it keeps failing.',
        action: 'retry',
    },
};

/** Normalize the various shapes the studio routes return into a known code. */
function normalizeCode(code: unknown, message: unknown): StudioErrorKind {
    const c = typeof code === 'string' ? code.toLowerCase() : '';
    const m = typeof message === 'string' ? message.toLowerCase() : '';

    if (c.includes('model_fallback')) return 'model_fallback';
    if (c.includes('insufficient_credits')) return 'insufficient_credits';
    if (c.includes('rate_limited') || c.includes('rate_limit')) return 'rate_limited';
    if (c.includes('concurrency_limited')) return 'concurrency_limited';
    if (c.includes('content_blocked')) return 'content_blocked';
    if (c.includes('upstream_timeout') || c.includes('timeout')) return 'upstream_timeout';
    if (c.includes('upstream_failed')) return 'upstream_failed';
    if (c.includes('upstream_')) return 'upstream_error'; // upstream_task_failed, upstream_create_failed, upstream_poll_failed, upstream_invalid_response, upstream_request_failed
    if (c.includes('missing_dashscope_key') || c.includes('missing_llmapi_key') || c.includes('missing_provider')) return 'missing_provider_key';
    if (c.includes('auth') || m.includes('authentication required') || m.includes('sign in')) return 'auth_required';
    // The route's catch block returns `code: 'internal_error'` when an
    // exception escaped — surface it as a recoverable upstream error so
    // the user gets a sensible message rather than the generic
    // "Something went wrong".
    if (c.includes('internal_error')) return 'upstream_error';
    if (c.length > 0) return 'unknown';
    // Fall back to message sniffing when no code at all (older routes / network errors).
    if (m.includes('insufficient credits') || m.includes('out of credits')) return 'insufficient_credits';
    if (m.includes('rate limit')) return 'rate_limited';
    if (m.includes('failed to fetch') || m.includes('networkerror') || m.includes('load failed')) return 'upstream_error';
    return 'unknown';
}

/**
 * Resolve a fetch `Response` (or a thrown error) into a friendly, actionable
 * message. The studios pass the parsed JSON body (and the thrown error as a
 * fallback) so we never surface raw upstream text to the user.
 *
 * Usage:
 *   const err = resolveStudioError(data?.code ?? data?.error, data?.message, thrown);
 *   toast({ title: err.title, description: err.description, variant: 'destructive' });
 */
export function resolveStudioError(
    code: unknown,
    message: unknown,
    thrown?: unknown,
): ResolvedStudioError {
    const kind = normalizeCode(code, message);
    const friendly = FRIENDLY[kind];
    // Keep the raw code for diagnostics only — never shown to the user as the
    // primary message. The thrown error's message is also operator-facing.
    void thrown;
    return {
        kind,
        title: friendly.title,
        description: friendly.description,
        action: friendly.action,
        rawCode: typeof code === 'string' ? code : undefined,
    };
}

/**
 * Helper for the common studio pattern: parse a non-OK fetch response, throw
 * an Error carrying the resolved kind so the catch block can route on it. The
 * thrown `Error.message` is the friendly description (already user-facing), and
 * the kind is attached as a non-enumerable property for callers that need to
 * branch (e.g. to show an inline Retry only on `retry`).
 */
export interface StudioApiError extends Error {
    kind: StudioErrorKind;
    /** Friendly, user-facing title (e.g. "Out of credits"). */
    title: string;
    action: StudioErrorAction;
    rawCode?: string;
    status?: number;
    bodySnippet?: string;
}

export async function throwStudioError(res: Response, fallbackMessage: string): Promise<never> {
    // Read the body once, as text. If it parses as JSON we get the
    // structured shape; if it does not (the CDN/Edge returning an HTML
    // error page, a truncated response, a network proxy returning a
    // 0-byte body) we still keep the raw text for the operator. The
    // previous version's `await res.json()` swallowed that case and
    // left the operator with `kind: 'unknown', raw: undefined`.
    const rawText = await res.text().catch(() => '');
    const snippet = rawText.slice(0, 200);
    let parsed: any = null;
    if (rawText) {
        try {
            parsed = JSON.parse(rawText);
        } catch {
            parsed = null;
        }
    }
    const code = parsed?.code ?? parsed?.error;
    const rawMsg = typeof parsed?.message === 'string' ? parsed.message : undefined;
    const message = parsed?.message ?? parsed?.error ?? fallbackMessage;
    const resolved = resolveStudioError(code, message);

    let finalDescription = resolved.description;
    if (rawMsg && !rawMsg.includes('Video synthesis failed upstream') && rawMsg.length > 0 && rawMsg.length < 250) {
        // Clean up internal noise from rawMsg if present
        const cleanMsg = rawMsg.replace(/LLMAPI video create returned \d+:?\s*/i, '').trim();
        if (cleanMsg) {
            finalDescription = `${resolved.description} (${cleanMsg})`;
        }
    }

    // Synthetic rawCode when the body wasn't structured. The
    // `status NNN:` prefix keeps it grep-able in logs; the body
    // snippet (escaped of newlines) is the actual cause when one
    // exists. This is the only thing the operator sees when kind is
    // `unknown`, and it has to be enough to debug from.
    const syntheticRaw = typeof code === 'string' && code.length > 0
        ? code
        : (() => {
              const head = `status ${res.status}`;
              if (!snippet) return head;
              const oneLine = snippet.replace(/[\r\n\t]+/g, ' ').slice(0, 180);
              return `${head}: ${oneLine}`;
          })();

    const err = new Error(finalDescription) as StudioApiError;
    err.kind = resolved.kind;
    err.title = resolved.title;
    err.action = resolved.action;
    err.rawCode = syntheticRaw;
    err.status = res.status;
    if (snippet) err.bodySnippet = snippet;
    // eslint-disable-next-line no-throw-literal
    throw err;
}