"use client";

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { ArrowLeft, Eye, EyeOff, Lock, Mail, Sparkles } from 'lucide-react';
import {
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail,
  signInWithRedirect,
  signInWithCustomToken,
  getRedirectResult,
  onAuthStateChanged,
} from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { useAuth } from '@/firebase';
import { Button } from '@/components/ui/button';
import { ContourGlassButton } from '@/components/ui/ContourGlassButton';
import { Input } from '@/components/ui/input';
import { Icon } from '@/components/ui/icon';
import { SvgIsometricWaveBackdrop } from '@/components/ui/SvgIsometricWaveBackdrop';
import { isDesktopApp, openExternalUrl } from '@/lib/desktop/desktop-bridge';
import { cn } from '@/lib/utils';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [waitingForBrowser, setWaitingForBrowser] = useState(false);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const auth = useAuth();
  const [mounted, setMounted] = useState(false);

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

  useEffect(() => {
    setMounted(true);
  }, []);

  // Auto-redirect already-authenticated users
  useEffect(() => {
    if (!mounted || !auth) return;
    let handled = false;

    const proceed = (user: { uid: string; email: string | null; displayName: string | null }) => {
      if (handled) return;
      handled = true;
      setLoading(true);
      handleRedirect(user.uid, user.email, user.displayName).catch(() => {
        handled = false;
        setLoading(false);
      });
    };

    getRedirectResult(auth)
      .then((cred) => {
        if (cred?.user) proceed(cred.user);
      })
      .catch((err) => {
        setError(err?.message || 'Sign-in could not be completed. Please try again.');
        setLoading(false);
      });

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) proceed(user);
    });

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, auth]);

  const handleRedirect = async (uid: string, emailStr: string | null, displayName: string | null) => {
    const db = getFirestore();
    const emailLower = (emailStr || '').toLowerCase();

    if (auth?.currentUser) {
      try {
        const idToken = await auth.currentUser.getIdToken();
        await fetch('/api/session/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ idToken }),
        });

        // bootstrap-claim reads the idToken from the Authorization header
        // (not the body). Fire-and-forget is fine — if it fails the user
        // can re-sync later; we don't block the redirect on it.
        fetch('/api/admin/bootstrap-claim', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'authorization': `Bearer ${idToken}`,
          },
        })
          .then((res) => {
            if (res.ok) {
              return auth.currentUser?.getIdToken(true);
            }
          })
          .catch(() => {});
      } catch (e) {
        console.error('Failed to create session cookie:', e);
      }
    }

    const requested = searchParams.get('redirect');
    let safeRedirect =
      requested && requested.startsWith('/') && !requested.startsWith('//')
        ? requested
        : null;

    // If no explicit redirect param was provided in the query string, check if the user arrived from another page on our site
    if (!safeRedirect && typeof window !== 'undefined' && document.referrer) {
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
            safeRedirect = refPath;
          }
        }
      } catch {
        // Ignore parsing errors
      }
    }

    try {
      const userDocRef = doc(db, 'users', uid);
      const userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists()) {
        const userData = userDocSnap.data();
        const role = (userData.role || '').toLowerCase();

        if (safeRedirect) {
          router.push(safeRedirect);
          return;
        }

        if (role === 'admin') {
          router.push('/dashboard');
        } else if (role === 'specialist' || role === 'agent') {
          router.push('/dashboard/specialist');
        } else if (role === 'client') {
          router.push('/dashboard/client');
        } else if (role === 'partner') {
          router.push('/dashboard/partner');
        } else {
          router.push('/dashboard');
        }
      } else {
        const emailDocRef = doc(db, 'users', emailLower);
        const emailDocSnap = await getDoc(emailDocRef);

        if (emailDocSnap.exists()) {
          const userData = emailDocSnap.data();
          const role = (userData.role || '').toLowerCase();

          if (safeRedirect) {
            router.push(safeRedirect);
            return;
          }

          if (role === 'admin') {
            router.push('/dashboard');
          } else if (role === 'specialist' || role === 'agent') {
            router.push('/dashboard/specialist');
          } else if (role === 'client') {
            router.push('/dashboard/client');
          } else if (role === 'partner') {
            router.push('/dashboard/partner');
          } else {
            router.push('/dashboard');
          }
        } else {
          const rolePickerHref = `/onboarding/role${
            safeRedirect ? `?redirect=${encodeURIComponent(safeRedirect)}` : ''
          }`;
          router.push(rolePickerHref);
        }
      }
    } catch {
      router.push(safeRedirect || '/dashboard');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth) {
      setError('Authentication is currently initializing. Please try again.');
      return;
    }
    setLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      await handleRedirect(
        userCredential.user.uid,
        userCredential.user.email,
        userCredential.user.displayName
      );
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      const friendlyMessages: Record<string, string> = {
        'auth/invalid-email': 'Please enter a valid email address.',
        'auth/user-not-found': 'No account found with this email address.',
        'auth/wrong-password': 'Incorrect password. Please try again.',
        'auth/invalid-credential': 'Invalid email or password. Please verify your credentials.',
        'auth/too-many-requests': 'Too many unsuccessful attempts. Please try again shortly.',
        'auth/user-disabled': 'This account has been disabled. Please contact support.',
      };

      setError(
        friendlyMessages[code] || (err instanceof Error ? err.message : 'Sign-in failed. Please check your credentials.')
      );
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (!auth) {
      setError('Authentication is currently initializing. Please try again.');
      return;
    }
    setLoading(true);
    setError('');

    // Native desktop: `signInWithPopup` relies on window.opener/postMessage,
    // which the WebView2 shell doesn't provide, and the old loopback bridge
    // invoked Rust commands that don't exist in src-tauri. Instead open
    // /desktop-auth in the user's real system browser and poll
    // /api/desktop-pairing/status until the browser-side sign-in relays a
    // custom token — the same pairing flow /register uses.
    if (isDesktopApp()) {
      setWaitingForBrowser(true);

      const pairingId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `pg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

      const opened = await openExternalUrl(`https://www.cybrdeck.com/desktop-auth?pairing=${pairingId}`);
      if (!opened) {
        setWaitingForBrowser(false);
        setError('Could not open your external browser.');
        setLoading(false);
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
            const userCredential = await signInWithCustomToken(auth, data.customToken);
            setWaitingForBrowser(false);
            await handleRedirect(
              userCredential.user.uid,
              userCredential.user.email,
              userCredential.user.displayName
            );
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
      return;
    }

    const provider = new GoogleAuthProvider();
    provider.addScope('email');
    provider.addScope('profile');
    provider.setCustomParameters({ prompt: 'select_account' });

    try {
      const result = await signInWithPopup(auth, provider);
      await handleRedirect(result.user.uid, result.user.email, result.user.displayName);
    } catch (popupErr: unknown) {
      const code = (popupErr as { code?: string })?.code || '';
      const message = (popupErr as { message?: string })?.message || '';

      if (code === 'auth/popup-blocked' || code === 'auth/cancelled-popup-request') {
        try {
          await signInWithRedirect(auth, provider);
          return;
        } catch (redirectErr: unknown) {
          setError(
            (redirectErr as Error)?.message || 'Redirect sign-in failed. Please check browser settings.'
          );
          setLoading(false);
          return;
        }
      }

      if (code === 'auth/popup-closed-by-user') {
        setLoading(false);
        return;
      }

      setError(message || 'Google authentication could not be completed.');
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!auth) return;
    if (!email) {
      setError('Please enter your email address above to reset your password.');
      return;
    }
    try {
      setLoading(true);
      setError('');
      setSuccessMsg('');
      await sendPasswordResetEmail(auth, email);
      setSuccessMsg('Password reset instructions have been sent to your email.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send reset email.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-dvh w-full flex items-center justify-center p-4 sm:p-6 overflow-hidden bg-[#01040c]">
      {/* Interactive 2.5D Isometric Wave Surface Backdrop */}
      <SvgIsometricWaveBackdrop />

      {/* Top Navigation Bar */}
      <div className="absolute top-6 left-6 z-30">
        <ContourGlassButton
          effect="rim"
          asChild
          size="sm"
          patternSeed={0}
        >
          <Link href="/">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Cybrdeck</span>
          </Link>
        </ContourGlassButton>
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

        {/* Ambient Top Subtle Glow */}
        <div className="pointer-events-none absolute -top-12 left-1/2 -translate-x-1/2 w-48 h-24 bg-brand-400/[0.08] rounded-full blur-2xl" />

        {/* Card Header & Brand Lockup */}
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
            <h1 className="text-xl font-semibold text-white tracking-tight">Sign In to Cybrdeck</h1>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
              Access your multi-model workspace, tools, and roster.
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
              or continue with email
            </span>
          </div>

          {/* Email / Password Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-300">Email address</label>
              <div className="relative">
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
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-medium text-zinc-300">Password</label>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-xs text-brand-400 hover:text-brand-300 transition-colors font-medium"
                >
                  Forgot password?
                </button>
              </div>
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

            {/* Error / Success Feedback */}
            {error && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 text-center leading-relaxed">
                {error}
              </div>
            )}
            {successMsg && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 text-center leading-relaxed">
                {successMsg}
              </div>
            )}

            {/* Primary Sign In Button */}
            <ContourGlassButton
              effect="rim"
              type="submit"
              disabled={loading}
              size="lg"
              patternSeed={2}
              className="w-full"
            >
              {loading ? <Icon name="loading" className="h-4 w-4 animate-spin text-current" /> : <span>Sign In</span>}
            </ContourGlassButton>
          </form>
        </div>

        {/* Secondary Routing (Anti-Slop Clean Editorial Links) */}
        <div className="relative z-20 pt-6 mt-6 border-t border-white/10 space-y-3 text-center">
          <p className="text-xs text-zinc-400">
            Don&apos;t have an account?{' '}
            <Link
              href="/register"
              className="text-brand-400 hover:text-brand-300 font-semibold transition-colors underline-offset-4 hover:underline"
            >
              Create an account
            </Link>
          </p>

          <p className="text-xs text-zinc-500">
            Looking to join our network?{' '}
            <Link
              href="/initialize-specialist"
              className="text-zinc-300 hover:text-white transition-colors underline-offset-4 hover:underline"
            >
              Apply as a specialist
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  </div>
  );
}
