"use client"

import React, { useState, useEffect } from 'react';
import { Icon } from '@/components/ui/icon';
import { useFirestore, useUser } from '@/firebase';
import { collection, query, getDocs, addDoc, serverTimestamp, updateDoc, doc, onSnapshot } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Activity, Server } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ProjectType {
  id: string;
  title: string;
  description: string;
  status: 'active' | 'archived' | 'completed';
  assignedTo: string[];
  createdAt: any;
}

export default function ProjectWarehousePage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [projects, setProjects] = useState<ProjectType[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  // Form State
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');

  useEffect(() => {
    if (!firestore || !user) return;
    setLoading(true);

    const q = query(collection(firestore, 'projects'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched: ProjectType[] = [];
      snapshot.forEach(doc => {
        fetched.push({ id: doc.id, ...doc.data() } as ProjectType);
      });
      // Sort by creation time (newest first)
      fetched.sort((a, b) => {
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA;
      });
      setProjects(fetched);
      setLoading(false);
    }, (error) => {
      console.error("Failed to subscribe to projects", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [firestore, user]);

  useEffect(() => {
    if (!firestore) return;
    const q = query(collection(firestore, 'members'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched: any[] = [];
      snapshot.forEach(doc => {
        fetched.push({ id: doc.id, ...doc.data() });
      });
      setMembers(fetched);
    });
    return () => unsubscribe();
  }, [firestore]);

  const memberWorkloads = React.useMemo(() => {
    if (members.length === 0) return [];
    
    return members.map(m => {
      const activeProjCount = projects.filter(p => 
        p.status === 'active' && 
        p.assignedTo?.some(email => 
          email.toLowerCase() === m.email?.toLowerCase() || 
          email.toLowerCase() === m.name?.toLowerCase()
        )
      ).length;

      let status: 'idle' | 'optimal' | 'high' | 'overloaded' = 'idle';
      let statusColor = 'text-zinc-400 bg-zinc-500/10 border-white/5';
      let statusText = 'Idle';

      if (activeProjCount >= 4) {
        status = 'overloaded';
        statusColor = 'text-rose-400 bg-rose-500/10 border-rose-500/20';
        statusText = 'Overloaded';
      } else if (activeProjCount === 3) {
        status = 'high';
        statusColor = 'text-amber-400 bg-amber-500/10 border-amber-500/20';
        statusText = 'High Capacity';
      } else if (activeProjCount >= 1) {
        status = 'optimal';
        statusColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
        statusText = 'Optimal';
      }

      return {
        id: m.uid || m.id,
        name: m.name,
        role: m.role || 'Specialist',
        email: m.email || '',
        activeCount: activeProjCount,
        status,
        statusColor,
        statusText
      };
    });
  }, [members, projects]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firestore || !user || !newTitle) return;

    try {
      await addDoc(collection(firestore, 'projects'), {
        title: newTitle,
        description: newDesc,
        status: 'active',
        assignedTo: [user.email],
        createdAt: serverTimestamp()
      });
      
      toast({
        title: "Project Initialized",
        description: `Successfully allocated space for ${newTitle} in the warehouse.`,
      });

      setNewTitle('');
      setNewDesc('');
      setIsCreating(false);
    } catch (e) {
      console.error("Failed to create project", e);
      toast({
        title: "Error",
        description: "Failed to create the project.",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Server className="h-6 w-6 text-primary" />
            Project Warehouse
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your local containers, active engagements, and data lakehouse instances.
          </p>
        </div>
        
        {projects.length > 0 && (
          <Button 
            onClick={() => setIsCreating(true)}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium flex items-center gap-2 cursor-pointer hover:ring-2 hover:ring-primary hover:ring-offset-2 hover:ring-offset-background transition-all"
          >
            <Icon name="plus" className="h-4 w-4" />
            Initialize Container
          </Button>
        )}
      </div>

      {/* Workload Capacity Heatmap */}
      {!loading && memberWorkloads.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
          <div>
            <h2 className="text-xs font-mono font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary animate-pulse" />
              Specialist Allocation Heatmap
            </h2>
            <p className="text-[10px] text-muted-foreground mt-0.5 uppercase font-mono">
              Live capacity monitoring & workload balancing
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 text-left">
            {memberWorkloads.map(member => (
              <div 
                key={member.id} 
                className="bg-background/40 border border-border/60 p-3.5 rounded-lg flex flex-col justify-between gap-3 hover:border-primary/20 transition-all"
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-xs text-foreground truncate">{member.name}</span>
                    <span className={`inline-flex items-center px-1.5 py-0.2 rounded text-[8px] font-mono border font-bold uppercase tracking-wider ${member.statusColor}`}>
                      {member.statusText}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">{member.role}</p>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
                    <span>Active Projects</span>
                    <span className="text-foreground font-semibold">{member.activeCount} / 4</span>
                  </div>
                  <div className="w-full h-1 bg-muted rounded-full overflow-hidden border border-border/10">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        member.status === 'overloaded' ? 'bg-rose-500'
                        : member.status === 'high' ? 'bg-amber-500'
                        : member.status === 'optimal' ? 'bg-emerald-500'
                        : 'bg-zinc-700'
                      }`}
                      style={{ width: `${Math.min((member.activeCount / 4) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {isCreating && (
        <div className="bg-card border border-border rounded-lg p-6 shadow-sm relative">
          <button 
            onClick={() => setIsCreating(false)}
            className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
          >
            <Icon name="close-md" className="h-5 w-5" />
          </button>
          <h2 className="text-lg font-semibold mb-4">Initialize New Container</h2>
          <form onSubmit={handleCreateProject} className="space-y-4 max-w-xl">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Project Identifier</label>
              <Input 
                value={newTitle}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTitle(e.target.value)}
                placeholder="e.g. AlphaFold Local Inference" 
                required
                className="bg-background"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Scope & Details</label>
              <Textarea 
                value={newDesc}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNewDesc(e.target.value)}
                placeholder="Describe the architecture, dependencies, or goals..." 
                className="bg-background resize-none"
                rows={3}
              />
            </div>
            <Button type="submit">Deploy Project Space</Button>
          </form>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Activity className="h-8 w-8 animate-spin mb-4 text-primary" />
          <p className="text-sm font-medium">Mounting Data Warehouse...</p>
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-border rounded-lg bg-background/50 shadow-2xl shadow-zinc-950/20 dark:shadow-zinc-950/80">
          <Icon name="folder-open" className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium text-foreground">Warehouse is empty</h3>
          <p className="text-sm text-muted-foreground max-w-md mt-1 mb-6">
            There are currently no active projects or data containers in your database. 
            Initialize one to start tracking your work.
          </p>
          <Button onClick={() => setIsCreating(true)} variant="outline" className="cursor-pointer hover:ring-2 hover:ring-primary transition-all">
            <Icon name="plus" className="h-4 w-4 mr-2" /> Initialize First Project
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <div 
              key={project.id} 
              className="bg-card border border-border rounded-xl p-5 shadow-lg shadow-zinc-950/10 dark:shadow-zinc-950/50 hover:border-primary/40 hover:shadow-2xl hover:shadow-zinc-950/20 dark:hover:shadow-zinc-950/80 transition-all duration-300 group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-mono font-semibold tracking-wider bg-emerald-100 text-emerald-700 uppercase">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    {project.status}
                  </span>
                  {project.assignedTo?.includes(user?.email || '') && (
                    <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-1 rounded">YOURS</span>
                  )}
                </div>
                
                <h3 className="text-lg font-bold text-foreground mb-2 group-hover:text-primary transition-colors">
                  {project.title}
                </h3>
                
                <p className="text-sm text-muted-foreground line-clamp-3 mb-4">
                  {project.description || 'No description provided for this container.'}
                </p>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-border mt-auto">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Icon name="users" className="h-4 w-4" />
                  <span>{(project.assignedTo || []).length} Operator(s)</span>
                </div>
                <Button variant="ghost" size="sm" className="h-8 text-xs font-medium gap-1 text-primary hover:text-primary hover:bg-primary/10">
                  Enter <Icon name="chevron-right" className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
