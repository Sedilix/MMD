'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Calendar, ArrowRight } from 'lucide-react';
import { ContourGlassButton } from '@/components/ui/ContourGlassButton';
import { EventImageItem } from '@/app/api/event-images/route';
import { cn } from '@/lib/utils';

// The photo wall pulls in three.js, which is by far the heaviest thing this
// section touches. Loading it statically means every landing-page visitor pays
// for the WebGL runtime during first paint, including the ones who never scroll
// this far. Code-split it, with a fallback holding the layout ground colour so
// the section does not shift when it arrives. WebGL has no server rendering to
// offer, hence ssr: false.
const JellyEventCarousel = dynamic(
  () => import('@/components/ui/JellyEventCarousel').then(m => m.JellyEventCarousel),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full min-h-[360px] rounded-2xl bg-[#01040c]" aria-hidden="true" />
    ),
  }
);

// The panel's optical glass: the encased poster and the dispersion rim, drawn
// in one WebGL surface. Split for the same reason the photo wall is, and with
// no loading fallback on purpose — the CSS rim and the plain poster underneath
// already are the fallback, and they stay put until this reports itself live.
const SpectralGlassCanvas = dynamic(
  () => import('@/components/ui/SpectralGlassCanvas').then(m => m.SpectralGlassCanvas),
  { ssr: false }
);

interface LumaEventSummary {
  id: string;
  title: string;
  date: string;
  time?: string;
  location?: string;
  description?: string;
  status?: 'upcoming' | 'past' | 'completed';
  url?: string;
  startAt?: string | null;
  endAt?: string | null;
  timeZone?: string;
  /** Poster. Luma CDN URLs arrive proxied through /api/luma/image. */
  image?: string;
}

/**
 * The API's `time` is the start only. Luma carries an end time as well, and the
 * posters quote a range ("3-5PM"), so the card should not read as if the event
 * were instantaneous.
 */
function formatEventTimeRange(
  startAt: string | null | undefined,
  endAt: string | null | undefined,
  timeZone: string | undefined,
  fallback?: string
): string {
  if (!startAt) return fallback || 'TBA';
  const tz = timeZone || 'Asia/Singapore';
  const start = new Date(startAt);
  if (isNaN(start.getTime())) return fallback || 'TBA';

  const at = (d: Date) =>
    d.toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' });

  if (endAt) {
    const end = new Date(endAt);
    if (!isNaN(end.getTime()) && end.getTime() > start.getTime()) {
      return `${at(start)} – ${at(end)}`;
    }
  }
  return at(start);
}

function formatEventDate(startAt: string | null | undefined, fallbackDate?: string): string {
  if (!startAt) return fallbackDate || 'TBA';
  try {
    const d = new Date(startAt);
    if (isNaN(d.getTime())) return fallbackDate || 'TBA';
    const weekday = d.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'Asia/Singapore' });
    const day = d.toLocaleDateString('en-US', { day: 'numeric', timeZone: 'Asia/Singapore' });
    const month = d.toLocaleDateString('en-US', { month: 'long', timeZone: 'Asia/Singapore' });
    const year = d.toLocaleDateString('en-US', { year: 'numeric', timeZone: 'Asia/Singapore' });
    return `${weekday}, ${day} ${month} ${year}`;
  } catch {
    return fallbackDate || 'TBA';
  }
}

function extractCleanExcerpt(desc?: string): string {
  if (!desc) {
    return 'Meet our engineering partners, explore live project showcases, and connect with prospective clients in Singapore.';
  }
  const clean = desc.replace(/\r\n/g, '\n').replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
  if (clean.length <= 135) return clean;
  const sliced = clean.slice(0, 130);
  const lastSpace = sliced.lastIndexOf(' ');
  return (lastSpace > 50 ? sliced.slice(0, lastSpace) : sliced).replace(/[.,;:!?]+$/, '') + '...';
}

