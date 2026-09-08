"use client"

import React, { useState } from 'react';
import { Icon } from '@/components/ui/icon';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { ContourGlassButton } from '@/components/ui/ContourGlassButton';
import { CrystalLightField } from '@/components/ui/CrystalLightField';
import { LanguageSelector } from '@/components/language-selector';
import HeaderUserMenu from '@/components/HeaderUserMenu';

import { useUser, useAuth, useFirestore } from '@/firebase';
import { signOut } from 'firebase/auth';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { partnerLogoUrl } from '@/lib/partners';
import type { Partner } from '@/lib/partners';
import { usePartners } from '@/hooks/use-partners';
import { Handshake, Cpu, Zap, Activity, Network } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface PartnerType {
  name: string;
  category: string;
  description: string;
  logoUrl?: string;
  icon?: React.ReactNode;
  bgWhite?: boolean;
  logoClassName?: string;
}

import { useEffect } from 'react';

/**
 * Single partner showcase card. The `activePartners` list is already
 * disk-checked server-side (see usePartners -> /api/partners ->
 * loadPartners), so a deleted logo never reaches here in normal
 * operation. As defense-in-depth against a deploy/cache race, the `<Image>`
 * `onError` swaps the broken logo for a clean text placeholder so the card
 * still renders with its name + description rather than a 404 tile.
 */
function PartnerCard({ partner }: { partner: Partner }) {
  const [logoBroken, setLogoBroken] = useState(false);
  return (
    <div className="cd-crystal rounded-2xl p-8 flex flex-col justify-between min-h-[220px] transform-gpu will-change-transform [backface-visibility:hidden] antialiased">
      <div className="space-y-5">
        <div className="flex flex-row items-center justify-between border-b border-white/5 pb-5 min-h-[72px]">
          <div className={`h-12 w-40 shrink-0 flex items-center justify-center ${partner.bgWhite ? 'bg-white rounded p-2.5' : ''}`}>
            {logoBroken ? (
              <span className="text-xs font-headline font-bold uppercase tracking-widest text-zinc-300 truncate px-2">
                {partner.name}
              </span>
            ) : (
              <div className="relative w-full h-full flex items-center justify-center">
                <Image
                  src={partnerLogoUrl(partner)}
                  alt={partner.name}
                  fill
                  sizes="160px"
                  className={`object-contain ${partner.bgWhite ? 'object-center' : 'object-left'}`}
                  onError={() => setLogoBroken(true)}
                />
              </div>
            )}
          </div>
          <span className="text-[9px] font-mono text-zinc-400 uppercase tracking-wider text-right w-24 shrink-0 leading-snug ml-4">{partner.category}</span>
        </div>
        <h4 className="font-headline font-bold text-sm uppercase tracking-widest text-white">{partner.name}</h4>
        <p className="text-xs text-white font-body leading-relaxed">
          {partner.description}
        </p>
      </div>

      <div className="pt-4 flex items-center justify-between text-[10px] font-mono">
        <span className="text-emerald-600 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
          INTEGRATED
        </span>
        <span className="text-zinc-500">v1.0.4</span>
      </div>
    </div>
  );
}

