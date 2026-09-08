/**
 * Dashboard navigation — the single source of truth for "which tab is active".
 *
 * This module exists because the dashboard previously kept that answer in two
 * places that disagreed. `app/dashboard/layout.tsx` (the sidebar) and
 * `app/dashboard/page.tsx` (the content) each held their own `activeHash`
 * state, each read `window.location.hash` independently, and each fell back
 * to a *different* default when the URL had no hash: the layout used
 * `'#overview'`, the page used `'#projects'`. Since no sidebar item has ever
 * matched `'#overview'`, a fresh load with a bare `/dashboard` URL rendered
 * the Project Warehouse while the sidebar highlighted nothing at all — the
 * user could not tell where they were.
 *
 * Keeping the tab list, the default, and the resolver here means the two
 * consumers cannot drift apart again: there is one list and one fallback.
 *
 * Deliberately free of React and of `window` so `scripts/check-dashboard-nav.ts`
 * can assert the invariants in plain Node. The hook that owns the listener
 * lives next door in `use-dashboard-tab.ts`.
 */

/** Capability gate a tab requires before it may be shown. */
export type DashboardRole = 'agent' | 'admin' | 'coreOrAdmin';

export interface DashboardTab {
    /** URL fragment, including the leading '#'. Also the render key. */
    hash: string;
    /** Full label, as the sidebar shows it. */
    label: string;
    /** Compact label for the horizontal bar, where width is scarce. */
    short: string;
    /** Coolicons name (see components/ui/icon). */
    icon: string;
    /** Null means "visible to anyone who can see the dashboard at all". */
    requires: DashboardRole | null;
}

/**
 * Every hash-addressable dashboard destination, in sidebar order.
 *
 * `/dashboard/credentials` is intentionally absent: it is a real route, not
 * a hash tab, and mixing it in here would let it be "resolved" to as though
 * the content switch could render it.
 */
export const DASHBOARD_TABS: readonly DashboardTab[] = [
    { hash: '#projects', label: 'Project Warehouse', short: 'Projects', icon: 'house-01', requires: null },
    { hash: '#requests', label: 'Project Requests', short: 'Requests', icon: 'mail', requires: 'agent' },
    { hash: '#summary', label: 'Project Summary', short: 'Summary', icon: 'file-document', requires: 'agent' },
    { hash: '#timeline', label: 'Project Timeline', short: 'Timeline', icon: 'calendar', requires: 'agent' },
    { hash: '#milestones', label: 'Project Milestones', short: 'Milestones', icon: 'flag', requires: 'agent' },
    { hash: '#forum', label: 'Agent Forum', short: 'Forum', icon: 'chat', requires: 'agent' },
    { hash: '#applicants', label: 'Manage Applicants', short: 'Applicants', icon: 'shield-warning', requires: 'admin' },
    { hash: '#users', label: 'Manage Users', short: 'Users', icon: 'user-01', requires: 'admin' },
    { hash: '#marketing', label: 'Marketing Agent', short: 'Marketing', icon: 'volume-max', requires: 'coreOrAdmin' },
    { hash: '#social-control', label: 'Command Console', short: 'Console', icon: 'shield-check', requires: 'coreOrAdmin' },
] as const;

/**
 * Where a bare `/dashboard` lands.
 *
 * Must be a tab with `requires: null`, or the lowest-privilege visitor would
 * default onto a destination they are not allowed to see. `check-dashboard-nav.ts`
 * asserts exactly that.
 */
export const DEFAULT_DASHBOARD_TAB = '#projects';

/** Role flags as the dashboard computes them from Firestore. */
export interface DashboardCapabilities {
    isAgent: boolean;
    isAdmin: boolean;
    isCoreOrAdmin: boolean;
}

/** Whether `caps` satisfies a tab's gate. */
export function canSeeDashboardTab(tab: DashboardTab, caps: DashboardCapabilities): boolean {
    switch (tab.requires) {
        case null:
            return true;
        case 'agent':
            return caps.isAgent;
        case 'admin':
            return caps.isAdmin;
        case 'coreOrAdmin':
            return caps.isCoreOrAdmin;
    }
}

/** The tabs a given visitor may actually navigate to, in sidebar order. */
export function visibleDashboardTabs(caps: DashboardCapabilities): DashboardTab[] {
    return DASHBOARD_TABS.filter((tab) => canSeeDashboardTab(tab, caps));
}

/**
 * Normalise a raw `window.location.hash` to a known tab.
 *
 * An empty, missing, or unrecognised hash resolves to `DEFAULT_DASHBOARD_TAB`
 * rather than to itself, so the sidebar always has something to highlight and
 * the content switch always has something to render. That pairing is the
 * whole point: the old code let the two disagree about what "no hash" meant.
 *
 * Note this does NOT apply the role gate — an unauthorised hash still
 * resolves to its tab, and the page's own per-tab guards render the
 * "Restricted" panel. Silently redirecting would hide from the user that
 * the destination exists but is closed to them.
 */
export function resolveDashboardTab(rawHash: string | null | undefined): string {
    if (!rawHash) return DEFAULT_DASHBOARD_TAB;
    const normalised = rawHash.startsWith('#') ? rawHash : `#${rawHash}`;
    const match = DASHBOARD_TABS.find((tab) => tab.hash === normalised);
    return match ? match.hash : DEFAULT_DASHBOARD_TAB;
}
