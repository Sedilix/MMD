import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Icon } from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { ArrowRight, Scale, Cpu, Coins, ChevronRight } from 'lucide-react';
import {
  getComparisonBySlug,
  comparisonStaticParams,
  getComparisons,
  type ComparisonModel,
} from '@/lib/seo/comparisons';

interface ComparePageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return comparisonStaticParams();
}

export async function generateMetadata({ params }: ComparePageProps): Promise<Metadata> {
  const { slug } = await params;
  const cmp = getComparisonBySlug(slug);
  if (!cmp) return { title: 'Model Comparison Not Found | cybrdeck' };

  return {
    title: cmp.title,
    description: cmp.description,
    alternates: { canonical: cmp.url },
    openGraph: {
      title: cmp.title,
      description: cmp.description,
      url: cmp.url,
      siteName: 'cybrdeck',
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title: cmp.title,
      description: cmp.description,
    },
  };
}

function SpecRow({ label, a, b }: { label: string; a: string; b: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-3 border-b border-white/5 last:border-0">
      <span className="text-sm text-zinc-200 font-body text-right">{a}</span>
      <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 px-3 whitespace-nowrap">
        {label}
      </span>
      <span className="text-sm text-zinc-200 font-body">{b}</span>
    </div>
  );
}

function ModelCard({ m }: { m: ComparisonModel }) {
  return (
    <div className="p-6 rounded-2xl bg-zinc-950/60 border border-white/10">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-400/30 text-brand-300 text-[11px] font-mono uppercase tracking-wider mb-3">
        <Cpu className="w-3.5 h-3.5" /> {m.brand}
      </div>
      <h3 className="text-xl font-headline font-bold text-white mb-2">{m.displayName}</h3>
      <p className="text-sm text-zinc-400 leading-relaxed font-body">{m.description}</p>
    </div>
  );
}

