'use client';

import React from 'react';
import { RedesignHeader } from '@/components/redesign/RedesignHeader';
import { RedesignHero } from '@/components/redesign/RedesignHero';
import { PartnerMarquee } from '@/components/PartnerMarquee';
import { SpecialistsSection } from '@/components/redesign/SpecialistsSection';
import { AboutSection } from '@/components/redesign/AboutSection';
import { InteractiveComparisonSection } from '@/components/redesign/InteractiveComparisonSection';
import { EventsSection } from '@/components/redesign/EventsSection';
import { WorkWithUsSection } from '@/components/redesign/WorkWithUsSection';
import { RedesignFooter } from '@/components/redesign/RedesignFooter';
import { FloatingChat } from '@/components/FloatingChat';
import { PredictiveArcCanvas } from '@/components/ui/PredictiveArcCanvas';

/**
 * The live landing page — the single-page experience that was previewed
 * at /redesign before going live on the main domain.
 *
 * Below the hero section and onwards, the background renders the ThreeUI-inspired
 * PredictiveArcCanvas (Signal Particles variant) with a sweeping radar arc wavefront
 * and glowing signal node beacons.
 */
export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#01040c] text-white selection:bg-brand-500 selection:text-black font-sans overflow-x-hidden relative">
      {/* Pinned Glass Header with Scrollspy Active Dot */}
      <RedesignHeader />

      {/* Main Single-Page Content Stream */}
      <main className="flex-1 w-full flex flex-col relative z-10">
        {/* 1. Interactive 3D Hero Section */}
        <RedesignHero />

        {/* 2. Stream Below Hero with Predictive Arc (Signal Particles) Background */}
        <div className="relative w-full flex flex-col z-10 overflow-hidden">
          {/* ThreeUI Reference: PredictiveArcCanvas — Signal Particles Variant */}
          <PredictiveArcCanvas
            variant="signal-particles"
            mode="dark"
            speed={1.0}
            spacing={16}
            dotRadius={1.5}
            opacity={0.9}
          />

          {/* 3. Partner marquee, then #about.
              The anchor sits on the consultancy section itself, not on this
              wrapper. When it was on the wrapper, clicking About scrolled to the
              top of the marquee band and left the actual About heading below the
              fold, so the nav landed a whole section short. The marquee is a
              trust strip between hero and About rather than a nav destination of
              its own. */}
          <div className="relative z-10 w-full">
            <div className="w-full border-y border-white/5 bg-[#01060e]/70 backdrop-blur-sm py-7">
              <PartnerMarquee />
            </div>
            <AboutSection id="about" />
          </div>

          {/* 4. #playground — Multi-Model Interactive Comparison & Playground Showcase */}
          <InteractiveComparisonSection id="playground" />

          {/* 5. #events — Community Gatherings & Monthly Shuffle */}
          <EventsSection id="events" />

          {/* 6. #work-with-us — Proposal Pipeline & Project Tracks */}
          <WorkWithUsSection id="work-with-us" />

          {/* 7. #specialists — Autonomous Agents & Human Leadership */}
          <SpecialistsSection id="specialists" />
        </div>
      </main>

      {/* Floating Chat Assistant */}
      <FloatingChat />

      {/* Unified Footer */}
      <RedesignFooter />
    </div>
  );
}
