'use client';

import React, { useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { useUser } from '@/firebase/auth/use-user';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import imageModelsData from '@/data/studio/image-models.json';
import { STUDIO_COSTS } from '@/lib/playground/tier-config';
import { ErrorRegion } from '../StudioShared';
import { throwStudioError, resolveStudioError, type StudioApiError } from '@/lib/studio/studio-errors';
import { error as logError } from '@/lib/log';

/**
 * Budget default. The previous hardcoded model here was `gemini-3-pro-image`
 * — the single most expensive entry in the registry (90 credits, the
 * "premium tier") — with no picker and no cost shown anywhere in this card.
 * A 15-slide deck could silently burn 1,350 credits. This is the cheapest
 * Gemini-direct tier, good enough for a decorative slide illustration.
 */
const DEFAULT_SLIDE_IMAGE_MODEL = 'gemini-3.1-flash-lite-image';

interface SlideOutlineItem {
  title: string;
  summary: string;
  bullets: string[];
  imagePrompt: string;
  imageUrl?: string;
}

interface SlideCardProps {
  slide: SlideOutlineItem;
  index: number;
  onUpdate: (updatedSlide: SlideOutlineItem) => void;
  onDelete: () => void;
  theme: 'dark' | 'light' | 'gradient' | 'corporate';
}

export function SlideCard({
  slide,
  index,
  onUpdate,
  onDelete,
  theme
}: SlideCardProps) {
  const { user } = useUser();
  const { toast } = useToast();
  const [generatingImage, setGeneratingImage] = useState(false);
  const [model, setModel] = useState(DEFAULT_SLIDE_IMAGE_MODEL);
  const [genError, setGenError] = useState<StudioApiError | null>(null);

  // Selected model's real registry cost, so the button always reflects what
  // this specific click will charge — not a flat placeholder.
  const selectedEntry = imageModelsData.find((m) => m.apiVersionId === model || m.id === model);
  const costLabel = selectedEntry?.credits ?? STUDIO_COSTS.image;

  const handleTextChange = (field: keyof SlideOutlineItem, value: any) => {
    onUpdate({
      ...slide,
      [field]: value
    });
  };

  const handleBulletChange = (bulletIndex: number, text: string) => {
    const updatedBullets = [...slide.bullets];
    updatedBullets[bulletIndex] = text;
    onUpdate({
      ...slide,
      bullets: updatedBullets
    });
  };

  const handleAddBullet = () => {
    onUpdate({
      ...slide,
      bullets: [...slide.bullets, 'New bullet point']
    });
  };

  const handleDeleteBullet = (bulletIndex: number) => {
    onUpdate({
      ...slide,
      bullets: slide.bullets.filter((_, idx) => idx !== bulletIndex)
    });
  };

  const handleGenerateImage = async () => {
    if (!user) {
      toast({
        title: 'Authentication Required',
        description: 'Sign in to generate slide images.',
        variant: 'destructive'
      });
      return;
    }

    setGenError(null);
    setGeneratingImage(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/studio/image', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: slide.imagePrompt,
          model,
          n: 1,
          size: '1024x576' // Landscape 16:9 equivalent
        })
      });

      // Per-code friendly error — the previous version threw a generic
      // "Image generation failed" before reading the body, so a 402
      // (insufficient_credits) looked identical to a network blip. Read
      // the real code and route on it, same as AIDrawer/PresentationStudio.
      if (!res.ok) {
        await throwStudioError(res, 'Image generation failed');
      }

      const payload = await res.json();
      const generatedUrl = payload.data?.[0]?.url;
      if (generatedUrl) {
        onUpdate({
          ...slide,
          imageUrl: generatedUrl
        });
        toast({
          title: 'Slide Image Generated',
          description: 'Illustration added to card.'
        });
      } else {
        throw new Error('No image was returned by the upstream service.');
      }
    } catch (e: any) {
      const apiErr = e as StudioApiError;
      if (apiErr && apiErr.kind) {
        setGenError(apiErr);
        toast({
          title: apiErr.title,
          description: apiErr.message,
          variant: 'destructive',
        });
        logError('[SlideCard] generation failed', {
          kind: apiErr.kind,
          raw: apiErr.rawCode,
          ...(typeof apiErr.status === 'number' ? { status: apiErr.status } : {}),
          ...(apiErr.bodySnippet ? { bodySnippet: apiErr.bodySnippet } : {}),
        });
      } else {
        const resolved = resolveStudioError(undefined, e?.message, e);
        setGenError({ ...resolved, message: resolved.description, name: 'Error' } as StudioApiError);
        toast({
          title: resolved.title,
          description: resolved.description,
          variant: 'destructive',
        });
        logError('[SlideCard] generation failed', e);
      }
    } finally {
      setGeneratingImage(false);
    }
  };

  const themeClasses = {
    dark: 'bg-card border-border text-foreground',
    light: 'bg-white border-zinc-200 text-zinc-900',
    gradient: 'bg-gradient-to-br from-indigo-950 via-slate-900 to-zinc-950 border-indigo-500/20 text-foreground',
    corporate: 'bg-zinc-50 border-zinc-200 text-zinc-800'
  };

  const bulletColorClasses = {
    dark: 'text-zinc-300',
    light: 'text-zinc-600',
    gradient: 'text-zinc-200',
    corporate: 'text-zinc-600'
  };

  return (
    <div className={cn(
      "relative border rounded-2xl p-6 shadow-md transition-all group flex flex-col md:flex-row gap-6",
      themeClasses[theme]
    )}>
      
      {/* Index indicator */}
      <div className="absolute top-4 left-4 h-6 w-6 rounded-full bg-primary/10 border border-primary/20 text-primary flex items-center justify-center text-[10px] font-mono font-bold select-none">
        {index + 1}
      </div>

      {/* Title/Bullets Content Area */}
      <div className="flex-1 space-y-4 pt-4 md:pt-0">
        
        {/* Title Input */}
        <input
          type="text"
          value={slide.title}
          onChange={(e) => handleTextChange('title', e.target.value)}
          className="w-full bg-transparent text-lg font-bold tracking-tight border-b border-transparent hover:border-muted-foreground/20 focus:border-primary/50 pb-1 focus:outline-none"
        />

        {/* Description / Summary */}
        <textarea
          value={slide.summary}
          onChange={(e) => handleTextChange('summary', e.target.value)}
          rows={2}
          className="w-full bg-transparent text-xs text-muted-foreground border border-transparent hover:border-muted-foreground/10 focus:border-primary/30 p-1.5 rounded focus:outline-none resize-none"
        />

        {/* Bullet Points */}
        <div className="space-y-1.5">
          {slide.bullets.map((bullet, idx) => (
            <div key={idx} className="flex items-center gap-2 group/bullet">
              <span className="text-primary text-xs shrink-0 select-none">•</span>
              <input
                type="text"
                value={bullet}
                onChange={(e) => handleBulletChange(idx, e.target.value)}
                className={cn(
                  "flex-1 bg-transparent text-xs border-b border-transparent focus:border-primary/40 focus:outline-none py-0.5",
                  bulletColorClasses[theme]
                )}
              />
              <button
                type="button"
                onClick={() => handleDeleteBullet(idx)}
                className="opacity-0 group-hover/bullet:opacity-100 h-5 w-5 rounded hover:bg-muted text-muted-foreground hover:text-destructive flex items-center justify-center transition-opacity"
                title="Remove bullet"
              >
                ×
              </button>
            </div>
          ))}
          
          <button
            type="button"
            onClick={handleAddBullet}
            className="text-[10px] font-semibold text-primary hover:underline flex items-center gap-1 mt-1 select-none"
          >
            + Add bullet point
          </button>
        </div>
      </div>

      {/* Visual / Image Section */}
      <div className="w-full md:w-[240px] shrink-0 flex flex-col justify-between border border-border/40 rounded-xl bg-muted/20 p-4 min-h-[160px] relative overflow-hidden">
        
        {generatingImage ? (
          <div className="absolute inset-0 bg-background/50 flex flex-col items-center justify-center text-center p-4">
            <Icon name="loading" className="h-6 w-6 text-primary animate-spin mb-2" />
            <span className="text-[10px] font-medium text-foreground">Rendering Image...</span>
          </div>
        ) : null}

        {slide.imageUrl ? (
          <div className="relative w-full aspect-[16/9] border border-border/30 rounded-lg overflow-hidden shrink-0">
            <img 
              src={slide.imageUrl} 
              alt="Slide illustration" 
              className="w-full h-full object-cover" 
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleGenerateImage}
              className="absolute bottom-2 right-2 h-7 px-2.5 text-[9px] bg-background/90 text-foreground gap-1 border-none shadow-sm hover:bg-background"
              title="Regenerate Image"
            >
              <Sparkles className="h-3 w-3" /> Re-render ({costLabel} cr)
            </Button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-4 border border-dashed border-border/60 rounded-lg select-none mb-3">
            <Icon name="image" className="h-6 w-6 text-muted-foreground/30 mb-1" />
            <span className="text-[10px] text-muted-foreground/60">No slide visual added</span>
          </div>
        )}

        {/* Actions panel */}
        <div className="mt-auto space-y-1.5 pt-3 border-t border-border/30">
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={generatingImage}
            title="Generation engine"
            className="w-full h-7 rounded-md border border-border bg-background px-2 text-[10px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
          >
            {imageModelsData.map((m) => (
              <option key={m.id} value={m.apiVersionId}>{m.displayName} ({m.credits} cr)</option>
            ))}
          </select>

          {!slide.imageUrl && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleGenerateImage}
              className="w-full h-7 text-[10px] gap-1 border-border bg-background"
            >
              <Sparkles className="h-3 w-3 text-primary" /> Generate Slide Visual ({costLabel} cr)
            </Button>
          )}

          {/* Inline error — real per-code message + Retry, in addition to the toast. */}
          {genError && !generatingImage && (
            <ErrorRegion
              title={genError.title}
              description={genError.message}
              onRetry={handleGenerateImage}
              className="p-2.5"
            />
          )}

          <div className="flex justify-between select-none">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="h-7 text-[10px] text-muted-foreground hover:text-destructive hover:bg-destructive/10 px-2 gap-1"
            >
              <Icon name="trash-empty" className="h-3 w-3" /> Remove Slide
            </Button>
          </div>
        </div>

      </div>

    </div>
  );
}
