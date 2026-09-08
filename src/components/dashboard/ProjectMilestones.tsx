"use client"

import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '@/components/ui/icon';
import { useFirestore, useUser } from '@/firebase';
import { collection, query, onSnapshot, doc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { useProjectTasks } from '@/hooks/use-project-tasks';
import { Activity, Sparkles } from 'lucide-react';

interface Project {
  id: string;
  title: string;
  description?: string;
  status: string;
  assignedTo: string[];
  createdAt: any;
  githubRepoUrl?: string;
  originalTimelineWeeks?: number;
  currentEstimatedWeeks?: number;
}

interface Task {
  id: string;
  title: string;
  description: string;
  status: 'todo' | 'in-progress' | 'done';
  categories: string[];
  labels: string[];
  userId: string;
  projectId?: string;
  milestoneId?: string;
  createdAt: any;
  autoResolvedByCommit?: string;
  resolutionSummary?: string;
}

interface ProjectMilestonesProps {
  projectId?: string;
  readOnly?: boolean;
}

export default function ProjectMilestones({ projectId, readOnly }: ProjectMilestonesProps = {}) {
  const { user } = useUser();
  const firestore = useFirestore();

  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [openDropdown, setOpenDropdown] = useState(false);

  // Sub-task forms
  const [newSubTaskTitles, setNewSubTaskTitles] = useState<Record<string, string>>({});
  const [newMilestoneTitle, setNewMilestoneTitle] = useState('');

  // Client revision form state
  const [revisionMilestoneId, setRevisionMilestoneId] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState('');

  // AI Translation Mode
  const [isPlainEnglish, setIsPlainEnglish] = useState(false);
  const [translations, setTranslations] = useState<Record<string, { simpleTitle: string; simpleDesc: string }>>({});
  const [translating, setTranslating] = useState(false);

  const toggleTranslateMode = async () => {
    if (isPlainEnglish) {
      setIsPlainEnglish(false);
      return;
    }

    if (Object.keys(translations).length > 0) {
      setIsPlainEnglish(true);
      return;
    }

    if (!user || !selected || tasks.length === 0) return;

    setTranslating(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/ai/translate-milestones', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ tasks })
      });
      const data = await res.json();
      if (data.success && data.translations) {
        const mapping: Record<string, { simpleTitle: string; simpleDesc: string }> = {};
        data.translations.forEach((t: any) => {
          mapping[t.id] = { simpleTitle: t.simpleTitle, simpleDesc: t.simpleDesc };
        });
        setTranslations(mapping);
        setIsPlainEnglish(true);
      } else {
        alert("Failed to translate milestones: " + (data.error || "Unknown error"));
      }
    } catch (e: any) {
      console.error(e);
      alert("Error contacting translation service: " + e.message);
    } finally {
      setTranslating(false);
    }
  };

  // 1. Fetch Projects
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
    return projects.filter(p => p.assignedTo?.includes(user?.email || ''));
  }, [projects, user, projectId]);

  useEffect(() => {
    if (projectId) {
      const target = projects.find(p => p.id === projectId);
      if (target) setSelected(target);
    } else if (!selected && myProjects.length > 0) {
      setSelected(myProjects[0]);
    } else if (selected) {
      const updated = projects.find(p => p.id === selected.id);
      if (updated) setSelected(updated);
    }
  }, [myProjects, selected, projectId, projects]);

  const handleApproveMilestone = async (milestone: any) => {
    if (!firestore || !user) return;
    const docRef = doc(firestore, 'tasks', milestone.id);
    try {
      await updateDoc(docRef, {
        clientApprovalStatus: 'approved',
      });
      const userName = user.displayName || user.email || 'Client';
      await addDoc(collection(firestore, 'project_activities'), {
        projectId: selected?.id,
        type: 'auto',
        content: `${userName} approved Milestone "${milestone.title}"`,
        timestamp: serverTimestamp(),
        createdBy: user.email || user.uid,
      });
    } catch (e) {
      console.error("Failed to approve milestone:", e);
    }
  };

  const handleRequestRevisionSubmit = async (milestone: any) => {
    if (!firestore || !user || !feedbackText.trim()) return;
    const docRef = doc(firestore, 'tasks', milestone.id);
    try {
      await updateDoc(docRef, {
        clientApprovalStatus: 'revision-requested',
        clientRevisionNotes: feedbackText.trim(),
        status: 'in-progress',
      });
      const userName = user.displayName || user.email || 'Client';
      await addDoc(collection(firestore, 'project_activities'), {
        projectId: selected?.id,
        type: 'auto',
        content: `${userName} requested revision on Milestone "${milestone.title}": ${feedbackText.trim()}`,
        timestamp: serverTimestamp(),
        createdBy: user.email || user.uid,
      });
      setRevisionMilestoneId(null);
      setFeedbackText('');
    } catch (e) {
      console.error("Failed to request revision:", e);
    }
  };

  // 2. Fetch Tasks using the projectTasks hook
  const {
    tasks = [],
    tasksLoading,
    addProjectTask,
    updateProjectTask,
    deleteProjectTask,
  } = useProjectTasks(selected?.id, selected?.status, 'auto');

  // 3. Process Milestones vs Tasks
  const { milestones, unparentedTasks } = useMemo(() => {
    const msList = (tasks as Task[]).filter(t => t.labels?.includes('milestone'));
    const unparented = (tasks as Task[]).filter(
      t => !t.labels?.includes('milestone') && !t.milestoneId
    );

    // Compute progress & sub-tasks for each milestone
    const msWithSubTasks = msList.map(ms => {
      const children = (tasks as Task[]).filter(t => t.milestoneId === ms.id);
      const total = children.length;
      const completed = children.filter(c => c.status === 'done').length;
      const progress = total > 0 ? Math.round((completed / total) * 100) : (ms.status === 'done' ? 100 : 0);

      // Determine Milestone health
      let health: 'on-track' | 'at-risk' | 'blocked' = 'on-track';
      if (ms.status !== 'done') {
        const hasBlockedChildren = children.some(c => c.labels?.includes('blocked') || c.categories?.includes('blocked'));
        if (hasBlockedChildren) health = 'blocked';
        else if (children.filter(c => c.status !== 'done').length > 5) health = 'at-risk';
      }

      return {
        ...ms,
        subTasks: children,
        progress,
        health,
      };
    });

    return { milestones: msWithSubTasks, unparentedTasks: unparented };
  }, [tasks]);

  const handleAddMilestone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMilestoneTitle.trim() || !selected) return;
    await addProjectTask(newMilestoneTitle.trim(), 'Milestone Checkpoint', [], ['milestone']);
    setNewMilestoneTitle('');
  };

  const handleAddSubTask = async (milestoneId: string) => {
    const title = newSubTaskTitles[milestoneId];
    if (!title || !title.trim() || !selected || !firestore || !user) return;

    const tasksRef = collection(firestore, 'tasks');
    const data = {
      title: title.trim(),
      description: '',
      status: 'todo',
      categories: [],
      labels: [],
      userId: user.uid,
      projectId: selected.id,
      milestoneId: milestoneId,
      createdAt: serverTimestamp()
    };

    try {
      const docRef = await addDoc(tasksRef, data);

      // Log Activity
      const userName = user.displayName || user.email || 'Agent';
      await addDoc(collection(firestore, 'project_activities'), {
        projectId: selected.id,
        type: 'auto',
        content: `${userName} added sub-task "${title.trim()}" to Milestone`,
        timestamp: serverTimestamp(),
        createdBy: user.email || user.uid,
      });

      // Clear input
      setNewSubTaskTitles(prev => ({ ...prev, [milestoneId]: '' }));
    } catch (e) {
      console.error("Failed to add sub-task:", e);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32 text-white/50">
        <Activity className="w-6 h-6 animate-spin mr-3 text-blue-400" />
        <span className="text-sm font-mono uppercase tracking-widest">Loading Milestones...</span>
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
      {/* Header */}
      <div className="px-8 pt-8 pb-5 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              <Icon name="flag" className="w-5 h-5 text-purple-400" />
              Project Milestones
            </h1>

            {/* AI Translate Toggle */}
            {readOnly && selected && (
              <button
                onClick={toggleTranslateMode}
                disabled={translating}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-mono font-bold border uppercase tracking-wider transition-all select-none ${isPlainEnglish
                    ? "bg-purple-500/20 text-purple-300 border-purple-500/40 shadow-[0_0_8px_rgba(168,85,247,0.25)]"
                    : "bg-black/40 text-white/50 border-white/10 hover:border-purple-500/30 hover:text-white"
                  } ${translating ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <Sparkles className={`w-3.5 h-3.5 ${translating ? 'animate-spin' : ''}`} />
                {translating ? "Translating..." : isPlainEnglish ? "Plain English: ON" : "AI Explain Mode"}
              </button>
            )}
          </div>
          <p className="text-xs font-mono text-white/40 uppercase tracking-widest mt-1">
            {selected ? `Milestone Checkpoints & Sub-task Trees for ${selected.title}` : 'Select a project to review milestones'}
          </p>
        </div>

        {selected && myProjects.length > 0 && !projectId && (
          <div className="relative">
            <button
              onClick={() => setOpenDropdown(o => !o)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/8 border border-white/15 hover:bg-white/12 hover:border-blue-400/40 transition-all text-sm text-white/90 font-medium max-w-[260px]"
            >
              <Icon name="folder-open" className="w-4 h-4 text-blue-400 shrink-0" />
              <span className="truncate">{selected.title}</span>
              <Icon name="chevron-down" className={`w-4 h-4 text-white/40 shrink-0 transition-transform ${openDropdown ? 'rotate-180' : ''}`} />
            </button>
            {openDropdown && (
              <div className="absolute right-0 top-full mt-2 z-50 min-w-[260px] bg-[#0f172a] border border-white/15 rounded-xl shadow-2xl overflow-hidden">
                <div className="py-1">
                  {myProjects.map(p => (
                    <button
                      key={p.id}
                      onClick={() => { setSelected(p); setOpenDropdown(false); }}
                      className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-white/8 transition-colors ${selected.id === p.id ? 'bg-blue-500/10' : ''}`}
                    >
                      <Icon name="folder-open" className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                      <span className="text-sm font-semibold text-white truncate">{p.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {myProjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-white/40">
          <Icon name="folder-open" className="w-12 h-12 opacity-40" />
          <p className="text-sm font-mono uppercase tracking-widest">No projects assigned to you yet</p>
        </div>
      ) : selected ? (
        <div className="p-8 space-y-8">

          {/* Milestone Creation Form */}
          {!readOnly && (
            <form onSubmit={handleAddMilestone} className="flex gap-3 max-w-xl bg-white/5 border border-white/10 p-4 rounded-xl">
              <input
                type="text"
                value={newMilestoneTitle}
                onChange={e => setNewMilestoneTitle(e.target.value)}
                placeholder="Designate new Milestone checkpoint (e.g. Alpha V1 Release)..."
                required
                className="flex-1 px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 hover:border-white/15 focus:border-blue-400 focus:outline-none text-xs text-white placeholder:text-white/30 transition-all font-mono"
              />
              <button
                type="submit"
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-purple-500 hover:bg-purple-600 text-white font-mono text-xs uppercase tracking-widest transition-all cursor-pointer"
              >
                <Icon name="plus" className="w-4 h-4" /> Initialize Milestone
              </button>
            </form>
          )}

          {/* Milestones grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Milestone List */}
            <div className="space-y-6">
              <h2 className="text-sm font-mono font-semibold uppercase tracking-widest text-white/60 flex items-center gap-2">
                <Icon name="flag" className="w-4 h-4 text-purple-400" />
                Active Milestones ({milestones.length})
              </h2>

              {tasksLoading ? (
                <div className="flex items-center justify-center py-12 text-white/30 font-mono text-xs">
                  <Activity className="w-5 h-5 animate-spin mr-3 text-blue-400" />
                  Fetching Milestones...
                </div>
              ) : milestones.length === 0 ? (
                <div className="text-center py-16 border border-dashed border-white/5 rounded-2xl text-white/30 font-mono text-xs">
                  No milestones initialized for this project container yet.
                </div>
              ) : (
                <div className="space-y-6">
                  {milestones.map(ms => {
                    const healthColors = {
                      'on-track': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
                      'at-risk': 'bg-amber-500/15 text-amber-400 border-amber-500/20',
                      'blocked': 'bg-rose-500/15 text-rose-400 border-rose-500/20',
                    };

                    return (
                      <div
                        key={ms.id}
                        className="rounded-xl border bg-white/5 p-5 transition-all hover:bg-white/[0.07]"
                        style={{
                          borderColor: ms.status === 'done' ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.1)',
                        }}
                      >
                        {/* Header info */}
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1">
                            <h3 className={`text-sm font-bold truncate max-w-sm ${ms.status === 'done' ? 'line-through text-white/35' : 'text-white'}`}>
                              {isPlainEnglish && translations[ms.id] ? translations[ms.id].simpleTitle : ms.title}
                            </h3>
                            {isPlainEnglish && translations[ms.id] && (
                              <p className="text-[11px] text-purple-300/85 leading-relaxed font-mono max-w-sm">
                                {translations[ms.id].simpleDesc}
                              </p>
                            )}
                            <div className="flex flex-wrap gap-2 items-center">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[8px] font-mono border uppercase tracking-wider ${healthColors[ms.health]}`}>
                                {ms.health}
                              </span>
                              <span className="text-[8px] font-mono text-white/30 uppercase flex items-center gap-1">
                                <Icon name="list-checklist" className="w-3 h-3 text-white/40" />
                                {ms.subTasks.length} child task{ms.subTasks.length !== 1 ? 's' : ''}
                              </span>
                            </div>
                            {ms.autoResolvedByCommit && (
                              <div className="mt-2 p-2 rounded bg-blue-500/10 border border-blue-500/20 text-xs">
                                <div className="flex items-center gap-1.5 text-blue-300 font-mono text-[10px] uppercase mb-1">
                                  <Sparkles className="w-3 h-3" />
                                  AI Auto-Resolved (Commit {ms.autoResolvedByCommit.substring(0, 7)})
                                </div>
                                <p className="text-blue-100/70 text-[11px] leading-relaxed">
                                  {ms.resolutionSummary}
                                </p>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {readOnly ? (
                              <div className="flex flex-col items-end gap-1.5">
                                {ms.status === 'done' ? (
                                  revisionMilestoneId === ms.id ? (
                                    <span className="text-[10px] font-mono text-amber-400 uppercase tracking-widest animate-pulse font-bold">
                                      Drafting Objections...
                                    </span>
                                  ) : !(ms as any).clientApprovalStatus ? (
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={() => handleApproveMilestone(ms)}
                                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/35 text-xs font-mono uppercase tracking-wider transition-all cursor-pointer font-bold"
                                      >
                                        <Icon name="circle-check" className="w-3.5 h-3.5" /> Approve & Release
                                      </button>
                                      <button
                                        onClick={() => setRevisionMilestoneId(ms.id)}
                                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500/25 border border-amber-500/30 text-amber-400 hover:bg-amber-500/35 text-xs font-mono uppercase tracking-wider transition-all cursor-pointer font-bold"
                                      >
                                        <Icon name="circle-warning" className="w-3.5 h-3.5" /> Request Revision
                                      </button>
                                    </div>
                                  ) : (ms as any).clientApprovalStatus === 'approved' ? (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-mono font-bold tracking-widest border bg-emerald-500/15 border-emerald-500/30 text-emerald-400 uppercase">
                                      <Icon name="circle-check" className="w-3.5 h-3.5" /> APPROVED BY CLIENT
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-mono font-bold tracking-widest border bg-amber-500/15 border-amber-500/30 text-amber-400 uppercase">
                                      <Icon name="circle-warning" className="w-3.5 h-3.5" /> REVISION REQUESTED
                                    </span>
                                  )
                                ) : (ms as any).clientApprovalStatus === 'revision-requested' ? (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-mono font-bold tracking-widest border bg-amber-500/10 border-amber-500/20 text-amber-500/70 uppercase">
                                    <Icon name="clock" className="w-3 h-3 animate-pulse" /> Revision Staged
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-mono font-bold tracking-widest border bg-zinc-500/10 border-white/10 text-white/40 uppercase">
                                    In Progress
                                  </span>
                                )}
                              </div>
                            ) : (
                              <>
                                <button
                                  onClick={() => updateProjectTask(ms.id, { status: ms.status === 'done' ? 'todo' : 'done' })}
                                  className={`flex items-center justify-center p-1.5 rounded-lg border text-xs font-mono uppercase tracking-wider transition-all cursor-pointer ${ms.status === 'done'
                                      ? 'bg-blue-500/15 border-blue-500/30 text-blue-400'
                                      : 'bg-black/40 border-white/10 hover:border-blue-400 text-white/50 hover:text-white'
                                    }`}
                                >
                                  {ms.status === 'done' ? 'Re-open' : 'Complete'}
                                </button>
                                <button
                                  onClick={() => deleteProjectTask(ms.id)}
                                  className="text-white/20 hover:text-rose-400 p-1.5 hover:bg-white/5 rounded-lg transition-all"
                                >
                                  <Icon name="trash-empty" className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Inline Client Revision Form */}
                        {readOnly && revisionMilestoneId === ms.id && (
                          <div className="mt-4 p-4 rounded-xl border border-amber-500/25 bg-amber-950/10 space-y-3">
                            <p className="text-[10px] font-mono text-amber-400 uppercase tracking-widest font-bold">Specify Revision Objections</p>
                            <textarea
                              value={feedbackText}
                              onChange={e => setFeedbackText(e.target.value)}
                              placeholder="Please describe exactly what needs to be fixed or updated in this milestone..."
                              className="w-full min-h-[80px] p-2.5 rounded bg-black/40 border border-white/15 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-amber-400 transition-all font-mono resize-none"
                            />
                            <div className="flex gap-2 justify-end">
                              <button
                                onClick={() => { setRevisionMilestoneId(null); setFeedbackText(''); }}
                                className="px-3 py-1.5 rounded bg-white/5 border border-white/10 hover:bg-white/10 text-white text-xs font-mono uppercase tracking-wider transition-all cursor-pointer"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleRequestRevisionSubmit(ms)}
                                className="px-3 py-1.5 rounded bg-amber-500 text-black hover:bg-amber-600 text-xs font-mono uppercase tracking-wider transition-all cursor-pointer font-bold"
                              >
                                Submit Revision Feed
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Render active revision notes if any */}
                        {(ms as any).clientRevisionNotes && (ms as any).clientApprovalStatus === 'revision-requested' && (
                          <div className="mt-4 p-3 rounded-lg border border-amber-500/10 bg-amber-500/5 text-xs">
                            <p className="text-[9px] font-mono text-amber-400 uppercase tracking-widest font-bold mb-1">Latest Client Feedback:</p>
                            <p className="text-white/80 font-mono italic">
                              "{(ms as any).clientRevisionNotes}"
                            </p>
                          </div>
                        )}

                        {/* Progress Bar */}
                        <div className="mt-4 space-y-1.5">
                          <div className="flex justify-between text-[10px] font-mono text-white/40">
                            <span>Milestone Progress</span>
                            <span className="text-white/70 font-semibold">{ms.progress}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden border border-white/5">
                            <div
                              className="h-full bg-gradient-to-r from-blue-500 to-brand-400 rounded-full"
                              style={{ width: `${ms.progress}%`, transition: 'width 1s ease' }}
                            />
                          </div>
                        </div>

                        {/* Child Tasks List */}
                        <div className="mt-5 border-t border-white/5 pt-4 space-y-2">
                          <p className="text-[9px] font-mono text-white/30 uppercase tracking-widest mb-2">Milestone Checklist</p>

                          {ms.subTasks.map(sub => (
                            <div key={sub.id} className="flex items-center justify-between p-2 rounded bg-black/20 border border-white/5 hover:border-white/10 text-xs">
                              <div className="flex items-start gap-2">
                                <button
                                  onClick={() => !readOnly && updateProjectTask(sub.id, { status: sub.status === 'done' ? 'todo' : 'done' })}
                                  disabled={readOnly}
                                  className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 mt-0.5 transition-all ${sub.status === 'done'
                                      ? 'bg-blue-500 border-blue-400 text-white'
                                      : 'border-white/20 hover:border-blue-400'
                                    } ${readOnly ? 'cursor-default' : 'cursor-pointer'}`}
                                >
                                  {sub.status === 'done' && <Icon name="square-check" className="w-2.5 h-2.5" />}
                                </button>
                                {isPlainEnglish && translations[sub.id] ? (
                                  <div className="space-y-0.5 max-w-xs py-0.5 text-left">
                                    <span className={`text-[12px] font-semibold block leading-tight ${sub.status === 'done' ? 'line-through text-white/35' : 'text-white/90'}`}>
                                      {translations[sub.id].simpleTitle}
                                    </span>
                                    <p className="text-[10px] text-zinc-400 font-mono leading-relaxed">{translations[sub.id].simpleDesc}</p>
                                  </div>
                                ) : (
                                  <span className={sub.status === 'done' ? 'line-through text-white/30' : 'text-white/80'}>
                                    {sub.title}
                                  </span>
                                )}
                              </div>
                              {!readOnly && (
                                <button
                                  onClick={() => deleteProjectTask(sub.id)}
                                  className="text-white/15 hover:text-rose-400 transition-colors p-0.5"
                                >
                                  <Icon name="trash-empty" className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          ))}

                          {/* Quick sub-task add */}
                          {!readOnly && (
                            <div className="flex gap-2 pt-2">
                              <input
                                type="text"
                                value={newSubTaskTitles[ms.id] || ''}
                                onChange={e => setNewSubTaskTitles(prev => ({ ...prev, [ms.id]: e.target.value }))}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') handleAddSubTask(ms.id);
                                }}
                                placeholder="Allocate new sub-task..."
                                className="flex-1 px-2.5 py-1 rounded bg-black/30 border border-white/5 hover:border-white/10 focus:border-blue-400 focus:outline-none text-[11px] text-white placeholder:text-white/20"
                              />
                              <button
                                onClick={() => handleAddSubTask(ms.id)}
                                className="px-2.5 py-1 rounded bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-400 font-mono text-[10px] uppercase tracking-wider transition-all cursor-pointer"
                              >
                                Add
                              </button>
                            </div>
                          )}
                        </div>

                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right Column: Unparented Tasks (Backlog) & Progress Insights */}
            <div className="space-y-6">

              {/* general backlog */}
              <div className="rounded-xl border border-white/10 bg-white/5 p-6 space-y-4">
                <div>
                  <h2 className="text-sm font-mono font-semibold uppercase tracking-widest text-white/60 flex items-center gap-2">
                    <Icon name="list-checklist" className="w-4 h-4 text-brand-400" />
                    General Task Backlog ({unparentedTasks.length})
                  </h2>
                  <p className="text-[10px] font-mono text-white/30 uppercase mt-0.5">
                    Tasks outside milestone checkpoints
                  </p>
                </div>

                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                  {unparentedTasks.length === 0 ? (
                    <div className="text-center py-12 border border-dashed border-white/5 rounded-xl text-white/30 font-mono text-xs">
                      No unparented tasks. All tasks are matched to Milestones!
                    </div>
                  ) : (
                    unparentedTasks.map(t => (
                      <div key={t.id} className="flex items-center justify-between p-3 rounded-lg bg-black/20 border border-white/5 hover:border-white/10 text-xs">
                        <div className="flex items-center gap-2.5">
                          <button
                            onClick={() => !readOnly && updateProjectTask(t.id, { status: t.status === 'done' ? 'todo' : 'done' })}
                            disabled={readOnly}
                            className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-all ${t.status === 'done'
                                ? 'bg-blue-500 border-blue-400 text-white'
                                : 'border-white/20 hover:border-blue-400'
                              } ${readOnly ? 'cursor-default' : 'cursor-pointer'}`}
                          >
                            {t.status === 'done' && <Icon name="square-check" className="w-2.5 h-2.5" />}
                          </button>
                          {isPlainEnglish && translations[t.id] ? (
                            <div className="space-y-0.5 max-w-xs py-0.5 text-left">
                              <span className={`text-[12px] font-semibold block leading-tight ${t.status === 'done' ? 'line-through text-white/35' : 'text-white/90'}`}>
                                {translations[t.id].simpleTitle}
                              </span>
                              <p className="text-[10px] text-zinc-400 font-mono leading-relaxed">{translations[t.id].simpleDesc}</p>
                            </div>
                          ) : (
                            <span className={t.status === 'done' ? 'line-through text-white/30' : 'text-white/80'}>
                              {t.title}
                            </span>
                          )}
                        </div>
                        {!readOnly && (
                          <button
                            onClick={() => deleteProjectTask(t.id)}
                            className="text-white/15 hover:text-rose-400 transition-colors p-1"
                          >
                            <Icon name="trash-empty" className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {/* Add unparented task */}
                {!readOnly && (
                  <div className="flex gap-2 pt-2 border-t border-white/5">
                    <input
                      type="text"
                      id="backlog-task-input"
                      placeholder="Allocate new backlog task..."
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          const val = e.currentTarget.value.trim();
                          if (val) {
                            addProjectTask(val, 'Backlog Task', [], []);
                            e.currentTarget.value = '';
                          }
                        }
                      }}
                      className="flex-1 px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 hover:border-white/15 focus:border-blue-400 focus:outline-none text-xs text-white placeholder:text-white/30 font-mono"
                    />
                    <button
                      onClick={() => {
                        const input = document.getElementById('backlog-task-input') as HTMLInputElement;
                        const val = input?.value.trim();
                        if (val) {
                          addProjectTask(val, 'Backlog Task', [], []);
                          input.value = '';
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-400 font-mono text-xs uppercase tracking-wider transition-all cursor-pointer"
                    >
                      Add
                    </button>
                  </div>
                )}
              </div>

              {/* Insights Audit summary */}
              <div className="rounded-xl border border-white/10 bg-white/5 p-6 space-y-4">
                <h2 className="text-sm font-mono font-semibold uppercase tracking-widest text-purple-300 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-purple-400 animate-pulse" />
                  Milestone Health Insights
                </h2>

                <div className="p-4 rounded-lg bg-purple-950/15 border border-purple-500/15 text-xs text-white/70 space-y-3 font-body">
                  <div className="flex items-center gap-2">
                    <Icon name="trending-up" className="w-4 h-4 text-purple-400 shrink-0" />
                    <span>
                      Total Milestone completion rate: <strong>
                        {milestones.length > 0
                          ? Math.round((milestones.filter(m => m.status === 'done').length / milestones.length) * 100)
                          : 0}%
                      </strong>
                    </span>
                  </div>
                  <div className="space-y-1 pt-1 border-t border-purple-500/10">
                    <p className="text-[10px] font-mono text-white/30 uppercase tracking-widest">Active Bottlenecks</p>
                    {milestones.filter(m => m.health === 'blocked').length > 0 ? (
                      <p className="text-rose-300">
                        ⚠️ <strong>{milestones.filter(m => m.health === 'blocked').length} milestone(s) blocked</strong> due to stalled child tasks.
                      </p>
                    ) : milestones.filter(m => m.health === 'at-risk').length > 0 ? (
                      <p className="text-amber-300">
                        ⚠️ <strong>{milestones.filter(m => m.health === 'at-risk').length} milestone(s) at risk</strong> due to backlogs.
                      </p>
                    ) : (
                      <p className="text-emerald-400 font-semibold">
                        ✓ All milestones are currently tracking on schedule.
                      </p>
                    )}
                  </div>
                </div>
              </div>

            </div>

          </div>
        </div>
      ) : null}
    </div>
  );
}
