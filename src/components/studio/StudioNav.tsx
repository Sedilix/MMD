'use client';

import React from 'react';
// Video / Music / Presentation have no coolicons equivalent (it is a
// general UI set with no media glyphs), so `tabs` stores each icon as a
// render function. That lets one table mix both libraries while still
// receiving the caller's state-dependent className, which a shared
// ComponentType field could not.
import { Video, Music, Presentation } from 'lucide-react';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { OneStatusBadge } from '@/components/one/OneStatusBadge';
import Link from 'next/link';

export type StudioTab = 'image' | 'video' | 'audio' | 'design' | 'presentation' | 'skills';

interface StudioNavProps {
  activeTab: StudioTab | null;
  onTabChange: (tab: StudioTab | null) => void;
  isGuest?: boolean;
  tierLabel?: string;
  /** Signed-in only. Omitted when the quota has not loaded yet. */
  creditsUsed?: number;
  creditsLimit?: number;
  /**
   * Guests do not have credits — they get a fixed pool of prompts and image
   * generations per 72h window. Passing the real snapshot lets the bar show
   * what they actually have left instead of a credits meter that does not
   * apply to them.
   */
  guestQuota?: {
    requestsUsed: number;
    requestsLimit: number;
    imageUsed?: number;
    imageLimit?: number;
  } | null;
  onSignUp?: () => void;
  user?: {
    photoURL?: string | null;
    displayName?: string | null;
  } | null;
  initials?: string;
  isDesktop?: boolean;
}

/**
 * Studio navigation — one horizontal bar at every breakpoint.
 *
 * This replaces a split layout that rendered a scrolling pill bar on mobile
 * and a 236px fixed sidebar on desktop. The sidebar cost a vertical column
 * that the studios need: Design Canvas already renders its own 256px left
 * panel and 288px properties rail, so the studio sidebar was a *third*
 * chrome column eating roughly a quarter of a 1440px viewport.
 *
 * All seven destinations fit horizontally without scrolling on a desktop
 * width, so `overflow-x-auto` only engages on narrow viewports — the same
 * behaviour mobile already had.
 *
 * The sidebar's collapse toggle (and the `localStorage` that persisted it)
 * is gone with it: a horizontal bar has nothing to collapse. That leaves
 * the playground with one nav persistence mechanism (`sessionStorage` for
 * the active tab) instead of two that disagreed about scope.
 */
