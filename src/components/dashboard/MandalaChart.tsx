'use client';

/**
 * MandalaChart — 3×3 grid structured around the operator's primary
 * strategic objective for the period.
 *
 * Center tile: primary target (Q3 objective).
 * 8 surrounding tiles: one per Persona One Directorate pillar.
 * Each tile shows live completion % drawn from Firestore
 * `mandala_targets/{docId}` → `pillars[i].tasks[*].status`.
 *
 * Clicking a pillar tile opens an inline task drawer.
 */

import React, { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { motion, AnimatePresence } from 'framer-motion';
import { useFirestore } from '@/firebase';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';

import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────

export interface MandalaTask {
    id: string;
    label: string;
    status: 'pending' | 'in_progress' | 'completed';
}

export interface MandalaPillar {
    id: string;
    label: string;
    agent: string;  // e.g. "One.Outreach"
    accent: string; // Tailwind bg class
    tasks: MandalaTask[];
}

export interface MandalaTarget {
    id: string;
    title: string;
    period: string; // e.g. "Q3 2026"
    pillars: MandalaPillar[];
}

// ── Default pillars (rendered until Firestore doc loads) ───────────────────

const DEFAULT_PILLARS: Omit<MandalaPillar, 'tasks'>[] = [
    { id: 'research',    label: 'Research & Intel',            agent: 'One.Executive',  accent: 'bg-violet-900/40 border-violet-500/30' },
    { id: 'copy',        label: 'Copy & Collateral',           agent: 'One.Publisher',  accent: 'bg-blue-900/40 border-blue-500/30' },
    { id: 'outreach',    label: 'Social Outreach',             agent: 'One.Outreach',   accent: 'bg-brand-900/40 border-brand-500/30' },
    { id: 'quality',     label: 'Brand & Quality Gate',        agent: 'One.Guardian',   accent: 'bg-red-900/40 border-red-500/30' },
    { id: 'commercial',  label: 'Commercial & Proposals',      agent: 'One.Commercial', accent: 'bg-amber-900/40 border-amber-500/30' },
    { id: 'community',   label: 'Community & Events',          agent: 'One.Steward',    accent: 'bg-green-900/40 border-green-500/30' },
    { id: 'ops',         label: 'Operations & Telemetry',      agent: 'One.Ops',        accent: 'bg-slate-700/40 border-slate-500/30' },
    { id: 'improvement', label: 'Self-Improvement & Benchmarks', agent: 'One.Ops',      accent: 'bg-indigo-900/40 border-indigo-500/30' },
];

// ── Helpers ────────────────────────────────────────────────────────────────

function completionPct(tasks: MandalaTask[]): number {
    if (!tasks.length) return 0;
    const done = tasks.filter(t => t.status === 'completed').length;
    return Math.round((done / tasks.length) * 100);
}

// Pillar order maps to 9-cell grid positions (0-8, center=4)
const GRID_ORDER = [0, 1, 2, 3, /* center=4 */ 5, 6, 7, 8];

// ── Sub-components ─────────────────────────────────────────────────────────

function TaskRow({ task }: { task: MandalaTask }) {
    const statusIconName = task.status === 'completed' ? 'circle-check'
        : task.status === 'in_progress' ? 'loading'
        : 'circle';
    return (
        <div className="flex items-start gap-2 py-1.5">
            <Icon
                name={statusIconName}
                width={14}
                height={14}
                className={cn(
                    'mt-0.5 shrink-0',
                    task.status === 'completed' ? 'text-emerald-400' :
                    task.status === 'in_progress' ? 'text-brand-400 animate-spin' :
                    'text-slate-500'
                )}
            />
            <span className={cn('text-xs leading-tight', task.status === 'completed' ? 'text-slate-400 line-through' : 'text-slate-300')}>
                {task.label}
            </span>
        </div>
    );
}

function PillarTile({ pillar, index }: { pillar: MandalaPillar; index: number }) {
    const [open, setOpen] = useState(false);
    const pct = completionPct(pillar.tasks);

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.04 }}
            className={cn(
                'relative rounded-xl border p-3 cursor-pointer select-none transition-colors',
                pillar.accent,
                'hover:brightness-110'
            )}
            onClick={() => setOpen(v => !v)}
        >
            {/* Header */}
            <div className="flex items-start justify-between gap-1">
                <div>
                    <p className="text-[11px] font-semibold text-white/90 leading-tight">{pillar.label}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{pillar.agent}</p>
                </div>
                {open ? <Icon name="chevron-up" width={13} height={13} className="text-slate-400 shrink-0 mt-0.5" /> : <Icon name="chevron-down" width={13} height={13} className="text-slate-400 shrink-0 mt-0.5" />}
            </div>

            {/* Progress bar */}
            <div className="mt-2 h-1 w-full bg-white/10 rounded-full overflow-hidden">
                <motion.div
                    className="h-full bg-brand-400 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">{pct}% complete · {pillar.tasks.filter(t => t.status === 'completed').length}/{pillar.tasks.length} tasks</p>

            {/* Task drawer */}
            <AnimatePresence>
                {open && pillar.tasks.length > 0 && (
                    <motion.div
                        key="drawer"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden mt-2 border-t border-white/10 pt-2"
                    >
                        {pillar.tasks.map(t => <TaskRow key={t.id} task={t} />)}
                    </motion.div>
                )}
                {open && pillar.tasks.length === 0 && (
                    <motion.p
                        key="empty"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="text-[10px] text-slate-500 mt-2 pt-2 border-t border-white/10"
                    >
                        No tasks yet — add them in Firestore.
                    </motion.p>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

function CenterTile({ target, overallPct }: { target: MandalaTarget | null; overallPct: number }) {
    return (
        <div className="flex flex-col items-center justify-center rounded-xl border border-brand-500/50 bg-brand-950/40 p-4 text-center h-full">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-400/70 mb-1">
                {target?.period ?? 'Q3 2026'}
            </p>
            <p className="text-sm font-bold text-white leading-tight">
                {target?.title ?? 'Strategic Objective'}
            </p>
            {/* Circular progress ring */}
            <div className="relative mt-3 w-14 h-14">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
                    <motion.circle
                        cx="18" cy="18" r="15.9" fill="none"
                        stroke="#d8a657" strokeWidth="3"
                        strokeLinecap="round"
                        strokeDasharray={`${overallPct} ${100 - overallPct}`}
                        strokeDashoffset="0"
                        initial={{ strokeDasharray: '0 100' }}
                        animate={{ strokeDasharray: `${overallPct} ${100 - overallPct}` }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                    />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-brand-300">
                    {overallPct}%
                </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-2">overall completion</p>
        </div>
    );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function MandalaChart() {
    const [target, setTarget] = useState<MandalaTarget | null>(null);
    const [loading, setLoading] = useState(true);
    const firestore = useFirestore();

    // Build pillars: merge DEFAULT_PILLARS with live task data from Firestore doc
    const pillars: MandalaPillar[] = DEFAULT_PILLARS.map(def => {
        const live = target?.pillars.find(p => p.id === def.id);
        return { ...def, tasks: live?.tasks ?? [] };
    });

    const overallPct = Math.round(
        pillars.reduce((sum, p) => sum + completionPct(p.tasks), 0) / pillars.length
    );

    useEffect(() => {
        if (!firestore) { setLoading(false); return; }
        const q = query(collection(firestore, 'mandala_targets'), orderBy('period', 'desc'), limit(1));
        const unsub = onSnapshot(q, snap => {
            if (!snap.empty) {
                const doc = snap.docs[0];
                setTarget({ id: doc.id, ...doc.data() } as MandalaTarget);
            }
            setLoading(false);
        }, () => setLoading(false));
        return unsub;
    }, [firestore]);

    // Map 8 pillars into 9-cell grid (skip center position 4)
    const cells: (MandalaPillar | 'center')[] = [];
    let pi = 0;
    for (let i = 0; i < 9; i++) {
        if (i === 4) { cells.push('center'); } else { cells.push(pillars[pi++]); }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-32 text-slate-500">
                <Icon name="loading" width={18} height={18} className="animate-spin mr-2" />
                <span className="text-sm">Loading Mandala framework…</span>
            </div>
        );
    }

    return (
        <div className="w-full">
            <div className="flex items-baseline gap-3 mb-4">
                <h2 className="text-base font-semibold text-white">Strategic Mandala</h2>
                <span className="text-xs text-slate-400">
                    8 operational pillars · {pillars.reduce((s, p) => s + p.tasks.length, 0)} tasks tracked
                </span>
            </div>

            <div className="grid grid-cols-3 gap-2.5" style={{ gridAutoRows: 'minmax(120px, auto)' }}>
                {cells.map((cell, i) =>
                    cell === 'center'
                        ? <CenterTile key="center" target={target} overallPct={overallPct} />
                        : <PillarTile key={(cell as MandalaPillar).id} pillar={cell as MandalaPillar} index={i} />
                )}
            </div>
        </div>
    );
}
