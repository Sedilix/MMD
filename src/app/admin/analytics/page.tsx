"use client";

/**
 * /admin/analytics — first-party site analytics, sourced from the
 * page_views collection that src/components/analytics/PageviewTracker.tsx
 * writes once a visitor accepts the cookie banner (src/lib/site-consent.ts).
 * Nothing here comes from a third-party vendor; declined visitors never
 * appear because the client never sends their events.
 *
 * Admin-only via the /admin layout guard; the data itself comes from
 * /api/admin/analytics, which re-checks admin auth server-side.
 */

import React, { useEffect, useState, useCallback } from "react";
import { Icon } from "@/components/ui/icon";
import { useUser } from "@/firebase";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { cn } from "@/lib/utils";

interface TopPath {
  path: string;
  count: number;
}

interface DayCount {
  date: string;
  count: number;
}

interface RecentEvent {
  path: string;
  anonId: string;
  signedIn: boolean;
  createdAt: string;
}

interface AnalyticsResponse {
  windowSize: number;
  windowCapped: boolean;
  totalViews: number;
  uniqueVisitors: number;
  signedInViews: number;
  topPaths: TopPath[];
  viewsByDay: DayCount[];
  recent: RecentEvent[];
}

function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
      <div className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-zinc-500">{label}</div>
      <div className="mt-1.5 text-2xl font-bold text-zinc-50">{value}</div>
      {hint && <div className="mt-1 text-[11px] text-zinc-500">{hint}</div>}
    </div>
  );
}

export default function AnalyticsDashboard() {
  const { user } = useUser();
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/analytics", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Request failed (${res.status})`);
      }
      setData(await res.json());
    } catch (e: any) {
      setError(e?.message || "Failed to load analytics.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-brand-400 mb-1">
            <Icon name="data" className="h-4 w-4" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Site Analytics</span>
          </div>
          <h1 className="text-2xl font-bold text-zinc-50">Pageviews & visitor telemetry</h1>
          <p className="mt-1 text-sm text-zinc-400 max-w-2xl">
            First-party only — no third-party vendor. Sourced from visitors who accepted the cookie
            banner; declining opts a visitor out entirely, so this undercounts total traffic by design.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs font-semibold text-zinc-300 hover:border-brand-500/40 hover:text-brand-300 transition-colors disabled:opacity-50"
        >
          <Icon name="refresh" className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-4 text-sm text-rose-300">
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="text-sm text-zinc-500">Loading…</div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Pageviews" value={data.totalViews} hint={data.windowCapped ? `capped at last ${data.windowSize}` : "all recorded events"} />
            <StatCard label="Unique visitors" value={data.uniqueVisitors} hint="by anon-id cookie" />
            <StatCard label="Signed-in views" value={data.signedInViews} />
            <StatCard label="Top page" value={data.topPaths[0]?.path ?? "—"} hint={data.topPaths[0] ? `${data.topPaths[0].count} views` : undefined} />
          </div>

          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
            <div className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-zinc-500 mb-3">
              Views by day (last 14)
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.viewsByDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: "#71717a", fontSize: 10 }} tickLine={false} axisLine={{ stroke: "#3f3f46" }} />
                  <YAxis allowDecimals={false} tick={{ fill: "#71717a", fontSize: 10 }} tickLine={false} axisLine={false} width={28} />
                  <Tooltip
                    contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: "#e4e4e7" }}
                  />
                  <Bar dataKey="count" fill="#d8a657" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
              <div className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-zinc-500 mb-3">
                Top pages
              </div>
              <div className="space-y-1.5">
                {data.topPaths.length === 0 && <div className="text-xs text-zinc-500">No data yet.</div>}
                {data.topPaths.map((p) => (
                  <div key={p.path} className="flex items-center justify-between gap-3 py-1.5 border-b border-zinc-800/50 last:border-0">
                    <span className="text-xs font-mono text-zinc-300 truncate">{p.path}</span>
                    <span className="text-xs font-semibold text-brand-300 shrink-0">{p.count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
              <div className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-zinc-500 mb-3">
                Recent activity
              </div>
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {data.recent.length === 0 && <div className="text-xs text-zinc-500">No data yet.</div>}
                {data.recent.map((e, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 py-1.5 border-b border-zinc-800/50 last:border-0">
                    <div className="min-w-0">
                      <div className="text-xs font-mono text-zinc-300 truncate">{e.path}</div>
                      <div className="text-[10px] text-zinc-500">
                        {new Date(e.createdAt).toLocaleString()} · {e.anonId.slice(0, 8)}
                      </div>
                    </div>
                    <span
                      className={cn(
                        "text-[9px] font-bold uppercase tracking-wider shrink-0 rounded-full px-2 py-0.5 border",
                        e.signedIn
                          ? "text-emerald-300 border-emerald-500/30 bg-emerald-500/10"
                          : "text-zinc-400 border-zinc-700 bg-zinc-800/50",
                      )}
                    >
                      {e.signedIn ? "signed in" : "anon"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
