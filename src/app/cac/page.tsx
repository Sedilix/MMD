import type { Metadata } from 'next';
import { Icon } from '@/components/ui/icon';
import Link from 'next/link';
import Image from 'next/image';
import { Sparkles, Network, Coins, HeartHandshake, Rocket, Flame } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Community-as-a-Company (CAC) Manifesto | cybrdeck Ecosystem',
  description: 'Learn how cybrdeck operates as a Community-as-a-Company (CAC) — aligning builders, technical co-founders, and ecosystem partners with shared venture upside.',
  openGraph: {
    title: 'Community-as-a-Company (CAC) Manifesto | cybrdeck Ecosystem',
    description: 'Learn how cybrdeck operates as a Community-as-a-Company (CAC) — aligning builders, technical co-founders, and ecosystem partners with shared venture upside.',
    url: 'https://cybrdeck.com/cac',
  },
};

const CAC_PILLARS = [
  {
    icon: <Icon name="users" className="w-6 h-6 text-brand-400" />,
    title: '1. Community Co-Building Engine',
    description: 'Instead of building in isolation, new products and AI tools are conceptualized, prototyped, and stress-tested directly within our builder collective.',
  },
  {
    icon: <Coins className="w-6 h-6 text-amber-400" />,
    title: '2. Shared Venture Upside',
    description: 'Contributors, beta testers, and technical advisors gain direct ecosystem rewards, early allocation, and co-ownership paths in incubated startups.',
  },
  {
    icon: <Network className="w-6 h-6 text-emerald-400" />,
    title: '3. Fluid Talent Network',
    description: 'Community members can transition dynamically from contributors to venture leads, co-founders, or core engineering team members within Cybrdeck Studio projects.',
  },
  {
    icon: <Rocket className="w-6 h-6 text-rose-400" />,
    title: '4. Instant Distribution & Validation',
    description: 'Ventures launched out of Cybrdeck enter the market with an active, highly engaged community of early adopters, validating demand on day one.',
  },
];

const COMMUNITY_ROLES = [
  {
    title: 'Technical Co-Founders',
    description: 'Lead new AI ventures incubated inside Cybrdeck Studio with co-founding equity, engineering resources, and multi-model infrastructure.',
    cta: 'Co-Found a Startup',
    href: '/proposal-form?type=incubation',
  },
  {
    title: 'SME & Enterprise Clients',
    description: 'Commission custom AI development, agentic workflows, and LLM integrations built by Cybrdeck’s core engineering team.',
    cta: 'Hire Cybrdeck Engineering',
    href: '/work-with-us',
  },
  {
    title: 'Builders & Contributors',
    description: 'Participate in hackathons, test multi-model consensus features in the Playground, and join our channels to earn ecosystem rewards.',
    cta: 'Join Builder Hub',
    href: '/community',
  },
];

