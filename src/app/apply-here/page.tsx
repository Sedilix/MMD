"use client"

import React, { useState, useRef, useEffect } from 'react';
import { Icon } from '@/components/ui/icon';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

import { dbg } from '@/lib/log';

import { useRouter } from 'next/navigation';

export default function TestFrontPage() {
  const router = useRouter();
  const [endStateTriggered, setEndStateTriggered] = useState(false);
  const [isHolding, setIsHolding] = useState(false);
  const holdTimerRef = useRef<any>(null);
  const [containerStyle, setContainerStyle] = useState<React.CSSProperties>({
    width: '100%',
    height: '100%',
  });

  const startHoldTimer = () => {
    if (endStateTriggered) return;
    setIsHolding(true);
    dbg("Starting hold timer...");

    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
    }

    holdTimerRef.current = setTimeout(() => {
      dbg("Hold duration met! Triggering redirect...");
      setEndStateTriggered(true);
      setTimeout(() => {
        router.push('/initialize-specialist');
      }, 1000); // Allow fade animation to complete
    }, 2000); // 2 seconds hold duration matching the slide animation
  };

  const cancelHoldTimer = () => {
    if (isHolding) {
      dbg("Cancelling hold timer...");
      setIsHolding(false);
    }
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
      }
    };
  }, []);

  // Global release handler to catch releases outside the canvas
  useEffect(() => {
    const handleGlobalRelease = () => {
      cancelHoldTimer();
    };

    if (isHolding) {
      window.addEventListener('mouseup', handleGlobalRelease);
      window.addEventListener('touchend', handleGlobalRelease);
    }

    return () => {
      window.removeEventListener('mouseup', handleGlobalRelease);
      window.removeEventListener('touchend', handleGlobalRelease);
    };
  }, [isHolding]);

  // Handle responsive scaling and viewport confinement
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;

      // Base dimensions vary according to device type
      let baseW = 1920;
      let baseH = 1080;

      if (w < 640) {
        // Mobile
        baseW = 375;
        baseH = 812;
      } else if (w < 1024) {
        // Tablet
        baseW = 768;
        baseH = 1024;
      }

      // Confine spline frame within viewport: scale to fit the window boundaries
      const scaleX = w / baseW;
      const scaleY = h / baseH;
      const scale = Math.min(scaleX, scaleY);

      setContainerStyle({
        width: `${baseW}px`,
        height: `${baseH}px`,
        transform: `scale(${scale})`,
        transformOrigin: 'center',
        flexShrink: 0,
      });
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="min-h-dvh text-zinc-100 flex flex-col relative overflow-hidden selection:bg-primary/30 selection:text-white pointer-events-none">
      {/* Base Solid Background */}
      <div className="fixed inset-0 bg-zinc-950 -z-20 pointer-events-none" />

      {/* Cinematic Fullscreen Transition Overlay */}
      <div
        className={`fixed inset-0 bg-black z-50 pointer-events-none transition-opacity duration-1000 ${endStateTriggered ? 'opacity-100' : 'opacity-0'
          }`}
      />

      <div className="fixed inset-0 w-screen h-dvh -z-10 pointer-events-auto flex items-center justify-center overflow-hidden select-none touch-none">
        <div
          style={containerStyle}
          className="relative select-none touch-none"
          onMouseDown={startHoldTimer}
          onMouseUp={cancelHoldTimer}
          onTouchStart={(e) => {
            if (e.cancelable) {
              e.preventDefault();
            }
            startHoldTimer();
          }}
          onTouchEnd={cancelHoldTimer}
          onTouchCancel={cancelHoldTimer}
        >
          {/* Still frame in place of the Spline scene — the hold-to-proceed
              gesture lives on the wrapper above, so the flow is intact. */}
          <Image
            src="/spline-assets/apply-here-fallback.png"
            alt="Hold to begin your application"
            fill
            sizes="100vw"
            className="object-cover"
            priority
          />
        </div>
      </div>

      {/* Decorative Grid Overlay (Subtle) */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f1f2e_1px,transparent_1px),linear-gradient(to_bottom,#1f1f2e_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-10 pointer-events-none" />

      {/* Back Button */}
      <div className="fixed bottom-6 left-6 md:bottom-12 md:left-12 z-30 pointer-events-auto">
        <Link href="/">
          <Button variant="ghost" size="sm" className="border border-white bg-black hover:bg-white/10 text-white gap-2 font-mono text-xs uppercase tracking-wider">
            <Icon name="arrow-left-md" className="h-4 w-4" /> Back Home
          </Button>
        </Link>
      </div>

      {/* Main Content Layout */}
      <main className="flex-1 relative z-10 min-h-[calc(100dvh-12rem)] flex flex-col items-center justify-center pointer-events-none">
        {/* Decorative elements or subtle interaction hints can be placed here if desired */}
      </main>
    </div>
  );
}
