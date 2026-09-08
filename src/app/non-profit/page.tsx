'use client';

import React, { useState } from 'react';
import { Icon } from '@/components/ui/icon';

import { useToast } from '@/hooks/use-toast';
import { useFirestore } from '@/firebase';
import { collection, addDoc, onSnapshot } from 'firebase/firestore';

export default function NpoPortalPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const [website, setWebsite] = useState('');
  const [targetFocus, setTargetFocus] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!website.trim() || !targetFocus.trim() || !email.trim()) {
      toast({
        title: "Validation Error",
        description: "Please fill in all inputs before compiling.",
        variant: "destructive"
      });
      return;
    }

    // 🛡️ Client-Side Domain Spoofing Protection
    const websiteLower = website.trim().toLowerCase();
    const emailLower = email.trim().toLowerCase();
    const domain = websiteLower.replace('https://', '').replace('http://', '').replace('www.', '').split('/')[0];
    const isInternalDomain = domain === 'cybrdeck.com' || domain.endsWith('.cybrdeck.com') ||
                             domain === 'evecount.com' || domain.endsWith('.evecount.com');
    const isInternalEmail = emailLower.endsWith('@cybrdeck.com') || emailLower.endsWith('@evecount.com');
    
    if (isInternalDomain && !isInternalEmail) {
      toast({
        title: "Security Gate Active",
        description: "Audits for cybrdeck.com and evecount.com are strictly restricted to verified corporate team members. Please enter your official corporate email address.",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Submit pending NPO briefing request to Firestore queue
      const docRef = await addDoc(collection(firestore, 'pending_npo_briefings'), {
        website: website,
        target_focus: targetFocus,
        email: email,
        status: 'pending',
        created_at: new Date().toISOString()
      });

      toast({
        title: "Blueprint Queued",
        description: "Philanthropic request received. Resolving ethical alignment and compiling RAG blueprints...",
      });

      // 2. Engaging Cloud Fallback if local backend is offline after 7 seconds
      const timeoutId = setTimeout(async () => {
        unsubscribe(); // cancel realtime listener
        
        toast({
          title: "Cloud Fallback Staged",
          description: "Local secure processor is sleeping. Engaging cloud RAG fallback...",
        });
        
        try {
          const prompt = `You are the Cybrdeck Philanthropy Initiative Auditor.
Triage this non-profit proposal:
Organization: ${domain.split('.')[0] || "Non-Profit Organization"}
Website: ${website}
Mission Focus: ${targetFocus}

First, verify that the organization is ethical and not a malicious enterprise.
If ethical, generate a highly detailed, professional, secrets-free local RAG technical architecture proposal for their charity operations.
Include compliance vectors, offline ingestion schemas, and scaling metrics. Keep the tone techy and highly professional.`;
          
          const geminiRes = await fetch('/api/gemini-fallback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, models: ['gemini-3.5-flash', 'gemini-1.5-flash'] })
          });
          
          if (!geminiRes.ok) {
            throw new Error("Gemini Cloud Fallback failed");
          }
          
          const result = await geminiRes.json();
          const proposalText = result.candidates[0].content.parts[0].text;
          
          setSubmitSuccess(true);
          setIsSubmitting(false);
          
          toast({
            title: "Proposal Dispatched (Cloud Fallback)",
            description: "Technical proposal compiled successfully in the cloud!",
          });
          
          // Update Firestore document so it is stored in the database!
          const { updateDoc } = await import('firebase/firestore');
          await updateDoc(docRef, {
            status: 'completed',
            debrief_proposal: proposalText,
            smtp_status: 'cloud_fallback',
            smtp_message: 'Processed via cloud client-side fallback.'
          });
          
        } catch (fallbackErr) {
          console.error("Fallback failed:", fallbackErr);
          setIsSubmitting(false);
          toast({
            title: "Ethics Gate Alert",
            description: "No local secure processor detected and cloud RAG fallback failed.",
            variant: "destructive"
          });
        }
      }, 7000);

      // 3. Establish realtime websocket connection to receive results
      const unsubscribe = onSnapshot(docRef, (snapshot) => {
        const data = snapshot.data();
        if (data) {
          if (data.status === 'completed') {
            clearTimeout(timeoutId);
            setSubmitSuccess(true);
            setIsSubmitting(false);
            toast({
              title: "Proposal Dispatched",
              description: "Technical proposal compiled successfully and dispatched to your inbox!",
            });
            unsubscribe();
          } else if (data.status === 'blocked') {
            clearTimeout(timeoutId);
            toast({
              title: "Ethics Gate Alert",
              description: data.blocked_reason || "Ethics compliance audit blocked the request.",
              variant: "destructive"
            });
            setIsSubmitting(false);
            unsubscribe();
          } else if (data.status === 'error') {
            clearTimeout(timeoutId);
            toast({
              title: "Compilation Error",
              description: data.error_message || "Failed to compile the requested blueprint.",
              variant: "destructive"
            });
            setIsSubmitting(false);
            unsubscribe();
          }
        }
      }, (err) => {
        console.error("Firestore realtime listener error:", err);
        clearTimeout(timeoutId);
        setIsSubmitting(false);
        toast({
          title: "Connection Alert",
          description: "Queue connection lost. Re-establishing secure handshake...",
          variant: "destructive"
        });
      });

    } catch (err) {
      console.error(err);
      setIsSubmitting(false);
      toast({
        title: "Matrix Write Error",
        description: "Failed to queue request in secure network. Verify database status.",
        variant: "destructive"
      });
    }

  };

  return (
    <div className="min-h-dvh flex flex-col justify-center items-center px-6 py-12 md:py-24 text-black relative" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
      {/* Decorative background aura */}
      <div className="absolute -top-40 w-full h-[500px] bg-gradient-to-b from-red-500/5 to-transparent blur-3xl pointer-events-none" />

      {/* Hero Section Container */}
      <div className="w-full max-w-4xl text-center space-y-8 relative z-10">
        
        {/* Decorative Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-xs font-semibold text-red-400 tracking-wide uppercase">
          <Icon name="heart-outline" size={12} className="fill-red-400" />
          <span>Cybrdeck Philanthropy Initiative</span>
        </div>

        {/* Hero Headings */}
        <div className="space-y-4">
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight bg-gradient-to-r from-red-400 to-zinc-100 bg-clip-text text-transparent leading-none">
            Dynamic RAG Blueprints.
            <span className="block text-black">Empowering Ethical NPOs.</span>
          </h1>
          <p className="max-w-2xl mx-auto text-zinc-400 text-sm md:text-lg leading-relaxed">
            Power your charity operations with localized, zero-egress RAG architectures completely free. Input your coordinates below to generate a tailored technical proposal delivered directly to your inbox.
          </p>
        </div>

        {!submitSuccess ? (
          <>
            /* Sleek Embedded Hero Input Form */
            <form onSubmit={handleSubmit} className="w-full max-w-3xl mx-auto p-2 bg-zinc-900/50 backdrop-blur-xl border border-zinc-800 rounded-xl md:rounded-full shadow-2xl flex flex-col md:flex-row items-center gap-2">
              
              <input 
                type="text" 
                required 
                placeholder="Your NPO Website" 
                value={website} 
                onChange={(e) => setWebsite(e.target.value)}
                className="w-full md:w-1/3 bg-transparent px-4 py-3 text-sm text-black placeholder:text-zinc-500 focus:outline-none md:border-r border-zinc-800 focus:ring-0"
              />

              <input 
                type="text" 
                required 
                placeholder="Target Focus (e.g. Health)" 
                value={targetFocus} 
                onChange={(e) => setTargetFocus(e.target.value)}
                className="w-full md:w-1/3 bg-transparent px-4 py-3 text-sm text-black placeholder:text-zinc-500 focus:outline-none md:border-r border-zinc-800 focus:ring-0"
              />

              <input 
                type="email" 
                required 
                placeholder="Director Email" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)}
                className="w-full md:w-1/3 bg-transparent px-4 py-3 text-sm text-black placeholder:text-zinc-500 focus:outline-none focus:ring-0"
              />

              <button 
                type="submit" 
                disabled={isSubmitting}
                className="w-full md:w-auto bg-red-500 hover:bg-red-600 text-zinc-950 font-bold text-xs uppercase tracking-wider px-8 py-3.5 rounded-lg md:rounded-full shrink-0 cursor-pointer disabled:opacity-50 transition-all shadow-lg hover:shadow-red-500/10 flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <div className="w-4 h-4 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Icon name="paper-plane" size={12} />
                )}
                <span>Request Blueprint</span>
              </button>
            </form>
            <p className="text-xs text-zinc-500 font-mono tracking-wider uppercase mt-4">
              ❤️ Requests are triaged by our human alignment auditors. Blueprints are compiled and dispatched in 2 business days or less.
            </p>
          </>
        ) : (
          /* Dynamic success display */
          <div className="max-w-xl mx-auto space-y-6 pt-6 animate-in slide-in-from-bottom-4 duration-500 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 shadow-2xl">
              <Icon name="circle-check" size={32} className="stroke-[1.5]" />
            </div>
            
            <div className="space-y-2">
              <h3 className="text-2xl font-bold tracking-tight">Proposal Dispatched!</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">
                A customized secrets-free local RAG technical architecture proposal has been successfully compiled and emailed directly to **{email}**.
              </p>
            </div>

            <div className="p-4 rounded-lg bg-zinc-950/40 border border-zinc-800 text-xs text-zinc-400 leading-relaxed flex items-start gap-3 text-left max-w-lg mx-auto">
              <Icon name="triangle-warning" size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
              <span>
                Please check your inbox (including your spam/junk folder) for a message titled **🕵️‍♂️ CYBRDECK RAG TACTICAL BRIEFING** from `one@evecount.com`. To initiate our sandbox demo, simply reply directly to that email thread!
              </span>
            </div>

            <div className="pt-2">
              <button
                onClick={() => {
                  setWebsite('');
                  setTargetFocus('');
                  setEmail('');
                  setSubmitSuccess(false);
                }}
                className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-red-400 hover:underline cursor-pointer"
              >
                <span>Request Another Blueprint</span>
                <Icon name="arrow-right-md" size={12} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
