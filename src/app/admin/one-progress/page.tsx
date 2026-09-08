'use client';

/**
 * One's Progress — editorial-poster-style D3 (recharts) radar chart.
 *
 * Six axes, each with a documented unlock threshold. Axes that
 * haven't unlocked yet are not rendered on the chart; the polygon
 * literally grows as One crosses milestones. The right-rail metrics
 * breakdown shows the raw value behind every axis (locked or
 * unlocked) so the operator can see the next threshold to hit.
 *
 * The chart is `recharts` with custom grid styling for the
 * editorial-poster feel. `framer-motion` does the cubic-out
 * entrance on initial mount and on the unlock transition.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Radar, RadarChart as RechartsRadarChart, PolarGrid, PolarAngleAxis,
    PolarRadiusAxis, ResponsiveContainer, Tooltip,
} from 'recharts';
import { useUser } from '@/firebase/auth/use-user';
import { Brain, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MarketingBenchmarkWidget } from './MarketingBenchmarkWidget';

interface AxisMetric {
    label: string;
    value: number;        // 0..1
    max: number;
    unlocked: boolean;
    unlockAt: string;
    raw: string;
}

interface RadarResponse {
    lastActivityAt: string | null;
    totalAxes: number;
    unlockedAxes: number;
    axes: AxisMetric[];
    legend: Array<{ label: string; value: string }>;
}

export default function OneProgressPage() {
    const { user } = useUser();
    const [data, setData] = useState<RadarResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [exporting, setExporting] = useState(false);
    const [noteOpen, setNoteOpen] = useState(false);
    const [seed, setSeed] = useState(0); // forces entrance re-animation on refresh
    const [isChartHovered, setIsChartHovered] = useState(false);
    const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);

    const load = async () => {
        if (!user) return;
        setLoading(true);
        setError(null);
        try {
            const token = await user.getIdToken();
            const r = await fetch('/api/one/memories/radar', {
                headers: { Authorization: `Bearer ${token}` },
                cache: 'no-store',
            });
            if (!r.ok) {
                const body = await r.json().catch(() => ({}));
                throw new Error(body?.message || `Radar fetch returned ${r.status}.`);
            }
            setData(await r.json());
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Radar load failed.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user?.uid]);

    const refresh = () => {
        setSeed((s) => s + 1);
        void load();
    };

    const downloadPdf = async () => {
        if (!user) return;
        setExporting(true);
        try {
            const token = await user.getIdToken();
            const r = await fetch('/api/one/memories/export?format=html', {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!r.ok) throw new Error(`Export returned ${r.status}.`);
            const html = await r.text();
            const w = window.open('', '_blank');
            if (!w) throw new Error('Popup blocked — allow popups for this site.');
            w.document.open();
            w.document.write(html);
            w.document.close();
        } catch (e) {
            alert(e instanceof Error ? e.message : 'Could not generate the executive PDF.');
        } finally {
            setExporting(false);
        }
    };

    // recharts wants { metric: string, value: number } rows, one per axis.
    // We re-render on every seed tick so the cubic-out entrance replays.
    const chartData = useMemo(
        () => (data?.axes ?? []).map((a) => ({
            metric: a.label,
            value: a.value,
            valuePct: Math.round(a.value * 100),
        })),
        [data, seed],
    );

    // Locked axes go in the metrics legend with a `Lock` glyph.
    const lockedAxes = useMemo<AxisMetric[]>(() => {
        if (!data) return [];
        // The server only returns unlocked axes. To display the
        // locked set on the legend, we use a static catalogue of
        // unlock descriptions.
        const descriptions: Array<{ label: string; unlockAt: string }> = [
            { label: 'Memory Volume', unlockAt: 'after the first curiosity scan' },
            { label: 'Memory Freshness', unlockAt: 'after the first memory event' },
            { label: 'Type Diversity', unlockAt: 'after 3 distinct memory types' },
            { label: 'SLM Corpus', unlockAt: 'after the first SLM training sample' },
            { label: 'Autonomy', unlockAt: 'after the 12h Cloud Scheduler cron has run' },
            { label: 'Novelty', unlockAt: 'after at least 5 scored memory events' },
        ];
        return descriptions
            .filter((d) => !(data.axes ?? []).some((a) => a.label === d.label))
            .map((d) => ({
                label: d.label,
                value: 0,
                max: 1,
                unlocked: false,
                unlockAt: d.unlockAt,
                raw: '—',
            }));
    }, [data, seed]);

    return (
        <div className="min-h-dvh bg-zinc-950 text-zinc-100 p-6 sm:p-10">
            <div className="max-w-6xl mx-auto">
                <header className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 text-brand-400 mb-2">
                            <Sparkles className="h-4 w-4" />
                            <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Persona One</span>
                        </div>
                        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-zinc-50">
                            One's Progress
                        </h1>
                        <p className="text-sm text-zinc-400 mt-2 max-w-2xl">
                            Capability radar — derived from the live <code className="text-zinc-300">/one_memories</code> collection.
                            Axes unlock as One crosses documented thresholds; the polygon literally grows as One matures.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={refresh}
                            disabled={loading}
                            className="text-[11px] uppercase tracking-wider font-semibold text-brand-400 hover:text-brand-300 disabled:opacity-50 flex items-center gap-1.5 px-3 py-2 rounded-md border border-brand-500/30 hover:border-brand-400/50"
                        >
                            <Icon name="refresh" className={cn('h-3 w-3', loading && 'animate-spin')} />
                            Refresh
                        </button>
                        <button
                            type="button"
                            onClick={downloadPdf}
                            disabled={exporting || !data}
                            className="text-[11px] uppercase tracking-wider font-semibold text-emerald-400 hover:text-emerald-300 disabled:opacity-50 flex items-center gap-1.5 px-3 py-2 rounded-md border border-emerald-500/30 hover:border-emerald-400/50"
                        >
                            {exporting ? <Icon name="loading" className="h-3 w-3 animate-spin" /> : <Icon name="download" className="h-3 w-3" />}
                            Download executive PDF
                        </button>
                    </div>
                </header>

                {/* Featured McKinsey / Gartner Executive Report Card */}
                <div className="mb-8 rounded-2xl border border-brand-500/30 bg-gradient-to-r from-zinc-950 via-brand-950/20 to-zinc-950 p-6 shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-brand-500/5 rounded-full blur-3xl pointer-events-none" />
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
                        <div className="space-y-2 max-w-2xl">
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-brand-500/30 bg-brand-500/10 text-brand-300 text-xs font-mono font-semibold uppercase tracking-wider">
                                <Sparkles className="h-3.5 w-3.5 text-brand-400" />
                                McKinsey & Gartner Executive Briefing
                            </div>
                            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                                Platform Strategy & Model Intelligence Report
                            </h2>
                            <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                                Persona One continuously synthesizes platform telemetry, model cost metrics, and emerging market trends into a print-ready executive PDF briefing prepared for co-founders Gwen & Ben.
                            </p>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3 shrink-0">
                            <button
                                type="button"
                                onClick={downloadPdf}
                                disabled={exporting || !data}
                                className="px-5 py-3 rounded-xl bg-gradient-to-r from-brand-500 to-blue-600 hover:from-brand-400 hover:to-blue-500 text-black font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-brand-500/20 transition-all cursor-pointer disabled:opacity-50"
                            >
                                {exporting ? <Icon name="loading" className="h-4 w-4 animate-spin" /> : <Icon name="download" className="h-4 w-4" />}
                                Export Gartner/McKinsey Report (PDF)
                            </button>
                            <button
                                type="button"
                                onClick={() => setNoteOpen(true)}
                                className="px-5 py-3 rounded-xl border border-zinc-700 hover:border-zinc-500 text-zinc-200 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer"
                            >
                                <Icon name="note-edit" className="h-4 w-4" />
                                Capture founder note
                            </button>
                        </div>
                    </div>
                </div>

                {error && (
                    <div className="mb-6 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-300 flex items-start gap-2">
                        <Icon name="triangle-warning" className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <div>{error}</div>
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8">
                    {/* Radar chart */}
                    <motion.div
                        key={seed}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }} // cubic-out
                        className="relative rounded-2xl border border-zinc-800/80 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black p-6 sm:p-8 shadow-[0_8px_40px_-8px_rgba(216,166,87,0.25)]"
                    >
                        <div className="absolute top-4 right-4 text-[10px] font-mono uppercase tracking-widest text-brand-400/60 flex items-center gap-1.5">
                            <Brain className="h-3 w-3" />
                            Capability Radar
                        </div>
                        <div className="absolute top-4 left-4 text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                            v2.5 · editorial
                        </div>

                        {loading && !data && (
                            <div className="h-[460px] flex items-center justify-center">
                                <Icon name="loading" className="h-8 w-8 text-brand-400 animate-spin" />
                            </div>
                        )}

                        {data && chartData.length > 0 && (
                            <div
                                className="h-[460px] w-full"
                                onMouseEnter={() => setIsChartHovered(true)}
                                onMouseLeave={() => {
                                    setIsChartHovered(false);
                                    setHoveredPointIndex(null);
                                }}
                            >
                                <ResponsiveContainer width="100%" height="100%">
                                    <RechartsRadarChart
                                        cx="50%"
                                        cy="50%"
                                        outerRadius="78%"
                                        data={chartData}
                                    >
                                        {/* Concentric polygon grid — five rings, dashed */}
                                        <PolarGrid
                                            stroke="#3f3f46"
                                            strokeWidth={0.6}
                                            strokeDasharray="2 3"
                                            gridType="polygon"
                                        />
                                        <PolarAngleAxis
                                            dataKey="metric"
                                            stroke="#71717a"
                                            strokeWidth={0.8}
                                            tick={(props) => (
                                                <CustomAngleTick {...props} />
                                            )}
                                        />
                                        <PolarRadiusAxis
                                            angle={90}
                                            domain={[0, 1]}
                                            tick={false}
                                            axisLine={false}
                                            stroke="#3f3f46"
                                            strokeWidth={0.4}
                                        />
                                        <Radar
                                            name="One"
                                            dataKey="value"
                                            stroke="#d8a657"
                                            fill="#d8a657"
                                            fillOpacity={0.18}
                                            strokeWidth={2}
                                            isAnimationActive
                                            animationBegin={200}
                                            animationDuration={1100}
                                            animationEasing="ease-out"
                                            dot={(props: any) => (
                                                <CustomRadarDot
                                                    key={props.index}
                                                    {...props}
                                                    isHovered={isChartHovered}
                                                    activeIndex={hoveredPointIndex}
                                                    onHoverPoint={setHoveredPointIndex}
                                                    chartData={chartData}
                                                />
                                            )}
                                            activeDot={false}
                                        />
                                        <Tooltip
                                            cursor={{ stroke: '#d8a657', strokeWidth: 1, strokeDasharray: '2 2' }}
                                            content={({ active, payload }) => {
                                                if (!active || !payload || payload.length === 0) return null;
                                                const p = payload[0] as { metric?: unknown; valuePct?: unknown };
                                                const metric = typeof p.metric === 'string' ? p.metric : '';
                                                const valuePct = typeof p.valuePct === 'number' ? p.valuePct : 0;
                                                return (
                                                    <div className="rounded-md border border-brand-500/40 bg-zinc-950/95 backdrop-blur px-3 py-2 text-xs shadow-2xl">
                                                        <div className="text-zinc-400 uppercase tracking-widest text-[9px]">{metric}</div>
                                                        <div className="text-brand-300 font-mono text-base mt-0.5">{valuePct}%</div>
                                                    </div>
                                                );
                                            }}
                                        />
                                    </RechartsRadarChart>
                                </ResponsiveContainer>
                            </div>
                        )}

                        {data && chartData.length === 0 && !loading && (
                            <div className="h-[460px] flex items-center justify-center text-center px-8">
                                <div className="text-sm text-zinc-400 max-w-sm">
                                    <Icon name="lock" className="h-6 w-6 mx-auto text-zinc-500 mb-2" />
                                    No axes unlocked yet. Run a curiosity scan or add a memory event to begin.
                                </div>
                            </div>
                        )}

                        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2 text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                            <div>
                                <span className="text-zinc-300">{data?.unlockedAxes ?? 0}</span> /{' '}
                                {data?.totalAxes ?? 6} axes unlocked
                            </div>
                            <div>
                                last activity: <span className="text-zinc-300">{data?.lastActivityAt ? new Date(data.lastActivityAt).toLocaleString() : '—'}</span>
                            </div>
                            <div>
                                radar updated: <span className="text-zinc-300">{new Date().toLocaleTimeString()}</span>
                            </div>
                        </div>
                    </motion.div>

                    {/* Right-rail legend */}
                    <aside className="space-y-4">
                        <motion.div
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
                            className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-5"
                        >
                            <div className="flex items-center gap-2 mb-3">
                                <Sparkles className="h-3.5 w-3.5 text-brand-400" />
                                <h2 className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-400">
                                    Metrics Breakdown
                                </h2>
                            </div>
                            <ul className="space-y-2.5">
                                <AnimatePresence initial={false}>
                                    {(data?.axes ?? []).map((a, i) => (
                                        <motion.li
                                            key={a.label}
                                            layout
                                            initial={{ opacity: 0, x: 8 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ duration: 0.5, delay: 0.15 + i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                                            className="flex items-start justify-between gap-3 border-b border-zinc-800/40 pb-2 last:border-b-0 last:pb-0"
                                        >
                                            <div className="min-w-0 flex-1">
                                                <div className="text-[11px] font-semibold text-zinc-200 uppercase tracking-wider">
                                                    {a.label}
                                                </div>
                                                <div className="text-[10px] text-zinc-500 leading-snug mt-0.5 font-mono">
                                                    {a.raw}
                                                </div>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <div className="text-base font-mono font-semibold text-brand-300 leading-none">
                                                    {Math.round(a.value * 100)}%
                                                </div>
                                                <div className="text-[9px] text-zinc-500 font-mono mt-0.5">
                                                    {a.unlocked ? 'UNLOCKED' : 'LOCKED'}
                                                </div>
                                            </div>
                                        </motion.li>
                                    ))}
                                </AnimatePresence>
                            </ul>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.25 }}
                            className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-5"
                        >
                            <div className="flex items-center gap-2 mb-3">
                                <Icon name="lock" className="h-3.5 w-3.5 text-zinc-500" />
                                <h2 className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">
                                    Locked Axes
                                </h2>
                            </div>
                            <ul className="space-y-2.5">
                                {lockedAxes.length === 0 && (
                                    <li className="text-[10px] text-zinc-500 font-mono">All axes unlocked.</li>
                                )}
                                {lockedAxes.map((a) => (
                                    <li key={a.label} className="border-b border-zinc-800/40 pb-2 last:border-b-0 last:pb-0">
                                        <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                                            <Icon name="lock" className="h-3 w-3" /> {a.label}
                                        </div>
                                        <div className="text-[10px] text-zinc-500 leading-snug mt-0.5 font-mono">
                                            unlocks {a.unlockAt}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </motion.div>

                        {data?.legend && (
                            <motion.div
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.4 }}
                                className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-5"
                            >
                                <h2 className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500 mb-3">
                                    Summary
                                </h2>
                                <dl className="space-y-1.5">
                                    {data.legend.map((row) => (
                                        <div key={row.label} className="flex items-center justify-between gap-3 text-[10px] font-mono">
                                            <dt className="text-zinc-500">{row.label}</dt>
                                            <dd className="text-zinc-200">{row.value}</dd>
                                        </div>
                                    ))}
                                </dl>
                            </motion.div>
                        )}
                    </aside>
                </div>

                {/* Marketing Benchmark — admin-only, fixed reference
                    briefs, persistent run history. Placed after the
                    radar because the radar is the primary "what is
                    One" surface and the benchmark is the secondary
                    "is One getting better" surface. */}
                <MarketingBenchmarkWidget />
            </div>

            <FounderNoteDrawer
                open={noteOpen}
                onClose={() => setNoteOpen(false)}
                getToken={async () => (user ? user.getIdToken() : null)}
            />
        </div>
    );
}

