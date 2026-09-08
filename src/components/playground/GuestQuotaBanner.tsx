'use client';

/**
 * Surfaced in the playground header when the visitor is unauthenticated. It
 * reads the live 24h request-pool snapshot the server stamps on 402s and
 * shows:
 *   - remaining/total weighted requests in the current window,
 *   - a sign-up CTA quoting the free tier's real monthly allowance,
 *   - a sign-in CTA for returning users.
 *
 * The upsell number is derived from TIER_MATRIX — the single source of
 * truth for subscription limits — so the conversion copy can never
 * drift from what a new account actually receives.
 */

import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GUEST_REQUEST_LIMIT, GUEST_IMAGE_LIMIT } from '@/lib/playground/tier-config';
import type { GuestQuotaSnapshot } from '@/lib/playground/hooks/usePlaygroundStream';

export function GuestQuotaBanner({
    snapshot,
    onSignUp,
    onSignIn,
}: {
    snapshot: GuestQuotaSnapshot | null;
    onSignUp(): void;
    onSignIn(): void;
}) {
    const limit = snapshot?.requestsLimit ?? GUEST_REQUEST_LIMIT;
    const used = snapshot?.requestsUsed ?? 0;
    const remaining = Math.max(0, limit - used);

    const imageLimit = snapshot?.imageLimit ?? GUEST_IMAGE_LIMIT;
    const imageUsed = snapshot?.imageUsed ?? 0;
    const imageRemaining = snapshot?.imageRemaining ?? Math.max(0, imageLimit - imageUsed);

    const depleted = remaining <= 0 && imageRemaining <= 0;

    return (
        <div className="hidden items-center gap-3 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 sm:flex">
            <div className="flex items-center gap-1.5 font-semibold text-[11px] text-amber-400">
                <Sparkles className="h-3 w-3" aria-hidden />
                Guest
            </div>
            <div className="flex items-center gap-2 text-[11px] text-amber-100">
                <span className="font-mono">{remaining}/{limit} Prompts | {imageRemaining}/{imageLimit} Img Gens left</span>
                <span className="text-amber-500/50">|</span>
                <span className="hidden lg:inline text-amber-200/70">
                    {depleted ? "Guest limit reached (resets every 72 hrs). Sign up for full access." : "Sign up for full access."}
                </span>
            </div>
            <div className="flex items-center gap-1.5 pl-1">
                <Button
                    type="button"
                    size="sm"
                    onClick={onSignUp}
                    className="h-5 rounded-full px-2 text-[9px] bg-amber-500 hover:bg-amber-600 text-amber-950 font-bold"
                >
                    Sign Up
                </Button>
                <button
                    type="button"
                    onClick={onSignIn}
                    className="h-5 px-1.5 text-[9px] text-amber-200/70 hover:text-amber-100 transition-colors"
                >
                    Log In
                </button>
            </div>
        </div>
    );
}
