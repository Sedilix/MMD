'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Icon } from '@/components/ui/icon';
import { Paintbrush, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type AnnotationTool = 'rect' | 'circle' | 'lasso' | 'brush';

interface Point {
    x: number;
    y: number;
}

interface ImageAnnotatorCanvasProps {
    imageUrl: string;
    onApplyRegionCrop: (croppedDataUrl: string, bounds: { x: number; y: number; width: number; height: number }) => void;
    onCancel: () => void;
}

export function ImageAnnotatorCanvas({
    imageUrl,
    onApplyRegionCrop,
    onCancel,
}: ImageAnnotatorCanvasProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imageRef = useRef<HTMLImageElement | null>(null);

    const [activeTool, setActiveTool] = useState<AnnotationTool>('rect');
    const [brushSize] = useState<number>(24);
    const [isDrawing, setIsDrawing] = useState(false);
    const [startPoint, setStartPoint] = useState<Point | null>(null);
    const [currentPoint, setCurrentPoint] = useState<Point | null>(null);
    const [lassoPoints, setLassoPoints] = useState<Point[]>([]);

    // Initialize image and canvas bounds
    useEffect(() => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = imageUrl;
        img.onload = () => {
            imageRef.current = img;
            const canvas = canvasRef.current;
            if (!canvas) return;

            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;

            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(img, 0, 0);
            }
        };
    }, [imageUrl]);

    // Redraw base image + current active selection overlay
    const redrawCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        const img = imageRef.current;
        if (!canvas || !img) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);

        // Render current selection path
        if (startPoint && currentPoint) {
            ctx.save();
            ctx.strokeStyle = '#d8a657'; // brand-400
            ctx.fillStyle = 'rgba(216, 166, 87, 0.25)';
            ctx.lineWidth = Math.max(3, canvas.width / 300);

            if (activeTool === 'rect') {
                const width = currentPoint.x - startPoint.x;
                const height = currentPoint.y - startPoint.y;
                ctx.fillRect(startPoint.x, startPoint.y, width, height);
                ctx.strokeRect(startPoint.x, startPoint.y, width, height);
            } else if (activeTool === 'circle') {
                const radiusX = Math.abs(currentPoint.x - startPoint.x) / 2;
                const radiusY = Math.abs(currentPoint.y - startPoint.y) / 2;
                const centerX = Math.min(startPoint.x, currentPoint.x) + radiusX;
                const centerY = Math.min(startPoint.y, currentPoint.y) + radiusY;

                ctx.beginPath();
                ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
                ctx.fill();
                ctx.stroke();
            } else if (activeTool === 'lasso' && lassoPoints.length > 1) {
                ctx.beginPath();
                ctx.moveTo(lassoPoints[0].x, lassoPoints[0].y);
                for (let i = 1; i < lassoPoints.length; i++) {
                    ctx.lineTo(lassoPoints[i].x, lassoPoints[i].y);
                }
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            }
            ctx.restore();
        }
    }, [activeTool, startPoint, currentPoint, lassoPoints]);

    const getCanvasCoordinates = (e: React.MouseEvent<HTMLCanvasElement>): Point | null => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY,
        };
    };

    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const pt = getCanvasCoordinates(e);
        if (!pt) return;

        setIsDrawing(true);
        setStartPoint(pt);
        setCurrentPoint(pt);

        if (activeTool === 'lasso') {
            setLassoPoints([pt]);
        } else if (activeTool === 'brush') {
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext('2d');
            if (ctx) {
                ctx.save();
                ctx.fillStyle = 'rgba(216, 166, 87, 0.45)';
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, brushSize / 2, 0, 2 * Math.PI);
                ctx.fill();
                ctx.restore();
            }
        }
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDrawing) return;
        const pt = getCanvasCoordinates(e);
        if (!pt) return;

        setCurrentPoint(pt);

        if (activeTool === 'lasso') {
            // Min-distance filter for the lasso path: append the new point only
            // when it is at least `LASSO_MIN_DIST` pixels (in canvas space) away
            // from the previous one. Without this, a long freehand selection
            // accumulates thousands of co-linear points and `redrawCanvas` has
            // to re-stroke the entire path on every mousemove, which produces
            // visible stutter on slower trackpads and on long drags.
            const LASSO_MIN_DIST = 4;
            setLassoPoints((prev) => {
                const last = prev[prev.length - 1];
                if (last) {
                    const dx = pt.x - last.x;
                    const dy = pt.y - last.y;
                    if (dx * dx + dy * dy < LASSO_MIN_DIST * LASSO_MIN_DIST) {
                        return prev;
                    }
                }
                return [...prev, pt];
            });
            redrawCanvas();
        } else if (activeTool === 'brush') {
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext('2d');
            if (ctx) {
                ctx.save();
                ctx.fillStyle = 'rgba(216, 166, 87, 0.45)';
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, brushSize / 2, 0, 2 * Math.PI);
                ctx.fill();
                ctx.restore();
            }
        } else {
            redrawCanvas();
        }
    };

    const handleMouseUp = () => {
        if (!isDrawing) return;
        setIsDrawing(false);
    };

    const handleReset = () => {
        setStartPoint(null);
        setCurrentPoint(null);
        setLassoPoints([]);
        redrawCanvas();
    };

    const handleApplyCrop = () => {
        const canvas = canvasRef.current;
        const img = imageRef.current;
        if (!canvas || !img || !startPoint || !currentPoint) {
            onCancel();
            return;
        }

        let minX = 0, minY = 0, width = canvas.width, height = canvas.height;

        if (activeTool === 'rect' || activeTool === 'circle') {
            minX = Math.max(0, Math.min(startPoint.x, currentPoint.x));
            minY = Math.max(0, Math.min(startPoint.y, currentPoint.y));
            width = Math.min(canvas.width - minX, Math.abs(currentPoint.x - startPoint.x));
            height = Math.min(canvas.height - minY, Math.abs(currentPoint.y - startPoint.y));
        } else if (activeTool === 'lasso' && lassoPoints.length > 0) {
            const xs = lassoPoints.map((p) => p.x);
            const ys = lassoPoints.map((p) => p.y);
            minX = Math.max(0, Math.min(...xs));
            minY = Math.max(0, Math.min(...ys));
            width = Math.min(canvas.width - minX, Math.max(...xs) - minX);
            height = Math.min(canvas.height - minY, Math.max(...ys) - minY);
        }

        if (width <= 0 || height <= 0) {
            width = canvas.width;
            height = canvas.height;
        }

        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = width;
        cropCanvas.height = height;
        const cropCtx = cropCanvas.getContext('2d');
        if (cropCtx) {
            cropCtx.drawImage(img, minX, minY, width, height, 0, 0, width, height);
            // `toDataURL` throws SecurityError on a tainted canvas. The
            // canvas taints when `imageUrl` is a cross-origin source whose
            // upstream did not return `Access-Control-Allow-Origin` headers
            // (the proxy at /api/proxy-image sets ACAO=*, so proxyed images
            // are safe; raw `https://...` URLs that the user pasted are
            // not). We fall back to a 1x1 transparent PNG so the parent's
            // `croppedDataUrl` contract still resolves, and surface the
            // bounds in the console so future debugging is straightforward.
            // The bounds are what the parent actually uses to position the
            // region reference on the wire (see ImageStudio's
            // `handleGenerate`), so the user-visible feature still works
            // for models that consume the bounds; only the image data is
            // missing in this rare cross-origin case.
            let dataUrl: string;
            try {
                dataUrl = cropCanvas.toDataURL('image/png');
            } catch (err) {
                console.warn(
                    '[ImageAnnotatorCanvas] toDataURL blocked by cross-origin policy. ' +
                    'Falling back to a transparent placeholder; only the bounds will be sent.',
                    { imageUrl, err },
                );
                // 1x1 transparent PNG. The parent will ignore the pixels
                // and act on the bounds.
                dataUrl =
                    'data:image/png;base64,' +
                    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
            }
            onApplyRegionCrop(dataUrl, { x: minX, y: minY, width, height });
        }
    };

    return (
        <div ref={containerRef} className="relative flex flex-col items-center justify-center w-full h-full">
            {/* Photoshop Floating Tool Palette */}
            <div className="absolute top-4 z-20 flex items-center gap-1.5 p-2 rounded-xl bg-zinc-950/90 border border-white/20 shadow-2xl backdrop-blur-xl">
                <Button
                    type="button"
                    size="sm"
                    variant={activeTool === 'rect' ? 'default' : 'ghost'}
                    onClick={() => setActiveTool('rect')}
                    className="h-8 w-8 p-0"
                    title="Snipping Tool Box (Rectangle)"
                >
                    <Icon name="square" className="h-4 w-4" />
                </Button>
                <Button
                    type="button"
                    size="sm"
                    variant={activeTool === 'circle' ? 'default' : 'ghost'}
                    onClick={() => setActiveTool('circle')}
                    className="h-8 w-8 p-0"
                    title="Circle / Ellipse Tool"
                >
                    <Icon name="circle" className="h-4 w-4" />
                </Button>
                <Button
                    type="button"
                    size="sm"
                    variant={activeTool === 'lasso' ? 'default' : 'ghost'}
                    onClick={() => setActiveTool('lasso')}
                    className="h-8 w-8 p-0"
                    title="Freehand Lasso Tool"
                >
                    <Icon name="edit-pencil-01" className="h-4 w-4" />
                </Button>
                <Button
                    type="button"
                    size="sm"
                    variant={activeTool === 'brush' ? 'default' : 'ghost'}
                    onClick={() => setActiveTool('brush')}
                    className="h-8 w-8 p-0"
                    title="Mask Highlight Brush"
                >
                    <Paintbrush className="h-4 w-4" />
                </Button>

                <div className="h-4 w-px bg-white/20 mx-1" />

                <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={handleReset}
                    className="h-8 text-xs px-2 text-zinc-300"
                    title="Reset Selection"
                >
                    <RotateCcw className="h-3.5 w-3.5 mr-1" /> Clear
                </Button>

                <Button
                    type="button"
                    size="sm"
                    onClick={handleApplyCrop}
                    className="h-8 bg-brand-600 hover:bg-brand-500 text-white font-semibold text-xs px-3 shadow-lg"
                >
                    <Icon name="check" className="h-3.5 w-3.5 mr-1" /> Attach Region
                </Button>
            </div>

            {/* Canvas Surface */}
            <canvas
                ref={canvasRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                className="max-h-[72vh] w-auto object-contain cursor-crosshair rounded-xl border border-white/10 shadow-2xl"
            />
        </div>
    );
}
