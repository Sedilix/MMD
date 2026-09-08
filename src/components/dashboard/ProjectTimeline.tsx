"use client"

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Icon } from '@/components/ui/icon';
import { useFirestore, useUser } from '@/firebase';
import { collection, query, onSnapshot, updateDoc, doc } from 'firebase/firestore';
import { Activity } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────
interface Project {
  id: string;
  title: string;
  description?: string;
  status: string;
  assignedTo: string[];
  createdAt: any;
  startDate?: string;  // ISO date string, optional (we add via inline edit)
  endDate?: string;    // ISO date string, optional
  progress?: number;
}

// ── Zoom levels ───────────────────────────────────────────────────────────────
type ZoomLevel = 'Days' | 'Weeks' | 'Months' | 'Years';

const ZOOM_COL_PX: Record<ZoomLevel, number> = {
  Days:   28,
  Weeks:  56,
  Months: 90,
  Years:  180,
};

// ── Colour palette per status / index ─────────────────────────────────────────
const BAR_COLORS = [
  { bg: '#6366f1', light: '#818cf8', dark: '#4338ca' }, // indigo
  { bg: '#d8a657', light: '#e9c884', dark: '#a87231' }, // cyan
  { bg: '#a855f7', light: '#c084fc', dark: '#7c3aed' }, // purple
  { bg: '#ec4899', light: '#f472b6', dark: '#be185d' }, // pink
  { bg: '#f59e0b', light: '#fbbf24', dark: '#d97706' }, // amber
  { bg: '#10b981', light: '#34d399', dark: '#059669' }, // emerald
];

function barColor(i: number) { return BAR_COLORS[i % BAR_COLORS.length]; }

// ── Date helpers ──────────────────────────────────────────────────────────────
function toDate(val: any): Date {
  if (!val) return new Date();
  if (typeof val === 'string') return new Date(val);
  if (val?.seconds) return new Date(val.seconds * 1000);
  return new Date(val);
}

