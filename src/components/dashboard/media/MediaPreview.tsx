'use client';

/**
 * Render the current version of a media asset — Phase 2.5.
 *
 * One component for all three kinds because the surrounding chrome
 * (status, aspect box, failure state) is identical and only the inner
 * element differs. Three near-copies would drift.
 *
 * Video and audio use native controls rather than a custom player.
 * A hand-rolled transport has to re-implement keyboard access, caption
 * tracks, playback rate and scrubbing before it is as good as the one
 * the browser ships, and none of that is what this feature is about.
 */

import React from 'react';
import { cn } from '@/lib/utils';

export type MediaKind = 'image' | 'video' | 'audio';
export type MediaStatus = 'generating' | 'ready' | 'failed';

export interface MediaPreviewProps {
    kind: MediaKind;
    status: MediaStatus;
    /** Current version's URL. Absent while generating or after failure. */
    url?: string;
    /** Used as the accessible description of the rendered media. */
    prompt: string;
    className?: string;
}

function Frame({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                'flex min-h-[8rem] items-center justify-center overflow-hidden rounded border border-border bg-muted/20',
                className,
            )}
        >
            {children}
        </div>
    );
}

export function MediaPreview({ kind, status, url, prompt, className }: MediaPreviewProps) {
    if (status === 'generating') {
        return (
            <Frame className={className}>
                <span className="animate-pulse text-[11px] text-foreground/50">
                    Rendering…
                </span>
            </Frame>
        );
    }

    if (status === 'failed' || !url) {
        return (
            <Frame className={cn('border-rose-500/40 bg-rose-500/5', className)}>
                <span className="px-3 text-center text-[11px] text-rose-700 dark:text-rose-300">
                    This render failed. Adjust the prompt or feedback and try again.
                </span>
            </Frame>
        );
    }

    if (kind === 'image') {
        return (
            <Frame className={className}>
                {/* eslint-disable-next-line @next/next/no-img-element -- generated
                    media lives on provider or Storage CDNs whose hostnames are not
                    all in next.config images.remotePatterns; next/image would fail
                    closed on an unlisted host and show nothing. */}
                <img
                    src={url}
                    alt={prompt}
                    className="max-h-[24rem] w-full object-contain"
                    loading="lazy"
                />
            </Frame>
        );
    }

    if (kind === 'video') {
        return (
            <Frame className={className}>
                <video
                    src={url}
                    controls
                    preload="metadata"
                    aria-label={prompt}
                    className="max-h-[24rem] w-full"
                />
            </Frame>
        );
    }

    return (
        <Frame className={cn('min-h-0 p-3', className)}>
            <audio src={url} controls preload="metadata" aria-label={prompt} className="w-full" />
        </Frame>
    );
}

export default MediaPreview;
