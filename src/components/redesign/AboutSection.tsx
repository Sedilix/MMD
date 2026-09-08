'use client';

import React from 'react';
import Link from 'next/link';
import {
  ArrowRight,
} from 'lucide-react';
import { ContourGlassButton } from '@/components/ui/ContourGlassButton';

interface ConsultancyPillar {
  title: string;
  description: string;
}

const CONSULTANCY_PILLARS: ConsultancyPillar[] = [
  {
    title: 'Full-Stack Product Engineering',
    description:
      'Frontend, backend, UI/UX design, cloud infrastructure, and multi-model AI integrations for individuals, SMEs, MNCs, and enterprises with zero scope limitations.',
  },
  {
    title: '100% Client IP Ownership',
    description:
      'You retain all intellectual property, trademarks, and source code. We build the software on your behalf so you can launch and scale it as your own product.',
  },
  {
    title: 'In-Depth Sit-Down Scoping',
    description:
      'We conduct detailed face-to-face or video consultations to map your technical requirements, analyze user pain points, and optimize existing systems.',
  },
  {
    title: 'Incorporation & Patent Law Packages',
    description:
      'Optional business incorporation with ACRA, annual IRAS tax filing, and patent legal advisory to protect your assets before publishing to market.',
  },
];

export function AboutSection({ id = 'about' }: { id?: string }) {
  return (
    <section
      id={id}
      className="relative z-20 w-full border-t border-white/5 bg-transparent px-4 py-24 sm:px-6 lg:px-8 scroll-mt-20"
    >
      <div className="mx-auto max-w-7xl space-y-16">
        {/* Section Header */}
        <div className="max-w-3xl space-y-6">
          <div className="space-y-4">
            <h2 className="text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.08] tracking-[-0.03em] text-white">
              Software consultancy built for real execution and full client ownership.
            </h2>
            <p className="text-base sm:text-lg leading-relaxed text-zinc-400">
              Cybrdeck is an IT and software engineering consultancy based in Singapore. We partner with individuals, SMEs, and enterprises to design, build, and deploy custom digital products. You keep all the IP — we engineer the software.
            </p>
          </div>

          <ContourGlassButton effect="rim" asChild size="default" className="self-start">
            <Link href="/proposal-form">
              <span>Submit Project Scope</span>
              <ArrowRight className="w-3.5 h-3.5 text-zinc-400" />
            </Link>
          </ContourGlassButton>
        </div>

        {/* 4 Core Consultancy Pillars */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {CONSULTANCY_PILLARS.map((p) => (
            <div
              key={p.title}
              className="rounded-2xl cd-crystal p-6 space-y-4"
            >
              <h3 className="text-base font-semibold text-white tracking-tight">
                {p.title}
              </h3>
              <p className="text-xs leading-relaxed text-zinc-400">
                {p.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
