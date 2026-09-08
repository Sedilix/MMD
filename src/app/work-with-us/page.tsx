"use client"

import Image from 'next/image';
import Link from 'next/link';

export default function WorkWithUsPage() {
  return (
    // Outer shell: full viewport, no overflow, black fallback
    <div
      style={{
        position: 'relative',
        width: '100vw',
        height: '100dvh',
        overflow: 'hidden',
        background: '#000',
      }}
    >
      {/* ── Hero backdrop — still frame in place of the Spline scene ── */}
      <div className="absolute inset-0 w-full h-full pointer-events-none flex items-center justify-center overflow-hidden">
        <div className="w-[2560px] h-[1440px] shrink-0 origin-center scale-[0.5] sm:scale-[0.6] md:scale-[0.65] lg:scale-[0.75] xl:scale-[0.85] 2xl:scale-100 [@media(max-height:1200px)]:scale-[0.8] [@media(max-height:1000px)]:scale-[0.68] [@media(max-height:900px)]:scale-[0.6] [@media(max-height:800px)]:scale-[0.52] [@media(max-height:750px)]:scale-[0.48] relative">
          <Image
            src="/spline-assets/work-with-us-fallback.png"
            alt="INTEGRITY. FOCUS. IMPACT. We turn your ideas into tailored experiences."
            fill
            sizes="100vw"
            className="object-cover"
            priority
          />
        </div>
      </div>

      {/* ── Watermark cover ───────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          right: 0,
          width: 180,
          height: 60,
          background: '#000',
          zIndex: 50,
          pointerEvents: 'none',
        }}
      />

      {/* ── Book Discovery Call & Submit Proposal CTAs ───────────────── */}
      <div
        style={{
          position: 'absolute',
          top: '52%', // Adjusted to sit slightly below center where the text is
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 50,
        }}
        className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6"
      >
        <Link
          href="https://calendar.app.google/7zpXGWdWu7Q31o9Z8"
          target="_blank"
          rel="noopener"
          referrerPolicy="no-referrer"
        >
          <div className="relative p-[4px] rounded-full overflow-hidden group">
            {/* Rotating RGB border */}
            <div
              className="absolute top-1/2 left-1/2 w-[400%] aspect-square -translate-x-1/2 -translate-y-1/2 animate-spin"
              style={{
                animationDuration: '3s',
                background: 'conic-gradient(from 0deg, transparent 0%, transparent 40%, #ff4500 50%, transparent 50%, transparent 100%)',
              }}
            />
            {/* Button face — opaque black to hide the Spline text underneath */}
            <div className="relative z-10 flex items-center justify-center h-12 px-10 rounded-full bg-black group-hover:bg-zinc-950 transition-colors duration-200 cursor-pointer">
              <span className="font-headline text-xs tracking-widest uppercase text-white group-hover:text-orange-400 transition-colors duration-200 whitespace-nowrap">
                Book Discovery Call
              </span>
            </div>
          </div>
        </Link>

        <span className="text-zinc-500 font-headline text-xs tracking-widest uppercase">OR</span>

        <Link href="/proposal-form">
          <div className="relative p-[4px] rounded-full overflow-hidden group">
            {/* Rotating RGB border (Cyan-blue) */}
            <div
              className="absolute top-1/2 left-1/2 w-[400%] aspect-square -translate-x-1/2 -translate-y-1/2 animate-spin"
              style={{
                animationDuration: '3s',
                background: 'conic-gradient(from 0deg, transparent 0%, transparent 40%, #008aff 50%, transparent 50%, transparent 100%)',
              }}
            />
            {/* Button face */}
            <div className="relative z-10 flex items-center justify-center h-12 px-10 rounded-full bg-black group-hover:bg-zinc-950 transition-colors duration-200 cursor-pointer">
              <span className="font-headline text-xs tracking-widest uppercase text-white group-hover:text-brand-400 transition-colors duration-200 whitespace-nowrap">
                Submit A Proposal
              </span>
            </div>
          </div>
        </Link>
      </div>

      {/* AUDIT TUNE BLOCK: Invisible Home-button overlay
       * Positioned over the circular Home button the Spline scene renders in
       * the bottom-left corner. zIndex is one notch BELOW the Watermark cover
       * and Book-Discovery-Call overlay (zIndex: 50) so it doesn't fight them
       * when the Spline button and our overlay visually overlap.
       * Adjust bottom/left/width/height if the scene's button moves.
       */}
      <Link
        href="/"
        aria-label="Go to home"
        style={{
          position: 'absolute',
          bottom: 10,
          left: 10,
          width: 44,
          height: 44,
          borderRadius: '50%',
          cursor: 'pointer',
          zIndex: 40,
          background: 'transparent',
          border: 'none',
          display: 'block',
        }}
      />
    </div>
  );
}
