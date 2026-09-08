"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useFirestore, useUser } from '@/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { useRoster } from '@/hooks/use-roster';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ContourGlassButton } from '@/components/ui/ContourGlassButton';
import { ProceduralWaveContour } from '@/components/ui/ProceduralWaveContour';
import {
  FileSearch,
  Rocket,
  Layers,
  Code2,
  ShoppingCart,
  Database,
  Lock,
  LayoutDashboard,
  Server,
  Zap,
  Cloud,
  ShieldCheck,
  ClipboardCheck,
  Check,
  ChevronRight,
  ArrowLeft,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Sparkles,
  User as UserIcon,
  Send,
  Loader2,
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { cn } from '@/lib/utils';

// ── Country Codes ─────────────────────────────────────────────────────────────
const COUNTRY_CODES = [
  { code: '+65', name: 'SG (+65)', example: '9123 4567' },
  { code: '+1', name: 'US/CA (+1)', example: '555 0123' },
  { code: '+60', name: 'MY (+60)', example: '12 345 6789' },
  { code: '+44', name: 'UK (+44)', example: '7700 900077' },
  { code: '+61', name: 'AU (+61)', example: '412 345 678' },
  { code: '+91', name: 'IN (+91)', example: '98765 43210' },
  { code: '+81', name: 'JP (+81)', example: '90 1234 5678' },
  { code: '+86', name: 'CN (+86)', example: '138 1234 5678' },
];

// ── Project Types ─────────────────────────────────────────────────────────────
const PROJECT_TYPES = [
  {
    id: 'discovery',
    label: 'Discovery & Blueprint',
    desc: 'Architecture mapping, multi-model feasibility & technical roadmap',
    icon: FileSearch,
    baseWeeks: 1,
    minWeeks: 1,
    maxWeeks: 2,
    tier: '5 working days',
    badgeColor: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
    accentColor: 'border-sky-500/40 bg-sky-500/[0.06]',
  },
  {
    id: 'mvp',
    label: 'The 14-Day MVP',
    desc: 'Rapid production prototype ready for live stakeholder validation',
    icon: Rocket,
    baseWeeks: 2,
    minWeeks: 2,
    maxWeeks: 4,
    tier: '14 calendar days',
    badgeColor: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    accentColor: 'border-emerald-500/40 bg-emerald-500/[0.06]',
  },
  {
    id: 'scaleup',
    label: 'Platform Scale-Up',
    desc: 'Hardened multi-model gateways, data pipelines & team infra',
    icon: Layers,
    baseWeeks: 8,
    minWeeks: 6,
    maxWeeks: 12,
    tier: '6–12 weeks',
    badgeColor: 'border-violet-500/30 bg-violet-500/10 text-violet-300',
    accentColor: 'border-violet-500/40 bg-violet-500/[0.06]',
  },
  {
    id: 'full_works',
    label: 'Bespoke AI & Systems',
    desc: 'Multi-agent directorates, zero-egress RAG & domain SLMs',
    icon: Code2,
    baseWeeks: 16,
    minWeeks: 12,
    maxWeeks: 24,
    tier: '3–6 months',
    badgeColor: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    accentColor: 'border-amber-500/40 bg-amber-500/[0.06]',
  },
] as const;

type ProjectTypeId = typeof PROJECT_TYPES[number]['id'];

// ── Feature options ───────────────────────────────────────────────────────────
const CORE_FEATURES = [
  { id: 'ecommerce', label: 'E-Commerce & Billing', icon: ShoppingCart, weeksAdded: 3 },
  { id: 'database', label: 'Database & CMS', icon: Database, weeksAdded: 2 },
  { id: 'auth', label: 'User Auth & SSO', icon: Lock, weeksAdded: 2 },
  { id: 'dashboard', label: 'Admin Workspace', icon: LayoutDashboard, weeksAdded: 3 },
  { id: 'api', label: 'API Integrations', icon: Server, weeksAdded: 2 },
  { id: 'realtime', label: 'Real-Time Streaming', icon: Zap, weeksAdded: 3 },
] as const;

const ADVANCED_FEATURES = [
  { id: 'devops', label: 'Cloud Infrastructure (GCP/AWS)', icon: Cloud, weeksAdded: 3 },
  { id: 'zerotrust', label: 'Zero-Trust Architecture', icon: ShieldCheck, weeksAdded: 4 },
  { id: 'pentest', label: 'Security Hardening & Audit', icon: FileSearch, weeksAdded: 2 },
  { id: 'compliance', label: 'Compliance (SOC2 / ISO)', icon: ClipboardCheck, weeksAdded: 3 },
] as const;

const ALL_FEATURES = [...CORE_FEATURES, ...ADVANCED_FEATURES] as const;
type FeatureId = typeof ALL_FEATURES[number]['id'];

// ── Timeline validation logic ─────────────────────────────────────────────────
interface ValidationResult {
  status: 'ok' | 'tight' | 'unrealistic';
  requestedWeeks: number;
  minWeeks: number;
  recommendedWeeks: number;
  message: string;
  recommendation: string;
  suggestedDate: Date;
}

function calcMinWeeks(projectTypeId: ProjectTypeId | null, selectedFeatureIds: FeatureId[]): number {
  if (!projectTypeId) return 0;
  const projectType = PROJECT_TYPES.find((p) => p.id === projectTypeId)!;
  let weeks = projectType.baseWeeks;
  selectedFeatureIds.forEach((fid) => {
    const f = ALL_FEATURES.find((item) => item.id === fid);
    if (f) {
      weeks += projectTypeId === 'discovery' ? Math.max(0.5, f.weeksAdded * 0.25) : f.weeksAdded;
    }
  });
  return Math.ceil(weeks);
}

function validateTimeline(
  projectTypeId: ProjectTypeId | null,
  selectedFeatureIds: FeatureId[],
  launchDate: string
): ValidationResult | null {
  if (!projectTypeId || !launchDate) return null;

  const projectType = PROJECT_TYPES.find((p) => p.id === projectTypeId)!;
  const today = new Date();
  const launch = new Date(launchDate);
  const requestedWeeks = Math.max(0, Math.round((launch.getTime() - today.getTime()) / (7 * 86400000)));

  const minWeeks = calcMinWeeks(projectTypeId, selectedFeatureIds);
  const recommendedWeeks = Math.round(minWeeks * 1.25);
  const suggestedDate = new Date(today.getTime() + recommendedWeeks * 7 * 86400000);

  if (requestedWeeks >= minWeeks) {
    return {
      status: 'ok',
      requestedWeeks,
      minWeeks,
      recommendedWeeks,
      message: `Timeline aligns well with standard engineering milestones for ${projectType.label}.`,
      recommendation: '',
      suggestedDate,
    };
  }

  if (requestedWeeks >= Math.round(minWeeks * 0.75)) {
    return {
      status: 'tight',
      requestedWeeks,
      minWeeks,
      recommendedWeeks,
      message: `This timeline is tight. We may recommend phased sprint delivery.`,
      recommendation: `Recommended buffer: at least ${minWeeks} weeks given selected scope. Consider scoping an initial release milestone.`,
      suggestedDate,
    };
  }

  return {
    status: 'unrealistic',
    requestedWeeks,
    minWeeks,
    recommendedWeeks,
    message: `A ${requestedWeeks}-week timeline requires high compression for this feature set.`,
    recommendation: `Targeting ~${minWeeks}–${recommendedWeeks} weeks provides solid QA and validation time. Estimated target: ${suggestedDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.`,
    suggestedDate,
  };
}

const STEPS = ['Project Scope', 'Features & Timeline', 'Contact Details'];

export default function RequestAgentPage() {
  const searchParams = useSearchParams();
  const firestore = useFirestore();
  const { user } = useUser();
  const { members } = useRoster();

  const agentId = searchParams.get('agentId');
  const initialIdea = searchParams.get('idea') || '';
  const agentIds = agentId ? agentId.split(',') : [];
  const selectedAgents = members?.filter((m) => agentIds.includes(m.uid)) || [];

  const rawType = searchParams.get('type') || '';
  const initialType: ProjectTypeId | null = useMemo(() => {
    if (rawType === 'discovery') return 'discovery';
    if (rawType === 'mvp') return 'mvp';
    if (rawType === 'scaleup') return 'scaleup';
    if (rawType === 'full_works' || rawType === 'incubation') return 'full_works';
    if (rawType === 'simple') return 'mvp';
    if (rawType === 'dynamic') return 'scaleup';
    if (rawType === 'custom') return 'full_works';
    return null;
  }, [rawType]);

  const [step, setStep] = useState(0);

  // Step 0
  const [projectType, setProjectType] = useState<ProjectTypeId | null>(initialType);
  const [projectBrief, setProjectBrief] = useState(initialIdea);

  useEffect(() => {
    if (initialType) {
      setProjectType(initialType);
    }
  }, [initialType]);

  // Step 1
  const [features, setFeatures] = useState<FeatureId[]>([]);
  const [launchDate, setLaunchDate] = useState('');

  // Step 2
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [countryCode, setCountryCode] = useState('+65');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);

  // Submission
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const minDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  }, []);

  const validation = useMemo(
    () => validateTimeline(projectType, features, launchDate),
    [projectType, features, launchDate]
  );

  const toggleFeature = (id: FeatureId) => {
    setFeatures((prev) => (prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]));
  };

  const applySuggestedDate = () => {
    if (validation?.suggestedDate) {
      setLaunchDate(validation.suggestedDate.toISOString().split('T')[0]);
    }
  };

  const canAdvanceStep0 = projectType !== null && projectBrief.trim().length >= 10;
  const canAdvanceStep1 = launchDate !== '';
  const canSubmit = clientName.trim() && clientEmail.trim() && phone.trim() && consent;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firestore || !canSubmit) return;
    setLoading(true);
    setError('');

    try {
      const projTypeObj = PROJECT_TYPES.find((p) => p.id === projectType)!;
      await addDoc(collection(firestore, 'client_requests'), {
        agentId: agentId || 'unassigned',
        agentName: selectedAgents.map((a) => a.name).join(', ') || 'General Intake',
        clientName,
        clientEmail,
        linkedin: linkedin || null,
        hpNumber: `${countryCode} ${phone}`,
        request: projectBrief,
        projectType: projTypeObj?.label,
        features: features.join(', '),
        launchDate,
        timelineStatus: validation?.status ?? 'unknown',
        requestedWeeks: validation?.requestedWeeks ?? null,
        recommendedWeeks: validation?.recommendedWeeks ?? null,
        createdAt: serverTimestamp(),
        status: 'pending',
      });

      let notifyHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      try {
        if (user) {
          const idToken = await user.getIdToken();
          notifyHeaders['Authorization'] = `Bearer ${idToken}`;
        }
      } catch {
        /* proceed without token */
      }

      await fetch('/api/notify-admin', {
        method: 'POST',
        headers: notifyHeaders,
        body: JSON.stringify({
          subject: `New Project Proposal: ${projTypeObj?.label || 'Custom Software'}`,
          text: `A new project scope brief was submitted by ${clientName} (${clientEmail}).\n\nTrack: ${projTypeObj?.label}\nTimeline: ${launchDate} (${validation?.status})\nScope Overview:\n${projectBrief}\n\nPhone: ${countryCode} ${phone}`,
        }),
      });

      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Submission failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Success Screen ─────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-4 sm:p-6 bg-[#01040c] relative overflow-hidden">
        {/* Ambient Video Background Layer */}
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
          <video
            src="/proposal_bg.mp4"
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-full object-cover opacity-60 filter saturate-125"
          />
          <div className="absolute inset-0 bg-[#01040c]/50 backdrop-blur-[2px]" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#01040c] via-transparent to-[#01040c]/80" />
        </div>

        <div className="relative z-10 w-full max-w-lg">
          <div className="mb-6">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-[#020612]/80 px-4 py-2 text-xs font-medium text-zinc-300 hover:border-white/25 hover:text-white transition-all backdrop-blur-md"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Home</span>
            </Link>
          </div>

          <div className="relative overflow-hidden rounded-3xl border border-white/12 bg-[#020713]/90 backdrop-blur-2xl p-8 sm:p-10 text-center space-y-6 shadow-[0_24px_80px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.15)]">
            <ProceduralWaveContour opacity={0.35} />

            <div className="relative z-10 space-y-6">
              <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center bg-brand-500/10 border border-brand-500/30 text-brand-400 shadow-[0_0_24px_rgba(216,166,87,0.2)]">
                <Check className="w-8 h-8" />
              </div>

              <div className="space-y-2">
                <h2 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">
                  Proposal Scope Received
                </h2>
                <p className="text-sm font-mono text-brand-400">
                  Engineering review initiated &middot; 48h turnaround
                </p>
              </div>

              <p className="text-sm text-zinc-300 leading-relaxed max-w-md mx-auto">
                Thank you. Our technical leadership will review your requirements, verify feasibility, and schedule a scoping consultation.
              </p>

              <div className="pt-2">
                <ContourGlassButton effect="rim" asChild size="default" patternSeed={2} className="w-full sm:w-auto">
                  <Link href="/">
                    <span>Return to Main Site</span>
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Link>
                </ContourGlassButton>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col p-4 sm:p-6 bg-[#01040c] relative overflow-x-hidden">
      {/* Ambient Video Background Layer */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <video
          src="/proposal_bg.mp4"
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-full object-cover opacity-50 filter saturate-125"
        />
        <div className="absolute inset-0 bg-[#01040c]/55 backdrop-blur-[1px]" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#01040c] via-transparent to-[#01040c]/75" />
      </div>

      {/* Ambient glows */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-brand-500/10 blur-[150px] rounded-full" />
        <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] bg-violet-500/10 blur-[150px] rounded-full" />
      </div>

      <div className="relative z-10 w-full flex flex-col min-h-dvh">
        {/* Navigation Bar Strip */}
        <div className="max-w-5xl mx-auto w-full pt-4 pb-2 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-[#020612]/80 px-3.5 py-1.5 text-xs font-medium text-zinc-300 hover:border-white/25 hover:text-white transition-all backdrop-blur-md"
          >
            <ArrowLeft className="h-4 w-4 text-brand-400" />
            <span>Back to Home</span>
          </Link>

          <Link href="/" className="opacity-90 hover:opacity-100 transition-opacity">
            <Image
              src="/cybrdeck-logo/cybrdeck_logo_cropped_white.png"
              alt="Cybrdeck"
              width={886}
              height={197}
              priority
              className="h-5 w-auto"
            />
          </Link>
        </div>

        <main className="flex-1 w-full max-w-5xl mx-auto flex flex-col pt-6 pb-20">
          {/* Header Title */}
          <div className="text-center mb-8 space-y-2">
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white">
              Project Proposal Pipeline
            </h1>
            <p className="text-sm text-zinc-400 max-w-xl mx-auto leading-relaxed">
              Define your product specifications. All client projects receive 100% source code ownership and direct architectural scoping.
            </p>
          </div>

          {/* Master Form Card Shell */}
          <div className="relative overflow-hidden rounded-3xl border border-white/12 bg-[#020713]/90 backdrop-blur-2xl shadow-[0_24px_80px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.15)]">
            <ProceduralWaveContour opacity={0.35} />

            {/* 3-Step Navigation Tabs */}
            <div className="relative z-10 border-b border-white/10 px-6 py-4 bg-white/[0.02]">
              <div className="grid grid-cols-3 gap-2 sm:gap-4">
                {STEPS.map((label, i) => {
                  const isActive = i === step;
                  const isDone = i < step;

                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        if (isDone) setStep(i);
                      }}
                      disabled={!isDone && !isActive}
                      className={cn(
                        'flex items-center gap-2.5 p-2 rounded-xl text-left transition-all',
                        isActive
                          ? 'bg-white/[0.06] border border-brand-500/30 text-white'
                          : isDone
                          ? 'hover:bg-white/[0.03] text-zinc-300 cursor-pointer'
                          : 'opacity-40 cursor-not-allowed text-zinc-500'
                      )}
                    >
                      <div
                        className={cn(
                          'w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-semibold shrink-0 transition-colors',
                          isActive
                            ? 'bg-brand-500 text-black shadow-[0_0_12px_rgba(216,166,87,0.8)]'
                            : isDone
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-white/5 border border-white/10 text-zinc-500'
                        )}
                      >
                        {isDone ? <Check className="w-3.5 h-3.5" /> : i + 1}
                      </div>
                      <div className="min-w-0 hidden sm:block">
                        <p className={cn('text-xs font-medium truncate', isActive ? 'text-white' : 'text-zinc-400')}>
                          {label}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <form onSubmit={handleSubmit} className="relative z-10">
              <div className="p-6 sm:p-10 space-y-8">
                {/* Linked Specialists (if coming from team roster) */}
                {selectedAgents.length > 0 && (
                  <div className="p-4 rounded-2xl border border-white/10 bg-white/[0.02] space-y-3">
                    <p className="text-xs font-mono uppercase tracking-wider text-brand-300">
                      Linking with Specialized Engineers:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {selectedAgents.map((agent) => (
                        <div
                          key={agent.uid}
                          className="p-3 rounded-xl border border-white/10 bg-black/40 flex items-center gap-3"
                        >
                          <div className="w-9 h-9 rounded-full border border-white/15 overflow-hidden bg-zinc-800 shrink-0 flex items-center justify-center">
                            {agent.avatarUrl ? (
                              <img src={agent.avatarUrl} alt={agent.name} className="w-full h-full object-cover" />
                            ) : (
                              <UserIcon className="h-4 w-4 text-zinc-400" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-xs text-white truncate">{agent.name}</p>
                            <p className="text-[11px] font-mono text-zinc-400 truncate">{agent.role}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Error Banner */}
                {error && (
                  <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-xs text-red-300 font-mono">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
                    <span>{error}</span>
                  </div>
                )}

                {/* ── STEP 0: Project Scope ──────────────────────────────── */}
                {step === 0 && (
                  <div className="space-y-8">
                    {/* Project Type Track Selector */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-mono uppercase tracking-wider text-brand-300">
                          Select Project Track *
                        </label>
                        <span className="text-[11px] text-zinc-400">100% Client IP Handover</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        {PROJECT_TYPES.map((pt) => {
                          const active = projectType === pt.id;
                          const TrackIcon = pt.icon;

                          return (
                            <button
                              key={pt.id}
                              type="button"
                              onClick={() => setProjectType(pt.id)}
                              className={cn(
                                'p-4 rounded-2xl text-left border transition-all flex flex-col justify-between cursor-pointer active:scale-[0.98]',
                                active
                                  ? cn(pt.accentColor, 'border-brand-400/80 shadow-[0_0_20px_rgba(216,166,87,0.15)] ring-1 ring-brand-400/50')
                                  : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'
                              )}
                            >
                              <div>
                                <div className="flex items-center justify-between mb-3">
                                  <TrackIcon
                                    className={cn('w-5 h-5', active ? 'text-brand-300' : 'text-zinc-400')}
                                  />
                                  <span
                                    className={cn(
                                      'text-[10px] font-mono font-medium px-2 py-0.5 rounded border',
                                      pt.badgeColor
                                    )}
                                  >
                                    {pt.tier}
                                  </span>
                                </div>
                                <p className="text-sm font-semibold text-white tracking-tight">{pt.label}</p>
                                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{pt.desc}</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Project Scope Textarea */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-mono uppercase tracking-wider text-brand-300">
                          Project Brief &amp; Specifications *
                        </label>
                        <span className="text-[11px] font-mono text-zinc-500">
                          {projectBrief.length} / 10 min characters
                        </span>
                      </div>
                      <Textarea
                        placeholder="Detail your requirements, core workflows, third-party integrations, target audience, and any reference platforms..."
                        value={projectBrief}
                        onChange={(e) => setProjectBrief(e.target.value)}
                        className="min-h-[160px] bg-black/40 border border-white/10 text-sm leading-relaxed text-white placeholder:text-zinc-500 focus-visible:ring-brand-400/40 rounded-xl resize-none p-4"
                        required
                      />
                    </div>

                    <div className="pt-2">
                      <Button
                        type="button"
                        onClick={() => setStep(1)}
                        disabled={!canAdvanceStep0}
                        className={cn(
                          'w-full h-12 rounded-xl text-xs font-semibold tracking-wide gap-2 transition-all cursor-pointer',
                          canAdvanceStep0
                            ? 'bg-brand-500 hover:bg-brand-400 text-black shadow-[0_0_20px_rgba(216,166,87,0.3)]'
                            : 'bg-white/5 border border-white/10 text-zinc-500 cursor-not-allowed'
                        )}
                      >
                        <span>Continue to Features &amp; Timeline</span>
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* ── STEP 1: Features & Timeline ───────────────────────── */}
                {step === 1 && (() => {
                  const isAdvancedUnlocked = projectType === 'scaleup' || projectType === 'full_works';
                  const liveMinWeeks = calcMinWeeks(projectType, features);

                  return (
                    <div className="space-y-8">
                      {/* Core Modules Grid */}
                      <div className="space-y-3">
                        <div>
                          <label className="text-xs font-mono uppercase tracking-wider text-brand-300">
                            Core Capabilities
                          </label>
                          <p className="text-xs text-zinc-400 mt-0.5">Select modules required for your architecture</p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {CORE_FEATURES.map((f) => {
                            const active = features.includes(f.id as FeatureId);
                            const FeatIcon = f.icon;

                            return (
                              <button
                                key={f.id}
                                type="button"
                                onClick={() => toggleFeature(f.id as FeatureId)}
                                className={cn(
                                  'p-3.5 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between',
                                  active
                                    ? 'border-brand-500/60 bg-brand-500/10 text-white'
                                    : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04] text-zinc-300'
                                )}
                              >
                                <div className="flex items-center gap-3">
                                  <FeatIcon className={cn('w-4 h-4', active ? 'text-brand-400' : 'text-zinc-400')} />
                                  <div>
                                    <p className="text-xs font-medium text-white">{f.label}</p>
                                    <p className="text-[10px] font-mono text-zinc-500">+{f.weeksAdded}w estimate</p>
                                  </div>
                                </div>
                                <div
                                  className={cn(
                                    'w-4 h-4 rounded-md border flex items-center justify-center transition-colors',
                                    active ? 'bg-brand-500 border-brand-400 text-black' : 'border-white/20'
                                  )}
                                >
                                  {active && <Check className="w-3 h-3 stroke-[3]" />}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Advanced Engineering Tier */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <label className="text-xs font-mono uppercase tracking-wider text-brand-300">
                              Advanced Infrastructure &amp; Security
                            </label>
                            <p className="text-xs text-zinc-400 mt-0.5">
                              Available for Scale-Up and Bespoke AI tiers
                            </p>
                          </div>
                          {isAdvancedUnlocked && (
                            <span className="text-[10px] font-mono text-brand-300 bg-brand-500/10 px-2 py-0.5 rounded border border-brand-500/30">
                              Unlocked
                            </span>
                          )}
                        </div>

                        <div
                          className={cn(
                            'grid grid-cols-1 sm:grid-cols-2 gap-3 transition-opacity duration-200',
                            isAdvancedUnlocked ? 'opacity-100' : 'opacity-40 pointer-events-none'
                          )}
                        >
                          {ADVANCED_FEATURES.map((f) => {
                            const active = features.includes(f.id as FeatureId);
                            const FeatIcon = f.icon;

                            return (
                              <button
                                key={f.id}
                                type="button"
                                onClick={() => isAdvancedUnlocked && toggleFeature(f.id as FeatureId)}
                                className={cn(
                                  'p-3.5 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between',
                                  active
                                    ? 'border-brand-500/60 bg-brand-500/10 text-white'
                                    : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04] text-zinc-300'
                                )}
                              >
                                <div className="flex items-center gap-3">
                                  <FeatIcon className={cn('w-4 h-4', active ? 'text-brand-400' : 'text-zinc-400')} />
                                  <div>
                                    <p className="text-xs font-medium text-white">{f.label}</p>
                                    <p className="text-[10px] font-mono text-zinc-500">+{f.weeksAdded}w estimate</p>
                                  </div>
                                </div>
                                <div
                                  className={cn(
                                    'w-4 h-4 rounded-md border flex items-center justify-center transition-colors',
                                    active ? 'bg-brand-500 border-brand-400 text-black' : 'border-white/20'
                                  )}
                                >
                                  {active && <Check className="w-3 h-3 stroke-[3]" />}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Minimum Estimated Duration Banner */}
                      {projectType && (
                        <div className="p-4 rounded-2xl border border-white/10 bg-white/[0.02] flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <Clock className="w-4 h-4 text-brand-400 shrink-0" />
                            <p className="text-xs text-zinc-300">
                              Estimated baseline for{' '}
                              <strong className="text-white font-semibold">
                                {PROJECT_TYPES.find((p) => p.id === projectType)?.label}
                              </strong>
                              :
                            </p>
                          </div>
                          <span className="text-xs font-mono font-semibold text-brand-300 bg-brand-500/10 px-2.5 py-1 rounded-lg border border-brand-500/25 shrink-0">
                            ~{liveMinWeeks} {liveMinWeeks === 1 ? 'Week' : 'Weeks'} Minimum
                          </span>
                        </div>
                      )}

                      {/* Launch Date Selector */}
                      <div className="space-y-2">
                        <label className="text-xs font-mono uppercase tracking-wider text-brand-300">
                          Target Launch / Delivery Date *
                        </label>
                        <div className="relative">
                          <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                          <input
                            type="date"
                            value={launchDate}
                            min={minDate}
                            onChange={(e) => setLaunchDate(e.target.value)}
                            style={{ colorScheme: 'dark' }}
                            className="w-full pl-10 pr-4 h-12 rounded-xl bg-black/40 border border-white/10 text-sm font-mono text-white focus:outline-none focus:border-brand-400 transition-colors"
                            required
                          />
                        </div>
                      </div>

                      {/* Timeline Validation Feedback */}
                      {validation && (
                        <div
                          className={cn(
                            'p-4 rounded-2xl border space-y-3 transition-all',
                            validation.status === 'ok'
                              ? 'border-emerald-500/30 bg-emerald-500/10'
                              : validation.status === 'tight'
                              ? 'border-amber-500/30 bg-amber-500/10'
                              : 'border-red-500/30 bg-red-500/10'
                          )}
                        >
                          <div className="flex items-start gap-3">
                            {validation.status === 'ok' ? (
                              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                            ) : (
                              <AlertTriangle
                                className={cn(
                                  'w-5 h-5 shrink-0 mt-0.5',
                                  validation.status === 'tight' ? 'text-amber-400' : 'text-red-400'
                                )}
                              />
                            )}
                            <div className="flex-1 min-w-0">
                              <p
                                className={cn(
                                  'text-xs font-semibold',
                                  validation.status === 'ok'
                                    ? 'text-emerald-300'
                                    : validation.status === 'tight'
                                    ? 'text-amber-300'
                                    : 'text-red-300'
                                )}
                              >
                                {validation.status === 'ok'
                                  ? 'Timeline Approved & Feasible'
                                  : validation.status === 'tight'
                                  ? 'Tight Schedule Alert'
                                  : 'Scope Compression Required'}
                              </p>
                              <p className="text-xs text-zinc-300 mt-1 leading-relaxed">{validation.message}</p>
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/10">
                            {[
                              { label: 'Requested', val: `${validation.requestedWeeks}w` },
                              { label: 'Minimum', val: `${validation.minWeeks}w` },
                              { label: 'Optimal', val: `${validation.recommendedWeeks}w` },
                            ].map(({ label, val }) => (
                              <div key={label} className="text-center p-2 rounded-lg bg-black/30 border border-white/5">
                                <p className="text-[10px] font-mono text-zinc-400 uppercase">{label}</p>
                                <p className="text-sm font-bold text-white mt-0.5">{val}</p>
                              </div>
                            ))}
                          </div>

                          {validation.recommendation && (
                            <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-3">
                              <p className="text-xs text-zinc-400 leading-relaxed">{validation.recommendation}</p>
                              {validation.status !== 'ok' && (
                                <button
                                  type="button"
                                  onClick={applySuggestedDate}
                                  className="text-xs font-mono text-brand-300 underline underline-offset-2 hover:text-brand-200 transition-colors shrink-0"
                                >
                                  Apply optimal date &rarr;
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex gap-3 pt-2">
                        <Button
                          type="button"
                          onClick={() => setStep(0)}
                          variant="ghost"
                          className="flex-1 h-12 rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.06] text-zinc-300 text-xs font-medium"
                        >
                          Back
                        </Button>
                        <Button
                          type="button"
                          onClick={() => setStep(2)}
                          disabled={!canAdvanceStep1}
                          className={cn(
                            'flex-1 h-12 rounded-xl text-xs font-semibold tracking-wide gap-2 transition-all cursor-pointer',
                            canAdvanceStep1
                              ? 'bg-brand-500 hover:bg-brand-400 text-black shadow-[0_0_20px_rgba(216,166,87,0.3)]'
                              : 'bg-white/5 border border-white/10 text-zinc-500 cursor-not-allowed'
                          )}
                        >
                          <span>Continue to Contact</span>
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })()}

                {/* ── STEP 2: Contact Details ───────────────────────────── */}
                {step === 2 && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-xs font-mono uppercase tracking-wider text-brand-300">
                          Your Name / Entity *
                        </label>
                        <Input
                          type="text"
                          placeholder="e.g. Alex Tan / Acme AI Labs"
                          value={clientName}
                          onChange={(e) => setClientName(e.target.value)}
                          className="bg-black/40 border border-white/10 h-12 text-sm text-white placeholder:text-zinc-500 rounded-xl"
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-mono uppercase tracking-wider text-brand-300">
                          Business Email *
                        </label>
                        <Input
                          type="email"
                          placeholder="alex@example.com"
                          value={clientEmail}
                          onChange={(e) => setClientEmail(e.target.value)}
                          className="bg-black/40 border border-white/10 h-12 text-sm text-white placeholder:text-zinc-500 rounded-xl"
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-xs font-mono uppercase tracking-wider text-brand-300">
                          LinkedIn / Organization Profile <span className="text-zinc-500">(Optional)</span>
                        </label>
                        <Input
                          type="url"
                          placeholder="https://linkedin.com/in/..."
                          value={linkedin}
                          onChange={(e) => setLinkedin(e.target.value)}
                          className="bg-black/40 border border-white/10 h-12 text-sm text-white placeholder:text-zinc-500 rounded-xl"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-mono uppercase tracking-wider text-brand-300">
                          Direct Contact Number *
                        </label>
                        <div className="flex gap-2">
                          <select
                            value={countryCode}
                            onChange={(e) => setCountryCode(e.target.value)}
                            style={{ colorScheme: 'dark' }}
                            className="bg-black/40 border border-white/10 rounded-xl px-3 h-12 text-xs font-mono text-white focus:outline-none focus:border-brand-400 shrink-0"
                          >
                            {COUNTRY_CODES.map((cc) => (
                              <option key={cc.code} value={cc.code}>
                                {cc.name}
                              </option>
                            ))}
                          </select>
                          <Input
                            type="tel"
                            placeholder={`e.g. ${COUNTRY_CODES.find((c) => c.code === countryCode)?.example}`}
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            className="bg-black/40 border border-white/10 h-12 text-sm text-white placeholder:text-zinc-500 rounded-xl flex-1"
                            required
                          />
                        </div>
                      </div>
                    </div>

                    {/* Scope Overview Review Card (Clean 3-Column Layout) */}
                    <div className="p-4 rounded-2xl border border-white/10 bg-white/[0.02] space-y-3">
                      <p className="text-xs font-mono uppercase tracking-wider text-brand-300">
                        Scope Brief Summary
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                        <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                          <span className="text-[10px] font-mono text-zinc-400 block">Project Track</span>
                          <span className="font-semibold text-white truncate block mt-0.5">
                            {PROJECT_TYPES.find((p) => p.id === projectType)?.label ?? '—'}
                          </span>
                        </div>
                        <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                          <span className="text-[10px] font-mono text-zinc-400 block">Capabilities</span>
                          <span className="font-semibold text-white block mt-0.5">
                            {features.length > 0 ? `${features.length} modules selected` : 'Standard track scope'}
                          </span>
                        </div>
                        <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                          <span className="text-[10px] font-mono text-zinc-400 block">Target Delivery</span>
                          <span className="font-semibold text-brand-300 block mt-0.5">{launchDate || '—'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Privacy & NDA Consent */}
                    <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/5">
                      <input
                        type="checkbox"
                        id="consent"
                        checked={consent}
                        onChange={(e) => setConsent(e.target.checked)}
                        className="h-4 w-4 mt-0.5 accent-brand-400 cursor-pointer"
                        required
                      />
                      <label htmlFor="consent" className="text-xs text-zinc-300 leading-relaxed cursor-pointer select-none">
                        I confirm that the submitted project specifications are accurate, and I agree to the processing of this brief under the{' '}
                        <a href="/privacy" target="_blank" className="text-brand-400 underline hover:text-brand-300 transition-colors">
                          Privacy Policy
                        </a>
                        . 100% Client IP Ownership applies upon project engagement.
                      </label>
                    </div>

                    <div className="flex gap-3 pt-2">
                      <Button
                        type="button"
                        onClick={() => setStep(1)}
                        variant="ghost"
                        className="flex-1 h-12 rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.06] text-zinc-300 text-xs font-medium"
                      >
                        Back
                      </Button>
                      <Button
                        type="submit"
                        disabled={!canSubmit || loading}
                        className={cn(
                          'flex-1 h-12 rounded-xl text-xs font-semibold tracking-wide gap-2 transition-all cursor-pointer',
                          canSubmit && !loading
                            ? 'bg-brand-500 hover:bg-brand-400 text-black shadow-[0_0_20px_rgba(216,166,87,0.3)]'
                            : 'bg-white/5 border border-white/10 text-zinc-500 cursor-not-allowed'
                        )}
                      >
                        {loading ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Submitting Scope...</span>
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4" />
                            <span>Submit Project Scope</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}
