'use client';

/**
 * Marketing Benchmark widget for the /admin/one-progress page.
 * Lists the 5 fixed reference briefs and shows the most recent
 * persisted run per brief. "Run benchmark" hits the benchmark
 * route and refreshes the panel. Admin-only — the radar + the
 * widget are gated the same way.
 *
 * This widget is a client component because it has interactive
 * controls (the "Run now" button + post-run refresh). The page
 * is a server component; we just import the widget here.
 */

import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { Sparkles, Megaphone } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface BriefSummary {
    id: string;
    label: string;
    enabled: boolean;
}

interface BenchmarkRun {
    briefId: string;
    label: string;
    finalScore: number;
    passesThreshold: boolean;
    rounds: number;
    durationMs: number;
    benchmarkScore: {
        mustContainHits: number;
        mustContainMisses: string[];
        mustNotContainHits: number;
        mustNotContainMisses: string[];
    };
    runId: string;
    startedAt: string;
}

const FALLBACK_BRIEFS: BriefSummary[] = [
    { id: 'cybrdeck-launch-event', label: 'Cybrdeck 30-Day Launch Event', enabled: true },
    { id: 'one-memory-export', label: 'One Memory Export (Admin Tool)', enabled: true },
    { id: 'marketing-agent-launch', label: 'Marketing Agent Launch Announcement', enabled: true },
    { id: 'dailies-ama-recap', label: 'Daily Workshop Recap', enabled: true },
    { id: 'luma-event-cybrdeck-meetup', label: 'Cybrdeck Operator Meetup (Luma-Style)', enabled: true },
];

export function MarketingBenchmarkWidget() {
    const [briefs, setBriefs] = useState<BriefSummary[]>(FALLBACK_BRIEFS);
    const [runs, setRuns] = useState<BenchmarkRun[]>([]);
    const [loading, setLoading] = useState(false);
    const [running, setRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastRunAt, setLastRunAt] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const [bRes, rRes] = await Promise.all([
                fetch('/api/marketing/benchmark'),
                fetch('/api/marketing/benchmark?runs=true'),
            ]);
            if (bRes.ok) {
                const bdata = await bRes.json();
                if (Array.isArray(bdata?.briefs)) {
                    setBriefs(bdata.briefs as BriefSummary[]);
                }
            }
            if (rRes.ok) {
                const rdata = await rRes.json();
                if (Array.isArray(rdata?.runs)) {
                    setRuns(rdata.runs as BenchmarkRun[]);
                }
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load benchmark state.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void load(); }, []);

    const runBenchmark = async () => {
        setRunning(true);
        setError(null);
        try {
            const res = await fetch('/api/marketing/benchmark', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rounds: 3 }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body?.message || `Server returned ${res.status}.`);
            }
            const data = await res.json();
            if (data?.success) {
                setLastRunAt(new Date().toISOString());
                await load();
            } else {
                throw new Error('No result from server.');
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Benchmark run failed.');
        } finally {
            setRunning(false);
        }
    };

    const runsByBrief = new Map(runs.map((r) => [r.briefId, r]));

    return (
        <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-2xl border border-brand-500/30 bg-zinc-950/30 p-5 sm:p-6"
        >
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-5">
                <div>
                    <div className="flex items-center gap-2 text-brand-400 mb-1">
                        <Megaphone className="h-4 w-4" />
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Marketing Benchmark</span>
                    </div>
                    <h2 className="text-xl font-semibold text-zinc-50">Reference-brief quality tracker</h2>
                    <p className="text-xs text-zinc-500 mt-1 max-w-2xl">
                        The marketing agent runs against a fixed set of 5 reference briefs.
                        Each run uses the same self-critique rubric as the production generate
                        loop. Use this to track whether One's output is trending up, down, or
                        holding steady.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => void load()}
                        disabled={loading}
                        className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-500 hover:text-zinc-200 px-3 py-1.5 rounded border border-zinc-800 transition-colors"
                    >
                        <Icon name="refresh" className={cn('h-3 w-3', loading && 'animate-spin')} />
                        Refresh
                    </button>
                    <button
                        type="button"
                        onClick={() => void runBenchmark()}
                        disabled={running || loading}
                        className="inline-flex items-center gap-2 rounded border border-brand-500/40 bg-brand-500/10 hover:bg-brand-500/20 disabled:opacity-50 px-4 py-2 text-xs font-mono uppercase tracking-wider text-brand-200 transition-colors"
                    >
                        {running ? <Icon name="loading" className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                        Run benchmark
                    </button>
                </div>
            </div>

            {error && (
                <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-300 flex items-start gap-2">
                    <Icon name="triangle-warning" className="h-3 w-3 mt-0.5 shrink-0" />
                    <div>{error}</div>
                </div>
            )}

            {lastRunAt && (
                <div className="text-[10px] font-mono text-zinc-500 mb-3">
                    Last run: <span className="text-zinc-300">{new Date(lastRunAt).toLocaleString()}</span>
                </div>
            )}

            <div className="space-y-2">
                {briefs.map((b) => {
                    const r = runsByBrief.get(b.id);
                    const score = r?.finalScore ?? null;
                    const passes = r?.passesThreshold ?? null;
                    return (
                        <div
                            key={b.id}
                            className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-3 items-center rounded-lg border border-zinc-800/60 bg-zinc-900/30 px-4 py-3"
                        >
                            <div className="min-w-0">
                                <div className="text-xs font-semibold text-zinc-100">{b.label}</div>
                                <div className="text-[10px] font-mono text-zinc-500 truncate">{b.id}</div>
                            </div>
                            <div className="text-right">
                                {score === null ? (
                                    <span className="text-[10px] font-mono text-zinc-500">no run yet</span>
                                ) : (
                                    <span
                                        className={cn(
                                            'inline-block text-sm font-mono font-semibold px-2 py-0.5 rounded border',
                                            passes
                                                ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/5'
                                                : 'border-amber-500/40 text-amber-300 bg-amber-500/5',
                                        )}
                                    >
                                        {score}/60
                                    </span>
                                )}
                            </div>
                            <div className="text-right">
                                {passes === null ? (
                                    <span className="text-[10px] font-mono text-zinc-500">—</span>
                                ) : passes ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-400">
                                        <Icon name="circle-check" className="h-3 w-3" /> pass
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-mono text-amber-400">
                                        <Icon name="close-circle" className="h-3 w-3" /> below
                                    </span>
                                )}
                            </div>
                            <div className="text-right">
                                {r ? (
                                    <div className="text-[10px] font-mono text-zinc-500">
                                        {new Date(r.startedAt).toLocaleDateString()} · {r.rounds}r · {(r.durationMs / 1000).toFixed(1)}s
                                    </div>
                                ) : (
                                    <span className="text-[10px] font-mono text-zinc-500">—</span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </motion.section>
    );
}
