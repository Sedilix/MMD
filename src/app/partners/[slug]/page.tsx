import type { Metadata } from 'next';
import { Icon } from '@/components/ui/icon';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { getVisiblePartners, partnerLogoUrl } from '@/lib/partners';
import { Sparkles, Handshake } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PartnerPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export async function generateStaticParams() {
  const partners = getVisiblePartners();
  return partners.map((p) => ({
    slug: p.slug,
  }));
}

export async function generateMetadata({ params }: PartnerPageProps): Promise<Metadata> {
  const { slug } = await params;
  const partner = getVisiblePartners().find((p) => p.slug === slug);
  if (!partner) {
    return {
      title: 'Partner Not Found | cybrdeck',
    };
  }

  return {
    title: `${partner.name} - Ecosystem Integration | cybrdeck`,
    description: partner.description,
    openGraph: {
      title: `${partner.name} - Ecosystem Integration | cybrdeck`,
      description: partner.description,
      url: `https://cybrdeck.com/partners/${partner.slug}`,
      images: [
        {
          url: `https://cybrdeck.com/partners/${partner.logo}`,
          alt: `${partner.name} Logo`,
        },
      ],
    },
  };
}

export default async function ProgrammaticPartnerPage({ params }: PartnerPageProps) {
  const { slug } = await params;
  const partner = getVisiblePartners().find((p) => p.slug === slug);

  if (!partner) {
    notFound();
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: partner.name,
    description: partner.description,
    url: partner.website || `https://cybrdeck.com/partners/${partner.slug}`,
    logo: `https://cybrdeck.com/partners/${partner.logo}`,
    memberOf: {
      '@type': 'Organization',
      name: 'Cybrdeck Ecosystem',
      url: 'https://cybrdeck.com'
    }
  };

  return (
    <div className="min-h-dvh bg-black text-white selection:bg-brand-500 selection:text-black">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Header Navigation */}
      <header className="border-b border-white/10 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/partners" className="flex items-center gap-2 text-xs text-zinc-400 hover:text-white transition-colors">
            <Icon name="arrow-left-md" className="w-4 h-4" /> Back to Partners
          </Link>
          <Link href="/work-with-us">
            <Button size="sm" className="bg-brand-500 hover:bg-brand-400 text-black font-semibold">
              Partner With Us
            </Button>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-20">
        {/* Logo & Category Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 border-b border-white/10 pb-10 mb-10">
          <div className="flex items-center gap-6">
            <div className={`h-20 w-44 shrink-0 flex items-center justify-center border border-white/10 rounded-2xl ${partner.bgWhite ? 'bg-white p-4' : 'bg-zinc-900/60 p-4'}`}>
              <div className="relative w-full h-full flex items-center justify-center">
                <Image
                  src={partnerLogoUrl(partner)}
                  alt={partner.name}
                  fill
                  sizes="180px"
                  className="object-contain"
                />
              </div>
            </div>
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-400/30 text-brand-300 text-xs font-mono uppercase tracking-wider mb-2">
                <Handshake className="w-3.5 h-3.5" /> {partner.category}
              </div>
              <h1 className="text-3xl md:text-5xl font-headline font-bold uppercase tracking-tight text-white">
                {partner.name}
              </h1>
            </div>
          </div>

          {partner.website && (
            <a
              href={partner.website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-all"
            >
              Visit Website <Icon name="arrow-up-right-md" className="w-3.5 h-3.5" />
            </a>
          )}
        </div>

        {/* Integration Details */}
        <div className="space-y-8">
          <div className="p-8 rounded-2xl bg-zinc-950/60 border border-white/10 space-y-4">
            <h2 className="text-xl font-headline font-bold uppercase text-white flex items-center gap-2">
              <Icon name="shield-check" className="w-5 h-5 text-emerald-400" /> Integration Overview
            </h2>
            <p className="text-zinc-300 text-sm leading-relaxed font-body">
              {partner.description}
            </p>
          </div>

          {/* Tags */}
          {partner.tags && partner.tags.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-mono uppercase tracking-widest text-zinc-500">Integration Tags</h3>
              <div className="flex flex-wrap gap-2">
                {partner.tags.map((tag, idx) => (
                  <span key={idx} className="px-3 py-1 rounded-lg bg-zinc-900 border border-white/10 text-xs font-mono text-zinc-300">
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* CTAs */}
          <div className="p-8 rounded-2xl bg-gradient-to-r from-zinc-900 to-black border border-white/15 flex flex-col md:flex-row items-center justify-between gap-6 mt-12">
            <div>
              <h3 className="text-lg font-headline font-bold text-white uppercase">Build with {partner.name} & Cybrdeck</h3>
              <p className="text-xs text-zinc-400 mt-1">Explore custom AI integrations, multi-model workflows, and joint venture building.</p>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <Link href="/work-with-us">
                <Button variant="outline" className="border-white/20 text-white">
                  Hire Our Team
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
