'use client';

/**
 * Marketing Agent — internal Cybrdeck marketing tool delegated to One.
 *
 * Mounts inside the dashboard at /dashboard#marketing. Restricted to
 * Admin and Core (Cybrdeck portal) users; the dashboard layout + the
 * API routes both gate on `isCoreOrAdmin`. Not a public surface.
 *
 * Impeccable Design Suite & Cosmic Liquid-Glass Overhaul.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';
import {
    Megaphone,
    Sparkles,
    History,
    Calendar,
    Send,
    CheckCircle2,
    Clock,
    XCircle,
    ExternalLink,
    Copy,
    Check,
    Trash2,
    AlertCircle,
    RefreshCw,
    Sliders,
    Layers,
    ShieldCheck,
    Search,
    Image as ImageIcon,
    Radio,
    Flame,
    Share2,
    Bot,
} from 'lucide-react';
import { useUser } from '@/firebase/auth/use-user';
import { MediaGallery } from '@/components/dashboard/media/MediaGallery';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
    ALL_PLATFORMS,
    PLATFORM_LABELS,
    type CampaignPlatform,
    type PlatformValidation,
} from '@/lib/marketing/constraints';
import {
    STATUS_CHIP,
    STATUS_LABELS,
    canTransition,
    type CampaignStatus,
} from '@/lib/marketing/status';

interface VariantPayload {
    copy: string;
    hashtags: string[];
    imagePrompt?: string;
}

type VariantsByPlatform = Partial<Record<CampaignPlatform, { copy: VariantPayload; validation: PlatformValidation }>>;

interface PublishedPost {
    externalId: string;
    externalUrl?: string;
    publishedAt: string;
    publishedBy: string;
}

interface CampaignDoc extends CampaignSummary {
    instructions?: string | null;
    variants?: VariantsByPlatform;
    reviewedBy?: string | null;
    reviewedAt?: string | null;
    reviewNote?: string | null;
    slug?: string | null;
    attributedUrl?: string | null;
    attributedUrlByPlatform?: Partial<Record<CampaignPlatform, string>>;
    publishedPosts?: Partial<Record<CampaignPlatform, PublishedPost>>;
    lastPublishError?: { platform: CampaignPlatform; status: string; detail?: string; at: string } | null;
}

interface CampaignSummary {
    campaignId: string;
    productName: string;
    productUrl: string | null;
    targetPlatforms: CampaignPlatform[];
    status: string;
    model: string | null;
    operatorEmail: string | null;
    createdAt: string | null;
    updatedAt?: string | null;
}

interface StatsResponse {
    window: { days: number; from: string; to: string };
    total: number;
    byStatus: Record<CampaignStatus, number>;
    byPlatform: Record<CampaignPlatform, number>;
    published: { count: number; byPlatform: Record<CampaignPlatform, number> };
    topReviewers: { email: string; reviewed: number }[];
    connectorStatus: Record<CampaignPlatform, { configured: boolean; screenName?: string }>;
    truncated?: boolean;
}

interface MarketingCritique {
    total: number;
    passesThreshold: boolean;
    scores: {
        voice: number;
        specificity: number;
        narrativeArc: number;
        platformFit: number;
        antiBuzzword: number;
        cta: number;
    };
    revisions: Array<{ axis: string; line: string; fix: string }>;
}

interface MarketingRoundArtifact {
    round: number;
    variants: VariantsByPlatform;
    critique: MarketingCritique | null;
    totalScore: number | null;
}

const PLATFORM_HINTS: Record<CampaignPlatform, { limit: string; rule: string }> = {
    x: { limit: '280 chars', rule: 'Punchy hook · Inline link' },
    instagram: { limit: '2,200 chars', rule: 'Visual caption · Hashtags' },
    linkedin: { limit: '3,000 chars', rule: 'Authority angle · Clear CTA' },
};

function PlatformIconOrLabel({
    platform,
    className = 'h-3.5 w-3.5',
}: {
    platform: CampaignPlatform;
    className?: string;
}) {
    if (platform === 'x') {
        return (
            <img
                src="/X/X_idVRwaKp9b_3.svg"
                alt="X"
                className={cn('object-contain inline-block shrink-0', className)}
            />
        );
    }
    if (platform === 'instagram') {
        return <span className={cn('font-bold text-pink-400', className)}>IG</span>;
    }
    if (platform === 'linkedin') {
        return <span className={cn('font-bold text-blue-400', className)}>in</span>;
    }
    return <span>{PLATFORM_LABELS[platform]}</span>;
}

/** Review button specs derived from the current campaign status. */
interface ReviewAction {
    target: CampaignStatus;
    label: string;
    tone: 'approve' | 'reject' | 'neutral';
}

function reviewActionsFor(status: CampaignStatus): ReviewAction[] {
    const actions: ReviewAction[] = [];
    if (status === 'draft' || status === 'pending_review') {
        actions.push({ target: 'approved', label: 'Approve & Send to All', tone: 'approve' });
        if (status === 'draft') {
            actions.push({ target: 'pending_review', label: 'Submit for Review', tone: 'neutral' });
        } else {
            actions.push({ target: 'rejected', label: 'Reject Draft', tone: 'reject' });
        }
    } else if (status === 'approved') {
        actions.push({ target: 'approved', label: 'Re-Publish to All', tone: 'approve' });
        actions.push({ target: 'draft', label: 'Return to Draft', tone: 'neutral' });
    } else if (status === 'published') {
        actions.push({ target: 'approved', label: 'Re-Publish All', tone: 'approve' });
        actions.push({ target: 'draft', label: 'Return to Draft', tone: 'neutral' });
    } else if (status === 'rejected') {
        actions.push({ target: 'draft', label: 'Return to Draft', tone: 'neutral' });
    }
    return actions;
}

