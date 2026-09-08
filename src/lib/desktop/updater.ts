/**
 * In-App Auto-Updater Client for Desktop App
 * Wraps @tauri-apps/plugin-updater with event stream handlers and safe fallbacks.
 */

import { isDesktopApp } from './desktop-bridge';
import { logDesktopError } from '@/components/desktop/DesktopErrorNotification';

export interface UpdateStatus {
  state: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error' | 'up-to-date';
  version?: string;
  body?: string;
  date?: string;
  progressPct?: number;
  errorMessage?: string;
}

export type UpdateListener = (status: UpdateStatus) => void;

let currentStatus: UpdateStatus = { state: 'idle' };
const listeners = new Set<UpdateListener>();

function setStatus(next: UpdateStatus) {
  currentStatus = next;
  listeners.forEach((fn) => fn(currentStatus));
}

export function subscribeUpdateStatus(listener: UpdateListener): () => void {
  listeners.add(listener);
  listener(currentStatus);
  return () => listeners.delete(listener);
}

let activeUpdateHandle: any = null;

/**
 * Silently checks if a newer desktop binary is published on GitHub Releases.
 */
export async function checkForDesktopUpdate(): Promise<UpdateStatus> {
  if (!isDesktopApp()) {
    setStatus({ state: 'up-to-date' });
    return currentStatus;
  }

  try {
    setStatus({ state: 'checking' });
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();

    if (update && update.available) {
      activeUpdateHandle = update;
      setStatus({
        state: 'available',
        version: update.version,
        body: update.body,
        date: update.date,
      });
    } else {
      activeUpdateHandle = null;
      setStatus({ state: 'up-to-date' });
    }
  } catch (err: any) {
    const msg = err?.message || 'Failed to check for updates';
    console.warn('[Desktop Updater] Check failed:', err);
    // No logDesktopError() here — this check also runs silently on launch
    // and every 30 minutes (see UpdatePill.tsx), so a flaky/offline update
    // server would otherwise spam the intrusive global red toast on every
    // startup. The titlebar's UpdatePill already renders its own subtle
    // "Update failed (retry)" pill from `state: 'error'` below, which is
    // enough surface for both the silent and user-retried paths.
    setStatus({
      state: 'error',
      errorMessage: msg,
    });
  }

  return currentStatus;
}

/**
 * Downloads and stages the update with real-time percentage progress.
 */
export async function downloadAndInstallDesktopUpdate(): Promise<void> {
  if (!activeUpdateHandle) {
    throw new Error('No update ready for download');
  }

  try {
    let downloadedBytes = 0;
    let totalBytes = 0;

    setStatus({ ...currentStatus, state: 'downloading', progressPct: 0 });

    await activeUpdateHandle.downloadAndInstall((event: any) => {
      if (event.event === 'Started') {
        totalBytes = event.data?.contentLength || 0;
      } else if (event.event === 'Progress') {
        downloadedBytes += event.data?.chunkLength || 0;
        const pct = totalBytes > 0 ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : 0;
        setStatus({
          ...currentStatus,
          state: 'downloading',
          progressPct: pct,
        });
      } else if (event.event === 'Finished') {
        setStatus({
          ...currentStatus,
          state: 'downloaded',
          progressPct: 100,
        });
      }
    });

    setStatus({
      ...currentStatus,
      state: 'downloaded',
      progressPct: 100,
    });
  } catch (err: any) {
    const msg = err?.message || 'Download failed';
    console.error('[Desktop Updater] Download failed:', err);
    logDesktopError(`Update download failed: ${msg}`);
    setStatus({
      ...currentStatus,
      state: 'error',
      errorMessage: msg,
    });
    throw err;
  }
}

/**
 * Restarts the application cleanly to apply the newly installed release.
 */
export async function restartDesktopApp(): Promise<void> {
  if (!isDesktopApp()) return;

  try {
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
  } catch (err) {
    console.error('[Desktop Updater] Relaunch failed:', err);
  }
}