export default function CACManifestoPage() {
  return (
    <div className="min-h-dvh bg-black text-white selection:bg-brand-500 selection:text-black">
      {/* Header */}
      <header className="border-b border-white/10 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/cybrdeck-logo/cybrdeck_logo_cropped_white.png" alt="Cybrdeck Logo" width={280} height={56} className="h-8 md:h-10 w-auto object-contain drop-shadow-[0_0_8px_rgba(0,0,0,0.3)]" priority />
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/community">
              <Button size="sm" className="bg-brand-500 hover:bg-brand-400 text-black font-semibold">
                Join Community <Icon name="arrow-right-md" className="w-3.5 h-3.5 ml-1" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-24 px-6 max-w-7xl mx-auto text-center relative">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-brand-500/10 border border-brand-400/30 text-brand-300 text-xs font-semibold mb-6">
          <Sparkles className="w-3.5 h-3.5" /> The CAC Manifesto
        </div>
        <h1 className="text-4xl md:text-6xl font-headline font-bold uppercase tracking-tight text-white mb-6 max-w-4xl mx-auto leading-tight">
          Community-as-a-Company <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-400 via-amber-300 to-rose-400">The Future of Venture Creation</span>
        </h1>
        <p className="text-zinc-400 text-base md:text-lg max-w-3xl mx-auto font-body leading-relaxed mb-10">
          Traditional companies build in secret and pay to acquire customers. Cybrdeck operates as a **Community-as-a-Company (CAC)** — where our builder community is our co-founding engine, talent pool, and distribution network.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/community">
            <Button size="lg" className="bg-brand-500 hover:bg-brand-400 text-black font-bold px-8">
              Join the Builder Collective <Icon name="arrow-right-md" className="w-4 h-4 ml-2" />
            </Button>
          </Link>
          <Link href="/work-with-us">
            <Button size="lg" variant="outline" className="border-white/20 hover:bg-white/10 text-white">
              Work With Our Engineering Team
            </Button>
          </Link>
        </div>
      </section>

      {/* The CAC Flywheel Diagram */}
      <section className="py-16 px-6 max-w-7xl mx-auto border-t border-white/10">
        <div className="p-10 rounded-3xl bg-zinc-950/80 border border-white/10 text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-brand-500/10 rounded-full blur-3xl -z-10" />
          <h2 className="text-2xl md:text-3xl font-headline font-bold uppercase tracking-wide text-white mb-6">
            The CAC Venture Flywheel
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 text-left">
            <div className="p-6 rounded-xl bg-white/5 border border-white/10">
              <span className="text-brand-400 font-mono text-xs font-bold uppercase">Step 01</span>
              <h3 className="font-bold text-white text-base mt-2">Community & Trust</h3>
              <p className="text-zinc-400 text-xs mt-1">Engage developers, creators, and partners in an open AI workspace.</p>
            </div>
            <div className="p-6 rounded-xl bg-white/5 border border-white/10">
              <span className="text-amber-400 font-mono text-xs font-bold uppercase">Step 02</span>
              <h3 className="font-bold text-white text-base mt-2">Co-Ideation</h3>
              <p className="text-zinc-400 text-xs mt-1">Stress-test prompts and validate AI product ideas in real-time.</p>
            </div>
            <div className="p-6 rounded-xl bg-white/5 border border-white/10">
              <span className="text-emerald-400 font-mono text-xs font-bold uppercase">Step 03</span>
              <h3 className="font-bold text-white text-base mt-2">Studio Incubation</h3>
              <p className="text-zinc-400 text-xs mt-1">Cybrdeck Studio provisions code, infrastructure, and capital to spin out startups.</p>
            </div>
            <div className="p-6 rounded-xl bg-white/5 border border-white/10">
              <span className="text-rose-400 font-mono text-xs font-bold uppercase">Step 04</span>
              <h3 className="font-bold text-white text-base mt-2">Shared Upside</h3>
              <p className="text-zinc-400 text-xs mt-1">Ecosystem rewards and equity flow back to the community that built it.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Pillars */}
      <section className="py-20 px-6 max-w-7xl mx-auto border-t border-white/10">
        <div className="text-center mb-16">
          <h2 className="text-2xl md:text-4xl font-headline font-bold uppercase tracking-wide text-white">
            Pillars of Community-as-a-Company
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {CAC_PILLARS.map((pillar, i) => (
            <div key={i} className="p-8 rounded-2xl bg-zinc-950/60 border border-white/10 hover:border-white/20 transition-all">
              <div className="mb-4">{pillar.icon}</div>
              <h3 className="text-xl font-headline font-bold text-white mb-2">{pillar.title}</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">{pillar.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pathways */}
      <section className="py-20 px-6 max-w-7xl mx-auto border-t border-white/10">
        <div className="text-center mb-16">
          <h2 className="text-2xl md:text-4xl font-headline font-bold uppercase tracking-wide text-white">
            Find Your Role in the Ecosystem
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {COMMUNITY_ROLES.map((role, i) => (
            <div key={i} className="p-8 rounded-2xl bg-zinc-900/40 border border-white/10 flex flex-col justify-between hover:border-brand-500/40 transition-all">
              <div>
                <h3 className="text-lg font-headline font-bold text-white mb-3">{role.title}</h3>
                <p className="text-zinc-400 text-xs leading-relaxed mb-6">{role.description}</p>
              </div>
              <Link href={role.href}>
                <Button className="w-full bg-white/10 hover:bg-brand-500 hover:text-black text-white font-semibold transition-all">
                  {role.cta} <Icon name="arrow-right-md" className="w-3.5 h-3.5 ml-1" />
                </Button>
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-12 px-6 text-center text-xs text-zinc-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© {new Date().getFullYear()} Cybrdeck. All rights reserved. Built in Singapore.</p>
          <div className="flex items-center gap-6">
            <Link href="/" className="hover:text-zinc-300">Home</Link>
            <Link href="/work-with-us" className="hover:text-zinc-300">Work With Us</Link>
            <Link href="/community" className="hover:text-zinc-300">Community</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