export function EventsSection({ id = 'events' }: { id?: string }) {
  // Luma live event state
  const [upcomingEvent, setUpcomingEvent] = useState<LumaEventSummary | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Past event images state
  const [allEventImages, setAllEventImages] = useState<EventImageItem[]>([]);
  const [isLoadingImages, setIsLoadingImages] = useState<boolean>(true);

  // Optical glass. The panel and the poster are measured from the DOM by the
  // WebGL surface, so it needs both boxes rather than owning the markup.
  const panelRef = useRef<HTMLDivElement | null>(null);
  const posterRef = useRef<HTMLImageElement | null>(null);
  const [glassReady, setGlassReady] = useState<boolean>(false);
  // Keyed by URL rather than a bare boolean, so a later event with a working
  // poster is not suppressed by an earlier one that 404'd.
  const [failedPoster, setFailedPoster] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    // Fast path: load cached upcoming event from session storage
    try {
      const cached = sessionStorage.getItem('cybrdeck_upcoming_event');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed === 'object' && parsed.title) {
          setUpcomingEvent(parsed);
          setIsLoading(false);
        }
      }
    } catch {
      // Storage access blocked or unavailable
    }

    async function syncUpcomingEvent() {
      try {
        const res = await fetch('/api/luma');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (isMounted && data.success && Array.isArray(data.events)) {
          const now = Date.now();
          const upcoming = (data.events as LumaEventSummary[]).filter((e) => {
            if (e.startAt) {
              const t = new Date(e.startAt).getTime();
              return !isNaN(t) && t >= now;
            }
            return e.status === 'upcoming';
          });

          // Sort chronologically ascending to get the nearest upcoming event
          upcoming.sort((a, b) => {
            const timeA = a.startAt ? new Date(a.startAt).getTime() : Infinity;
            const timeB = b.startAt ? new Date(b.startAt).getTime() : Infinity;
            return timeA - timeB;
          });

          const nextEvent = upcoming.length > 0 ? upcoming[0] : null;
          setUpcomingEvent(nextEvent);

          try {
            if (nextEvent) {
              sessionStorage.setItem('cybrdeck_upcoming_event', JSON.stringify(nextEvent));
            } else {
              sessionStorage.removeItem('cybrdeck_upcoming_event');
            }
          } catch {
            // Storage unavailable
          }
        }
      } catch (err) {
        console.error('Failed to sync upcoming event for EventsSection:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    async function syncEventImages() {
      try {
        const res = await fetch('/api/event-images');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (isMounted && data.success) {
          setAllEventImages(data.allImages || []);
        }
      } catch (err) {
        console.error('Failed to sync event images for EventsSection:', err);
      } finally {
        if (isMounted) setIsLoadingImages(false);
      }
    }

    syncUpcomingEvent();
    syncEventImages();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <section
      id={id}
      className="relative z-20 w-full border-t border-white/5 bg-transparent px-4 py-24 sm:px-6 lg:px-8 scroll-mt-20"
    >
      <div className="mx-auto max-w-7xl space-y-12">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="max-w-2xl space-y-4">
            <h2 className="text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.08] tracking-[-0.03em] text-white">
              Events
            </h2>
            <p className="text-base sm:text-lg leading-relaxed text-zinc-400">
              Connecting builders, founders, and industry leaders through regular collaborative sessions, live project showcases, and curated gatherings in Singapore.
            </p>
          </div>

          <div className="shrink-0 flex items-center gap-3">
            <ContourGlassButton effect="rim" asChild size="default">
              <Link href="/events">                <span>Explore All Events</span>
                <ArrowRight className="w-3.5 h-3.5 text-zinc-400" />
              </Link>
            </ContourGlassButton>
          </div>
        </div>

        {/* Open Community & Event Feature Block with Jelly Cloth Photo Wall */}
        <div ref={panelRef} className="relative overflow-hidden rounded-3xl cd-crystal p-5 sm:p-6 lg:p-7">
          {/* The rim is drawn by the WebGL surface alone. The conic-gradient
              CSS version that used to stand in before the canvas reported
              ready is gone: two implementations of the same rim meant the
              panel changed appearance mid-load, and the flatter one set the
              expectation first. */}
          <SpectralGlassCanvas
            panelRef={panelRef}
            slabRef={posterRef}
            posterSrc={upcomingEvent?.image ?? null}
            onReady={setGlassReady}
          />

          <div className="relative flex flex-col lg:flex-row justify-between gap-6 lg:gap-8 items-stretch">
            {/* Left Side: Three.js Infinite Jelly-Glass Photo Wall & Event Filters */}
            <div className="flex-1 min-w-0 flex flex-col justify-between">
              <div className="space-y-3 pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xl sm:text-2xl font-semibold text-white tracking-tight">
                      Media Wall
                    </h3>
                  </div>

                  <ContourGlassButton effect="rim" asChild size="sm" className="self-start sm:self-auto shrink-0">
                    <Link href="/community">                      <span>Join Community</span>
                    </Link>
                  </ContourGlassButton>
                </div>
              </div>

              {/* Three.js Jelly Cloth Wall Viewport: tight window framing */}
              <div className="flex-1 w-full h-[360px] sm:h-[420px] lg:h-[500px] min-h-[360px] relative rounded-2xl bg-black/40 border border-white/[0.08] overflow-hidden">
                {isLoadingImages && allEventImages.length === 0 ? (
                  <div className="w-full h-full flex items-center justify-center min-h-[360px]">
                    <div className="space-y-3 text-center animate-pulse">
                      <div className="w-9 h-9 rounded-full border-2 border-brand-500/30 border-t-brand-400 animate-spin mx-auto" />
                      <p className="text-xs text-zinc-400">Loading community photo wall...</p>
                    </div>
                  </div>
                ) : (
                  <JellyEventCarousel images={allEventImages} />
                )}
              </div>
            </div>

            {/* Right Side: Upcoming Event glass card */}
            <div className="lg:w-80 shrink-0 self-start lg:self-stretch flex flex-col justify-between space-y-3 rounded-2xl cd-crystal cd-crystal--nested p-5 sm:p-6">
              {isLoading && !upcomingEvent ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-400/50 animate-pulse" />
                    <span className="text-xs font-medium text-brand-300/60">
                      Syncing event calendar...
                    </span>
                  </div>
                  <div className="space-y-2 pt-1 animate-pulse">
                    <div className="h-5 w-4/5 bg-white/10 rounded" />
                    <div className="h-3.5 w-1/2 bg-white/5 rounded" />
                    <div className="h-10 w-full bg-white/[0.04] rounded mt-2" />
                    <div className="h-8 w-full bg-white/10 rounded-lg mt-3" />
                  </div>
                </div>
              ) : upcomingEvent ? (
                <>
                  <div className="space-y-3">
                    <span className="text-xs font-medium text-brand-300">
                      Next community event
                    </span>

                    <h4 className="text-lg font-semibold text-white tracking-tight">
                      {upcomingEvent.title}
                    </h4>

                    {upcomingEvent.image && upcomingEvent.image !== failedPoster && (
                      <a
                        href={upcomingEvent.url || '/events'}
                        target={upcomingEvent.url ? '_blank' : undefined}
                        rel={upcomingEvent.url ? 'noopener noreferrer' : undefined}
                        // The slab draws its own wall, rim and separation
                        // channel. The CSS frame that used to show until the
                        // canvas was ready sat inside all of that as a second,
                        // flatter border, so it is gone with the rim.
                        className="block relative w-full rounded-xl"
                      >
                        {/* The frame takes the poster's own proportions rather than
                            imposing one. A fixed 16:9 box was cropping 43.8% off the
                            height of this 1200x1200 poster, and posters differ per
                            event, so any single assumed ratio would crop something.
                            The glass slab is built around this box for the same
                            reason, so it inherits whatever shape the poster has. */}
                        <img
                          ref={posterRef}
                          src={upcomingEvent.image}
                          alt={`Event poster for ${upcomingEvent.title}`}
                          loading="lazy"
                          decoding="async"
                          // Faded rather than removed once the glass is live: it
                          // is the texture source and it holds the layout box the
                          // slab is measured from, so it has to stay in flow.
                          className={cn(
                            'block w-full h-auto object-contain transition-opacity duration-700',
                            glassReady ? 'opacity-0' : 'opacity-100'
                          )}
                          onError={() => setFailedPoster(upcomingEvent.image ?? null)}
                        />
                      </a>
                    )}

                    <dl className="space-y-1.5 text-xs">
                      <div className="flex gap-2">
                        <dt className="w-16 shrink-0 text-zinc-500">Date</dt>
                        <dd className="text-zinc-200">
                          {formatEventDate(upcomingEvent.startAt, upcomingEvent.date)}
                        </dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="w-16 shrink-0 text-zinc-500">Time</dt>
                        <dd className="text-zinc-200">
                          {formatEventTimeRange(
                            upcomingEvent.startAt,
                            upcomingEvent.endAt,
                            upcomingEvent.timeZone,
                            upcomingEvent.time
                          )}
                        </dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="w-16 shrink-0 text-zinc-500">Location</dt>
                        <dd className="text-zinc-200">{upcomingEvent.location || 'TBA'}</dd>
                      </div>
                    </dl>

                    <p className="text-xs leading-relaxed text-zinc-400 line-clamp-3">
                      {extractCleanExcerpt(upcomingEvent.description)}
                    </p>
                  </div>

                  <div className="pt-2">
                    <ContourGlassButton effect="rim" asChild size="sm">
                      <Link
                        href={upcomingEvent.url || '/events'}
                        target={upcomingEvent.url ? '_blank' : undefined}
                        rel={upcomingEvent.url ? 'noopener noreferrer' : undefined}
                      >
                        <span>
                          {upcomingEvent.title.length > 20
                            ? 'RSVP on Luma'
                            : `RSVP for ${upcomingEvent.title}`}
                        </span>
                        <ArrowRight className="ml-1 h-3.5 w-3.5 text-zinc-300" />
                      </Link>
                    </ContourGlassButton>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-3">
                    <span className="text-xs font-medium text-brand-300">
                      Community gatherings
                    </span>

                    <div className="space-y-1">
                      <h4 className="text-lg font-semibold text-white tracking-tight">
                        Next Gathering Soon
                      </h4>
                      <p className="text-xs text-zinc-300 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-brand-400 shrink-0" />
                        <span>Dates announced monthly</span>
                      </p>
                    </div>

                    <p className="text-xs leading-relaxed text-zinc-400">
                      Check our calendar or join our community hub for notifications on upcoming hackathons, showcases, and sessions.
                    </p>
                  </div>

                  <div className="pt-2">
                    <ContourGlassButton effect="rim" asChild size="sm">
                      <Link href="/events">
                        <span>Explore All Events</span>
                        <ArrowRight className="ml-1 h-3.5 w-3.5 text-zinc-300" />
                      </Link>
                    </ContourGlassButton>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}


