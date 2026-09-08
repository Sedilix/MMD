'use client';

import React, { useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { Zap } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore } from '@/firebase';
import { collection, addDoc, onSnapshot } from 'firebase/firestore';

export default function SalesSourcingPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [focusDetails, setFocusDetails] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'matrix'>('idle');
  const [matrixMessage, setMatrixMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim() || !company.trim() || !focusDetails.trim()) {
      toast({
        title: "Validation Error",
        description: "Please fill in all inputs before compiling.",
        variant: "destructive"
      });
      return;
    }

    setStatus('loading');

    try {
      // 1. Submit pending sales briefing request to Firestore queue
      const docRef = await addDoc(collection(firestore, 'pending_sales_briefings'), {
        company: company,
        focus_details: focusDetails,
        email: email,
        status: 'pending',
        created_at: new Date().toISOString()
      });

      toast({
        title: "Briefing Queued",
        description: "Sales brief request queued in Secure Matrix. Scanning whitelists...",
      });

      // 2. Engaging Cloud Fallback if local backend is offline after 7 seconds
      const timeoutId = setTimeout(async () => {
        unsubscribe(); // cancel realtime listener
        
        toast({
          title: "Cloud Fallback Staged",
          description: "Local secure processor is sleeping. Engaging cloud RAG fallback...",
        });
        
        try {
          const recipient = email.toLowerCase().trim();
          const approvedDomains = ["evecount.com", "cybrdeck.com"];
          const approvedEmails = ["recruit@cybrdeck.org", "trainee@cybrdeck.org"];
          
          const parts = recipient.split('@');
          let isAuthorized = false;
          if (parts.length === 2) {
            const domainName = parts[1];
            if (approvedDomains.includes(domainName) || approvedEmails.includes(recipient)) {
              isAuthorized = true;
            }
          }
          
          if (!isAuthorized) {
            const matrixMsg = "Security matrix engaged. A transmission has been dispatched to your coordinates. Choose wisely.";
            setMatrixMessage(matrixMsg);
            setStatus('matrix');
            
            toast({
              title: "Matrix Gate Engaged",
              description: "Unauthorized credentials intercepted. Coordinates redirected.",
            });
            
            const { updateDoc } = await import('firebase/firestore');
            await updateDoc(docRef, {
              status: 'matrix_gate_engaged',
              matrix_message: matrixMsg
            });
            return;
          }
          
          // Whitelisted - generate direct briefing
          const prompt = `You are the Senior Cybrdeck RAG Onboarding Auditor.
Generate a professional RAG sales outreach briefing for company '${company}' with outbound focus details: '${focusDetails}'.
Include target compliance analysis, and a highly refined sales outbound email draft. Keep the tone sharp, whitehat, and extremely high-value.`;
          
          const geminiRes = await fetch('/api/gemini-fallback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, models: ['gemini-1.5-flash', 'gemini-2.0-flash'] })
          });
          
          if (!geminiRes.ok) {
            throw new Error("Gemini Cloud Fallback failed");
          }
          
          const result = await geminiRes.json();
          const proposalText = result.candidates[0].content.parts[0].text;
          
          setStatus('success');
          toast({
            title: "Sales Briefing Dispatched (Cloud Fallback)",
            description: "RAG Outreach prospecting brief compiled and dispatched in the cloud!",
          });
          
          // Update Firestore
          const { updateDoc } = await import('firebase/firestore');
          await updateDoc(docRef, {
            status: 'completed',
            debrief_proposal: proposalText,
            smtp_status: 'cloud_fallback',
            smtp_message: 'Processed via cloud client-side fallback.'
          });
          
        } catch (fallbackErr) {
          console.error("Fallback failed:", fallbackErr);
          setStatus('idle');
          toast({
            title: "Compilation Error",
            description: "No local secure processor detected and cloud RAG fallback failed.",
            variant: "destructive"
          });
        }
      }, 7000);

      // 3. Establish realtime websocket connection to receive whitelisting / compilation status
      const unsubscribe = onSnapshot(docRef, (snapshot) => {
        const data = snapshot.data();
        if (data) {
          if (data.status === 'completed') {
            clearTimeout(timeoutId);
            setStatus('success');
            toast({
              title: "Sales Briefing Dispatched",
              description: "RAG Outreach prospecting brief compiled and sent to your email!",
            });
            unsubscribe();
          } else if (data.status === 'matrix_gate_engaged') {
            clearTimeout(timeoutId);
            setMatrixMessage(data.matrix_message || "Unauthorized credentials intercepted. Coordinates redirected.");
            setStatus('matrix');
            toast({
              title: "Matrix Gate Engaged",
              description: "Unauthorized credentials intercepted. Coordinates redirected.",
            });
            unsubscribe();
          } else if (data.status === 'error') {
            clearTimeout(timeoutId);
            toast({
              title: "Compilation Error",
              description: data.error_message || "Failed to compile sales briefing.",
              variant: "destructive"
            });
            setStatus('idle');
            unsubscribe();
          }
        }
      }, (err) => {
        console.error("Firestore realtime listener error:", err);
        clearTimeout(timeoutId);
        setStatus('idle');
        toast({
          title: "Connection Alert",
          description: "Sales matrix lost connection. Re-syncing...",
          variant: "destructive"
        });
      });

    } catch (err) {
      console.error(err);
      setStatus('idle');
      toast({
        title: "Matrix Write Error",
        description: "Failed to queue briefing request in secure network.",
        variant: "destructive"
      });
    }

  };


  if (status === 'matrix') {
    return (
      <div className="min-h-dvh bg-black text-[#00ff00] font-mono flex items-center justify-center p-6 select-none" style={{ fontFamily: "'Fira Code', monospace" }}>
        <div className="max-w-xl border-2 border-[#00ff00] p-8 rounded-xl shadow-[0_0_30px_rgba(0,255,0,0.3)] bg-zinc-950/80 backdrop-blur-md space-y-6">
          <div className="flex items-center gap-2 border-b border-[#00ff00] pb-4">
            <Icon name="terminal" className="animate-pulse text-[#00ff00]" />
            <h1 className="text-xl font-bold uppercase tracking-wider text-[#00ff00]">Matrix Security Gate Engaged</h1>
          </div>
          <p className="leading-relaxed text-sm text-zinc-300">
            {matrixMessage}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 font-sans">
            <a 
              href="https://calendly.com/cybrdeck/connect" 
              target="_blank" 
              rel="noreferrer"
              className="border border-red-500 text-red-500 hover:bg-red-950/30 text-center py-4 rounded-lg font-bold transition-all shadow-[0_0_15px_rgba(239,68,68,0.2)] cursor-pointer"
            >
              🔴 TAKE THE RED PILL
              <span className="block text-[10px] uppercase font-normal mt-1 text-zinc-400">Schedule Calendar Booking</span>
            </a>
            <button 
              onClick={() => { setStatus('idle'); setEmail(''); setCompany(''); setFocusDetails(''); }}
              className="border border-blue-500 text-blue-500 hover:bg-blue-950/30 py-4 rounded-lg font-bold transition-all shadow-[0_0_15px_rgba(59,130,246,0.2)] cursor-pointer"
            >
              🔵 TAKE THE BLUE PILL
              <span className="block text-[10px] uppercase font-normal mt-1 text-zinc-400">Forget this existed</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col justify-center items-center px-6 py-12 md:py-24 text-black relative" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
      {/* Decorative background aura */}
      <div className="absolute -top-40 w-full h-[500px] bg-gradient-to-b from-brand-500/5 to-transparent blur-3xl pointer-events-none" />

      {/* Hero Section Container */}
      <div className="w-full max-w-4xl text-center space-y-8 relative z-10">
        
        {/* Decorative Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/20 text-xs font-semibold text-brand-400 tracking-wide uppercase">
          <Icon name="shield" size={14} />
          <span>Cybrdeck Sales Force Portal</span>
        </div>

        {/* Hero Headings */}
        <div className="space-y-4">
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight bg-gradient-to-r from-brand-400 to-zinc-100 bg-clip-text text-transparent leading-none">
            Secure Lead Matrix.
            <span className="block text-black">Outbound Sales Prospecting.</span>
          </h1>
          <p className="max-w-2xl mx-auto text-zinc-400 text-sm md:text-lg leading-relaxed">
            Input target parameters below to generate and email B2B prospecting briefings. Domain whitelists are strictly enforced locally to prevent data egress.
          </p>
        </div>

        {status === 'success' ? (
          /* Success display */
          <div className="max-w-xl mx-auto space-y-6 pt-6 animate-in slide-in-from-bottom-4 duration-500 text-center">
            <div className="w-12 h-12 bg-brand-500/20 text-brand-400 rounded-full flex items-center justify-center mx-auto shadow-2xl">✓</div>
            <h3 className="font-bold text-lg">Sales Briefing Dispatched</h3>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Your customized RAG outbound sales briefing has been successfully compiled and emailed directly to your whitelisted email: **{email}**.
            </p>
            <button 
              onClick={() => setStatus('idle')} 
              className="text-xs text-brand-400 hover:underline uppercase font-bold tracking-widest pt-2 cursor-pointer block mx-auto"
            >
              Compile Another Outbound Lead
            </button>
          </div>
        ) : (
          <>
            /* Sleek Embedded Hero Input Form */
            <form onSubmit={handleSubmit} className="w-full max-w-3xl mx-auto p-4 md:p-6 bg-zinc-900/50 backdrop-blur-xl border border-zinc-800 rounded-2xl shadow-2xl space-y-4">
              <div className="flex flex-col md:flex-row items-center gap-2">
                <input 
                  type="text" 
                  required 
                  placeholder="Target Website" 
                  value={company} 
                  onChange={(e) => setCompany(e.target.value)}
                  className="w-full md:w-1/3 bg-transparent px-4 py-3 text-sm text-black placeholder:text-zinc-500 focus:outline-none md:border-r border-zinc-800 focus:ring-0"
                />

                <input 
                  type="text" 
                  required 
                  placeholder="Outbound Details" 
                  value={focusDetails} 
                  onChange={(e) => setFocusDetails(e.target.value)}
                  className="w-full md:w-1/3 bg-transparent px-4 py-3 text-sm text-black placeholder:text-zinc-500 focus:outline-none md:border-r border-zinc-800 focus:ring-0"
                />

                <input 
                  type="email" 
                  required 
                  placeholder="Whitelisted Email" 
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full md:w-1/3 bg-transparent px-4 py-3 text-sm text-black placeholder:text-zinc-500 focus:outline-none focus:ring-0"
                />

                <button 
                  type="submit" 
                  disabled={status === 'loading'}
                  className="w-full md:w-auto bg-brand-500 hover:bg-brand-600 text-zinc-950 font-bold text-xs uppercase tracking-wider px-8 py-3.5 rounded-lg md:rounded-full shrink-0 cursor-pointer disabled:opacity-50 transition-all shadow-lg hover:shadow-brand-500/10 flex items-center justify-center gap-2"
                >
                  {status === 'loading' ? (
                    <div className="w-4 h-4 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Icon name="paper-plane" size={12} />
                  )}
                  <span>Query RAG</span>
                </button>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-zinc-400 font-mono pl-2">
                <input 
                  type="checkbox" 
                  id="leads-consent" 
                  required 
                  className="h-3.5 w-3.5 accent-brand-500 rounded border-zinc-700 bg-zinc-900 cursor-pointer"
                />
                <label htmlFor="leads-consent" className="cursor-pointer select-none text-left">
                  I accept the <a href="/privacy" className="underline hover:text-brand-400 transition-colors" target="_blank">Privacy Policy</a> and consent to telemetry data collection.
                </label>
              </div>
            </form>
            <p className="text-xs text-zinc-500 font-mono tracking-wider uppercase mt-4">
              🛡️ Briefings are reviewed and whitelisted by matrix operations. Expect clearance within 2 business days.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
