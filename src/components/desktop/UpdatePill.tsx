'use client';

import React, { useEffect, useState } from 'react';
import {
  subscribeUpdateStatus,
  checkForDesktopUpdate,
  downloadAndInstallDesktopUpdate,
  restartDesktopApp,
  type UpdateStatus,
} from '@/lib/desktop/updater';
import { isDesktopApp, openExternalUrl } from '@/lib/desktop/desktop-bridge';
import { Icon } from '@/components/ui/icon';

export function UpdatePill() {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' });
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const desktop = isDesktopApp();
    setIsDesktop(desktop);
    if (!desktop) return;

    const unsub = subscribeUpdateStatus(setStatus);

    // Run silent update check 3 seconds after launch, and every 30 minutes thereafter
    const initialTimer = setTimeout(() => {
      checkForDesktopUpdate();
    }, 3000);

    const interval = setInterval(() => {
      checkForDesktopUpdate();
    }, 30 * 60 * 1000);

    return () => {
      unsub();
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, []);

  if (!isDesktop) return null;

  // 1. Update Available -> Click to Download
  if (status.state === 'available') {
    return (
      <button
        type="button"
        onClick={() => downloadAndInstallDesktopUpdate()}
        className="no-drag flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-sky-500/15 border border-sky-400/40 text-sky-300 hover:bg-sky-500/25 transition-all shadow-sm active:scale-95"
        title={status.body || 'New desktop release available. Click to download in background.'}
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500" />
        </span>
        <span>Update to v{status.version || 'New'}</span>
        <Icon name="arrow-down" className="h-3 w-3 ml-0.5 opacity-80" />
      </button>
    );
  }

  // 2. Downloading -> Real-time progress + radial indicator
  if (status.state === 'downloading') {
    const pct = status.progressPct ?? 0;
    return (
      <div
        className="no-drag flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-zinc-800/80 border border-zinc-700 text-zinc-300 shadow-sm"
        title="Downloading update in background..."
      >
        <Icon name="loading" className="h-3 w-3 animate-spin text-sky-400" />
        <span>Downloading {pct}%</span>
      </div>
    );
  }

  // 3. Downloaded -> Restart to Update
  if (status.state === 'downloaded') {
    return (
      <button
        type="button"
        onClick={() => restartDesktopApp()}
        className="no-drag flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 hover:bg-emerald-500/30 transition-all shadow-sm active:scale-95 animate-pulse"
        title="Update is staged and ready. Click to restart app."
      >
        <Icon name="check" className="h-3 w-3 text-emerald-400" />
        <span>Restart to Update</span>
      </button>
    );
  }

  // 4. Error state -> Retry or direct download setup fallback
  if (status.state === 'error' && status.errorMessage) {
    return (
      <div className="no-drag flex items-center gap-1">
        <button
          type="button"
          onClick={() => checkForDesktopUpdate()}
          className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-red-500/10 border border-red-500/30 text-red-300 hover:bg-red-500/20"
          title={`Update error: ${status.errorMessage}. Click to retry.`}
        >
          <Icon name="alert-triangle" className="h-2.5 w-2.5" />
          <span>Retry</span>
        </button>
        <button
          type="button"
          onClick={() => openExternalUrl('https://github.com/Sedilix/MMD/releases/latest')}
          className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-sky-500/10 border border-sky-500/30 text-sky-300 hover:bg-sky-500/20 transition-all"
          title="Download the latest installer directly"
        >
          <Icon name="arrow-down" className="h-2.5 w-2.5" />
          <span>Get installer</span>
        </button>
      </div>
    );
  }

  return null;
}
