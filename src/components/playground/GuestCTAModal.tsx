'use client';

import { Button } from '@/components/ui/button';
import { TIER_MATRIX } from '@/lib/playground/tier-config';

/** Free authed monthly credit allowance, for the upsell copy. */
const AUTHED_FREE_CREDITS_PER_MONTH = TIER_MATRIX.free.creditsLimit;

export function GuestCTAModal({ onSignUp, onClose }: { onSignUp(): void; onClose(): void }) {
    const features: { label: string; guest: string | false; member: string | true }[] = [
        { label: 'AI Models Available', guest: 'Guest-access only (~10 models)', member: '100+ models incl. Claude 3.7, GPT-4o, Gemini 2.0, DeepSeek R1' },
        { label: 'Usage Allowance', guest: '10 prompts + 5 images / 72h', member: `${AUTHED_FREE_CREDITS_PER_MONTH.toLocaleString()} credits per month` },
        { label: 'Multi-Model Prompting', guest: false, member: true },
        { label: 'Custom Skills & Prompts', guest: false, member: true },
        { label: 'Chat History Saved', guest: false, member: true },
        { label: 'Skills Marketplace Access', guest: false, member: true },
        { label: 'Artifact Code Preview', guest: false, member: true },
        { label: 'Community Support', guest: false, member: true },
    ];

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="cta-modal-title">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
            {/* Panel */}
            <div className="relative z-10 w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-r from-rose-600/20 to-amber-500/20 px-6 py-5 border-b border-border">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-[10px] font-mono uppercase tracking-widest text-amber-400 mb-1">Guest Limit Reached</p>
                            <h2 id="cta-modal-title" className="text-lg font-bold text-foreground leading-snug">
                                You&apos;ve used all your guest requests
                            </h2>
                            <p className="text-xs text-muted-foreground mt-1">
                                Create a free account to keep going — no card required.
                            </p>
                        </div>
                        <button type="button" onClick={onClose} className="ml-4 mt-0.5 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" aria-label="Close">
                            ✕
                        </button>
                    </div>
                </div>

                {/* Comparison table */}
                <div className="px-6 py-4">
                    <div className="grid grid-cols-3 gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 px-1">
                        <span className="col-span-1">Feature</span>
                        <span className="text-center">Guest</span>
                        <span className="text-center text-emerald-400">Free Member</span>
                    </div>
                    <div className="space-y-1">
                        {features.map((f) => (
                            <div key={f.label} className="grid grid-cols-3 gap-2 items-center rounded-md px-1 py-2 text-xs odd:bg-muted/20">
                                <span className="text-foreground font-medium leading-tight">{f.label}</span>
                                <span className="text-center text-muted-foreground">
                                    {f.guest === false ? (
                                        <span className="text-rose-500 font-bold text-base leading-none">✗</span>
                                    ) : (
                                        <span className="leading-tight">{f.guest}</span>
                                    )}
                                </span>
                                <span className="text-center text-emerald-400">
                                    {f.member === true ? (
                                        <span className="text-emerald-400 font-bold text-base leading-none">✓</span>
                                    ) : (
                                        <span className="leading-tight">{f.member}</span>
                                    )}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer CTA */}
                <div className="px-6 pb-5 pt-2 flex flex-col gap-2">
                    <Button
                        type="button"
                        onClick={onSignUp}
                        className="w-full h-10 text-sm font-semibold bg-rose-600 hover:bg-rose-700 text-white"
                    >
                        Join the Cybrdeck Community — It&apos;s Free
                    </Button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-[11px] text-muted-foreground hover:text-foreground transition-colors text-center"
                    >
                        I&apos;ll wait for the next reset
                    </button>
                </div>
            </div>
        </div>
    );
}