/**
 * Founder note capture.
 *
 * A founder types a raw thought; One.Publisher frames and attributes it
 * and files it in the community review queue. The note is reproduced
 * verbatim by `composeFounderNote` — One does not rewrite it, because
 * putting words in a founder's mouth is exactly the failure that would
 * make the whole autonomous-publishing idea unusable.
 */
function FounderNoteDrawer({
    open,
    onClose,
    getToken,
}: {
    open: boolean;
    onClose: () => void;
    getToken: () => Promise<string | null>;
}) {
    const [note, setNote] = useState('');
    const [category, setCategory] = useState('development');
    const [saving, setSaving] = useState(false);
    const [result, setResult] = useState<string | null>(null);

    // Escape closes the drawer — it is a modal surface over the page and
    // a keyboard user needs a way out that isn't the mouse.
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;

    const submit = async () => {
        setSaving(true);
        setResult(null);
        try {
            const token = await getToken();
            if (!token) throw new Error('Not signed in.');
            const r = await fetch('/api/one/publish', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: 'founder_note', note, category }),
            });
            const body = await r.json().catch(() => ({}));
            if (r.ok && body?.published) {
                setResult(
                    body.heldForReview
                        ? 'Filed in the community review queue — release it from /admin/moderation.'
                        : 'Published live to /community.',
                );
                setNote('');
            } else {
                setResult(body?.reason || body?.message || `Publish returned ${r.status}.`);
            }
        } catch (e) {
            setResult(e instanceof Error ? e.message : 'Could not capture the note.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            <div
                className="absolute inset-0 bg-black/60"
                onClick={onClose}
                aria-hidden="true"
            />
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="founder-note-title"
                className="relative w-full max-w-md h-full bg-zinc-950 border-l border-zinc-800 p-6 overflow-y-auto"
            >
                <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                        <h2 id="founder-note-title" className="text-lg font-semibold text-zinc-50">
                            Capture a founder note
                        </h2>
                        <p className="text-xs text-zinc-400 mt-1">
                            One attributes and posts it unedited. It runs through the same moderation check as any
                            member post.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-zinc-500 hover:text-zinc-200 text-xs uppercase tracking-wider"
                    >
                        Close
                    </button>
                </div>

                <label htmlFor="founder-note" className="block text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500 mb-2">
                    Note
                </label>
                <textarea
                    id="founder-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={10}
                    maxLength={4000}
                    placeholder="What did you learn, decide, or change?"
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-brand-500/50 focus:outline-none"
                />
                <p className="text-[10px] text-zinc-600 mt-1">{note.trim().length} / 4000 · needs at least 20 characters</p>

                <label htmlFor="founder-note-category" className="block text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500 mt-4 mb-2">
                    Category
                </label>
                <select
                    id="founder-note-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 p-2.5 text-sm text-zinc-100 focus:border-brand-500/50 focus:outline-none"
                >
                    <option value="development">Development</option>
                    <option value="showcase">Showcase</option>
                    <option value="rag_agents">RAG Agents</option>
                    <option value="resources">Resources</option>
                    <option value="help">Help &amp; Support</option>
                </select>

                <button
                    type="button"
                    onClick={submit}
                    disabled={saving || note.trim().length < 20}
                    className="mt-5 w-full rounded-xl bg-gradient-to-r from-brand-500 to-blue-600 px-5 py-3 text-xs font-bold uppercase tracking-wider text-black disabled:opacity-40 flex items-center justify-center gap-2"
                >
                    {saving ? <Icon name="loading" className="h-4 w-4 animate-spin" /> : <Icon name="note-edit" className="h-4 w-4" />}
                    Hand to One
                </button>

                {result && (
                    <p role="status" className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-xs text-zinc-300">
                        {result}
                    </p>
                )}
            </div>
        </div>
    );
}

