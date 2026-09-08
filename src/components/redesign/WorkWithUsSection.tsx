'use client';

import React, { useRef } from 'react';
import Link from 'next/link';
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from 'framer-motion';
import { ArrowUpRight, CheckCircle2, Send, ShieldCheck, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ContourGlassButton } from '@/components/ui/ContourGlassButton';

interface ProjectTrack {
  id: string;
  title: string;
  category: string;
  tagline: string;
  timeline: string;
  deliverables: string[];
  cta: string;
  href: string;
  featured?: boolean;
}

const PROJECT_TRACKS: ProjectTrack[] = [
  {
    id: 'discovery',
    title: 'Discovery & Blueprint',
    category: 'Scoping & Feasibility',
    tagline:
      'Map application architecture, test multi-model LLM feasibility, and deliver a production-ready roadmap before allocating major engineering capital.',
    timeline: '5 working days',
    deliverables: [
      'Interactive UI wireframe prototype',
      'Multi-model LLM feasibility & latency report',
      'Database schema & state flow architecture',
      'Fixed-price milestone engineering blueprint',
    ],
    cta: 'Submit Discovery Proposal',
    href: '/proposal-form?type=discovery',
  },
  {
    id: 'mvp',
    title: 'The 14-Day MVP',
    category: 'Rapid Prototype',
    tagline:
      'A fully functional, cloud-deployed prototype ready for early customer validation, pilot testing, and live stakeholder demos in two weeks.',
    timeline: '14 calendar days',
    deliverables: [
      'Production Next.js responsive web application',
      'Multi-provider LLM API & streaming integration',
      'Firebase Auth, database & storage setup',
      '100% full source code and repository handover',
    ],
    cta: 'Submit MVP Proposal',
    href: '/proposal-form?type=mvp',
  },
  {
    id: 'scaleup',
    title: 'Production Platform Scale-Up',
    category: 'Custom Infrastructure',
    tagline:
      'For growing teams needing hardened multi-model gateways, automated data pipelines, team credit allocation, and robust guardrails.',
    timeline: '6–12 weeks',
    deliverables: [
      'Scalable cloud infrastructure with Cloud Run',
      'Per-team token budgeting & model arbitration',
      'Automated RAG ingestion & vector indexing',
      'CI/CD deployment pipelines & handover docs',
    ],
    cta: 'Scale Your Platform',
    href: '/proposal-form?type=scaleup',
    featured: true,
  },
  {
    id: 'full_works',
    title: 'Bespoke AI & Autonomous Systems',
    category: 'Enterprise Engineering',
    tagline:
      'End-to-end mission-critical AI systems featuring multi-agent directorate workflows, human-in-the-loop gates, and zero-egress private RAG.',
    timeline: '3–6 months',
    deliverables: [
      'Autonomous multi-agent orchestration engines',
      'Air-gapped & zero-egress local document retrieval',
      'Custom fine-tuned domain-specific SLMs',
      'Dedicated engineering team & priority SLA',
    ],
    cta: 'Commission Custom AI',
    href: '/proposal-form?type=full_works',
  },
];

/* ── Diagonal Contour Lines for Cards ───────────────────────────────── */
function CardContour({ seed, featured }: { seed: number; featured?: boolean }) {
  const curves = [
    'M-30,80 C90,40 240,10 460,-20',
    'M-20,160 C110,110 270,60 480,10',
    'M-40,240 C100,190 260,130 500,80',
    'M-10,310 C120,250 280,190 490,140',
  ];

  const strokeColor = featured
    ? 'rgba(216, 166, 87, 0.16)'
    : 'rgba(255, 255, 255, 0.08)';

  return (
    <svg
      className="pointer-events-none absolute inset-0 w-full h-full z-0"
      viewBox="0 0 460 360"
      preserveAspectRatio="none"
      fill="none"
    >
      {curves.map((d, i) => (
        <path
          key={i}
          d={d}
          stroke={strokeColor}
          strokeWidth={i === seed % curves.length ? 1.6 : 0.9}
          fill="none"
        />
      ))}
    </svg>
  );
}

/* ── 3D Interactive Deflection Card ─────────────────────────────────── */
const SPRING_CONFIG = { damping: 24, stiffness: 280, mass: 0.6 };

