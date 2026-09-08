'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface StreamingIndicatorProps {
    /** Tokens streamed so far. */
    tokens: number;
    /** Whether the stream is active. */
    isStreaming: boolean;
    /** TTFT in ms — used to estimate total response length for progress %. */
    ttftMs: number | null;
    /** Extra class on the indicator wrapper. */
    className?: string;
}

export function StreamingIndicator({ tokens, isStreaming, ttftMs, className }: StreamingIndicatorProps) {
    const [elapsed, setElapsed] = useState(0);
    const [pct, setPct] = useState(0);
    const startRef = useRef<number | null>(null);

    // Estimate total tokens based on TTFT heuristic.
    const estimatedTotal = ttftMs !== null
        ? ttftMs < 500 ? 200 : ttftMs < 2000 ? 600 : 1500
        : 600;

    useEffect(() => {
        if (!isStreaming) { setElapsed(0); startRef.current = null; return; }
        startRef.current = startRef.current ?? Date.now();
        const id = setInterval(() => {
            if (startRef.current !== null) setElapsed(Date.now() - startRef.current);
        }, 500);
        return () => clearInterval(id);
    }, [isStreaming]);

    useEffect(() => {
        if (!isStreaming) { setPct(0); return; }
        const progress = Math.min(100, Math.round((tokens / estimatedTotal) * 100));
        setPct(progress);
    }, [tokens, isStreaming, estimatedTotal]);

    if (!isStreaming) return null;

    // SVG ring parameters
    const r = 12;
    const circ = 2 * Math.PI * r;
    const dashOffset = circ * (1 - pct / 100);

    // Build the time string using a normal function to avoid template-literal escape issues
    function pad2(n: number) { return n.toString().padStart(2, '0'); }
    const timeStr = pad2(Math.floor(elapsed / 60000)) + ':' + pad2(Math.floor((elapsed % 60000) / 1000));

    return (
        <div className={cn('flex items-center gap-2', className)}>
            <div className='relative flex items-center justify-center w-7 h-7 shrink-0'>
                <svg className='animate-spin' width='28' height='28' viewBox='0 0 28 28' aria-hidden>
                    <circle cx='14' cy='14' r={r} fill='none' stroke='rgba(216, 166, 87,0.15)' strokeWidth='2' />
                    <circle
                        cx='14' cy='14' r={r} fill='none'
                        stroke='rgba(216, 166, 87,0.7)' strokeWidth='2' strokeLinecap='round'
                        strokeDasharray={circ} strokeDashoffset={dashOffset}
                        transform='rotate(-90 14 14)'
                        style={{ transition: 'stroke-dashoffset 0.4s ease' }}
                    />
                </svg>
                <span className='absolute inset-0 flex items-center justify-center'>
                    <span className='w-1.5 h-1.5 rounded-full bg-brand-400 animate-ping opacity-75' />
                </span>
            </div>
            <div className='flex flex-col gap-0.5'>
                <span className='text-[10px] font-medium text-brand-400 leading-none'>
                    {pct > 0 ? pct + '%' : 'Streaming'}
                </span>
                <span className='text-[9px] text-white/40 font-mono leading-none'>
                    {tokens.toLocaleString()} tok · {timeStr}
                </span>
            </div>
        </div>
    );
}
