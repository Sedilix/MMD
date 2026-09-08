'use client';

/**
 * "Event" tab — a fully-scoped Luma-ready event builder.
 *
 * Impeccable Design Suite & Cosmic Liquid-Glass Overhaul.
 */

import React, { useState } from 'react';
import {
    Calendar,
    Sparkles,
    DollarSign,
    Clock,
    Tag,
    Image as ImageIcon,
    ExternalLink,
    Copy,
    Check,
    AlertCircle,
    RefreshCw,
    Link2,
    Ticket,
    Layers,
    Globe,
    CheckCircle2,
} from 'lucide-react';
import { useUser } from '@/firebase/auth/use-user';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Mode = 'from-scratch' | 'from-luma';

interface EventForm {
    mode: Mode;
    url: string;
    title: string;
    description: string;
    audience: string;
    duration: string;
    suggestedPriceUsd: string;
    genre: string;
}

interface EventResponse {
    mode: Mode;
    slug: string;
    title: string;
    description: string;
    genreTags: string[];
    suggestedPriceUsd: string;
    duration: string;
    imagePrompt: string;
    sourceUrl: string | null;
    lumaConventions: string;
}

const DEFAULT_FORM: EventForm = {
    mode: 'from-scratch',
    url: '',
    title: '',
    description: '',
    audience: '',
    duration: '90 minutes',
    suggestedPriceUsd: '0',
    genre: 'tech',
};

const GENRES = ['tech', 'ai', 'startup', 'design', 'crypto', 'productivity', 'community'] as const;