export function StudioNav({
  activeTab,
  onTabChange,
  isGuest,
  tierLabel,
  creditsUsed,
  creditsLimit,
  guestQuota,
  onSignUp,
  user,
  initials,
  isDesktop,
}: StudioNavProps) {
  // The old sidebar defaulted a guest to `1735` of `2000` credits used. That
  // number was invented: the caller passes `undefined` for guests precisely
  // because guests have no credit balance to report, and the fallback filled
  // the gap with a plausible-looking figure. Guests get prompts and images,
  // not credits, so they now see those — and anything we genuinely do not
  // know renders as nothing rather than as a number.
  const tier = tierLabel?.trim() || 'Free';

  const hasCredits =
    !isGuest && typeof creditsUsed === 'number' && typeof creditsLimit === 'number' && creditsLimit > 0;
  const creditsRemaining = hasCredits ? Math.max(0, creditsLimit! - creditsUsed!) : 0;
  const creditsPct = hasCredits
    ? Math.max(0, Math.min(100, (creditsRemaining / creditsLimit!) * 100))
    : 0;

  const promptsLeft = guestQuota
    ? Math.max(0, guestQuota.requestsLimit - guestQuota.requestsUsed)
    : null;
  const imagesLeft =
    guestQuota && typeof guestQuota.imageLimit === 'number' && typeof guestQuota.imageUsed === 'number'
      ? Math.max(0, guestQuota.imageLimit - guestQuota.imageUsed)
      : null;
  const showGuestQuota = Boolean(isGuest && guestQuota && promptsLeft !== null);

  const tabs = [
    { id: 'image', label: 'Image Studio', short: 'Image', icon: (c: string) => <Icon name="image" className={c} />, color: 'text-sky-400', guestLocked: false },
    { id: 'video', label: 'Video Studio', short: 'Video', icon: (c: string) => <Video className={c} />, color: 'text-purple-400', guestLocked: true },
    { id: 'audio', label: 'Audio & Music', short: 'Audio', icon: (c: string) => <Music className={c} />, color: 'text-emerald-400', guestLocked: true },
    { id: 'design', label: 'Design Canvas', short: 'Design', icon: (c: string) => <Icon name="swatches-palette" className={c} />, color: 'text-pink-400', guestLocked: true },
    { id: 'presentation', label: 'Presentation Builder', short: 'Slides', icon: (c: string) => <Presentation className={c} />, color: 'text-amber-400', guestLocked: true },
    { id: 'skills', label: 'Skills Manager', short: 'Skills', icon: (c: string) => <Icon name="code" className={c} />, color: 'text-rose-400', guestLocked: false }
  ] as const;

  // `from=playground` lets the subscriptions page offer a way back to the
// studio the user was in, rather than dropping them on the marketing home.
const SUBSCRIBE_HREF = '/subscriptions?from=playground';

const pillBase =
    'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 transition-all active:scale-95';

  return (
    <nav
      aria-label="Studio"
      className="flex items-center h-12 w-full gap-2 px-2 bg-zinc-950/90 border-b border-white/10 shrink-0 z-30 select-none"
    >
      {/* Destinations — scrolls only when the viewport is too narrow to hold
          all seven, which on desktop it never is. */}
      <div className="flex flex-1 min-w-0 items-center gap-1.5 overflow-x-auto scrollbar-none py-1.5">
        <button
          type="button"
          onClick={() => onTabChange(null)}
          aria-current={activeTab === null ? 'true' : undefined}
          className={cn(
            pillBase,
            activeTab === null
              ? 'bg-primary text-black font-bold shadow-md shadow-primary/20'
              : 'bg-zinc-900 border border-white/15 text-zinc-300 hover:border-white/30',
          )}
        >
          <Icon name="message" className="h-3.5 w-3.5" />
          <span>Chat</span>
        </button>

        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const isLocked = Boolean(isGuest && tab.guestLocked);
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                if (isLocked) {
                  if (onSignUp) onSignUp();
                  return;
                }
                onTabChange(tab.id);
              }}
              aria-current={isActive ? 'true' : undefined}
              aria-label={isLocked ? `${tab.label} — sign up for access` : tab.label}
              title={isLocked ? `${tab.label} (Sign up for full access)` : tab.label}
              className={cn(
                pillBase,
                'relative',
                isLocked
                  ? 'bg-zinc-900/60 text-zinc-500 opacity-60 border border-white/10'
                  : isActive
                  ? 'bg-primary text-black font-bold shadow-md shadow-primary/20'
                  : 'bg-zinc-900 border border-white/15 text-zinc-300 hover:border-white/30',
              )}
            >
              {tab.icon(cn(
                'h-3.5 w-3.5',
                isLocked ? 'text-zinc-500' : isActive ? 'text-black' : tab.color,
              ))}
              <span>{tab.short}</span>
              {isLocked && <Icon name="lock" className="h-2.5 w-2.5 text-amber-400 shrink-0" aria-hidden />}
            </button>
          );
        })}
      </div>

      {/* Account state — pinned, never scrolls away with the pills. Hidden on
          the narrowest viewports, which is where the pills need the whole
          bar; mobile never showed this to begin with, so nothing that was
          previously visible is lost. */}
      <div className="hidden sm:flex items-center gap-2 shrink-0 pl-2 border-l border-white/10">
        {isDesktop && (
          <div className="mr-0.5">
            <OneStatusBadge />
          </div>
        )}

        {showGuestQuota && (
          <div
            className="flex items-center gap-2 rounded-full border border-white/10 bg-zinc-900/80 px-2.5 py-1"
            title={`Guest allowance: ${promptsLeft} prompt${promptsLeft === 1 ? '' : 's'}${
              imagesLeft !== null ? ` and ${imagesLeft} image generation${imagesLeft === 1 ? '' : 's'}` : ''
            } left in this 72-hour window. Sign up for a full credit balance.`}
          >
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" aria-hidden />
            <span className="text-[10px] font-semibold font-mono text-white">Guest</span>
            <span className="text-[10px] font-mono text-zinc-400 tabular-nums">
              {promptsLeft} {promptsLeft === 1 ? 'prompt' : 'prompts'}
              {imagesLeft !== null && (
                <span className="text-zinc-600">
                  {' · '}{imagesLeft} {imagesLeft === 1 ? 'image' : 'images'}
                </span>
              )}
            </span>
          </div>
        )}

        {hasCredits && (
          <div
            className="flex items-center gap-2 rounded-full border border-white/10 bg-zinc-900/80 px-2.5 py-1"
            title={`${tier}: ${creditsRemaining.toLocaleString()} of ${creditsLimit!.toLocaleString()} credits remaining`}
          >
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary shrink-0" aria-hidden />
            <span className="text-[10px] font-semibold font-mono text-white">{tier}</span>
            <span className="text-[10px] font-mono text-zinc-400 tabular-nums">
              {creditsRemaining.toLocaleString()}
              <span className="text-zinc-600">/{creditsLimit!.toLocaleString()}</span>
            </span>
            <span className="hidden lg:block h-1 w-10 rounded-full bg-white/10 overflow-hidden shrink-0" aria-hidden>
              <span
                className="block h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${creditsPct}%` }}
              />
            </span>
          </div>
        )}

        <Button
          asChild
          size="sm"
          className="h-7 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white text-[11px] font-medium shadow-sm transition-all shrink-0"
        >
          {/* A guest is not subscribing yet — registering is the step in front
              of them, and it is what lifts the prompt/image caps. This used to
              point at `/login?...&mode=signup`, but /login is sign-in only and
              never read `mode`, so a guest with no account landed on a form
              they could not complete. /register carries the destination
              through the role picker to the subscriptions page, and `from`
              gives that page a way back here. */}
          <Link href={isGuest ? `/register?redirect=${encodeURIComponent(SUBSCRIBE_HREF)}` : SUBSCRIBE_HREF}>
            {isGuest ? 'Sign up' : 'Subscribe'}
          </Link>
        </Button>

        {user && (
          <Avatar className="h-7 w-7 border border-border/80 shadow-sm flex-shrink-0 ml-0.5">
            {user.photoURL && (
              <AvatarImage src={user.photoURL} alt={user.displayName ?? 'User avatar'} />
            )}
            <AvatarFallback className="text-[9px] font-mono font-bold bg-zinc-800 text-zinc-300">
              {initials ?? 'U'}
            </AvatarFallback>
          </Avatar>
        )}
      </div>

    </nav>
  );
}
