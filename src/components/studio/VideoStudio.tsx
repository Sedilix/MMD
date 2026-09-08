'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { STUDIO_COSTS } from '@/lib/playground/tier-config';
import { StudioShell } from './StudioShell';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
// Film / Scissors / Clapperboard have no coolicons equivalent, so
// `subTabsConfig` holds pre-rendered nodes instead of component references
// — a ReactNode carries either library, and the sub-tabs render at a fixed
// size so nothing state-dependent needs to reach the icon.
import { Video, Film, Wand2, Sparkles, Scissors, Clapperboard, Music } from 'lucide-react';
import videoModelsData from '@/data/studio/video-models.json';
import { ModelUsedBadge, CancelButton, LoadingRegion, ErrorRegion } from './StudioShared';
import { throwStudioError, resolveStudioError, type StudioApiError } from '@/lib/studio/studio-errors';
import { useElapsed } from '@/lib/studio/use-elapsed';
import { dbg, error as logError } from '@/lib/log';

// The registry is shaped as `{ providerCaps, models }`. These per-provider
// hard caps mirror the clamps in `src/app/api/studio/video/route.ts` (the
// route's clamps win if the two drift, but the slider advertises these so the
// user never picks a value the upstream will reject). Kept in lock-step with
// the route as a single source of truth.
const { providerCaps, models: videoModels } = videoModelsData as unknown as {
    providerCaps: {
        dashscope: { videoSynthesis: number; videoEdit: number };
        llmapi: number;
    };
    models: VideoModelEntry[];
};

interface VideoModelEntry {
  id: string;
  displayName: string;
  provider: string;
  apiVersionId: string;
  capability: 't2v' | 'i2v' | 'r2v' | 'editor' | 'animate';
  maxDurationSec?: number;
  creditsPerSec?: number;
  description: string;
}

interface VideoRecord {
  id: string;
  url: string;
  prompt: string;
  model: string;
  cameraMotion: string;
  aspectRatio: string;
  createdAt: string;
}

interface VideoStudioProps {
  onClose: () => void;
}

type SubTab = 't2v' | 'i2v' | 'r2v' | 'editor' | 'animate';