export default function PartnersPage() {
  const { user } = useUser();
  const auth = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [mounted, setMounted] = useState(false);
  const { partners } = usePartners();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Contact Form state
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    organization: '',
    website: '',
    category: 'White-Label Partner',
    proposal: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogout = async () => {
    if (auth) await signOut(auth);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.organization) {
      toast({
        title: "Validation Error",
        description: "Please fill out all required fields (*).",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);
    try {
      if (firestore) {
        await addDoc(collection(firestore, 'partnership_proposals'), {
          ...formData,
          createdAt: serverTimestamp(),
          status: 'pending',
          userId: user?.uid || null
        });

        // Notify admin
        let notifyHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
        try {
          if (user) {
            const idToken = await user.getIdToken();
            notifyHeaders['Authorization'] = `Bearer ${idToken}`;
          }
        } catch { /* non-critical */ }
        await fetch('/api/notify-admin', {
          method: 'POST',
          headers: notifyHeaders,
          body: JSON.stringify({
            subject: `New Partnership Proposal: ${formData.organization}`,
            text: `A new partnership proposal was received from ${formData.name} (${formData.email}) at ${formData.organization}.\n\nCategory: ${formData.category}\nWebsite: ${formData.website}\n\nProposal:\n${formData.proposal}`
          })
        });
      }

      toast({
        title: "Alliance Application Received",
        description: "Our operations desk will review your proposal and sync back shortly.",
        variant: "default"
      });
      setFormData({
        name: '',
        email: '',
        organization: '',
        website: '',
        category: 'White-Label Partner',
        proposal: ''
      });
    } catch (error: any) {
      toast({
        title: "Submission Error",
        description: error.message || "Failed to submit proposal. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const coreInfrastructure: PartnerType[] = [
    {
      name: "DATA SOVEREIGNTY",
      category: "PRIVACY PROTOCOL",
      description: "Absolute data boundaries. We respect client and internal privacy through rigorous digital hygiene protocols and strict NDA enforcement. Your data remains yours.",
      icon: <Icon name="lock" className="h-6 w-6 text-primary" />
    },
    {
      name: "DECENTRALIZED SYNERGY",
      category: "GLOBAL NETWORK",
      description: "Asynchronous, borderless collaboration. Connecting collective intelligence across continents—and into the frontier—ensuring teamwork has no geographic limits.",
      icon: <Icon name="globe" className="h-6 w-6 text-primary" />
    },
    {
      name: "COMMUNITY ARCHITECTURE",
      category: "ECOSYSTEM DESIGN",
      description: "Impact through connection. We actively engineer ecosystems that serve, uplift, and catalyze bright ideas through targeted events, outreach, and strategic matchmaking.",
      icon: <Icon name="users" className="h-6 w-6 text-primary" />
    },
    {
      name: "TOTAL IP RETENTION",
      category: "OWNERSHIP RIGHTS",
      description: "Complete ownership, zero compromise. You retain 100% of your IP. We pledge long-term alignment, navigating the high-stakes highs and lows of development right by your side.",
      icon: <Icon name="shield" className="h-6 w-6 text-primary" />
    }
  ];

  // Visible partners: have a logo file and are not awaiting approval. Awaiting
  // partners (e.g. card-only compact variants) stay in
  // src/data/partners.json for our records but don't render until their
  // awaitingApproval flag is cleared in the JSON.
  const activePartners = partners.filter((p) => !p.unregistered && !p.awaitingApproval);
  const tickerPartners = activePartners;

  return (
    <div className="min-h-dvh flex flex-col bg-[#01040c] relative overflow-hidden text-zinc-100">
      {/* Delegated light source for .cd-crystal glass blocks */}
      <CrystalLightField />
      {/* Background Neural Grid Accent */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none -z-10 opacity-20 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:32px_32px]" />

      {/* Background Glows */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/10 blur-[120px] rounded-full pointer-events-none -z-10" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-[500px] h-[500px] bg-primary/10 blur-[120px] rounded-full pointer-events-none -z-10" />

      {/* Header */}
      <header className="h-20 border-b border-white/5 flex items-center justify-between px-6 bg-zinc-950/40 backdrop-blur-md z-30 sticky top-0">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4 select-none">
            <Link href="/" className="flex items-center">
              <Image
                src="/cybrdeck-logo/cybrdeck_logo_cropped_white.png"
                alt="Cybrdeck Logo"
                width={400}
                height={80}
                className="h-8 md:h-10 w-auto object-contain drop-shadow-[0_0_8px_rgba(0,0,0,0.3)]"
                priority
              />
            </Link>
          </div>

          <nav className="hidden md:flex items-center gap-5">
            <div className="flex items-center gap-5">
              <Link href="/partners" className="whitespace-nowrap text-xs font-headline uppercase tracking-widest text-primary font-bold">
                Partners
              </Link>
              <Link href="/agents" className="whitespace-nowrap text-xs font-headline uppercase tracking-widest text-zinc-400 hover:text-white transition-colors font-bold">
                List Agents
              </Link>
              <Link href="/events" className="whitespace-nowrap text-xs font-headline uppercase tracking-widest text-zinc-400 hover:text-white transition-colors font-bold">
                Events
              </Link>
            </div>

            <span className="h-4 w-px bg-white/10" aria-hidden />

            <div className="flex items-center gap-4">
              <Link
                href="/community"
                className="whitespace-nowrap text-xs font-headline uppercase tracking-widest text-[#00ffcc]/85 hover:text-[#00ffcc] hover:drop-shadow-[0_0_6px_rgba(0,255,204,0.3)] transition-all font-bold flex items-center gap-1.5"
              >
                <Icon name="users" className="w-3.5 h-3.5 text-[#00ffcc]" />
                <span>Community Hub</span>
              </Link>

              {/* Phase 5: Playground link — visible only to authenticated users. */}
              {user && (
                <Link
                  href="/playground/app"
                  className="whitespace-nowrap text-xs font-headline uppercase tracking-widest text-amber-400/85 hover:text-amber-300 hover:drop-shadow-[0_0_6px_rgba(251,191,36,0.3)] transition-all font-bold flex items-center gap-1.5"
                >
                  <Image
                    src="/cybrdeck-logo/playground.png"
                    alt=""
                    width={18}
                    height={18}
                    className="w-[18px] h-[18px] object-contain"
                    aria-hidden
                  />
                  <span>Playground</span>
                </Link>
              )}

            </div>
          </nav>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <LanguageSelector />
          {!user ? (
            <>
              <Link href="/apply-here" className="hidden lg:block">
                <Button variant="ghost" className="hover:bg-white/10 !text-zinc-400 hover:!text-white text-[10px] sm:text-xs px-2.5 sm:px-4 font-headline uppercase tracking-widest bg-transparent">APPLY HERE</Button>
              </Link>
              <Link href="/login" className="hidden lg:block">
                <Button variant="outline" className="border-white hover:bg-white/10 text-white bg-black text-[10px] sm:text-xs font-headline uppercase tracking-widest px-2.5 sm:px-4">{'PORTAL ACCESS'}</Button>
              </Link>
              <div className="lg:hidden">
                <HeaderUserMenu />
              </div>
            </>
          ) : (
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-2 text-[10px] font-mono text-zinc-400 uppercase tracking-widest">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                {user.email}
              </div>
              <HeaderUserMenu />
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center p-4 md:p-6 relative z-10 pb-24 max-w-6xl mx-auto w-full">
        <div className="w-full flex justify-start mb-4">
          <Link href="/">
            <span className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 text-zinc-400 hover:text-white text-xs font-medium transition-colors backdrop-blur-md">
              <Icon name="arrow-left-md" className="h-4 w-4" /> Back Home
            </span>
          </Link>
        </div>

        {/* Hero Section */}
        <section className="w-full relative min-h-[500px] flex flex-col items-center justify-center overflow-hidden bg-transparent px-6 py-16 mb-20 text-center animate-in fade-in slide-in-from-top-4 duration-700">
          {/* Hero backdrop — the Spline scene is gone; the still frame
              it rendered carries the look without the WebGL runtime. */}
          <div className="absolute inset-0 -z-10 pointer-events-none flex items-center justify-center overflow-hidden">
            <div className="w-[1920px] h-[1080px] shrink-0 origin-center scale-[0.4] sm:scale-[0.55] md:scale-[0.7] lg:scale-[0.85] xl:scale-[0.95] 2xl:scale-100 relative">
              <Image
                src="/spline-assets/partners-fallback.png"
                alt=""
                fill
                sizes="100vw"
                className="object-cover"
              />
            </div>
          </div>

          <div className="relative z-10 pointer-events-none flex flex-col items-center justify-center space-y-6">
            <p className="text-xs font-mono uppercase tracking-widest text-brand-400 flex items-center gap-1.5 pointer-events-auto">
              <Handshake className="h-3.5 w-3.5" />
              <span>Partner Alliance</span>
            </p>
            <h1 className="text-3xl md:text-5xl font-semibold tracking-tight max-w-3xl leading-[1.1] !text-white drop-shadow-md">
              Forge Strategic Alliances. <span className="text-brand-300">Scale Together.</span>
            </h1>
            <p className="max-w-xl mx-auto text-sm text-zinc-300 font-body leading-relaxed opacity-90 drop-shadow">
              Let’s grow together. Collaborate with Cybrdeck to boost brand visibility, share professional audiences, and integrate specialized technology without heavy overhead.
            </p>

            <div className="pt-4 flex justify-center gap-4 pointer-events-auto">
              <a href="#apply">
                <ContourGlassButton effect="rim" asChild size="lg">
                  <span>Become a Partner</span>
                  <Icon name="arrow-up-right-md" className="h-4 w-4" />
                </ContourGlassButton>
              </a>
              <a href="#partners">
                <ContourGlassButton effect="rim" asChild size="lg" variant="ghost">
                  <span>Explore Integrations</span>
                </ContourGlassButton>
              </a>
            </div>

            {/* Global Node Indicator */}
            <div className="pt-8 flex flex-col items-center justify-center gap-2">
              <p className="text-[10px] font-mono text-zinc-400 uppercase tracking-[0.2em]">OPERATOR ALLIANCE CHANNELS ENABLED IN 190+ SOVEREIGN ZONES</p>
              <div className="flex gap-2 items-center justify-center opacity-70">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-mono text-emerald-400 uppercase font-bold">Compliant Zero-Egress Matrix Workspace Agreements Active</span>
              </div>
            </div>
          </div>
        </section>

        {/* Horizontal Infinite Logo Ticker */}
        <section className="w-full py-8 border-y border-white/5 bg-zinc-900/20 backdrop-blur-sm relative overflow-hidden mb-20 select-none">
          <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-black to-transparent z-10 pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-black to-transparent z-10 pointer-events-none" />

          <div className="w-full overflow-hidden">
            <div className="animate-ticker flex gap-10 md:gap-20 items-center">
              {tickerPartners.map((partner) => (
                <div key={`ticker-1-${partner.id}`} className="flex items-center gap-2 shrink-0">
                  <span className="w-2 h-2 bg-primary rounded-full" />
                  <span className="text-xs font-headline font-bold uppercase tracking-wider text-zinc-100">{partner.name}</span>
                  <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-white/5 border border-white/5 text-zinc-400 uppercase">{partner.category}</span>
                </div>
              ))}
              {/* Duplicate list for seamless infinite loop */}
              {tickerPartners.map((partner) => (
                <div key={`ticker-2-${partner.id}`} className="flex items-center gap-2 shrink-0">
                  <span className="w-2 h-2 bg-primary rounded-full" />
                  <span className="text-xs font-headline font-bold uppercase tracking-wider text-zinc-100">{partner.name}</span>
                  <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-white/5 border border-white/5 text-zinc-400 uppercase">{partner.category}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Bento features grid */}
        <section className="w-full space-y-8 mb-24">
          <div className="space-y-1">
            <h3 className="text-2xl font-headline font-bold uppercase tracking-tighter italic text-zinc-100">How we collaborate & grow</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 cd-crystal rounded-2xl p-8 flex flex-col justify-between min-h-[220px]">
              <div className="space-y-3">
                <div className="w-10 h-10 rounded bg-primary/10 border border-primary/20 flex items-center justify-between p-2">
                  <Icon name="users" className="h-6 w-6 text-primary" />
                </div>
                <h4 className="text-lg font-headline font-bold uppercase tracking-tighter italic text-white">Shared Audience Exposure</h4>
                <p className="text-xs text-white font-body leading-relaxed max-w-lg">
                  Place your business directly in front of Cybrdeck's network of specialized developers, operational engineers, and high-performance product teams. We cross-promote capabilities inside our registry and customer nodes.
                </p>
              </div>
              <div className="text-[10px] font-mono text-primary tracking-widest uppercase mt-4">[ CO-MARKETING PIPELINE ENGAGED ]</div>
            </div>

            <div className="cd-crystal rounded-2xl p-8 flex flex-col justify-between min-h-[220px]">
              <div className="space-y-3">
                <div className="w-10 h-10 rounded bg-primary/10 border border-primary/20 flex items-center justify-between p-2">
                  <Cpu className="h-6 w-6 text-primary" />
                </div>
                <h4 className="text-lg font-headline font-bold uppercase tracking-tighter italic text-white">Co-Agent Deployments</h4>
                <p className="text-xs text-white font-body leading-relaxed">
                  Collaborate on joint AI models, custom pipelines, and automation protocols. Build integrated plugins that sync your core platform capabilities directly to Cybrdeck task decks.
                </p>
              </div>
              <div className="text-[10px] font-mono text-primary tracking-widest uppercase mt-4">[ INTEROPERABLE API ]</div>
            </div>

            <div className="cd-crystal rounded-2xl p-8 flex flex-col justify-between min-h-[220px]">
              <div className="space-y-3">
                <div className="w-10 h-10 rounded bg-primary/10 border border-primary/20 flex items-center justify-between p-2">
                  <Zap className="h-6 w-6 text-primary" />
                </div>
                <h4 className="text-lg font-headline font-bold uppercase tracking-tighter italic text-white">Custom Deals & Perks</h4>
                <p className="text-xs text-white font-body leading-relaxed">
                  Boost conversion rates and user loyalty by offering special rates, early access codes, or custom API credits to our collective's communities.
                </p>
              </div>
              <div className="text-[10px] font-mono text-primary tracking-widest uppercase mt-4">[ MEMBERSHIP ADVANTAGES ]</div>
            </div>

            <div className="md:col-span-2 cd-crystal rounded-2xl p-8 flex flex-col justify-between min-h-[220px]">
              <div className="space-y-3">
                <div className="w-10 h-10 rounded bg-primary/10 border border-primary/20 flex items-center justify-between p-2">
                  <Icon name="lock" className="h-6 w-6 text-primary" />
                </div>
                <h4 className="text-lg font-headline font-bold uppercase tracking-tighter italic text-white">Direct Security & Routing Desk</h4>
                <p className="text-xs text-white font-body leading-relaxed max-w-lg">
                  Every alliance partner is matched with a dedicated technical contact to map API specifications, build secure firewalls, audit zero-egress workspaces, and manage operational pathways.
                </p>
              </div>
              <div className="text-[10px] font-mono text-primary tracking-widest uppercase mt-4">[ SECURE CHANNELS ACTIVE ]</div>
            </div>
          </div>
        </section>

        {/* Partners Showcase Section */}
        <section id="partners" className="w-full space-y-8 mb-24">
          <div className="space-y-1">
            <h3 className="text-2xl font-headline font-bold uppercase tracking-tighter italic text-zinc-100">Active strategic partnerships</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {activePartners.map((partner) => {
              return (
                <PartnerCard key={partner.id} partner={partner} />
              );
            })}
          </div>
        </section>

        {/* Core Infrastructure Section */}
        <section id="core" className="w-full space-y-8 mb-24">
          <div className="space-y-1">
            <h3 className="text-2xl font-headline font-bold uppercase tracking-tighter italic text-zinc-100">Core infrastructure & beliefs</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {coreInfrastructure.map((item, index) => (
              <div key={index} className="cd-crystal rounded-2xl p-8 flex flex-col justify-between min-h-[220px] transform-gpu will-change-transform [backface-visibility:hidden] antialiased">
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-white/5 pb-3">
                    <div className={`relative flex items-center ${item.logoClassName || 'h-10 w-28'} ${item.bgWhite ? 'bg-white rounded p-1' : ''}`}>
                      {item.logoUrl ? (
                        <div className="relative w-full h-full">
                          <Image
                            src={item.logoUrl}
                            alt={item.name}
                            fill
                            sizes="(max-width: 768px) 100vw, 112px"
                            className={item.bgWhite ? "object-contain" : "object-contain object-left"}
                          />
                        </div>
                      ) : (
                        item.icon
                      )}
                    </div>
                    <span className="text-[9px] font-mono text-zinc-400 uppercase tracking-wider">{item.category}</span>
                  </div>
                  <h4 className="font-headline font-bold text-sm uppercase tracking-widest text-white">{item.name}</h4>
                  <p className="text-xs text-white font-body leading-relaxed">
                    {item.description}
                  </p>
                </div>

                <div className="pt-4 flex items-center justify-between text-[10px] font-mono">
                  <span className="text-emerald-600 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                    INTEGRATED
                  </span>
                  <span className="text-zinc-500">v1.0.4</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Application Form */}
        <section id="apply" className="w-full max-w-2xl mx-auto cd-crystal rounded-3xl p-8 space-y-6 mb-24">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold text-white tracking-tight">Become a Cybrdeck Partner</h2>
            <p className="text-sm text-slate-400 max-w-lg mx-auto">
              Tell us a bit about your business. We&apos;ll review your application personally to explore how we can build a mutually profitable strategy.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 font-body">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300 tracking-wider uppercase block">Partner Contact Name *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"><Icon name="users" className="h-3.5 w-3.5" /></span>
                  <input
                    type="text"
                    name="name"
                    required
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="Enter your name"
                    className="w-full h-10 pl-9 pr-4 rounded bg-slate-950 border border-slate-700 hover:border-slate-500 focus:border-blue-600 focus:outline-none text-sm text-slate-100 placeholder-slate-400 transition-colors duration-200"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300 tracking-wider uppercase block">Email Address *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"><Icon name="mail" className="h-3.5 w-3.5" /></span>
                  <input
                    type="email"
                    name="email"
                    required
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="partner@domain.com"
                    className="w-full h-10 pl-9 pr-4 rounded bg-slate-950 border border-slate-700 hover:border-slate-500 focus:border-blue-600 focus:outline-none text-sm text-slate-100 placeholder-slate-400 transition-colors duration-200"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300 tracking-wider uppercase block">Organization Name *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"><Icon name="building" className="h-3.5 w-3.5" /></span>
                  <input
                    type="text"
                    name="organization"
                    required
                    value={formData.organization}
                    onChange={handleInputChange}
                    placeholder="e.g. Acme SaaS"
                    className="w-full h-10 pl-9 pr-4 rounded bg-slate-950 border border-slate-700 hover:border-slate-500 focus:border-blue-600 focus:outline-none text-sm text-slate-100 placeholder-slate-400 transition-colors duration-200"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300 tracking-wider uppercase block">Platform Website URL</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"><Icon name="globe" className="h-3.5 w-3.5" /></span>
                  <input
                    type="url"
                    name="website"
                    value={formData.website}
                    onChange={handleInputChange}
                    placeholder="https://domain.com"
                    className="w-full h-10 pl-9 pr-4 rounded bg-slate-950 border border-slate-700 hover:border-slate-500 focus:border-blue-600 focus:outline-none text-sm text-slate-100 placeholder-slate-400 transition-colors duration-200"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300 tracking-wider uppercase block">How would you like to collaborate?</label>
              <select
                name="category"
                value={formData.category}
                onChange={handleInputChange}
                className="w-full h-10 px-3 rounded bg-slate-950 border border-slate-700 hover:border-slate-500 focus:border-blue-600 focus:outline-none text-base md:text-sm text-slate-100 transition-colors duration-200 [&>option]:bg-slate-950 [&>option]:text-slate-100"
              >
                <option value="White-Label Partner">White-Label Partner (Distribute Cybrdeck under your brand)</option>
                <option value="Ecosystem Service Provider">Ecosystem Service Provider (Receive client referrals from Cybrdeck)</option>
                <option value="Other / Strategic Alliance">Other / Strategic Alliance</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300 tracking-wider uppercase block">Your Vision & Business Model</label>
              <div className="relative">
                <textarea
                  name="proposal"
                  rows={4}
                  value={formData.proposal}
                  onChange={handleInputChange}
                  placeholder="How do you currently serve your clients, and how do you typically generate revenue? Let&apos;s map out how we can win together..."
                  className="w-full p-3 rounded bg-slate-950 border border-slate-700 hover:border-slate-500 focus:border-blue-600 focus:outline-none text-sm text-slate-100 placeholder-slate-400 transition-colors duration-200 resize-none"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 pb-2">
              <input
                type="checkbox"
                id="partners-consent"
                required
                className="h-3.5 w-3.5 accent-blue-600 rounded border-slate-700 bg-slate-950 cursor-pointer shrink-0"
              />
              <label htmlFor="partners-consent" className="text-xs text-slate-400 leading-tight cursor-pointer select-none text-left">
                I agree to the partnership parameters and consent to data storage under the <a href="/privacy" target="_blank" className="underline hover:text-slate-300 transition-colors">Privacy Policy</a>.
              </label>
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-lg h-11 flex items-center justify-center gap-2 cursor-pointer transition-colors duration-200 border-none shadow-md"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Processing Request...
                  </>
                ) : (
                  <>
                    Request a Strategy Session <Icon name="square-check" className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </form>
        </section>

        {/* FAQ Section */}
        <section className="w-full space-y-6 mb-24">
          <div className="space-y-2">
            <h3 className="text-2xl font-headline font-bold uppercase tracking-tighter italic text-zinc-100">Frequently asked questions</h3>
            <p className="text-xs text-zinc-400 leading-relaxed max-w-2xl">
              Explore answers regarding parameters, system dependencies, API sync integrations, and revenue models.
            </p>
          </div>

          <div className="w-full">
            <Accordion type="single" collapsible className="w-full space-y-4">
              <AccordionItem value="item-1" className="border border-white/10 rounded-2xl px-5 bg-white/[0.03] backdrop-blur-xl">
                <AccordionTrigger className="font-headline font-bold text-sm uppercase tracking-wider text-left hover:no-underline text-white">
                  Who is the Cybrdeck partner program for?
                </AccordionTrigger>
                <AccordionContent className="text-xs text-zinc-400 leading-relaxed font-body space-y-3">
                  <p>
                    It’s for growth-minded businesses, enterprise platforms, and specialized service providers looking to expand their market reach through strategic ecosystem alignment. We partner with:
                  </p>
                  <ul className="list-disc pl-5 space-y-2 mt-2">
                    <li>
                      <strong className="text-white">Market Expanders (White-Labeling):</strong> Large platforms and enterprises that want to package Cybrdeck’s secure architecture under their own brand. This allows you to instantly down-market and capture budget-conscious client segments you couldn't previously serve.
                    </li>
                    <li>
                      <strong className="text-white">Ecosystem Service Providers (Referral Partners):</strong> Specialized providers catering to developers, freelancers, and creators. By joining our network, you become our go-to referral partner for services Cybrdeck doesn't offer natively—gaining a steady stream of vetted clients while helping Cybrdeck deliver a true &quot;one-stop shop&quot; experience.
                    </li>
                  </ul>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-2" className="border border-white/10 rounded-2xl px-5 bg-white/[0.03] backdrop-blur-xl">
                <AccordionTrigger className="font-headline font-bold text-sm uppercase tracking-wider text-left hover:no-underline text-white">
                  What does the partner onboarding process look like?
                </AccordionTrigger>
                <AccordionContent className="text-xs text-zinc-400 leading-relaxed font-body space-y-3">
                  <p>
                    We treat our partnerships as true strategic alliances, which means our onboarding process is collaborative, human, and focused on mutual growth:
                  </p>
                  <ol className="list-decimal pl-5 space-y-2 mt-2">
                    <li>
                      <strong className="text-white">Apply Online:</strong> It starts with a simple application form where you share your business model and vision for working together.
                    </li>
                    <li>
                      <strong className="text-white">Synergy Review:</strong> Our team personally reviews your application to evaluate how we can best integrate our strengths and map out the strategic synergy between Cybrdeck and your brand.
                    </li>
                    <li>
                      <strong className="text-white">The Strategy Session:</strong> If there&apos;s a strong alignment, we will schedule an in-person or virtual meeting. Together, we&apos;ll dive into the partnership terms, finalize the logistics, and design a concrete strategy to maximize revenue for both parties.
                    </li>
                  </ol>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-3" className="border border-white/10 rounded-2xl px-5 bg-white/[0.03] backdrop-blur-xl">
                <AccordionTrigger className="font-headline font-bold text-sm uppercase tracking-wider text-left hover:no-underline text-white">
                  How do we structure the financial terms?
                </AccordionTrigger>
                <AccordionContent className="text-xs text-zinc-400 leading-relaxed font-body space-y-3">
                  <p>
                    We don&apos;t make assumptions about your business, and we don&apos;t believe in forcing our partners into a rigid, one-size-fits-all model. Every alliance is treated as a unique collaboration:
                  </p>
                  <ul className="list-disc pl-5 space-y-2 mt-2">
                    <li>
                      <strong className="text-white">We Listen First:</strong> During our strategy session, our first goal is to understand how your business currently operates, how you typically generate revenue, and what success looks like for you.
                    </li>
                    <li>
                      <strong className="text-white">We Co-Create the Strategy:</strong> Once we understand your ecosystem, we work together to design a customized commercial structure—whether that involves custom margins for white-labeling, mutual referral incentives, or network discounts.
                    </li>
                    <li>
                      <strong className="text-white">Mutual Profitability:</strong> Ultimately, the terms are built entirely around a shared strategy that protects your interests and maximizes value for both parties.
                    </li>
                  </ul>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-4" className="border border-white/10 rounded-2xl px-5 bg-white/[0.03] backdrop-blur-xl">
                <AccordionTrigger className="font-headline font-bold text-sm uppercase tracking-wider text-left hover:no-underline text-white">
                  How does Cybrdeck protect my clients&apos; data?
                </AccordionTrigger>
                <AccordionContent className="text-xs text-zinc-400 leading-relaxed font-body space-y-3">
                  <p>
                    Security is at the core of everything we build. Whether you are white-labeling our platform or trusting us with client referrals, we ensure enterprise-grade protection:
                  </p>
                  <ul className="list-disc pl-5 space-y-2 mt-2">
                    <li>
                      <strong className="text-white">Absolute Privacy:</strong> All workflows and processes run inside strict, isolated network boundaries to guarantee your clients&apos; data remains completely confidential.
                    </li>
                    <li>
                      <strong className="text-white">Dedicated Security:</strong> Sensitive credentials and database keys are never stored on shared infrastructure, eliminating the risk of cross-contamination.
                    </li>
                    <li>
                      <strong className="text-white">Brand Protection:</strong> We maintain a rigorous compliance baseline so you can confidently attach your own brand or reputation to Cybrdeck, knowing your network is safe.
                    </li>
                  </ul>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </section>

      </main>

      {/* Footer */}
      <footer className="p-6 md:p-12 text-center border-t border-white/5 bg-transparent backdrop-blur-sm relative z-20 space-y-4">
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[9px] font-mono text-zinc-400 uppercase tracking-widest">
          <Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
          <span className="opacity-30">•</span>
          <Link href="/terms" className="hover:text-white transition-colors">Terms of Service</Link>
          <span className="opacity-30">•</span>
          {/* <!-- legal-flag --> Confirm legal sign-off before production: GDPR / SOC 2 / ISO 27001 / WCAG 2.1 AA */}
          <span>GDPR Compliant</span>
          <span className="opacity-30">•</span>
          <span>SOC 2 Type II Prep</span>
          <span className="opacity-30">•</span>
          <span>ISO 27001 Staged</span>
          <span className="opacity-30">•</span>
          <span>WCAG 2.1 AA</span>
        </div>
        <p className="text-[10px] font-mono tracking-[0.2em] text-zinc-400/60 uppercase">
          © 2026 CYBRDECK - EVE COUNT QUANTUM SYSTEMS. ALL RIGHTS RESERVED.
        </p>
      </footer>
    </div>
  );
}
