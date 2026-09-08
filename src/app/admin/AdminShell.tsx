'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

export interface AdminNavItem {
    href: string;
    label: string;
    description: string;
    tag: string;
    iconName: string;
}

export const ADMIN_NAV: AdminNavItem[] = [
    {
        href: '/admin/one-progress',
        label: "One's Progress & Reports",
        description: 'Capability radar & executive briefing',
        tag: 'Radar & Briefings',
        iconName: 'layers',
    },
    {
        href: '/admin/agents',
        label: 'Agents Dashboard',
        description: 'Multi-agent telemetry & module posture',
        tag: 'Agent Directory',
        iconName: 'grid-big',
    },
    {
        href: '/admin/moderation',
        label: 'Moderation Console',
        description: 'AI safety logs, slang taxonomy & accounts',
        tag: 'Safety & Accounts',
        iconName: 'shield-warning',
    },
    {
        href: '/admin/analytics',
        label: 'Site Analytics',
        description: 'Pageviews & visitor telemetry',
        tag: 'Traffic & Consent',
        iconName: 'data',
    },
];

/**
 * Impeccable-CX Admin Shell — High-craft operational sidebar + main container.
 * Standardized on the Figma Coolicons icon set (`@iconify-json/ci`).
 */
export default function AdminShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname() ?? '';

    return (
        <div className="min-h-dvh bg-zinc-950 text-zinc-100 font-sans selection:bg-brand-500/30 selection:text-brand-200">
            <div className="flex flex-col lg:flex-row min-h-dvh">
                {/* Operational Sidebar */}
                <aside className="lg:w-72 lg:min-h-dvh border-b lg:border-b-0 lg:border-r border-zinc-800/80 bg-zinc-950/80 backdrop-blur-xl lg:sticky lg:top-0 flex flex-col justify-between shrink-0">
                    <div>
                        {/* Sidebar Header */}
                        <div className="p-5 border-b border-zinc-800/70">
                            <Link
                                href="/dashboard"
                                className="group inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-zinc-400 hover:text-brand-300 transition-colors px-2.5 py-1.5 rounded-md bg-zinc-900/60 border border-zinc-800 hover:border-brand-500/40"
                            >
                                <Icon name="arrow-left-md" className="w-3 h-3 transition-transform group-hover:-translate-x-0.5" />
                                <span>Platform Dashboard</span>
                            </Link>

                            <div className="mt-4 flex items-center gap-2.5">
                                <div className="p-1.5 rounded-lg bg-brand-500/10 border border-brand-500/30 text-brand-400 shadow-[0_0_12px_rgba(216,166,87,0.2)]">
                                    <Icon name="star" className="w-4 h-4 text-brand-400" />
                                </div>
                                <div>
                                    <h1 className="text-xs font-mono font-bold uppercase tracking-[0.2em] text-zinc-100 leading-tight">
                                        Admin Console
                                    </h1>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                        <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                                            Online · Enterprise v2.5
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Navigation Items */}
                        <nav className="p-3 space-y-1.5">
                            <div className="px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-zinc-500">
                                Management Surfaces
                            </div>
                            {ADMIN_NAV.map((item) => {
                                const active = pathname === item.href || pathname.startsWith(item.href + '/');
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        className={cn(
                                            'group relative block rounded-xl p-3 border transition-all duration-200',
                                            active
                                                ? 'bg-brand-950/30 border-brand-500/50 shadow-[0_4px_20px_-4px_rgba(216,166,87,0.15)] text-brand-100'
                                                : 'border-zinc-800/40 bg-zinc-900/30 hover:border-zinc-700/80 hover:bg-zinc-900/70 text-zinc-300'
                                        )}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2.5">
                                                <div className={cn(
                                                    'p-1.5 rounded-lg border transition-colors',
                                                    active
                                                        ? 'bg-brand-500/20 border-brand-400/40 text-brand-300'
                                                        : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 group-hover:text-zinc-200'
                                                )}>
                                                    <Icon name={item.iconName} className="w-4 h-4" />
                                                </div>
                                                <span className={cn(
                                                    'text-xs font-semibold tracking-tight',
                                                    active ? 'text-zinc-50 font-bold' : 'text-zinc-300 group-hover:text-zinc-100'
                                                )}>
                                                    {item.label}
                                                </span>
                                            </div>
                                            <Icon name="chevron-right" className={cn(
                                                'w-3.5 h-3.5 transition-transform',
                                                active ? 'text-brand-400 translate-x-0.5' : 'text-zinc-600 group-hover:text-zinc-400'
                                            )} />
                                        </div>
                                        <div className="text-[11px] text-zinc-400 leading-snug mt-1.5 pl-8">
                                            {item.description}
                                        </div>
                                    </Link>
                                );
                            })}
                        </nav>
                    </div>

                    {/* System Telemetry Status Footer */}
                    <div className="p-4 border-t border-zinc-800/70 bg-zinc-950/90">
                        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3 space-y-2">
                            <div className="flex items-center justify-between text-[10px] font-mono">
                                <span className="text-zinc-400 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                                    <Icon name="data" className="w-3 h-3 text-brand-400" /> System Posture
                                </span>
                                <span className="inline-flex items-center gap-1 text-emerald-400 font-bold">
                                    <Icon name="check" className="w-3 h-3 text-emerald-400" /> Operational
                                </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-zinc-800/50 text-[10px] font-mono text-zinc-400">
                                <div>
                                    <span className="text-zinc-500 block text-[9px]">API REGION</span>
                                    <span className="text-zinc-200 font-semibold">ap-southeast-1</span>
                                </div>
                                <div>
                                    <span className="text-zinc-500 block text-[9px]">AUTH SECURITY</span>
                                    <span className="text-zinc-200 font-semibold">Session Token</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </aside>

                {/* Main Content Area */}
                <main className="flex-1 min-w-0 bg-zinc-950 relative">
                    <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-brand-500/5 rounded-full blur-[120px] pointer-events-none" />
                    {children}
                </main>
            </div>
        </div>
    );
}

