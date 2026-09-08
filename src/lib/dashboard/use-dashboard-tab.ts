'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_DASHBOARD_TAB, resolveDashboardTab } from './nav';

/**
 * The active dashboard tab, read from the URL hash.
 *
 * Both the sidebar (`app/dashboard/layout.tsx`) and the content switch
 * (`app/dashboard/page.tsx`) call this, so they always agree. Previously each
 * kept its own `useState` + `hashchange` listener with a different fallback,
 * which is how a bare `/dashboard` ended up rendering one tab while the
 * sidebar highlighted none — see the note in `nav.ts`.
 *
 * Starts at `DEFAULT_DASHBOARD_TAB` rather than reading `window` during
 * render: the dashboard is a client component but still server-renders, and
 * touching `window` in the initial state would break hydration. The effect
 * below corrects to the real hash on mount.
 */
export function useDashboardTab(): string {
    const [activeTab, setActiveTab] = useState<string>(DEFAULT_DASHBOARD_TAB);

    useEffect(() => {
        const sync = () => setActiveTab(resolveDashboardTab(window.location.hash));
        sync();
        window.addEventListener('hashchange', sync);
        return () => window.removeEventListener('hashchange', sync);
    }, []);

    return activeTab;
}
