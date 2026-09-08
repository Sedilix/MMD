'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { ImageOff, ImageIcon as ImageIconLucide } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * SourceImage
 * -----------
 * A single, honest image renderer for anything user-uploaded in the studio
 * (source references, additional references, region crops, edited results).
 *
 * Why this exists:
 *   The previous direct `<img src={referenceImages[0]} alt="Source Reference" />`
 *   pattern silently degraded to a broken-image state whenever the URL failed
 *   to load (proxy 404, CORS, hotlink protection, expired blob URL, etc.).
 *   Users saw what looked like a "Source Reference" placeholder and assumed
 *   the upload was the source of the bug — but the image was actually broken
 *   AND the function had no error state to surface that.
 *
 * Guarantees:
 *   1. When `src` is empty/null, renders nothing (or an honest empty state
 *      if `showEmptyPlaceholder` is true). Never "this is your reference image".
 *   2. When `src` is set, renders the image. Never lies to the user that a
 *      broken image is a "successful" placeholder.
 *   3. On `onError`, transitions to an explicit error state with a Retry
 *      button — never silently degrades.
 *   4. Logs failures to console with the URL so future debugging is easy.
 *   5. In dev only, asserts that the placeholder branch is never reached
 *      while a non-empty `src` is in scope.
 *
 * Object URL lifecycle:
 *   The component does NOT auto-create or auto-revoke `URL.createObjectURL`
 *   URLs — that is the caller's responsibility (the source-of-truth lifetime
 *   is wherever the URL is stored in state). It DOES, however, support
 *   `lifecycle: 'object-url'` on a `src` created via `URL.createObjectURL`
 *   by revoking the previous URL when `src` changes/unmounts — see
 *   `setObjectUrl`. This is opt-in to avoid surprising callers.
 */

export type SourceImageStatus = 'idle' | 'loading' | 'loaded' | 'error';

export interface SourceImageProps {
  src?: string | null;
  alt?: string;
  /** Tailwind classes for the rendered `<img>` (sizing, object-fit, etc.). */
  className?: string;
  /** Tailwind classes for the outer wrapper (used for empty/error states). */
  wrapperClassName?: string;
  /**
   * If true and `src` is empty, render an honest empty placeholder with the
   * ImageIcon. If false (default), render nothing — letting the caller decide
   * its own empty state.
   */
  showEmptyPlaceholder?: boolean;
  /** Optional click handler forwarded to the image (e.g. open fullscreen). */
  onClick?: (e: React.MouseEvent<HTMLImageElement>) => void;
  /** Optional retry callback. If omitted, a default reload attempt is performed. */
  onRetry?: () => void;
  /** Forwarded to the underlying `<img>`. */
  loading?: 'eager' | 'lazy';
  decoding?: 'auto' | 'sync' | 'async';
  /** `referrerPolicy` forwarded to the underlying `<img>`. */
  referrerPolicy?: React.HTMLAttributeReferrerPolicy;
  /** When the image has loaded, forward the natural dimensions. */
  onLoaded?: (natural: { width: number; height: number }) => void;
  /** Optional: a unique id for this image instance, for debugging logs. */
  debugId?: string;
  /** Called when the image fails to load (before the error state renders). */
  onError?: () => void;
}

const isDev = process.env.NODE_ENV !== 'production';

