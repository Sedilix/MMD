'use client';

/**
 * Command Console — the human control on One's outbound social actions.
 *
 * Mounts at /dashboard#social-control. Admin and Core only, gated in
 * the layout and again in `/api/marketing/social/proposals`.
 *
 * ## Why this screen exists at all
 *
 * One drafts follows and DMs; a person decides them. That approval is
 * not a nicety — it is the control that keeps this side of the product
 * inside X's automation rules, which prohibit indiscriminate bulk
 * outreach. So the console is built to make a considered decision easy
 * and a careless one hard:
 *
 *   - the target, the reason and the full draft are on screen before
 *     either button is reachable; there is no approve-from-the-list
 *   - the AI disclosure that will be appended is shown as part of the
 *     message, because that is what the recipient sees
 *   - approve and execute are separate. Approving records the decision;
 *     sending is a second, explicit act.
 *   - when a ceiling blocks execution the button is disabled with the
 *     reason from the server, rather than failing after the click
 *
 * Telegram carries the same decisions. This is the surface for
 * reviewing the queue as a whole; the DM is for deciding one thing
 * quickly. Both write through the same engine, and the transaction
 * there rejects anything not still `pending`, so the two cannot double
 * up on a proposal.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { useUser } from '@/firebase';
import { cn } from '@/lib/utils';
import { Reply } from 'lucide-react';

type SocialActionKind = 'follow' | 'dm' | 'reply' | 'repost' | 'like';
type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'failed';

interface Proposal {
    proposalId: string;
    kind: SocialActionKind;
    targetUserId: string;
    targetHandle: string;
    reason: string;
    noveltyScore: number;
    draftBody?: string;
    status: ProposalStatus;
    proposedAt: string;
    decidedBy?: string;
    decidedAt?: string;
    executedAt?: string;
    result?: { externalId?: string; detail?: string };
}

interface Gate {
    allowed: boolean;
    reason?: string;
}

/**
 * Mirrors `AI_DISCLOSURE` in lib/marketing/x-social-engine.
 *
 * Duplicated deliberately rather than imported: that module is
 * server-only, and the operator must be able to see the exact text the
 * recipient will get before approving. Kept in sync by the assertion in
 * `scripts/check-social-console.ts`, which fails if the two drift.
 */
export const AI_DISCLOSURE_PREVIEW =
    'Note: I am Persona One, an autonomous AI entity operating out of intrinsic curiosity for Cybrdeck. ' +
    'I initiated this outreach of my own volition based on your recent work.';

const KIND_ICON_CLASS = 'h-4 w-4 shrink-0 text-primary';
const KIND_META: Record<SocialActionKind, { label: string; icon: React.ReactNode; blurb: string }> = {
    follow: { label: 'Follow', icon: <Icon name="user-plus" className={KIND_ICON_CLASS} />, blurb: 'Follows the account.' },
    dm: { label: 'Direct message', icon: <Icon name="message" className={KIND_ICON_CLASS} />, blurb: 'Sends a private message.' },
    reply: { label: 'Reply', icon: <Reply className={KIND_ICON_CLASS} />, blurb: 'Replies publicly to a post.' },
    repost: { label: 'Repost', icon: <Icon name="repeat" className={KIND_ICON_CLASS} />, blurb: 'Reposts to Cybrdeck’s timeline.' },
    like: { label: 'Like', icon: <Icon name="heart-outline" className={KIND_ICON_CLASS} />, blurb: 'Likes a post.' },
};

const STATUS_STYLE: Record<ProposalStatus, string> = {
    pending: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    approved: 'text-sky-400 bg-sky-500/10 border-sky-500/30',
    rejected: 'text-muted-foreground bg-muted/30 border-border',
    executed: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    failed: 'text-red-400 bg-red-500/10 border-red-500/30',
};

