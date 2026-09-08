/**
 * Playground tier matrix — single source of truth for subscription limits.
 *
 * All authenticated users — free, pro, developer — can reach every model in the
 * registry. The tier no longer gates which models are reachable; it only
 * controls the monthly credit allowance:
 *   Free      →  1,000 credits / month
 *   Pro       → 10,000 credits / month ($20/mo)
 *   Developer → 25,000 credits / month ($45/mo)
 *
 * Guest access (unauthenticated) is governed by the Free-category gate and the
 * 10-req/24h rolling pool in `guest-usage.ts`, NOT by this matrix.
 *
 * The Stripe webhook reads from here to translate a `price_id` into a
 * `UserSubscription.tier` + allowance.
 */

import type { UserTier } from './types';

/**
 * USD value of a single Playground credit.
 *
 * DERIVED — see audit report. This is the constant we anchor all studio
 * re-pricing math to. It is NOT declared anywhere upstream; it is implied
 * by the legacy `STUDIO_COSTS.image = 50` knob (one image ≈ $0.04 upstream)
 * and rounded to a clean 8-thousandths-of-a-dollar per credit.
 *
 * Treat this as a *floor*. If ops research shows upstream image cost is
 * higher (e.g. $0.06/image on premium Qwen Image Max / Wan 2.7 Pro), bump
 * this to keep the 2× markup intact rather than re-pricing every model.
 *
 * Marked `as const` so call sites get the literal type rather than `number`.
 */
export const USD_PER_CREDIT = 0.0008 as const;

/**
 * Recommended-retail (MSRP) multiplier applied on top of the internal cost
 * baseline for the public-facing cost label. The Playground column footers
 * render `USD((credits / 1000) × MSRP_MULTIPLIER)` so the displayed number
 * reflects an approximate upstream-MSRP rather than the discounted internal
 * burn rate. Kept as a single named constant so the two column renderers
 * (PlaygroundColumn, MMDColumn) agree on the math instead of each carrying
 * a magic `* 3` (audit #25). Tune here to reprice everywhere at once.
 */
export const MSRP_MULTIPLIER = 3 as const;

/**
 * Format a credit-cost figure as the public-facing MSRP USD string. Centralised
 * so the column footers can't drift on the multiplier or decimal precision.
 */
export function formatMsrpUsd(credits: number): string {
    return `USD${((credits / 1000) * MSRP_MULTIPLIER).toFixed(4)}`;
}

/**
 * Studio Credit Costs — the public re-pricing knob.
 *
 *  `image`      — default per-image credit cost for any image model that
 *                  doesn't carry its own `credits` override in
 *                  `data/studio/image-models.json`. Premium models
 *                  (qwen-image-max, wan2.7-image-pro, etc.) override this
 *                  with higher values; budget tier models (z-image-turbo,
 *                  wan2.6-t2i) override with lower values.
 *
 *  `video`      — per-SECOND credit cost for any video model that doesn't
 *                  carry its own `creditsPerSec` override in
 *                  `data/studio/video-models.json`. The route multiplies
 *                  this by the user-requested `duration` (clamped to the
 *                  model's `maxDurationSec`). Was previously a flat 10-credit
 *                  charge in `studio/video/route.ts` regardless of duration —
 *                  that hole let a 15s Sora 2 Pro cost the same as a 5s Wan
 *                  Turbo, which is no longer the case after this audit.
 *
 *  `outline`    — AI design assist outline generation.
 *  `ttsPer1000` — per 1,000 characters of text-to-speech.
 *  `transcribePerMin` — per-minute audio transcription.
 */
export const STUDIO_COSTS = {
    image: 50,
    video: 120, // per-second floor; per-model `creditsPerSec` overrides
    outline: 10,
    ttsPer1000: 10,
    transcribePerMin: 20,
};

/**
 * One row of the matrix. `monthlyPriceUsd` exists for the header badge and
 * the billing page; the Stripe webhook matches `stripePriceId` against the
 * incoming `line_items.price.id`.
 */
export interface TierConfig {
    tier: UserTier;
    /** Display name shown in the pricing UI. */
    label: string;
    /** Monthly price in USD, for the public pricing page. */
    monthlyPriceUsd: number;
    /** Monthly credit allowance. */
    creditsLimit: number;
    /**
     * Stripe Price ID used by the existing checkout route (`STRIPE_PRO_PLAN_ID`
     * / `STRIPE_DEV_PLAN_ID` env vars). Resolved lazily so missing env vars
     * during local dev don't blow up imports.
     */
    stripePriceIdEnvVar: 'STRIPE_PRO_PLAN_ID' | 'STRIPE_DEV_PLAN_ID' | null;
}

