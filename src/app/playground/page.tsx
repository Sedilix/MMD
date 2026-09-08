'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * /playground — hidden during the community-partnership window.
 *
 * This route used to host the liquid-glass showcase + pricing pitch for the
 * Playground product. The product is no longer marketed on the website, but
 * the workbench itself stays live at /playground/app — the Tauri desktop
 * shell redirects here on launch and community preset cards deep-link into
 * it — so this page now funnels straight into the workbench instead of
 * advertising it.
 */
export default function PlaygroundLandingPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/playground/app');
    }, [router]);

    return <div className="min-h-dvh bg-[#01040c]" />;
}
