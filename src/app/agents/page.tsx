"use client"

import React, { useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { useRoster } from '@/hooks/use-roster';
import { MemberCard } from '@/components/roster/member-card';
import { Button } from '@/components/ui/button';

import Link from 'next/link';
import Image from 'next/image';

export default function AgentsPage() {
  const { members, loading } = useRoster();
  const [mounted, setMounted] = useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const coreAgentsList = React.useMemo(() => {
    const list: any[] = [];
    if (!members) return list;
    
    // 1. Sedilix
    const dbSedilix = members.find(m => m.name.toLowerCase() === 'sedilix');
    if (dbSedilix) {
      list.push(dbSedilix);
    }

    // 2. Gwen
    const dbGwen = members.find(m => m.name.toLowerCase() === 'gwen' || m.name.toLowerCase().includes('gwendalynn'));
    if (dbGwen) {
      list.push({ ...dbGwen, tier: 'none' });
    } else {
      list.push({
        id: 'core-gwen',
        uid: 'core-gwen',
        name: 'Gwendalynn (Gwen)',
        role: 'Co-Founder & Technical & RAG Lead',
        bio: 'Directs technical architecture, multi-model AI pipelines, zero-egress RAG systems, and custom retrieval infrastructure.',
        skills: ['Multi-Model AI', 'Zero-Egress RAG', 'Technical Architecture', 'Vector Retrieval', 'Python'],
        avatarUrl: '/members/gwen.jpg',
        joinedAt: { seconds: Date.now() / 1000 } as any,
        completedProjects: 28,
        isOnline: true,
        tier: 'none'
      });
    }

    // 3. ONE
    const dbOne = members.find(m => m.name.toUpperCase() === 'ONE' || m.uid === 'mock-1');
    if (dbOne) {
      list.push(dbOne);
    } else {
      list.push({
        id: 'mock-1',
        uid: 'mock-1',
        name: 'ONE',
        role: 'Autonomous Operations Architect',
        bio: 'Lead AGI systems orchestrator, real-time Firestore queue evaluator, and secure zero-egress local RAG pipeline administrator.',
        skills: ['AGI Systems', 'Local RAG', 'Python', 'Firestore', 'Matrix Gate'],
        avatarUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=200',
        joinedAt: { seconds: Date.now() / 1000 } as any,
        completedProjects: 0,
        isOnline: true,
        tier: 'Conductor'
      });
    }

    // 4. Iqbal
    const dbIqbal = members.find(m => m.name.toLowerCase() === 'iqbal');
    if (dbIqbal) {
      list.push({ ...dbIqbal, tier: 'none' });
    } else {
      list.push({
        id: 'core-iqbal',
        uid: 'core-iqbal',
        name: 'Iqbal',
        role: 'CPO, Cybrdeck',
        bio: 'Chief Product Officer at Cybrdeck, orchestrating product operations and strategic technical development.',
        skills: ['Product Strategy', 'UI/UX Design', 'Systems Architect', 'Agile Operations'],
        avatarUrl: '/members/iqbal.jpeg',
        joinedAt: { seconds: Date.now() / 1000 } as any,
        completedProjects: 12,
        isOnline: true,
        tier: 'none'
      });
    }

    // 5. Mehdi
    const dbMehdi = members.find(m => m.name.toLowerCase() === 'mehdi');
    if (dbMehdi) {
      list.push({ ...dbMehdi, tier: 'none' });
    } else {
      list.push({
        id: 'core-mehdi',
        uid: 'core-mehdi',
        name: 'Mehdi',
        role: 'CFO, Cybrdeck',
        bio: 'Chief Financial Officer at Cybrdeck, managing capital allocation, ecosystem growth partnerships, and financial operations.',
        skills: ['Financial Operations', 'Capital Allocation', 'Ecosystem Partnerships', 'Corporate Development'],
        avatarUrl: '/members/mehdi.jpeg',
        joinedAt: { seconds: Date.now() / 1000 } as any,
        completedProjects: 8,
        isOnline: true,
        tier: 'none'
      });
    }

    return list;
  }, [members]);

  const displayedMembers = React.useMemo(() => {
    if (!members) return [];
    // Filter out 1ightray and all core agents from dynamic list
    return members.filter(m => 
      m.uid !== 'DYjqEKLRIyf0lvC2j4juqLJs5Tu1' && 
      m.name.toLowerCase() !== '1ightray' &&
      m.name.toLowerCase() !== 'sedilix' &&
      m.name.toLowerCase() !== 'gwen' &&
      !m.name.toLowerCase().includes('gwendalynn') &&
      m.name.toLowerCase() !== 'one' &&
      m.name.toLowerCase() !== 'iqbal' &&
      m.name.toLowerCase() !== 'mehdi'
    );
  }, [members]);

  return (
    <div className="min-h-dvh flex flex-col p-6 bg-transparent relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full pointer-events-none -z-10 opacity-30">
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-primary/10 blur-[150px] rounded-full" />
        <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] bg-secondary/10 blur-[150px] rounded-full" />
      </div>

      <header className="w-full mb-12 flex justify-between items-center border-b border-white/5 pb-4">
        <Link href="/">
          <Button variant="outline" className="flex items-center gap-2 border border-white bg-black hover:bg-white/10 text-white font-mono text-xs uppercase tracking-widest px-4 h-9">
            <Icon name="arrow-left-md" className="h-4 w-4" /> Back Home
          </Button>
        </Link>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full pb-20">
        <div className="space-y-2 mb-12 flex flex-col items-center text-center">
            <Image 
              src={mounted ? "/cybrdeck-logo/cybrdeck_new_logo_cp_neonblue.png" : "/cybrdeck-logo/cybrdeck_logo_cropped_white.png"}
                alt="Cybrdeck Logo"
                width={400}
                height={80}
                className="h-24 md:h-32 w-auto object-contain drop-shadow-[0_0_8px_rgba(0,0,0,0.3)] mb-2"
                priority 
            />
            <h1 className="text-xl md:text-2xl uppercase font-mono tracking-[0.2em] text-foreground font-bold">
              The Collective
            </h1>
          <p className="text-sm text-muted-foreground max-w-xl font-body leading-relaxed mx-auto">
            At Cybrdeck, we operate as a unified team. No matter the distance, we bridge the gap between our specialized agents and our clientele.
          </p>
        </div>

        {/* Core Section */}
        <div className="space-y-4 mb-10 mt-6 text-center flex flex-col items-center">
          <h2 className="text-xl md:text-2xl font-headline font-bold uppercase tracking-tight text-foreground">
            Core Team
          </h2>
          <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest">
            Executive Operations and Strategic Architecture
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-4 w-full text-left">
            {coreAgentsList.map((member) => (
              <MemberCard key={member.id} member={member} />
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-white/5 my-16" />

        {/* Agents Section */}
        <div className="space-y-4 mb-10 text-center flex flex-col items-center">
          <h2 className="text-xl md:text-2xl font-headline font-bold uppercase tracking-tight text-foreground">
            Collective Agents
          </h2>
          <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest">
            Specialized Technical Operators
          </p>
          
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 py-12">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-64 rounded-xl bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : displayedMembers.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-4 w-full text-left animate-in fade-in duration-500">
              {displayedMembers.map((member) => (
                <MemberCard key={member.id} member={member} />
              ))}
            </div>
          ) : (
            <div className="text-center py-20 border border-dashed border-white/5 rounded-2xl bg-white/5">
              <p className="text-sm text-muted-foreground font-mono uppercase tracking-widest">No active agents registered in the collective registry database.</p>
            </div>
          )}
        </div>
      </main>

      <footer className="max-w-6xl mx-auto w-full p-8 text-center border-t border-white/5 mt-12">
        <p className="text-xs font-mono tracking-[0.2em] text-muted-foreground">
          © 2026 CYBRDECK SYSTEMS. ALL RIGHTS RESERVED.
        </p>
      </footer>
    </div>
  );
}
