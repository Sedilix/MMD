'use client';

/**
 * Desktop Bridge for Tauri Native Host.
 *
 * Safely wraps Tauri native APIs with graceful web browser fallbacks.
 * When running in standard web mode, desktop features gracefully no-op.
 */

export function isDesktopApp(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as { __TAURI_INTERNALS__?: { ipc?: unknown }; __TAURI__?: unknown };
  return Boolean(w.__TAURI_INTERNALS__ || w.__TAURI__);
}

// Auto-intercept relative API requests in standalone desktop/Tauri mode
if (typeof window !== 'undefined') {
  const isTauri = Boolean(
    (window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__
  );
  if (isTauri && !(window as any).__CYBRDECK_FETCH_PATCHED__) {
    (window as any).__CYBRDECK_FETCH_PATCHED__ = true;
    const originalFetch = window.fetch.bind(window);
    const API_ORIGIN = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://www.cybrdeck.com';
    window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
      if (typeof input === 'string') {
        if (input.startsWith('/api/')) {
          input = `${API_ORIGIN}${input}`;
        }
      } else if (input instanceof URL) {
        if (input.pathname.startsWith('/api/') && input.origin === window.location.origin) {
          input = new URL(`${API_ORIGIN}${input.pathname}${input.search}`);
        }
      } else if (input instanceof Request) {
        const url = new URL(input.url);
        if (url.pathname.startsWith('/api/') && url.origin === window.location.origin) {
          return originalFetch(new Request(`${API_ORIGIN}${url.pathname}${url.search}`, input), init);
        }
      }
      return originalFetch(input, init);
    };
  }
}

/**
 * Minimize the active native desktop window.
 */
export async function minimizeWindow(): Promise<void> {
  if (!isDesktopApp()) return;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const win = getCurrentWindow();
    if (win) await win.minimize().catch(() => {});
  } catch (err) {
    // Graceful no-op if IPC is not yet attached
  }
}

/**
 * Toggle maximize / restore for the native desktop window.
 */
export async function toggleMaximizeWindow(): Promise<void> {
  if (!isDesktopApp()) return;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const win = getCurrentWindow();
    if (win) await win.toggleMaximize().catch(() => {});
  } catch (err) {
    // Graceful no-op
  }
}

/**
 * Check if the window is currently maximized.
 */
export async function isWindowMaximized(): Promise<boolean> {
  if (!isDesktopApp()) return false;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const win = getCurrentWindow();
    if (!win) return false;
    return await win.isMaximized().catch(() => false);
  } catch {
    return false;
  }
}

/**
 * Request close for the native desktop window and terminate the app process
 * to release all RAM and OS resources.
 */
export async function closeWindow(): Promise<void> {
  if (!isDesktopApp()) return;
  try {
    const { exit } = await import('@tauri-apps/plugin-process');
    await exit(0);
  } catch {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const win = getCurrentWindow();
      if (win) {
        await win.destroy().catch(() => win.close().catch(() => {}));
      }
    } catch (err) {
      // Graceful no-op
    }
  }
}

/**
 * Open a URL in the user's default system browser rather than navigating
 * the native app window (Tauri's webview otherwise has no built-in
 * out-of-app link handling).
 *
 * Returns whether it actually succeeded, and surfaces a failure through
 * the visible error toast rather than swallowing it into console.warn.
 * This build has no devtools compiled in (no `devtools` Cargo feature),
 * so a console-only failure here is completely invisible to whoever is
 * testing it — worse than no error handling, since it looks like nothing
 * happened rather than like something went wrong. Callers that start
 * waiting for an external step to complete (desktop Google sign-in) need
 * the boolean to know whether it's worth waiting at all.
 */
export async function openExternalUrl(url: string): Promise<boolean> {
  if (!isDesktopApp()) {
    if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener,noreferrer');
    return true;
  }
  
  // Strategy 1: Dedicated app command with scheme isolation. This is the
  // ONLY native path — the generic opener plugin is not permissioned for
  // the main window (see capabilities/default.json and the open_external
  // doc comment in src-tauri/src/lib.rs), so there is deliberately no
  // plugin fallback to escalate around its scheme restriction.
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('open_external', { url });
    return true;
  } catch (err: any) {
    console.warn('[desktop-bridge] open_external command failed, trying window.open:', err);
  }

  // Strategy 2: Standard window.open fallback
  if (typeof window !== 'undefined') {
    try {
      window.open(url, '_blank', 'noopener,noreferrer');
      return true;
    } catch {
      // Ignored
    }
  }

  const { logDesktopError } = await import('@/components/desktop/DesktopErrorNotification');
  logDesktopError('Could not open browser: Please open your browser and navigate to the login URL.');
  return false;
}

/**
 * Send a native Windows Action Center notification.
 */
export async function sendDesktopNotification(title: string, body: string): Promise<void> {
  if (!isDesktopApp()) {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body });
    }
    return;
  }

  try {
    const { isPermissionGranted, requestPermission, sendNotification } = await import(
      '@tauri-apps/plugin-notification'
    );
    let hasPermission = await isPermissionGranted().catch(() => false);
    if (!hasPermission) {
      const permission = await requestPermission().catch(() => 'denied');
      hasPermission = permission === 'granted';
    }
    if (hasPermission) {
      sendNotification({ title, body });
    }
  } catch (err) {
    console.warn('[desktop-bridge] Failed to send desktop notification:', err);
  }
}

/**
 * Ping local Ollama daemon or custom local inference URL via Rust IPC.
 */
export async function pingLocalOllama(endpoint?: string): Promise<boolean> {
  if (isDesktopApp()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<boolean>('ping_ollama', { endpoint }).catch(() => false);
    } catch {
      // Fall through to browser fetch
    }
  }

  // Web fallback: direct fetch to local server
  try {
    const url = endpoint || 'http://127.0.0.1:11434/api/tags';
    const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Get native app version string.
 */
export async function getDesktopVersion(): Promise<string | null> {
  if (!isDesktopApp()) return null;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<string>('get_desktop_version').catch(() => null);
  } catch {
    return null;
  }
}

/**
 * Get native operating system platform (windows, macos, linux).
 */
export async function getOsPlatform(): Promise<string> {
  if (!isDesktopApp()) return 'web';
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<string>('get_os_platform').catch(() => 'web');
  } catch {
    return 'web';
  }
}
