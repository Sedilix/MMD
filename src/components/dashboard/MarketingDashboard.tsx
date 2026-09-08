'use client';

/**
 * Marketing dashboard — tabbed surface that hosts the draft agent
 * and the event-creation agent. The "Draft" tab is the existing
 * MarketingAgent (kryptonite self-critique loop). The "Event" tab
 * is a fully-scoped Luma-ready event builder. Both are gated to
 * Admin and Core (Cybrdeck portal) at the API layer.
 *
 * Tab state is local to the component. The route mounts
 * MarketingAgent as a sub-component (so its existing state +
 * handlers are scoped to the "Draft" tab).
 */

import React, { useState } from 'react';
import { Megaphone, Calendar, Sparkles, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import MarketingAgent from './MarketingAgent';
import { EventTab } from './EventTab';

type Tab = 'draft' | 'event';

export default function MarketingDashboard() {
    const [activeTab, setActiveTab] = useState<Tab>('draft');

    return (
        <div className="space-y-6 w-full max-w-7xl mx-auto">
            {/* Top Control Bar with Glass Segmented Switcher & Engine Telemetry */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 pb-2 border-b border-white/[0.08]">
                {/* Segmented Tab Controller */}
                <div
                    className="inline-flex p-1 rounded-xl bg-[#030917]/80 border border-white/[0.08] shadow-inner backdrop-blur-xl"
                    role="tablist"
                    aria-label="Marketing Workspace Tabs"
                >
                    <TabButton
                        active={activeTab === 'draft'}
                        onClick={() => setActiveTab('draft')}
                        icon={<Megaphone className="h-3.5 w-3.5" />}
                        label="Draft Agent"
                        subtitle="Kryptonite Loop"
                    />
                    <TabButton
                        active={activeTab === 'event'}
                        onClick={() => setActiveTab('event')}
                        icon={<Calendar className="h-3.5 w-3.5" />}
                        label="Event Builder"
                        subtitle="Luma Automation"
                    />
                </div>

                {/* Engine Telemetry Beacon */}
                <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-full border border-white/[0.08] bg-[#020716]/60 backdrop-blur-md shadow-sm">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-500 shadow-[0_0_8px_rgba(198,143,61,0.8)]" />
                    </span>
                    <span className="text-[11px] font-medium tracking-tight text-zinc-300">
                        Persona (One) <span className="text-brand-400 font-mono text-[10px]">v2.5</span>
                    </span>
                    <span className="text-zinc-600">·</span>
                    <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-400 flex items-center gap-1">
                        <Activity className="h-2.5 w-2.5 text-emerald-400" />
                        Live Engine
                    </span>
                </div>
            </div>

            {/* Active Workspace View */}
            <div className="relative">
                {activeTab === 'draft' ? (
                    <div className="rounded-2xl border border-white/[0.08] bg-[#020614]/75 backdrop-blur-2xl p-4 sm:p-6 shadow-[0_20px_50px_rgba(0,0,0,0.8)] transition-all">
                        <MarketingAgent />
                    </div>
                ) : (
                    <div className="rounded-2xl border border-white/[0.08] bg-[#020614]/75 backdrop-blur-2xl p-4 sm:p-6 shadow-[0_20px_50px_rgba(0,0,0,0.8)] transition-all">
                        <EventTab />
                    </div>
                )}
            </div>

            {/* Bottom System Note */}
            <div className="flex items-center justify-between px-2 pt-1 text-[11px] text-zinc-500">
                <p className="inline-flex items-center gap-1.5 font-sans">
                    <Sparkles className="h-3 w-3 text-brand-400 shrink-0" />
                    <span>Autonomous marketing intelligence running on Cybrdeck brand rails & multi-pass self-critique.</span>
                </p>
                <span className="hidden sm:inline font-mono text-[10px] text-zinc-600">
                    RESTRICTED · ADMIN & CORE ONLY
                </span>
            </div>
        </div>
    );
}

function TabButton({
    active,
    onClick,
    icon,
    label,
    subtitle,
}: {
    active: boolean;
    onClick: () => void;
    icon: React.ReactNode;
    label: string;
    subtitle?: string;
}) {
    return (
        <button
            type="button"
            role="tab"
            aria-selected={active}
            onClick={onClick}
            className={cn(
                'group relative inline-flex items-center gap-2.5 px-4 py-2 rounded-lg text-xs font-medium transition-all select-none',
                active
                    ? 'bg-gradient-to-r from-brand-500/20 via-brand-500/10 to-transparent border border-brand-500/30 text-white shadow-[0_0_15px_rgba(198,143,61,0.15)]'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03] border border-transparent',
            )}
        >
            <span className={cn(
                'transition-transform duration-200',
                active ? 'text-brand-400 scale-110' : 'text-zinc-400 group-hover:text-zinc-200'
            )}>
                {icon}
            </span>
            <div className="flex flex-col items-start leading-none">
                <span className={cn('text-xs font-semibold', active ? 'text-white' : 'text-zinc-300')}>
                    {label}
                </span>
                {subtitle && (
                    <span className="text-[9px] font-mono uppercase tracking-wider text-zinc-500 mt-0.5">
                        {subtitle}
                    </span>
                )}
            </div>
        </button>
    );
}