function ProjectTrackCard({ track, index }: { track: ProjectTrack; index: number }) {
  const cardRef = useRef<HTMLDivElement>(null);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const rotateX = useSpring(useTransform(mouseY, (v) => -v * 8), SPRING_CONFIG);
  const rotateY = useSpring(useTransform(mouseX, (v) => v * 8), SPRING_CONFIG);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    mouseX.set(x);
    mouseY.set(y);
  };

  const handlePointerLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  return (
    <div style={{ perspective: 1000 }} className="w-full h-full">
      <motion.div
        ref={cardRef}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        style={{
          rotateX,
          rotateY,
          transformStyle: 'preserve-3d',
        }}
        className={cn(
          'relative flex h-full flex-col justify-between rounded-2xl p-6 sm:p-7 overflow-hidden cd-crystal',
          track.featured && 'cd-crystal--cyan'
        )}
      >
        {/* Diagonal Contour Isolines */}
        <CardContour seed={index} featured={track.featured} />

        {/* Content Body */}
        <div className="relative z-10 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-brand-300/90 tracking-wide uppercase">
              {track.category}
            </span>
            <span className="text-[11px] text-zinc-400 font-normal">
              {track.timeline}
            </span>
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-white tracking-tight leading-snug">
              {track.title}
            </h3>
            <p className="text-[13px] text-zinc-300 leading-relaxed">
              {track.tagline}
            </p>
          </div>

          {/* Deliverables list */}
          <ul className="space-y-2 pt-2 border-t border-white/8 text-[12px] text-zinc-300">
            {track.deliverables.map((item, i) => (
              <li key={i} className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-brand-400 shrink-0 mt-0.5" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Action Button */}
        <div className="relative z-10 pt-6 mt-4">
          <ContourGlassButton effect="rim" asChild size="default" className="w-full">
            <Link href={track.href}>
              <span>{track.cta}</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-zinc-300" />
            </Link>
          </ContourGlassButton>
        </div>
      </motion.div>
    </div>
  );
}

/* ── Work With Us Section ───────────────────────────────────────────── */

export function WorkWithUsSection({ id = 'work-with-us' }: { id?: string }) {
  return (
    <section
      id={id}
      className="relative z-20 w-full border-t border-white/5 bg-transparent px-4 py-24 sm:px-6 lg:px-8 scroll-mt-20"
    >
      <div className="mx-auto max-w-7xl space-y-14">
        {/* Section Header */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8">
          <div className="max-w-3xl space-y-4">
            <h2 className="text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.08] tracking-[-0.03em] text-white">
              Have a project in mind? Let&apos;s build it.
            </h2>
            <p className="text-base sm:text-lg leading-relaxed text-zinc-400">
              Submit your project scope through our structured proposal pipeline. We scope feasibility, design multi-model architectures, and deliver production-grade systems on fixed milestones with full source code ownership.
            </p>
          </div>

          <ContourGlassButton effect="rim" asChild size="default" className="shrink-0">
            <Link href="/proposal-form">              <span>Let&apos;s Get Started</span>
              <ArrowUpRight className="w-4 h-4 text-zinc-400" />
            </Link>
          </ContourGlassButton>
        </div>

        {/* 4-Step Pipeline Assurance Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-5 rounded-2xl cd-crystal">
          <div className="flex items-start gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500/15 text-brand-300 font-mono text-xs font-semibold shrink-0">
              01
            </span>
            <div>
              <p className="text-xs font-semibold text-white">Submit Brief</p>
              <p className="text-[11px] text-zinc-400 leading-snug">Detail your idea, stack constraints, and target timeline.</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500/15 text-brand-300 font-mono text-xs font-semibold shrink-0">
              02
            </span>
            <div>
              <p className="text-xs font-semibold text-white">Architecture Review</p>
              <p className="text-[11px] text-zinc-400 leading-snug">We map model feasibility and deliver a technical blueprint in 48h.</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500/15 text-brand-300 font-mono text-xs font-semibold shrink-0">
              03
            </span>
            <div>
              <p className="text-xs font-semibold text-white">Sprint Execution</p>
              <p className="text-[11px] text-zinc-400 leading-snug">Fixed-price milestone delivery with weekly staging reviews.</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500/15 text-brand-300 font-mono text-xs font-semibold shrink-0">
              04
            </span>
            <div>
              <p className="text-xs font-semibold text-white">100% Handover</p>
              <p className="text-[11px] text-zinc-400 leading-snug">Full source code ownership, repository transfer, and deployment docs.</p>
            </div>
          </div>
        </div>

        {/* 2x2 Structured Project Track Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
          {PROJECT_TRACKS.map((track, idx) => (
            <ProjectTrackCard key={track.id} track={track} index={idx} />
          ))}
        </div>

        {/* Grounded Footnote */}
        <div className="pt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-zinc-500 border-t border-white/5">
          <p>All client engagements include confidential non-disclosure and zero-telemetry private data guarantees.</p>
        </div>
      </div>
    </section>
  );
}
