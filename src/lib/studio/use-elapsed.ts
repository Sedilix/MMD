'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Honest elapsed-time ticker for long-running studio jobs.
 *
 * Video synthesis takes minutes and image batches take tens of seconds; a
 * bare spinner tells the user nothing about whether the job is stuck or
 * progressing. This hook ticks every second from `start` (ms epoch) until
 * `running` flips false, returning a stable `"<n>s"` label for loading UIs.
 *
 * It only counts while `running` is true, so a cancelled/finished job stops
 * the clock the same frame the caller clears the loading state.
 */
export function useElapsed(running: boolean): { seconds: number; label: string } {
    const [seconds, setSeconds] = useState(0);
    const startRef = useRef<number | null>(null);

    useEffect(() => {
        if (!running) {
            // Reset for the next run so a fresh generation starts at 0s.
            startRef.current = null;
            setSeconds(0);
            return;
        }
        startRef.current = Date.now();
        setSeconds(0);
        const id = window.setInterval(() => {
            if (startRef.current == null) return;
            const elapsed = Math.max(0, Math.floor((Date.now() - startRef.current) / 1000));
            setSeconds(elapsed);
        }, 1000);
        return () => window.clearInterval(id);
    }, [running]);

    const label = seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
    return { seconds, label };
}