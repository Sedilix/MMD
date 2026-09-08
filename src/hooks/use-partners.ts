"use client";

import { useEffect, useState } from 'react';
import type { Partner } from '@/lib/partners';

interface UsePartnersResult {
    partners: Partner[];
    loading: boolean;
    error: string | null;
}

// Shared across every usePartners() instance on the page, so mounting the
// marquee/hero more than once doesn't refire /api/partners per instance.
let inflight: Promise<{ partners: Partner[] }> | null = null;

function fetchPartnersOnce(): Promise<{ partners: Partner[] }> {
    if (!inflight) {
        inflight = fetch('/api/partners')
            .then(async (r) => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.json() as Promise<{ partners: Partner[] }>;
            })
            .catch((e) => {
                inflight = null; // allow a retry on the next mount
                throw e;
            });
    }
    return inflight;
}

/**
 * Client-side hook over /api/partners. The data is cached server-side for an
 * hour (see route revalidate) and deduped client-side across instances, so
 * this hook fetches once per page and keeps the result in state. Subsequent
 * renders use the cached value.
 */
export function usePartners(): UsePartnersResult {
    const [partners, setPartners] = useState<Partner[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetchPartnersOnce()
            .then((d) => {
                if (cancelled) return;
                setPartners(d.partners ?? []);
                setError(null);
            })
            .catch((e: any) => {
                if (cancelled) return;
                setError(e?.message ?? 'Failed to load partners');
            })
            .finally(() => {
                if (cancelled) return;
                setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    return { partners, loading, error };
}