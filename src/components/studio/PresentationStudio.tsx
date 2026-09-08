'use client';

import React, { useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { StudioShell } from './StudioShell';
import { useUser } from '@/firebase/auth/use-user';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { OutlineEditor } from './presentation/OutlineEditor';
import { DeckView } from './presentation/DeckView';
import { LoadingRegion, ErrorRegion } from './StudioShared';
import { throwStudioError, resolveStudioError, type StudioApiError } from '@/lib/studio/studio-errors';
import { error as logError } from '@/lib/log';
import { Sparkles, LayoutTemplate } from 'lucide-react';

interface SlideOutlineItem {
  title: string;
  summary: string;
  bullets: string[];
  imagePrompt: string;
  imageUrl?: string;
}

interface PresentationStudioProps {
  onClose: () => void;
}

export default function PresentationStudio({ onClose }: PresentationStudioProps) {
  const { user } = useUser();
  const { toast } = useToast();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [topic, setTopic] = useState('');
  const [slideCount, setSlideCount] = useState(8);
  const [tone, setTone] = useState('professional');
  const [model, setModel] = useState('gpt-4o-mini');
  const [generatingOutline, setGeneratingOutline] = useState(false);

  // Outline/Deck data state
  const [deckTitle, setDeckTitle] = useState('');
  const [slides, setSlides] = useState<SlideOutlineItem[]>([]);
  const [theme, setTheme] = useState<'dark' | 'light' | 'gradient' | 'corporate'>('dark');
  const [exporting, setExporting] = useState(false);

  // Per-code outline error (surfaced inline in addition to the toast) + the
  // model that produced the outline, surfaced on the deck so the user always
  // knows which engine wrote it.
  const [outlineError, setOutlineError] = useState<StudioApiError | null>(null);
  const [deckModel, setDeckModel] = useState<string>('');

  const handleGenerateOutline = async () => {
    if (!topic.trim()) {
      toast({
        title: 'Empty topic',
        description: 'Provide a topic or outline description.',
        variant: 'destructive',
      });
      return;
    }

    if (!user) {
      toast({
        title: 'Authentication required',
        description: 'You must be signed in to use the presentation studio.',
        variant: 'destructive',
      });
      return;
    }

    setOutlineError(null);
    setGeneratingOutline(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/studio/outline', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          topic,
          slides: slideCount,
          tone,
          model
        })
      });

      if (!res.ok) {
        // Per-code friendly message — the outline route returns `error`/`code`
        // (`insufficient_credits`, `rate_limited`, `model_fallback`, …). The
        // old UI surfaced the raw upstream message on model_fallback.
        await throwStudioError(res, 'Outline generation failed');
      }

      const data = await res.json();
      if (data.success && data.outline) {
        setDeckTitle(data.outline.title || 'Untitled Presentation');
        setSlides(data.outline.slides || []);
        // The outline route does not echo the model, so record the requested
        // engine and surface it on the deck (recognition over recall).
        setDeckModel(model);
        setStep(2);
        toast({
          title: 'Outline Generated',
          description: 'Ready for review.',
        });
      } else {
        throw new Error('No outline returned by the server.');
      }

    } catch (e: any) {
      const apiErr = e as StudioApiError;
      if (apiErr && apiErr.kind) {
        setOutlineError(apiErr);
        toast({
          title: apiErr.title,
          description: apiErr.message,
          variant: 'destructive',
        });
        logError('[PresentationStudio] outline failed', { kind: apiErr.kind, raw: apiErr.rawCode });
      } else {
        const resolved = resolveStudioError(undefined, e?.message, e);
        setOutlineError({ ...resolved, message: resolved.description, name: 'Error' } as StudioApiError);
        toast({
          title: resolved.title,
          description: resolved.description,
          variant: 'destructive',
        });
        logError('[PresentationStudio] outline failed', e);
      }
    } finally {
      setGeneratingOutline(false);
    }
  };

  const handleExportPPTX = async () => {
    setExporting(true);
    try {
      toast({
        title: 'Exporting PPTX',
        description: 'Generating PowerPoint slides.'
      });
      const { exportToPPTX } = await import('./presentation/pptxExporter');
      await exportToPPTX(deckTitle, slides, theme);
      toast({
        title: 'Export Complete',
        description: 'PowerPoint file downloaded.'
      });
    } catch (e: any) {
      console.error(e);
      toast({
        title: 'Export Failed',
        description: 'Failed to build PPTX file.',
        variant: 'destructive'
      });
    } finally {
      setExporting(false);
    }
  };

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      toast({
        title: 'Exporting PDF',
        description: 'Structuring PDF pages.'
      });
      const { exportToPDF } = await import('./presentation/pdfExporter');
      await exportToPDF(deckTitle, slides, theme);
      toast({
        title: 'Export Complete',
        description: 'PDF file downloaded.'
      });
    } catch (e: any) {
      console.error(e);
      toast({
        title: 'Export Failed',
        description: 'Failed to build PDF file.',
        variant: 'destructive'
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <StudioShell 
      title="Presentation Builder" 
      description="Create card decks, briefs, and slides from a single prompt."
      onClose={onClose}
    >
      {step === 1 && (
        <div className="max-w-xl mx-auto py-12 px-6 space-y-6 select-none">
          <div className="text-center space-y-2">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 text-primary">
              <LayoutTemplate className="h-5 w-5" />
            </div>
            <h2 className="text-base font-semibold tracking-tight">AI Presentation Orchestrator</h2>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Describe your topic or paste a text document outline. The engine will structure bullet points and prepare descriptive layout prompts.
            </p>
          </div>

          <div className="space-y-4">
            {/* Topic Input */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">What is your deck about?</label>
              <Textarea
                placeholder="An outline for a quarter-end sales kickoff detailing 20% user growth and 2026 expansion plans..."
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="min-h-[100px] resize-y p-3"
              />
            </div>

            {/* Parameters Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Slide Count</label>
                <select
                  value={slideCount}
                  onChange={(e) => setSlideCount(parseInt(e.target.value, 10))}
                  className="w-full h-9 rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {[5, 8, 10, 12, 15].map((c) => (
                    <option key={c} value={c}>{c} Slides</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Tone</label>
                <select
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  className="w-full h-9 rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="professional">Professional</option>
                  <option value="friendly">Friendly & Casual</option>
                  <option value="academic">Academic / Analytical</option>
                  <option value="sales pitch">High-Impact Sales Pitch</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Generation Engine</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full h-9 rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="gpt-4o-mini">GPT-4o Mini (Fast & Efficient)</option>
                <option value="gpt-5-4">GPT-5.4 Nano (Next-Gen Swift)</option>
                <option value="gemini-3.1-flash">Gemini 3.1 Flash (Google Reasoning)</option>
                <option value="claude-sonnet-5">Claude Sonnet 5 (Deep Detail)</option>
              </select>
            </div>

            {/* aria-live loading region — the outline route returns the full
                deck at once, so the bar is indeterminate (no fake %). */}
            {generatingOutline && <LoadingRegion label="Generating outline…" />}

            {/* Action Trigger */}
            <div className="pt-2">
              <Button
                type="button"
                onClick={handleGenerateOutline}
                disabled={generatingOutline}
                className="w-full h-10 gap-2 text-xs font-semibold uppercase tracking-wider"
              >
                {generatingOutline ? (
                  <>
                    <Icon name="loading" className="h-4 w-4 animate-spin" />
                    Generating Skeleton...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Generate Presentation Outline
                  </>
                )}
              </Button>
            </div>

            {/* Inline error region — per-code friendly message + Retry. */}
            {outlineError && !generatingOutline && (
              <ErrorRegion
                title={outlineError.title}
                description={outlineError.message}
                onRetry={handleGenerateOutline}
              />
            )}
          </div>
        </div>
      )}

      {step === 2 && (
        <OutlineEditor
          title={deckTitle}
          setTitle={setDeckTitle}
          slides={slides}
          setSlides={setSlides}
          onGenerate={() => setStep(3)}
          onBack={() => setStep(1)}
        />
      )}

      {step === 3 && (
        <DeckView
          title={deckTitle}
          slides={slides}
          setSlides={setSlides}
          theme={theme}
          setTheme={setTheme}
          onBack={() => setStep(2)}
          onExportPPTX={handleExportPPTX}
          onExportPDF={handleExportPDF}
          exporting={exporting}
          model={deckModel}
        />
      )}
    </StudioShell>
  );
}