export function EventTab() {
    const { user } = useUser();
    const [form, setForm] = useState<EventForm>(DEFAULT_FORM);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<EventResponse | null>(null);
    const [copiedKey, setCopiedKey] = useState<string | null>(null);

    const updateField = <K extends keyof EventForm>(key: K, value: EventForm[K]) => {
        setForm((f) => ({ ...f, [key]: value }));
    };

    const handleCopy = async (key: string, text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedKey(key);
            setTimeout(() => setCopiedKey(null), 1500);
        } catch {
            // Ignore clipboard errors
        }
    };

    const submit = async () => {
        if (!user) {
            setError('Sign in required.');
            return;
        }
        if (form.mode === 'from-luma' && !form.url.trim()) {
            setError('A valid luma.com URL is required for from-luma mode.');
            return;
        }
        if (form.mode === 'from-scratch' && !form.title.trim() && !form.description.trim()) {
            setError('Please provide at least a title or description for the event.');
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const idToken = await user.getIdToken();
            const res = await fetch('/api/marketing/event', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${idToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    mode: form.mode,
                    url: form.url.trim() || undefined,
                    title: form.title.trim() || undefined,
                    description: form.description.trim() || undefined,
                    audience: form.audience.trim() || undefined,
                    duration: form.duration.trim() || undefined,
                    suggestedPriceUsd: form.suggestedPriceUsd.trim() || undefined,
                    genre: form.genre.trim() || undefined,
                }),
            });
            if (!res.ok) {
                const errBody = await res.json().catch(() => ({}));
                throw new Error(errBody?.message || `Server returned ${res.status}.`);
            }
            const data = await res.json();
            if (data?.success && data?.event) {
                setResult(data.event as EventResponse);
            } else {
                throw new Error('No event returned by the server.');
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Event generation failed.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="w-full space-y-6 text-zinc-100">
            {/* Header & Mode Switcher */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.08]">
                <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-brand-400" />
                        <h2 className="text-base font-bold text-white tracking-tight">
                            Luma Event Builder
                        </h2>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono border border-brand-500/30 bg-brand-500/10 text-brand-300">
                            Auto-Scaffold
                        </span>
                    </div>
                    <p className="text-xs text-zinc-400">
                        Produce fully-scoped, investment-grade Luma event descriptions with archetype grounding and image prompts.
                    </p>
                </div>

                {/* Mode Controller */}
                <div
                    className="inline-flex p-1 rounded-xl bg-[#030917]/80 border border-white/[0.08] shadow-inner text-xs"
                    role="radiogroup"
                >
                    <button
                        type="button"
                        onClick={() => updateField('mode', 'from-scratch')}
                        aria-checked={form.mode === 'from-scratch'}
                        role="radio"
                        className={cn(
                            'px-3.5 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5',
                            form.mode === 'from-scratch'
                                ? 'bg-brand-500/20 text-white border border-brand-500/40 shadow-sm'
                                : 'text-zinc-400 hover:text-zinc-200',
                        )}
                    >
                        <Sparkles className="h-3.5 w-3.5 text-brand-400" />
                        <span>From Scratch</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => updateField('mode', 'from-luma')}
                        aria-checked={form.mode === 'from-luma'}
                        role="radio"
                        className={cn(
                            'px-3.5 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5',
                            form.mode === 'from-luma'
                                ? 'bg-brand-500/20 text-white border border-brand-500/40 shadow-sm'
                                : 'text-zinc-400 hover:text-zinc-200',
                        )}
                    >
                        <Link2 className="h-3.5 w-3.5 text-brand-400" />
                        <span>From Luma URL</span>
                    </button>
                </div>
            </div>

            {/* Event Form Container */}
            <div className="rounded-2xl border border-white/[0.08] bg-[#030818]/60 p-5 sm:p-6 space-y-5 shadow-inner">
                {form.mode === 'from-luma' ? (
                    <div className="space-y-2">
                        <label className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                            <Globe className="h-3.5 w-3.5 text-brand-400" />
                            Target Luma URL to Scrape & Re-Archetype
                        </label>
                        <div className="relative">
                            <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                            <Input
                                value={form.url}
                                onChange={(e) => updateField('url', e.target.value)}
                                placeholder="https://lu.ma/e/sample-event-slug"
                                className="h-10 pl-9 bg-[#020512]/90 border-white/10 focus:border-brand-400 focus:ring-1 focus:ring-brand-400 text-zinc-100 placeholder:text-zinc-600 rounded-xl"
                            />
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">
                                    Event Title <span className="text-zinc-500 lowercase font-normal">(optional initial concept)</span>
                                </label>
                                <Input
                                    value={form.title}
                                    onChange={(e) => updateField('title', e.target.value)}
                                    placeholder="e.g. Cybrdeck Operator Meetup #4 — Singapore"
                                    className="h-10 bg-[#020512]/90 border-white/10 focus:border-brand-400 focus:ring-1 focus:ring-brand-400 text-zinc-100 placeholder:text-zinc-600 rounded-xl"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">
                                    Target Audience / Archetype
                                </label>
                                <Input
                                    value={form.audience}
                                    onChange={(e) => updateField('audience', e.target.value)}
                                    placeholder="e.g. Senior backend engineers, ML platform leads, AI founders"
                                    className="h-10 bg-[#020512]/90 border-white/10 focus:border-brand-400 focus:ring-1 focus:ring-brand-400 text-zinc-100 placeholder:text-zinc-600 rounded-xl"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">
                                Event Description & Agenda Notes
                            </label>
                            <Textarea
                                value={form.description}
                                onChange={(e) => updateField('description', e.target.value)}
                                placeholder="A 90-minute in-person gathering for technical operators. Format: 3 lightning architecture teardowns, live Q&A, and networking. Light refreshments provided."
                                rows={3}
                                className="resize-none bg-[#020512]/90 border-white/10 focus:border-brand-400 focus:ring-1 focus:ring-brand-400 text-zinc-100 placeholder:text-zinc-600 rounded-xl leading-relaxed"
                            />
                        </div>
                    </>
                )}

                {/* Genre Selector Chips */}
                <div className="space-y-2">
                    <label className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                        <Tag className="h-3.5 w-3.5 text-brand-400" />
                        Genre Category
                    </label>
                    <div className="flex flex-wrap gap-2">
                        {GENRES.map((g) => (
                            <button
                                key={g}
                                type="button"
                                onClick={() => updateField('genre', g)}
                                className={cn(
                                    'px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-all select-none',
                                    form.genre === g
                                        ? 'bg-brand-500/20 text-brand-200 border border-brand-500/40 shadow-sm'
                                        : 'bg-white/[0.03] text-zinc-400 border border-white/10 hover:border-white/20 hover:text-white',
                                )}
                            >
                                {g}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Event Logistics (Duration & Price) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                    <div className="space-y-1.5">
                        <label className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 text-zinc-400" />
                            Duration
                        </label>
                        <Input
                            value={form.duration}
                            onChange={(e) => updateField('duration', e.target.value)}
                            placeholder="e.g. 90 minutes"
                            className="h-10 bg-[#020512]/90 border-white/10 focus:border-brand-400 focus:ring-1 focus:ring-brand-400 text-zinc-100 placeholder:text-zinc-600 rounded-xl"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                            <DollarSign className="h-3.5 w-3.5 text-zinc-400" />
                            Suggested Price (USD)
                        </label>
                        <Input
                            value={form.suggestedPriceUsd}
                            onChange={(e) => updateField('suggestedPriceUsd', e.target.value)}
                            placeholder="0 (Free), 25, 50, etc."
                            className="h-10 bg-[#020512]/90 border-white/10 focus:border-brand-400 focus:ring-1 focus:ring-brand-400 text-zinc-100 placeholder:text-zinc-600 rounded-xl"
                        />
                    </div>
                </div>

                {/* Submit Action */}
                <div className="flex items-center justify-end pt-3 border-t border-white/[0.06]">
                    <Button
                        type="button"
                        onClick={submit}
                        disabled={submitting || !user}
                        className={cn(
                            'h-11 px-7 rounded-xl font-semibold text-xs tracking-wider uppercase transition-all shadow-lg select-none',
                            !submitting && user
                                ? 'bg-gradient-to-r from-brand-500 to-blue-600 hover:from-brand-400 hover:to-blue-500 text-white shadow-[0_0_25px_rgba(198,143,61,0.35)] active:scale-[0.98]'
                                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-white/5',
                        )}
                    >
                        {submitting ? (
                            <span className="flex items-center gap-2">
                                <RefreshCw className="h-4 w-4 animate-spin text-brand-200" />
                                <span>Building Event Scaffold…</span>
                            </span>
                        ) : (
                            <span className="flex items-center gap-2">
                                <Sparkles className="h-4 w-4 text-brand-200" />
                                <span>Generate Luma Event</span>
                            </span>
                        )}
                    </Button>
                </div>
            </div>

            {error && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-950/30 p-4 text-xs text-rose-300 flex items-start gap-3">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-rose-400" />
                    <div className="font-medium">{error}</div>
                </div>
            )}

            {/* Generated Luma Event Result Ticket Preview */}
            {result && (
                <EventResultCard
                    event={result}
                    copiedKey={copiedKey}
                    onCopy={handleCopy}
                />
            )}
        </div>
    );
}

