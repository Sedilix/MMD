"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
// Only the glyphs coolicons genuinely lacks. Brain and Zap also appear as
// pre-rendered nodes in the tier table below, which is why that field is a
// ReactNode rather than a shared ComponentType.
import { Brain, Zap, Sparkles, Check, Minus } from 'lucide-react';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';
import { ContourGlassButton } from '@/components/ui/ContourGlassButton';
import { CrystalLightField } from '@/components/ui/CrystalLightField';
import { useUser } from '@/firebase';
import { useRouter, useSearchParams } from 'next/navigation';

// ─────────────────────────────────────────────────────────────────────────────
// Subscription tier definitions
//
// prices match the plan spec:
//   Free      → $0      / 2,000  credits / month
//   Pro       → SGD 25  / 10,000 credits / month
//   Developer → SGD 45  / 25,000 credits / month
//
// Credits: 1 credit ≈ 1,000 tokens on a standard model. Not raw token counts.
// ─────────────────────────────────────────────────────────────────────────────

interface TierFeature {
    text: string;
    included: boolean;
}

interface Tier {
    id: 'free' | 'pro' | 'developer';
    label: string;
    price: string;
    priceNote: string;
    credits: number;
    creditsNote: string;
    description: string;
    features: TierFeature[];
    /** Pre-rendered so coolicons and lucide glyphs can coexist in one table. */
    icon: React.ReactNode;
    popular: boolean;
}

const TIERS: Tier[] = [
    {
        id: 'free',
        label: 'Free',
        price: '$0',
        priceNote: 'Forever free',
        credits: 1_000,
        creditsNote: '1,000 credits / month',
        description: 'Explore the Playground with full model access and a generous monthly allowance.',
        icon: <Brain className="w-5 h-5" />,
        popular: false,
        features: [
            { text: 'Full model catalogue', included: true },
            { text: '1,000 credits / month', included: true },
            { text: 'Multi-model prompting & history', included: true },
            { text: 'Custom skills & system prompts', included: true },
            { text: 'Priority support', included: false },
            { text: 'Team workspaces', included: false },
            { text: 'Custom model fine-tuning', included: false },
            { text: 'Dedicated account manager & SLA', included: false },
        ],
    },
    {
        id: 'pro',
        label: 'Pro',
        price: 'SGD 25',
        priceNote: 'per month',
        credits: 10_000,
        creditsNote: '10,000 credits / month',
        description: 'Power through demanding projects with increased credit allowance and priority support.',
        icon: <Zap className="w-5 h-5" />,
        popular: true,
        features: [
            { text: 'Full model catalogue', included: true },
            { text: '10,000 credits / month', included: true },
            { text: 'Multi-model prompting & history', included: true },
            { text: 'Custom skills & system prompts', included: true },
            { text: 'Priority support', included: true },
            { text: 'Team workspaces', included: false },
            { text: 'Custom model fine-tuning', included: false },
            { text: 'Dedicated account manager & SLA', included: false },
        ],
    },
    {
        id: 'developer',
        label: 'Developer',
        price: 'SGD 45',
        priceNote: 'per month',
        credits: 25_000,
        creditsNote: '25,000 credits / month',
        description:
            'For power users and teams who need maximum throughput and advanced capabilities.',
        icon: <Icon name="code" className="w-5 h-5" />,
        popular: false,
        features: [
            { text: 'Full model catalogue', included: true },
            { text: '25,000 credits / month', included: true },
            { text: 'Multi-model prompting & history', included: true },
            { text: 'Custom skills & system prompts', included: true },
            { text: 'Priority support', included: true },
            { text: 'Team workspaces', included: true },
            { text: 'Custom model fine-tuning', included: true },
            { text: 'Dedicated account manager & SLA', included: true },
        ],
    },
];

// ─────────────────────────────────────────────────────────────────────────────
// Checkout modal — mirrors the StripeHook UX: collects cardholder name + email
// then redirects to Stripe Checkout. Card data stays on stripe.com (PCI SAQ-A).
// ─────────────────────────────────────────────────────────────────────────────

interface CheckoutModalProps {
    tier: Tier;
    onClose: () => void;
}

