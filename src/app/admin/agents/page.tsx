'use client';

/**
 * /admin/agents — the One Directorate command centre.
 *
 * Seven small-multiple capability radars, one per module, driven
 * entirely by /api/one/agents/telemetry. Both sidebars have linked here
 * since the nav was added; until now the route 404'd.
 *
 * Two things govern the design, and both are about not lying:
 *
 *   1. **A locked axis is not drawn.** It is listed underneath with the
 *      condition that would unlock it. A polygon here always means
 *      measured evidence — the same contract as /admin/one-progress.
 *
 *   2. **Status is text, never colour.** Each card's accent is identity
 *      only; "Active / Partial / Dormant" is a labelled chip with an
 *      icon. On a dashboard where several agents are legitimately
 *      dormant, colour-coded status would read as breakage.
 *
 * The radar is a single-series chart, so it carries no legend — the
 * card title names it — and the axis breakdown below each chart is the
 * table view, giving every number a non-visual path.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
    Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
    ResponsiveContainer, Tooltip,
} from 'recharts';
import {
    Cpu,
} from 'lucide-react';
import { Icon } from '@/components/ui/icon';
import Link from 'next/link';
import { useUser } from '@/firebase/auth/use-user';
import { cn } from '@/lib/utils';
import type { ResolvedAgent, ResolvedAxis } from '@/lib/one/directorate';
import MandalaChart from '@/components/dashboard/MandalaChart';

interface TelemetryResponse {
    generatedAt: string;
    agents: ResolvedAgent[];
    signalsMeasured: number;
    signals: Record<string, number | undefined>;
    /** Latest hub rows per agent, newest first; omitted when the hub is empty. */
    outcomes?: Record<string, AgentOutcomeRow[]>;
}

interface AgentOutcomeRow {
    kind: string;
    summary: string;
    at: number;
}

interface PublisherPosture {
    reviewGate: 'on' | 'off';
    postsLast24h: number;
    maxPostsPerDay: number;
    minNoveltyScore: number;
    recentDecisions: Array<Record<string, unknown> & { id: string; at: string | null }>;
}

const STATUS_META = {
    active: { label: 'Active', icon: 'circle-check', hint: 'every axis has telemetry behind it' },
    degraded: { label: 'Partial', icon: 'minus-circle', hint: 'some axes have no data yet' },
    dormant: { label: 'Dormant', icon: 'circle', hint: 'nothing measured yet' },
} as const;

/** Compact age for an outcome line — same register as the hub briefing. */
function agoLabel(at: number): string {
    if (!at) return '—';
    const h = Math.max(0, (Date.now() - at) / 3_600_000);
    if (h < 1) return 'just now';
    if (h < 48) return `${Math.round(h)}h ago`;
    return `${Math.round(h / 24)}d ago`;
}

/**
 * What actually came of the work — the hub's own rows for this agent.
 * The axes above count activity; this strip narrates outcomes. Renders
 * nothing when the agent has no rows yet: an empty hub is silence, not
 * a placeholder box.
 */
