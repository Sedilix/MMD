'use client';

/**
 * Google sign-in for the desktop app, completed in the user's system
 * browser rather than the app's embedded webview.
 *
 * `signInWithPopup` depends on `window.opener`/postMessage to relay the
 * result from the popup back to the page that opened it. A window Tauri
 * spawns for `window.open()` does not wire that up like a real browser
 * does, so inside the desktop app the popup can visually complete Google
 * sign-in while the app never learns it happened — no error, it just
 * silently doesn't work. This page runs the same `signInWithPopup` call
 * in a real browser tab, where it works normally, then hands the result
 * back to the desktop app through `/api/desktop-pairing/complete`, which
 * the app is polling via `/api/desktop-pairing/status`.
 *
 * Reached by the desktop app opening this URL with `?pairing=<id>` — see
 * `handleGoogleSignIn` in `src/app/login/page.tsx`.
 */

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { useAuth } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import Image from 'next/image';

type Step = 'idle' | 'signing-in' | 'done' | 'error';

export default function DesktopAuthPage() {
  const auth = useAuth();
  const searchParams = useSearchParams();
  const pairingId = searchParams.get('pairing');
  const [step, setStep] = useState<Step>('idle');
  const [error, setError] = useState('');

  const handleSignIn = async () => {
    if (!auth || !pairingId) return;
    setStep('signing-in');
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const idToken = await result.user.getIdToken();

      const res = await fetch('/api/desktop-pairing/complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pairingId, idToken }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Could not complete sign-in.');
      }
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.');
      setStep('error');
    }
  };

  if (!pairingId) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-6 bg-black text-white">
        <p className="text-sm text-zinc-400">This page is opened from the Playground desktop app.</p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex items-center justify-center p-6 bg-black text-white">
      <div className="w-full max-w-sm text-center space-y-6">
        <Image
          src="/cybrdeck-logo/cybrdeck_logo_cropped_white.png"
          alt="Cybrdeck"
          width={280}
          height={56}
          className="h-8 w-auto object-contain mx-auto"
          priority
        />

        {step === 'done' ? (
          <div className="space-y-2">
            <Icon name="circle-check" className="w-8 h-8 text-emerald-400 mx-auto" />
            <p className="text-sm font-medium">Signed in.</p>
            <p className="text-xs text-zinc-400">You can close this tab and return to the Playground desktop app.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-zinc-400">Sign in to connect Playground Desktop to your account.</p>
            <Button
              onClick={handleSignIn}
              variant="outline"
              className="w-full h-12 border-white/20 text-white hover:bg-white/5 gap-2"
              disabled={step === 'signing-in'}
            >
              {step === 'signing-in' ? (
                <Icon name="loading" className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <svg className="h-4 w-4" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Continue with Google
                </>
              )}
            </Button>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
