import React from 'react'
import Link from 'next/link'

export default function TermsPage() {
  return (
    <div className="min-h-dvh py-16 px-4 md:px-8 bg-background flex justify-center">
      <main className="max-w-3xl w-full space-y-8 font-mono text-xs text-white leading-relaxed">
        <header className="border-b border-white/20 pb-6">
          <Link href="/" className="hover:underline text-[10px] uppercase tracking-wider text-muted-foreground block mb-4">
            &lt; Return to home
          </Link>
          <h1 className="text-xl font-bold uppercase tracking-widest">Terms of Service</h1>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Last Updated: June 2026</p>
        </header>

        <section className="space-y-4">
          <h2 className="font-bold text-sm uppercase tracking-wide border-l-2 border-white pl-2">1. Acceptance of Terms</h2>
          <p>
            By accessing Cybrdeck services, interacting with our conversational agent hubs, or submitting applications, you agree to comply with these Terms of Service. If you do not accept these conditions, you must terminate your network handshake and log off.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="font-bold text-sm uppercase tracking-wide border-l-2 border-white pl-2">2. Usage License & Sandbox Rules</h2>
          <p>
            We grant users a temporary, non-exclusive license to run queries and manage organizational coordinates through our dashboard interface. Any attempt to bypass security gates, reverse-engineer RAG routing endpoints, or overload serverless functions via automation is strictly prohibited and will result in IP blacklist rules.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="font-bold text-sm uppercase tracking-wide border-l-2 border-white pl-2">3. Disclaimers</h2>
          <p>
            All AI suggestions, agent matching recommendations, and telemetry readouts are provided "as-is" without warranty of correctness. We do not guarantee perfect proxy availability or infinite serverless uptime during coordinate migrations.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="font-bold text-sm uppercase tracking-wide border-l-2 border-white pl-2">4. Governing Law</h2>
          <p>
            These terms are governed and interpreted in accordance with standard international data sovereignty guidelines, subject to coordinates verified during system authorization.
          </p>
        </section>

        <footer className="border-t border-white/10 pt-6 text-[10px] text-muted-foreground flex justify-between uppercase tracking-wider">
          <span>Cybrdeck Secure Network</span>
          <span>SYSTEM: OK</span>
        </footer>
      </main>
    </div>
  )
}
