"use client"

import { AuthGuard } from '@/components/auth-guard';
import { useState, useEffect, useMemo, useRef } from 'react';
import { doc, collection, query, getDocs, setDoc, where, onSnapshot } from 'firebase/firestore';
import { useAuth, useUser, useFirestore, useDoc, useCollection } from '@/firebase';
import { signOut, updateProfile } from 'firebase/auth';
import { useRouter, usePathname } from 'next/navigation';
import { Icon } from '@/components/ui/icon';
import Link from 'next/link';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useDashboardTab } from '@/lib/dashboard/use-dashboard-tab';
import { DashboardTabBar } from '@/components/dashboard/DashboardTabBar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const auth = useAuth();
  const { user } = useUser();

  const firestore = useFirestore();

  const adminDocRef = useMemo(() => {
    if (!firestore || !user?.email) return null;
    return doc(firestore, 'admins', user.email.toLowerCase());
  }, [firestore, user?.email]);

  const [projects, setProjects] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const [localAvatar, setLocalAvatar] = useState<string | null>(null);

  // Shared with app/dashboard/page.tsx so the highlighted item and the
  // rendered content can never disagree. This used to be a private
  // `useState('#overview')` here and a private `useState('#projects')` there
  // — and since no item below matches '#overview', a bare /dashboard URL
  // highlighted nothing. See src/lib/dashboard/nav.ts.
  const activeHash = useDashboardTab();

  const [requestsCount, setRequestsCount] = useState(0);

  // Subscribe to live client requests count
  useEffect(() => {
    if (!firestore || !user) return;
    const q = query(
      collection(firestore, 'client_requests'),
      where('status', '==', 'pending')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let count = 0;
      snapshot.forEach(doc => {
        const data = doc.data();
        const isUnassigned = data.agentId === 'unassigned';
        const isTargetedToMe = data.agentId ? data.agentId.split(',').includes(user.uid) : false;
        if (isUnassigned || isTargetedToMe) {
          count++;
        }
      });
      setRequestsCount(count);
    }, (error) => {
      console.error("Failed to fetch pending requests count", error);
    });

    return () => unsubscribe();
  }, [firestore, user]);

  // Fetch projects for the dropdown
  useEffect(() => {
    if (!firestore) return;
    const fetchProjects = async () => {
      try {
        const q = query(collection(firestore, 'projects'));
        const snapshot = await getDocs(q);
        const fetched: any[] = [];
        snapshot.forEach(d => fetched.push({ id: d.id, ...d.data() }));
        setProjects(fetched);
      } catch (e) {
        console.error("Failed to fetch projects", e);
      }
    };
    fetchProjects();
  }, [firestore]);

  // Click outside to close search dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredProjects = projects.filter(p => p.title?.toLowerCase().includes(searchQuery.toLowerCase()));

  const { data: adminDoc } = useDoc(adminDocRef);

  const adminData = adminDoc as { role?: string; uiAccess?: boolean } | null;
  const isAdmin = adminData?.role === 'admin' && adminData?.uiAccess === true;

  // Core (Cybrdeck portal) role — read from users/{uid}.portalRole. Mirrors
  // the `isCoreOrAdmin` Firestore rule, so the sidebar matches the API gate.
  const userDocRef = useMemo(() => {
    if (!firestore || !user?.uid) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user?.uid]);
  const { data: userDoc } = useDoc(userDocRef);
  const userData = userDoc as { portalRole?: string; avatarUrl?: string } | null;
  const isCore = userData?.portalRole === 'Admin' || userData?.portalRole === 'Cybrdeck';
  const isCoreOrAdmin = isAdmin || isCore;

  const membersQuery = useMemo(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'members'));
  }, [firestore]);

  const { data: members } = useCollection(membersQuery);

  const isAgent = useMemo(() => {
    if (!user) return false;
    const rosterMatch = members?.some((m: any) => m.uid === user.uid) || false;
    return rosterMatch || isAdmin;
  }, [members, user, isAdmin]);

  const pendingApplicantsQuery = useMemo(() => {
    if (!firestore || !isAdmin) return null;
    return query(
      collection(firestore, 'specialist_applications'),
      where('status', '==', 'pending')
    );
  }, [firestore, isAdmin]);

  const { data: pendingApplicants } = useCollection(pendingApplicantsQuery);
  const pendingCount = pendingApplicants?.length || 0;

  const handleLogout = async () => {
    if (auth) {
      await signOut(auth);
      router.push('/');
    }
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (file.size > 5 * 1024 * 1024) {
      alert("File is too large. Max size is 5MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new window.Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 150;
        const MAX_HEIGHT = 150;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          try {
            // Firestore is the source of truth for the onboarding profile
            // picture: Google re-logins reset the Auth photoURL, but
            // users/{uid}.avatarUrl survives and outranks it everywhere.
            if (firestore) {
              await setDoc(doc(firestore, 'users', user.uid), { avatarUrl: dataUrl }, { merge: true });
            }
            setLocalAvatar(dataUrl);
          } catch (error) {
            console.error("Failed to update profile picture", error);
            alert("Failed to update profile picture");
            return;
          }
          // Best-effort Auth sync. Firebase Auth caps photoURL length and
          // rejects data URLs past it (auth/invalid-profile-attribute) —
          // harmless here, since every avatar surface reads avatarUrl first.
          try {
            await updateProfile(user, { photoURL: dataUrl });
          } catch (error) {
            console.warn("Auth photoURL sync skipped:", (error as Error).message);
          }
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  return (
    <AuthGuard>
      <div className="min-h-dvh flex bg-background text-foreground font-sans transition-colors duration-300">
        
        {/* Left Sidebar */}
        <aside className="w-64 border-r border-zinc-800/80 bg-zinc-950/80 backdrop-blur-xl flex flex-col hidden md:flex shrink-0 transition-colors duration-300">
          <div className="p-4 flex items-center justify-between border-b border-zinc-800/70 bg-zinc-950/50">
            <Link href="/" className="cursor-pointer hover:opacity-90 transition-opacity">
              <Image 
                src="/cybrdeck-logo/cybrdeck_logo_cropped_white.png" 
                alt="Cybrdeck Logo" 
                width={150} 
                height={40} 
                className="h-7 w-auto object-contain" 
                priority 
              />
            </Link>
            <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-brand-400 bg-brand-500/10 border border-brand-500/30 px-1.5 py-0.5 rounded">
              Portal
            </span>
          </div>
          
          <div className="flex-1 overflow-y-auto py-4 custom-scrollbar">
            <div className="px-3 space-y-1 mb-6">
              
              <div className="relative mb-3" ref={searchRef}>
                <div className="flex items-center gap-2 px-3 py-2 bg-zinc-900/60 border border-zinc-800 rounded-xl focus-within:ring-1 focus-within:ring-brand-500/40 focus-within:border-brand-500/50 transition-all shadow-inner">
                  <Icon name="search" className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  <input 
                    type="text" 
                    placeholder="Search projects..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setIsSearchFocused(true)}
                    className="bg-transparent border-none outline-none text-xs w-full text-zinc-100 placeholder:text-zinc-500 font-sans"
                  />
                  {searchQuery && (
                    <Icon 
                      name="close-md" 
                      className="w-3 h-3 text-zinc-400 cursor-pointer hover:text-zinc-200 transition-colors" 
                      onClick={() => setSearchQuery('')} 
                    />
                  )}
                </div>
                
                {isSearchFocused && (searchQuery.length > 0 || projects.length > 0) && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-950/95 text-zinc-100 border border-zinc-800 shadow-2xl rounded-xl overflow-hidden z-50 max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200 backdrop-blur-xl">
                    {filteredProjects.length === 0 ? (
                      <div className="p-3 text-xs text-zinc-500 text-center font-mono">No projects found.</div>
                    ) : (
                      <div className="py-1">
                        {filteredProjects.map((p) => {
                          const isAssigned = p.assignedTo?.includes(user?.email || '');
                          return (
                            <a href="#projects" key={p.id} onClick={() => setIsSearchFocused(false)}>
                              <div className="px-3 py-2.5 text-xs hover:bg-zinc-900/80 cursor-pointer flex justify-between items-center transition-colors group">
                                <span className="truncate pr-2 font-medium text-zinc-300 group-hover:text-brand-300 transition-colors">{p.title}</span>
                                {isAssigned && (
                                  <span className="text-[9px] font-mono font-bold text-brand-300 bg-brand-500/10 border border-brand-500/30 px-1.5 py-0.5 rounded tracking-widest shrink-0">
                                    YOURS
                                  </span>
                                )}
                              </div>
                            </a>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <a href="#projects">
                <div className={cn(
                  "flex items-center gap-3 px-3 py-2 text-xs rounded-xl cursor-pointer transition-all duration-200 border",
                  activeHash === '#projects' 
                    ? "text-brand-300 bg-brand-950/30 border-brand-500/40 font-semibold shadow-[0_2px_12px_-2px_rgba(216,166,87,0.15)]" 
                    : "text-zinc-300 border-transparent hover:bg-zinc-900/60 hover:text-zinc-100"
                )}>
                  <Icon name="house-01" className={cn("w-4 h-4", activeHash === '#projects' ? "text-brand-400" : "text-zinc-400")} />
                  <span>Project Warehouse</span>
                </div>
              </a>
              
              {isAgent && (
                <Link href="/rag" target="_blank">
                  <div className="flex items-center justify-between px-3 py-2 text-xs text-zinc-300 border border-transparent hover:border-zinc-800 hover:bg-zinc-900/60 rounded-xl cursor-pointer transition-all duration-200 group">
                    <div className="flex items-center gap-3">
                      <Icon name="layers" className="w-4 h-4 text-brand-400" />
                      <span className="font-semibold text-zinc-200 group-hover:text-brand-300 transition-colors">Access RAG Pipeline</span>
                    </div>
                    <Icon name="chevron-right" className="w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-300 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </Link>
              )}
            </div>

            {isAgent && (
              <div className="mb-5">
                <div className="px-4 mb-1.5 text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-[0.2em]">What's new</div>
                <div className="px-3">
                  <a href="#requests">
                    <div className={cn(
                      "flex items-center justify-between px-3 py-2 text-xs rounded-xl cursor-pointer transition-all duration-200 border",
                      activeHash === '#requests'
                        ? "text-brand-300 bg-brand-950/30 border-brand-500/40 font-semibold"
                        : "text-zinc-300 border-transparent hover:bg-zinc-900/60 hover:text-zinc-100"
                    )}>
                      <div className="flex items-center gap-3">
                        <Icon name="mail" className={cn("w-4 h-4 shrink-0", activeHash === '#requests' ? "text-brand-400" : "text-zinc-400")} />
                        <span>Project Requests</span>
                      </div>
                      {requestsCount > 0 && (
                        <span className="text-[10px] font-mono bg-brand-500/20 text-brand-300 px-1.5 py-0.5 rounded-full border border-brand-500/40 font-bold animate-pulse">
                          {requestsCount}
                        </span>
                      )}
                    </div>
                  </a>
                </div>
              </div>
            )}

            {isAdmin && (
              <div className="mb-5">
                <div className="px-4 mb-1.5 text-[10px] font-mono font-bold text-brand-400/90 uppercase tracking-[0.2em] flex items-center gap-1.5">
                  <Icon name="star" className="w-3 h-3 text-brand-400" /> Admin Operations
                </div>
                <div className="px-3 space-y-1.5">
                  <Link href="/admin/one-progress">
                    <div className="flex items-center justify-between px-3 py-2.5 text-xs rounded-xl cursor-pointer transition-all duration-200 border border-zinc-800/80 bg-zinc-900/40 hover:border-brand-500/40 hover:bg-zinc-900/80 group">
                      <div className="flex items-center gap-2.5">
                        <Icon name="layers" className="w-4 h-4 text-brand-400 shrink-0" />
                        <span className="font-semibold text-zinc-200 group-hover:text-brand-200 transition-colors">One's Progress & Reports</span>
                      </div>
                      <Icon name="chevron-right" className="w-3.5 h-3.5 text-zinc-500 group-hover:text-brand-400 transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </Link>

                  <Link href="/admin/agents">
                    <div className="flex items-center justify-between px-3 py-2.5 text-xs rounded-xl cursor-pointer transition-all duration-200 border border-zinc-800/80 bg-zinc-900/40 hover:border-violet-500/40 hover:bg-zinc-900/80 group">
                      <div className="flex items-center gap-2.5">
                        <Icon name="grid-big" className="w-4 h-4 text-violet-400 shrink-0" />
                        <span className="font-semibold text-zinc-200 group-hover:text-violet-200 transition-colors">Agents Dashboard</span>
                      </div>
                      <Icon name="chevron-right" className="w-3.5 h-3.5 text-zinc-500 group-hover:text-violet-400 transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </Link>

                  <a href="#applicants">
                    <div className={cn(
                      "flex items-center justify-between px-3 py-2 text-xs rounded-xl cursor-pointer transition-all duration-200 border",
                      activeHash === '#applicants'
                        ? "text-brand-300 bg-brand-950/30 border-brand-500/40 font-semibold"
                        : "text-zinc-300 border-zinc-800/60 bg-zinc-900/30 hover:border-zinc-700 hover:bg-zinc-900/70"
                    )}>
                      <div className="flex items-center gap-2.5">
                        <Icon name="shield-warning" className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span className="font-semibold">Manage Applicants</span>
                      </div>
                      {pendingCount > 0 && (
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border bg-emerald-500/20 border-emerald-500/40 text-emerald-300 shadow-sm">
                          {pendingCount}
                        </span>
                      )}
                    </div>
                  </a>
                  <a href="#users">
                    <div className={cn(
                      "flex items-center justify-between px-3 py-2 text-xs rounded-xl cursor-pointer transition-all duration-200 border",
                      activeHash === '#users'
                        ? "text-brand-300 bg-brand-950/30 border-brand-500/40 font-semibold"
                        : "text-zinc-300 border-zinc-800/60 bg-zinc-900/30 hover:border-zinc-700 hover:bg-zinc-900/70"
                    )}>
                      <div className="flex items-center gap-2.5">
                        <Icon name="user-01" className="w-4 h-4 text-brand-400 shrink-0" />
                        <span className="font-semibold">Manage Users</span>
                      </div>
                    </div>
                  </a>
                </div>
              </div>
            )}

            {isCoreOrAdmin && (
              <div className="mb-5">
                <div className="px-4 mb-1.5 text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-[0.2em]">Core Operations</div>
                <div className="px-3 space-y-1.5">
                  <a href="#marketing">
                    <div className={cn(
                      "flex items-center justify-between px-3 py-2 text-xs rounded-xl cursor-pointer transition-all duration-200 border",
                      activeHash === '#marketing'
                        ? "text-brand-300 bg-brand-950/30 border-brand-500/40 font-semibold"
                        : "text-zinc-300 border-zinc-800/60 bg-zinc-900/30 hover:border-zinc-700 hover:bg-zinc-900/70"
                    )}>
                      <div className="flex items-center gap-2.5">
                        <Icon name="volume-max" className="w-4 h-4 text-brand-400 shrink-0" />
                        <span className="font-semibold">Marketing Agent</span>
                      </div>
                      <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-brand-300 bg-brand-500/10 border border-brand-500/30 px-1.5 py-0.5 rounded">
                        One
                      </span>
                    </div>
                  </a>
                  <a href="#social-control">
                    <div className={cn(
                      "flex items-center justify-between px-3 py-2 text-xs rounded-xl cursor-pointer transition-all duration-200 border",
                      activeHash === '#social-control'
                        ? "text-brand-300 bg-brand-950/30 border-brand-500/40 font-semibold"
                        : "text-zinc-300 border-zinc-800/60 bg-zinc-900/30 hover:border-zinc-700 hover:bg-zinc-900/70"
                    )}>
                      <div className="flex items-center gap-2.5">
                        <Icon name="shield-check" className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span className="font-semibold">Command Console</span>
                      </div>
                      <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-brand-300 bg-brand-500/10 border border-brand-500/30 px-1.5 py-0.5 rounded">
                        One
                      </span>
                    </div>
                  </a>
                </div>
              </div>
            )}

            {isAgent && (
              <div className="mb-5">
                <div className="px-4 mb-1.5 text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-[0.2em]">Project shortcuts</div>
                <div className="px-3 space-y-1">
                  <a href="#summary">
                    <div className={cn(
                      "flex items-center gap-3 px-3 py-2 text-xs rounded-xl cursor-pointer transition-all duration-200 border",
                      activeHash === '#summary' 
                        ? "text-brand-300 bg-brand-950/30 border-brand-500/40 font-semibold" 
                        : "text-zinc-300 border-transparent hover:bg-zinc-900/60 hover:text-zinc-100"
                    )}>
                      <Icon name="file-document" className={cn("w-4 h-4 shrink-0", activeHash === '#summary' ? "text-brand-400" : "text-zinc-400")} />
                      <span>Project Summary</span>
                    </div>
                  </a>
                  <a href="#timeline">
                    <div className={cn(
                      "flex items-center gap-3 px-3 py-2 text-xs rounded-xl cursor-pointer transition-all duration-200 border",
                      activeHash === '#timeline' 
                        ? "text-brand-300 bg-brand-950/30 border-brand-500/40 font-semibold" 
                        : "text-zinc-300 border-transparent hover:bg-zinc-900/60 hover:text-zinc-100"
                    )}>
                      <Icon name="calendar" className={cn("w-4 h-4 shrink-0", activeHash === '#timeline' ? "text-brand-400" : "text-zinc-400")} />
                      <span>Project Timeline</span>
                    </div>
                  </a>
                  <a href="#milestones">
                    <div className={cn(
                      "flex items-center gap-3 px-3 py-2 text-xs rounded-xl cursor-pointer transition-all duration-200 border",
                      activeHash === '#milestones' 
                        ? "text-brand-300 bg-brand-950/30 border-brand-500/40 font-semibold" 
                        : "text-zinc-300 border-transparent hover:bg-zinc-900/60 hover:text-zinc-100"
                    )}>
                      <Icon name="flag" className={cn("w-4 h-4 shrink-0", activeHash === '#milestones' ? "text-brand-400" : "text-zinc-400")} />
                      <span>Project Milestones</span>
                    </div>
                  </a>
                </div>
              </div>
            )}
            
            <div>
              <div className="px-4 mb-1.5 text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-[0.2em]">Internal Comms</div>
              <div className="px-3 space-y-1">
                {isAgent && (
                  <a href="#forum">
                    <div className={cn(
                      "flex items-center justify-between px-3 py-2 text-xs rounded-xl cursor-pointer transition-all duration-200 border",
                      activeHash === '#forum'
                        ? "text-brand-300 bg-brand-950/30 border-brand-500/40 font-semibold"
                        : "text-zinc-300 border-transparent hover:bg-zinc-900/60 hover:text-zinc-100"
                    )}>
                      <span>Agent Forum</span>
                      <Icon name="chevron-right" className="w-3.5 h-3.5 text-zinc-500" />
                    </div>
                  </a>
                )}
                <div className="flex items-center justify-between px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-900/60 rounded-xl cursor-pointer transition-colors">
                  <span>Feedback &amp; Disputes Channel</span>
                  <Icon name="chevron-right" className="w-3.5 h-3.5 text-zinc-500" />
                </div>
                <div className="flex items-center justify-between px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-900/60 rounded-xl cursor-pointer transition-colors">
                  <span>Request Project Change</span>
                  <Icon name="chevron-right" className="w-3.5 h-3.5 text-zinc-500" />
                </div>
              </div>
            </div>
          </div>
          
          <div className="p-4 border-t border-zinc-800/80 bg-zinc-950/90 text-zinc-100 shrink-0 transition-colors duration-300">
            <div className="flex items-center gap-3">
              <label className="w-10 h-10 bg-zinc-900 rounded-full flex items-center justify-center border border-zinc-700/80 overflow-hidden shrink-0 relative cursor-pointer group shadow-md">
                <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                {localAvatar || userData?.avatarUrl || user?.photoURL ? (
                  <>
                    <img 
                      src={localAvatar || userData?.avatarUrl || user?.photoURL || ''} 
                      alt="Avatar" 
                      referrerPolicy="no-referrer" 
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        if (e.currentTarget.nextElementSibling) {
                          (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'flex';
                        }
                      }}
                    />
                    <span 
                      className="text-zinc-400 text-sm font-semibold absolute inset-0 items-center justify-center bg-zinc-900" 
                      style={{ display: 'none' }}
                    >
                      {user?.email?.charAt(0).toUpperCase() || 'U'}
                    </span>
                  </>
                ) : (
                  <span className="text-zinc-400 text-sm font-semibold flex items-center justify-center w-full h-full">
                    {user?.email?.charAt(0).toUpperCase() || 'U'}
                  </span>
                )}
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Icon name="camera" className="w-4 h-4 text-white" />
                </div>
              </label>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-xs text-zinc-100 truncate">
                  {user?.displayName || user?.email?.split('@')[0] || 'User'}
                </div>
                <div className="text-[11px] font-mono text-zinc-400 truncate mb-1">
                  {user?.email || 'No email'}
                </div>
                <Link 
                  href="/dashboard/credentials" 
                  id="sidebar-edit-profile-link"
                  className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-brand-400 hover:text-brand-300 transition-colors"
                >
                  <Icon name="settings" className="w-3 h-3" />
                  Edit Profile
                </Link>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="mt-3 w-full py-1.5 px-3 bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-semibold text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 hover:border-zinc-700 transition-colors shadow-sm"
            >
              Sign out
            </button>
          </div>
        </aside>

        {/* Main Content Wrapper */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          
          {/* Top Navbar */}
          <header className="h-14 border-b border-zinc-800 flex items-center justify-between px-6 bg-zinc-950 shrink-0 transition-colors duration-300">
            <Link href="/">
              <Button variant="ghost" size="sm" className="text-xs font-mono uppercase tracking-widest text-zinc-400 hover:text-zinc-100 gap-1.5 p-0 sm:px-3">
                <Icon name="arrow-left-md" className="w-4 h-4" />
                <span>Back Home</span>
              </Button>
            </Link>
            <div className="flex items-center gap-4">
              <Icon name="bell-notification" className="w-5 h-5 text-zinc-400 cursor-pointer hover:text-zinc-100 transition-colors" />
              <Icon name="message-circle" className="w-5 h-5 text-zinc-400 cursor-pointer hover:text-zinc-100 transition-colors" />
            </div>
          </header>

          {/* Below `md` the sidebar is hidden and there was previously no
              replacement at all, leaving every destination unreachable on a
              phone. This rail carries the same items, from the same source. */}
          <DashboardTabBar
            activeHash={activeHash}
            isAgent={isAgent}
            isAdmin={isAdmin}
            isCoreOrAdmin={isCoreOrAdmin}
            requestsCount={requestsCount}
          />

          <div className="flex-1 overflow-y-auto bg-background p-4 md:p-8 transition-colors duration-300">
            <div className="max-w-6xl mx-auto">
              {children}
            </div>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
