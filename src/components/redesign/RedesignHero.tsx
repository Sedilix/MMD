'use client';

/**
 * Landing hero.
 *
 * THESIS: Cybrdeck is not an AI model company, and this hero must not read like
 * one. The tower is the company itself, in the four layers it was built on —
 * community on the ground floor, then clients, then the partner network, then
 * the core team. "Community, As a Company" is a literal floor plan, so the
 * building states the positioning rather than decorating it.
 *
 * OWN-WORLD: near-black ground, brand cyan as the building's dominant light,
 * office amber under it, jewel accents rationed to street signage. The mark
 * itself crowns the roof as a turning solid.
 *
 * STORY: the visitor sees a working building, reads who occupies each floor,
 * hovers one and watches that floor light while the rest of the stack dims,
 * then walks in.
 *
 * FIRST VIEWPORT: art full-bleed with the tower right of centre; copy in a left
 * column over a horizontal scrim; primary action under the subhead; the four
 * floors below it, listed 1F upward so the numbers do the mapping.
 *
 * FORM: a procedural canvas scene rather than a raster illustration, so it
 * scales to any viewport and can answer the pointer.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import NextImage from 'next/image';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ContourGlassButton } from '@/components/ui/ContourGlassButton';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/use-media-query';
import { TowerCanvas } from './cityscape/TowerCanvas';
import type { TickerEntry } from './cityscape/scene';

interface Floor {
  id: string;
  level: string;
  name: string;
  blurb: string;
  href: string;
  /** Fractional height range this floor occupies, 0 = ground, 1 = roof. */
  band: { from: number; to: number };
}

/**
 * The four floors Cybrdeck was built on, listed ground-up so community reads
 * first. The list therefore runs opposite to the tower's vertical order, which
 * is exactly why each row carries its floor number — "1F" tells the visitor to
 * look at the bottom of the building without the list having to be inverted.
 */
const FLOORS: Floor[] = [
  {
    id: 'community',
    level: '1F',
    name: 'Community',
    blurb: 'Builders, vibe coders and everyone still outside the ecosystem. The front door, and it stays open.',
    href: '/community',
    band: { from: 0, to: 0.23 },
  },
  {
    id: 'clients',
    level: '2F',
    name: 'Clients',
    blurb: 'The people we build for, and the work that sets the standard for everything above it.',
    href: '/business',
    band: { from: 0.25, to: 0.48 },
  },
  {
    id: 'partners',
    level: '3F',
    name: 'Partner Network',
    blurb: 'The studios, vendors and specialists we build alongside rather than around.',
    href: '/partners',
    band: { from: 0.5, to: 0.74 },
  },
  {
    id: 'core',
    level: '4F',
    name: 'Cybrdeck Core Team',
    blurb: 'The people holding the whole building up, and answerable to every floor below.',
    href: '/cac',
    band: { from: 0.76, to: 1 },
  },
];

const COLUMN = 'relative z-10 mx-auto w-full max-w-7xl px-5 sm:px-6 lg:px-8';

interface PartnerRecord {
  name: string;
  logo: string;
  bgWhite?: boolean;
  unregistered?: boolean;
  awaitingApproval?: boolean;
}

/**
 * Logos that render as text at ticker scale instead of as an image, keyed by
 * filename. `trimContentBounds` below fixes assets padded with dead canvas
 * (e.g. a mark centred on an oversized square) — but it cannot fix an asset
 * that is legitimately busier than one line, because there is no rectangle to
 * crop to. `speechmatics.svg` is a two-line lockup — "SPEECHMATICS" over a
 * smaller "Startup Program" — with its ring icon spanning the full image
 * height by design; a crop tight enough to drop the illegible second line
 * would slice straight through that icon. Falling back to the plain name
 * reuses the same rendering path the ticker already uses for any partner with
 * no usable logo, rather than inventing a bespoke non-rectangular crop for
 * one file. This is a ticker-only decision — the marquee and any other
 * consumer of this asset are untouched.
 */
const TICKER_TEXT_ONLY = new Set(['speechmatics.svg']);

/**
 * Finds the tight bounding box of a logo's actual mark inside its source
 * canvas, rather than trusting the file's own dimensions.
 *
 * A partner's export is not guaranteed to be cropped tight. One shipped as a
 * 2048x2048 square with an opaque near-black background and the wordmark
 * confined to a thin band through the vertical middle — the ticker was
 * drawing that whole padded square as one tile, which put a bare few pixels
 * of legible text inside an otherwise blank dark block. Scanning inward from
 * each edge for the first row/column that meaningfully differs from the
 * corner colour finds the real content regardless of whether the source uses
 * transparency or a baked-in background — the two cases a partner's own
 * export tooling might produce.
 *
 * Runs once per logo at decode time, on a downscaled working copy (this is a
 * pixel scan, not a resize the user waits on) — the returned box is in the
 * ORIGINAL image's pixel coordinates.
 */
