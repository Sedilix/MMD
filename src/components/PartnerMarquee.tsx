import Image from 'next/image';
import { useEffect, useState } from 'react';
import { getVisiblePartners, type Partner } from '@/lib/partners';

/**
 * Landing-page partner logo marquee.
 *
 * Source of truth: the server-side `/api/partners` endpoint, which joins
 * `src/data/partners.json` against the actual contents of `/public/partners/`
 * on disk. Any curated entry whose logo file has been deleted is *dropped
 * server-side* before it ever reaches the client, so the marquee never renders
 * a 404.
 *
 * Defense-in-depth: even if the API lags behind a recent deploy, the `<Image>`
 * `onError` handler hides the individual tile — the marquee continues
 * seamlessly with the remaining partners.
 *
 * Why fetch instead of importing the JSON statically: the static JSON has no
 * way to know whether a logo file is still on disk, so it would happily emit
 * broken image URLs the moment a logo is removed. Going through the route
 * keeps both the partners page and the marquee on the same disk-checked
 * source of truth.
 *
 * To add a partner: drop a logo in `/public/partners/` and add a metadata
 * entry to `src/data/partners.json`. It appears here automatically on the
 * next deploy (or within the API cache window).
 */
export function PartnerMarquee() {
  const [partners, setPartners] = useState<Partner[]>(getVisiblePartners);

  useEffect(() => {
    let cancelled = false;
    // Fetch the disk-checked registry. `revalidate = 3600` on the route
    // keeps this cheap on repeat visits; if a logo was just deleted,
    // worst case the user sees the empty tile hidden via `onError`
    // until the cache expires.
    fetch('/api/partners')
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as { partners: Partner[] };
      })
      .then((d) => {
        if (cancelled) return;
        // Defensive client-side filters mirror the server filters so
        // any drift between the route and the marquee is harmless.
        const list = (d.partners ?? []).filter(
          (p) => !p.unregistered && !p.awaitingApproval,
        );
        if (list.length > 0) {
          setPartners(list);
        }
      })
      .catch(() => {
        // Silent fallback: curated visible partners stay rendered.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The strip keeps an identical structure — and therefore an identical
  // height — before and after `/api/partners` resolves. Swapping a short
  // empty strip for a taller one would push every section below it down
  // mid-scroll right after a cold load (the visible "twitch"). While the
  // fetch is in flight the logo row renders as a fixed-height spacer sized
  // to the tallest possible tile (70px logo + 2×12px white-card padding).
  return (
    <div className="w-full bg-zinc-950/50 py-12 border-y border-white/5 overflow-hidden flex flex-col items-center">
      <p className="text-[10px] font-sans font-medium text-zinc-500 uppercase tracking-widest mb-8">
        Trusted by World-Class Organizations
      </p>

      <div className="relative flex w-full overflow-hidden pointer-events-none">
        {/* Gradient overlays for smooth fading edges */}
        <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-black to-transparent z-10" />
        <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-black to-transparent z-10" />

        {/*
                 * Seamless marquee: a single track contains the logos twice in a row.
                 * The marquee animation translates the whole track by -50%, so the second
                 * copy slides into view as the first copy scrolls off to the left. The seam
                 * is seamless because the trailing gap is applied per-logo (a spacer div),
                 * so the two copies are truly back-to-back at the join — no gap at the loop.
                 */}
        <div className="flex w-full overflow-hidden">
          <div className="flex animate-marquee items-center will-change-transform w-max shrink-0">
            {partners.length === 0 ? (
              <div className="h-[94px] w-full" aria-hidden="true" />
            ) : (
              <>
                {/* Set 1 */}
                {partners.map((partner) => (
                  <MarqueeLogo key={`m1-${partner.id}`} partner={partner} />
                ))}
                {/* Set 2 (identical structure for seamless loop) */}
                {partners.map((partner) => (
                  <MarqueeLogo key={`m2-${partner.id}`} partner={partner} />
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Single marquee tile. Hides itself on image error so a stale cached entry
 * (or a race during deploy) never renders a 404 tile — the surrounding
 * marquee keeps scrolling.
 */
function MarqueeLogo({ partner }: { partner: Partner }) {
  const cfg = partner.logoConfig;
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <div className="flex items-center shrink-0 group">
      <div
        className={`flex items-center justify-center shrink-0 ${partner.bgWhite ? 'bg-white rounded p-3' : ''}`}
        style={{ width: cfg.flexWidth, height: cfg.height }}
        title={partner.name}
      >
        <div className="relative w-full h-full flex items-center justify-center">
          <Image
            src={`/partners/${partner.logo}`}
            alt={partner.name}
            fill
            sizes={`${cfg.imgWidth}px`}
            className={`object-contain ${!partner.bgWhite ? 'mix-blend-screen' : ''} group-hover:scale-105 transition-transform duration-300`}
            onError={() => setHidden(true)}
          />
        </div>
      </div>
      {/* Trailing gap per logo — makes the seam tight (20px) */}
      <div className="w-5 shrink-0" aria-hidden="true" />
    </div>
  );
}
