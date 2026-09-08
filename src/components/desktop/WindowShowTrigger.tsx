'use client';

import { useEffect } from 'react';
import { isDesktopApp } from '@/lib/desktop/desktop-bridge';

export function WindowShowTrigger() {
  useEffect(() => {
    if (!isDesktopApp()) return;

    const showWindow = async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const win = getCurrentWindow();
        if (win) {
          await win.show().catch(() => {});
          await win.unminimize().catch(() => {});
          await win.setFocus().catch(() => {});
        }
      } catch (err) {
        console.warn('[WindowShowTrigger] Failed to show window:', err);
      }
    };

    const timer = setTimeout(showWindow, 400);
    return () => clearTimeout(timer);
  }, []);

  return null;
}