function trimContentBounds(img: HTMLImageElement): { sx: number; sy: number; sw: number; sh: number } {
  const fullW = img.naturalWidth || 1;
  const fullH = img.naturalHeight || 1;
  const full = { sx: 0, sy: 0, sw: fullW, sh: fullH };

  const scale = Math.min(1, 256 / Math.max(fullW, fullH));
  const w = Math.max(1, Math.round(fullW * scale));
  const h = Math.max(1, Math.round(fullH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return full;

  try {
    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);

    const at = (x: number, y: number) => {
      const i = (y * w + x) * 4;
      return [data[i], data[i + 1], data[i + 2], data[i + 3]] as const;
    };

    // Background model, read from the corner: either transparent (alpha near
    // 0), or an opaque flat colour — a content pixel is one that departs from
    // whichever this is.
    const corner = at(0, 0);
    const transparent = corner[3] < 16;
    const isContent = (x: number, y: number) => {
      const [r, g, b, a] = at(x, y);
      if (transparent) return a > 16;
      if (a < 16) return true; // a transparent pixel against an opaque corner is content
      const d = Math.abs(r - corner[0]) + Math.abs(g - corner[1]) + Math.abs(b - corner[2]);
      return d > 36;
    };

    // A row/column counts as content only past a minimum run, so a handful
    // of stray anti-aliased edge pixels can't drag the box out to the canvas
    // edge.
    const MIN_RUN = Math.max(1, Math.round(Math.min(w, h) * 0.01));

    const rowHasContent = (y: number) => {
      let run = 0;
      for (let x = 0; x < w; x++) {
        run = isContent(x, y) ? run + 1 : 0;
        if (run >= MIN_RUN) return true;
      }
      return false;
    };
    const colHasContent = (x: number) => {
      let run = 0;
      for (let y = 0; y < h; y++) {
        run = isContent(x, y) ? run + 1 : 0;
        if (run >= MIN_RUN) return true;
      }
      return false;
    };

    let top = 0;
    while (top < h && !rowHasContent(top)) top++;
    let bottom = h - 1;
    while (bottom > top && !rowHasContent(bottom)) bottom--;
    let left = 0;
    while (left < w && !colHasContent(left)) left++;
    let right = w - 1;
    while (right > left && !colHasContent(right)) right--;

    // Nothing distinguishable from the background — a blank or single-colour
    // file. Fall back to the whole image rather than a degenerate box.
    if (right <= left || bottom <= top) return full;

    // A small margin back, so the trim doesn't sit flush against a stroke.
    const padX = (right - left) * 0.06;
    const padY = (bottom - top) * 0.06;
    const bx0 = Math.max(0, left - padX);
    const by0 = Math.max(0, top - padY);
    const bx1 = Math.min(w, right + padX);
    const by1 = Math.min(h, bottom + padY);

    return {
      sx: (bx0 / w) * fullW,
      sy: (by0 / h) * fullH,
      sw: ((bx1 - bx0) / w) * fullW,
      sh: ((by1 - by0) / h) * fullH,
    };
  } catch {
    // getImageData throws on a tainted canvas (cross-origin without CORS).
    // These files are same-origin, but fail open to the untrimmed image
    // rather than lose the logo entirely.
    return full;
  }
}

export function RedesignHero() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  const active = useMemo(() => FLOORS.find((f) => f.id === activeId) ?? null, [activeId]);
  const clear = useCallback(() => setActiveId(null), []);

  // Partner logos for the ticker board wrapped around 3F. Same disk-checked
  // registry the marquee uses, so the tower can never name a partner the
  // marquee has dropped. Images are decoded before handing them to the canvas —
  // an undecoded HTMLImageElement draws as nothing and would blink in mid-scroll.
  // Silent on failure: the board simply runs empty.
  const [partners, setPartners] = useState<TickerEntry[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/partners')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(async (d: { partners?: PartnerRecord[] }) => {
        const list = (d.partners ?? []).filter(
          (p) => p.name && p.logo && !p.unregistered && !p.awaitingApproval,
        );
        const entries = await Promise.all(
          list.map(async (p): Promise<TickerEntry> => {
            if (TICKER_TEXT_ONLY.has(p.logo)) {
              return { name: p.name, img: null, aspect: 1, bgWhite: p.bgWhite };
            }
            const img = new Image();
            img.src = `/partners/${encodeURIComponent(p.logo)}`;
            try {
              await img.decode();
              const src = trimContentBounds(img);
              return {
                name: p.name,
                img,
                aspect: src.sw / src.sh,
                src,
                bgWhite: p.bgWhite,
              };
            } catch {
              // Missing or undecodable file: keep the name, drop the image.
              return { name: p.name, img: null, aspect: 1, bgWhite: p.bgWhite };
            }
          }),
        );
        if (!cancelled && entries.length) setPartners(entries);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section
      className={cn(
        'relative isolate flex w-full flex-col overflow-hidden bg-transparent',
        // svh, not vh: with a phone's URL bar showing, 100vh pushes the primary
        // action below the fold on first paint. Full height rather than
        // height-minus-header, because the nav floats over this section now
        // instead of occupying a band above it.
        'lg:min-h-svh lg:justify-center lg:pt-28 lg:pb-16',
      )}
    >
      {/* 1 — Offer */}
      <div className={cn(COLUMN, 'order-1 pt-28 sm:pt-32 lg:pt-6')}>
        <div className="max-w-2xl">
          <h1 className="text-[clamp(2.25rem,6vw,4.25rem)] font-semibold leading-[1.04] tracking-[-0.03em] text-white">
            Community as the
            <br className="hidden sm:block" /> foundation.
          </h1>

          <p className="mt-5 max-w-xl text-base leading-relaxed text-zinc-300 sm:text-lg">
            Cybrdeck is built on four floors, and the order matters. The
            community is the foundation — everything above it is only
            standing because that floor is.
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
            <ContourGlassButton
              asChild
              size="xl"
            >
              <Link href="/community">
                <span>Join the community</span>
                <ArrowRight className="ml-1 h-4 w-4 text-zinc-300 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </ContourGlassButton>

            <ContourGlassButton
              asChild
              size="xl"
              shape="rectangle"
              effect="rim"
            >
              <Link href="/playground">
                <NextImage
                  src="/cybrdeck-logo/playground_transparent.png"
                  alt=""
                  width={18}
                  height={18}
                  className="w-4.5 h-4.5 object-contain mr-2 transition-transform group-hover:scale-110"
                  aria-hidden
                />
                <span>Launch Playground</span>
              </Link>
            </ContourGlassButton>
          </div>
        </div>
      </div>

      {/*
        2 — The scene.

        On desktop this is absolutely positioned and fills the section, with the
        copy over a horizontal scrim. On mobile that same treatment puts body
        text straight onto a facade full of lit windows, which no scrim rescues
        at a readable contrast — so below `lg` it becomes a band in normal flow
        and the copy above it keeps a clean ground.
      */}
      <div
        className={cn(
          'order-2 relative mt-8 h-[36svh] min-h-[240px] w-full',
          'lg:pointer-events-none lg:absolute lg:inset-0 lg:z-0 lg:mt-0 lg:h-full lg:min-h-0',
        )}
      >
        <TowerCanvas
          className="absolute inset-0"
          quality={isDesktop ? 'high' : 'low'}
          focusX={isDesktop ? 0.76 : 0.5}
          highlight={active?.band ?? null}
          partners={partners}
        />
        {/* Mobile: dissolve the band's top edge into the page ground. */}
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-[#01040c] to-transparent lg:hidden"
        />
        {/* Desktop: horizontal scrim giving the copy column a dark ground. */}
        <div
          aria-hidden
          className="absolute inset-0 hidden bg-gradient-to-r from-[#01040c] via-[#01040c]/88 via-40% to-transparent lg:block"
        />
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#01040c] to-transparent lg:h-32"
        />
      </div>

      {/* 3 — The directory. Hovering a row lights that floor in the tower and
          dims the rest, so the list and the building are one control. */}
      <div className={cn(COLUMN, 'order-3 pb-14 lg:pb-0 lg:pt-9')}>
        <ul className="max-w-xl border-t border-white/10" onMouseLeave={clear}>
          {FLOORS.map((floor) => {
            const isActive = activeId === floor.id;
            return (
              <li key={floor.id} className="border-b border-white/10">
                <Link
                  href={floor.href}
                  onMouseEnter={() => setActiveId(floor.id)}
                  onFocus={() => setActiveId(floor.id)}
                  onBlur={clear}
                  className={cn(
                    'group flex items-baseline gap-4 rounded-sm py-3 outline-none transition-colors',
                    'focus-visible:ring-2 focus-visible:ring-brand-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#01040c]',
                  )}
                >
                  {/* The floor number carries the mapping to the building, so
                      the list can run ground-up without reading as inverted. */}
                  <span
                    className={cn(
                      'w-7 shrink-0 text-[13px] font-medium tabular-nums transition-colors duration-200',
                      isActive ? 'text-brand-300' : 'text-zinc-500',
                    )}
                  >
                    {floor.level}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'block text-sm font-medium transition-colors duration-200',
                        isActive ? 'text-brand-200' : 'text-white',
                      )}
                    >
                      {floor.name}
                    </span>
                    <span className="mt-0.5 block text-[13px] leading-snug text-zinc-400">
                      {floor.blurb}
                    </span>
                  </span>
                  <ArrowUpRight
                    aria-hidden
                    className={cn(
                      'h-4 w-4 shrink-0 self-center transition-all duration-200',
                      isActive
                        ? 'translate-x-0 text-brand-300 opacity-100'
                        : '-translate-x-1 text-zinc-500 opacity-0 group-hover:opacity-100',
                    )}
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