// ─── Guest (unauthenticated) tier ────────────────────────────────────────────
//
// Guests who land on /playground without signing in are admitted on a separate
// request matrix (NOT the credit/token matrix above). They get a rolling 24h
// pool of weighted requests and are gated to Free-category models — a curated
// set spanning the local Ollama deployment and a handful of cheap standard
// models — so gateway spend stays tightly bounded. Once a guest signs up,
// they cross over to the credit matrix — 1,000 free credits, full model
// catalogue, monthly reset — and their guest chat history is hydrated into
// the new authenticated session (see `guestHistory.ts`).
//
// Complexity weighting: each request costs `max(1, ceil(promptChars / 1000))`
// request-points. A ~1,000-character prompt is 1 request; 4,000 chars is 4.
// The threshold is exposed here so it can be tuned without touching the
// deduction logic.

/** Maximum weighted requests a guest may consume per 72h window. */
export const GUEST_REQUEST_LIMIT = 10;

/** Maximum image generations a guest may consume per 72h window. */
export const GUEST_IMAGE_LIMIT = 5;

/** Budget image models permitted for guest image generations. */
export const GUEST_ALLOWED_IMAGE_MODELS = ['z-image-turbo', 'wan2.6-t2i'] as const;

/**
 * Real-time STT streaming a guest may consume per 72h window, in seconds.
 *
 * A "taste", the same idea as the 5-image / 10-request pools above: enough
 * to try the feature, not enough to run a transcription service on our
 * Speechmatics bill. Unlike those two pools, this one is debited at token
 * ISSUANCE (see `deductGuestSttUsage`) rather than at reported usage — a
 * guest's browser is not a party we can require to report honestly, so the
 * grant itself is the charge. The token's TTL is then capped to whatever
 * remains in the pool, so a guest with 90 seconds left gets a 90-second
 * credential, never a longer one they are merely trusted not to use.
 */
export const GUEST_STT_SECONDS_LIMIT = 10 * 60;

/** Rolling window for the guest request pool, in milliseconds (72h). */
export const GUEST_WINDOW_MS = 72 * 60 * 60 * 1000;

/**
 * Prompt length (in characters) that counts as one weighted request. Shorter
 * prompts still cost a minimum of one request so a guest can't cycle the pool
 * with one-character prompts.
 */
export const GUEST_REQUEST_CHARS_PER_POINT = 1000;

/**
 * Compute the weighted request cost of a single prompt. The formula is the
 * documented guest policy: `max(1, ceil(promptChars / CHARS_PER_POINT))`.
 * Exported so the deduction logic, the quota gate, and the client-side banner
 * ("X of 10 requests left") all agree on what one call costs.
 */
export function guestRequestCost(prompt: string): number {
    const chars = typeof prompt === 'string' ? prompt.length : 0;
    if (chars <= 0) return 1;
    return Math.max(1, Math.ceil(chars / GUEST_REQUEST_CHARS_PER_POINT));
}

/**
 * Pricing matrix — credit allowances only:
 *   Free       →  $0  /  1,000 credits / month
 *   Pro        → $20  / 10,000 credits / month
 *   Developer  → $45  / 25,000 credits / month
 *
 * All authenticated tiers can reach every model in the registry — the tier
 * controls credit allowance, not model reach. A "credit" is NOT a raw token:
 * it's `(tokens / 1000) × modelMultiplier`, so one credit ≈ 1,000 input tokens
 * on the cheapest standard model. These smaller allowances keep LLMAPI
 * gateway spend tightly bounded per user.
 *
 * Guests (no Firebase session) are NOT in this matrix — see the guest
 * constants above. Authed users of any tier (free/pro/developer) ARE in the
 * matrix and operate on credits, not requests.
 */
export const TIER_MATRIX: Readonly<Record<UserTier, TierConfig>> = {
    free: {
        tier: 'free',
        label: 'Free',
        monthlyPriceUsd: 0,
        creditsLimit: 1_000,
        // Free has no paid Stripe Price — we never assign this; it's here for
        // shape only.
        stripePriceIdEnvVar: null,
    },
    pro: {
        tier: 'pro',
        label: 'Pro',
        monthlyPriceUsd: 25,
        creditsLimit: 10_000,
        stripePriceIdEnvVar: 'STRIPE_PRO_PLAN_ID',
    },
    developer: {
        tier: 'developer',
        label: 'Developer',
        monthlyPriceUsd: 45,
        creditsLimit: 25_000,
        stripePriceIdEnvVar: 'STRIPE_DEV_PLAN_ID',
    },
} as const;

/**
 * Resolve the live Stripe Price ID from env. Returns `null` for `free` and
 * for paid tiers whose env var is unset — callers should treat null as
 * "no active subscription" rather than throwing.
 */
export function resolveStripePriceId(tier: UserTier): string | null {
    const cfg = TIER_MATRIX[tier];
    if (!cfg.stripePriceIdEnvVar) return null;
    const v = process.env[cfg.stripePriceIdEnvVar];
    return v && v.length > 0 ? v : null;
}

/**
 * Number of days in a Playground billing cycle. Matches the spec's Stripe
 * plan length (the webhook resets `creditsUsed` every 30 days).
 */
export const BILLING_CYCLE_DAYS = 30;

/** Helper: ms duration of one billing cycle. */
export function billingCycleMs(): number {
    return BILLING_CYCLE_DAYS * 24 * 60 * 60 * 1000;
}
