"use client"

import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '@/components/ui/icon';
import { useFirestore, useUser } from '@/firebase';
import { collection, query, onSnapshot, doc, updateDoc, addDoc } from 'firebase/firestore';
import { useProjectTasks } from '@/hooks/use-project-tasks';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { Activity, Inbox, Sparkles } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────
interface Project {
  id: string;
  title: string;
  description?: string;
  status: string;
  assignedTo: string[];
  createdAt: any;
  progressMode?: 'auto' | 'manual';
  manualProgress?: number;
  progress?: number;
  projectHealth?: 'on-track' | 'at-risk' | 'blocked';
  latestStatusNote?: string;
  latestStatusNoteAt?: any;
  latestStatusNoteBy?: string;
  aiInsights?: string;
  aiInsightsGeneratedAt?: any;
  githubRepoUrl?: string;
  originalTimelineWeeks?: number;
  currentEstimatedWeeks?: number;
}

interface ClientRequest {
  id: string;
  clientName: string;
  clientEmail?: string;
  request?: string;
  status: string;
  createdAt: any;
  agentId: string;
  agentName?: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ── Radial gauge ─────────────────────────────────────────────────────────────
function RadialGauge({ value, label }: { value: number; label?: string }) {
  const r = 54;
  const circ = 2 * Math.PI * r;
  const dash = circ * 0.75;
  const gap = circ - dash;
  const pct = Math.min(value / 100, 1);

  return (
    <div className="flex flex-col items-center justify-center gap-1">
      <svg width="130" height="100" viewBox="0 0 130 100">
        <circle cx="65" cy="75" r={r} fill="none"
          stroke="rgba(255,255,255,0.08)" strokeWidth="10"
          strokeDasharray={`${dash} ${gap}`} strokeLinecap="round"
          transform="rotate(-135 65 75)" />
        <circle cx="65" cy="75" r={r} fill="none"
          stroke="url(#gGrad)" strokeWidth="10"
          strokeDasharray={`${dash * pct} ${circ - dash * pct}`}
          strokeLinecap="round" transform="rotate(-135 65 75)"
          style={{ transition: 'stroke-dasharray 1s ease' }} />
        <defs>
          <linearGradient id="gGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#d8a657" />
          </linearGradient>
        </defs>
        <text x="65" y="70" textAnchor="middle" fill="white" fontSize="20" fontWeight="700">
          {Math.round(value)}%
        </text>
        <text x="65" y="84" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="9">
          {label ?? 'Completion'}
        </text>
      </svg>
      <div className="flex justify-between w-[100px] text-[9px] font-mono text-white/30">
        <span>0%</span><span>100%</span>
      </div>
    </div>
  );
}

// ── Stat tile ────────────────────────────────────────────────────────────────
function StatTile({ icon, label, value, accent = '#3b82f6' }: {
  icon: React.ReactNode; label: string; value: string | number; accent?: string;
}) {
  return (
    <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/[0.07] transition-all">
      <div>
        <p className="text-[10px] font-mono uppercase tracking-widest text-white/40">{label}</p>
        <p className="text-2xl font-bold text-white mt-1">{value}</p>
      </div>
      <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: `${accent}22`, border: `1px solid ${accent}44` }}>
        <span className="w-5 h-5" style={{ color: accent }}>{icon}</span>
      </div>
    </div>
  );
}

