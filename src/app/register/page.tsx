"use client";

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signInWithCustomToken,
  getRedirectResult,
} from 'firebase/auth';
import { useAuth } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Icon } from '@/components/ui/icon';
import { SvgIsometricWaveBackdrop } from '@/components/ui/SvgIsometricWaveBackdrop';
import { isDesktopApp, openExternalUrl } from '@/lib/desktop/desktop-bridge';
import { cn } from '@/lib/utils';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [consent, setConsent] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  const auth = useAuth();
  const [mounted, setMounted] = useState(false);
  const [waitingForBrowser, setWaitingForBrowser] = useState(false);

  // Card cursor tracking for dynamic specular glare
  const cardRef = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const [isCardHovered, setIsCardHovered] = useState(false);

  const springConfig = { damping: 25, stiffness: 260 };
  const glareX = useSpring(useTransform(mouseX, (val) => (val + 1) * 50), springConfig);
  const glareY = useSpring(useTransform(mouseY, (val) => (val + 1) * 50), springConfig);
  const glareOpacity = useSpring(isCardHovered ? 0.6 : 0, { damping: 20, stiffness: 200 });

  const handleCardMouseMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    mouseX.set(x);
    mouseY.set(y);
  };

  const rawRedirect = searchParams.get('redirect');
  let effectiveRedirect =
    rawRedirect && rawRedirect.startsWith('/') && !rawRedirect.startsWith('//')
      ? rawRedirect
      : null;

  if (!effectiveRedirect && typeof window !== 'undefined' && document.referrer) {
    try {
      const refUrl = new URL(document.referrer);
      if (refUrl.origin === window.location.origin) {
        const refPath = refUrl.pathname + refUrl.search;
        if (
          refPath.startsWith('/') &&
          !refPath.startsWith('//') &&
          !refPath.startsWith('/login') &&
          !refPath.startsWith('/register') &&
          !refPath.startsWith('/rag')
        ) {
          effectiveRedirect = refPath;
        }
      }
    } catch {
      // Ignore URL parsing errors
    }
  }

  const postRoleRedirect = effectiveRedirect || '/';
  const rolePickerHref = `/onboarding/role?redirect=${encodeURIComponent(postRoleRedirect)}`;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !auth) return;
    getRedirectResult(auth)
      .then((cred) => {
        if (cred?.user) router.push(rolePickerHref);
      })
      .catch((err) => {
        setError(err?.message || 'Sign-up could not be completed. Please try again.');
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, auth]);

  const checkBlacklistAndProceed = async (user: { email: string | null }) => {
    const emailLower = (user.email || '').toLowerCase();
    const { getFirestore, doc: fDoc, getDoc: fGetDoc } = await import('firebase/firestore');
    const db = getFirestore();
    const blacklistDocRef = fDoc(db, 'blacklist', emailLower);
    const blacklistDoc = await fGetDoc(blacklistDocRef);
    if (blacklistDoc.exists()) {
      const { signOut } = await import('firebase/auth');
      if (auth) await signOut(auth);
      setError('Security Restriction: This email is permanently restricted.');
      setLoading(false);
      return;
    }
    router.push(rolePickerHref);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth) return;
    if (!consent) {
      setError('Please accept the Terms of Service and Privacy Policy.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { getFirestore, doc: fDoc, getDoc: fGetDoc } = await import('firebase/firestore');
      const db = getFirestore();
      const emailLower = email.trim().toLowerCase();
      const blacklistDocRef = fDoc(db, 'blacklist', emailLower);
      const blacklistDoc = await fGetDoc(blacklistDocRef);
      if (blacklistDoc.exists()) {
        setError('Security Restriction: This email is permanently restricted.');
        setLoading(false);
        return;
      }

      await createUserWithEmailAndPassword(auth, email, password);
      router.push(rolePickerHref);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      const friendlyMessages: Record<string, string> = {
        'auth/email-already-in-use': 'An account already exists with this email address. Please sign in instead.',
        'auth/invalid-email': 'Please enter a valid email address.',
        'auth/weak-password': 'Password is too weak. Please use at least 8 characters.',
      };
      setError(friendlyMessages[code] || (err instanceof Error ? err.message : 'Registration could not be completed.'));
      setLoading(false);
    }
  };

  const handleDesktopGoogleSignIn = async () => {
    if (!auth) return;
    setLoading(true);
    setWaitingForBrowser(true);
    setError('');

    const pairingId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `pg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

    const opened = await openExternalUrl(`https://www.cybrdeck.com/desktop-auth?pairing=${pairingId}`);
    if (!opened) {
      setWaitingForBrowser(false);
      setLoading(false);
      setError('Could not open your external browser.');
      return;
    }

    const POLL_INTERVAL_MS = 2000;
    const TIMEOUT_MS = 5 * 60 * 1000;
    const startedAt = Date.now();

    while (Date.now() - startedAt < TIMEOUT_MS) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      try {
        const res = await fetch(`/api/desktop-pairing/status?pairing=${pairingId}`);
        const data = await res.json();
        if (data.ready && data.customToken) {
          const cred = await signInWithCustomToken(auth, data.customToken);
          setWaitingForBrowser(false);
          await checkBlacklistAndProceed(cred.user);
          return;
        }
        if (data.expired) break;
      } catch {
        // Continue polling
      }
    }

    setWaitingForBrowser(false);
    setLoading(false);
    setError('Sign-in timed out. Please try again.');
  };

  const handleGoogleSignIn = async () => {
    if (!auth) return;
    if (isDesktopApp()) {
      await handleDesktopGoogleSignIn();
      return;
    }
    setLoading(true);
    setError('');
    const provider = new GoogleAuthProvider();
    provider.addScope('email');
    provider.addScope('profile');
    provider.setCustomParameters({ prompt: 'select_account' });

    try {
      const userCredential = await signInWithPopup(auth, provider);
      await checkBlacklistAndProceed(userCredential.user);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/popup-blocked') {
        try {
          await signInWithRedirect(auth, provider);
        } catch (redirectErr: unknown) {
          setError((redirectErr as Error)?.message || 'Redirect sign-up failed.');
          setLoading(false);
        }
      } else {
        setError((err as Error)?.message || 'Google authentication failed.');
        setLoading(false);
      }
    }
  };

  return (
    <div className="relative min-h-dvh w-full flex items-center justify-center p-4 sm:p-6 overflow-hidden bg-[#01040c]">
      {/* Interactive 2.5D Isometric Wave Surface Backdrop */}
      <SvgIsometricWaveBackdrop />

      {/* Top Navigation Bar */}
      <div className="absolute top-6 left-6 z-30">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-medium text-zinc-400 hover:text-white transition-colors py-2 px-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 backdrop-blur-md"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Return to Cybrdeck</span>
        </Link>
      </div>

      {/* Central Obsidian Glassmorphic Auth Card Container with Backlight Halo */}
      <div className="relative z-20 w-full max-w-[420px]">
        {/* Soft Volumetric Halos Behind Card */}
        <div className="pointer-events-none absolute -inset-3 rounded-[36px] bg-gradient-to-tr from-brand-500/25 via-blue-500/15 to-amber-500/15 blur-2xl opacity-75 -z-10" />
        <div className="pointer-events-none absolute -top-16 left-1/2 -translate-x-1/2 w-64 h-32 bg-brand-400/20 rounded-full blur-3xl -z-10" />

        <motion.div
          ref={cardRef}
          onPointerMove={handleCardMouseMove}
          onPointerEnter={() => setIsCardHovered(true)}
          onPointerLeave={() => setIsCardHovered(false)}
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className={cn(
            'relative w-full rounded-3xl p-7 sm:p-8',
            'backdrop-blur-2xl bg-[#020912]/85 border border-white/[0.14]',
            'shadow-[0_32px_100px_-20px_rgba(0,0,0,0.95),inset_0_1px_0_0_rgba(255,255,255,0.22)]',
            'overflow-hidden'
          )}
        >
        {/* Specular glare sheen */}
        <motion.div
          className="pointer-events-none absolute -inset-px rounded-3xl z-10 transition-opacity duration-300"
          style={{
            opacity: glareOpacity,
            background: useTransform(
              [glareX, glareY],
              ([gx, gy]) =>
                `radial-gradient(circle 260px at ${gx}% ${gy}%, rgba(255,255,255,0.14), transparent 70%)`
            ),
          }}
        />

        {/* Ambient Top Glow */}
        <div className="pointer-events-none absolute -top-12 left-1/2 -translate-x-1/2 w-48 h-24 bg-brand-400/[0.08] rounded-full blur-2xl" />

        {/* Header Lockup */}
        <div className="relative z-20 text-center space-y-3 mb-6">
          <div className="flex justify-center mb-1">
            <Image
              src="/cybrdeck-logo/cybrdeck_logo_cropped_white.png"
              alt="Cybrdeck"
              width={160}
              height={36}
              priority
              className="h-7 w-auto object-contain opacity-95"
            />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white tracking-tight">Create your account</h1>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
              Start building with frontier multi-model intelligence.
            </p>
          </div>
        </div>

        {/* Form Body */}
        <div className="relative z-20 space-y-5">
          {/* Google SSO Button */}
          <Button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            variant="outline"
            className={cn(
              'w-full h-11 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/15',
              'text-sm font-medium text-white transition-all duration-200 active:scale-[0.98]',
              'flex items-center justify-center gap-2.5 shadow-sm'
            )}
          >
            {waitingForBrowser ? (
              <>
                <Icon name="loading" className="h-4 w-4 animate-spin text-brand-400" />
                <span className="text-xs text-zinc-300">Waiting for browser sign-in…</span>
              </>
            ) : loading ? (
              <Icon name="loading" className="h-4 w-4 animate-spin text-brand-400" />
            ) : (
              <>
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                <span>Continue with Google</span>
              </>
            )}
          </Button>

          {/* Understated Divider */}
          <div className="relative flex items-center justify-center py-1">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10" />
            </div>
            <span className="relative bg-[#020912] px-3 text-xs text-zinc-500 font-medium">
              or register with email
            </span>
          </div>

          {/* Form */}
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-300">Email address</label>
              <Input
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={cn(
                  'h-11 rounded-xl bg-white/[0.04] border-white/15 px-3.5 text-sm text-white',
                  'placeholder:text-zinc-500 focus-visible:border-brand-400 focus-visible:ring-1 focus-visible:ring-brand-400/50'
                )}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-300">Password</label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={cn(
                    'h-11 rounded-xl bg-white/[0.04] border-white/15 px-3.5 pr-10 text-sm text-white',
                    'placeholder:text-zinc-500 focus-visible:border-brand-400 focus-visible:ring-1 focus-visible:ring-brand-400/50'
                  )}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 transition-colors p-1"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Consent Checkbox */}
            <div className="flex items-start gap-2.5 pt-1">
              <input
                type="checkbox"
                id="register-consent"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-brand-400 rounded border-white/20 bg-white/5 cursor-pointer"
                required
              />
              <label
                htmlFor="register-consent"
                className="text-xs text-zinc-400 leading-snug cursor-pointer select-none"
              >
                I agree to the{' '}
                <Link href="/terms" target="_blank" className="text-brand-400 hover:underline">
                  Terms of Service
                </Link>{' '}
                and consent to data processing under the{' '}
                <Link href="/privacy" target="_blank" className="text-brand-400 hover:underline">
                  Privacy Policy
                </Link>
                .
              </label>
            </div>

            {/* Feedback */}
            {error && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 text-center leading-relaxed">
                {error}
              </div>
            )}

            {/* Create Account CTA */}
            <Button
              type="submit"
              disabled={loading}
              className={cn(
                'w-full h-11 rounded-xl bg-brand-400 hover:bg-brand-300 text-[#01161d]',
                'text-sm font-semibold transition-all duration-200 shadow-[0_4px_16px_-4px_rgba(216,166,87,0.5)]',
                'active:scale-[0.98] cursor-pointer'
              )}
            >
              {loading ? <Icon name="loading" className="h-4 w-4 animate-spin text-[#01161d]" /> : 'Create Account'}
            </Button>
          </form>
        </div>

        {/* Secondary Routing */}
        <div className="relative z-20 pt-6 mt-6 border-t border-white/10 text-center">
          <p className="text-xs text-zinc-400">
            Already have an account?{' '}
            <Link
              href="/login"
              className="text-brand-400 hover:text-brand-300 font-semibold transition-colors underline-offset-4 hover:underline"
            >
              Sign in
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  </div>
  );
}
