'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { isDesktopApp } from '@/lib/desktop/desktop-bridge';

/**
 * Ensures the desktop application is locked directly to the Playground experience.
 * If the user ever navigates to the root marketing page '/', it routes directly to '/playground/app'.
 */
export function DesktopRouterGuard() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (isDesktopApp() && pathname === '/') {
      router.replace('/playground/app');
    }
  }, [pathname, router]);

  return null;
}