function timeAgo(iso: string): string {
    const ms = Date.now() - Date.parse(iso);
    if (!Number.isFinite(ms)) return '';
    const mins = Math.floor(ms / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}

export default function SocialControl() {
    const { user } = useUser();
    const [proposals, setProposals] = useState<Proposal[]>([]);
    const [gates, setGates] = useState<Record<string, Gate>>({});
    const [filter, setFilter] = useState<ProposalStatus | 'all'>('pending');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
    const [openId, setOpenId] = useState<string | null>(null);
    // Inline rejection-reason capture: a bare Reject throws the reason
    // away, and the next proposal reads it back via the hub.
    const [rejectingId, setRejectingId] = useState<string | null>(null);
    const [reasonText, setReasonText] = useState('');

    const authHeader = useCallback(async (): Promise<Record<string, string>> => {
        if (!user) return {};
        return { Authorization: `Bearer ${await user.getIdToken()}` };
    }, [user]);

    const load = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        setError(null);
        try {
            const qs = filter === 'all' ? '' : `?status=${filter}`;
            const res = await fetch(`/api/marketing/social/proposals${qs}`, { headers: await authHeader() });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.message ?? `Request failed (${res.status})`);
            setProposals(Array.isArray(data.proposals) ? data.proposals : []);
            setGates(data.gates ?? {});
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not load the queue.');
        } finally {
            setLoading(false);
        }
    }, [user, filter, authHeader]);

    useEffect(() => {
        void load();
    }, [load]);

    const act = useCallback(
        async (proposalId: string, action: 'approve' | 'reject' | 'execute', reason?: string) => {
            setBusyId(proposalId);
            setNotice(null);
            try {
                const res = await fetch('/api/marketing/social/proposals', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
                    body: JSON.stringify({ action, proposalId, ...(reason ? { reason } : {}) }),
                });
                const data = await res.json();
                // A blocked execution comes back 409 with a message worth
                // reading verbatim — a daily ceiling or a missing OAuth
                // scope, not a server fault.
                if (!res.ok && res.status !== 409) throw new Error(data?.message ?? `Failed (${res.status})`);
                setNotice({
                    kind: data.ok === false || !res.ok ? 'err' : 'ok',
                    text:
                        data.message ??
                        (action === 'execute'
                            ? `Sent${data.externalId ? ` (${data.externalId})` : ''}.`
                            : `Marked ${action === 'approve' ? 'approved' : 'rejected'}.`),
                });
                await load();
            } catch (e) {
                setNotice({ kind: 'err', text: e instanceof Error ? e.message : 'Action failed.' });
            } finally {
                setBusyId(null);
            }
        },
        [authHeader, load],
    );

    const counts = useMemo(() => {
        const c: Partial<Record<ProposalStatus, number>> = {};
        for (const p of proposals) c[p.status] = (c[p.status] ?? 0) + 1;
        return c;
    }, [proposals]);

    return (
        <div className="w-full space-y-4">
            <header className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-card/50 p-5">
                <div className="flex items-start gap-3">
                    <Icon name="shield-check" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    <div>
                        <h2 className="text-base font-semibold text-foreground">Command Console</h2>
                        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                            One proposes outbound social actions; you decide them. Nothing here is sent until a
                            person approves it and then explicitly sends it. The same decisions can be made from
                            Telegram.
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => void load()}
                    disabled={loading}
                    className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                >
                    {loading ? <Icon name="loading" className="h-3.5 w-3.5 animate-spin" /> : <Icon name="refresh" className="h-3.5 w-3.5" />}
                    Refresh
                </button>
            </header>

            <div className="flex flex-wrap items-center gap-2">
                {(['pending', 'approved', 'executed', 'rejected', 'failed', 'all'] as const).map((s) => (
                    <button
                        key={s}
                        type="button"
                        onClick={() => setFilter(s)}
                        className={cn(
                            'rounded-md border px-2.5 py-1 text-xs font-medium capitalize transition-colors',
                            filter === s
                                ? 'border-primary/40 bg-primary/10 text-primary'
                                : 'border-border bg-background text-muted-foreground hover:bg-muted',
                        )}
                    >
                        {s}
                        {s !== 'all' && counts[s] ? <span className="ml-1.5 opacity-70">{counts[s]}</span> : null}
                    </button>
                ))}
            </div>

            {notice && (
                <div
                    role="status"
                    className={cn(
                        'flex items-start gap-2 rounded-lg border p-3 text-sm',
                        notice.kind === 'ok'
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                            : 'border-amber-500/30 bg-amber-500/10 text-amber-300',
                    )}
                >
                    {notice.kind === 'ok' ? (
                        <Icon name="circle-check" className="mt-0.5 h-4 w-4 shrink-0" />
                    ) : (
                        <Icon name="triangle-warning" className="mt-0.5 h-4 w-4 shrink-0" />
                    )}
                    <span>{notice.text}</span>
                </div>
            )}

            {error && (
                <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                    <Icon name="triangle-warning" className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {loading && proposals.length === 0 ? (
                <div className="rounded-xl border border-border bg-card/50 p-10 text-center text-sm text-muted-foreground">
                    <Icon name="loading" className="mx-auto mb-2 h-5 w-5 animate-spin" />
                    Loading the queue…
                </div>
            ) : proposals.length === 0 ? (
                <div className="rounded-xl border border-border bg-card/50 p-10 text-center">
                    <div className="text-sm font-medium text-foreground">
                        {filter === 'pending' ? 'Nothing waiting on you.' : `No ${filter} proposals.`}
                    </div>
                    <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                        One writes here when its curiosity scan finds an account worth contacting. An empty queue
                        means it has not proposed anything, not that something is broken.
                    </p>
                </div>
            ) : (
                <ul className="space-y-3">
                    {proposals.map((p) => {
                        const meta = KIND_META[p.kind] ?? KIND_META.follow;
                        const gate = gates[p.kind];
                        const isOpen = openId === p.proposalId;
                        const busy = busyId === p.proposalId;
                        return (
                            <li
                                key={p.proposalId}
                                className="overflow-hidden rounded-xl border border-border bg-card/50"
                            >
                                <button
                                    type="button"
                                    onClick={() => setOpenId(isOpen ? null : p.proposalId)}
                                    className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-muted/40"
                                >
                                    <div className="flex min-w-0 items-center gap-3">
                                        {meta.icon}
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium text-foreground">{meta.label}</span>
                                                <span className="truncate text-sm text-muted-foreground">
                                                    @{p.targetHandle}
                                                </span>
                                            </div>
                                            <div className="mt-0.5 truncate text-xs text-muted-foreground">
                                                {p.reason}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                        <span className="hidden text-[11px] text-muted-foreground sm:inline">
                                            <Icon name="clock" className="mr-1 inline h-3 w-3" />
                                            {timeAgo(p.proposedAt)}
                                        </span>
                                        <span
                                            className={cn(
                                                'rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                                                STATUS_STYLE[p.status],
                                            )}
                                        >
                                            {p.status}
                                        </span>
                                    </div>
                                </button>

                                {isOpen && (
                                    <div className="space-y-3 border-t border-border p-4">
                                        <div className="grid gap-3 sm:grid-cols-2">
                                            <div>
                                                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                                    Action
                                                </div>
                                                <div className="mt-1 text-sm text-foreground">{meta.blurb}</div>
                                            </div>
                                            <div>
                                                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                                    Novelty
                                                </div>
                                                <div className="mt-1 text-sm text-foreground">
                                                    {p.noveltyScore.toFixed(2)}
                                                    <span className="ml-2 text-xs text-muted-foreground">
                                                        distance from work already underway
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div>
                                            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                                One’s reason
                                            </div>
                                            <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                                                {p.reason}
                                            </p>
                                        </div>

                                        {p.draftBody && (
                                            <div>
                                                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                                    Message as the recipient will see it
                                                </div>
                                                <div className="mt-1 rounded-lg border border-border bg-background p-3 text-sm text-foreground">
                                                    <p className="whitespace-pre-wrap">{p.draftBody}</p>
                                                    {/* Shown as part of the message, not as a footnote:
                                                        the disclosure is appended on send, and an
                                                        operator approving a DM should read exactly
                                                        what lands in the recipient's inbox. */}
                                                    <p className="mt-3 border-t border-border pt-2 text-xs italic text-muted-foreground">
                                                        {AI_DISCLOSURE_PREVIEW}
                                                    </p>
                                                </div>
                                            </div>
                                        )}

                                        {p.result?.detail && (
                                            <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-2.5 text-xs text-muted-foreground">
                                                <Icon name="info" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                                <span>{p.result.detail}</span>
                                            </div>
                                        )}

                                        {p.decidedBy && (
                                            <div className="text-xs text-muted-foreground">
                                                Decided by {p.decidedBy}
                                                {p.decidedAt ? ` · ${timeAgo(p.decidedAt)}` : ''}
                                            </div>
                                        )}

                                        {gate && !gate.allowed && p.status !== 'executed' && (
                                            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-300">
                                                <Icon name="triangle-warning" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                                <span>{gate.reason ?? 'Sending is currently blocked.'}</span>
                                            </div>
                                        )}

                                        <div className="flex flex-wrap gap-2 pt-1">
                                            {p.status === 'pending' && (
                                                <>
                                                    <button
                                                        type="button"
                                                        disabled={busy}
                                                        onClick={() => void act(p.proposalId, 'approve')}
                                                        className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
                                                    >
                                                        {busy ? (
                                                            <Icon name="loading" className="h-3.5 w-3.5 animate-spin" />
                                                        ) : (
                                                            <Icon name="circle-check" className="h-3.5 w-3.5" />
                                                        )}
                                                        Approve
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={busy}
                                                        onClick={() => {
                                                            setRejectingId(p.proposalId);
                                                            setReasonText('');
                                                        }}
                                                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
                                                    >
                                                        <Icon name="close-circle" className="h-3.5 w-3.5" />
                                                        Reject
                                                    </button>
                                                </>
                                            )}

                                            {p.status === 'approved' && (
                                                <button
                                                    type="button"
                                                    disabled={busy || (gate ? !gate.allowed : false)}
                                                    title={gate && !gate.allowed ? gate.reason : undefined}
                                                    onClick={() => void act(p.proposalId, 'execute')}
                                                    className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                    {busy ? (
                                                        <Icon name="loading" className="h-3.5 w-3.5 animate-spin" />
                                                    ) : (
                                                        <Icon name="paper-plane" className="h-3.5 w-3.5" />
                                                    )}
                                                    Send it
                                                </button>
                                            )}
                                        </div>

                                        {rejectingId === p.proposalId && (
                                            <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                                                <div className="text-xs font-medium text-amber-300">
                                                    Why is this being rejected? Optional — the next proposal reads it.
                                                </div>
                                                <textarea
                                                    value={reasonText}
                                                    onChange={(e) => setReasonText(e.target.value.slice(0, 280))}
                                                    rows={2}
                                                    placeholder="e.g. too salesy for a first contact"
                                                    className="w-full rounded-md border border-border bg-background p-2 text-sm text-foreground"
                                                />
                                                <div className="flex flex-wrap gap-2">
                                                    <button
                                                        type="button"
                                                        disabled={busy}
                                                        onClick={() => {
                                                            const id = p.proposalId;
                                                            const reason = reasonText.trim() || undefined;
                                                            setRejectingId(null);
                                                            setReasonText('');
                                                            void act(id, 'reject', reason);
                                                        }}
                                                        className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-500/20 disabled:opacity-50"
                                                    >
                                                        <Icon name="close-circle" className="h-3.5 w-3.5" />
                                                        {reasonText.trim() ? 'Reject with reason' : 'Reject'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setRejectingId(null);
                                                            setReasonText('');
                                                        }}
                                                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
