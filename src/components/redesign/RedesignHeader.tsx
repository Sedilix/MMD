'use client';

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Menu,
  X,
  ArrowRight,
  User,
  LogOut,
  LayoutDashboard,
  FileText,
  Calendar,
  Handshake,
  Sparkles,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ContourGlassButton } from '@/components/ui/ContourGlassButton';
import { ProceduralWaveContour } from '@/components/ui/ProceduralWaveContour';
import { ForceWaveCanvas } from '@/components/ui/ForceWaveCanvas';
import { cn } from '@/lib/utils';
import { doc } from 'firebase/firestore';
import { useUser, useFirestore, useDoc } from '@/firebase';

export interface NavItem {
  id: string;
  href: string;
  label: string;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'playground', href: '#playground', label: 'Playground' },
  { id: 'about', href: '#about', label: 'About' },
  { id: 'events', href: '#events', label: 'Events' },
  { id: 'work-with-us', href: '#work-with-us', label: 'Work with Us' },
  { id: 'specialists', href: '#specialists', label: 'Specialists' },
  { id: 'community', href: '/community', label: 'Community' },
];

/** Avatar with graceful fallback — the Cybrdeck-uploaded profile picture
    (users/{uid}.avatarUrl, set during onboarding) overrides the OAuth photo,
    because Google re-logins reset Auth photoURL; if the winning src still
    404s or is blocked, onError swaps to the initials tile so a dead URL
    never renders a broken-image glyph in the navbar. */
function UserAvatar({
  avatarUrl,
  photoURL,
  email,
  className,
}: {
  avatarUrl?: string | null;
  photoURL?: string | null;
  email?: string | null;
  className?: string;
}) {
  const src = avatarUrl || photoURL || null;
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const showImage = Boolean(src) && !failed;
  return (
    <div
      className={cn(
        'shrink-0 overflow-hidden rounded-full border border-white/20 bg-zinc-800',
        className,
      )}
    >
      {showImage ? (
        <img
          src={src!}
          alt="Avatar"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-600 to-blue-700 font-mono text-xs text-white">
          {email?.charAt(0).toUpperCase() || 'U'}
        </div>
      )}
    </div>
  );
}

/**
 * Floating glass navigation with dynamic arc-jumping scrollspy and interactive hamburger menu.
 */