function CheckoutModal({ tier, onClose }: CheckoutModalProps) {
    const { user } = useUser();
    const router = useRouter();
    const [nameOnCard, setNameOnCard] = useState('');
    const [email, setEmail] = useState(user?.email ?? '');
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!nameOnCard.trim()) {
            setError('Please provide the cardholder name.');
            return;
        }
        if (!email.trim() || !email.includes('@')) {
            setError('Please enter a valid email address.');
            return;
        }

        setIsProcessing(true);

        try {
            // 1. Get Firebase ID token for auth
            const idToken = await user!.getIdToken();

            // 2. Call our subscriptions checkout API
            const res = await fetch('/api/subscriptions/checkout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({
                    tier: tier.id,
                    email: email.trim(),
                }),
            });

            const data = (await res.json().catch(() => ({}))) as
                | { url?: string; sessionId?: string; error?: string }
                | undefined;

            if (!res.ok || !data?.url) {
                setIsProcessing(false);
                setError(
                    data?.error ??
                    'Could not start checkout. Please try again or contact support.',
                );
                return;
            }

            // 3. Redirect to Stripe Checkout
            window.location.href = data.url;
        } catch (err) {
            setIsProcessing(false);
            const message = err instanceof Error ? err.message : 'Network error. Please try again.';
            setError(message);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xl animate-fade-in">
            <div className="relative bg-white/80 backdrop-blur-2xl rounded-3xl max-w-md w-full shadow-2xl overflow-hidden font-body border border-white/60 ring-1 ring-black/5 text-slate-800">
                {/* Close Button Top Right Corner - Follows outer curve of container */}
                <button
                    onClick={onClose}
                    disabled={isProcessing}
                    className="absolute top-0 right-0 w-9 h-9 bg-[#18181b] hover:bg-[#27272a] text-zinc-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed z-20 border-b border-l border-white/15 rounded-tr-3xl rounded-bl-xl"
                    aria-label="Close checkout"
                >
                    <Icon name="close-md" className="w-3.5 h-3.5" />
                </button>

                {/* Header */}
                <div className="border-b border-slate-200/50 p-5 pr-12 bg-white/40 backdrop-blur-md flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-full bg-brand-50 text-brand-600 border border-brand-100/80">
                            <Icon name="lock" className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="font-headline font-bold text-base text-slate-900 leading-tight">
                                Subscribe — {tier.label}
                            </h3>
                            <div className="flex items-center gap-1.5 text-[10px] font-mono text-brand-600 font-semibold uppercase tracking-wider mt-0.5">
                                <span>Powered by</span>
                                <div className="flex items-center gap-1 h-5">
                                    <img src="/stripe-icon.png?v=3" alt="Stripe Icon" className="h-full w-auto object-contain" />
                                    <img src="/stripe-text.png?v=3" alt="Stripe Wordmark" className="h-4 w-auto object-contain" />
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <img
                            src={
                                tier.label.toLowerCase().includes('dev') || (tier.id as string) === 'developer' || (tier.id as string) === 'dev'
                                    ? '/subscriptions/devsub.png'
                                    : '/subscriptions/prosub.png'
                            }
                            alt={`${tier.label} Subscription`}
                            className="h-20 w-auto object-contain drop-shadow-md rounded-md mr-[10px]"
                        />
                    </div>
                </div>

                {/* Plan summary */}
                <div className="p-5 bg-slate-50/50 backdrop-blur-md border-b border-slate-200/50">
                    <span className="text-[9px] font-mono text-brand-600 tracking-wider uppercase font-semibold">
                        Subscription Plan
                    </span>
                    <h4 className="font-headline text-slate-900 font-bold text-sm mt-0.5 leading-snug">
                        {tier.label} — {tier.creditsNote}
                    </h4>
                    <div className="flex justify-between items-center mt-3.5 text-xs text-slate-600">
                        <span>Monthly charge</span>
                        <span className="font-mono text-slate-900 font-bold">
                            {tier.price} {tier.priceNote}
                        </span>
                    </div>
                </div>

                {/* Identity form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {error && (
                        <div className="p-3 bg-red-50/80 border border-red-200/80 rounded-xl flex gap-2 text-xs text-red-600 backdrop-blur-md">
                            <Icon name="circle-warning" className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
                            <span>{error}</span>
                        </div>
                    )}

                    <div className="p-3.5 bg-brand-50/70 border border-brand-200/60 rounded-2xl text-[11px] text-brand-800 leading-normal flex gap-2.5 backdrop-blur-md">
                        <Sparkles className="w-4 h-4 shrink-0 text-brand-600 mt-0.5" />
                        <div>
                            You'll be taken to Stripe to enter your card details securely. Apple Pay
                            and Google Pay are supported on mobile.
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div>
                            <label className="block text-[10px] font-mono tracking-wider text-slate-500 uppercase font-semibold mb-1">
                                Cardholder Name
                            </label>
                            <input
                                type="text"
                                value={nameOnCard}
                                onChange={(e) => setNameOnCard(e.target.value)}
                                placeholder=""
                                required
                                autoComplete="cc-name"
                                className="w-full bg-white/70 backdrop-blur-md border border-slate-300/80 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 placeholder-slate-400 transition-all"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-mono tracking-wider text-slate-500 uppercase font-semibold mb-1">
                                Email
                            </label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder=""
                                required
                                autoComplete="email"
                                className="w-full bg-white/70 backdrop-blur-md border border-slate-300/80 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 placeholder-slate-400 transition-all"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isProcessing}
                        className="w-full mt-4 bg-slate-900 hover:bg-slate-800 text-white font-body font-semibold py-3 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition-all duration-300 disabled:opacity-50 cursor-pointer shadow-lg shadow-slate-900/20"
                    >
                        {isProcessing ? (
                            <>
                                <Icon name="loading" className="w-4 h-4 animate-spin" />
                                <span>OPENING SECURE CHECKOUT…</span>
                            </>
                        ) : (
                            <>
                                <Icon name="shield-check" className="w-4 h-4" />
                                <span>
                                    SUBSCRIBE — {tier.price} / MONTH
                                </span>
                            </>
                        )}
                    </button>
                </form>

                {/* Footer */}
                <div className="border-t border-slate-200/50 p-4 bg-slate-50/50 backdrop-blur-md flex items-center justify-center gap-1.5 text-[10px] text-emerald-600 font-mono font-medium">
                    <Icon name="shield-check" className="w-4 h-4 text-emerald-600" />
                    <span className="text-emerald-600 font-semibold">You're redirected to Stripe. Card data never touches our servers.</span>
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// TierCard
// ─────────────────────────────────────────────────────────────────────────────

interface TierCardProps {
    tier: Tier;
    onSubscribe: (tier: Tier) => void;
    user: ReturnType<typeof useUser>['user'];
}

function TierCard({ tier, onSubscribe, user }: TierCardProps) {
    const isFree = tier.id === 'free';

    return (
        <div
            className={cn(
                'relative flex flex-col h-full rounded-3xl p-7 overflow-hidden cd-crystal',
                tier.popular && 'cd-crystal--cyan'
            )}
        >
            {/* Card body */}
            <div className="relative z-10 flex flex-col flex-1">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                        <div
                            className={cn(
                                'p-2 rounded-xl border border-white/10 bg-white/[0.04]',
                                tier.popular ? 'text-brand-300' : 'text-zinc-400'
                            )}
                        >
                            {tier.icon}
                        </div>
                        <h3 className="text-base font-semibold text-white">{tier.label}</h3>
                    </div>
                    {tier.popular && (
                        <span className="rounded-full border border-brand-400/30 bg-brand-400/10 px-2.5 py-0.5 text-[11px] font-medium text-brand-200 whitespace-nowrap">
                            Most popular
                        </span>
                    )}
                </div>

                <p className="mt-3 text-[13px] leading-snug text-zinc-400">
                    {tier.description}
                </p>

                <div className="mt-6 flex items-baseline gap-2">
                    <span className="text-3xl font-semibold tracking-tight text-white whitespace-nowrap">{tier.price}</span>
                    <span className="text-[13px] text-zinc-500">{tier.priceNote}</span>
                </div>
                <p className="mt-1 text-[13px] font-medium text-brand-300/90">{tier.creditsNote}</p>

                {/* Feature list */}
                <ul className="mt-6 mb-7 space-y-2.5 border-t border-white/10 pt-6 text-[13px]">
                    {tier.features.map((f) => (
                        <li key={f.text} className="flex items-start gap-2.5">
                            {f.included ? (
                                <Check aria-hidden className="mt-[3px] h-3.5 w-3.5 shrink-0 text-brand-400" />
                            ) : (
                                <Minus aria-hidden className="mt-[3px] h-3.5 w-3.5 shrink-0 text-zinc-600" />
                            )}
                            <span className={f.included ? 'text-zinc-300' : 'text-zinc-600'}>
                                {f.text}
                            </span>
                            <span className="sr-only">
                                {f.included ? ' — included' : ' — not included'}
                            </span>
                        </li>
                    ))}
                </ul>

                {/* CTA */}
                <div className="mt-auto">
                    {isFree ? (
                        <ContourGlassButton effect="rim" asChild size="lg" className="w-full">
                            <a href={user ? '/playground/app' : '/login'}>
                                <span>{user ? 'Go to Playground' : 'Sign Up Free'}</span>
                            </a>
                        </ContourGlassButton>
                    ) : (
                        <ContourGlassButton effect="rim" size="lg" className="w-full" onClick={() => onSubscribe(tier)}>
                            <span>Subscribe Now</span>
                        </ContourGlassButton>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main subscriptions page
// ─────────────────────────────────────────────────────────────────────────────

export default function SubscriptionsPage() {
    const { user } = useUser();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [selectedTier, setSelectedTier] = useState<Tier | null>(null);

    // Set by the playground's Sign up / Subscribe control, and carried intact
    // through /register -> /onboarding/role for a guest who signs up on the
    // way here. Without it the only back control read "Back To Home", which
    // abandoned whatever the user had been building.
    const cameFromPlayground = searchParams.get('from') === 'playground';

    const handleSubscribe = (tier: Tier) => {
        if (!user) {
            // Redirect to login; Stripe redirect will come after auth
            router.push(`/login?redirect=${encodeURIComponent(cameFromPlayground ? '/subscriptions?from=playground' : '/subscriptions')}`);
            return;
        }
        setSelectedTier(tier);
    };

    const showCancelledBanner =
        typeof window !== 'undefined' &&
        new URLSearchParams(window.location.search).get('stripe') === 'cancelled';

    return (
        <div className="min-h-dvh bg-[#01040c] text-white selection:bg-brand-500 selection:text-black">
            {/* Delegated light source for .cd-crystal glass blocks */}
            <CrystalLightField />

            {/* Ambient glow behind content */}
            <div className="fixed inset-0 -z-10 pointer-events-none">
                <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-brand-500/10 blur-[150px] rounded-full" />
                <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-violet-500/10 blur-[150px] rounded-full" />
            </div>

            {/* Stripe cancelled banner */}
            {showCancelledBanner && (
                <div className="pt-24 px-6 max-w-7xl mx-auto">
                    <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl backdrop-blur-xl text-amber-300 text-xs flex items-center gap-2 mb-4">
                        <Icon name="circle-warning" className="w-4 h-4 shrink-0" />
                        <span>Checkout was cancelled. No charge was made.</span>
                    </div>
                </div>
            )}

            {/* Top Navigation Header Bar */}
            <header className="w-full max-w-7xl mx-auto px-6 pt-6 flex items-center justify-between relative z-20">
                {/* Back goes where the user actually came from. Arriving via
                    the playground's Sign up / Subscribe control carries
                    `?from=playground`, and their studio tab is held in
                    sessionStorage, so returning drops them back into the
                    studio they left rather than on the marketing home page. */}
                <Link
                    href={cameFromPlayground ? '/playground/app' : '/'}
                    aria-label={cameFromPlayground ? 'Back to the playground' : 'Back to the home page'}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 text-zinc-400 hover:text-white text-xs font-medium transition-colors backdrop-blur-md group cursor-pointer"
                >
                    <Icon name="arrow-left-md" className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
                    <span>{cameFromPlayground ? 'Back To Playground' : 'Back To Home'}</span>
                </Link>

                {/* Hidden when Back already returns to the playground —
                    two controls to one destination is noise, not a choice. */}
                {!cameFromPlayground && (
                    <ContourGlassButton effect="rim" asChild size="sm">
                        <Link href="/playground/app" className="group">
                            <span>To The Playground</span>
                            <Icon name="arrow-right-md" className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                        </Link>
                    </ContourGlassButton>
                )}
            </header>

            {/* Hero */}
            <section className="relative pt-8 pb-16 px-6 text-center">
                <motion.div
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="max-w-3xl mx-auto"
                >
                    {/* Eyebrow */}
                    <p className="text-xs font-mono uppercase tracking-widest text-brand-400">
                        AI Playground Subscriptions
                    </p>

                    <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-5xl mb-4">
                        Power Your AI Workflow
                    </h1>
                    <p className="text-zinc-400 text-sm md:text-base max-w-2xl mx-auto leading-relaxed">
                        Every tier includes full access to the entire model catalogue. Upgrade for
                        more credits — not more restrictions. Pay monthly, cancel anytime.
                    </p>
                </motion.div>
            </section>

            {/* Pricing grid */}
            <section className="px-6 pb-24">
                <div className="max-w-6xl mx-auto">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {TIERS.map((tier, idx) => (
                            <motion.div
                                key={tier.id}
                                initial={{ opacity: 0, y: 32 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.1 + idx * 0.08, duration: 0.4 }}
                            >
                                <TierCard
                                    tier={tier}
                                    onSubscribe={handleSubscribe}
                                    user={user}
                                />
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Trust bar */}
            <section className="border-t border-white/5 px-6 py-10">
                <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-12 text-zinc-500 text-xs">
                    <div className="flex items-center gap-2">
                        <Icon name="shield-check" className="w-4 h-4 text-brand-400" />
                        <span>Secured by Stripe</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Icon name="lock" className="w-4 h-4 text-brand-400" />
                        <span>PCI SAQ-A compliant</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-brand-400" />
                        <span>Cancel anytime, no lock-in</span>
                    </div>
                </div>
            </section>

            {/* Checkout modal */}
            {selectedTier && (
                <CheckoutModal
                    tier={selectedTier}
                    onClose={() => setSelectedTier(null)}
                />
            )}
        </div>
    );
}
