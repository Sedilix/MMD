'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ShieldCheck, Lock, FileText, ArrowUpRight } from 'lucide-react';

export function RedesignFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="w-full bg-[#01040c] border-t border-white/[0.08] relative z-20 overflow-hidden text-zinc-400">
      {/* Top subtle rim light highlight */}
      <div 
        aria-hidden="true" 
        className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-px bg-gradient-to-r from-transparent via-brand-500/30 to-transparent" 
      />

      {/* Ambient background glow (subtle, non-distracting) */}
      <div 
        aria-hidden="true" 
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[240px] bg-brand-500/[0.02] rounded-full blur-3xl" 
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-10 lg:gap-8">
          
          {/* Column 1: Brand & Infrastructure Grounding (Col span 4) */}
          <div className="lg:col-span-4 space-y-5">
            <div className="flex items-center gap-3">
              <div className="relative w-9 h-9 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-center p-1.5 shadow-sm">
                <Image
                  src="/cybrdeck-logo/cybrdeck_icon.png"
                  alt="Cybrdeck Logo"
                  width={24}
                  height={24}
                  className="object-contain"
                />
              </div>
              <div className="flex flex-col">
                <span className="text-base font-semibold text-white tracking-tight">Cybrdeck</span>
                <span className="text-xs font-medium text-brand-400">
                  Community, As a Company
                </span>
              </div>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed max-w-sm">
              An AI workspace built for builders, engineers, and founders — and the collaborative ecosystem that scales alongside them.
            </p>

            {/* Live Gateway Telemetry */}
            <div className="pt-1">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.02] border border-white/[0.08] text-xs text-zinc-300">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-[11px] font-medium text-zinc-300">Singapore Gateway Active</span>
                <span className="text-[11px] text-zinc-500">•</span>
                <span className="text-[11px] text-zinc-500 font-mono">AP-Southeast-1</span>
              </div>
            </div>

            <div className="text-xs text-zinc-500 pt-2">
              <p>Accelerating production-ready AI software delivery across Asia-Pacific and globally.</p>
            </div>
          </div>

          {/* Column 2: Platform (Col span 2) */}
          <div className="lg:col-span-2 space-y-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-200">Platform</h4>
            <ul className="space-y-3 text-xs">
              <li>
                <Link href="#work-with-us" className="text-zinc-400 hover:text-white transition-colors duration-150 inline-block py-0.5">
                  Work with Us
                </Link>
              </li>
              <li>
                <Link href="/agents" className="text-zinc-400 hover:text-white transition-colors duration-150 inline-block py-0.5">
                  Specialist Roster
                </Link>
              </li>
              <li>
                <Link href="/playground" className="text-zinc-400 hover:text-white transition-colors duration-150 inline-block py-0.5">
                  AI Workbench
                </Link>
              </li>
              <li>
                <Link href="#events" className="text-zinc-400 hover:text-white transition-colors duration-150 inline-block py-0.5">
                  Builder Events
                </Link>
              </li>
              <li>
                <Link href="/subscriptions" className="text-zinc-400 hover:text-white transition-colors duration-150 inline-block py-0.5">
                  Pricing &amp; Plans
                </Link>
              </li>
              <li>
                <Link href="/dashboard" className="text-zinc-400 hover:text-white transition-colors duration-150 inline-block py-0.5">
                  Client Dashboard
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3: Company & Ecosystem (Col span 2) */}
          <div className="lg:col-span-2 space-y-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-200">Company</h4>
            <ul className="space-y-3 text-xs">
              <li>
                <Link href="/cac" className="text-zinc-400 hover:text-white transition-colors duration-150 inline-block py-0.5">
                  About Us
                </Link>
              </li>
              <li>
                <Link href="/partners" className="text-zinc-400 hover:text-white transition-colors duration-150 inline-block py-0.5">
                  Partner Ecosystem
                </Link>
              </li>
              <li>
                <Link href="/community" className="text-zinc-400 hover:text-white transition-colors duration-150 inline-block py-0.5">
                  Community Hub
                </Link>
              </li>
              <li>
                <Link href="/apply-here" className="text-zinc-400 hover:text-white transition-colors duration-150 inline-block py-0.5">
                  Join Specialist Roster
                </Link>
              </li>
              <li>
                <Link href="/contact" className="text-zinc-400 hover:text-white transition-colors duration-150 inline-block py-0.5">
                  Contact Enterprise
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 4: Data, Security & Compliance (Col span 4) */}
          <div className="lg:col-span-4 space-y-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-200">Trust &amp; Security</h4>
            
            <div className="space-y-3">
              {/* Trust Module 1: Zero Model Training */}
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.08] hover:border-white/[0.14] transition-colors space-y-1">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-brand-400 shrink-0" />
                  <span className="text-xs font-medium text-zinc-200">Zero Model Training</span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Prompts, code, and outputs remain strictly private and are never used to train third-party foundation models.
                </p>
              </div>

              {/* Trust Module 2: Standards-Aligned Controls */}
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.08] hover:border-white/[0.14] transition-colors space-y-1">
                <div className="flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5 text-brand-400 shrink-0" />
                  <span className="text-xs font-medium text-zinc-200">Standards-Aligned Architecture</span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Security practices aligned with ISO/IEC 27001 standards and PDPA / GDPR data sovereignty guidelines. TLS 1.3 encryption in transit and AES-256 at rest.
                </p>
              </div>

              {/* Trust Module 3: Metered Transparency */}
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.08] hover:border-white/[0.14] transition-colors space-y-1">
                <div className="flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-brand-400 shrink-0" />
                  <span className="text-xs font-medium text-zinc-200">Metered Transparency</span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Deterministic token accounting with real-time credit consumption visible directly within your Deck console.
                </p>
              </div>
            </div>

            {/* Direct Policy & Terms Actions */}
            <div className="pt-1 flex items-center gap-4 text-xs">
              <Link 
                href="/privacy" 
                className="inline-flex items-center gap-1 text-brand-400 hover:text-brand-300 transition-colors font-medium text-xs"
              >
                <span>Privacy Policy</span>
                <ArrowUpRight className="w-3 h-3" />
              </Link>
              <span className="text-zinc-600">•</span>
              <Link 
                href="/terms" 
                className="inline-flex items-center gap-1 text-brand-400 hover:text-brand-300 transition-colors font-medium text-xs"
              >
                <span>Terms of Service</span>
                <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>
          </div>

        </div>

        {/* Bottom Legal Bar */}
        <div className="pt-8 mt-12 border-t border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500">
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-center sm:text-left">
            <span>&copy; {currentYear} Cybrdeck. All rights reserved.</span>
            <span className="hidden sm:inline text-zinc-700">|</span>
            <span>Security architecture aligned with ISO/IEC 27001 &amp; PDPA guidelines</span>
          </div>

          <div className="flex items-center gap-5 text-[11px]">
            <Link href="/privacy" className="hover:text-zinc-300 transition-colors">
              Privacy Policy
            </Link>
            <span className="text-zinc-700">•</span>
            <Link href="/terms" className="hover:text-zinc-300 transition-colors">
              Terms of Service
            </Link>
            <span className="text-zinc-700">•</span>
            <Link href="/contact" className="hover:text-zinc-300 transition-colors">
              Security &amp; Inquiries
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

