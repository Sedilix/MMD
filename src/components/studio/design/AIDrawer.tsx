'use client';

import React, { useState } from 'react';
import { useUser } from '@/firebase/auth/use-user';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

import { Icon } from '@/components/ui/icon';
import imageModelsData from '@/data/studio/image-models.json';
import { STUDIO_COSTS } from '@/lib/playground/tier-config';
import { ModelUsedBadge, LoadingRegion, ErrorRegion } from '../StudioShared';
import { throwStudioError, resolveStudioError, type StudioApiError } from '@/lib/studio/studio-errors';
import { error as logError } from '@/lib/log';

interface AIDrawerProps {
  onAddImage: (url: string) => void;
}

export function AIDrawer({ onAddImage }: AIDrawerProps) {
  const { user } = useUser();
  const { toast } = useToast();
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('flux-general-en');
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<string[]>([]);
  // Per-code error surfaced inline (in addition to the toast), so a screen
  // reader or quick dismiss still sees the failure + a Retry.
  const [genError, setGenError] = useState<StudioApiError | null>(null);
  // Track which model produced each asset so the grid can show the badge and
  // a silent fallback is visible (the image route doesn't echo `model`, so we
  // record the requested model per generation run).
  const [assetModels, setAssetModels] = useState<Record<number, string>>({});

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast({
        title: 'Empty prompt',
        description: 'Provide an image description.',
        variant: 'destructive',
      });
      return;
    }

    if (!user) {
      toast({
        title: 'Authentication Required',
        description: 'Sign in to use AI Generation.',
        variant: 'destructive',
      });
      return;
    }

    setGenError(null);
    setGenerating(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/studio/image', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: prompt.trim(),
          model,
          n: 1,
          size: '1024x1024'
        })
      });

      // Per-code friendly error — the old code threw a generic "Image
      // generation failed" before even reading the body, so the real upstream
      // code (`model_fallback`, `insufficient_credits`, `rate_limited`, …)
      // was discarded. Read the JSON and route on the code now.
      if (!res.ok) {
        await throwStudioError(res, 'Image generation failed');
      }

      const payload = await res.json();
      const url = payload.data?.[0]?.url;
      if (url) {
        // Prepend the new asset and tag it with the requested model so the
        // grid badge reflects what produced it.
        setGenerated([url, ...generated]);
        setAssetModels((prev) => {
          // New asset is at index 0; shift existing indices up by 1.
          const shifted: Record<number, string> = { 0: model };
          for (const k of Object.keys(prev)) {
            shifted[Number(k) + 1] = prev[Number(k)];
          }
          return shifted;
        });
        toast({
          title: 'Image generated',
          description: 'Click the image or click "+" to insert into canvas.',
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
        logError('[AIDrawer] generation failed', {
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
        logError('[AIDrawer] generation failed', e);
      }
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden p-1 space-y-3">
      <div className="space-y-1 select-none">
        <h4 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">AI Asset Generator</h4>
        <p className="text-[9px] text-slate-500 leading-relaxed">Synthesize graphics that drop directly onto your active artboard.</p>
      </div>

      <div className="space-y-2.5">
        <div className="space-y-1 select-none">
          <label className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider">Generation Engine</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full h-8 rounded-md border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {imageModelsData.map((m) => (
              <option key={m.id} value={m.apiVersionId}>{m.displayName}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider select-none">Prompt</label>
          <Textarea
            placeholder="A modern vector icon of a gear and shield, clean, minimal white background..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="min-h-[70px] p-2 resize-none"
          />
        </div>

        {/* aria-live loading region so screen readers announce the wait. */}
        {generating && <LoadingRegion label="Generating asset…" />}

        <Button
          type="button"
          onClick={handleGenerate}
          disabled={generating}
          className="w-full h-8 gap-1.5 text-xs font-semibold uppercase tracking-wider"
        >
          {generating ? (
            <>
              <Icon name="loading" className="h-3.5 w-3.5 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Icon name="image-01" className="h-3.5 w-3.5" />
              Generate ({STUDIO_COSTS.image} cr)
            </>
          )}
        </Button>

        {/* Inline error region — per-code friendly message + Retry. */}
        {genError && !generating && (
          <ErrorRegion
            title={genError.title}
            description={genError.message}
            onRetry={handleGenerate}
          />
        )}
      </div>

      {/* Generated list */}
      <div className="flex-1 flex flex-col min-h-0">
        <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 select-none">Generated Assets</span>
        
        {generated.length === 0 ? (
          <div className="flex-1 border border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center p-3 text-center select-none">
            <Icon name="image-01" className="h-5 w-5 text-slate-300 mb-1" />
            <span className="text-[9px] text-slate-400">No generated elements</span>
          </div>
        ) : (
          <div className="flex-1 overflow-auto grid grid-cols-2 gap-1.5 pb-1">
            {generated.map((url, idx) => (
              <div
                key={idx}
                className="group relative aspect-square border border-slate-200 bg-slate-100 rounded-lg overflow-hidden cursor-pointer"
                onClick={() => onAddImage(url)}
                title={assetModels[idx] ? `Model: ${assetModels[idx]}` : 'Generated asset'}
              >
                <img src={url} alt="Generated asset" className="w-full h-full object-cover" />
                {/* Model badge overlaid bottom-left so each asset shows which
                    engine produced it (recognition over recall). */}
                {assetModels[idx] && (
                  <span className="absolute bottom-1 left-1 z-10">
                    <ModelUsedBadge model={assetModels[idx]} />
                  </span>
                )}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Icon name="add-plus" className="h-5 w-5 text-white" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