// ── Project dropdown ──────────────────────────────────────────────────────────
function ProjectDropdown({
  projects, selected, onSelect,
}: {
  projects: Project[]; selected: Project | null; onSelect: (p: Project) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/8 border border-white/15 hover:bg-white/12 hover:border-blue-400/40 transition-all text-sm text-white/90 font-medium max-w-[260px]"
      >
        <Icon name="folder-open" className="w-4 h-4 text-blue-400 shrink-0" />
        <span className="truncate">{selected?.title ?? 'Select a project…'}</span>
        <Icon name="chevron-down" className={`w-4 h-4 text-white/40 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 min-w-[260px] max-w-sm bg-[#0f172a] border border-white/15 rounded-xl shadow-2xl shadow-black/60 overflow-hidden">
          {projects.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs font-mono text-white/40">
              No projects assigned to you
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto py-1">
              {projects.map(p => (
                <button
                  key={p.id}
                  onClick={() => { onSelect(p); setOpen(false); }}
                  className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-white/8 transition-colors group ${selected?.id === p.id ? 'bg-blue-500/10 border-l-2 border-l-blue-400' : 'border-l-2 border-l-transparent'}`}
                >
                  <Icon name="folder-open" className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{p.title}</p>
                    <p className="text-[10px] font-mono text-white/40 uppercase mt-0.5">
                      {p.status} · {p.assignedTo?.length ?? 0} agent{(p.assignedTo?.length ?? 0) !== 1 ? 's' : ''}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ProjectSummary() {
  const { user } = useUser();
  const firestore = useFirestore();

  const [projects, setProjects] = useState<Project[]>([]);
  const [requests, setRequests] = useState<ClientRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Project | null>(null);

  // ── Live projects (ALL – any agent assigned) ────────────────────────────
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

  // ── Live client requests ────────────────────────────────────────────────
  useEffect(() => {
    if (!firestore) return;
    const unsub = onSnapshot(query(collection(firestore, 'client_requests')), snap => {
      const arr: ClientRequest[] = [];
      snap.forEach(d => arr.push({ id: d.id, ...d.data() } as ClientRequest));
      setRequests(arr);
    });
    return () => unsub();
  }, [firestore]);

  // ── Projects visible to current user ───────────────────────────────────
  const myProjects = useMemo(
    () => projects.filter(p => p.assignedTo?.includes(user?.email || '')),
    [projects, user]
  );

  // ── Auto-select first project, then keep selection in sync ─────────────
  useEffect(() => {
    if (!selected && myProjects.length > 0) {
      setSelected(myProjects[0]);
      return;
    }
    if (selected) {
      const updated = projects.find(p => p.id === selected.id);
      if (updated && updated !== selected) setSelected(updated);
    }
  }, [myProjects, projects, selected]);

  // ── Per-project derived data ────────────────────────────────────────────
  const proj = selected;

  // Load tasks & activities for the selected project
  const {
    tasks = [],
    tasksLoading,
    activities = [],
    addProjectTask,
    updateProjectTask,
    deleteProjectTask,
  } = useProjectTasks(proj?.id, proj?.status, proj?.progressMode || 'auto');

  const [progressMode, setProgressMode] = useState<'auto' | 'manual'>('auto');
  const [manualProgress, setManualProgress] = useState<number>(0);
  const [projectHealth, setProjectHealth] = useState<'on-track' | 'at-risk' | 'blocked'>('on-track');
  const [statusNote, setStatusNote] = useState('');
  const [isUpdatingProgress, setIsUpdatingProgress] = useState(false);
  const [isAnalyzingInsights, setIsAnalyzingInsights] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskIsMilestone, setNewTaskIsMilestone] = useState(false);

  useEffect(() => {
    if (proj) {
      setProgressMode(proj.progressMode || 'auto');
      setManualProgress(proj.manualProgress || proj.progress || 0);
      setProjectHealth(proj.projectHealth || 'on-track');
      setStatusNote('');
    }
  }, [proj?.id]);

  const handlePublishUpdate = async () => {
    if (!proj || !firestore || !user) return;
    setIsUpdatingProgress(true);
    try {
      const projRef = doc(firestore, 'projects', proj.id);

      const computedProgress = progressMode === 'auto'
        ? (tasks.length > 0 ? Math.round((tasks.filter(t => t.status === 'done').length / tasks.length) * 100) : (proj.status === 'completed' ? 100 : proj.status === 'active' ? 60 : 30))
        : manualProgress;

      const updates: any = {
        progressMode,
        projectHealth,
        progress: computedProgress,
      };

      if (progressMode === 'manual') {
        updates.manualProgress = manualProgress;
      }

      if (statusNote.trim()) {
        updates.latestStatusNote = statusNote.trim();
        updates.latestStatusNoteAt = new Date().toISOString();
        updates.latestStatusNoteBy = user.displayName || user.email || 'Agent';
      }

      await updateDoc(projRef, updates);

      // Create activity feed item
      const userName = user.displayName || user.email || 'Agent';
      let logMsg = `${userName} updated progress to ${computedProgress}%`;
      if (progressMode === 'manual') {
        logMsg = `${userName} (Lead) set manual progress override to ${computedProgress}%`;
      }

      if (statusNote.trim()) {
        logMsg += ` - "${statusNote.trim()}"`;
      }

      await addDoc(collection(firestore, 'project_activities'), {
        projectId: proj.id,
        type: 'manual',
        content: logMsg,
        timestamp: new Date(),
        createdBy: user.email || user.uid
      });

      setStatusNote('');
      setIsUpdatingProgress(false);
    } catch (e) {
      console.error("Failed to update progress:", e);
      setIsUpdatingProgress(false);
    }
  };

  const handleAnalyzeInsights = async () => {
    if (!proj || !user) return;
    setIsAnalyzingInsights(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/ai/project-insights', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ projectId: proj.id })
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to analyze project insights');
      }
      setIsAnalyzingInsights(false);
    } catch (e) {
      console.error(e);
      setIsAnalyzingInsights(false);
    }
  };

  // Team size of selected project
  const teamSize = proj?.assignedTo?.length ?? 0;

  // Is current user on this project?
  const isMine = proj?.assignedTo?.includes(user?.email || '') ?? false;

  // Overall cross-project stats (for agent KPIs)
  const myActive = myProjects.filter(p => p.status === 'active').length;
  const myCompleted = myProjects.filter(p => p.status === 'completed').length;
  const myPending = requests.filter(r => r.status === 'pending').length;

  // Completion rate for gauge – per-project: use dynamic progress if defined, otherwise status-based stubs
  const projCompletionRate = proj && typeof proj.progress === 'number'
    ? proj.progress
    : proj?.status === 'completed' ? 100
      : proj?.status === 'active' ? 60
        : proj?.status === 'archived' ? 30
          : 0;

  // Days since project was created
  const daysSinceCreated = useMemo(() => {
    if (!proj?.createdAt?.seconds) return null;
    const ms = Date.now() - proj.createdAt.seconds * 1000;
    return Math.floor(ms / 86400000);
  }, [proj]);

  // Project creation date string
  const createdOn = proj?.createdAt?.seconds
    ? new Date(proj.createdAt.seconds * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

  // ── Area chart: my projects created per month ───────────────────────────
  const areaData = useMemo(() => {
    const counts: Record<string, number> = {};
    MONTHS.forEach(m => { counts[m] = 0; });
    myProjects.forEach(p => {
      if (p.createdAt?.seconds) {
        const d = new Date(p.createdAt.seconds * 1000);
        if (d.getFullYear() === new Date().getFullYear()) {
          counts[MONTHS[d.getMonth()]]++;
        }
      }
    });
    return MONTHS.map(m => ({ month: m, projects: counts[m] }));
  }, [myProjects]);

  // ── Bar chart: requests per month ──────────────────────────────────────
  const barData = useMemo(() => {
    const counts: Record<string, number> = {};
    MONTHS.forEach(m => { counts[m] = 0; });
    requests.forEach(r => {
      if (r.createdAt?.seconds) {
        const d = new Date(r.createdAt.seconds * 1000);
        if (d.getFullYear() === new Date().getFullYear()) {
          counts[MONTHS[d.getMonth()]]++;
        }
      }
    });
    return MONTHS.map(m => ({ month: m, requests: counts[m] }));
  }, [requests]);

  // ── Loading ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-32 text-white/50">
        <Activity className="w-6 h-6 animate-spin mr-3 text-blue-400" />
        <span className="text-sm font-mono uppercase tracking-widest">Compiling Report...</span>
      </div>
    );
  }

  return (
    <div
      className="w-full rounded-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500"
      style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #0a1628 50%, #0d1b2e 100%)',
        border: '1px solid rgba(59,130,246,0.15)',
        boxShadow: '0 25px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)',
      }}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="px-8 pt-8 pb-5 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            {proj ? proj.title : 'Project Summary'}
          </h1>
          <p className="text-xs font-mono text-white/40 uppercase tracking-widest mt-1">
            {proj
              ? `Executive Overview · ${teamSize} Agent${teamSize !== 1 ? 's' : ''} · Started ${createdOn}`
              : 'Select a project to view its summary'}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Live badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            <span className="text-[10px] font-mono text-blue-300 uppercase tracking-widest">Live</span>
          </div>
          {/* Project selector */}
          <ProjectDropdown projects={myProjects} selected={selected} onSelect={setSelected} />
        </div>
      </div>

      {myProjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-white/40">
          <Icon name="folder-open" className="w-12 h-12 opacity-40" />
          <p className="text-sm font-mono uppercase tracking-widest">No projects assigned to you yet</p>
        </div>
      ) : proj ? (
        <div className="p-8 space-y-6">

          {/* ── KPI Row ─────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatTile icon={<Icon name="suitcase" className="w-5 h-5" />} label="My Projects" value={myProjects.length} accent="#3b82f6" />
            <StatTile icon={<Icon name="circle-check" className="w-5 h-5" />} label="My Completed" value={myCompleted} accent="#d8a657" />
            <StatTile icon={<Icon name="clock" className="w-5 h-5" />} label="My Active" value={myActive} accent="#a855f7" />
            <StatTile icon={<Inbox className="w-5 h-5" />} label="Open Requests" value={myPending} accent="#f59e0b" />
          </div>

          {/* ── Middle Row ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {/* Project details */}
            <div className="rounded-xl p-5 bg-white/5 border border-white/10 space-y-4">
              <h3 className="text-xs font-mono font-semibold uppercase tracking-widest text-white/60">
                Project Details
              </h3>

              {/* Status pill */}
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-mono font-bold uppercase tracking-wider ${proj.status === 'active' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25' :
                    proj.status === 'completed' ? 'bg-blue-500/15 text-blue-300 border border-blue-500/25' :
                      'bg-white/10 text-white/50 border border-white/10'
                  }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${proj.status === 'active' ? 'bg-emerald-400 animate-pulse' :
                      proj.status === 'completed' ? 'bg-blue-400' : 'bg-white/30'
                    }`} />
                  {proj.status}
                </span>
                {isMine && (
                  <span className="text-[10px] font-bold text-purple-300 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded uppercase tracking-wider">
                    Assigned to you
                  </span>
                )}
              </div>

              <ul className="space-y-2.5 text-sm">
                <li className="flex items-start gap-2 text-white/70">
                  <Icon name="user-02" className="w-3.5 h-3.5 text-white/30 mt-0.5 shrink-0" />
                  <div>
                    <span className="text-[10px] font-mono text-white/35 uppercase block mb-0.5">Team</span>
                    {proj.assignedTo?.map((email, i) => (
                      <span key={i} className="block text-xs text-white/60 truncate">{email}</span>
                    ))}
                  </div>
                </li>
                <li className="flex items-start gap-2 text-white/70">
                  <Icon name="calendar-days" className="w-3.5 h-3.5 text-white/30 mt-0.5 shrink-0" />
                  <div>
                    <span className="text-[10px] font-mono text-white/35 uppercase block mb-0.5">Created</span>
                    <span className="text-xs text-white/60">{createdOn}{daysSinceCreated !== null ? ` (${daysSinceCreated}d ago)` : ''}</span>
                  </div>
                </li>
                {(proj.githubRepoUrl || proj.originalTimelineWeeks) && (
                  <li className="flex items-start gap-2 text-white/70">
                    <Activity className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0 animate-pulse" />
                    <div>
                      <span className="text-[10px] font-mono text-blue-300 uppercase block mb-0.5 flex items-center gap-1">AI Progress Tracker <Sparkles className="w-2.5 h-2.5" /></span>
                      {proj.githubRepoUrl && <span className="block text-xs text-white/60 truncate">Repo: {proj.githubRepoUrl}</span>}
                      {proj.currentEstimatedWeeks && proj.originalTimelineWeeks && (
                        <span className="block text-xs text-white/60">
                          Timeline: {proj.currentEstimatedWeeks} weeks
                          {proj.currentEstimatedWeeks < proj.originalTimelineWeeks &&
                            <span className="text-emerald-400 ml-1">(↓ Reduced by {proj.originalTimelineWeeks - proj.currentEstimatedWeeks} weeks)</span>
                          }
                          {proj.currentEstimatedWeeks > proj.originalTimelineWeeks &&
                            <span className="text-rose-400 ml-1">(↑ Delayed by {proj.currentEstimatedWeeks - proj.originalTimelineWeeks} weeks)</span>
                          }
                        </span>
                      )}
                    </div>
                  </li>
                )}
              </ul>

              {proj.description && (
                <div className="border-t border-white/5 pt-3">
                  <span className="text-[10px] font-mono text-white/35 uppercase block mb-1">Brief</span>
                  <p className="text-xs text-white/55 leading-relaxed line-clamp-4">{proj.description}</p>
                </div>
              )}
            </div>

            {/* Completion gauge – per project */}
            <div className="rounded-xl p-5 bg-white/5 border border-white/10 flex flex-col items-center justify-center">
              <h3 className="text-xs font-mono font-semibold uppercase tracking-widest text-white/60 mb-1 self-start">
                Project Progress
              </h3>
              <RadialGauge value={projCompletionRate} label={proj.status} />
            </div>

            {/* Team stats */}
            <div className="rounded-xl p-5 bg-white/5 border border-white/10 flex flex-col justify-between">
              <h3 className="text-xs font-mono font-semibold uppercase tracking-widest text-white/60">
                Team Overview
              </h3>
              <div className="mt-4 space-y-4">
                <div className="flex justify-between items-center border-b border-white/5 pb-3">
                  <div>
                    <p className="text-[10px] font-mono text-white/40 uppercase">Agents on Project</p>
                    <p className="text-3xl font-bold text-white">{teamSize}</p>
                  </div>
                  <div
                    className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-extrabold text-white"
                    style={{
                      background: `conic-gradient(#d8a657 0%, #d8a657 ${projCompletionRate}%, rgba(255,255,255,0.06) ${projCompletionRate}%)`,
                      boxShadow: '0 0 20px rgba(216, 166, 87,0.25)',
                    }}
                  >
                    <Icon name="users" className="w-6 h-6 text-brand-300" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <p className="text-[10px] font-mono text-white/30 uppercase tracking-widest">All Projects on Network</p>
                  <p className="text-lg font-bold text-white">{projects.length} total</p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Bottom Row ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Area chart – my project activity */}
            <div className="rounded-xl p-5 bg-white/5 border border-white/10">
              <h3 className="text-xs font-mono font-semibold uppercase tracking-widest text-white/60 mb-4">
                My Project Activity ({new Date().getFullYear()})
              </h3>
              <ResponsiveContainer width="100%" height={170}>
                <AreaChart data={areaData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                  <defs>
                    <linearGradient id="aGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="month" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 8, color: 'white', fontSize: 12 }}
                    cursor={{ stroke: 'rgba(59,130,246,0.3)' }} />
                  <Area type="monotone" dataKey="projects" stroke="#3b82f6" strokeWidth={2} fill="url(#aGrad)" dot={{ r: 3, fill: '#3b82f6' }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Bar chart + breakdown */}
            <div className="rounded-xl p-5 bg-white/5 border border-white/10 flex flex-col gap-4">
              <h3 className="text-xs font-mono font-semibold uppercase tracking-widest text-white/60">
                Inbound Requests ({new Date().getFullYear()})
              </h3>
              <ResponsiveContainer width="100%" height={110}>
                <BarChart data={barData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="month" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 8, color: 'white', fontSize: 12 }}
                    cursor={{ fill: 'rgba(59,130,246,0.05)' }} />
                  <Bar dataKey="requests" fill="rgba(59,130,246,0.7)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>

              {/* Pipeline breakdown */}
              <div>
                <p className="text-[10px] font-mono text-white/40 uppercase tracking-widest mb-3">Pipeline Breakdown</p>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: 'Total', value: requests.length, color: '#3b82f6' },
                    { label: 'Pending', value: myPending, color: '#f59e0b' },
                    { label: 'Assigned', value: requests.filter(r => r.status === 'assigned').length, color: '#d8a657' },
                    { label: 'Network', value: projects.length, color: '#a855f7' },
                  ].map(item => (
                    <div key={item.label} className="flex flex-col items-center gap-1">
                      <div className="w-5 h-5 rounded"
                        style={{ background: `${item.color}33`, border: `1px solid ${item.color}66` }} />
                      <span className="text-[10px] font-mono text-white/40 uppercase">{item.label}</span>
                      <span className="text-base font-bold text-white">{item.value.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── Progress Pipeline, Tasks & AI Insights (NEW) ──────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4 border-t border-white/5">

            {/* Left Column: Project Task Board */}
            <div className="rounded-xl p-6 bg-white/5 border border-white/10 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-mono font-semibold uppercase tracking-widest text-white/60">
                    Project Task Board
                  </h3>
                  <p className="text-[10px] font-mono text-white/30 uppercase mt-0.5">
                    {tasks.length} Active Container Task{tasks.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-white/5 border border-white/10 text-[10px] font-mono text-white/40 uppercase">
                  {progressMode === 'auto' ? 'Auto Rollup' : 'Manual Override'}
                </div>
              </div>

              {/* Add task form */}
              {isMine && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newTaskTitle}
                    onChange={e => setNewTaskTitle(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newTaskTitle.trim()) {
                        addProjectTask(newTaskTitle.trim(), '', [], newTaskIsMilestone ? ['milestone'] : []);
                        setNewTaskTitle('');
                        setNewTaskIsMilestone(false);
                      }
                    }}
                    placeholder="Allocate new task identifier..."
                    className="flex-1 px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 hover:border-white/15 focus:border-blue-400 focus:outline-none text-xs text-white placeholder:text-white/30 transition-all"
                  />
                  <button
                    onClick={() => {
                      if (newTaskTitle.trim()) {
                        addProjectTask(newTaskTitle.trim(), '', [], newTaskIsMilestone ? ['milestone'] : []);
                        setNewTaskTitle('');
                        setNewTaskIsMilestone(false);
                      }
                    }}
                    className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 hover:bg-blue-500/20 transition-all cursor-pointer"
                  >
                    <Icon name="plus" className="w-4 h-4" />
                  </button>
                </div>
              )}

              {isMine && (
                <label className="flex items-center gap-2 text-[10px] font-mono text-white/40 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={newTaskIsMilestone}
                    onChange={e => setNewTaskIsMilestone(e.target.checked)}
                    className="rounded bg-black border-white/15 text-blue-500 focus:ring-0 focus:ring-offset-0 focus:outline-none"
                  />
                  Tag as Milestone Checkpoint
                </label>
              )}

              {/* Tasks List */}
              <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1 custom-scrollbar">
                {tasksLoading ? (
                  <div className="flex items-center justify-center py-10 text-white/30 font-mono text-xs">
                    <Icon name="loading" className="w-4 h-4 animate-spin mr-2 text-blue-400" />
                    Querying Task Registry...
                  </div>
                ) : tasks.length === 0 ? (
                  <div className="text-center py-12 border border-dashed border-white/5 rounded-xl text-white/30 font-mono text-xs">
                    No tasks assigned to this container.
                  </div>
                ) : (
                  tasks.map(t => {
                    const isMilestone = t.labels?.includes('milestone');
                    return (
                      <div
                        key={t.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-black/20 border border-white/5 hover:border-white/10 transition-all group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {isMine ? (
                            <button
                              onClick={() => updateProjectTask(t.id, { status: t.status === 'done' ? 'todo' : 'done' })}
                              className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all ${t.status === 'done'
                                  ? 'bg-blue-500 border-blue-400 text-white'
                                  : 'border-white/20 hover:border-blue-400'
                                }`}
                            >
                              {t.status === 'done' && <Icon name="check" className="w-3 h-3 stroke-[3]" />}
                            </button>
                          ) : (
                            <div className={`w-2 h-2 rounded-full shrink-0 ${t.status === 'done' ? 'bg-blue-400' : 'bg-amber-400'}`} />
                          )}
                          <div className="min-w-0">
                            <p className={`text-xs font-medium truncate ${t.status === 'done' ? 'line-through text-white/30' : 'text-white/80'}`}>
                              {t.title}
                            </p>
                            {isMilestone && (
                              <span className="inline-flex mt-1 text-[8px] font-mono uppercase px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/25 tracking-widest font-semibold animate-pulse">
                                Milestone
                              </span>
                            )}
                          </div>
                        </div>

                        {isMine && (
                          <button
                            onClick={() => deleteProjectTask(t.id)}
                            className="text-white/20 hover:text-rose-400 p-1 opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <Icon name="trash-empty" className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right Column: Manage Progress & AI Insights */}
            <div className="space-y-6">

              {/* Progress & Health Control Card */}
              <div className="rounded-xl p-6 bg-white/5 border border-white/10 space-y-4">
                <div>
                  <h3 className="text-xs font-mono font-semibold uppercase tracking-widest text-white/60">
                    Progress Pipeline Control
                  </h3>
                  <p className="text-[10px] font-mono text-white/30 uppercase mt-0.5">
                    Configure calculations and status reporting
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Mode Selector */}
                  <div>
                    <label className="text-[10px] font-mono text-white/40 uppercase tracking-wider block mb-1.5">Calculation Mode</label>
                    <div className="flex bg-black/40 border border-white/10 rounded-lg p-0.5 gap-0.5">
                      <button
                        onClick={() => isMine && setProgressMode('auto')}
                        disabled={!isMine}
                        className={`flex-1 py-1 rounded text-[10px] font-mono font-bold transition-all uppercase ${progressMode === 'auto'
                            ? 'bg-blue-500 text-white shadow'
                            : 'text-white/40 hover:text-white/60 disabled:opacity-50'
                          }`}
                      >
                        Auto
                      </button>
                      <button
                        onClick={() => isMine && setProgressMode('manual')}
                        disabled={!isMine}
                        className={`flex-1 py-1 rounded text-[10px] font-mono font-bold transition-all uppercase ${progressMode === 'manual'
                            ? 'bg-blue-500 text-white shadow'
                            : 'text-white/40 hover:text-white/60 disabled:opacity-50'
                          }`}
                      >
                        Manual
                      </button>
                    </div>
                  </div>

                  {/* Health Selector */}
                  <div>
                    <label className="text-[10px] font-mono text-white/40 uppercase tracking-wider block mb-1.5">Project Health</label>
                    <select
                      value={projectHealth}
                      onChange={e => isMine && setProjectHealth(e.target.value as any)}
                      disabled={!isMine}
                      className="w-full px-2 py-1 rounded-lg bg-black/40 border border-white/10 focus:border-blue-400 focus:outline-none text-[10px] font-mono uppercase text-white tracking-widest h-[26px]"
                    >
                      <option value="on-track" className="bg-[#0f172a] text-emerald-400">ON TRACK</option>
                      <option value="at-risk" className="bg-[#0f172a] text-amber-400">AT RISK</option>
                      <option value="blocked" className="bg-[#0f172a] text-rose-400">BLOCKED</option>
                    </select>
                  </div>
                </div>

                {/* Slider (only if manual) */}
                {progressMode === 'manual' && (
                  <div className="space-y-2 py-1">
                    <div className="flex justify-between text-[10px] font-mono">
                      <span className="text-white/40 uppercase">Manual Progress Override</span>
                      <span className="text-blue-400 font-bold">{manualProgress}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={manualProgress}
                      onChange={e => isMine && setManualProgress(parseInt(e.target.value))}
                      disabled={!isMine}
                      className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500 focus:outline-none"
                    />
                  </div>
                )}

                {/* Status Note Textarea */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-white/40 uppercase tracking-wider block">Status Update Note</label>
                  <textarea
                    rows={2}
                    value={statusNote}
                    onChange={e => isMine && setStatusNote(e.target.value)}
                    disabled={!isMine}
                    placeholder="Briefly state focal points, blocking conditions, or shipping milestones..."
                    className="w-full p-2.5 rounded-lg bg-black/40 border border-white/10 hover:border-white/15 focus:border-blue-400 focus:outline-none text-xs text-white placeholder:text-white/30 resize-none transition-all"
                  />
                </div>

                {isMine && (
                  <button
                    onClick={handlePublishUpdate}
                    disabled={isUpdatingProgress}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/50 text-white font-mono text-xs uppercase tracking-widest transition-all cursor-pointer shadow-md shadow-blue-500/10"
                  >
                    {isUpdatingProgress ? (
                      <>
                        <Icon name="loading" className="w-3.5 h-3.5 animate-spin" />
                        Synchronizing Registry...
                      </>
                    ) : (
                      <>
                        <Icon name="save" className="w-3.5 h-3.5" />
                        Publish Progress Update
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* AI Insights from ONE */}
              <div className="rounded-xl p-6 bg-white/5 border border-white/10 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-mono font-semibold uppercase tracking-widest text-purple-300 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
                      Autonomous Insights (ONE)
                    </h3>
                    {proj.aiInsightsGeneratedAt && (
                      <p className="text-[8px] font-mono text-white/20 uppercase mt-0.5">
                        Refreshed {new Date(proj.aiInsightsGeneratedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </div>

                  {isMine && (
                    <button
                      onClick={handleAnalyzeInsights}
                      disabled={isAnalyzingInsights}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-300 font-mono text-[9px] uppercase tracking-widest transition-all cursor-pointer"
                    >
                      {isAnalyzingInsights ? (
                        <>
                          <Icon name="loading" className="w-3 h-3 animate-spin" />
                          Auditing...
                        </>
                      ) : (
                        <>
                          <Activity className="w-3 h-3" />
                          Audit with ONE
                        </>
                      )}
                    </button>
                  )}
                </div>

                {proj.aiInsights ? (
                  <div className="p-4 rounded-lg bg-purple-950/15 border border-purple-500/15 max-h-[220px] overflow-y-auto custom-scrollbar text-xs text-white/70 leading-relaxed font-body space-y-2 whitespace-pre-wrap">
                    {proj.aiInsights}
                  </div>
                ) : (
                  <div className="text-center py-8 border border-dashed border-white/5 rounded-xl text-white/30 font-mono text-xs">
                    ONE hasn't performed an operational audit on this container yet. Click above to trigger.
                  </div>
                )}
              </div>

              {/* Activity Feed */}
              <div className="rounded-xl p-6 bg-white/5 border border-white/10 space-y-4">
                <div>
                  <h3 className="text-xs font-mono font-semibold uppercase tracking-widest text-white/60">
                    Recent Project Activity Feed
                  </h3>
                  <p className="text-[10px] font-mono text-white/30 uppercase mt-0.5">
                    Chronological update registry
                  </p>
                </div>

                <div className="space-y-4 max-h-[260px] overflow-y-auto pr-1 custom-scrollbar">
                  {activities.length === 0 ? (
                    <div className="text-center py-8 border border-dashed border-white/5 rounded-xl text-white/30 font-mono text-xs">
                      No activities logged for this container.
                    </div>
                  ) : (
                    <div className="relative border-l border-white/10 ml-2.5 pl-4 space-y-4 py-1">
                      {activities.map((act, idx) => {
                        const dateStr = act.timestamp?.seconds
                          ? new Date(act.timestamp.seconds * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                          : act.timestamp instanceof Date
                            ? act.timestamp.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                            : 'Recent';

                        const isAI = act.createdBy === 'one@cybrdeck.com';

                        return (
                          <div key={act.id || idx} className="relative">
                            {/* Dot indicator */}
                            <div className={`absolute -left-[21.5px] top-1 w-2.5 h-2.5 rounded-full border border-[#0f172a] ${isAI
                                ? 'bg-purple-400 shadow-sm shadow-purple-400/40'
                                : act.type === 'manual'
                                  ? 'bg-blue-400'
                                  : 'bg-emerald-400'
                              }`} />

                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[9px] font-mono text-white/35">
                                <span className="uppercase tracking-wider">{isAI ? 'Sovereign AI (ONE)' : act.createdBy}</span>
                                <span>{dateStr}</span>
                              </div>
                              <p className={`text-xs ${isAI ? 'text-purple-200/90 font-medium' : 'text-white/60'}`}>
                                {act.content}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>

        </div>
      ) : null}
    </div>
  );
}
