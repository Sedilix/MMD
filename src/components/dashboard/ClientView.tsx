"use client"

import React, { useState, useEffect } from 'react';
import { Icon } from '@/components/ui/icon';
import { useFirestore, useUser } from '@/firebase';
import { collection, query, where, onSnapshot, addDoc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Activity } from 'lucide-react';
import Link from 'next/link';
import ProjectTimeline from './ProjectTimeline';
import ProjectMilestones from './ProjectMilestones';

interface ProjectType {
  id: string;
  title: string;
  description: string;
  status: 'active' | 'archived' | 'completed';
  assignedTo: string[];
  clientId?: string;
  createdAt: any;
}

export function ClientView() {
  const { user } = useUser();
  const firestore = useFirestore();

  const [projects, setProjects] = useState<ProjectType[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<ProjectType | null>(null);
  const [activeTab, setActiveTab] = useState<'milestones' | 'timeline'>('milestones');

  // Listen to hashchange to reset selectedProject when client clicks 'Project Warehouse' in the sidebar
  useEffect(() => {
    const handleHash = () => {
      if (window.location.hash === '#projects' || window.location.hash === '') {
        setSelectedProject(null);
      }
    };
    window.addEventListener('hashchange', handleHash);
    handleHash();
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);



  useEffect(() => {
    if (!firestore || !user) return;
    setLoading(true);

    const q = query(
      collection(firestore, 'projects'),
      where('assignedTo', 'array-contains', user.email)
    );
    
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
      console.error("Failed to subscribe to client projects", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [firestore, user]);

  // Render drill-down view if a project is selected
  if (selectedProject) {
    return (
      <div className="w-full max-w-5xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Detail Header */}
        <div className="flex flex-col gap-4 border-b border-border pb-6">
          <div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setSelectedProject(null)} 
              className="text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground gap-1.5 p-0 mb-3"
            >
              <Icon name="arrow-left-md" className="h-4 w-4" /> Back to Portal Overview
            </Button>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">
                {selectedProject.title}
              </h1>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold tracking-wider bg-primary/10 text-primary uppercase">
                {selectedProject.status === 'active' ? <Activity className="w-3 h-3 animate-pulse" /> : <Icon name="circle-check" className="w-3 h-3" />}
                {selectedProject.status}
              </span>
            </div>
            {selectedProject.description && (
              <p className="text-sm text-muted-foreground mt-2 max-w-3xl">
                {selectedProject.description}
              </p>
            )}
          </div>

          {/* Tabs Selector */}
          <div className="flex border-b border-border/50 gap-6 mt-4">
            <button
              onClick={() => setActiveTab('milestones')}
              className={`pb-3 text-sm font-semibold uppercase tracking-wider transition-all border-b-2 font-mono ${
                activeTab === 'milestones'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Milestone Checklist
            </button>
            <button
              onClick={() => setActiveTab('timeline')}
              className={`pb-3 text-sm font-semibold uppercase tracking-wider transition-all border-b-2 font-mono ${
                activeTab === 'timeline'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Project Timeline
            </button>
          </div>
        </div>

        {/* Tab Contents */}
        <div className="pt-2">
          {activeTab === 'milestones' ? (
            <ProjectMilestones projectId={selectedProject.id} readOnly={true} />
          ) : (
            <ProjectTimeline projectId={selectedProject.id} readOnly={true} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            Client Portal
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track your active engagements, review deliverables, and request new capabilities.
          </p>
        </div>
        
        <div className="flex gap-3">

          {!loading && projects.length > 0 && (
            <Link href="/proposal-form">
              <Button 
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium flex items-center gap-2 transition-all"
              >
                Initiate New Project
              </Button>
            </Link>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Activity className="h-8 w-8 animate-spin mb-4 text-primary" />
          <p className="text-sm font-medium">Loading your projects...</p>
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-border rounded-lg bg-background/50">
          <Icon name="folder-open" className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium text-foreground">No active projects</h3>
          <p className="text-sm text-muted-foreground max-w-md mt-1 mb-6">
            You don't have any active engagements with Cybrdeck right now.
          </p>
          <Link href="/proposal-form">
            <Button variant="outline" className="cursor-pointer hover:ring-2 hover:ring-primary transition-all">
              Initiate a Project
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {projects.map((project) => (
            <div 
              key={project.id} 
              className="bg-card border border-border rounded-xl p-6 shadow-sm hover:border-primary/40 transition-all duration-300 flex flex-col md:flex-row justify-between gap-6"
            >
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-mono font-semibold tracking-wider bg-primary/10 text-primary uppercase">
                    {project.status === 'active' ? <Activity className="w-3 h-3" /> : <Icon name="circle-check" className="w-3 h-3" />}
                    {project.status}
                  </span>
                </div>
                
                <h3 className="text-xl font-bold text-foreground mb-2">
                  {project.title}
                </h3>
                
                <p className="text-sm text-muted-foreground line-clamp-3 mb-4">
                  {project.description || 'No description provided.'}
                </p>
              </div>

              <div className="flex flex-col justify-center items-end gap-3 min-w-[150px] border-t md:border-t-0 md:border-l border-border pt-4 md:pt-0 md:pl-6">
                <p className="text-xs text-muted-foreground font-mono uppercase tracking-widest">Action Required</p>
                <div className="flex items-center gap-2">
                  <Icon name="circle" className="w-2 h-2 text-yellow-500 fill-current" />
                  <span className="text-sm text-foreground">Awaiting Review</span>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setSelectedProject(project)}
                  className="w-full text-xs font-medium gap-1 hover:text-primary hover:bg-primary/10 mt-2"
                >
                  View Details <Icon name="chevron-right" className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