function RecentOutcomes({ outcomes }: { outcomes: AgentOutcomeRow[] }) {
    if (outcomes.length === 0) return null;
    return (
        <div className="mt-4 border-t border-white/5 pt-3">
            <h3 className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">
                Recent outcomes
            </h3>
            <ul className="space-y-2">
                {outcomes.map((o, i) => (
                    <li key={`${o.at}-${i}`} className="text-[11px] leading-snug">
                        <span className="font-mono text-zinc-600">{agoLabel(o.at)}</span>
                        {o.kind && <span className="font-mono text-zinc-600"> · {o.kind}</span>}
                        <span className="block text-zinc-400 line-clamp-2">{o.summary}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function StatusChip({ status }: { status: ResolvedAgent['status'] }) {
    const meta = STATUS_META[status];
    return (
        <span
            className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700/70 bg-zinc-900/70 px-2.5 py-1 text-[10px] font-mono font-semibold uppercase tracking-wider text-zinc-300"
            title={meta.hint}
        >
            <Icon name={meta.icon} className="h-3 w-3" aria-hidden="true" />
            {meta.label}
        </span>
    );
}

/** The chart's non-visual twin: every axis, unlocked or not, with its raw value. */
function AxisBreakdown({ axes }: { axes: ResolvedAxis[] }) {
    return (
        <dl className="mt-4 space-y-1.5">
            {axes.map((axis) => (
                <div key={axis.key} className="flex items-baseline justify-between gap-3 text-[11px]">
                    <dt
                        className={cn(
                            'flex items-center gap-1.5 shrink-0',
                            axis.unlocked ? 'text-zinc-300' : 'text-zinc-500',
                        )}
                    >
                        {!axis.unlocked && <Icon name="lock" className="h-2.5 w-2.5" aria-hidden="true" />}
                        {axis.label}
                    </dt>
                    <dd
                        className={cn(
                            'text-right font-mono',
                            axis.unlocked ? 'text-zinc-400' : 'text-zinc-600 italic',
                        )}
                    >
                        {axis.unlocked ? axis.raw : `locked — ${axis.unlockAt}`}
                    </dd>
                </div>
            ))}
        </dl>
    );
}

function AgentCard({
    agent,
    index,
    outcomes,
    onDispatch,
    dispatching,
}: {
    agent: ResolvedAgent;
    index: number;
    outcomes: AgentOutcomeRow[];
    onDispatch: (agent: ResolvedAgent, actionId: string) => void;
    dispatching: string | null;
}) {
    // Only unlocked axes reach the polygon. A radar needs three points to
    // enclose an area at all; with fewer, the shape would misrepresent
    // the data as a line or a dot, so we show the breakdown instead.
    const chartData = useMemo(
        () =>
            agent.axes
                .filter((a) => a.unlocked)
                .map((a) => ({ metric: a.label, value: a.value, pct: Math.round(a.value * 100) })),
        [agent.axes],
    );
    const plottable = chartData.length >= 3;

    return (
        <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: Math.min(index * 0.06, 0.4), ease: [0.22, 1, 0.36, 1] }}
            aria-labelledby={`agent-${agent.id}`}
            className="rounded-2xl border border-brand-900/40 bg-[#031d24]/75 backdrop-blur-xl p-5 flex flex-col shadow-lg shadow-black/20"
        >
            <header className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <span
                            className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: agent.accent }}
                            aria-hidden="true"
                        />
                        <h2 id={`agent-${agent.id}`} className="text-sm font-semibold text-zinc-50 truncate">
                            {agent.id}
                        </h2>
                    </div>
                    <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mt-1">
                        {agent.role}
                    </p>
                </div>
                <StatusChip status={agent.status} />
            </header>

            <p className="text-[11px] leading-relaxed text-zinc-400 mt-3">{agent.mandate}</p>

            <div className="mt-4 h-[240px]" aria-hidden="true">
                {plottable ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <RadarChart data={chartData} outerRadius="72%">
                            <PolarGrid stroke="rgba(255,255,255,0.08)" />
                            <PolarAngleAxis
                                dataKey="metric"
                                tick={{ fill: '#a1a1aa', fontSize: 9 }}
                                tickLine={false}
                            />
                            <PolarRadiusAxis domain={[0, 1]} tick={false} axisLine={false} />
                            <Radar
                                dataKey="value"
                                stroke={agent.accent}
                                strokeWidth={2}
                                fill={agent.accent}
                                fillOpacity={0.22}
                                isAnimationActive
                                animationDuration={700}
                            />
                            <Tooltip
                                cursor={false}
                                contentStyle={{
                                    background: '#03161c',
                                    border: '1px solid rgba(168, 114, 49, 0.4)',
                                    borderRadius: 8,
                                    fontSize: 11,
                                    backdropFilter: 'blur(8px)',
                                }}
                                labelStyle={{ color: '#e9c884' }}
                                formatter={(value) => [
                                    `${Math.round(Number(value ?? 0) * 100)}%`,
                                    'capability',
                                ]}
                            />
                        </RadarChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center px-4">
                        <Icon name="lock" className="h-5 w-5 text-zinc-700" />
                        <p className="text-[11px] text-zinc-500 mt-2 max-w-[16rem]">
                            {chartData.length === 0
                                ? 'No telemetry yet. The axes below name what has to happen first.'
                                : `Only ${chartData.length} of ${agent.totalAxes} axes have data — not enough to plot a shape without distorting it.`}
                        </p>
                    </div>
                )}
            </div>

            <AxisBreakdown axes={agent.axes} />

            <RecentOutcomes outcomes={outcomes} />

            <footer className="mt-auto pt-4 flex flex-wrap items-center gap-2">
                {agent.surfaces.map((href) => (
                    <Link
                        key={href}
                        href={href}
                        className="inline-flex items-center gap-1 text-[10px] font-mono text-zinc-500 hover:text-zinc-300 underline decoration-zinc-700 underline-offset-2"
                    >
                        <Icon name="external-link" className="h-2.5 w-2.5" aria-hidden="true" />
                        {href}
                    </Link>
                ))}
                {agent.actions.map((action) => {
                    const busy = dispatching === `${agent.id}:${action.id}`;
                    return (
                        <button
                            key={action.id}
                            type="button"
                            onClick={() => onDispatch(agent, action.id)}
                            disabled={busy || dispatching !== null}
                            title={action.confirm}
                            className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-brand-900/60 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-brand-400 hover:border-brand-400/50 hover:bg-brand-950/30 disabled:opacity-40 transition-colors"
                        >
                            {busy ? (
                                <Icon name="loading" className="h-3 w-3 animate-spin" aria-hidden="true" />
                            ) : (
                                <Icon name="play" className="h-3 w-3" aria-hidden="true" />
                            )}
                            {action.label}
                        </button>
                    );
                })}
            </footer>
        </motion.section>
    );
}