/**
 * Custom recharts tick renderer — editorial poster-style axis labels
 * with the percentage under each label and a tighter type ramp.
 */
function CustomAngleTick({ payload, x, y, textAnchor }: {
    payload: { value: string | number };
    x: number | string;
    y: number | string;
    textAnchor: string;
}) {
    const cx = typeof x === 'string' ? Number(x) : x;
    const cy = typeof y === 'string' ? Number(y) : y;
    return (
        <g transform={`translate(${cx},${cy})`}>
            <text
                textAnchor={(textAnchor ?? 'middle') as 'start' | 'middle' | 'end' | 'inherit'}
                y={0}
                fill="#a1a1aa"
                style={{
                    fontSize: 10,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                }}
            >
                {String(payload.value)}
            </text>
        </g>
    );
}

interface CustomRadarDotProps {
    cx?: number;
    cy?: number;
    x?: number;
    y?: number;
    index?: number;
    payload?: { metric?: string; valuePct?: number; value?: number };
    isHovered: boolean;
    activeIndex: number | null;
    onHoverPoint: (index: number | null) => void;
    chartData: Array<{ metric: string; value: number; valuePct: number }>;
}

/**
 * Custom radar dot renderer with percentage badges that fly in
 * from the top-left corner (0, 0) of the visual canvas on hover.
 */
