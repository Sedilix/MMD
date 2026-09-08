import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { ArrowRight, Scale } from 'lucide-react';
import { getComparisons } from '@/lib/seo/comparisons';

const BASE_URL = 'https://cybrdeck.com';

export const metadata: Metadata = {
  title: 'LLM Model Comparisons — Run Any Two Side-by-Side | cybrdeck',
  description:
    'Compare leading AI models on real specs and Cybrdeck credit costs, then run any two side-by-side in the multi-model consensus playground.',
  alternates: { canonical: `${BASE_URL}/compare` },
  openGraph: {
    title: 'LLM Model Comparisons — Run Any Two Side-by-Side | cybrdeck',
    description:
      'Compare leading AI models on real specs and Cybrdeck credit costs, then run any two side-by-side in the multi-model consensus playground.',
    url: `${BASE_URL}/compare`,
    siteName: 'cybrdeck',
    type: 'website',
  },
};

export default function CompareIndexPage() {
  const comparisons = getComparisons();

  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Cybrdeck LLM Model Comparisons',
    url: `${BASE_URL}/compare`,
    description:
      'Programmatic side-by-side comparisons of AI models available in the Cybrdeck playground, with real specs and credit costs.',
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: comparisons.map((c, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: c.url,
        name: `${c.a.displayName} vs ${c.b.displayName}`,
      })),
    },
  };

  return (
    <div className="min-h-dvh bg-black text-white selection:bg-brand-500 selection:text-black">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }} />

      <header className="border-b border-white/10 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-xs text-zinc-400 hover:text-white transition-colors">
            <Icon name="arrow-left-md" className="w-4 h-4" /> Back to Cybrdeck
          </Link>
          <Link href="/playground">
            <Button size="sm" className="bg-brand-500 hover:bg-brand-400 text-black font-semibold">
              Open Playground
            </Button>
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-16">
        <div className="mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-400/30 text-brand-300 text-[11px] font-mono uppercase tracking-wider mb-5">
            <Scale className="w-3.5 h-3.5" /> Multi-model comparisons
          </div>
          <h1 className="text-3xl md:text-5xl font-headline font-bold uppercase tracking-tight text-white leading-tight max-w-3xl">
            Don&apos;t pick a model. Run them side by side.
          </h1>
          <p className="mt-5 text-zinc-400 text-base md:text-lg leading-relaxed font-body max-w-3xl">
            Every comparison below cites real specs from the Cybrdeck catalogue — context
            window, provider, and published credit cost. Then open the playground and run the
            same prompt through both models in the consensus studio to see where they agree
            and where they diverge.
          </p>
          <div className="mt-7">
            <Link href="/playground">
              <Button className="bg-brand-500 hover:bg-brand-400 text-black font-semibold">
                Start comparing free <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {comparisons.map((c) => (
            <Link
              key={c.slug}
              href={c.path}
              className="group p-6 rounded-2xl bg-zinc-950/60 border border-white/10 hover:border-brand-400/40 transition-colors"
            >
              <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-3">
                {c.angleLabel}
              </div>
              <h2 className="text-lg font-headline font-bold text-white leading-snug mb-2">
                {c.a.displayName} <span className="text-brand-400">vs</span> {c.b.displayName}
              </h2>
              <p className="text-xs text-zinc-500 font-mono mb-4">
                {c.a.brand} · {c.a.contextLabel} ctx &nbsp;|&nbsp; {c.b.brand} · {c.b.contextLabel} ctx
              </p>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-300 group-hover:text-brand-200">
                Compare specs <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