export default function AgentsDashboardPage() {
    const { user } = useUser();
    const [data, setData] = useState<TelemetryResponse | null>(null);
    const [posture, setPosture] = useState<PublisherPosture | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [dispatching, setDispatching] = useState<string | null>(null);
    const [dispatchResult, setDispatchResult] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        setError(null);
        try {
            const token = await user.getIdToken();
            const headers = { Authorization: `Bearer ${token}` };
            const [telemetryRes, postureRes] = await Promise.all([
                fetch('/api/one/agents/telemetry', { headers, cache: 'no-store' }),
                fetch('/api/one/publish', { headers, cache: 'no-store' }),
            ]);
            if (!telemetryRes.ok) {
                const body = await telemetryRes.json().catch(() => ({}));
                throw new Error(body?.message || `Telemetry returned ${telemetryRes.status}.`);
            }
            setData(await telemetryRes.json());
            // The Publisher panel is supplementary; its absence must not
            // take down the dashboard the operator came for.
            if (postureRes.ok) setPosture(await postureRes.json());
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Telemetry load failed.');
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => { void load(); }, [load]);

    const onDispatch = useCallback(
        async (agent: ResolvedAgent, actionId: string) => {
            const action = agent.actions.find((a) => a.id === actionId);
            if (!action || !user) return;
            if (action.confirm && !window.confirm(`${action.label}\n\n${action.confirm}`)) return;

            setDispatching(`${agent.id}:${actionId}`);
            setDispatchResult(null);
            try {
                const token = await user.getIdToken();
                const res = await fetch(action.endpoint, {
                    method: action.method,
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: action.method === 'POST' ? JSON.stringify({}) : undefined,
                });
                const body = await res.json().catch(() => ({}));
                // A 422 here is a refusal with a reason, not a failure — the
                // Publisher declining a quiet scan is the system working.
                setDispatchResult(
                    res.ok
                        ? `${agent.id} — ${action.label}: done.`
                        : `${agent.id} — ${action.label}: ${body?.reason || body?.message || `HTTP ${res.status}`}`,
                );
                await load();
            } catch (e) {
                setDispatchResult(
                    `${agent.id} — ${action.label} failed: ${e instanceof Error ? e.message : 'unknown error'}`,
                );
            } finally {
                setDispatching(null);
            }
        },
        [user, load],
    );

    const agents = data?.agents ?? [];
    const totals = useMemo(() => {
        const unlocked = agents.reduce((sum, a) => sum + a.unlockedAxes, 0);
        const total = agents.reduce((sum, a) => sum + a.totalAxes, 0);
        return { unlocked, total };
    }, [agents]);

    return (
        <div className="px-5 sm:px-8 py-8 max-w-[1400px] mx-auto">
            <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
                <div>
                    <div className="inline-flex items-center gap-2 text-brand-400 mb-2">
                        <Cpu className="h-4 w-4" aria-hidden="true" />
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-300">One Directorate</span>
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white drop-shadow-sm">
                        Agents Dashboard
                    </h1>
                    <p className="text-sm text-zinc-300/80 mt-2 max-w-2xl leading-relaxed">
                        Seven modules of Persona One. Every axis is counted out of Firestore — an axis with no
                        telemetry behind it stays locked and says what would unlock it, rather than being drawn
                        at zero.
                        {data && (
                            <>
                                {' '}
                                <span className="text-brand-200">
                                    {totals.unlocked} of {totals.total} axes have data.
                                </span>
                            </>
                        )}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => void load()}
                    disabled={loading}
                    className="self-start sm:self-auto text-[11px] uppercase tracking-wider font-semibold text-brand-400 hover:text-brand-300 disabled:opacity-50 flex items-center gap-1.5 px-3 py-2 rounded-md border border-brand-500/30 bg-brand-950/20 hover:bg-brand-900/30 backdrop-blur-sm transition-all"
                >
                    <Icon name="refresh" className={cn('h-3 w-3', loading && 'animate-spin')} aria-hidden="true" />
                    Refresh
                </button>
            </header>

            {/* ── Mandala Strategic Framework ───────────────────────────── */}
            <section aria-labelledby="mandala-heading" className="mb-8 rounded-2xl border border-[#4a3a1e]/80 bg-[#031d24]/60 backdrop-blur-xl p-5 shadow-lg shadow-black/30">
                <MandalaChart />
            </section>

            {error && (
                <div
                    role="alert"
                    className="mb-6 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-300 flex items-start gap-2"
                >
                    <Icon name="triangle-warning" className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                    <div>{error}</div>
                </div>
            )}

            {dispatchResult && (
                <div
                    role="status"
                    className="mb-6 rounded-lg border border-zinc-700 bg-zinc-900/60 p-3 text-xs text-zinc-300"
                >
                    {dispatchResult}
                </div>
            )}

            {posture && (
                <section
                    aria-labelledby="publisher-posture"
                    className="mb-8 rounded-2xl border border-violet-900/60 bg-[#031d24]/75 backdrop-blur-xl p-5 shadow-lg shadow-black/20"
                >
                    <div className="flex items-center gap-2 mb-3">
                        <Icon name="shield-check" className="h-4 w-4 text-violet-300" aria-hidden="true" />
                        <h2 id="publisher-posture" className="text-sm font-semibold text-zinc-100">
                            Publisher posture
                        </h2>
                    </div>
                    <p className="text-xs text-zinc-400 max-w-3xl">
                        {posture.reviewGate === 'on' ? (
                            <>
                                Review gate is <strong className="text-zinc-200">on</strong> — posts by One land as{' '}
                                <code className="text-zinc-300">pending_review</code> and a human releases them in{' '}
                                <Link href="/admin/moderation" className="underline decoration-zinc-600">
                                    moderation
                                </Link>
                                .
                            </>
                        ) : (
                            <>
                                Review gate is <strong className="text-zinc-200">off</strong> — One publishes straight
                                to the feed. Set <code className="text-zinc-300">ONE_PUBLISHER_AUTO_APPROVE</code> to
                                anything but <code className="text-zinc-300">true</code> to put it back.
                            </>
                        )}{' '}
                        {posture.postsLast24h} of {posture.maxPostsPerDay} daily post(s) used. A scan must clear
                        novelty {posture.minNoveltyScore} and medium confidence to be written up at all.
                    </p>
                    {posture.recentDecisions.length > 0 && (
                        <ul className="mt-3 space-y-1">
                            {posture.recentDecisions.slice(0, 5).map((d) => (
                                <li key={d.id} className="text-[11px] font-mono text-zinc-500">
                                    <span className="text-zinc-600">{d.at ? d.at.slice(0, 16).replace('T', ' ') : '—'}</span>{' '}
                                    {String(d.outcome ?? 'unknown')}
                                    {d.reason ? ` — ${String(d.reason)}` : ''}
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            )}

            {loading && !data ? (
                <div className="h-[400px] flex items-center justify-center">
                    <Icon name="loading" className="h-8 w-8 text-brand-400 animate-spin" aria-label="Loading telemetry" />
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {agents.map((agent, i) => (
                        <AgentCard
                            key={agent.id}
                            agent={agent}
                            index={i}
                            outcomes={data?.outcomes?.[agent.id] ?? []}
                            onDispatch={onDispatch}
                            dispatching={dispatching}
                        />
                    ))}
                </div>
            )}

            {data && (
                <p className="mt-8 text-[10px] font-mono uppercase tracking-widest text-zinc-600">
                    {data.signalsMeasured} signal(s) measured · generated {new Date(data.generatedAt).toLocaleString()}
                </p>
            )}
        </div>
    );
}