function CustomRadarDot({
    x,
    y,
    index = 0,
    payload,
    isHovered,
    activeIndex,
    onHoverPoint,
    chartData,
}: CustomRadarDotProps) {
    if (typeof x !== 'number' || typeof y !== 'number') return null;

    const pct = payload?.valuePct ?? chartData[index]?.valuePct ?? 0;
    const isThisPointHovered = activeIndex === index;

    const badgeWidth = 48;
    const badgeHeight = 22;
    const targetX = x - badgeWidth / 2;
    const targetY = y - 32;

    return (
        <g
            onMouseEnter={() => onHoverPoint(index)}
            onMouseLeave={() => onHoverPoint(null)}
            className="cursor-pointer"
        >
            {/* Outer halo on active point hover */}
            <circle
                cx={x}
                cy={y}
                r={isThisPointHovered ? 10 : 7}
                fill="none"
                stroke={isThisPointHovered ? '#e9c884' : '#d8a657'}
                strokeWidth={isThisPointHovered ? 2 : 1}
                opacity={isHovered ? 0.8 : 0.3}
                className="transition-all duration-200"
            />

            {/* Core vertex dot */}
            <circle
                cx={x}
                cy={y}
                r={isThisPointHovered ? 6 : 4.5}
                fill={isThisPointHovered ? '#e9c884' : '#d8a657'}
                stroke="#a87231"
                strokeWidth={2}
                className="transition-all duration-200"
            />

            {/* % Tag flying in from top-left corner (0,0) */}
            <motion.g
                initial={{ x: 0, y: 0, opacity: 0, scale: 0.2 }}
                animate={
                    isHovered
                        ? {
                              x: targetX,
                              y: targetY,
                              opacity: 1,
                              scale: isThisPointHovered ? 1.18 : 1,
                          }
                        : {
                              x: 0,
                              y: 0,
                              opacity: 0,
                              scale: 0.2,
                          }
                }
                transition={{
                    type: 'spring',
                    stiffness: 320,
                    damping: 24,
                    delay: isHovered ? index * 0.05 : 0,
                }}
            >
                <rect
                    x={0}
                    y={0}
                    width={badgeWidth}
                    height={badgeHeight}
                    rx={6}
                    ry={6}
                    fill={isThisPointHovered ? '#33200f' : '#09090b'}
                    stroke={isThisPointHovered ? '#e9c884' : '#d8a657'}
                    strokeWidth={isThisPointHovered ? 1.8 : 1.2}
                    className="shadow-xl"
                />
                <text
                    x={badgeWidth / 2}
                    y={15}
                    textAnchor="middle"
                    fill={isThisPointHovered ? '#ffffff' : '#d8a657'}
                    fontSize={11}
                    fontWeight={700}
                    fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                >
                    {pct}%
                </text>
            </motion.g>
        </g>
    );
}

