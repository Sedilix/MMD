'use client';

import React from 'react';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';
import {
    visibleDashboardTabs,
    type DashboardCapabilities,
} from '@/lib/dashboard/nav';

interface DashboardTabBarProps extends DashboardCapabilities {
    /** Resolved hash from `useDashboardTab()`. */
    activeHash: string;
    /** Live pending-request count, badged on the Requests pill. */
    requestsCount?: number;
}

/**
 * Dashboard navigation for viewports below `md`.
 *
 * The dashboard sidebar is `hidden md:flex` and had no fallback of any kind,
 * so a phone or small tablet could reach the dashboard and then not navigate
 * it — every destination was unreachable without hand-editing the URL hash.
 * Community solved the same problem with a `Sheet` drawer; the studios use a
 * horizontal scrolling pill rail. This follows the pill rail: the dashboard's
 * destinations are flat and few, so a rail shows them all without the extra
 * open-the-drawer step a `Sheet` costs.
 *
 * Destinations, their order, and their role gates all come from
 * `lib/dashboard/nav.ts`, the same source the sidebar and the content switch
 * read — so this bar cannot drift out of sync with either.
 */
export function DashboardTabBar({
    activeHash,
    isAgent,
    isAdmin,
    isCoreOrAdmin,
    requestsCount = 0,
}: DashboardTabBarProps) {
    const tabs = visibleDashboardTabs({ isAgent, isAdmin, isCoreOrAdmin });
    if (tabs.length === 0) return null;

    return (
        <nav
            aria-label="Dashboard sections"
            className="md:hidden flex items-center gap-1.5 h-12 w-full shrink-0 overflow-x-auto scrollbar-none border-b border-zinc-800/80 bg-zinc-950/90 px-2 py-1.5 backdrop-blur-xl select-none"
        >
            {tabs.map((tab) => {
                const isActive = activeHash === tab.hash;
                const badge = tab.hash === '#requests' ? requestsCount : 0;
                return (
                    <a
                        key={tab.hash}
                        href={tab.hash}
                        aria-current={isActive ? 'true' : undefined}
                        title={tab.label}
                        className={cn(
                            'flex items-center gap-1.5 shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-all active:scale-95',
                            isActive
                                ? 'bg-brand-500/20 text-brand-200 border border-brand-500/50'
                                : 'bg-zinc-900 border border-zinc-800 text-zinc-300 hover:border-zinc-700',
                        )}
                    >
                        <Icon
                            name={tab.icon}
                            className={cn('h-3.5 w-3.5 shrink-0', isActive ? 'text-brand-300' : 'text-zinc-400')}
                        />
                        <span>{tab.short}</span>
                        {badge > 0 && (
                            <span className="ml-0.5 rounded-full border border-brand-500/40 bg-brand-500/20 px-1.5 text-[10px] font-mono font-bold text-brand-300">
                                {badge}
                            </span>
                        )}
                    </a>
                );
            })}
        </nav>
    );
}