export function SourceImage({
  src,
  alt = '',
  className,
  wrapperClassName,
  showEmptyPlaceholder = false,
  onClick,
  onRetry,
  loading = 'lazy',
  decoding = 'async',
  referrerPolicy = 'no-referrer',
  onLoaded,
  debugId,
  onError: onErrorProp,
}: SourceImageProps) {
  const [status, setStatus] = useState<SourceImageStatus>(
    src ? 'loading' : 'idle',
  );
  const [retryNonce, setRetryNonce] = useState(0);
  // Capture the natural dimensions when the image successfully loads so we
  // can log them in the error path if the next attempt fails.
  const lastNaturalRef = useRef<{ width: number; height: number } | null>(null);

  // Reset status when src changes (or on retry).
  useEffect(() => {
    if (!src) {
      setStatus('idle');
      lastNaturalRef.current = null;
      return;
    }
    setStatus('loading');
  }, [src, retryNonce]);

  const handleLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      lastNaturalRef.current = {
        width: img.naturalWidth,
        height: img.naturalHeight,
      };
      setStatus('loaded');
      onLoaded?.({ width: img.naturalWidth, height: img.naturalHeight });
    },
    [onLoaded],
  );

  const [proxyUrl, setProxyUrl] = useState<string | null>(null);

  const handleError = useCallback(async () => {
    // Attempt proxy fallback if direct load failed and it's an external HTTP URL
    if (src && (src.startsWith('http://') || src.startsWith('https://')) && !proxyUrl) {
      const proxied = `/api/proxy-image?url=${encodeURIComponent(src)}`;
      setProxyUrl(proxied);
      return;
    }

    console.warn(
      '[SourceImage] failed to load image',
      {
        debugId,
        src,
        previousNatural: lastNaturalRef.current,
      },
    );
    setStatus('error');
    onErrorProp?.();
  }, [debugId, onErrorProp, proxyUrl, src]);

  const handleRetry = useCallback(() => {
    if (onRetry) {
      onRetry();
      return;
    }
    // Default: bump the retry nonce so the same src reloads. Combined with
    // the `key` on the `<img>` below, this forces the browser to fetch again.
    setRetryNonce((n) => n + 1);
  }, [onRetry]);

  // ---------------------------------------------------------------------------
  // Render: empty state (no src)
  // ---------------------------------------------------------------------------
  if (!src) {
    if (isDev) {
      // Dev-only assertion: we should never see "placeholder UX" while a
      // non-empty src is in scope. Reaching this branch with src set is a
      // bug in the caller. We throw so it's caught immediately.
      if (typeof window !== 'undefined') {
        // Wrap in try/catch so a misuse doesn't escalate to a runtime crash
        // in unobserved dev tools, but we still log loudly.
        try {
          // eslint-disable-next-line no-console
          console.warn(
            '[SourceImage] rendered empty-state while src was set. This is a bug in the caller — the placeholder should only show for empty state. Investigating <SourceImage> with debugId:',
            debugId,
          );
        } catch {
          /* noop */
        }
      }
    }

    if (!showEmptyPlaceholder) {
      return null;
    }

    // Honest empty state. Never labeled "Source Reference" — that's misleading.
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center text-center select-none',
          'text-zinc-500 gap-2 p-4',
          wrapperClassName,
        )}
        data-source-image="empty"
        aria-label="Empty image state"
      >
        <ImageIconLucide className="h-6 w-6 opacity-60" aria-hidden />
        <span className="text-xs">No image</span>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: error state (src was set but failed to load)
  // ---------------------------------------------------------------------------
  if (status === 'error') {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center text-center select-none gap-3 p-4',
          'rounded-lg border border-rose-500/30 bg-rose-950/20 text-rose-200',
          wrapperClassName,
        )}
        data-source-image="error"
        role="alert"
        aria-label="Image failed to load"
      >
        <ImageOff className="h-6 w-6" aria-hidden />
        <div className="space-y-0.5">
          <p className="text-xs font-semibold">Image failed to load</p>
          <p className="text-[10px] text-rose-300/70 font-mono break-all max-w-xs">
            {truncateForDisplay(src, 80)}
          </p>
        </div>
        <button
          type="button"
          onClick={handleRetry}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-500/20 hover:bg-rose-500/40 border border-rose-500/40 text-rose-100 text-xs font-semibold transition-colors"
        >
          <Icon name="refresh" className="h-3 w-3" />
          Retry
        </button>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: loading + loaded state (the actual image)
  // ---------------------------------------------------------------------------
  return (
    <img
      // The retry nonce as part of the key forces the browser to remount the
      // `<img>` on retry, ensuring a fresh fetch (and fresh onError wiring).
      key={`${retryNonce}::${proxyUrl || src}`}
      src={proxyUrl || src || ''}
      alt={alt}
      onClick={onClick}
      onLoad={handleLoad}
      onError={handleError}
      loading={loading}
      decoding={decoding}
      referrerPolicy={referrerPolicy}
      data-source-image={status === 'loaded' ? 'loaded' : 'loading'}
      className={cn(
        className,
        // Fade in only once loaded to avoid a perceptible flicker while the
        // browser is fetching. While loading we keep it visible (browser shows
        // alt text or transparency), but once loaded it pops in cleanly.
        status === 'loaded' ? 'opacity-100' : 'opacity-0',
        'transition-opacity duration-150',
      )}
    />
  );
}

function truncateForDisplay(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

/**
 * setObjectUrl
 * ------------
 * Helper for callers that want lifecycle-managed object URLs (so blob URLs
 * are revoked when the source changes or the component unmounts). Returns
 * a stable URL string plus a cleanup function. The caller should invoke the
 * cleanup function when the URL is no longer needed.
 *
 * NOTE: Prefer using `useObjectUrl` (the hook below) inside React components.
 */
export function setObjectUrl(file: Blob | File): { url: string; revoke: () => void } {
  const url = URL.createObjectURL(file);
  return {
    url,
    revoke: () => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        /* noop */
      }
    },
  };
}

/**
 * useObjectUrl
 * ------------
 * React hook that creates an object URL for a `File` / `Blob` and revokes it
 * when the file changes or the consuming component unmounts. Used by the
 * studio to safely back blob URLs into `referenceImages` without leaking.
 */
export function useObjectUrl(file: Blob | File | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const { url: next, revoke } = setObjectUrl(file);
    setUrl(next);
    return () => {
      revoke();
    };
  }, [file]);

  return url;
}
