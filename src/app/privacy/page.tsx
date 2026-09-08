import React from 'react'
import Link from 'next/link'

export default function PrivacyPage() {
  return (
    <div className="min-h-dvh py-16 px-4 md:px-8 bg-background flex justify-center">
      <main className="max-w-3xl w-full space-y-8 font-mono text-xs text-white leading-relaxed">
        <header className="border-b border-white/20 pb-6">
          <Link href="/" className="hover:underline text-[10px] uppercase tracking-wider text-muted-foreground block mb-4">
            &lt; Return to home
          </Link>
          <h1 className="text-xl font-bold uppercase tracking-widest">Privacy Policy</h1>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Last Updated: June 2026</p>
        </header>

        <section className="space-y-4">
          <h2 className="font-bold text-sm uppercase tracking-wide border-l-2 border-white pl-2">1. Information We Collect</h2>
          <p>
            Cybrdeck collects telemetry and text interactions during secure chat and agent matchmaking processes. This information includes transcribed chat inputs, selected settings (such as voice configuration and target language selection), and system logs. 
          </p>
          <p>
            If you apply to join Cybrdeck as a specialist or client, we collect your contact information, credentials, and company profiles necessary to establish secure proxy tunnels and coordinate agent routing.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="font-bold text-sm uppercase tracking-wide border-l-2 border-white pl-2">2. How We Use Information</h2>
          <p>
            Collected telemetry is logged securely to our Firestore database and utilized to:
          </p>
          <ul className="list-disc list-inside pl-4 space-y-2">
            <li>Train and fine-tune agent matching models to predict client requirements.</li>
            <li>Maintain low-latency serverless routing pipelines.</li>
            <li>Verify identity credentials and enforce security guards across admin endpoints.</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="font-bold text-sm uppercase tracking-wide border-l-2 border-white pl-2">3. Storage & Telemetry Choices</h2>
          <p>
            You may choose to decline cookie and local storage persistence by selecting "Decline" on our consent dialog. Note that doing so may disable speech settings caching or session state logging, requiring manual configuration on subsequent visits.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="font-bold text-sm uppercase tracking-wide border-l-2 border-white pl-2">4. Your Rights under GDPR, CCPA & Singapore's PDPA</h2>
          <p>
            Depending on your jurisdiction, you have the right to request deletion of your chat records, request access to logged application tokens, or withdraw form submissions. Contact our data officer via the terminal connection dashboard to submit requests.
          </p>
          <p>
            Under Singapore's Personal Data Protection Act (PDPA), you additionally have the right to withdraw consent to any collection or use of your personal data at any time, and to be informed of the likely consequences of doing so. Where a feature below processes your data on the basis of consent, that consent is separate from — and does not extend beyond — this general policy.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="font-bold text-sm uppercase tracking-wide border-l-2 border-white pl-2">5. One, Our Telegram Assistant</h2>
          <p>
            One (@cybrdeckbot) is Cybrdeck&apos;s internal Telegram assistant. Every message sent to it is processed to generate a reply, and is briefly screened for abuse before that happens.
          </p>
          <p>
            One may also build a private profile of how you communicate — tone, recurring topics, and context worth remembering — from your direct messages with it, so future conversations feel more natural. This is optional and consent-based: the first time you DM One, it asks before doing this, and proceeds only if you say yes. You can withdraw at any time and erase what has been stored by sending <code>/forgetme</code> to One directly.
          </p>
          <p>
            Messages sent in Cybrdeck&apos;s internal team group chat are handled differently: team members are notified that conversations there are used to help One participate naturally, on a team-policy basis rather than a per-message prompt, consistent with the group being an internal work channel rather than a public one.
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