export default function VideoStudio({ onClose }: VideoStudioProps) {
  const { toast } = useToast();
  const [subTab, setSubTab] = useState<SubTab>('t2v');
  const [prompt, setPrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState('happyhorse-1.1-t2v');
  const [cameraMotion, setCameraMotion] = useState('None / Custom');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [duration, setDuration] = useState(5);

  // Warn-once tracker for models missing `maxDurationSec` so the dev console
  // doesn't spam on every model change. The data is current, but new entries
  // shipped without the field would otherwise trigger a warning per render.
  const missingMaxDurationRef = useRef<Set<string>>(new Set());

  // Media Inputs
  const [imageUrl, setImageUrl] = useState('');
  const [referenceUrl, setReferenceUrl] = useState('');
  const [inputVideoUrl, setInputVideoUrl] = useState('');

  // Animate-from-Video inputs
  const [characterImageUrl, setCharacterImageUrl] = useState('');
  const [referenceMotionUrl, setReferenceMotionUrl] = useState('');
  const [animateMode, setAnimateMode] = useState<'wan-std' | 'wan-pro'>('wan-std');

  const [loading, setLoading] = useState(false);
  const [currentVideo, setCurrentVideo] = useState<VideoRecord | null>(null);
  const [history, setHistory] = useState<VideoRecord[]>([]);
  const [boundAudioUrl, setBoundAudioUrl] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedAudio = localStorage.getItem('cybrdeck_cross_studio_audio_url');
      if (savedAudio) setBoundAudioUrl(savedAudio);
    }
  }, []);

  // Cancel + honest-progress state for multi-minute video jobs. Video synthesis
  // can run for several minutes; a bare spinner leaves the user guessing. The
  // AbortController lets them bail out, and `genError` surfaces a per-code
  // friendly failure inline (in addition to the toast) with a Retry.
  const abortRef = useRef<AbortController | null>(null);
  const [genError, setGenError] = useState<StudioApiError | null>(null);
  const { label: elapsedLabel } = useElapsed(loading);

  // Abort any in-flight generation on unmount so the polling fetch never
  // resolves into an unmounted component (setState-after-unmount guard).
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  const handleSubTabChange = (tab: SubTab) => {
    setSubTab(tab);
    if (tab === 't2v') {
      setSelectedModel('happyhorse-1.1-t2v');
    } else if (tab === 'i2v') {
      setSelectedModel('happyhorse-1.1-i2v');
    } else if (tab === 'r2v') {
      setSelectedModel('happyhorse-1.1-r2v');
    } else if (tab === 'editor') {
      setSelectedModel('wan2.7-videoedit');
    } else if (tab === 'animate') {
      setSelectedModel('wan2.2-animate-move');
    }
    // Reset duration to the default when switching modes so the slider stays
    // within bounds for the newly-selected default model.
    setDuration(5);
    // Clear tab-specific media inputs so stale state from the previous tab
    // never leaks into a submission on the new tab. The prompt is kept
    // (it's visible on most tabs and re-typing is disruptive), but media
    // URLs and camera motion are tab-specific affordances.
    setImageUrl('');
    setReferenceUrl('');
    setInputVideoUrl('');
    setCharacterImageUrl('');
    setReferenceMotionUrl('');
    setCameraMotion('None / Custom');
  };

  const handleDownloadVideo = async (video: VideoRecord) => {
    try {
      toast({
        title: 'Downloading...',
        description: 'Saving video file.',
      });

      const fileName = `cybrdeck-video-${Date.now()}.mp4`;

      if (video.url.startsWith('data:')) {
        const a = document.createElement('a');
        a.href = video.url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }

      const proxyUrl = `/api/media-proxy?url=${encodeURIComponent(video.url)}&filename=${encodeURIComponent(fileName)}&download=1`;
      const response = await fetch(proxyUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setTimeout(() => {
        window.URL.revokeObjectURL(blobUrl);
      }, 1000);
    } catch (err) {
      console.error('[VideoStudio] Download error:', err);
      try {
        const fileName = `cybrdeck-video-${Date.now()}.mp4`;
        const proxyUrl = `/api/media-proxy?url=${encodeURIComponent(video.url)}&filename=${encodeURIComponent(fileName)}&download=1`;
        const link = document.createElement('a');
        link.href = proxyUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch {
        toast({
          title: 'Download failed',
          description: 'Unable to save video file directly.',
          variant: 'destructive',
        });
      }
    }
  };

  // Resolve the active model's max duration. The tier matrix doesn't carry a
  // `maxDurationSec` cap (model eligibility isn't tier-gated — only credit
  // allowance is, see tier-config.ts), so we fall back to the model max.
  const activeModelEntry = videoModels.find((m) => m.id === selectedModel);
  const modelMaxDuration = activeModelEntry?.maxDurationSec;
  const activeCreditsPerSec = activeModelEntry?.creditsPerSec ?? STUDIO_COSTS.video;

  // Provider display helpers for the model dropdown
  const getProviderInfo = (p: string): { label: string; color: string } => {
    if (p === 'alibaba') return { label: 'AMS', color: 'border-orange-500/30 text-orange-300 bg-orange-950/30' };
    if (p === 'llmapi') return { label: 'LLMAPI', color: 'border-purple-500/30 text-purple-300 bg-purple-950/30' };
    if (p === 'google-direct') return { label: 'Google', color: 'border-blue-500/30 text-blue-300 bg-blue-950/30' };
    return { label: p, color: 'border-slate-500/30 text-slate-300 bg-slate-950/30' };
  };
  const activeProviderInfo = getProviderInfo(activeModelEntry?.provider || '');

  // Group models by provider for optgroup rendering in the dropdown
  const groupedModels = React.useMemo(() => {
    const groups: Record<string, VideoModelEntry[]> = {};
    for (const m of videoModels) {
      if (m.capability !== subTab) continue;
      const p = m.provider || 'other';
      if (!groups[p]) groups[p] = [];
      groups[p].push(m);
    }
    const order = ['alibaba', 'llmapi', 'google-direct'];
    return order.filter((o) => groups[o]).map((o) => ({ provider: o, models: groups[o] }));
  }, [subTab]);

  // Per-provider hard cap. The route clamps server-side (DashScope synthesis
  // 2–15s, DashScope video-edit 2–10s, LLMAPI 2–30s); we surface the binding
  // cap here so the slider never advertises a value the upstream will reject.
  // `wan2.2-animate-move` (the `animate` capability) doesn't take a duration
  // field at all and the slider is hidden for that tab, so it gets no cap.
  function resolveProviderCap(entry: VideoModelEntry | undefined): number | undefined {
    if (!entry) return undefined;
    if (entry.provider === 'llmapi') return providerCaps.llmapi;
    if (entry.provider === 'google-direct') return 8; // Veo models cap at 8s
    if (entry.provider === 'alibaba') {
      // DashScope video-edit models (`*videoedit`, `happyhorse-1.0-video-edit`)
      // live on the image2video service with a 2–10s window; everything else
      // DashScope (t2v / i2v / r2v / kf2v / vace) goes through the generic
      // video-synthesis service with a 2–15s window. Match the route's branch.
      const isVideoEdit = entry.capability === 'editor' || entry.id.includes('kf2v');
      return isVideoEdit ? providerCaps.dashscope.videoEdit : providerCaps.dashscope.videoSynthesis;
    }
    return undefined;
  }

  const providerCap = resolveProviderCap(activeModelEntry);
  // Effective slider max = min(model nominal max, provider hard cap). Either
  // side can be the binding constraint; we track which so the UI label can
  // tell the user when they're hitting a provider limit rather than the
  // model's nominal ceiling.
  const hasModelMax = typeof modelMaxDuration === 'number' && modelMaxDuration > 0;
  const hasProviderCap = typeof providerCap === 'number' && providerCap > 0;
  const effectiveMaxDuration =
    hasModelMax && hasProviderCap
      ? Math.min(modelMaxDuration as number, providerCap as number)
      : hasModelMax
        ? (modelMaxDuration as number)
        : hasProviderCap
          ? (providerCap as number)
          : 5;
  const providerCapIsBinding =
    hasModelMax && hasProviderCap && (providerCap as number) < (modelMaxDuration as number);

  // Warn once per missing-model-id when the registry is out of sync. The
  // Set lives across renders so we never log more than once per id. We only
  // warn when BOTH the model nominal max and the provider cap are missing — a
  // model that exposes a provider cap alone (no model-level maxDurationSec)
  // still produces a useful slider range, so that's not a drift case.
  useEffect(() => {
    if (!activeModelEntry) return;
    if (hasModelMax || hasProviderCap) return;
    if (missingMaxDurationRef.current.has(activeModelEntry.id)) return;
    missingMaxDurationRef.current.add(activeModelEntry.id);
    console.warn(
      `[VideoStudio] Model "${activeModelEntry.id}" has no maxDurationSec and no providerCaps entry; using default 5s slider range.`,
    );
  }, [activeModelEntry, hasModelMax, hasProviderCap]);

  // Clamp `duration` to the effective max whenever the model (or provider cap)
  // changes. Keeps the slider honest and the request payload within
  // provider-accepted bounds. Drops to the new effective max if the current
  // value now exceeds it — the slider has no way to display out-of-range
  // values without snapping, and silently keeping a stale value would
  // contradict the label.
  useEffect(() => {
    if (duration > effectiveMaxDuration) {
      setDuration(effectiveMaxDuration);
    }
  }, [selectedModel, effectiveMaxDuration, duration]);

  const sliderMin = 1;
  const sliderMax = effectiveMaxDuration;
  const showDurationSlider = subTab !== 'editor' && subTab !== 'animate';
  
    // When the duration slider is hidden (editor/animate), the client always
    // sends `duration: 5` to the server. The slider state is stale — use the
    // actual sent value so the button label matches what the server will bill.
    const totalVideoCredits = activeCreditsPerSec * (showDurationSlider ? duration : 5);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (subTab === 'animate') {
      if (!characterImageUrl.trim()) {
        toast({
          title: 'Character Image Required',
          description: 'Provide a publicly accessible URL for the character image you want to animate.',
          variant: 'destructive',
        });
        return;
      }
      if (!referenceMotionUrl.trim()) {
        toast({
          title: 'Reference Video Required',
          description: 'Provide a publicly accessible MP4 URL whose actions will be transferred onto the character.',
          variant: 'destructive',
        });
        return;
      }
    } else if (!prompt.trim()) {
      toast({
        title: 'Prompt Required',
        description: 'Please describe the video scene or editing instruction.',
        variant: 'destructive',
      });
      return;
    }

    if (subTab === 'i2v' && !imageUrl.trim()) {
      toast({
        title: 'First Frame Image Required',
        description: 'Please provide a first-frame image URL for Image-to-Video generation.',
        variant: 'destructive',
      });
      return;
    }

    if (subTab === 'editor' && !inputVideoUrl.trim()) {
      toast({
        title: 'Source Video URL Required',
        description: 'Please provide a source video URL to edit.',
        variant: 'destructive',
      });
      return;
    }

    // Clear any prior failure the moment a fresh run starts so the inline
    // error region and toast never show stale state alongside a new spinner.
    setGenError(null);
    setLoading(true);

    // One AbortController per run so cancel tears down the in-flight fetch
    // (the route polls the upstream for minutes) and frees the loading state
    // without surfacing a misleading error.
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/studio/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: subTab === 'animate' ? 'Transfer actions and expressions from reference video to character image.' : prompt,
          model: selectedModel,
          cameraMotion: subTab === 'animate' ? 'Motion Transfer' : cameraMotion,
          aspectRatio: subTab === 'animate' ? '16:9' : aspectRatio,
          // 5s default matches the backend's `duration = 5` fallback so an
          // untouched slider leaves behavior exactly as before. The route
          // clamps per-provider (2-30s LLMAPI, 2-15s DashScope, 2-10s editors)
          // and ignores the field for editor/animate branches.
          duration: showDurationSlider ? duration : 5,
          imageUrl: subTab === 'animate' ? characterImageUrl.trim() : (imageUrl.trim() || undefined),
          videoUrl: subTab === 'animate' ? referenceMotionUrl.trim() : (inputVideoUrl.trim() || undefined),
          mode: subTab === 'animate' ? animateMode : undefined,
          referenceUrls: referenceUrl.trim() ? [referenceUrl.trim()] : undefined,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        await throwStudioError(res, 'Video synthesis failed');
      }

      const initialData = await res.json();
      let videoResult = initialData;

      // Handle async job queued response: poll /api/studio/video status endpoint
      if (initialData.status === 'queued' && initialData.taskId) {
        const { taskId, provider, model: resModel, duration: resDur } = initialData;
        // Thread the caller's tier through to the poll endpoint so the
        // server authenticates the status fetch with the SAME key the
        // create call used. Without this the poller would use a different
        // tier's key and never see the job ("stuck synthesizing forever").
        const tier = typeof initialData.tier === 'string' ? initialData.tier : '';
        dbg(`[VideoStudio] Async job queued: ${taskId} (${provider}, tier=${tier || 'unknown'}). Starting client status polling...`);

        // Hard ceiling on polling. A 5s interval × 96 attempts = 8 minutes,
        // which comfortably covers the longest documented render (premium
        // 4K models take up to ~8 min per the LLMAPI FAQ). After this we
        // surface a clear "timed out" error instead of looping forever —
        // the previous behaviour could spin for 161+ minutes with no UI
        // signal.
        const MAX_POLL_ATTEMPTS = 96;
        const POLL_INTERVAL_MS = 5000;
        let pollAttempts = 0;

        while (!controller.signal.aborted) {
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
          if (controller.signal.aborted) break;

          pollAttempts++;
          if (pollAttempts > MAX_POLL_ATTEMPTS) {
            throw new Error(
              `Video generation timed out after ${Math.round((MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS) / 60000)} minutes. The upstream provider may be overloaded — try again, or pick a faster model. (task ${taskId})`,
            );
          }

          const pollParams = new URLSearchParams({
            taskId,
            provider,
            model: resModel || selectedModel,
            duration: String(resDur || 5),
            prompt: prompt || '',
            cameraMotion: cameraMotion || '',
            aspectRatio: aspectRatio || '16:9',
            tier,
          });

          const pollRes = await fetch(`/api/studio/video?${pollParams.toString()}`, {
            signal: controller.signal,
          });

          if (pollRes.ok) {
            const pollData = await pollRes.json();
            if (pollData.status === 'completed' && pollData.videoUrl) {
              videoResult = pollData;
              break;
            } else if (pollData.status === 'failed') {
              throw new Error(pollData.error || 'Video generation failed.');
            }
            // status === 'in_progress' — keep polling up to MAX_POLL_ATTEMPTS.
          } else {
            // A 5xx/4xx from the poll endpoint means the server hit a real
            // problem (e.g. the LLMAPI key for this tier isn't configured, or
            // the upstream returned a hard error, or the user ran out of
            // credits mid-poll). Use the shared studio error resolver so the
            // catch block gets a structured `kind` (e.g. `insufficient_credits`
            // for 402) and the UI surfaces the right friendly message + action.
            await throwStudioError(pollRes, 'Video status check failed');
          }
        }
      }

      if (!videoResult || !videoResult.videoUrl) {
        if (controller.signal.aborted) return;
        throw new Error('Video generation did not return a valid video URL.');
      }

      const newRecord: VideoRecord = {
        id: `vid-${Date.now()}`,
        url: videoResult.videoUrl,
        prompt: subTab === 'animate' ? `Action-transfer from reference video onto character image` : (videoResult.prompt || prompt),
        model: videoResult.model || selectedModel,
        cameraMotion: videoResult.cameraMotion || cameraMotion,
        aspectRatio: videoResult.aspectRatio || aspectRatio,
        createdAt: videoResult.createdAt || new Date().toISOString(),
      };

      setCurrentVideo(newRecord);
      setHistory((prev) => [newRecord, ...prev]);
      toast({
        title: subTab === 'animate' ? 'Action-Transfer Animation Complete' : 'Video Generation Complete',
      });
    } catch (err: any) {
      // A user-initiated abort is not an error — surface a quiet confirmation.
      if (err?.name === 'AbortError' || controller.signal.aborted) {
        dbg('[VideoStudio] generation cancelled by user');
        toast({
          title: 'Generation cancelled',
          description: 'The request was stopped. Your prompt and settings are still here.',
        });
        return;
      }
      const apiErr = err as StudioApiError;
      if (apiErr && apiErr.kind) {
        setGenError(apiErr);
        toast({
          title: apiErr.title,
          description: apiErr.message,
          variant: 'destructive',
        });
        logError('[VideoStudio] generation failed', { kind: apiErr.kind, raw: apiErr.rawCode });
      } else {
        const resolved = resolveStudioError(undefined, err?.message, err);
        setGenError({ ...resolved, message: resolved.description, name: 'Error' } as StudioApiError);
        toast({
          title: resolved.title,
          description: resolved.description,
          variant: 'destructive',
        });
        logError('[VideoStudio] generation failed', err);
      }
    } finally {
      // Stale-closure guard: only clear loading if this run is still active.
      if (abortRef.current === controller) {
        abortRef.current = null;
        setLoading(false);
      }
    }
  };

  // User-initiated cancel for the multi-minute polling fetch.
  const handleCancel = () => {
    abortRef.current?.abort();
  };

  // One-tap retry from the inline error region.
  const handleRetry = () => {
    // handleGenerate expects a FormEvent; fabricate a minimal preventDefault.
    handleGenerate({ preventDefault() { /* no-op */ } } as unknown as React.FormEvent);
  };

  const samplePrompts = {
    t2v: [
      'Cinematic 4K FPV drone sweep across dramatic coastal cliffs as golden sunset light reflects on ocean waves',
      'Macro lens slow-motion camera pan of water droplets splashing onto an emerald green leaf',
      'Photorealistic wide-angle tracking shot of a vintage car driving along a scenic mountain highway',
      'Atmospheric 35mm film shot of a chef preparing gourmet dishes in a warm, rustic kitchen with soft morning light',
    ],
    i2v: [
      'Smoothly animate the subject walking forward while atmospheric morning fog gently rolls past',
      'Bring static water reflections to life with realistic, flowing ripples and gentle breeze motion',
      'Slow cinematic push-in zoom toward the central portrait with subtle depth-of-field movement',
      'Animate natural wind movement through foliage and gentle fabric swaying in the foreground',
    ],
    r2v: [
      'Synthesize a character walk-cycle using the subject from [Image 1] inside a modern glass architectural pavilion',
      'Blend the artistic cinematic lighting from [Image 1] with the camera movement of [Image 2]',
      'Recreate the background environment from reference images with fluid 60fps tracking motion',
    ],
    editor: [
      'Apply vibrant cinematic color grading and 35mm film grain effect to the entire clip',
      'Transform environmental background into a snowy mountain landscape while maintaining character motion',
      'Enhance lighting with warm golden-hour lens flare and dynamic contrast adjustments',
    ],
    animate: [
      'Transfer expressive facial movements and natural head nods from reference video onto character image',
      'Replicate fluid dance choreography onto the portrait image with precise limb tracking',
      'Map full-body walking motion from reference video while preserving character costume details',
    ],
  };

  const ST = 'h-4 w-4 shrink-0';
  const subTabsConfig: { id: SubTab; label: string; icon: React.ReactNode }[] = [
    { id: 't2v', label: 'Text to Video', icon: <Film className={ST} /> },
    { id: 'i2v', label: 'Image to Video', icon: <Icon name="image" className={ST} /> },
    { id: 'r2v', label: 'Reference Video', icon: <Icon name="layers" className={ST} /> },
    { id: 'editor', label: 'Video Editor', icon: <Scissors className={ST} /> },
    { id: 'animate', label: 'Animate from Video', icon: <Icon name="user" className={ST} /> },
  ];

  return (
    <StudioShell
      title="Video Generation & Editing Studio"
      description="Generate and edit videos from text, images, or existing footage."
      icon={Clapperboard}
      onClose={onClose}
    >
      <div className="relative w-full h-full flex-1 overflow-y-auto bg-slate-950 text-slate-100 font-body p-6">
        <div className="max-w-7xl mx-auto space-y-6">

          {/* Sub-Tab Navigation Header */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div className="flex items-center gap-1.5 bg-slate-900/90 p-1.5 rounded-xl border border-slate-800 overflow-x-auto w-full scrollbar-none shrink-0">
              {subTabsConfig.map((tab) => {
                const active = subTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleSubTabChange(tab.id)}
                    className={`flex items-center gap-2 px-3 sm:px-4 py-2 text-xs font-semibold rounded-lg transition-all shrink-0 whitespace-nowrap ${
                      active
                        ? 'bg-purple-600 text-white shadow-md shadow-purple-900/40 font-bold'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                    }`}
                  >
                    {tab.icon}
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

            {/* Left Controls Panel */}
            <div className="lg:col-span-4 space-y-6">
              <Card className="bg-slate-900/80 border-purple-500/20 backdrop-blur-xl p-5 rounded-2xl space-y-5 shadow-xl">
                <div>
                  <div className="flex items-center gap-2">
                    <Wand2 className="h-5 w-5 text-purple-400" />
                    <h2 className="text-sm font-semibold text-white tracking-wide">
                      {subTab === 't2v' && 'Text-to-Video Synthesis'}
                      {subTab === 'i2v' && 'Image-to-Video Animation'}
                      {subTab === 'r2v' && 'Multi-Reference Video Synthesis'}
                      {subTab === 'editor' && 'AI Video Editing Studio'}
                      {subTab === 'animate' && 'Action-Transfer Animation'}
                    </h2>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {subTab === 't2v' && 'Generate video clips directly from detailed scene prompts.'}
                    {subTab === 'i2v' && 'Animate a first-frame image into a high-motion video.'}
                    {subTab === 'r2v' && 'Synthesize scenes based on multi-image character references.'}
                    {subTab === 'editor' && 'Apply style transfer and subject modification to existing videos.'}
                    {subTab === 'animate' && 'Transfer actions and expressions from a reference video onto a character image.'}
                  </p>
                </div>

                <form onSubmit={handleGenerate} className="space-y-5">
                  {/* Model Selection */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                      <span>Model Engine</span>
                      <Badge variant="outline" className={`text-[10px] ${activeProviderInfo.color}`}>
                        {activeProviderInfo.label}
                      </Badge>
                    </label>
                    <select
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                      className="w-full h-9 px-3 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
                    >
                      {groupedModels.map((group) => {
                        const info = getProviderInfo(group.provider);
                        return (
                          <optgroup key={group.provider} label={`── ${info.label} ──`}>
                            {group.models.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.displayName}{m.creditsPerSec ? ` (${m.creditsPerSec}cr/s)` : ''}
                              </option>
                            ))}
                          </optgroup>
                        );
                      })}
                    </select>
                    {activeModelEntry?.description && (
                      <p className="text-[10px] text-slate-500 leading-relaxed">{activeModelEntry.description}</p>
                    )}
                  </div>

                  {boundAudioUrl && (
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-purple-950/40 border border-purple-500/30 text-xs">
                      <div className="flex items-center gap-2 text-purple-300">
                        <Music className="h-4 w-4 text-purple-400 animate-pulse" />
                        <span className="font-mono text-[11px]">Audio Track Bound from Audio Studio</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          localStorage.removeItem('cybrdeck_cross_studio_audio_url');
                          setBoundAudioUrl(null);
                        }}
                        className="text-[10px] text-purple-400 hover:text-white font-mono underline"
                      >
                        Unbind
                      </button>
                    </div>
                  )}

                  {/* Duration Slider — hidden for editor/animate (output length
                      is governed by the source / reference media). Max is the
                      effective cap = min(model.maxDurationSec, providerCap), so
                      the user never picks a value the upstream will reject. */}
                  {showDurationSlider && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <Icon name="clock" className="h-3.5 w-3.5 text-purple-400" />
                          Duration
                        </span>
                        <Badge variant="outline" className="text-[10px] border-purple-500/30 text-purple-300 bg-purple-950/30 font-mono">
                          {duration}s
                        </Badge>
                      </label>
                      <input
                        type="range"
                        min={sliderMin}
                        max={sliderMax}
                        step={1}
                        value={duration}
                        onChange={(e) => setDuration(Number(e.target.value))}
                        className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                        aria-label="Video duration in seconds"
                      />
                      <p className="text-[10px] text-slate-500">
                        max {sliderMax}s · 1s step
                        {/* The binding-constraint suffix only appears when the
                            upstream cap is the actual ceiling. When the model's
                            own maxDurationSec is lower than the provider cap,
                            saying "provider allows up to Xs" is misleading —
                            the slider can never reach that value because the
                            model rejects it. In that case we surface the model
                            name so the user knows what's clipping the range. */}
                        {providerCapIsBinding && (
                          <span className="text-amber-400/80"> · (provider limit)</span>
                        )}
                        {!providerCapIsBinding && hasModelMax && hasProviderCap && (
                          <span className="text-amber-400/80">
                            {' · (model limit — '}
                            {activeModelEntry?.displayName ?? 'this model'}
                            {')'}
                          </span>
                        )}
                      </p>
                    </div>
                  )}

                  {/* Animate: Character Image Input */}
                  {subTab === 'animate' && (
                    <>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                          <Icon name="user" className="h-3.5 w-3.5 text-brand-400" />
                          Character Image URL <span className="text-red-400">*</span>
                        </label>
                        <Input
                          value={characterImageUrl}
                          onChange={(e) => setCharacterImageUrl(e.target.value)}
                          placeholder="https://example.com/character.png"
                          className="h-9 bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-500"
                        />
                        <p className="text-[10px] text-slate-500">
                          Publicly accessible JPG / PNG / WEBP. Subject should occupy a clear portion of the frame.
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                          <Video className="h-3.5 w-3.5 text-amber-400" />
                          Reference Video URL <span className="text-red-400">*</span>
                        </label>
                        <Input
                          value={referenceMotionUrl}
                          onChange={(e) => setReferenceMotionUrl(e.target.value)}
                          placeholder="https://example.com/motion.mp4"
                          className="h-9 bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-500"
                        />
                        <p className="text-[10px] text-slate-500">
                          Publicly accessible MP4, 2–30 seconds. Higher resolution & frame rate yields better action transfer.
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                          <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                          Service Mode
                        </label>
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            type="button"
                            onClick={() => setAnimateMode('wan-std')}
                            className={`h-9 text-[11px] font-medium rounded-lg border transition-all ${
                              animateMode === 'wan-std'
                                ? 'border-purple-500 bg-purple-900/50 text-white shadow-md'
                                : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            <div className="flex flex-col items-start px-2 py-0.5">
                              <span className="text-xs font-semibold">Standard</span>
                              <span className="text-[9px] opacity-70">Faster · Lower cost</span>
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => setAnimateMode('wan-pro')}
                            className={`h-9 text-[11px] font-medium rounded-lg border transition-all ${
                              animateMode === 'wan-pro'
                                ? 'border-purple-500 bg-purple-900/50 text-white shadow-md'
                                : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            <div className="flex flex-col items-start px-2 py-0.5">
                              <span className="text-xs font-semibold">Professional</span>
                              <span className="text-[9px] opacity-70">Smoother · Higher cost</span>
                            </div>
                          </button>
                        </div>
                      </div>

                      <div className="rounded-lg bg-slate-950/60 border border-slate-800/80 p-3 space-y-1.5">
                        <div className="flex items-start gap-1.5">
                          <Icon name="info" className="h-3.5 w-3.5 text-brand-400 mt-0.5 shrink-0" />
                          <p className="text-[10px] text-slate-400 leading-relaxed">
                            Action transfer takes a few minutes. The character image is the _target_, the reference video provides the _motion_. Keep body proportions consistent for best results.
                          </p>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Video Editor Source Video Input */}
                  {subTab === 'editor' && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                        <Video className="h-3.5 w-3.5 text-purple-400" />
                        Source Video URL <span className="text-red-400">*</span>
                      </label>
                      <Input
                        value={inputVideoUrl}
                        onChange={(e) => setInputVideoUrl(e.target.value)}
                        placeholder="https://example.com/video.mp4"
                        className="h-9 bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-500"
                      />
                      <p className="text-[10px] text-slate-500">Publicly accessible MP4 URL (3-60 seconds duration).</p>
                    </div>
                  )}

                  {/* Image-to-Video First Frame Input */}
                  {subTab === 'i2v' && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                        <Icon name="image" className="h-3.5 w-3.5 text-brand-400" />
                        First Frame Image URL <span className="text-red-400">*</span>
                      </label>
                      <Input
                        value={imageUrl}
                        onChange={(e) => setImageUrl(e.target.value)}
                        placeholder="https://example.com/first_frame.png"
                        className="h-9 bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-500"
                      />
                    </div>
                  )}

                  {/* Reference Image Input for Reference & Editor modes */}
                  {(subTab === 'r2v' || subTab === 'editor') && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                        <Icon name="layers" className="h-3.5 w-3.5 text-amber-400" />
                        Reference Image URL (Optional)
                      </label>
                      <Input
                        value={referenceUrl}
                        onChange={(e) => setReferenceUrl(e.target.value)}
                        placeholder="https://example.com/reference.png"
                        className="h-9 bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-500"
                      />
                      <p className="text-[10px] text-slate-500">
                        {subTab === 'r2v' ? 'Reference character/style image URL. Tag [Image 1] in prompt.' : 'Reference costume or style image URL.'}
                      </p>
                    </div>
                  )}

                  {/* Prompt Textarea — hidden for animate (motion comes from the video) */}
                  {subTab !== 'animate' && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-300">Prompt / Editing Instruction</label>
                      <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder={
                          subTab === 'editor'
                            ? 'Describe the edits or style transfer (e.g., Make character wear the striped sweater from reference image)...'
                            : 'Describe your scene in detail...'
                        }
                        className="w-full h-24 p-3 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500 resize-none"
                      />
                      {/* Sample Prompt Chips */}
                      <div className="space-y-1 pt-1">
                        <span className="text-[10px] font-mono text-slate-400">Prompt Presets:</span>
                        <div className="flex flex-wrap gap-1">
                          {samplePrompts[subTab].map((sp, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => setPrompt(sp)}
                              className="text-[10px] bg-purple-950/40 hover:bg-purple-900/50 border border-purple-500/20 text-purple-300 px-2 py-0.5 rounded-md text-left truncate max-w-full"
                            >
                              + {sp.slice(0, 32)}...
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Sample chips for animate tab */}
                  {subTab === 'animate' && (
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-mono text-slate-400">Use-case Presets:</span>
                      <div className="flex flex-col gap-1.5">
                        {samplePrompts.animate.map((sp, idx) => (
                          <div
                            key={idx}
                            className="text-[10px] bg-purple-950/30 border border-purple-500/20 text-purple-300 px-2 py-1.5 rounded-md leading-snug"
                          >
                            {sp}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Aspect Ratio - hidden for animate and i2v (driven by the input) */}
                  {subTab !== 'i2v' && subTab !== 'animate' && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                        <Icon name="monitor" className="h-3.5 w-3.5 text-amber-400" />
                        Aspect Ratio
                      </label>
                      <div className="grid grid-cols-3 gap-1.5">
                        {[
                          { label: '16:9 Widescreen', val: '16:9' },
                          { label: '9:16 Vertical', val: '9:16' },
                          { label: '1:1 Square', val: '1:1' },
                        ].map((ar) => (
                          <button
                            key={ar.val}
                            type="button"
                            onClick={() => setAspectRatio(ar.val)}
                            className={`h-7 text-[11px] font-medium rounded-lg border transition-all ${
                              aspectRatio === ar.val
                                ? 'border-purple-500 bg-purple-900/50 text-white shadow-md'
                                : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {ar.val}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Camera Motion */}
                  {subTab === 't2v' && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                        <Icon name="camera" className="h-3.5 w-3.5 text-brand-400" />
                        Camera Motion Presets
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                        {['None / Custom', 'Static', 'Pan Left', 'Pan Right', 'Zoom In', 'Zoom Out', 'FPV Orbit'].map((motion) => (
                          <button
                            key={motion}
                            type="button"
                            onClick={() => setCameraMotion(motion)}
                            className={`h-7 text-[11px] font-medium rounded-lg border transition-all ${
                              cameraMotion === motion
                                ? 'border-purple-500 bg-purple-900/50 text-white shadow-md'
                                : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {motion}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Honest progress while the route polls the upstream for
                      minutes — aria-live so screen readers announce elapsed
                      time. The video route returns the clip all-at-once (no
                      determinate %), so the bar is indeterminate + elapsed. */}
                  {loading && (
                    <LoadingRegion
                      label={subTab === 'animate' ? 'Transferring actions…' : subTab === 'editor' ? 'Editing video…' : 'Synthesizing video…'}
                      elapsedLabel={elapsedLabel}
                    />
                  )}

                  {/* Action Submit + Cancel row */}
                  <div className="flex items-center gap-2">
                    <Button
                      type="submit"
                      disabled={loading}
                      className="flex-1 h-10 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold text-xs gap-2 rounded-xl shadow-lg disabled:opacity-60"
                    >
                      {loading ? <Icon name="loading" className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4 text-purple-200" />}
                      {loading ? 'Processing Video...' : subTab === 'animate' ? `Transfer Actions (${totalVideoCredits.toLocaleString()} Credits)` : subTab === 'editor' ? `Edit Video (${totalVideoCredits.toLocaleString()} Credits)` : `Generate Video (${totalVideoCredits.toLocaleString()} Credits)`}
                    </Button>
                    {loading && <CancelButton onCancel={handleCancel} className="h-10" />}
                  </div>
                </form>
              </Card>
            </div>

            {/* Right Video Preview & History Area */}
            <div className="lg:col-span-8 space-y-6">

              {/* Video Player Display */}
              <Card className="bg-slate-900/80 border-purple-500/20 backdrop-blur-xl p-6 rounded-2xl shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                  <div className="flex items-center gap-2">
                    <Video className="h-4 w-4 text-purple-400" />
                    <h3 className="text-xs font-semibold text-white uppercase tracking-wider">Video Workspace Output</h3>
                  </div>
                  {currentVideo && (
                    <ModelUsedBadge model={currentVideo.model} detail={currentVideo.aspectRatio} />
                  )}
                </div>

                {/* Loading state inside the output card — a skeleton-style
                    placeholder with aria-live so the wait is honest while the
                    upstream polls, instead of a frozen empty frame. */}
                {loading ? (
                  <div className="aspect-video w-full rounded-xl bg-slate-950 border border-slate-800 flex flex-col items-center justify-center text-center p-6 space-y-3">
                    <Icon name="loading" className="h-6 w-6 text-purple-400 animate-spin" aria-hidden="true" />
                    <p className="text-xs text-slate-300 font-medium">
                      {subTab === 'animate' ? 'Transferring actions onto your character…' : subTab === 'editor' ? 'Applying edits to your video…' : 'Synthesizing your clip…'}
                    </p>
                    <p className="text-[10px] text-slate-500 font-mono" aria-live="polite">
                      Elapsed {elapsedLabel} · long jobs can take a few minutes
                    </p>
                  </div>
                ) : currentVideo ? (
                  <div className="space-y-4">
                    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black border border-slate-800 flex items-center justify-center shadow-inner group">
                      <video
                        src={currentVideo.url}
                        controls
                        autoPlay
                        loop
                        muted
                        className="w-full h-full object-contain"
                      />
                    </div>

                    <div className="flex items-start justify-between gap-4 p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl">
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-slate-200 leading-snug">{currentVideo.prompt}</p>
                        <p className="text-[10px] text-slate-500 font-mono">Synthesized at {new Date(currentVideo.createdAt).toLocaleTimeString()}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDownloadVideo(currentVideo)}
                        className="h-8 text-xs border-purple-500/40 text-purple-300 hover:bg-purple-900/30 gap-1.5"
                      >
                        <Icon name="download" className="h-3.5 w-3.5" /> Download
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="aspect-video w-full rounded-xl bg-slate-950 border border-dashed border-slate-800 flex flex-col items-center justify-center text-center p-6 space-y-3">
                    <div className="h-12 w-12 rounded-full bg-purple-950/40 border border-purple-500/20 flex items-center justify-center text-purple-400">
                      <Icon name="play" className="h-6 w-6" />
                    </div>
                    <p className="text-xs text-slate-400 max-w-xs">Select your parameters and click Generate Video to synthesize high-definition clips.</p>
                  </div>
                )}
              </Card>

              {/* Inline error region — per-code friendly message + Retry, so a
                  multi-minute failure isn't only a vanishing toast. */}
              {genError && !loading && (
                <ErrorRegion
                  title={genError.title}
                  description={genError.message}
                  onRetry={handleRetry}
                />
              )}

              {/* History Feed */}
              {history.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <Icon name="layers" className="h-4 w-4 text-purple-400" />
                    Recent Video Generations ({history.length})
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {history.map((item) => (
                      <Card
                        key={item.id}
                        onClick={() => setCurrentVideo(item)}
                        className="bg-slate-900/60 hover:bg-slate-900 border-slate-800 hover:border-purple-500/40 transition-all p-3 rounded-xl cursor-pointer space-y-2"
                      >
                        <div className="relative aspect-video w-full rounded-lg bg-black overflow-hidden border border-slate-800">
                          <video src={item.url} className="w-full h-full object-cover opacity-80" />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-transparent transition-colors">
                            <Icon name="play" className="h-6 w-6 text-white drop-shadow-md" />
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-300 line-clamp-2">{item.prompt}</p>
                        <ModelUsedBadge model={item.model} detail={item.aspectRatio} />
                      </Card>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      </div>
    </StudioShell>
  );
}
