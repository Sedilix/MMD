'use client';

/**
 * Brush a mask over an image to mark a region for replacement — Phase 2.3.
 *
 * Produces a black-and-white PNG the size of the source: white where the
 * operator painted, black elsewhere. That is the convention every
 * inpainting model expects, and getting it inverted silently replaces
 * everything the operator wanted to keep.
 *
 * ## Two canvases, not one
 *
 * The visible canvas draws a translucent overlay so the operator can see
 * what they are covering. The exported mask is drawn separately in hard
 * black and white at the image's NATURAL resolution. Exporting the
 * visible layer would hand the model a semi-transparent, display-sized
 * mask, and the edit would land in the wrong place on any image whose
 * intrinsic size differs from its rendered size — which is most of them.
 *
 * ## Why not a selection rectangle
 *
 * A rectangle is easier to build and worse to use: real edits follow the
 * shape of a thing, and a bounding box over an irregular subject tells
 * the model to replace the background around it too.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface MaskCanvasProps {
    /** Image being masked. Must be same-origin or CORS-readable. */
    imageUrl: string;
    /** Receives the mask as a PNG data URL, or null when cleared. */
    onMaskChange: (dataUrl: string | null) => void;
    disabled?: boolean;
    className?: string;
}

const MIN_BRUSH = 8;
const MAX_BRUSH = 160;

export function MaskCanvas({ imageUrl, onMaskChange, disabled = false, className }: MaskCanvasProps) {
    const overlayRef = useRef<HTMLCanvasElement | null>(null);
    const maskRef = useRef<HTMLCanvasElement | null>(null);
    const imgRef = useRef<HTMLImageElement | null>(null);

    const [brush, setBrush] = useState(48);
    const [painting, setPainting] = useState(false);
    const [hasMask, setHasMask] = useState(false);
    const [ready, setReady] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    /** Size both canvases to the image's intrinsic dimensions. */
    const initCanvases = useCallback((img: HTMLImageElement) => {
        const { naturalWidth: w, naturalHeight: h } = img;
        for (const c of [overlayRef.current, maskRef.current]) {
            if (!c) continue;
            c.width = w;
            c.height = h;
        }
        const mask = maskRef.current?.getContext('2d');
        if (mask) {
            // Black ground: "keep everything" until the operator paints.
            mask.fillStyle = '#000000';
            mask.fillRect(0, 0, w, h);
        }
        overlayRef.current?.getContext('2d')?.clearRect(0, 0, w, h);
        setReady(true);
        setHasMask(false);
        onMaskChange(null);
    }, [onMaskChange]);

    useEffect(() => {
        setReady(false);
        setLoadError(null);
        const img = new Image();
        // Generated media is served from Storage on another origin; without
        // this the canvas taints and `toDataURL` throws a security error at
        // export time rather than at load, which is far harder to diagnose.
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            imgRef.current = img;
            initCanvases(img);
        };
        img.onerror = () =>
            setLoadError('Could not load this image for masking. It may not allow cross-origin reads.');
        img.src = imageUrl;
        return () => {
            img.onload = null;
            img.onerror = null;
        };
    }, [imageUrl, initCanvases]);

    /** Map a pointer event to image-space coordinates. */
    const toImageSpace = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
        const canvas = overlayRef.current;
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        return {
            x: ((e.clientX - rect.left) / rect.width) * canvas.width,
            y: ((e.clientY - rect.top) / rect.height) * canvas.height,
            // Brush is specified in displayed pixels; scale it so a stroke
            // covers the same visible area regardless of image resolution.
            r: (brush / 2) * (canvas.width / rect.width),
        };
    }, [brush]);

    const paintAt = useCallback((x: number, y: number, r: number) => {
        const overlay = overlayRef.current?.getContext('2d');
        const mask = maskRef.current?.getContext('2d');
        if (!overlay || !mask) return;

        overlay.fillStyle = 'rgba(216, 166, 87, 0.45)';
        overlay.beginPath();
        overlay.arc(x, y, r, 0, Math.PI * 2);
        overlay.fill();

        mask.fillStyle = '#FFFFFF';
        mask.beginPath();
        mask.arc(x, y, r, 0, Math.PI * 2);
        mask.fill();
    }, []);

    const emitMask = useCallback(() => {
        const canvas = maskRef.current;
        if (!canvas) return;
        try {
            onMaskChange(canvas.toDataURL('image/png'));
            setHasMask(true);
        } catch {
            setLoadError('This image cannot be exported as a mask because it is cross-origin restricted.');
        }
    }, [onMaskChange]);

    const handleDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (disabled || !ready) return;
        (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
        setPainting(true);
        const p = toImageSpace(e);
        if (p) paintAt(p.x, p.y, p.r);
    };

    const handleMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!painting || disabled) return;
        const p = toImageSpace(e);
        if (p) paintAt(p.x, p.y, p.r);
    };

    const handleUp = () => {
        if (!painting) return;
        setPainting(false);
        emitMask();
    };

    const clear = () => {
        const img = imgRef.current;
        if (img) initCanvases(img);
    };

    return (
        <div className={cn('space-y-2', className)}>
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className="uppercase tracking-wider text-foreground/50">Mask</span>
                <label className="flex items-center gap-1 text-foreground/60">
                    Brush
                    <input
                        type="range"
                        min={MIN_BRUSH}
                        max={MAX_BRUSH}
                        value={brush}
                        onChange={(e) => setBrush(Number(e.target.value))}
                        disabled={disabled || !ready}
                        className="w-24"
                    />
                </label>
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={clear}
                    disabled={disabled || !hasMask}
                    className="text-[11px]"
                >
                    Clear
                </Button>
                <span className="text-foreground/40">
                    {hasMask ? 'Painted areas will be replaced.' : 'Paint the area you want changed.'}
                </span>
            </div>

            {loadError ? (
                <p className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-800 dark:text-amber-200">
                    {loadError}
                </p>
            ) : (
                <div className="relative overflow-hidden rounded border border-border">
                    {/* eslint-disable-next-line @next/next/no-img-element -- generated
                        media lives on Storage/provider CDNs not listed in
                        next.config images.remotePatterns; next/image fails closed. */}
                    <img src={imageUrl} alt="" className="block w-full select-none" draggable={false} />
                    <canvas
                        ref={overlayRef}
                        onPointerDown={handleDown}
                        onPointerMove={handleMove}
                        onPointerUp={handleUp}
                        onPointerLeave={handleUp}
                        className={cn(
                            'absolute inset-0 h-full w-full touch-none',
                            disabled || !ready ? 'cursor-not-allowed' : 'cursor-crosshair',
                        )}
                    />
                    {/* Exported mask. Never displayed — it is the hard black and
                        white version at the image's natural resolution. */}
                    <canvas ref={maskRef} className="hidden" />
                </div>
            )}
        </div>
    );
}

export default MaskCanvas;
