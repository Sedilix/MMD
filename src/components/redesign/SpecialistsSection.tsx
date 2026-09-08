'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Sparkles,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Cpu,
  Brain,
  Code2,
  Briefcase,
} from 'lucide-react';
import { ContourGlassButton } from '@/components/ui/ContourGlassButton';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface SpecialistProfile {
  id: string;
  name: string;
  role: string;
  type: 'Autonomous Agent' | 'Leadership';
  bio: string;
  skills: string[];
  avatarUrl: string;
  isOnline: boolean;
  statusText: string;
  completedEngagements: number;
}

const SPECIALISTS: SpecialistProfile[] = [
  {
    id: 'one',
    name: 'ONE',
    role: 'Autonomous Operations Architect',
    type: 'Autonomous Agent',
    bio: 'Lead systems orchestrator, real-time queue evaluator, and secure zero-egress local RAG pipeline administrator.',
    skills: ['Autonomous Orchestration', 'Local RAG', 'Python', 'Firestore', 'Consensus Arbitration'],
    avatarUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=300',
    isOnline: true,
    statusText: 'Active in Workspace',
    completedEngagements: 48,
  },
  {
    id: 'sedilix',
    name: 'Sedilix',
    role: 'Founder & Chief Executive Officer',
    type: 'Leadership',
    bio: 'Technical founder directing core multi-model infrastructure, platform strategy, and venture co-building pipelines.',
    skills: ['Platform Architecture', 'Distributed Systems', 'Venture Development', 'Executive Strategy'],
    avatarUrl: '/members/sedilix.jpeg',
    isOnline: true,
    statusText: 'Available for Advisory',
    completedEngagements: 36,
  },
  {
    id: 'gwen',
    name: 'Gwendalynn (Gwen)',
    role: 'Co-Founder & Technical & RAG Lead',
    type: 'Leadership',
    bio: 'Directs technical architecture, multi-model AI pipelines, zero-egress RAG systems, and custom retrieval infrastructure.',
    skills: ['Multi-Model AI', 'Zero-Egress RAG', 'Technical Architecture', 'Vector Retrieval', 'Python'],
    avatarUrl: '/members/gwen.jpg',
    isOnline: true,
    statusText: 'Active on Core Systems',
    completedEngagements: 31,
  },
  {
    id: 'iqbal',
    name: 'Iqbal',
    role: 'Chief Product Officer',
    type: 'Leadership',
    bio: 'Product strategist orchestrating user-facing interfaces, component design systems, and rapid prototyping workflows.',
    skills: ['Product Strategy', 'UI/UX Design Systems', 'Systems Architecture', 'Agile Operations'],
    avatarUrl: '/members/iqbal.jpeg',
    isOnline: true,
    statusText: 'Active on Core Systems',
    completedEngagements: 24,
  },
  {
    id: 'mehdi',
    name: 'Mehdi',
    role: 'Chief Financial Officer',
    type: 'Leadership',
    bio: 'Directing capital allocation, unit economics governance, and corporate partnerships across incubated startups.',
    skills: ['Capital Allocation', 'Venture Finance', 'Ecosystem Partnerships', 'Corporate Governance'],
    avatarUrl: '/members/mehdi.jpeg',
    isOnline: true,
    statusText: 'Available for Partners',
    completedEngagements: 19,
  },
];

/** Avatar with a monogram fallback — a missing photo must never leave
 * an empty well on the card. */
function SpecialistAvatar({ name, avatarUrl }: { name: string; avatarUrl: string }) {
  const [errored, setErrored] = useState(false);
  return (
    <div className="relative h-16 w-16 overflow-hidden rounded-2xl border border-white/15 bg-black/60 shadow-md">
      {!errored ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={avatarUrl}
          alt={name}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          onError={() => setErrored(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-600 to-blue-700 text-lg font-semibold text-white">
          {name.substring(0, 2).toUpperCase()}
        </div>
      )}
    </div>
  );
}

export function SpecialistsSection({ id = 'specialists' }: { id?: string }) {
  return (
    <section
      id={id}
      className="relative z-20 w-full border-t border-white/5 bg-transparent px-4 py-24 sm:px-6 lg:px-8 scroll-mt-20"
    >
      <div className="mx-auto max-w-7xl space-y-12">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="max-w-2xl space-y-4">
            <h2 className="text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.08] tracking-[-0.03em] text-white">
              Specialists built for every tier of execution.
            </h2>
            <p className="text-base leading-relaxed text-zinc-400">
              Deploy autonomous operations architects and collaborate directly alongside experienced
              technical leads to design, scale, and operate production systems.
            </p>
          </div>

          <ContourGlassButton effect="rim" asChild size="default">
            <Link href="/agents">
              <span>Explore Full Roster</span>
              <ArrowRight className="ml-1 h-3.5 w-3.5 text-zinc-300" />
            </Link>
          </ContourGlassButton>
        </div>

        {/* Specialists Grid */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {SPECIALISTS.map((spec) => (
            <div
              key={spec.id}
              className="group flex flex-col justify-between rounded-2xl cd-crystal p-6"
            >
              <div className="space-y-4">
                {/* Avatar & Status Header */}
                <div className="flex items-start justify-between">
                  <SpecialistAvatar name={spec.name} avatarUrl={spec.avatarUrl} />

                  <div className="flex flex-col items-end gap-1">
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-mono font-medium',
                        spec.type === 'Autonomous Agent'
                          ? 'border border-brand-400/30 bg-brand-400/10 text-brand-300'
                          : 'border border-amber-400/30 bg-amber-400/10 text-amber-300',
                      )}
                    >
                      {spec.type}
                    </span>
                    <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      {spec.statusText}
                    </span>
                  </div>
                </div>

                {/* Name & Role */}
                <div>
                  <h3 className="text-base font-semibold text-white group-hover:text-brand-200 transition-colors">
                    {spec.name}
                  </h3>
                  <p className="mt-0.5 text-xs text-zinc-400 leading-snug">{spec.role}</p>
                </div>

                {/* Bio */}
                <p className="text-xs leading-relaxed text-zinc-300">{spec.bio}</p>

                {/* Skills Tags */}
                <div className="flex flex-wrap gap-1.5 pt-2 border-t border-white/5">
                  {spec.skills.map((skill) => (
                    <span
                      key={skill}
                      className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] font-mono text-zinc-400"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>

              {/* Card Footer Engagement Count */}
              <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-4 text-[11px] font-mono text-zinc-500">
                <span>Engagements: {spec.completedEngagements}</span>
                <span className="text-brand-400 group-hover:translate-x-0.5 transition-transform">
                  Profile →
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