function EventResultCard({
    event,
    copiedKey,
    onCopy,
}: {
    event: EventResponse;
    copiedKey: string | null;
    onCopy: (key: string, text: string) => void;
}) {
    const fullJson = JSON.stringify(event, null, 2);

    return (
        <section className="rounded-2xl border border-brand-500/30 bg-gradient-to-br from-[#02091c] via-[#020512] to-black p-5 sm:p-6 space-y-5 shadow-[0_15px_40px_rgba(0,0,0,0.6)]">
            {/* Ticket Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-brand-500/20">
                <div className="flex items-center gap-2.5">
                    <Ticket className="h-4 w-4 text-brand-400" />
                    <h3 className="text-sm font-bold text-white tracking-tight">
                        Generated Luma Event Scaffold
                    </h3>
                    <code className="px-2 py-0.5 rounded bg-brand-500/10 border border-brand-500/30 text-xs font-mono text-brand-300">
                        lu.ma/{event.slug}
                    </code>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onCopy('event-desc', event.description)}
                        className="h-8 text-xs text-zinc-300 hover:text-white"
                    >
                        {copiedKey === 'event-desc' ? <Check className="h-3.5 w-3.5 text-emerald-400 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                        Copy Description
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onCopy('event-json', fullJson)}
                        className="h-8 text-xs border-white/10 bg-[#03091c] text-zinc-200 hover:text-white"
                    >
                        {copiedKey === 'event-json' ? <Check className="h-3.5 w-3.5 text-emerald-400 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                        Copy Full JSON
                    </Button>
                </div>
            </div>

            {/* Event Details Deck */}
            <div className="space-y-4">
                {/* Title & Host info */}
                <div className="rounded-xl border border-white/[0.08] bg-[#03091c]/70 p-4 space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                        Event Title
                    </span>
                    <h4 className="text-lg font-bold text-white tracking-tight leading-snug">
                        {event.title}
                    </h4>
                </div>

                {/* Logistics Badges */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-xl border border-white/[0.08] bg-[#03091c]/70 p-3 flex flex-col justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1">
                            <Clock className="h-3 w-3 text-brand-400" /> Duration
                        </span>
                        <span className="text-sm font-semibold text-white font-mono mt-1">
                            {event.duration}
                        </span>
                    </div>

                    <div className="rounded-xl border border-white/[0.08] bg-[#03091c]/70 p-3 flex flex-col justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1">
                            <DollarSign className="h-3 w-3 text-emerald-400" /> Suggested Price
                        </span>
                        <span className="text-sm font-semibold text-white font-mono mt-1">
                            {event.suggestedPriceUsd === '0' ? 'Free (RSVP Required)' : `$${event.suggestedPriceUsd} USD`}
                        </span>
                    </div>

                    <div className="rounded-xl border border-white/[0.08] bg-[#03091c]/70 p-3 flex flex-col justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1">
                            <Tag className="h-3 w-3 text-pink-400" /> Genre Tags
                        </span>
                        <div className="flex flex-wrap gap-1 mt-1">
                            {event.genreTags.map((g) => (
                                <span
                                    key={g}
                                    className="text-[10px] font-mono text-brand-300 bg-brand-500/10 border border-brand-500/30 rounded px-1.5 py-0.5"
                                >
                                    #{g}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Description Text */}
                <div className="rounded-xl border border-white/[0.08] bg-[#03091c]/70 p-4 space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                        Luma Format Description
                    </span>
                    <p className="text-xs leading-relaxed text-zinc-200 whitespace-pre-wrap font-sans">
                        {event.description}
                    </p>
                </div>

                {/* Cover Image Prompt */}
                {event.imagePrompt && (
                    <div className="rounded-xl border border-white/10 bg-[#03091c]/80 p-4 space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-brand-400 flex items-center gap-1.5">
                                <ImageIcon className="h-3.5 w-3.5" />
                                Recommended 16:9 Cover Artwork Prompt:
                            </span>
                            <button
                                type="button"
                                onClick={() => onCopy('img-prompt', event.imagePrompt)}
                                className="text-brand-400 hover:text-brand-300 text-xs font-mono flex items-center gap-1"
                            >
                                {copiedKey === 'img-prompt' ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                                copy prompt
                            </button>
                        </div>
                        <p className="text-xs text-zinc-300 leading-relaxed font-sans italic bg-black/40 p-3 rounded-lg border border-white/5">
                            {event.imagePrompt}
                        </p>
                    </div>
                )}

                {event.sourceUrl && (
                    <div className="pt-1">
                        <a
                            href={event.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 font-medium"
                        >
                            <ExternalLink className="h-3.5 w-3.5" />
                            View original source event on Luma
                        </a>
                    </div>
                )}
            </div>
        </section>
    );
}
