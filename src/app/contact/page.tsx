"use client"

import Link from 'next/link';
import { Icon } from '@/components/ui/icon';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ContourGlassButton } from '@/components/ui/ContourGlassButton';
import { CrystalLightField } from '@/components/ui/CrystalLightField';

import { useFirestore } from '@/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export default function ContactPage() {
  const [mounted, setMounted] = useState(false);
  const firestore = useFirestore();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { setMounted(true); }, []);

  const isDark = mounted;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firestore) return;
    setLoading(true);
    setError('');
    try {
      await addDoc(collection(firestore, 'contact_enquiries'), {
        name,
        email,
        subject,
        message,
        createdAt: serverTimestamp(),
        status: 'unread',
      });
      setSuccess(true);
    } catch (err: any) {
      setError('Failed to submit. Please try emailing us directly.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-[#01040c] flex flex-col relative overflow-hidden">
      {/* Delegated light source for .cd-crystal glass blocks */}
      <CrystalLightField />

      {/* Ambient glows */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/3 w-[500px] h-[500px] bg-brand-500/8 blur-[140px] rounded-full" />
        <div className="absolute bottom-1/3 right-1/4 w-[400px] h-[400px] bg-indigo-500/6 blur-[120px] rounded-full" />
      </div>

      {/* Subtle grid */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(rgba(198, 143, 61,0.6) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(198, 143, 61,0.6) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-5 border-b border-white/5">
        <Link href="/">
          <Image
            src={isDark ? "/cybrdeck-logo/cybrdeck_new_logo_cp_neonblue.png" : "/cybrdeck-logo/cybrdeck_logo_cropped_white.png"}
            alt="Cybrdeck Logo"
            width={400}
            height={80}
            className="h-8 md:h-10 w-auto object-contain drop-shadow-[0_0_8px_rgba(0,0,0,0.3)]"
            priority
          />
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 text-zinc-400 hover:text-white text-xs font-medium transition-colors backdrop-blur-md"
        >
          <Icon name="arrow-left-md" className="h-3.5 w-3.5" />
          Back
        </Link>
      </header>

      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-16">

        <p className="text-[10px] font-mono text-brand-400 uppercase tracking-[0.3em] mb-4">
          [ DIRECT LINE ]
        </p>
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-white text-center mb-4">
          Contact <span className="text-brand-300">the Founders</span>
        </h1>
        <p className="text-sm text-zinc-400 font-body text-center max-w-md leading-relaxed mb-12">
          Reach out directly to the Cybrdeck co-founders, or submit a structured enquiry below and we'll get back to you promptly.
        </p>

        <div className="w-full max-w-2xl space-y-10">

          {/* Direct email cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <a
              href="mailto:gwen@evecount.com"
              className="group flex items-center gap-4 p-5 rounded-2xl cd-crystal"
            >
              <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-center shrink-0 text-brand-400">
                <Icon name="mail" className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-0.5">Gwen — Co-Founder</p>
                <p className="text-sm font-mono text-white group-hover:text-brand-300 transition-colors duration-200">gwen@evecount.com</p>
              </div>
            </a>

            <a
              href="mailto:ben@evecount.com"
              className="group flex items-center gap-4 p-5 rounded-2xl cd-crystal"
            >
              <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-center shrink-0 text-brand-400">
                <Icon name="mail" className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-0.5">Ben — Co-Founder</p>
                <p className="text-sm font-mono text-white group-hover:text-brand-300 transition-colors duration-200">ben@evecount.com</p>
              </div>
            </a>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-4">
            <div className="flex-1 h-px bg-white/5" />
            <span className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest">or submit an enquiry</span>
            <div className="flex-1 h-px bg-white/5" />
          </div>

          {/* Enquiry form */}
          {success ? (
            <div className="flex flex-col items-center gap-4 py-10 text-center">
              <div className="w-14 h-14 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center">
                <Icon name="circle-check" className="h-7 w-7 text-green-400" />
              </div>
              <h2 className="font-semibold text-lg tracking-tight text-white">Enquiry Received</h2>
              <p className="text-sm text-zinc-400 max-w-sm">
                We'll review your message and get back to you at <span className="text-white">{email}</span> shortly.
              </p>
              <Link href="/">
                <ContourGlassButton effect="rim" asChild size="sm" className="mt-2">
                  <span>Return Home</span>
                </ContourGlassButton>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5 cd-crystal rounded-3xl p-6 sm:p-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Your Name</label>
                  <Input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder=""
                    required
                    className="bg-white/3 border-white/10 focus-visible:ring-brand-400/30 focus-visible:border-brand-400/30 text-white h-11"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Email Address</label>
                  <Input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder=""
                    required
                    className="bg-white/3 border-white/10 focus-visible:ring-brand-400/30 focus-visible:border-brand-400/30 text-white h-11"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Subject</label>
                <Input
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder="e.g. Partnership enquiry / Project proposal"
                  required
                  className="bg-white/3 border-white/10 focus-visible:ring-brand-400/30 focus-visible:border-brand-400/30 text-white h-11"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Message</label>
                <Textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Tell us what you're looking to accomplish..."
                  required
                  rows={5}
                  className="bg-white/3 border-white/10 focus-visible:ring-brand-400/30 focus-visible:border-brand-400/30 text-white resize-none"
                />
              </div>

              {error && (
                <p className="text-xs text-red-400 font-mono">{error}</p>
              )}

              <ContourGlassButton
                effect="rim"
                type="submit"
                size="xl"
                className="w-full"
                disabled={loading}
              >
                {loading ? <Icon name="loading" className="h-4 w-4 animate-spin" /> : <><Icon name="paper-plane" className="h-4 w-4" /> Send Enquiry</>}
              </ContourGlassButton>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