function addDays(d: Date, n: number) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}
function addMonths(d: Date, n: number) {
  const r = new Date(d); r.setMonth(r.getMonth() + n); return r;
}
function diffDays(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function startOfWeek(d: Date) {
  const r = new Date(d); r.setDate(r.getDate() - r.getDay()); return r;
}
function startOfYear(d: Date) { return new Date(d.getFullYear(), 0, 1); }

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ── Build column headers for the zoom level ───────────────────────────────────
interface Col { label: string; sub?: string; days: number; date: Date }

function buildCols(viewStart: Date, zoom: ZoomLevel, totalCols: number): Col[] {
  const cols: Col[] = [];
  let cursor = new Date(viewStart);

  for (let i = 0; i < totalCols; i++) {
    if (zoom === 'Days') {
      cols.push({ label: cursor.getDate().toString(), sub: MONTH_SHORT[cursor.getMonth()], days: 1, date: new Date(cursor) });
      cursor = addDays(cursor, 1);
    } else if (zoom === 'Weeks') {
      const wStart = startOfWeek(cursor);
      cols.push({ label: `W${Math.ceil(cursor.getDate() / 7)}`, sub: `${MONTH_SHORT[cursor.getMonth()]} ${cursor.getFullYear()}`, days: 7, date: new Date(wStart) });
      cursor = addDays(cursor, 7);
    } else if (zoom === 'Months') {
      cols.push({ label: MONTH_SHORT[cursor.getMonth()], sub: cursor.getFullYear().toString(), days: new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate(), date: startOfMonth(cursor) });
      cursor = addMonths(cursor, 1);
    } else {
      cols.push({ label: cursor.getFullYear().toString(), sub: '', days: 365, date: startOfYear(cursor) });
      cursor = new Date(cursor.getFullYear() + 1, 0, 1);
    }
  }
  return cols;
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
function BarTooltip({ project, color, x, y }: { project: Project; color: typeof BAR_COLORS[0]; x: number; y: number }) {
  const start = toDate(project.startDate || project.createdAt);
  const end   = project.endDate ? toDate(project.endDate) : addDays(start, 30);
  return (
    <div
      className="pointer-events-none absolute z-50 min-w-[200px] rounded-xl border text-sm shadow-2xl"
      style={{
        left: x + 12, top: y - 10,
        background: '#0f172a',
        border: `1px solid ${color.bg}55`,
        boxShadow: `0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px ${color.bg}22`,
      }}
    >
      <div className="px-4 py-3 border-b" style={{ borderColor: `${color.bg}33` }}>
        <p className="font-bold text-white truncate max-w-[220px]">{project.title}</p>
        <span className={`inline-block mt-1 text-[10px] font-mono uppercase px-2 py-0.5 rounded ${
          project.status === 'active'    ? 'bg-emerald-500/20 text-emerald-300' :
          project.status === 'completed' ? 'bg-blue-500/20 text-blue-300' :
                                          'bg-white/10 text-white/40'
        }`}>{project.status}</span>
      </div>
      <div className="px-4 py-3 space-y-1.5 text-white/60 text-xs font-mono">
        <div className="flex justify-between gap-4">
          <span>Start</span>
          <span className="text-white/80">{start.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>End</span>
          <span className="text-white/80">{end.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>Duration</span>
          <span className="text-white/80">{diffDays(start, end)}d</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>Team</span>
          <span className="text-white/80">{project.assignedTo?.length ?? 0} agent{(project.assignedTo?.length ?? 0) !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>
  );
}

interface ProjectTimelineProps {
  projectId?: string;
  readOnly?: boolean;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ProjectTimeline({ projectId, readOnly }: ProjectTimelineProps = {}) {
  const { user }  = useUser();
  const firestore = useFirestore();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [zoom,     setZoom]     = useState<ZoomLevel>('Months');
  const [tooltip,  setTooltip]  = useState<{ project: Project; x: number; y: number; color: typeof BAR_COLORS[0] } | null>(null);

  const ZOOMS: ZoomLevel[] = ['Days', 'Weeks', 'Months', 'Years'];
  const COL_PX = ZOOM_COL_PX[zoom];
  const TOTAL_COLS = zoom === 'Days' ? 90 : zoom === 'Weeks' ? 52 : zoom === 'Months' ? 24 : 5;
  const ROW_H = 48;
  const LEFT_W = 220;

  // ── Firestore ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!firestore) return;
    const unsub = onSnapshot(query(collection(firestore, 'projects')), snap => {
      const arr: Project[] = [];
      snap.forEach(d => arr.push({ id: d.id, ...d.data() } as Project));
      setProjects(arr);
      setLoading(false);
    });
    return () => unsub();
  }, [firestore]);

  const myProjects = useMemo(() => {
    if (projectId) {
      return projects.filter(p => p.id === projectId);
    }
    return projects.filter(p => p.assignedTo?.includes(user?.email ?? ''));
  }, [projects, user, projectId]);

  // ── View window start = earliest project start, snapped to period ──────────
  const viewStart = useMemo(() => {
    const dates = myProjects.map(p => toDate(p.startDate || p.createdAt));
    const earliest = dates.length ? new Date(Math.min(...dates.map(d => d.getTime()))) : new Date();
    if (zoom === 'Months' || zoom === 'Years') return startOfMonth(addMonths(earliest, -1));
    if (zoom === 'Weeks') return startOfWeek(addDays(earliest, -7));
    return addDays(earliest, -3);
  }, [myProjects, zoom]);

  const cols = useMemo(() => buildCols(viewStart, zoom, TOTAL_COLS), [viewStart, zoom, TOTAL_COLS]);

  const todayOffset = useMemo(() => {
    const total = cols.reduce((acc, c) => acc + c.days, 0);
    const totalPx = TOTAL_COLS * COL_PX;
    const d = diffDays(viewStart, new Date());
    return d < 0 ? -1 : (d / total) * totalPx;
  }, [cols, viewStart, COL_PX, TOTAL_COLS]);

  // ── Compute bar position for a project ────────────────────────────────────
  function barGeometry(project: Project) {
    const start = toDate(project.startDate || project.createdAt);
    const durationDays = project.endDate
      ? diffDays(start, toDate(project.endDate))
      : zoom === 'Days' ? 7 : zoom === 'Weeks' ? 28 : zoom === 'Months' ? 60 : 180;

    const totalDays = cols.reduce((a, c) => a + c.days, 0);
    const totalPx   = TOTAL_COLS * COL_PX;

    const startOffset = diffDays(viewStart, start);
    const left = (startOffset / totalDays) * totalPx;
    const width = Math.max(COL_PX * 0.5, (durationDays / totalDays) * totalPx);
    return { left, width };
  }

  // ── Month separator positions ──────────────────────────────────────────────
  const separators = useMemo(() => {
    if (zoom === 'Days' || zoom === 'Weeks') return [];
    const out: number[] = [];
    let x = 0;
    cols.forEach(c => { x += COL_PX; out.push(x); });
    return out;
  }, [cols, COL_PX, zoom]);

  // ── Scroll container ref for horizontal scroll ─────────────────────────────
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToToday = () => {
    if (scrollRef.current && todayOffset > 0) {
      scrollRef.current.scrollLeft = todayOffset - scrollRef.current.clientWidth / 2;
    }
  };

  useEffect(() => { scrollToToday(); }, [todayOffset]);

  // ── Year/Month group labels above months ──────────────────────────────────
  const yearGroups = useMemo(() => {
    if (zoom !== 'Months') return [];
    const groups: { year: number; startCol: number; count: number }[] = [];
    cols.forEach((c, i) => {
      const y = c.date.getFullYear();
      const last = groups[groups.length - 1];
      if (last && last.year === y) last.count++;
      else groups.push({ year: y, startCol: i, count: 1 });
    });
    return groups;
  }, [cols, zoom]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32 text-white/50">
        <Activity className="w-6 h-6 animate-spin mr-3 text-blue-400" />
        <span className="text-sm font-mono uppercase tracking-widest">Loading Timeline...</span>
      </div>
    );
  }

  const totalGridPx = TOTAL_COLS * COL_PX;

  return (
    <div
      className="w-full rounded-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col"
      style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #0a1628 60%, #0d1b2e 100%)',
        border: '1px solid rgba(59,130,246,0.15)',
        boxShadow: '0 25px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)',
        minHeight: 520,
      }}
    >
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="px-6 pt-6 pb-4 border-b border-white/5 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Project Timeline</h1>
          <p className="text-[10px] font-mono text-white/35 uppercase tracking-widest mt-0.5">
            Gantt · {myProjects.length} Project{myProjects.length !== 1 ? 's' : ''} · Live
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Today button */}
          <button
            onClick={scrollToToday}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold text-white/70 bg-white/5 border border-white/10 hover:bg-white/10 hover:text-white transition-all"
          >
            <Icon name="calendar-days" className="w-3.5 h-3.5" />
            Today
          </button>

          {/* Zoom tabs */}
          <div className="flex items-center bg-white/5 border border-white/10 rounded-lg p-0.5 gap-0.5">
            {ZOOMS.map(z => (
              <button
                key={z}
                onClick={() => setZoom(z)}
                className={`px-3 py-1.5 rounded-md text-[11px] font-mono font-semibold transition-all ${
                  zoom === z
                    ? 'bg-blue-500 text-white shadow-md shadow-blue-500/30'
                    : 'text-white/50 hover:text-white/80'
                }`}
              >
                {z}
              </button>
            ))}
          </div>

          {/* Live badge */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            <span className="text-[10px] font-mono text-blue-300 uppercase tracking-widest">Live</span>
          </div>
        </div>
      </div>

      {myProjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-4 text-white/30 py-24">
          <Icon name="folder-open" className="w-12 h-12 opacity-30" />
          <p className="text-sm font-mono uppercase tracking-widest">No projects assigned to you yet</p>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* ── Left frozen label column ─────────────────────────────────── */}
          <div
            className="shrink-0 border-r border-white/8"
            style={{ width: LEFT_W, background: 'rgba(15,23,42,0.9)', zIndex: 10 }}
          >
            {/* Header row spacer */}
            <div
              className="border-b border-white/5"
              style={{ height: zoom === 'Months' ? 64 : 40, background: 'rgba(255,255,255,0.02)' }}
            >
              <div className="flex items-center px-4 h-full">
                <span className="text-[10px] font-mono text-white/30 uppercase tracking-widest">Project</span>
              </div>
            </div>

            {/* Row labels */}
            {myProjects.map((proj, i) => {
              const color = barColor(i);
              return (
                <div
                  key={proj.id}
                  className="flex items-center gap-3 px-4 border-b border-white/5 hover:bg-white/[0.03] transition-colors group"
                  style={{ height: ROW_H }}
                >
                  <div
                    className="w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ background: color.bg, boxShadow: `0 0 6px ${color.bg}66` }}
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white/85 truncate leading-tight">{proj.title}</p>
                    <p className="text-[9px] font-mono text-white/30 uppercase">{proj.status}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Scrollable Gantt area ────────────────────────────────────── */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-x-auto overflow-y-hidden"
            style={{ scrollbarColor: 'rgba(59,130,246,0.4) transparent' }}
          >
            <div style={{ width: totalGridPx, minHeight: '100%', position: 'relative' }}>

              {/* ── Column header row ──────────────────────────────────────── */}
              <div
                className="sticky top-0 z-20 flex border-b border-white/5"
                style={{ height: zoom === 'Months' ? 64 : 40, background: 'rgba(10,22,40,0.97)' }}
              >
                {/* Year group labels above months */}
                {zoom === 'Months' && (
                  <div className="absolute top-0 left-0 flex" style={{ height: 24 }}>
                    {yearGroups.map((g, i) => (
                      <div
                        key={i}
                        className="flex items-center px-2 border-r border-white/5"
                        style={{ width: g.count * COL_PX }}
                      >
                        <span className="text-[10px] font-mono text-white/50 font-semibold">{g.year}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Month/Week/Day labels */}
                <div
                  className="absolute left-0 flex"
                  style={{ top: zoom === 'Months' ? 24 : 0, height: zoom === 'Months' ? 40 : 40 }}
                >
                  {cols.map((col, i) => {
                    const isToday =
                      zoom === 'Days' &&
                      diffDays(col.date, new Date()) === 0;
                    return (
                      <div
                        key={i}
                        className={`flex flex-col items-center justify-center border-r border-white/5 ${isToday ? 'bg-blue-500/15' : ''}`}
                        style={{ width: COL_PX }}
                      >
                        <span className={`text-[10px] font-mono font-semibold ${isToday ? 'text-blue-300' : 'text-white/60'}`}>
                          {col.label}
                        </span>
                        {col.sub && zoom !== 'Years' && (
                          <span className="text-[8px] font-mono text-white/25">{col.sub}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── Row grid ──────────────────────────────────────────────── */}
              <div style={{ position: 'relative' }}>

                {/* Vertical col separators */}
                {cols.map((_, i) => (
                  <div
                    key={i}
                    className="absolute top-0 bottom-0 border-r border-white/[0.04]"
                    style={{ left: (i + 1) * COL_PX }}
                  />
                ))}

                {/* Today line */}
                {todayOffset > 0 && (
                  <div
                    className="absolute top-0 bottom-0 z-10"
                    style={{ left: todayOffset, width: 2, background: 'linear-gradient(to bottom, #f43f5e, #fb7185aa)' }}
                  >
                    <div
                      className="absolute -top-1 -translate-x-1/2 text-[9px] font-bold font-mono text-white px-1.5 py-0.5 rounded"
                      style={{ background: '#f43f5e' }}
                    >
                      TODAY
                    </div>
                  </div>
                )}

                {/* Project rows */}
                {myProjects.map((proj, i) => {
                  const color = barColor(i);
                  const { left, width } = barGeometry(proj);
                  const pct = typeof proj.progress === 'number'
                    ? proj.progress
                    : proj.status === 'completed' ? 100
                    : proj.status === 'active' ? 60 : 20;

                  return (
                    <div
                      key={proj.id}
                      className="relative border-b border-white/5 flex items-center"
                      style={{ height: ROW_H }}
                    >
                      {/* Subtle row stripe */}
                      {i % 2 === 0 && (
                        <div className="absolute inset-0 bg-white/[0.012]" />
                      )}

                      {/* The bar */}
                      <div
                        className="absolute top-1/2 -translate-y-1/2 rounded-md cursor-pointer select-none group/bar"
                        style={{
                          left: Math.max(0, left),
                          width: Math.min(width, totalGridPx - Math.max(0, left)),
                          height: 28,
                          background: `linear-gradient(90deg, ${color.dark}, ${color.bg})`,
                          boxShadow: `0 2px 12px ${color.bg}44`,
                          transition: 'filter 0.15s',
                        }}
                        onMouseEnter={e => {
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          setTooltip({ project: proj, x: rect.left, y: rect.top, color });
                        }}
                        onMouseLeave={() => setTooltip(null)}
                      >
                        {/* Progress fill */}
                        <div
                          className="absolute inset-0 rounded-md opacity-30"
                          style={{
                            width: `${pct}%`,
                            background: 'rgba(255,255,255,0.35)',
                            transition: 'width 1s ease',
                          }}
                        />
                        {/* Label */}
                        <div className="absolute inset-0 flex items-center px-2.5 overflow-hidden">
                          <span className="text-[11px] font-semibold text-white truncate drop-shadow-sm">
                            {proj.title}
                          </span>
                        </div>
                        {/* Hover brightness */}
                        <div className="absolute inset-0 rounded-md opacity-0 group-hover/bar:opacity-100 bg-white/10 transition-opacity" />
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ── Floating tooltip (portal-style, fixed) ─────────────────────── */}
      {tooltip && (
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}
        >
          <div
            className="min-w-[200px] rounded-xl border text-sm shadow-2xl"
            style={{
              background: '#0f172a',
              border: `1px solid ${tooltip.color.bg}55`,
              boxShadow: `0 8px 32px rgba(0,0,0,0.7), 0 0 0 1px ${tooltip.color.bg}22`,
            }}
          >
            <div className="px-4 py-3 border-b" style={{ borderColor: `${tooltip.color.bg}33` }}>
              <p className="font-bold text-white truncate max-w-[220px]">{tooltip.project.title}</p>
              <span className={`inline-block mt-1 text-[10px] font-mono uppercase px-2 py-0.5 rounded ${
                tooltip.project.status === 'active'    ? 'bg-emerald-500/20 text-emerald-300' :
                tooltip.project.status === 'completed' ? 'bg-blue-500/20 text-blue-300' :
                                                        'bg-white/10 text-white/40'
              }`}>{tooltip.project.status}</span>
            </div>
            <div className="px-4 py-3 space-y-1.5 text-white/60 text-xs font-mono">
              {(() => {
                const start = toDate(tooltip.project.startDate || tooltip.project.createdAt);
                const end = tooltip.project.endDate ? toDate(tooltip.project.endDate) : addDays(start, 60);
                return (
                  <>
                    <div className="flex justify-between gap-4">
                      <span>Start</span>
                      <span className="text-white/80">{start.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span>End</span>
                      <span className="text-white/80">{end.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span>Duration</span>
                      <span className="text-white/80">{diffDays(start, end)}d</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span>Team</span>
                      <span className="text-white/80">{tooltip.project.assignedTo?.length ?? 0} agent{(tooltip.project.assignedTo?.length ?? 0) !== 1 ? 's' : ''}</span>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