export default function MarketingAgent() {
    const { user } = useUser();

    // Brief inputs.
    const [productName, setProductName] = useState('');
    const [productUrl, setProductUrl] = useState('');
    const [instructions, setInstructions] = useState('');
    const [selected, setSelected] = useState<Record<CampaignPlatform, boolean>>({
        x: true,
        instagram: true,
        linkedin: true,
    });

    // Result + lifecycle state.
    const [generating, setGenerating] = useState(false);
    const [variants, setVariants] = useState<VariantsByPlatform>({});
    const [model, setModel] = useState<string>('');
    const [campaignId, setCampaignId] = useState<string | null>(null);
    const [campaignStatus, setCampaignStatus] = useState<CampaignStatus>('draft');
    const [reviewedBy, setReviewedBy] = useState<string | null>(null);
    const [reviewedAt, setReviewedAt] = useState<string | null>(null);
    const [publishedPosts, setPublishedPosts] = useState<Partial<Record<CampaignPlatform, PublishedPost>>>({});
    const [slug, setSlug] = useState<string | null>(null);
    const [attributedUrl, setAttributedUrl] = useState<string | null>(null);
    const [attributedUrlByPlatform, setAttributedUrlByPlatform] = useState<Partial<Record<CampaignPlatform, string>>>({});
    /**
     * The durable record of a failed publish. Every failure is also flashed
     * as a toast, but toasts expire and this does not — it is the only thing
     * left when the operator reopens the campaign, and the only way to see a
     * failure that happened somewhere else, e.g. approval from Telegram.
     */
    const [lastPublishError, setLastPublishError] = useState<CampaignDoc['lastPublishError']>(null);
    const [apiError, setApiError] = useState<string | null>(null);
    const [toast, setToast] = useState<{ kind: 'ok' | 'warn'; text: string } | null>(null);

    // History state.
    const [history, setHistory] = useState<CampaignSummary[]>([]);
    const [rounds, setRounds] = useState(3);
    const [roundHistory, setRoundHistory] = useState<MarketingRoundArtifact[]>([]);
    const [finalScore, setFinalScore] = useState<number | null>(null);
    const [passesThreshold, setPassesThreshold] = useState<boolean | null>(null);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [loadingDoc, setLoadingDoc] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeCritiqueTab, setActiveCritiqueTab] = useState<number | null>(null);

    // Two-step delete
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    // Per-card interaction state.
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const [publishingPlatform, setPublishingPlatform] = useState<CampaignPlatform | null>(null);
    const [reviewing, setReviewing] = useState(false);

    // Stats state.
    const [stats, setStats] = useState<StatsResponse | null>(null);
    const [statsLoading, setStatsLoading] = useState(false);
    const [liveEvents, setLiveEvents] = useState<any[]>([]);

    const selectedPlatforms = useMemo(
        () => ALL_PLATFORMS.filter((p) => selected[p]),
        [selected],
    );

    const canSubmit =
        !generating &&
        user !== null &&
        productName.trim().length > 0 &&
        selectedPlatforms.length > 0;

    useEffect(() => {
        if (!user) return;
        loadHistory();
        loadStats();

        let isMounted = true;
        fetch('/api/luma')
            .then((res) => res.json())
            .then((data) => {
                if (isMounted && data.success && Array.isArray(data.events)) {
                    setLiveEvents(data.events);
                }
            })
            .catch(() => {});

        return () => {
            isMounted = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.uid]);

    const handleConnectX = () => {
        window.location.href = '/api/marketing/x/connect';
    };

    const getToken = useCallback(async () => {
        if (!user) throw new Error('Not signed in.');
        return user.getIdToken();
    }, [user]);

    const imageSuggestions = useMemo(() => {
        const seen = new Set<string>();
        const out: Array<{ source: string; prompt: string }> = [];
        for (const [platform, entry] of Object.entries(variants)) {
            const prompt = entry?.copy?.imagePrompt?.trim();
            if (!prompt || seen.has(prompt)) continue;
            seen.add(prompt);
            out.push({ source: platform, prompt });
        }
        return out;
    }, [variants]);

    const flash = (kind: 'ok' | 'warn', text: string) => {
        setToast({ kind, text });
        setTimeout(() => setToast(null), 3500);
    };

    const loadHistory = async () => {
        if (!user) return;
        setHistoryLoading(true);
        try {
            const idToken = await user.getIdToken();
            const res = await fetch('/api/marketing/list?limit=20', {
                headers: { Authorization: `Bearer ${idToken}` },
            });
            if (!res.ok) return;
            const data = await res.json();
            setHistory(Array.isArray(data?.campaigns) ? (data.campaigns as CampaignSummary[]) : []);
        } catch (e) {
            console.warn('[MarketingAgent] history fetch error', e);
        } finally {
            setHistoryLoading(false);
        }
    };

    const loadStats = async () => {
        if (!user) return;
        setStatsLoading(true);
        try {
            const idToken = await user.getIdToken();
            const res = await fetch('/api/marketing/stats?window=30', {
                headers: { Authorization: `Bearer ${idToken}` },
            });
            if (!res.ok) return;
            const data = (await res.json()) as Partial<StatsResponse>;
            if (data) {
                setStats({
                    window: data.window ?? { days: 30, from: '', to: '' },
                    total: data.total ?? 0,
                    byStatus: data.byStatus ?? { draft: 0, pending_review: 0, approved: 0, rejected: 0, published: 0 },
                    byPlatform: data.byPlatform ?? { x: 0, instagram: 0, linkedin: 0 },
                    published: data.published ?? { count: 0, byPlatform: { x: 0, instagram: 0, linkedin: 0 } },
                    topReviewers: data.topReviewers ?? [],
                    connectorStatus: data.connectorStatus ?? {
                        x: { configured: false },
                        instagram: { configured: false },
                        linkedin: { configured: false },
                    } as StatsResponse['connectorStatus'],
                    truncated: data.truncated,
                });
            }
        } catch (e) {
            console.warn('[MarketingAgent] stats fetch error', e);
        } finally {
            setStatsLoading(false);
        }
    };

    const handleGenerate = async () => {
        setApiError(null);
        if (!user) {
            setApiError('Sign in required.');
            return;
        }
        if (!productName.trim()) {
            setApiError('Tell One what you are promoting.');
            return;
        }
        if (selectedPlatforms.length === 0) {
            setApiError('Pick at least one target platform.');
            return;
        }

        setGenerating(true);
        try {
            const idToken = await user.getIdToken();
            const res = await fetch('/api/marketing/generate', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${idToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    productName: productName.trim(),
                    productUrl: productUrl.trim(),
                    instructions: instructions.trim(),
                    targetPlatforms: selectedPlatforms,
                    rounds,
                }),
            });
            if (!res.ok) {
                const errBody = await res.json().catch(() => ({}));
                throw new Error(errBody?.message || `Server returned ${res.status}.`);
            }
            const data = await res.json();
            if (data?.success && data?.variants) {
                setVariants(data.variants as VariantsByPlatform);
                setModel(typeof data.model === 'string' ? data.model : '');
                setCampaignId(typeof data.campaignId === 'string' ? data.campaignId : null);
                setCampaignStatus('draft');
                setReviewedBy(null);
                setReviewedAt(null);
                setPublishedPosts({});
                setAttributedUrlByPlatform({});
                setLastPublishError(null);
                setSlug(typeof data.slug === 'string' ? data.slug : null);
                setAttributedUrl(typeof data.attributedUrl === 'string' ? data.attributedUrl : null);
                const rawHistory = Array.isArray(data.history) ? data.history : [];
                setRoundHistory(rawHistory.map((h: any) => ({
                    round: h.round,
                    variants: h.variants,
                    critique: h.critique,
                    totalScore: h.totalScore,
                })));
                setActiveCritiqueTab(rawHistory.length > 0 ? rawHistory.length : null);
                setFinalScore(typeof data.finalScore === 'number' ? data.finalScore : null);
                setPassesThreshold(typeof data.passesThreshold === 'boolean' ? data.passesThreshold : null);
                void loadHistory();
                void loadStats();
            } else {
                throw new Error('No variants returned by the server.');
            }
        } catch (e) {
            setApiError(e instanceof Error ? e.message : 'Generation failed.');
        } finally {
            setGenerating(false);
        }
    };

    const handleDeleteCampaign = async (id: string) => {
        if (!user) return;
        setDeletingId(id);
        setDeleteError(null);
        try {
            const token = await user.getIdToken();
            const res = await fetch(`/api/marketing/${encodeURIComponent(id)}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.message ?? `Delete failed (${res.status})`);
            if (campaignId === id) setCampaignId(null);
            setConfirmDeleteId(null);
            void loadHistory();
        } catch (e) {
            setDeleteError(e instanceof Error ? e.message : 'Could not delete the draft.');
        } finally {
            setDeletingId(null);
        }
    };

    const handleOpenCampaign = async (id: string) => {
        if (!user) return;
        setLoadingDoc(id);
        try {
            const idToken = await user.getIdToken();
            const res = await fetch(`/api/marketing/${encodeURIComponent(id)}`, {
                headers: { Authorization: `Bearer ${idToken}` },
            });
            if (!res.ok) {
                const errBody = await res.json().catch(() => ({}));
                throw new Error(errBody?.message || `Server returned ${res.status}.`);
            }
            const data = await res.json();
            const c = data?.campaign as CampaignDoc | undefined;
            if (c) {
                setProductName(c.productName ?? '');
                setProductUrl(c.productUrl ?? '');
                setInstructions(c.instructions ?? '');
                const sel: Record<CampaignPlatform, boolean> = { x: false, instagram: false, linkedin: false };
                for (const p of (c.targetPlatforms ?? []) as CampaignPlatform[]) sel[p] = true;
                setSelected(sel);
                setVariants(c.variants ?? {});
                setModel(c.model ?? '');
                setCampaignId(c.campaignId ?? id);
                setCampaignStatus((c.status as CampaignStatus) ?? 'draft');
                setReviewedBy(c.reviewedBy ?? null);
                setReviewedAt(c.reviewedAt ?? null);
                setPublishedPosts(c.publishedPosts ?? {});
                setSlug(c.slug ?? null);
                setAttributedUrl(c.attributedUrl ?? null);
                setAttributedUrlByPlatform(c.attributedUrlByPlatform ?? {});
                setLastPublishError(c.lastPublishError ?? null);
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        } catch (e) {
            setApiError(e instanceof Error ? e.message : 'Could not load that campaign.');
        } finally {
            setLoadingDoc(null);
        }
    };

    const handleCopy = async (key: string, text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedKey(key);
            setTimeout(() => setCopiedKey(null), 1500);
        } catch {
            setApiError('Clipboard access was blocked. Select the text manually.');
        }
    };

    const handleReview = async (target: CampaignStatus) => {
        if (!user || !campaignId) return;
        if (!canTransition(campaignStatus, target)) {
            flash('warn', `Can't move a ${campaignStatus} campaign to ${target}.`);
            return;
        }
        setReviewing(true);
        setApiError(null);
        try {
            const idToken = await user.getIdToken();
            const isApprove = target === 'approved';
            const res = await fetch(`/api/marketing/${encodeURIComponent(campaignId)}/review`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${idToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ target, autoPublish: isApprove }),
            });
            if (!res.ok) {
                const errBody = await res.json().catch(() => ({}));
                throw new Error(errBody?.message || `Server returned ${res.status}.`);
            }
            const data = await res.json();
            if (data?.success) {
                const newStatus = (data.status as CampaignStatus) ?? target;
                setCampaignStatus(newStatus);
                setReviewedBy(data.reviewedBy);
                setReviewedAt(new Date().toISOString());

                if (data.publishedPosts) {
                    setPublishedPosts(data.publishedPosts);
                }
                if (Array.isArray(data.publishResults)) {
                    for (const r of data.publishResults) {
                        if (r.attributedUrl && r.platform) {
                            setAttributedUrlByPlatform((prev) => ({ ...prev, [r.platform]: r.attributedUrl }));
                        }
                    }
                }

                void loadHistory();
                void loadStats();

                if (isApprove) {
                    const pubCount = data.publishedCount ?? 0;
                    const unconfCount = data.unconfiguredCount ?? 0;
                    if (pubCount > 0) {
                        const sentPlatforms = (data.publishResults ?? [])
                            .filter((r: any) => r.success)
                            .map((r: any) => PLATFORM_LABELS[r.platform as CampaignPlatform] ?? r.platform)
                            .join(', ');
                        const unconfMsg = unconfCount > 0 ? ` (${unconfCount} platform unconfigured)` : '';
                        flash('ok', `Draft approved & published to ${sentPlatforms}!${unconfMsg}`);
                    } else if (unconfCount > 0) {
                        flash('warn', `Draft approved! (Connectors not configured yet - check API credentials).`);
                    } else {
                        flash('ok', `Draft approved.`);
                    }
                } else {
                    flash('ok', `Campaign marked as ${STATUS_LABELS[newStatus]}.`);
                }
            }
        } catch (e) {
            flash('warn', e instanceof Error ? e.message : 'Review failed.');
        } finally {
            setReviewing(false);
        }
    };

    const handlePublish = async (platform: CampaignPlatform) => {
        if (!user || !campaignId) return;
        setPublishingPlatform(platform);
        setApiError(null);
        try {
            const idToken = await user.getIdToken();
            const res = await fetch('/api/marketing/publish', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${idToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ campaignId, platform }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok && !data?.soft) {
                throw new Error(data?.message || `Server returned ${res.status}.`);
            }
            if (data?.success) {
                setLastPublishError(null);
                setCampaignStatus((data.campaignStatus as CampaignStatus) ?? campaignStatus);
                setPublishedPosts((prev) => ({
                    ...prev,
                    [platform]: {
                        externalId: data.externalId,
                        externalUrl: data.externalUrl,
                        publishedAt: data.publishedAt ?? new Date().toISOString(),
                        publishedBy: user.email ?? user.uid,
                    },
                }));
                if (typeof data.attributedUrl === 'string') {
                    setAttributedUrlByPlatform((prev) => ({ ...prev, [platform]: data.attributedUrl }));
                }
                void loadHistory();
                void loadStats();
                flash('ok', `Published successfully to ${PLATFORM_LABELS[platform]}.`);
            } else {
                const code = typeof data?.code === 'string' ? data.code : 'error';
                // The route has already written `lastPublishError` to the
                // campaign doc. Mirror it into local state so the reason is
                // still on screen after the toast fades and on the next
                // reload, without waiting for a refetch.
                setLastPublishError({
                    platform,
                    status: code,
                    detail: typeof data?.message === 'string' ? data.message : undefined,
                    at: new Date().toISOString(),
                });
                // Quote the connector rather than paraphrasing it. "is not
                // configured, add the env vars" sent operators to the Vercel
                // dashboard for what was usually a revoked token the app
                // could not refresh — the wrong fix, confidently offered.
                if (code === 'rate_limited') {
                    flash(
                        'warn',
                        `${PLATFORM_LABELS[platform]} rate-limited. Retry in ${data?.retryAfterSeconds ?? 60}s.`,
                    );
                } else {
                    flash('warn', data?.message || 'Publish failed.');
                }
            }
        } catch (e) {
            flash('warn', e instanceof Error ? e.message : 'Publish failed.');
        } finally {
            setPublishingPlatform(null);
        }
    };

    const overallStatus = useMemo<PlatformValidation['status']>(() => {
        const statuses = Object.values(variants).map((v) => v?.validation?.status);
        if (statuses.length === 0) return 'ok';
        if (statuses.some((s) => s === 'fail')) return 'fail';
        if (statuses.some((s) => s === 'warning')) return 'warning';
        return 'ok';
    }, [variants]);

    const reviewActions = useMemo(() => reviewActionsFor(campaignStatus), [campaignStatus]);

    const filteredHistory = useMemo(() => {
        if (!searchQuery.trim()) return history;
        const q = searchQuery.toLowerCase();
        return history.filter(
            (c) =>
                c.productName.toLowerCase().includes(q) ||
                (c.operatorEmail && c.operatorEmail.toLowerCase().includes(q)) ||
                c.status.toLowerCase().includes(q),
        );
    }, [history, searchQuery]);

    return (
        <div className="w-full space-y-4 text-zinc-100">
            {/* Header Title & Quick Refresh */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-500/10 border border-brand-500/30 text-brand-400">
                            <Megaphone className="h-3 w-3" />
                        </span>
                        <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white">Marketing Agent Studio</h1>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono border border-brand-500/30 bg-brand-500/10 text-brand-300">
                            Kryptonite Loop
                        </span>
                    </div>
                    <p className="text-xs text-zinc-400 max-w-2xl leading-relaxed">
                        Draft platform-optimized ad copy, execute multi-pass self-critique, and publish directly to connected social accounts.
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => { void loadHistory(); void loadStats(); }}
                        disabled={historyLoading && statsLoading}
                        className="h-7 px-2.5 gap-1.5 text-xs font-medium border-white/10 bg-[#030917]/80 hover:bg-white/[0.05] text-zinc-300 hover:text-white"
                    >
                        <RefreshCw className={cn('h-3 w-3', historyLoading || statsLoading ? 'animate-spin' : '')} />
                        Sync Data
                    </Button>
                </div>
            </div>

            {/* Stats & Connector Command Dock */}
            {stats && (
                <StatsStrip
                    stats={stats}
                    loading={statsLoading}
                    onConnectX={handleConnectX}
                    onFlash={flash}
                />
            )}

            {/* Notification Toast */}
            {toast && (
                <div className={cn(
                    'rounded-xl border px-3.5 py-2.5 text-xs flex items-center gap-2.5 backdrop-blur-md shadow-lg transition-all animate-in fade-in',
                    toast.kind === 'ok'
                        ? 'border-emerald-500/30 bg-emerald-950/40 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.15)]'
                        : 'border-amber-500/30 bg-amber-950/40 text-amber-300 shadow-[0_0_20px_rgba(245,158,11,0.15)]',
                )}>
                    {toast.kind === 'ok' ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    ) : (
                        <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
                    )}
                    <span className="font-medium">{toast.text}</span>
                </div>
            )}

            {/* Tactical Campaign Brief Composer */}
            <section className="rounded-2xl border border-white/[0.08] bg-[#030818]/60 p-4 sm:p-5 space-y-4 shadow-inner">
                <div className="flex flex-wrap items-center justify-between gap-2.5 pb-4 border-b border-white/[0.06]">
                    <div className="flex items-center gap-2">
                        <Flame className="h-3.5 w-3.5 text-brand-400" />
                        <span className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">
                            Live Luma & Campaign Presets
                        </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {liveEvents.length > 0 ? (
                            liveEvents.slice(0, 4).map((evt) => {
                                const isUpcoming = evt.status === 'upcoming';
                                return (
                                    <button
                                        key={evt.id || evt.title}
                                        type="button"
                                        onClick={() => {
                                            setProductName(evt.title);
                                            setProductUrl(evt.url || 'https://cybrdeck.com/events');
                                            setInstructions(`${isUpcoming ? 'UPCOMING EVENT' : 'CONCLUDED / PAST EVENT RECAP'} (${evt.date}). ${evt.title} at ${evt.location}. Agenda & Overview: ${evt.description}`);
                                        }}
                                        className={cn(
                                            'text-xs px-3 py-1.5 rounded-full border transition-all font-medium flex items-center gap-1.5',
                                            isUpcoming
                                                ? 'border-brand-500/30 bg-brand-500/10 text-brand-300 hover:bg-brand-500/20 hover:border-brand-400/50 shadow-sm'
                                                : 'border-white/10 bg-white/[0.02] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]'
                                        )}
                                    >
                                        <Calendar className="h-3 w-3" />
                                        <span>{evt.title}</span>
                                        <span className="text-[10px] opacity-75 font-mono">({evt.date})</span>
                                    </button>
                                );
                            })
                        ) : (
                            <>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setProductName('Cybrdeck Monthly Shuffle');
                                        setProductUrl('https://cybrdeck.com/events');
                                        setInstructions('Monthly squad meetup for technical leads, builders, and operators. Agenda: Strategic Vision, Technical Roadmap, Operational Architecture & Deployment Standards, Networking.');
                                    }}
                                    className="text-xs px-3 py-1.5 rounded-full border border-brand-500/30 bg-brand-500/10 text-brand-300 hover:bg-brand-500/20 transition-all font-medium flex items-center gap-1.5"
                                >
                                    <Calendar className="h-3 w-3" />
                                    <span>Cybrdeck Monthly Shuffle</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setProductName('ONE AI HACKATHON');
                                        setProductUrl('https://cybrdeck.com/events');
                                        setInstructions('Turning deep domain expertise into investment-ready MVPs. 1 Curated Problem Statement • 1 Focused Team • 1 Intensive Day • 1 Working MVP.');
                                    }}
                                    className="text-xs px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.02] text-zinc-300 hover:text-white hover:bg-white/[0.06] transition-all font-medium flex items-center gap-1.5"
                                >
                                    <span>ONE AI Hackathon</span>
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {/* Form Fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <label className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider flex items-center justify-between">
                            <span>Product / Initiative Name</span>
                            <span className="text-rose-400 text-xs">*</span>
                        </label>
                        <Input
                            value={productName}
                            onChange={(e) => setProductName(e.target.value)}
                            placeholder="e.g. Cybrdeck Workspace — Autonomous Agent Tier"
                            maxLength={200}
                            className="h-10 bg-[#020512]/90 border-white/10 focus:border-brand-400 focus:ring-1 focus:ring-brand-400 text-zinc-100 placeholder:text-zinc-600 rounded-xl"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">
                            Landing URL <span className="text-zinc-500 lowercase font-normal">(optional attribution base)</span>
                        </label>
                        <div className="relative">
                            <Share2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                            <Input
                                value={productUrl}
                                onChange={(e) => setProductUrl(e.target.value)}
                                placeholder="https://cybrdeck.com/subscribe"
                                type="url"
                                maxLength={500}
                                className="h-10 pl-9 bg-[#020512]/90 border-white/10 focus:border-brand-400 focus:ring-1 focus:ring-brand-400 text-zinc-100 placeholder:text-zinc-600 rounded-xl"
                            />
                        </div>
                    </div>
                </div>

                <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                        <label className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">
                            Campaign Brief & Positioning Rails
                        </label>
                        <span className="text-[10px] font-mono text-zinc-500">
                            {instructions.length}/2000 chars
                        </span>
                    </div>
                    <Textarea
                        value={instructions}
                        onChange={(e) => setInstructions(e.target.value)}
                        placeholder="Detail target audience, core technical proof points, pain points solved, tone directives, and forbidden buzzwords..."
                        maxLength={2000}
                        rows={3}
                        className="resize-none bg-[#020512]/90 border-white/10 focus:border-brand-400 focus:ring-1 focus:ring-brand-400 text-zinc-100 placeholder:text-zinc-600 rounded-xl leading-relaxed"
                    />
                    <p className="text-[11px] text-zinc-500 flex items-center gap-1.5 pt-0.5">
                        <ShieldCheck className="h-3.5 w-3.5 text-brand-400 shrink-0" />
                        <span>One operates strictly on supplied facts — never fabricates pricing or features.</span>
                    </p>
                </div>

                {/* Target Platforms Toggle Matrix */}
                <div className="space-y-2">
                    <label className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">
                        Distribution Channels
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {ALL_PLATFORMS.map((p) => {
                            const on = selected[p];
                            const configured = stats?.connectorStatus?.[p]?.configured ?? false;
                            const hint = PLATFORM_HINTS[p];
                            return (
                                <button
                                    key={p}
                                    type="button"
                                    onClick={() => setSelected((s) => ({ ...s, [p]: !s[p] }))}
                                    className={cn(
                                        'group relative flex flex-col items-start gap-1 p-3.5 rounded-xl border text-left transition-all select-none',
                                        on
                                            ? 'border-brand-500/40 bg-gradient-to-b from-brand-500/15 via-brand-950/20 to-[#020614] shadow-[0_0_15px_rgba(198,143,61,0.12)]'
                                            : 'border-white/[0.08] bg-[#020614]/60 text-zinc-400 hover:border-white/20 hover:bg-[#03091c]/70',
                                    )}
                                    aria-pressed={on}
                                >
                                    <div className="flex items-center justify-between w-full">
                                        <div className="flex items-center gap-2">
                                            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/5 border border-white/10">
                                                <PlatformIconOrLabel platform={p} className="h-3.5 w-3.5" />
                                            </div>
                                            <span className={cn('text-xs font-bold', on ? 'text-white' : 'text-zinc-300')}>
                                                {PLATFORM_LABELS[p]}
                                            </span>
                                        </div>
                                        <span
                                            className={cn(
                                                'h-2 w-2 rounded-full',
                                                configured ? 'bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-zinc-600',
                                            )}
                                            title={configured ? 'OAuth Connector Configured' : 'Missing Env Config'}
                                        />
                                    </div>
                                    <div className="flex items-center justify-between w-full pt-1 text-[10px] text-zinc-500 font-mono">
                                        <span>{hint.limit}</span>
                                        <span className="truncate max-w-[120px]">{hint.rule}</span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Bottom Trigger Controls */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 border-t border-white/[0.06]">
                    {/* Multi-Round Selector */}
                    <div className="flex items-center gap-3">
                        <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                            <Layers className="h-3.5 w-3.5 text-brand-400" />
                            Refinement Passes:
                        </span>
                        <div className="inline-flex p-0.5 rounded-lg border border-white/10 bg-[#020512] text-xs font-mono">
                            {[1, 2, 3].map((r) => (
                                <button
                                    key={r}
                                    type="button"
                                    onClick={() => setRounds(r)}
                                    className={cn(
                                        'px-3 py-1 rounded-md transition-all font-semibold',
                                        rounds === r
                                            ? 'bg-brand-500/20 text-brand-200 border border-brand-500/30 shadow-sm'
                                            : 'text-zinc-500 hover:text-zinc-200',
                                    )}
                                >
                                    {r} {r === 1 ? 'Pass' : 'Passes'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Run Agent CTA */}
                    <Button
                        type="button"
                        onClick={handleGenerate}
                        disabled={!canSubmit}
                        className={cn(
                            'h-11 px-7 rounded-xl font-semibold text-xs tracking-wider uppercase transition-all shadow-lg select-none',
                            canSubmit
                                ? 'bg-gradient-to-r from-brand-500 to-blue-600 hover:from-brand-400 hover:to-blue-500 text-white shadow-[0_0_25px_rgba(198,143,61,0.35)] active:scale-[0.98]'
                                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-white/5',
                        )}
                    >
                        {generating ? (
                            <span className="flex items-center gap-2">
                                <RefreshCw className="h-4 w-4 animate-spin text-brand-200" />
                                <span>Running Kryptonite Loop…</span>
                            </span>
                        ) : (
                            <span className="flex items-center gap-2">
                                <Sparkles className="h-4 w-4 text-brand-200" />
                                <span>Generate Ad Variants</span>
                            </span>
                        )}
                    </Button>
                </div>
            </section>

            {apiError && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-950/30 p-4 text-xs text-rose-300 flex items-start gap-3">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-rose-400" />
                    <div className="font-medium">{apiError}</div>
                </div>
            )}

            {/* A failed publish is not the same as a publish that never
                happened, and from here the two are indistinguishable: the
                post may already be live on X. The status code alone cannot
                tell a revoked token from a too-long post, so the stored
                reason is shown in full — this record outlives the toast, and
                it also surfaces failures approved from Telegram, which never
                touched this screen. */}
            {campaignId && lastPublishError && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 text-xs text-amber-200 flex items-start gap-3">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-amber-400" />
                    <div className="min-w-0 space-y-1">
                        <div className="font-medium text-amber-100">
                            Last publish to {PLATFORM_LABELS[lastPublishError.platform]} failed
                            <span className="ml-1.5 font-mono text-[10px] text-amber-400/80">
                                {lastPublishError.status}
                            </span>
                        </div>
                        {lastPublishError.detail && (
                            <p className="leading-relaxed break-words text-amber-200/80">
                                {lastPublishError.detail}
                            </p>
                        )}
                        <p className="text-[10px] text-amber-400/60">
                            {new Date(lastPublishError.at).toLocaleString()} · check the post is already live before retrying.
                        </p>
                    </div>
                </div>
            )}

            {/* Generated Variants & Output Review Deck */}
            {Object.keys(variants).length > 0 && (
                <section className="space-y-4 pt-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                            <Sparkles className="h-4 w-4 text-brand-400" />
                            <h2 className="text-base font-bold text-white tracking-tight">Draft Variants Output</h2>
                            {campaignId && (
                                <CampaignStatusPill status={campaignStatus} />
                            )}
                        </div>
                        <StatusPill status={overallStatus} />
                    </div>

                    {/* Review Action Toolbar */}
                    {campaignId && reviewActions.length > 0 && (
                        <div className="rounded-xl border border-white/10 bg-[#030818]/80 px-4 py-3 flex flex-wrap items-center justify-between gap-3 backdrop-blur-md">
                            <div className="flex items-center gap-2">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mr-1">
                                    Editorial Action:
                                </span>
                                {reviewActions.map((a) => (
                                    <Button
                                        key={a.target + a.label}
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleReview(a.target)}
                                        disabled={reviewing}
                                        className={cn(
                                            'h-8 gap-1.5 text-xs font-semibold rounded-lg transition-all',
                                            a.tone === 'approve'
                                                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
                                                : a.tone === 'reject'
                                                    ? 'border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20'
                                                    : 'border-white/10 bg-white/5 text-zinc-300 hover:text-white',
                                        )}
                                    >
                                        {reviewing && a.tone === 'approve' ? (
                                            <RefreshCw className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                                        ) : a.tone === 'approve' ? (
                                            <Send className="h-3.5 w-3.5 text-emerald-400" />
                                        ) : a.tone === 'reject' ? (
                                            <XCircle className="h-3.5 w-3.5 text-rose-400" />
                                        ) : (
                                            <Clock className="h-3.5 w-3.5 text-zinc-400" />
                                        )}
                                        {reviewing && a.tone === 'approve' ? 'Approving & Sending…' : a.label}
                                    </Button>
                                ))}
                            </div>
                            {reviewedBy && (
                                <span className="text-[11px] text-zinc-500">
                                    Last action by <span className="font-mono text-zinc-300">{reviewedBy}</span>
                                    {reviewedAt ? ` · ${new Date(reviewedAt).toLocaleDateString()}` : ''}
                                </span>
                            )}
                        </div>
                    )}

                    {/* Attribution Link Deck */}
                    {slug && (
                        <AttributionPanel
                            slug={slug}
                            attributedUrl={attributedUrl}
                            perPlatform={attributedUrlByPlatform}
                            published={publishedPosts}
                            onCopy={handleCopy}
                            copiedKey={copiedKey}
                        />
                    )}

                    {/* Platform Simulator Cards Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {selectedPlatforms.map((platform) => {
                            const entry = variants[platform];
                            if (!entry) return null;
                            const published = publishedPosts[platform];
                            const configured = stats?.connectorStatus?.[platform]?.configured ?? false;
                            return (
                                <PlatformCard
                                    key={platform}
                                    platform={platform}
                                    entry={entry}
                                    copiedKey={copiedKey}
                                    onCopy={handleCopy}
                                    onPublish={handlePublish}
                                    publishing={publishingPlatform === platform}
                                    published={published}
                                    configured={configured}
                                    campaignStatus={campaignStatus}
                                />
                            );
                        })}
                    </div>
                </section>
            )}

            {/* Campaign Media Assets Section */}
            {campaignId && user && (
                <div className="rounded-2xl border border-white/[0.08] bg-[#020614]/60 p-5">
                    <MediaGallery
                        campaignId={campaignId}
                        getToken={getToken}
                        suggestions={imageSuggestions}
                        platforms={selectedPlatforms.length > 0 ? selectedPlatforms : ALL_PLATFORMS}
                    />
                </div>
            )}

            {/* Self-Critique Quality Scorecard */}
            {roundHistory.length > 0 && finalScore !== null && (
                <section className="rounded-2xl border border-brand-500/25 bg-gradient-to-br from-[#02091c] via-[#020512] to-black p-5 sm:p-6 space-y-4 shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
                    <div className="flex items-center justify-between pb-3 border-b border-brand-500/20">
                        <div className="flex items-center gap-2">
                            <Bot className="h-4 w-4 text-brand-400" />
                            <h2 className="text-sm font-bold text-brand-200 uppercase tracking-wider">
                                One's Self-Critique & Kryptonite Quality Matrix
                            </h2>
                        </div>
                        <div className="flex items-center gap-2 text-xs font-mono">
                            <span className={cn(
                                'px-3 py-1 rounded-full border font-bold',
                                passesThreshold
                                    ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10'
                                    : 'border-amber-500/40 text-amber-300 bg-amber-500/10',
                            )}>
                                Score: {finalScore} / 60
                            </span>
                            <span className="text-zinc-500 uppercase text-[10px]">
                                {passesThreshold ? 'Passes Brand Quality' : 'Needs Polish'}
                            </span>
                        </div>
                    </div>

                    {/* Round Tabs */}
                    <div className="flex gap-2 border-b border-white/5 pb-2">
                        {roundHistory.map((h) => (
                            <button
                                key={h.round}
                                type="button"
                                onClick={() => setActiveCritiqueTab(h.round)}
                                className={cn(
                                    'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                                    activeCritiqueTab === h.round
                                        ? 'bg-brand-500/20 text-brand-200 border border-brand-500/40 shadow-sm'
                                        : 'text-zinc-500 hover:text-zinc-300',
                                )}
                            >
                                Round {h.round} {h.critique ? `(${h.critique.total}/60)` : ''}
                            </button>
                        ))}
                    </div>

                    {/* Active Round Score Details */}
                    {roundHistory
                        .filter((h) => h.round === (activeCritiqueTab || roundHistory.length))
                        .map((h) => {
                            const axes = h.critique?.scores;
                            return (
                                <div key={h.round} className="space-y-4 pt-1">
                                    {axes && (
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 text-xs font-mono">
                                            {(['voice', 'specificity', 'narrativeArc', 'platformFit', 'antiBuzzword', 'cta'] as const).map((k) => (
                                                <div
                                                    key={k}
                                                    className="rounded-xl border border-white/10 bg-[#03091c]/80 p-3 flex flex-col justify-between space-y-1.5"
                                                >
                                                    <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{k}</span>
                                                    <div className="flex items-center justify-between">
                                                        <span className={cn(
                                                            'font-bold text-sm',
                                                            axes[k] >= 7 ? 'text-emerald-400' :
                                                            axes[k] >= 5 ? 'text-amber-400' : 'text-rose-400',
                                                        )}>
                                                            {axes[k]}<span className="text-zinc-600 text-xs">/10</span>
                                                        </span>
                                                        <div className="w-12 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                                            <div
                                                                className={cn(
                                                                    'h-full rounded-full',
                                                                    axes[k] >= 7 ? 'bg-emerald-400' :
                                                                    axes[k] >= 5 ? 'bg-amber-400' : 'bg-rose-400',
                                                                )}
                                                                style={{ width: `${(axes[k] / 10) * 100}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {h.critique && h.critique.revisions.length > 0 && (
                                        <div className="space-y-2 pt-2">
                                            <span className="text-[11px] font-semibold text-brand-400 uppercase tracking-wider">
                                                Self-Correction Log:
                                            </span>
                                            <ul className="space-y-2 text-xs">
                                                {h.critique.revisions.map((r, i) => (
                                                    <li key={i} className="rounded-xl bg-[#030818] border border-amber-500/20 p-3 leading-relaxed flex flex-col gap-1">
                                                        <span className="text-[10px] font-mono uppercase text-amber-400 font-bold">
                                                            Axis: [{r.axis}]
                                                        </span>
                                                        <p className="text-zinc-400 line-through text-[11px]">{r.line}</p>
                                                        <p className="text-emerald-300 font-medium text-xs flex items-center gap-1.5">
                                                            <span className="text-zinc-500">↳</span> {r.fix}
                                                        </p>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                </section>
            )}

            {/* Campaign History Table */}
            <section className="rounded-2xl border border-white/[0.08] bg-[#020614]/60 overflow-hidden shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.08] px-5 py-4">
                    <div className="flex items-center gap-2 text-white">
                        <History className="h-4 w-4 text-brand-400" />
                        <h2 className="text-sm font-bold tracking-tight">Recent Campaign Drafts</h2>
                        <span className="text-xs font-mono text-zinc-500">
                            ({filteredHistory.length})
                        </span>
                    </div>

                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
                        <Input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Filter campaigns…"
                            className="h-8 pl-8 text-xs bg-[#03091c] border-white/10 rounded-lg text-zinc-200 placeholder:text-zinc-600"
                        />
                    </div>
                </div>

                {deleteError && (
                    <p className="mx-5 mt-3 rounded-lg border border-rose-500/30 bg-rose-950/20 px-3 py-2 text-xs text-rose-300">
                        {deleteError}
                    </p>
                )}

                <div className="divide-y divide-white/[0.05] max-h-96 overflow-y-auto custom-scrollbar">
                    {historyLoading && history.length === 0 && (
                        <div className="px-5 py-8 text-xs text-zinc-500 flex items-center justify-center gap-2">
                            <RefreshCw className="h-4 w-4 animate-spin text-brand-400" />
                            Loading previous campaigns…
                        </div>
                    )}
                    {!historyLoading && filteredHistory.length === 0 && (
                        <div className="px-5 py-8 text-xs text-zinc-500 text-center">
                            No campaigns match your search.
                        </div>
                    )}
                    {filteredHistory.map((c) => {
                        const published = (c.status as CampaignStatus) === 'published';
                        const confirming = confirmDeleteId === c.campaignId;
                        const deleting = deletingId === c.campaignId;
                        return (
                            <div
                                key={c.campaignId}
                                className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-white/[0.03] transition-colors group"
                            >
                                <button
                                    type="button"
                                    onClick={() => handleOpenCampaign(c.campaignId)}
                                    disabled={loadingDoc === c.campaignId || deleting}
                                    className="min-w-0 flex-1 text-left"
                                >
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-semibold text-zinc-200 group-hover:text-brand-300 transition-colors truncate">
                                            {c.productName}
                                        </span>
                                        <CampaignStatusPill status={c.status as CampaignStatus} />
                                    </div>
                                    <div className="text-[11px] text-zinc-500 mt-1 flex flex-wrap items-center gap-2 font-mono">
                                        <span>{(c.targetPlatforms ?? []).map((p) => PLATFORM_LABELS[p]).join(' · ')}</span>
                                        {c.createdAt && (
                                            <span>· {new Date(c.createdAt).toLocaleDateString()}</span>
                                        )}
                                        {c.operatorEmail && (
                                            <span className="text-zinc-600 truncate max-w-[150px]">· {c.operatorEmail}</span>
                                        )}
                                    </div>
                                </button>

                                <div className="flex items-center gap-2 shrink-0">
                                    {!published && (
                                        confirming ? (
                                            <div className="flex items-center gap-1.5">
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="destructive"
                                                    disabled={deleting}
                                                    onClick={() => handleDeleteCampaign(c.campaignId)}
                                                    className="h-7 px-2.5 text-[10px] uppercase font-bold"
                                                >
                                                    {deleting ? 'Deleting…' : 'Confirm'}
                                                </Button>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="ghost"
                                                    disabled={deleting}
                                                    onClick={() => setConfirmDeleteId(null)}
                                                    className="h-7 px-2 text-[10px] text-zinc-400"
                                                >
                                                    Cancel
                                                </Button>
                                            </div>
                                        ) : (
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => setConfirmDeleteId(c.campaignId)}
                                                className="h-7 w-7 p-0 text-zinc-600 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                                title="Delete draft"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        )
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>
        </div>
    );
}

function PlatformCard({
    platform,
    entry,
    copiedKey,
    onCopy,
    onPublish,
    publishing,
    published,
    configured,
    campaignStatus,
}: {
    platform: CampaignPlatform;
    entry: { copy: VariantPayload; validation: PlatformValidation };
    copiedKey: string | null;
    onCopy: (key: string, text: string) => void;
    onPublish: (platform: CampaignPlatform) => void;
    publishing: boolean;
    published?: PublishedPost;
    configured: boolean;
    campaignStatus: CampaignStatus;
}) {
    const { copy, hashtags, imagePrompt } = entry.copy;
    const fullText = [
        copy,
        hashtags && hashtags.length > 0 ? hashtags.map((h) => `#${h}`).join(' ') : '',
    ]
        .filter(Boolean)
        .join('\n\n');
    const copyKey = `${platform}-copy`;

    const canSend = configured && !publishing;

    return (
        <article className="rounded-2xl border border-white/[0.08] bg-[#020614]/80 overflow-hidden flex flex-col shadow-lg backdrop-blur-md">
            {/* Platform Header */}
            <header className="flex items-center justify-between gap-2 border-b border-white/[0.08] px-4 py-3 bg-[#030818]/60">
                <div className="flex items-center gap-2 min-w-0">
                    <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/5 border border-white/10">
                        <PlatformIconOrLabel platform={platform} className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-xs font-bold text-white tracking-tight">
                        {PLATFORM_LABELS[platform]}
                    </span>
                </div>
                <CheckPill validation={entry.validation} />
            </header>

            {/* Simulated Post Body */}
            <div className="p-4 space-y-3.5 flex-1 text-xs">
                {/* Simulated Author Header */}
                <div className="flex items-center gap-2.5">
                    <div className="h-7 w-7 rounded-full bg-brand-500/20 border border-brand-500/40 flex items-center justify-center text-[10px] font-bold text-brand-300">
                        CD
                    </div>
                    <div className="flex flex-col leading-tight">
                        <div className="flex items-center gap-1 font-bold text-zinc-100">
                            <span>Cybrdeck</span>
                            <span className="text-brand-400 text-[10px]">✓</span>
                        </div>
                        <span className="text-[10px] text-zinc-500 font-mono">@cybrdeck</span>
                    </div>
                </div>

                <p className="text-xs leading-relaxed whitespace-pre-wrap text-zinc-200 font-sans">
                    {copy || '—'}
                </p>

                {hashtags && hashtags.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                        {hashtags.map((h) => (
                            <span key={h} className="text-[11px] font-medium text-brand-400 hover:underline cursor-pointer">
                                #{h}
                            </span>
                        ))}
                    </div>
                )}

                {imagePrompt && (
                    <div className="rounded-xl border border-white/10 bg-[#03091c]/80 p-3 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-brand-400">
                            <ImageIcon className="h-3 w-3" />
                            Visual Asset Prompt:
                        </div>
                        <p className="text-[11px] text-zinc-300 leading-relaxed font-sans">{imagePrompt}</p>
                    </div>
                )}

                {published && (
                    <a
                        href={published.externalUrl ?? '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 pt-1 font-medium"
                    >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Live on {PLATFORM_LABELS[platform]} · {new Date(published.publishedAt).toLocaleTimeString()}
                    </a>
                )}
            </div>

            {/* Action Footer */}
            <footer className="border-t border-white/[0.08] px-3.5 py-2.5 bg-[#030818]/40 flex items-center justify-between gap-2">
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onCopy(copyKey, fullText)}
                    className="h-8 gap-1.5 text-xs text-zinc-300 hover:text-white"
                >
                    {copiedKey === copyKey ? (
                        <>
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                            <span className="text-emerald-400">Copied</span>
                        </>
                    ) : (
                        <>
                            <Copy className="h-3.5 w-3.5" />
                            <span>Copy Text</span>
                        </>
                    )}
                </Button>

                <Button
                    type="button"
                    size="sm"
                    onClick={() => onPublish(platform)}
                    disabled={!canSend}
                    className={cn(
                        'h-8 gap-1.5 text-xs font-semibold rounded-lg transition-all',
                        canSend
                            ? 'bg-brand-500/20 hover:bg-brand-500/30 text-brand-200 border border-brand-500/40 shadow-sm'
                            : 'bg-white/[0.03] text-zinc-600 border border-white/5 cursor-not-allowed',
                    )}
                >
                    {publishing ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                        <Send className="h-3.5 w-3.5" />
                    )}
                    <span>{published ? 'Re-Publish' : `Publish to ${PLATFORM_LABELS[platform]}`}</span>
                </Button>
            </footer>
        </article>
    );
}

function AttributionPanel({
    slug,
    attributedUrl,
    perPlatform,
    published,
    onCopy,
    copiedKey,
}: {
    slug: string;
    attributedUrl: string | null;
    perPlatform: Partial<Record<CampaignPlatform, string>>;
    published: Partial<Record<CampaignPlatform, PublishedPost>>;
    onCopy: (key: string, text: string) => void;
    copiedKey: string | null;
}) {
    return (
        <div className="rounded-2xl border border-white/[0.08] bg-[#020614]/70 p-4 space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Share2 className="h-4 w-4 text-brand-400" />
                    <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                        Campaign Attribution UTMs
                    </span>
                    <code className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[11px] font-mono text-brand-300">
                        utm_campaign={slug}
                    </code>
                </div>
                {attributedUrl && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onCopy('attribution-default', attributedUrl)}
                        className="h-7 text-xs text-zinc-300 hover:text-white"
                    >
                        {copiedKey === 'attribution-default' ? <Check className="h-3 w-3 text-emerald-400 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                        Copy Default Link
                    </Button>
                )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {ALL_PLATFORMS.map((p) => {
                    const url = perPlatform[p];
                    const wasPublished = Boolean(published[p]);
                    const key = `attribution-${p}`;
                    return (
                        <div
                            key={p}
                            className={cn(
                                'rounded-xl border p-2.5 text-xs',
                                wasPublished
                                    ? 'border-emerald-500/30 bg-emerald-950/20'
                                    : 'border-white/10 bg-[#03091c]/60',
                            )}
                        >
                            <div className="flex items-center justify-between">
                                <span className="font-semibold text-zinc-300 flex items-center gap-1.5">
                                    <PlatformIconOrLabel platform={p} className="h-3 w-3" />
                                    {PLATFORM_LABELS[p]}
                                </span>
                                {url && (
                                    <button
                                        type="button"
                                        onClick={() => onCopy(key, url)}
                                        className="text-brand-400 hover:text-brand-300 text-[11px] font-mono flex items-center gap-1"
                                    >
                                        {copiedKey === key ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                                        copy
                                    </button>
                                )}
                            </div>
                            <div className="mt-1 font-mono text-[10px] text-zinc-500 truncate" title={url || ''}>
                                {url || (wasPublished ? '—' : 'Available upon publish')}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function StatsStrip({
    stats,
    loading,
    onConnectX,
    onFlash,
}: {
    stats: StatsResponse;
    loading: boolean;
    onConnectX: () => void;
    onFlash: (kind: 'ok' | 'warn', text: string) => void;
}) {
    const connectedCount = ALL_PLATFORMS.filter((p) => stats.connectorStatus[p]?.configured).length;
    const publishedPercent = stats.total > 0 ? Math.round((stats.published.count / stats.total) * 100) : 0;

    return (
        <section className="rounded-xl border border-white/[0.08] bg-[#020614]/75 p-3.5 sm:p-4 space-y-3 backdrop-blur-xl shadow-md">
            {/* Header Telemetry */}
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
                <div className="flex items-center gap-2">
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand-500/10 border border-brand-500/30 text-brand-400">
                        <Radio className="h-2.5 w-2.5" />
                    </span>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-300">
                        Campaign Performance & Distribution
                    </span>
                    <span className="text-[10px] font-mono text-zinc-500">· Last {stats.window.days}d</span>
                </div>
                <div className="flex items-center gap-2.5">
                    <span className={cn(
                        "text-[9px] font-mono px-2 py-0.5 rounded-full border font-bold uppercase tracking-wider",
                        connectedCount > 0
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                            : "border-zinc-700/50 bg-zinc-900/40 text-zinc-500"
                    )}>
                        {connectedCount}/3 Channels Active
                    </span>
                    {stats.truncated && (
                        <span className="text-[10px] text-amber-400 font-mono">Sampled &gt; 5k</span>
                    )}
                    {loading && <RefreshCw className="h-3 w-3 animate-spin text-brand-400" />}
                </div>
            </div>

            {/* 1. Essential Metrics Display (Ultra-compact 4-pod KPI Deck) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                <StatCard
                    icon={<Layers className="h-3 w-3 text-zinc-400" />}
                    label="Drafts Inflow"
                    value={stats.total}
                    subtext="Total briefs generated"
                />
                <StatCard
                    icon={<Send className="h-3 w-3 text-brand-400" />}
                    label="Published Live"
                    value={stats.published.count}
                    accent="cyan"
                    subtext={`${publishedPercent}% broadcast rate`}
                    progressBar={publishedPercent}
                />
                <StatCard
                    icon={<Clock className="h-3 w-3 text-amber-400" />}
                    label="Pending Review"
                    value={stats.byStatus.pending_review}
                    accent="amber"
                    subtext="Awaiting team review"
                    highlight={stats.byStatus.pending_review > 0}
                />
                <StatCard
                    icon={<XCircle className="h-3 w-3 text-rose-400" />}
                    label="Rejected Drafts"
                    value={stats.byStatus.rejected}
                    accent="rose"
                    subtext="Filtered by editorial"
                />
            </div>

            {/* 2. Social Distribution Channels (Compact 3-Card Grid) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-0.5">
                {ALL_PLATFORMS.map((platform) => {
                    const statusObj = stats.connectorStatus[platform];
                    const isConnected = Boolean(statusObj?.configured);
                    const screenName = statusObj?.screenName;
                    const drafted = stats.byPlatform[platform] ?? 0;
                    const sent = stats.published.byPlatform[platform] ?? 0;

                    return (
                        <SocialRadialCard
                            key={platform}
                            platform={platform}
                            isConnected={isConnected}
                            screenName={screenName}
                            drafted={drafted}
                            sent={sent}
                            onConnect={() => {
                                if (platform === 'x') {
                                    onConnectX();
                                } else {
                                    onFlash(
                                        isConnected ? 'ok' : 'warn',
                                        isConnected
                                            ? `${PLATFORM_LABELS[platform]} connector is active via deployment environment credentials.`
                                            : `${PLATFORM_LABELS[platform]} requires credentials in deployment environment settings.`
                                    );
                                }
                            }}
                        />
                    );
                })}
            </div>

            {/* Reviewers Ledger */}
            {stats.topReviewers.length > 0 && (
                <div className="pt-2 border-t border-white/[0.06] flex flex-wrap items-center gap-1.5 text-[10px]">
                    <span className="text-zinc-500 font-semibold uppercase tracking-wider">Top Reviewers:</span>
                    {stats.topReviewers.map((r) => (
                        <span key={r.email} className="inline-flex items-center gap-1 font-mono text-zinc-300 bg-[#03091c] px-2 py-0.5 rounded border border-white/[0.06]">
                            <span>{r.email}</span>
                            <span className="text-brand-400 font-bold">({r.reviewed})</span>
                        </span>
                    ))}
                </div>
            )}
        </section>
    );
}

function SocialRadialCard({
    platform,
    isConnected,
    screenName,
    drafted,
    sent,
    onConnect,
}: {
    platform: CampaignPlatform;
    isConnected: boolean;
    screenName?: string;
    drafted: number;
    sent: number;
    onConnect: () => void;
}) {
    return (
        <div className={cn(
            "group relative rounded-xl border p-2.5 px-3 flex items-center gap-3 transition-all duration-200",
            isConnected
                ? "border-emerald-500/30 bg-gradient-to-r from-[#020c1a] via-[#020716] to-[#01040e] shadow-sm hover:border-emerald-500/50"
                : "border-white/[0.08] bg-[#020512]/70 hover:border-white/15"
        )}>
            {/* Compact Platform Avatar with glowing status dot */}
            <div className="relative shrink-0">
                <div className={cn(
                    "h-9 w-9 rounded-full border flex items-center justify-center relative transition-all duration-300 select-none",
                    isConnected
                        ? "border-emerald-400/80 bg-emerald-950/50 shadow-[0_0_12px_rgba(16,185,129,0.35)] ring-1 ring-emerald-500/30"
                        : "border-zinc-700/60 bg-zinc-900/60 opacity-60 group-hover:opacity-80"
                )}>
                    {platform === 'x' && (
                        <img
                            src="/X/X_idVRwaKp9b_3.svg"
                            alt="X"
                            className={cn(
                                "h-3.5 w-3.5 object-contain transition-all",
                                isConnected ? "brightness-125 drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" : "opacity-40 grayscale"
                            )}
                        />
                    )}
                    {platform === 'instagram' && (
                        <svg
                            className={cn(
                                "h-3.5 w-3.5 transition-all",
                                isConnected ? "text-pink-400 drop-shadow-[0_0_6px_rgba(244,114,182,0.7)]" : "text-zinc-600"
                            )}
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
                            <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                            <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
                        </svg>
                    )}
                    {platform === 'linkedin' && (
                        <svg
                            className={cn(
                                "h-3.5 w-3.5 transition-all",
                                isConnected ? "text-blue-400 drop-shadow-[0_0_6px_rgba(96,165,250,0.7)]" : "text-zinc-600"
                            )}
                            viewBox="0 0 24 24"
                            fill="currentColor"
                        >
                            <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 8.76a1.6 1.6 0 1 0-.01-3.2 1.6 1.6 0 0 0 .01 3.2m1.4 9.74v-8.37H5.06v8.37h2.8z" />
                        </svg>
                    )}

                    {/* Glowing status dot */}
                    {isConnected ? (
                        <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-80" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,1)]" />
                        </span>
                    ) : (
                        <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-zinc-700" />
                    )}
                </div>
            </div>

            {/* Content info */}
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
                <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5 truncate">
                        <span className="text-xs font-bold text-white tracking-tight truncate">
                            {PLATFORM_LABELS[platform]}
                        </span>
                        <span className="text-[10px] font-mono text-zinc-400 truncate">
                            {platform === 'x' && screenName ? `@${screenName}` : isConnected ? 'Connected' : 'Unconfigured'}
                        </span>
                    </div>
                    <span className={cn(
                        "text-[8px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0",
                        isConnected
                            ? "text-emerald-300 bg-emerald-950/60 border-emerald-500/40"
                            : "text-zinc-500 bg-zinc-900 border-zinc-800"
                    )}>
                        {isConnected ? "Active" : "Offline"}
                    </span>
                </div>

                <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 pt-0.5">
                    <span>
                        {drafted} drafted · <span className={isConnected ? "text-brand-400 font-semibold" : "text-zinc-400"}>{sent} sent</span>
                    </span>
                    <button
                        type="button"
                        onClick={onConnect}
                        className={cn(
                            "inline-flex items-center gap-1 text-[9px] font-semibold tracking-wider uppercase transition-colors select-none",
                            isConnected
                                ? "text-brand-400 hover:text-brand-300"
                                : "text-zinc-400 hover:text-white"
                        )}
                    >
                        <RefreshCw className="h-2.5 w-2.5" />
                        <span>{isConnected ? "Reconnect →" : "Connect →"}</span>
                    </button>
                </div>
            </div>
        </div>
    );
}

function StatCard({
    icon,
    label,
    value,
    subtext,
    accent,
    progressBar,
    highlight,
}: {
    icon: React.ReactNode;
    label: string;
    value: number;
    subtext: string;
    accent?: 'cyan' | 'amber' | 'rose';
    progressBar?: number;
    highlight?: boolean;
}) {
    const valueColor =
        accent === 'cyan' ? 'text-brand-400'
        : accent === 'amber' ? 'text-amber-400'
        : accent === 'rose' ? 'text-rose-400'
        : 'text-white';

    return (
        <div className={cn(
            "rounded-xl border p-2.5 px-3 flex flex-col justify-between transition-all duration-200 min-h-[64px]",
            highlight
                ? "border-amber-500/40 bg-gradient-to-b from-amber-950/25 via-[#03091c] to-[#020512] shadow-[0_0_12px_rgba(245,158,11,0.12)]"
                : "border-white/[0.08] bg-[#03091c]/80 hover:border-white/15"
        )}>
            <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5 truncate">
                    {icon}
                    <span>{label}</span>
                </span>
                <div className={cn("text-lg sm:text-xl font-bold font-mono tracking-tight leading-none", valueColor)}>
                    {value}
                </div>
            </div>

            {progressBar !== undefined ? (
                <div className="space-y-1 mt-1">
                    <div className="w-full bg-zinc-800/80 h-1 rounded-full overflow-hidden">
                        <div
                            className="bg-brand-400 h-full rounded-full transition-all duration-500 shadow-[0_0_6px_rgba(198,143,61,0.8)]"
                            style={{ width: `${Math.min(100, Math.max(0, progressBar))}%` }}
                        />
                    </div>
                    <div className="text-[9px] text-zinc-500 font-mono truncate leading-none">
                        {subtext}
                    </div>
                </div>
            ) : (
                <div className="text-[9px] text-zinc-500 font-mono truncate mt-1 leading-none">
                    {subtext}
                </div>
            )}
        </div>
    );
}

function CampaignStatusPill({ status }: { status: CampaignStatus }) {
    const chipClass = STATUS_CHIP[status] ?? 'border-zinc-700 text-zinc-400 bg-zinc-900/40';
    return (
        <span className={cn('px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider border font-bold', chipClass)}>
            {STATUS_LABELS[status] ?? status}
        </span>
    );
}

function StatusPill({ status }: { status: PlatformValidation['status'] }) {
    if (status === 'ok') {
        return (
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-bold flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Constraints Met
            </span>
        );
    }
    if (status === 'warning') {
        return (
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider border border-amber-500/30 bg-amber-500/10 text-amber-400 font-bold flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> Soft Warning
            </span>
        );
    }
    return (
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider border border-rose-500/30 bg-rose-500/10 text-rose-400 font-bold flex items-center gap-1">
            <XCircle className="h-3 w-3" /> Constraint Violation
        </span>
    );
}

function CheckPill({ validation }: { validation: PlatformValidation }) {
    const chars = validation.characterCount;
    const maxChars = validation.constraints.maxCharacters;

    if (validation.status === 'ok') {
        return (
            <span className="text-[10px] font-mono text-emerald-400 font-bold flex items-center gap-1">
                <Check className="h-3 w-3" /> {chars}/{maxChars}
            </span>
        );
    }
    if (validation.status === 'warning') {
        return (
            <span className="text-[10px] font-mono text-amber-400 font-bold flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> {chars}/{maxChars}
            </span>
        );
    }
    return (
        <span className="text-[10px] font-mono text-rose-400 font-bold flex items-center gap-1">
            <XCircle className="h-3 w-3" /> {chars}/{maxChars}
        </span>
    );
}