export default async function CompareModelPage({ params }: ComparePageProps) {
  const { slug } = await params;
  const cmp = getComparisonBySlug(slug);
  if (!cmp) notFound();

  const { a, b } = cmp;
  const others = getComparisons().filter((c) => c.slug !== cmp.slug).slice(0, 6);

  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: cmp.faqs.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://cybrdeck.com' },
      { '@type': 'ListItem', position: 2, name: 'Compare', item: 'https://cybrdeck.com/compare' },
      { '@type': 'ListItem', position: 3, name: `${a.displayName} vs ${b.displayName}`, item: cmp.url },
    ],
  };

  return (
    <div className="min-h-dvh bg-black text-white selection:bg-brand-500 selection:text-black">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />

      <header className="border-b border-white/10 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/compare" className="flex items-center gap-2 text-xs text-zinc-400 hover:text-white transition-colors">
            <Icon name="arrow-left-md" className="w-4 h-4" /> All comparisons
          </Link>
          <Link href="/playground">
            <Button size="sm" className="bg-brand-500 hover:bg-brand-400 text-black font-semibold">
              Open Playground
            </Button>
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-16">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-[11px] font-mono text-zinc-500 mb-8">
          <Link href="/" className="hover:text-zinc-300">Home</Link>
          <ChevronRight className="w-3 h-3" />
          <Link href="/compare" className="hover:text-zinc-300">Compare</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-zinc-300">{a.displayName} vs {b.displayName}</span>
        </nav>

        {/* Hero */}
        <div className="mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-zinc-300 text-[11px] font-mono uppercase tracking-wider mb-5">
            <Scale className="w-3.5 h-3.5 text-brand-300" /> {cmp.angleLabel}
          </div>
          <h1 className="text-3xl md:text-5xl font-headline font-bold uppercase tracking-tight text-white leading-tight">
            {a.displayName} <span className="text-brand-400">vs</span> {b.displayName}
          </h1>
          <p className="mt-5 text-zinc-400 text-base md:text-lg leading-relaxed font-body max-w-3xl">
            Both models are live in the Cybrdeck playground. Instead of trusting a single
            answer or a generic leaderboard, run the same prompt through {a.displayName} and{' '}
            {b.displayName} side by side and diff the results in the consensus studio — with
            real latency and credit cost shown per model.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/playground">
              <Button className="bg-brand-500 hover:bg-brand-400 text-black font-semibold">
                Run both side by side <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
            <Link href="/subscriptions">
              <Button variant="outline" className="border-white/20 text-white">See credit pricing</Button>
            </Link>
          </div>
        </div>

        {/* Model intro cards */}
        <div className="grid md:grid-cols-2 gap-5 mb-12">
          <ModelCard m={a} />
          <ModelCard m={b} />
        </div>

        {/* Spec table — every value read from the live registry, none invented */}
        <div className="p-6 md:p-8 rounded-2xl bg-zinc-950/60 border border-white/10 mb-12">
          <h2 className="text-lg font-headline font-bold uppercase text-white mb-5">
            Spec comparison
          </h2>
          <SpecRow label="Provider" a={a.brand} b={b.brand} />
          <SpecRow label="Context" a={`${a.contextLabel} tokens`} b={`${b.contextLabel} tokens`} />
          <SpecRow label="Tier" a={a.tier} b={b.tier} />
          <SpecRow label="Credits / 1k in" a={String(a.inputMultiplier)} b={String(b.inputMultiplier)} />
          <SpecRow label="Credits / 1k out" a={String(a.outputMultiplier)} b={String(b.outputMultiplier)} />
          <SpecRow label="Reasoning control" a={a.reasoning ? 'Yes' : 'No'} b={b.reasoning ? 'Yes' : 'No'} />
          <SpecRow label="Attachments" a={a.attachments.join(', ')} b={b.attachments.join(', ')} />
        </div>

        {/* Honest cost callout */}
        <div className="p-6 md:p-8 rounded-2xl bg-gradient-to-r from-zinc-900 to-black border border-white/15 mb-12">
          <h2 className="text-lg font-headline font-bold uppercase text-white flex items-center gap-2 mb-3">
            <Coins className="w-5 h-5 text-brand-300" /> Which costs less on Cybrdeck?
          </h2>
          <p className="text-zinc-300 text-sm leading-relaxed font-body">
            {a.displayName} burns {a.outputMultiplier} credits per 1,000 output tokens;{' '}
            {b.displayName} burns {b.outputMultiplier}. {cmp.costVerdict} Credit rates are
            Cybrdeck&apos;s published playground multipliers, so the numbers move with the
            catalogue rather than a snapshot.
          </p>
        </div>

        {/* FAQ */}
        <div className="mb-12">
          <h2 className="text-lg font-headline font-bold uppercase text-white mb-5">
            Frequently asked
          </h2>
          <div className="space-y-3">
            {cmp.faqs.map((f) => (
              <details key={f.question} className="group p-5 rounded-2xl bg-zinc-950/60 border border-white/10">
                <summary className="cursor-pointer list-none flex items-center justify-between gap-4 text-sm font-headline font-semibold text-white">
                  {f.question}
                  <span className="text-brand-400 group-open:rotate-45 transition-transform text-xl leading-none">+</span>
                </summary>
                <p className="mt-3 text-sm text-zinc-400 leading-relaxed font-body">{f.answer}</p>
              </details>
            ))}
          </div>
        </div>

        {/* Internal links — other comparisons */}
        {others.length > 0 && (
          <div>
            <h3 className="text-xs font-mono uppercase tracking-widest text-zinc-500 mb-4">
              More model comparisons
            </h3>
            <div className="flex flex-wrap gap-2">
              {others.map((o) => (
                <Link
                  key={o.slug}
                  href={o.path}
                  className="px-3 py-2 rounded-lg bg-zinc-900 border border-white/10 text-xs font-mono text-zinc-300 hover:border-brand-400/40 hover:text-white transition-colors"
                >
                  {o.a.displayName} vs {o.b.displayName}
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
