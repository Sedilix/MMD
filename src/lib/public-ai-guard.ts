/**
 * Abuse guard for model-calling routes that must stay public.
 *
 * A handful of routes run a Gemini call for visitors who are not signed
 * in — the marketing pages generate copy before anyone has an account,
 * and requiring auth there would defeat their purpose. So the exposure
 * cannot be closed with authentication; it has to be bounded instead.
 *
 * Unbounded, an unauthenticated route that calls a paid model is a bill
 * anyone on the internet can run up, and there is no signal that it is
 * happening until the invoice arrives. `/api/gemini-fallback` was the
 * worst of them: it forwarded an arbitrary `prompt` to an arbitrary
 * `models` list and returned the raw response, which is a general
 * Gemini proxy on our key with the price tag pointed at us.
 *
 * Two limits, both cheap:
 *
 *   1. Per-IP rate limiting. Imperfect behind NAT and defeated by a
 *      botnet, but it turns "free forever" into "annoying", which is
 *      the whole of the return here.
 *   2. An input cap. Prompt length drives cost directly, and no
 *      legitimate caller on these routes needs thousands of characters.
 *
 * What this deliberately does NOT do is authenticate. These routes are
 * public by design; pretending otherwise would break three live pages.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { isRateLimited, MINUTE_MS } from '@/lib/rate-limit';

/** Longest prompt a public route will forward to a model. */
export const MAX_PUBLIC_PROMPT_CHARS = 4000;

/**
 * Best-effort client address.
 *
 * `x-forwarded-for` is client-settable in principle, but it is rewritten
 * by the hosting proxy, and the leftmost entry is the one it observed.
 * Falls back to a single shared bucket so a request with no usable
 * address is still limited rather than exempt — failing open on the
 * identifier would make the header a bypass.
 */
export function clientKey(req: NextRequest | Request): string {
    const fwd = req.headers.get('x-forwarded-for') ?? '';
    const first = fwd.split(',')[0]?.trim();
    if (first) return first;
    return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

/** Trim a caller-supplied string to the public cap. Never throws. */
export function capPrompt(value: unknown, max = MAX_PUBLIC_PROMPT_CHARS): string {
    if (typeof value !== 'string') return '';
    return value.length > max ? value.slice(0, max) : value;
}

export interface PublicAiGuardOptions {
    /** Requests permitted per window, per client. */
    limit?: number;
    windowMs?: number;
}

/**
 * Rate-limit a public model route.
 *
 * Returns a 429 response to return immediately, or null to proceed.
 * `route` namespaces the bucket so a visitor using one public feature
 * does not lock themselves out of another.
 */
export function guardPublicAi(
    req: NextRequest | Request,
    route: string,
    { limit = 10, windowMs = MINUTE_MS }: PublicAiGuardOptions = {},
): NextResponse | null {
    if (isRateLimited(`public-ai:${route}:${clientKey(req)}`, limit, windowMs)) {
        return NextResponse.json(
            {
                error: 'rate_limited',
                message: 'Too many requests. Please wait a moment and try again.',
            },
            { status: 429, headers: { 'Retry-After': '60' } },
        );
    }
    return null;
}
