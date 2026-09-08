'use client';

import React, { useRef, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface SeamlessLoopVideoProps {
  src?: string;
  sources?: string[];
  className?: string;
  crossfadeDuration?: number; // seconds
}

export function SeamlessLoopVideo({
  src,
  sources = ['/playground_anim_bg.mp4', '/playground_anim_bg2.mp4'],
  className,
  crossfadeDuration = 1.2,
}: SeamlessLoopVideoProps) {
  const clipA = src || sources[0] || '/playground_anim_bg.mp4';
  const clipB = sources[1] || sources[0] || '/playground_anim_bg2.mp4';

  const [activeClip, setActiveClip] = useState<'A' | 'B'>('A');

  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);
  const isTransitioningRef = useRef(false);

  // Monitor Video A timeupdate to transition to B
  useEffect(() => {
    const videoA = videoARef.current;
    if (!videoA || !clipB || clipA === clipB) return;

    const handleTimeUpdateA = () => {
      if (activeClip !== 'A' || isTransitioningRef.current) return;
      if (!videoA.duration || isNaN(videoA.duration)) return;

      const timeLeft = videoA.duration - videoA.currentTime;
      if (timeLeft <= crossfadeDuration) {
        isTransitioningRef.current = true;
        const videoB = videoBRef.current;
        if (videoB) {
          videoB.currentTime = 0;
          videoB.play().catch(() => {});
        }
        setActiveClip('B');
        setTimeout(() => {
          isTransitioningRef.current = false;
        }, crossfadeDuration * 1000);
      }
    };

    videoA.addEventListener('timeupdate', handleTimeUpdateA);
    return () => videoA.removeEventListener('timeupdate', handleTimeUpdateA);
  }, [activeClip, clipA, clipB, crossfadeDuration]);

  // Monitor Video B timeupdate to transition to A
  useEffect(() => {
    const videoB = videoBRef.current;
    if (!videoB || !clipB || clipA === clipB) return;

    const handleTimeUpdateB = () => {
      if (activeClip !== 'B' || isTransitioningRef.current) return;
      if (!videoB.duration || isNaN(videoB.duration)) return;

      const timeLeft = videoB.duration - videoB.currentTime;
      if (timeLeft <= crossfadeDuration) {
        isTransitioningRef.current = true;
        const videoA = videoARef.current;
        if (videoA) {
          videoA.currentTime = 0;
          videoA.play().catch(() => {});
        }
        setActiveClip('A');
        setTimeout(() => {
          isTransitioningRef.current = false;
        }, crossfadeDuration * 1000);
      }
    };

    videoB.addEventListener('timeupdate', handleTimeUpdateB);
    return () => videoB.removeEventListener('timeupdate', handleTimeUpdateB);
  }, [activeClip, clipA, clipB, crossfadeDuration]);

  // Single clip fallback loop handling
  useEffect(() => {
    if (clipA !== clipB && sources.length > 1) return;
    const videoA = videoARef.current;
    if (!videoA) return;

    const handleEnded = () => {
      videoA.currentTime = 0;
      videoA.play().catch(() => {});
    };

    videoA.addEventListener('ended', handleEnded);
    return () => videoA.removeEventListener('ended', handleEnded);
  }, [clipA, clipB, sources.length]);

  return (
    <div className={cn('relative overflow-hidden pointer-events-none bg-black', className)}>
      {/* Video A (Clip 1) */}
      <video
        ref={videoARef}
        src={clipA}
        autoPlay
        muted
        playsInline
        className={cn(
          'absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ease-in-out',
          activeClip === 'A' ? 'opacity-100 z-10' : 'opacity-0 z-0'
        )}
      />

      {/* Video B (Clip 2) */}
      {clipA !== clipB && (
        <video
          ref={videoBRef}
          src={clipB}
          muted
          playsInline
          className={cn(
            'absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ease-in-out',
            activeClip === 'B' ? 'opacity-100 z-10' : 'opacity-0 z-0'
          )}
        />
      )}
    </div>
  );
}

export default SeamlessLoopVideo;