export function RedesignHeader() {
  const { user, loading } = useUser();
  const firestore = useFirestore();
  // Onboarding-uploaded profile picture lives on users/{uid}.avatarUrl and
  // outranks the OAuth photo (Google re-logins reset Auth photoURL).
  const userDocRef = useMemo(
    () => (firestore && user?.uid ? doc(firestore, 'users', user.uid) : null),
    [firestore, user?.uid],
  );
  const { data: userDoc } = useDoc(userDocRef);
  const customAvatarUrl = (userDoc as { avatarUrl?: string } | null)?.avatarUrl || null;

  /**
   * Community is behind AuthGuard, which renders the login screen for anyone
   * signed out. That is a dead end for a visitor with no account, so the nav
   * sends them to registration instead, carrying the hub as the redirect. The
   * register page hands that through to /onboarding/role, which returns them to
   * the hub once a role is set.
   *
   * Only diverts once auth has actually resolved. While `loading` is still true
   * `user` is null but unknown, and defaulting to register in that window would
   * show the sign-up form to someone who already has an account.
   */
  const resolveNavHref = (item: NavItem) => {
    if (item.id !== 'community') return item.href;
    return !loading && !user
      ? `/register?redirect=${encodeURIComponent('/community')}`
      : '/community';
  };
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState<string>('');

  const navRef = useRef<HTMLElement>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Record<string, HTMLAnchorElement | null>>({});

  const [dotState, setDotState] = useState<{
    x: number;
    prevX: number;
    visible: boolean;
    isJumping: boolean;
    jumpCount: number;
  }>({
    x: 0,
    prevX: 0,
    visible: false,
    isJumping: false,
    jumpCount: 0,
  });

  const updateDotPosition = useCallback((targetId: string, triggerJump = true) => {
    const nav = navRef.current;
    const targetEl = itemRefs.current[targetId];

    if (!nav || !targetEl) {
      setDotState((prev) => ({ ...prev, visible: false }));
      return;
    }

    const navRect = nav.getBoundingClientRect();
    const targetRect = targetEl.getBoundingClientRect();
    const targetX = targetRect.left - navRect.left + 4;

    setDotState((prev) => {
      if (!prev.visible) {
        return {
          x: targetX,
          prevX: targetX,
          visible: true,
          isJumping: false,
          jumpCount: prev.jumpCount,
        };
      }

      if (Math.abs(prev.x - targetX) < 2) {
        return prev;
      }

      return {
        x: targetX,
        prevX: prev.x,
        visible: true,
        isJumping: triggerJump,
        jumpCount: prev.jumpCount + 1,
      };
    });
  }, []);

  const handleLogout = async () => {
    try {
      const { getAuth, signOut } = await import('firebase/auth');
      const auth = getAuth();
      await signOut(auth);
      setOpen(false);
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  // Keep a ref so the resize handler inside the effect can read the current
  // active section without re-registering the scroll listener on every change.
  const activeSectionRef = useRef(activeSection);
  useEffect(() => { activeSectionRef.current = activeSection; }, [activeSection]);

  useEffect(() => {
    let ticking = false;

    const computeActiveSection = () => {
      const scrollY = window.scrollY;
      setScrolled(scrollY > 20);

      // Hero zone — when near the top of the page, no section dot is active
      if (scrollY < 180) {
        setActiveSection((prev) => {
          if (prev !== '') {
            setDotState((d) => ({ ...d, visible: false }));
          }
          return '';
        });
        ticking = false;
        return;
      }

      // If scrolled to the bottom of the document, lock to the last anchor section
      const isAtBottom =
        window.innerHeight + scrollY >= document.documentElement.scrollHeight - 60;

      if (isAtBottom) {
        const lastAnchor = [...NAV_ITEMS].reverse().find((i) => i.href.startsWith('#'));
        if (lastAnchor) {
          setActiveSection((prev) => {
            if (prev !== lastAnchor.id) {
              updateDotPosition(lastAnchor.id, true);
            }
            return lastAnchor.id;
          });
          ticking = false;
          return;
        }
      }

      const viewportTop = 80;
      const viewportBottom = window.innerHeight;
      const viewportHeight = viewportBottom - viewportTop;
      const focalY = viewportTop + viewportHeight * 0.38;

      let bestSection = '';
      let maxScore = 0;

      for (const item of NAV_ITEMS) {
        if (!item.href.startsWith('#')) continue;
        const el = document.getElementById(item.id);
        if (!el) continue;

        const rect = el.getBoundingClientRect();
        const visibleTop = Math.max(viewportTop, rect.top);
        const visibleBottom = Math.min(viewportBottom, rect.bottom);
        const visibleHeight = Math.max(0, visibleBottom - visibleTop);

        if (visibleHeight <= 0) continue;

        // Covers user's focal reading area (focalY)
        const coversFocal = rect.top <= focalY && rect.bottom >= focalY;

        // Scoring: dominant weight to covering the focal line, plus visible footprint
        const score = visibleHeight + (coversFocal ? 1200 : 0);

        if (score > maxScore) {
          maxScore = score;
          bestSection = item.id;
        }
      }

      setActiveSection((prev) => {
        if (prev !== bestSection) {
          if (bestSection) {
            updateDotPosition(bestSection, true);
          } else {
            setDotState((d) => ({ ...d, visible: false }));
          }
        }
        return bestSection;
      });

      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(computeActiveSection);
        ticking = true;
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', () => {
      const sec = activeSectionRef.current;
      if (sec) updateDotPosition(sec, false);
    });

    computeActiveSection();

    return () => {
      window.removeEventListener('scroll', onScroll);
    };
  // updateDotPosition is stable (useCallback with [] deps). The effect must
  // NOT depend on activeSection — that caused the scroll listener to be torn
  // down and re-registered on every section change, producing a visible
  // scroll twitch from the listener churn + immediate re-compute cascade.
  }, [updateDotPosition]);

  const scrollToSection = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (!href.startsWith('#')) return;
    if (typeof window !== 'undefined' && window.location.pathname !== '/') {
      e.preventDefault();
      setOpen(false);
      window.location.href = `/${href}`;
      return;
    }
    e.preventDefault();
    setOpen(false);

    const targetId = href.slice(1);
    const target = document.getElementById(targetId);

    if (target) {
      const navOffset = 80;
      const elementPosition = target.getBoundingClientRect().top;
      const offsetPosition = Math.max(0, elementPosition + window.scrollY - navOffset);

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth',
      });
    }
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50">
      <div className="mx-auto w-full max-w-7xl px-3 pt-3 sm:px-5 sm:pt-4 lg:px-8">
        <div
          ref={boxRef}
          className={cn(
            'pointer-events-auto relative overflow-hidden rounded-2xl border transition-[border-color,box-shadow] duration-300',
            'backdrop-blur-2xl backdrop-saturate-150 bg-[#020612]/90',
            scrolled || open
              ? 'border-white/[0.16] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.18),0_16px_48px_rgba(0,0,0,0.95)]'
              : 'border-white/[0.12] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.18),0_12px_44px_-10px_rgba(0,0,0,0.85)]',
          )}
        >
          {/* Collapsed bar: smoke contours the cursor bends. The liquid-glass
              force-wave plane lives only in the opened dash panel. */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-16 overflow-hidden">
            <ProceduralWaveContour opacity={0.42} smoke hostRef={boxRef} />
          </div>
          {open && <ForceWaveCanvas hostRef={boxRef} />}

          <div className="relative z-10 flex h-16 items-center justify-between gap-4 px-4 sm:px-5">
            <div className="flex min-w-0 items-center gap-7">
              <Link
                href="/"
                onClick={(e) => {
                  if (window.location.pathname === '/') {
                    e.preventDefault();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }
                }}
                aria-label="Cybrdeck"
                className="group flex shrink-0 items-center justify-center py-1"
              >
                <Image
                  src="/cybrdeck-logo/cybrdeck_logo_cropped_white.png"
                  alt="Cybrdeck"
                  width={886}
                  height={197}
                  priority
                  className="h-[22px] w-auto opacity-95 transition-opacity group-hover:opacity-100 sm:h-[24px]"
                />
              </Link>

              {/* Desktop Nav Bar with Glowing Indicator */}
              <nav
                ref={navRef}
                className="relative hidden items-center gap-5 text-[13px] font-medium md:flex"
              >
                {dotState.visible &&
                  (() => {
                    const dx = dotState.x - dotState.prevX;
                    const isForward = dx >= 0;
                    const isJumping = dotState.isJumping && Math.abs(dx) > 4 && dotState.jumpCount > 0;

                    const xKeyframes = isJumping
                      ? [
                          dotState.prevX,
                          dotState.prevX,
                          dotState.prevX + dx * 0.26,
                          dotState.prevX + dx * 0.52,
                          dotState.prevX + dx * 0.78,
                          dotState.x,
                          dotState.x,
                          dotState.x,
                          dotState.x,
                        ]
                      : dotState.x;

                    return (
                      <React.Fragment key={`lamp-hop-container-${dotState.jumpCount}`}>
                        <motion.div
                          key={`shadow-${dotState.jumpCount}`}
                          initial={false}
                          animate={{
                            x: xKeyframes,
                            scaleX: isJumping ? [1, 1.7, 0.35, 0.18, 0.35, 1.85, 0.75, 1.1, 1] : 1,
                            scaleY: isJumping ? [1, 1.7, 0.3, 0.12, 0.3, 1.85, 0.75, 1.1, 1] : 1,
                            opacity: isJumping
                              ? [0.5, 0.95, 0.18, 0.08, 0.2, 1.0, 0.3, 0.55, 0.5]
                              : 0.5,
                          }}
                          transition={{
                            duration: 0.7,
                            times: [0, 0.08, 0.26, 0.46, 0.64, 0.76, 0.86, 0.94, 1],
                            ease: 'easeInOut',
                          }}
                          className="pointer-events-none absolute top-1/2 translate-y-1.5 z-10 -ml-[3px]"
                          style={{ width: 6, height: 2 }}
                        >
                          <span className="block h-full w-full rounded-full bg-brand-400/50 blur-[1px]" />
                        </motion.div>

                        <motion.div
                          key={`dot-${dotState.jumpCount}`}
                          initial={false}
                          animate={{
                            x: xKeyframes,
                            y: isJumping ? [0, 3, -18, -36, -22, 2.5, -9, 1.5, 0] : 0,
                            scaleX: isJumping
                              ? [1, 1.5, 0.75, 0.7, 0.8, 1.65, 0.85, 1.05, 1]
                              : 1,
                            scaleY: isJumping
                              ? [1, 0.55, 1.4, 1.5, 1.35, 0.45, 1.25, 0.95, 1]
                              : 1,
                            rotate: isJumping
                              ? isForward
                                ? [0, 35, 22, 0, -25, 6, -3, 0, 0]
                                : [0, -35, -22, 0, 25, -6, 3, 0, 0]
                              : 0,
                            opacity: 1,
                          }}
                          transition={{
                            duration: 0.7,
                            times: [0, 0.08, 0.26, 0.46, 0.64, 0.76, 0.86, 0.94, 1],
                            ease: 'easeInOut',
                          }}
                          className="pointer-events-none absolute top-1/2 -translate-y-1/2 z-20 flex items-center justify-center -ml-[3px]"
                          style={{ width: 6, height: 6 }}
                        >
                          <span className="relative flex h-2 w-2 items-center justify-center">
                            <span className="absolute -inset-2 rounded-full bg-brand-400/35 blur-[5px]" />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white shadow-[0_0_10px_2px_rgba(255,255,255,1),0_0_22px_6px_rgba(216,166,87,0.75)]" />
                          </span>
                        </motion.div>
                      </React.Fragment>
                    );
                  })()}

                {NAV_ITEMS.map((item) => {
                  const isExternal = !item.href.startsWith('#');
                  const isActive = !isExternal && activeSection === item.id;
                  const linkClass = cn(
                    'relative flex items-center pl-3.5 pr-1 py-1 rounded-sm outline-none transition-colors duration-200',
                    'focus-visible:ring-2 focus-visible:ring-brand-400/70 focus-visible:ring-offset-4 focus-visible:ring-offset-transparent',
                    isActive
                      ? 'font-semibold text-white'
                      : 'text-zinc-300/85 hover:text-white',
                  );

                  // Separate-page routes (e.g. /community) use client-side
                  // routing instead of the scrollspy anchor behaviour.
                  if (isExternal) {
                    return (
                      <Link key={item.id} href={resolveNavHref(item)} className={linkClass}>
                        <span>{item.label}</span>
                      </Link>
                    );
                  }

                  return (
                    <a
                      key={item.id}
                      ref={(el) => {
                        itemRefs.current[item.id] = el;
                      }}
                      href={item.href.startsWith('#') ? `/${item.href}` : item.href}
                      onClick={(e) => scrollToSection(e, item.href)}
                      className={linkClass}
                    >
                      <span>{item.label}</span>
                    </a>
                  );
                })}
              </nav>
            </div>

            <div className="flex shrink-0 items-center gap-2.5">
              {/* Speechmatics Startup Program badge. The partner lockup ships
                  as a dark-teal SVG, illegible at navbar scale, so the badge
                  recomposes it: the official ring mark cropped out of the SVG
                  via a mask window, beside crisp HTML type. lg-only — between
                  md and lg the nav row has no room for it. */}
              <div
                title="Speechmatics Startup Program"
                aria-label="Speechmatics Startup Program"
                className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-1 pl-2.5 pr-3 lg:flex"
              >
                <span
                  aria-hidden
                  className="block h-[18px] w-[13px] shrink-0 bg-white/80 [mask-image:url(/partners/speechmatics.svg)] [mask-position:left_top] [mask-repeat:no-repeat] [mask-size:108px_18px]"
                />
                <span className="flex flex-col leading-none">
                  <span className="text-[11px] font-semibold tracking-wide text-white/85">
                    Speechmatics
                  </span>
                  <span className="mt-0.5 text-[8px] font-medium uppercase tracking-[0.16em] text-zinc-400">
                    Startup Program
                  </span>
                </span>
              </div>

              {/* Logged-in Avatar Pill */}
              {!loading && user && (
                <div
                  onClick={() => setOpen((v) => !v)}
                  className="flex items-center gap-2 cursor-pointer p-0.5 rounded-full hover:ring-2 hover:ring-brand-400/50 transition-all select-none"
                  title={user.email || 'Account Menu'}
                >
                  <UserAvatar
                    avatarUrl={customAvatarUrl}
                    photoURL={user.photoURL}
                    email={user.email}
                    className="h-7 w-7 sm:h-8 sm:w-8"
                  />
                </div>
              )}

              {/* Guest CTA */}
              {!loading && !user && (
                <div className="flex items-center gap-2">
                  <Button
                    asChild
                    variant="ghost"
                    size="sm"
                    className="hidden rounded-xl text-xs text-zinc-300 hover:bg-white/10 hover:text-white sm:inline-flex"
                  >
                    <Link href="/login">Sign in</Link>
                  </Button>
                  <ContourGlassButton
                    effect="rim"
                    asChild
                    size="sm"
                    patternSeed={5}
                  >
                    <Link href="/register">
                      <span>Sign Up</span>
                    </Link>
                  </ContourGlassButton>
                </div>
              )}

              {/* Interactive Hamburger Menu Toggle */}
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                aria-controls="redesign-nav-drawer"
                aria-label={open ? 'Close menu' : 'Open menu'}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-zinc-200 border border-white/10 bg-white/[0.04] outline-none transition-colors hover:bg-white/10 hover:border-white/25 hover:text-white focus-visible:ring-2 focus-visible:ring-brand-400/70 cursor-pointer active:scale-95"
              >
                {open ? <X className="h-4.5 w-4.5" /> : <Menu className="h-4.5 w-4.5" />}
              </button>
            </div>
          </div>

          {/* ── Expandable Navigation & Account Drawer ──────────────────── */}
          <div
            id="redesign-nav-drawer"
            className={cn(
              'grid overflow-hidden transition-[grid-template-rows] duration-300 ease-out',
              open ? 'grid-rows-[1fr] border-t border-white/10' : 'grid-rows-[0fr]',
            )}
          >
            <div className="min-h-0">
              <div className="p-5 sm:p-6 space-y-6 max-h-[80vh] overflow-y-auto">
                {/* Logged in User Bar */}
                {user && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-white/10 bg-white/[0.03]">
                    <div className="flex items-center gap-3 min-w-0">
                      <UserAvatar
                        avatarUrl={customAvatarUrl}
                        photoURL={user.photoURL}
                        email={user.email}
                        className="h-9 w-9"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white truncate">
                          {user.displayName || user.email?.split('@')[0] || 'User'}
                        </p>
                        <p className="text-[11px] text-zinc-400 font-mono truncate">{user.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Link
                        href="/dashboard"
                        onClick={() => setOpen(false)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-500/30 bg-brand-500/10 hover:bg-brand-500/20 text-xs font-medium text-brand-300 transition-colors"
                      >
                        <LayoutDashboard className="w-3.5 h-3.5" />
                        <span>Dashboard</span>
                      </Link>
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-red-500/15 hover:border-red-500/30 hover:text-red-400 text-xs font-medium text-zinc-300 transition-colors cursor-pointer"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Sign out</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* 2-Column Navigation Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {/* Col 1: Page Sections */}
                  <div className="space-y-2.5">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-brand-300">
                      Page Sections
                    </span>
                    <div className="flex flex-col space-y-1">
                      {NAV_ITEMS.map((item) => {
                        const isExternal = !item.href.startsWith('#');
                        const isActive = !isExternal && activeSection === item.id;

                        if (isExternal) {
                          return (
                            <Link
                              key={item.id}
                              href={resolveNavHref(item)}
                              onClick={() => setOpen(false)}
                              className="flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors text-zinc-300 hover:bg-white/[0.05] hover:text-white"
                            >
                              <span>{item.label}</span>
                            </Link>
                          );
                        }

                        return (
                          <a
                            key={item.id}
                            href={item.href.startsWith('#') ? `/${item.href}` : item.href}
                            onClick={(e) => scrollToSection(e, item.href)}
                            className={cn(
                              'flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors',
                              isActive
                                ? 'bg-brand-500/15 text-brand-300 font-semibold'
                                : 'text-zinc-300 hover:bg-white/[0.05] hover:text-white'
                            )}
                          >
                            <span>{item.label}</span>
                            {isActive && <span className="h-1.5 w-1.5 rounded-full bg-brand-400 animate-pulse" />}
                          </a>
                        );
                      })}
                    </div>
                  </div>

                  {/* Col 2: Services & Network */}
                  <div className="space-y-2.5">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-brand-300">
                      Client Services &amp; Network
                    </span>
                    <div className="flex flex-col space-y-1 text-xs">
                      <Link
                        href="/playground"
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-zinc-300 hover:bg-white/[0.05] hover:text-white transition-colors"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-brand-400" />
                        <span>AI Playground</span>
                      </Link>
                      <Link
                        href="/proposal-form"
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-zinc-300 hover:bg-white/[0.05] hover:text-white transition-colors"
                      >
                        <FileText className="w-3.5 h-3.5 text-brand-400" />
                        <span>Project Proposal</span>
                      </Link>
                      <Link
                        href="/events"
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-zinc-300 hover:bg-white/[0.05] hover:text-white transition-colors"
                      >
                        <Calendar className="w-3.5 h-3.5 text-brand-400" />
                        <span>Events (Monthly Shuffle)</span>
                      </Link>
                      <Link
                        href="/partners"
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-zinc-300 hover:bg-white/[0.05] hover:text-white transition-colors"
                      >
                        <Handshake className="w-3.5 h-3.5 text-brand-400" />
                        <span>Partner Network</span>
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
