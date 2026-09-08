'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Icon } from '@/components/ui/icon';
import { StudioShell } from './StudioShell';
import { useUser } from '@/firebase/auth/use-user';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Wand2, Paintbrush, ImagePlus, Split, RotateCw } from 'lucide-react';
import imageModelsData from '@/data/studio/image-models.json';
import { cn } from '@/lib/utils';
import { STUDIO_COSTS } from '@/lib/playground/tier-config';
import { ImageAnnotatorCanvas } from './ImageAnnotatorCanvas';
import { SourceImage } from './SourceImage';
import { ModelUsedBadge, CancelButton, LoadingRegion, ErrorRegion } from './StudioShared';
import { throwStudioError, resolveStudioError, type StudioApiError } from '@/lib/studio/studio-errors';
import { useElapsed } from '@/lib/studio/use-elapsed';
import { dbg, error as logError } from '@/lib/log';

/**
 * Compress an image data URL so the JSON body stays well under the
 * server's body-size limit. High-res phone photos (5–12 MP) easily
 * produce 5–15 MB base64 payloads that trigger a 413 before the route
 * handler ever runs. We cap at ~1.5 MB (leaving headroom for the rest
 * of the JSON envelope) by re-encoding as JPEG at reduced quality and,
 * if necessary, downscaling the longest edge.
 */
const MAX_REFERENCE_BYTES = 1.5 * 1024 * 1024; // 1.5 MB

async function compressImageDataUrl(dataUrl: string, maxBytes = MAX_REFERENCE_BYTES): Promise<string> {
  // Fast path: already small enough.
  // base64 inflates ~33% over raw bytes; estimate raw size from the string length.
  const estimatedBytes = Math.ceil((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75);
  if (estimatedBytes <= maxBytes) return dataUrl;

  return new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      // Iteratively shrink + lower quality until under budget (max 3 passes).
      const passes = [
        { quality: 0.7, scale: 1 },
        { quality: 0.55, scale: 0.75 },
        { quality: 0.4, scale: 0.5 },
      ];
      for (const pass of passes) {
        const w = Math.round(width * pass.scale);
        const h = Math.round(height * pass.scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(dataUrl); return; }
        ctx.drawImage(img, 0, 0, w, h);
        const result = canvas.toDataURL('image/jpeg', pass.quality);
        const resultBytes = Math.ceil((result.length - result.indexOf(',') - 1) * 0.75);
        if (resultBytes <= maxBytes) {
          resolve(result);
          return;
        }
      }
      // Last resort: return the smallest we managed.
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * 0.5);
      canvas.height = Math.round(height * 0.5);
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(dataUrl); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.35));
    };
    img.onerror = () => resolve(dataUrl); // bail silently
    img.src = dataUrl;
  });
}

interface ImageModel {
  id: string;
  displayName: string;
  provider: string;
  apiVersionId: string;
  description: string;
  capabilities?: string[];
  credits?: number;
}

interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  model: string;
  timestamp: number;
  negativePrompt?: string;
  aspectRatio?: string;
  seed?: number;
  sourceImageUrl?: string;
}

interface ImageStudioProps {
  onClose: () => void;
}

export type StudioMode = 'generate' | 'edit';

// Self-contained result card — owns its own error state so ImageStudio never
// re-renders due to image load failures (no parent state mutation on onError).
function ResultCard({
  img,
  onExpand,
  onDownload,
  onCopyLink,
  onSendToEdit,
  onRegenerate,
  copiedId,
}: {
  img: GeneratedImage;
  onExpand: () => void;
  onDownload: () => void;
  onCopyLink: () => void;
  onSendToEdit: () => void;
  onRegenerate: () => void;
  copiedId: string | null;
}) {
  const [isFailed, setIsFailed] = useState(false);
  return (
    <div
      className="group relative border border-white/15 rounded-2xl bg-zinc-900/80 overflow-hidden shadow-2xl cursor-pointer transition-all hover:border-brand-500/50 min-h-[200px] flex flex-col"
      onClick={() => !isFailed && onExpand()}
    >
      <SourceImage
        src={img.url}
        alt={img.prompt}
        debugId={`image-studio.result.${img.id}`}
        className="w-full h-auto object-contain max-h-[500px] bg-black/40 transition-transform duration-300 group-hover:scale-[1.01] flex-1"
        onError={() => setIsFailed(true)}
      />
      {/* Failure overlay — honest state with a Retry, not a misleading
          placeholder. Pairs with the lightbox detail bar that already shows
          the model that produced this artifact. */}
      {isFailed && (
        <div
          role="alert"
          aria-live="assertive"
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-zinc-950/90 p-4 text-center"
          onClick={(e) => e.stopPropagation()}
        >
          <Icon name="triangle-warning" className="h-6 w-6 text-rose-400" aria-hidden="true" />
          <p className="text-xs font-semibold text-rose-200">Image failed to load</p>
          <p className="text-[10px] text-zinc-400 max-w-[220px]">
            The URL may have expired or be blocked. Regenerate, or copy the link to retry.
          </p>
          <div className="flex items-center gap-2 mt-1">
            <button
              type="button"
              onClick={onRegenerate}
              className="h-7 px-3 rounded-md border border-brand-500/50 bg-brand-950/60 text-[11px] font-semibold text-brand-200 hover:bg-brand-900/50 transition-colors"
            >
              <RotateCw className="h-3 w-3 inline mr-1" /> Regenerate
            </button>
            <button
              type="button"
              onClick={onCopyLink}
              className="h-7 px-3 rounded-md border border-white/20 bg-white/5 text-[11px] font-semibold text-zinc-200 hover:bg-white/10 transition-colors"
            >
              Copy link
            </button>
          </div>
        </div>
      )}
      {!isFailed && (
        <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <button type="button" onClick={(e) => { e.stopPropagation(); onExpand(); }} className="h-10 w-10 bg-zinc-900 text-white border border-white/20 rounded-xl flex items-center justify-center hover:bg-black transition-colors" title="Expand Image">
            <Icon name="magnifying-glass-plus" className="h-4 w-4" />
          </button>
          <button type="button" onClick={(e) => { e.stopPropagation(); onDownload(); }} className="h-10 w-10 bg-zinc-900 text-white border border-white/20 rounded-xl flex items-center justify-center hover:bg-black transition-colors" title="Download Image">
            <Icon name="download" className="h-4 w-4" />
          </button>
          <button type="button" onClick={(e) => { e.stopPropagation(); onCopyLink(); }} className="h-10 w-10 bg-zinc-900 text-white border border-white/20 rounded-xl flex items-center justify-center hover:bg-black transition-colors" title="Copy Link">
            {copiedId === img.id ? <Icon name="check" className="h-4 w-4 text-emerald-400" /> : <Icon name="copy" className="h-4 w-4" />}
          </button>
          <button type="button" onClick={(e) => { e.stopPropagation(); onSendToEdit(); }} className="h-10 px-3 bg-brand-500 text-black font-semibold rounded-xl flex items-center gap-1.5 text-xs hover:bg-brand-400 transition-colors shadow-lg" title="Edit this Image">
            <Paintbrush className="h-3.5 w-3.5" /> Edit
          </button>
        </div>
      )}
      {/* Result footer — the model that produced this artifact is always
          visible (recognition over recall), plus the aspect ratio. Keeps the
          five studios visually consistent via the shared ModelUsedBadge. */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-white/10 bg-zinc-950/60">
        <ModelUsedBadge model={img.model} detail={img.aspectRatio} />
        {img.seed != null && (
          <span className="font-mono text-[10px] text-zinc-500">seed {img.seed}</span>
        )}
      </div>
    </div>
  );
}

const IMAGE_MODEL_BRANDS = ['Z-Image', 'Wan', 'Qwen Image', 'Qwen Image Edit', 'Gemini', 'Zhipu / CogView'] as const;
type ImageModelBrand = typeof IMAGE_MODEL_BRANDS[number];

// Derive a brand label from the model id. The "provider" field alone isn't
// granular enough -- Alibaba ships four distinct product lines, so we look at
// the id prefix. Group order is defined by IMAGE_MODEL_BRANDS above.
function getImageModelBrand(model: ImageModel): ImageModelBrand {
  const id = model.id.toLowerCase();
  if (id.startsWith('z-image')) return 'Z-Image';
  if (id.startsWith('wan') || id.startsWith('wanxiang')) return 'Wan';
  if (id.startsWith('qwen-image-edit')) return 'Qwen Image Edit';
  if (id.startsWith('qwen-image')) return 'Qwen Image';
  if (id.startsWith('gemini')) return 'Gemini';
  return 'Zhipu / CogView';
}

const ASPECT_RATIOS = [
  { label: '1:1 Square', value: '1024x1024' },
  { label: '16:9 Landscape', value: '1024x576' },
  { label: '9:16 Portrait', value: '576x1024' },
  { label: '4:3 Classic', value: '1024x768' },
  { label: '2:3 Photo', value: '768x1024' }
] as const;

const STYLE_PRESETS = [
  { label: 'None', value: '' },
  { label: 'Photorealistic', value: 'photorealistic, highly detailed, 8k resolution, cinematic lighting' },
  { label: 'Cinematic', value: 'cinematic still, dramatic lighting, shallow depth of field, color graded' },
  { label: 'Digital Art', value: 'digital art, vibrant colors, detailed illustration, concept art' },
  { label: 'Anime', value: 'anime style, cell shaded, dynamic composition, colorful' },
  { label: 'Watercolor', value: 'watercolor painting, soft washes, textured paper, artistic' },
  { label: 'Neon Punk', value: 'futuristic neon lighting, glowing circuitry, high contrast studio shot' }
] as const;

export interface StyleTemplate {
  label: string;
  value: string;
  bg: string;
  border: string;
  img?: string;
}

export const STYLE_TEMPLATES: StyleTemplate[] = [
  { label: 'Monochrome', value: 'monochrome black and white, fine art photography, high contrast, dramatic shadows', bg: 'from-zinc-900 via-neutral-900 to-black', border: 'border-zinc-700', img: '/studio/templates/monochrome.png' },
  { label: 'Color block', value: 'vivid color block composition, bold pastel walls, minimal architectural aesthetic', bg: 'from-teal-900 via-pink-900 to-amber-900', border: 'border-pink-500/40', img: '/studio/templates/color_block.png' },
  { label: 'Runway', value: 'high fashion editorial runway portrait, studio key light, sleek haute couture', bg: 'from-slate-900 via-indigo-950 to-neutral-950', border: 'border-indigo-500/40', img: '/studio/templates/runway.png' },
  { label: 'Technicolor', value: '1950s Technicolor film style, rich saturated hues, vintage cinematic glow', bg: 'from-yellow-900 via-brand-900 to-fuchsia-900', border: 'border-brand-400/40', img: '/studio/templates/technicolor.png' },
  { label: 'Gothic clay', value: 'stop-motion gothic claymation style, tactile clay texture, Tim Burton aesthetic', bg: 'from-stone-900 via-yellow-950 to-stone-950', border: 'border-amber-700/40', img: '/studio/templates/gothic_clay.png' },
  { label: 'Dynamite', value: 'epic action movie explosion background, intense fire glow, dramatic portrait lighting', bg: 'from-orange-950 via-red-950 to-black', border: 'border-orange-500/40', img: '/studio/templates/dynamite.png' },
  { label: 'Salon', value: 'elegant salon portraiture, soft ambient natural lighting, refined editorial mood', bg: 'from-amber-950 via-stone-900 to-neutral-950', border: 'border-amber-500/40', img: '/studio/templates/salon.png' },
  { label: 'Sketch', value: 'detailed pencil graphite architectural sketch, textured parchment paper, fine linework', bg: 'from-stone-800 via-amber-950 to-stone-900', border: 'border-stone-500/40', img: '/studio/templates/sketch.png' },
  { label: 'Cinematic', value: 'anamorphic 35mm cinematic still, atmospheric fog, moody volumetric lighting', bg: 'from-brand-950 via-slate-900 to-black', border: 'border-brand-600/40', img: '/studio/templates/cinematic.png' },
  { label: 'Steampunk', value: 'intricate steampunk aesthetic, polished brass gears, Victorian clockwork details', bg: 'from-amber-950 via-yellow-900 to-stone-950', border: 'border-amber-600/40', img: '/studio/templates/steampunk.png' },
  { label: 'Sunrise', value: 'golden hour sunrise landscape, warm lens flare, soft atmospheric glow', bg: 'from-amber-900 via-orange-950 to-indigo-950', border: 'border-amber-400/40', img: '/studio/templates/sunrise.png' },
  { label: 'Mythic fighter', value: 'epic mythic warrior portrait, dark fantasy digital painting, atmospheric mist', bg: 'from-blue-950 via-slate-900 to-neutral-950', border: 'border-blue-500/40', img: '/studio/templates/mythic_fighter.png' },
  { label: 'Surreal', value: 'surrealist dreamscape painting, Salvador Dali aesthetic, bizarre melting geometry', bg: 'from-sky-950 via-amber-950 to-teal-950', border: 'border-sky-400/40', img: '/studio/templates/surreal.png' },
  { label: 'Moody', value: 'chiaroscuro moody interior, dim warm lamplight, rain dripping down window pane', bg: 'from-zinc-950 via-slate-950 to-neutral-950', border: 'border-zinc-600/40', img: '/studio/templates/moody.png' },
  { label: 'Enamel pin', value: 'vector enamel pin badge, metallic gold outline, smooth glossy enamel colors', bg: 'from-emerald-950 via-teal-950 to-zinc-950', border: 'border-emerald-400/40', img: '/studio/templates/enamel_pin.png' },
  { label: 'Cyborg', value: 'futuristic cyborg cybernetic implants, glowing neon circuitry, sci-fi mechanical details', bg: 'from-rose-950 via-purple-950 to-black', border: 'border-rose-500/40', img: '/studio/templates/cyborg.png' },
  { label: 'Soft portrait', value: 'soft focus natural portrait, dreamy bokeh, warm window light', bg: 'from-stone-900 via-rose-950 to-zinc-950', border: 'border-rose-400/40', img: '/studio/templates/soft_portrait.png' },
  { label: 'Old cartoon', value: '1930s rubber hose vintage cartoon style, film grain, black and white ink drawing', bg: 'from-neutral-900 via-stone-900 to-black', border: 'border-neutral-500/40', img: '/studio/templates/old_cartoon.png' },
  { label: 'Oil painting', value: 'impressionist thick impasto oil painting on canvas, expressive brushstrokes', bg: 'from-yellow-950 via-amber-900 to-red-950', border: 'border-yellow-600/40', img: '/studio/templates/oil_painting.png' },
  { label: 'Light beams', value: 'dramatic god rays light beams, dark volumetric room, atmospheric dust particles', bg: 'from-brand-950 via-neutral-900 to-black', border: 'border-brand-400/40', img: '/studio/templates/light_beams.png' }
];

const SAMPLE_PROMPTS = [
  "Monochrome black and white, fine art portrait photography, high contrast, dramatic shadows",
  "Vivid color block composition, bold pastel walls, minimal architectural portrait",
  "High fashion editorial runway portrait, studio key light, sleek haute couture",
  "1950s Technicolor film style, rich saturated hues, vintage cinematic glow",
  "Stop-motion gothic claymation character portrait, tactile clay texture, Tim Burton aesthetic",
  "Epic action movie explosion background, intense fire glow, dramatic portrait lighting",
  "Elegant salon portraiture, soft ambient natural lighting, refined editorial model portrait",
  "Detailed pencil graphite architectural sketch, textured parchment paper, fine linework",
  "Anamorphic 35mm cinematic still portrait, atmospheric fog, moody volumetric lighting",
  "Intricate steampunk portrait, polished brass gears, Victorian clockwork details",
  "Golden hour sunrise landscape, warm lens flare, soft atmospheric glow",
  "Epic mythic warrior portrait, dark fantasy digital painting, atmospheric mist",
  "Surrealist dreamscape painting, Salvador Dali aesthetic, bizarre melting geometry",
  "Chiaroscuro moody interior room, dim warm lamplight, rain dripping down window pane",
  "Vector enamel pin badge of a mystical fox, metallic gold outline, glossy enamel finish",
  "Futuristic cyborg cybernetic implants, glowing neon circuitry, sci-fi mechanical details",
  "Soft focus natural portrait, dreamy bokeh background, warm sunset window light",
  "1930s rubber hose vintage cartoon character, film grain, black and white ink drawing",
  "Impressionist thick impasto oil painting on canvas, vibrant expressive brushstrokes",
  "Dramatic god rays light beams shining down through a dark cathedral, volumetric haze"
];

const EDIT_SAMPLE_PROMPTS = [
  "Convert the entire scene to a photorealistic claymation style",
  "Change the lighting to dusk golden hour with glowing neon cyan accents",
  "Replace the subject's background with a modern minimalist studio setting",
  "Transform into a high-detail cyberpunk digital painting",
  "Add dramatic volumetrical fog and stormy cinematic lighting"
];

export default function ImageStudio({ onClose }: ImageStudioProps) {
  const { user } = useUser();
  const { toast } = useToast();

  // Studio Mode State
  const [studioMode, setStudioMode] = useState<StudioMode>('generate');

  // Generation & Prompt Parameters
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [seed, setSeed] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState('wan2.7-image-pro');
  const [aspectRatio, setAspectRatio] = useState('1024x1024');
  const [isCustomSize, setIsCustomSize] = useState(false);
  const [customWidth, setCustomWidth] = useState('1024');
  const [customHeight, setCustomHeight] = useState('1024');
  const [stylePreset, setStylePreset] = useState('');
  const [numImages, setNumImages] = useState(1);

  // Layout & UI Toggle States
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showAspectMenu, setShowAspectMenu] = useState(false);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showStyleMenu, setShowStyleMenu] = useState(false);
  const [showRefPicker, setShowRefPicker] = useState(false);
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);
  const [isHistoryCollapsed, setIsHistoryCollapsed] = useState(false);
  const [compareMode, setCompareMode] = useState<'single' | 'split'>('single');

  // Generation Output & History
  const [generating, setGenerating] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [previewImage, setPreviewImage] = useState<GeneratedImage | null>(null);
  const [results, setResults] = useState<GeneratedImage[]>([]);
  const [history, setHistory] = useState<GeneratedImage[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Cancel + honest-progress state for long-running generation.
  // The AbortController lets the user bail out of a multi-minute / multi-image
  // batch; `genError` surfaces a per-code friendly failure inline above the
  // prompt bar in addition to the toast, so screen-reader users and quick
  // dismissers still see what went wrong + a Retry.
  const abortRef = useRef<AbortController | null>(null);
  const [genError, setGenError] = useState<StudioApiError | null>(null);
  // Total images requested for the active run — drives "Generating N of M…".
  const [batchTotal, setBatchTotal] = useState(1);
  const { label: elapsedLabel } = useElapsed(generating);

  // Automatically default guest users to z-image-turbo budget model
  useEffect(() => {
    if (!user && !['z-image-turbo', 'wan2.6-t2i'].includes(selectedModel)) {
      setSelectedModel('z-image-turbo');
    }
  }, [user, selectedModel]);

  // Region Crop / Annotation State
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [activeRegionCrop, setActiveRegionCrop] = useState<{ url: string; bounds: { x: number; y: number; width: number; height: number } } | null>(null);

  // Wan 2.7 Interactive Editing & Reference Media State
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [bboxList, setBboxList] = useState<number[][][]>([]);
  const [enableSequential, setEnableSequential] = useState(false);
  const [bboxAnnotatingIndex, setBboxAnnotatingIndex] = useState<number | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter available models based on current mode
  const availableModels = (imageModelsData as ImageModel[]).filter(m => {
    const caps = m.capabilities || [];
    if (studioMode === 'edit') {
      return caps.includes('imageEdit');
    }
    return caps.includes('t2i');
  });

  // Bucket filtered models by brand for the dropdown. Within each brand we
  // preserve the original JSON order so model additions stay predictable.
  const groupedModels = useMemo(() => {
    const buckets = new Map<ImageModelBrand, ImageModel[]>();
    for (const brand of IMAGE_MODEL_BRANDS) buckets.set(brand, []);
    for (const model of availableModels) {
      const brand = getImageModelBrand(model);
      buckets.get(brand)?.push(model);
    }
    // Only return brands that actually have models in the current mode filter.
    return IMAGE_MODEL_BRANDS
      .map((brand) => ({ brand, models: buckets.get(brand) ?? [] }))
      .filter((g) => g.models.length > 0);
  }, [availableModels]);

  // Click-outside / Escape to close the model dropdown (matches showAspectMenu UX).
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const styleMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showModelMenu && !showStyleMenu) return;
    const onDown = (e: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
        setShowModelMenu(false);
      }
      if (styleMenuRef.current && !styleMenuRef.current.contains(e.target as Node)) {
        setShowStyleMenu(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowModelMenu(false);
        setShowStyleMenu(false);
      }
    };
    // 'click' (not 'mousedown') so a row's onClick fires before we close.
    document.addEventListener('click', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [showModelMenu, showStyleMenu]);

  // Abort any in-flight generation if the studio unmounts mid-run so the
  // fetch promise never resolves into an unmounted component (avoid the
  // classic setState-on-unmounted leak + a dangling loading flag).
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  const selectedModelData = (imageModelsData as ImageModel[]).find(m => m.id === selectedModel || m.apiVersionId === selectedModel);
  const selectedModelDisplayName = selectedModelData?.displayName ?? selectedModel;
  const selectedModelBrand = selectedModelData ? getImageModelBrand(selectedModelData) : null;
  const modelCreditCost = (selectedModelData?.credits ?? STUDIO_COSTS.image) * numImages;

  // Capability-driven feature flags from selected model
  const caps = selectedModelData?.capabilities || [];
  const canImageEdit = caps.includes('imageEdit');
  const canMultiRef = caps.includes('multiRef');
  const canBbox = caps.includes('bbox');
  const canImageSet = caps.includes('imageSet');
  const canNegativePrompt = caps.includes('negativePrompt');

  // Handle Mode Switch
  const handleModeChange = (mode: StudioMode) => {
    setStudioMode(mode);
    if (mode === 'edit') {
      // If current model doesn't support image editing, switch to the
      // first edit-capable model in the registry. (`qwen-image-edit`
      // is the cheapest imageEdit tier; the user can pick a higher
      // tier in the dropdown.) The earlier `'wan2.6-image'` literal
      // is not in the registry — the route returned
      // `400 Invalid image model 'wan2.6-image'`.
      if (!canImageEdit) {
        const firstEditModel = (imageModelsData as ImageModel[]).find(
          (m) => Array.isArray(m.capabilities) && m.capabilities.includes('imageEdit'),
        );
        if (firstEditModel) setSelectedModel(firstEditModel.apiVersionId);
      }
    } else {
      // If current model doesn't support t2i, switch to the first
      // t2i-capable model. (`wan2.7-image-pro` is fine — it does
      // exist in the registry.)
      if (!caps.includes('t2i')) {
        setSelectedModel('wan2.7-image-pro');
      }
    }
  };

  // Ensure selected model is always valid for the active mode. The dep
  // array has to include `selectedModel` and `availableModels` — the
  // earlier `[studioMode]`-only version missed the case where the
  // model was set to an id that does not exist in the registry (e.g.
  // `wan2.6-image`, which used to be the default in
  // `handleSendToEdit`). On the first click the rescue fired because
  // `studioMode` changed; on the second click the effect never re-ran
  // and the bogus id stayed, so the route returned
  // `400 Invalid image model 'wan2.6-image'` and the user saw
  // `kind: 'unknown', raw: 'Invalid image model …'`.
  useEffect(() => {
    const isModelValid = availableModels.some(m => m.apiVersionId === selectedModel);
    if (!isModelValid && availableModels.length > 0) {
      setSelectedModel(availableModels[0].apiVersionId);
    }
  }, [studioMode, selectedModel, availableModels]);

  // Load history from localStorage on mount & clean up any corrupted truncated strings
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem('__cd_studio_image_history');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            const validItems = parsed.filter((img: GeneratedImage) => {
              if (!img || !img.url) return false;
              if (img.url.startsWith('data:image/') && img.url.length < 200) return false;
              return true;
            });
            setHistory(validItems);
          }
        } catch (e) {
          console.error('Failed to load image history', e);
        }
      }
    }
  }, []);

  // Save history to localStorage
  const saveHistory = (updated: GeneratedImage[]) => {
    setHistory(updated);
    if (typeof window !== 'undefined') {
      for (const count of [15, 8, 4, 2]) {
        try {
          const slice = updated.slice(0, count);
          window.localStorage.setItem('__cd_studio_image_history', JSON.stringify(slice));
          break;
        } catch (e) {
          // QuotaExceededError - retry with fewer items
        }
      }
    }
  };

  const clearHistory = () => {
    setHistory([]);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('__cd_studio_image_history');
    }
    toast({
      title: 'History Cleared',
      description: 'Image creation history has been reset.',
    });
  };

  const handlePickSample = () => {
    const pool = studioMode === 'edit' ? EDIT_SAMPLE_PROMPTS : SAMPLE_PROMPTS;
    const randomPrompt = pool[Math.floor(Math.random() * pool.length)];
    setPrompt(randomPrompt);
  };

  const handleRandomizeSeed = () => {
    setSeed(Math.floor(Math.random() * 99999999).toString());
  };

  const handleEnhancePrompt = () => {
    if (!prompt.trim()) return;
    setEnhancing(true);
    setTimeout(() => {
      const modifiers = [
        'hyperrealistic studio lighting',
        '8k resolution render',
        'volumetric cinematic shadows',
        'intricate fine details',
        'photorealistic texture'
      ];
      const added = modifiers.slice(0, 3).join(', ');
      setPrompt(`${prompt.trim()}, ${added}`);
      setEnhancing(false);
      toast({
        title: 'Prompt Magic Applied',
        description: 'Enhanced prompt with cinematic modifiers.',
      });
    }, 600);
  };

  // Add source/reference image from file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) continue;

      const reader = new FileReader();
      reader.onload = async (event) => {
        const raw = event.target?.result as string;
        if (!raw) return;
        // Compress large uploads (phone photos can be 5–15 MB base64)
        // so the JSON body stays under the server's size limit.
        const dataUrl = await compressImageDataUrl(raw);
        if (studioMode === 'edit' && !canMultiRef) {
          setReferenceImages([dataUrl]);
          setBboxList([[]]);
        } else {
          setReferenceImages(prev => [...prev, dataUrl]);
          setBboxList(prev => [...prev, []]);
        }
        toast({
          title: 'Image Attached',
          description: dataUrl.length < raw.length
            ? 'Compressed and loaded into reference panel.'
            : 'Loaded source image into reference panel.',
        });
      };
      reader.readAsDataURL(file);
    }
  };

  // Add reference image from URL
  const handleAddUrlImage = () => {
    if (!urlInput.trim()) return;
    if (!urlInput.startsWith('http') && !urlInput.startsWith('data:image/')) {
      toast({
        title: 'Invalid URL',
        description: 'Please enter a valid HTTP/HTTPS or Base64 image URL.',
        variant: 'destructive',
      });
      return;
    }
    if (studioMode === 'edit' && !canMultiRef) {
      setReferenceImages([urlInput.trim()]);
      setBboxList([[]]);
    } else {
      setReferenceImages(prev => [...prev, urlInput.trim()]);
      setBboxList(prev => [...prev, []]);
    }
    setUrlInput('');
    toast({
      title: 'Image Attached',
      description: 'Loaded reference image URL.',
    });
  };

  const handleRemix = (img: GeneratedImage) => {
    setPrompt(img.prompt);
    if (img.aspectRatio) setAspectRatio(img.aspectRatio);
    if (img.negativePrompt) setNegativePrompt(img.negativePrompt);
    if (img.seed) setSeed(img.seed.toString());
    setPreviewImage(null);
    toast({
      title: 'Settings Remixed',
      description: 'Loaded prompt and parameters into workspace.',
    });
  };

  const handleSendToEdit = (imgUrl: string) => {
    setStudioMode('edit');
    // The previous default of 'wan2.6-image' is not in the image model
    // registry — there is a `wan2.6-t2i` (text-to-image only) and a
    // `wan2.5-i2i-preview` (image-to-image), but no model by that exact
    // id. The route's `find()` returned `undefined` and the request
    // died with `400 Invalid image model 'wan2.6-image'` before the
    // upstream was ever called. The useEffect that re-checks
    // `selectedModel` against `availableModels` rescued the first click
    // because `studioMode` was a dependency, but on subsequent clicks
    // (the user is already in edit mode) the effect never re-ran and
    // the bad id stayed. Use the first edit-capable model in the
    // registry directly, which is `qwen-image-edit` (cheapest edit
    // tier with imageEdit + multiRef). The user can change it in the
    // model dropdown if they want a different tier.
    setSelectedModel('qwen-image-edit');
    setReferenceImages([imgUrl]);
    setBboxList([[]]);
    setPreviewImage(null);
    toast({
      title: 'Switched to Edit Mode',
      description: 'Image set as primary source reference for editing.',
    });
  };

  const handleSendToWorkbench = (imgUrl: string) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('cybrdeck_cross_studio_image_url', imgUrl);
      toast({
        title: 'Image Bound to Cross-Studio Pipeline ⚡',
        description: 'Bound image URL! Ready to use as reference in Chat Workbench or Video Studio.',
      });
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast({
        title: 'Empty prompt',
        description: studioMode === 'edit' ? 'Describe the edits you want to apply.' : 'Describe the image you want to generate.',
        variant: 'destructive',
      });
      return;
    }

    // Hard Guard for Edit Mode: Require at least 1 reference image
    if (studioMode === 'edit' && referenceImages.length === 0) {
      toast({
        title: 'Source Image Required',
        description: 'Image Editing requires at least one source image. Upload or select an image to edit.',
        variant: 'destructive',
      });
      return;
    }

    if (!user) {
      toast({
        title: 'Authentication required',
        description: 'You must be signed in to generate or edit images.',
        variant: 'destructive',
      });
      return;
    }

    // Clear any prior failure the moment a fresh run starts so the inline
    // error region and toast never show stale state alongside a new spinner.
    setGenError(null);
    const requestedN = enableSequential ? 4 : numImages;
    setBatchTotal(requestedN);
    setGenerating(true);

    // One AbortController per run so cancel tears down the in-flight fetch
    // and frees the loading state without surfacing a (misleading) error.
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const idToken = user ? await user.getIdToken() : null;

      let finalPrompt = stylePreset ? `${prompt.trim()}, ${stylePreset}` : prompt.trim();
      if (negativePrompt.trim()) {
        finalPrompt += ` [avoid: ${negativePrompt.trim()}]`;
      }

      // Annotate a user-drawn region in the prompt. We previously injected
      // a generic '[Target Region: edit highlighted area]' token that gave
      // the model zero spatial information, so a careful region selection
      // was effectively ignored. Now we emit the concrete bounds so text-only
      // models at least know where to focus. The cropped data URL is also
      // appended to `referenceImages` below so multimodal models (Wan 2.7
      // region reference, Qwen Image Edit) see the region as an actual
      // input image rather than a prompt string.
      if (activeRegionCrop) {
        const b = activeRegionCrop.bounds;
        finalPrompt += ` [target region @ (${Math.round(b.x)}, ${Math.round(b.y)}, ${Math.round(b.width)}x${Math.round(b.height)}) of source]`;
      }

      const body: Record<string, unknown> = {
        prompt: finalPrompt,
        model: selectedModel,
        n: requestedN,
        size: aspectRatio,
      };

      if (seed) body.seed = parseInt(seed, 10);

      // Pass reference images & bounding boxes. When the user has drawn a
      // region crop, append the cropped data URL as an additional reference
      // so multimodal upstream APIs that consume an image list can act on
      // the region directly. The bounds are also communicated in the
      // prompt string above so text-only models still get a coordinate
      // hint even if they don't read the references array.
      if (referenceImages.length > 0) {
        body.referenceImages = activeRegionCrop
          ? [...referenceImages, activeRegionCrop.url]
          : referenceImages;
      } else if (activeRegionCrop) {
        // Edge case: user attached a region without uploading a source.
        // Send just the region crop so the model at least sees something
        // visual. The toast earlier already nudged them to attach a source.
        body.referenceImages = [activeRegionCrop.url];
      }
      if (canBbox && bboxList.some(b => b.length > 0)) body.bboxList = bboxList;
      if (canImageSet && enableSequential) body.enableSequential = true;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (idToken) {
        headers['Authorization'] = `Bearer ${idToken}`;
      }

      const res = await fetch('/api/studio/image', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        await throwStudioError(res, 'Image generation failed');
      }

      const payload = await res.json();
      const newImages: GeneratedImage[] = (payload.data || []).map((img: any, idx: number) => ({
        id: `img-${Date.now()}-${idx}`,
        url: img.url,
        prompt: prompt.trim(),
        // The image route does not echo `model` in its success payload, so the
        // client records the model that was actually requested. The result
        // footer + lightbox detail bar surface this via ModelUsedBadge.
        model: selectedModel,
        timestamp: Date.now(),
        negativePrompt: negativePrompt.trim() || undefined,
        aspectRatio,
        seed: seed ? parseInt(seed, 10) : undefined,
        sourceImageUrl: referenceImages[0] || undefined,
      }));

      setResults(newImages);
      saveHistory([...newImages, ...history]);

      // Asynchronously convert temporary OSS URLs to persistent Data-URIs so saved history never expires on refresh
      (async () => {
        try {
          const persistentImages = await Promise.all(
            newImages.map(async (imgItem) => {
              if (!imgItem.url || imgItem.url.startsWith('data:')) return imgItem;
              try {
                const proxyRes = await fetch(`/api/proxy-image?url=${encodeURIComponent(imgItem.url)}`);
                if (proxyRes.ok) {
                  const blob = await proxyRes.blob();
                  const reader = new FileReader();
                  const dataUrl = await new Promise<string>((resolve) => {
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(blob);
                  });
                  return { ...imgItem, url: dataUrl };
                }
              } catch {
                /* keep original if fetch fails */
              }
              return imgItem;
            })
          );
          setResults(persistentImages);
          saveHistory([...persistentImages, ...history]);
        } catch {
          /* noop */
        }
      })();
      
      toast({
        title: studioMode === 'edit' ? 'Edit Complete' : 'Images Generated',
        description: `Successfully synthesized ${newImages.length} image(s).`,
      });

    } catch (e: any) {
      // A user-initiated abort is not an error — surface a quiet confirmation
      // and leave the workspace intact so they can adjust and retry.
      if (e?.name === 'AbortError' || controller.signal.aborted) {
        dbg('[ImageStudio] generation cancelled by user');
        toast({
          title: 'Generation cancelled',
          description: 'The request was stopped. Your prompt and settings are still here.',
        });
        return;
      }
      // StudioApiError carries the resolved per-code copy; anything else is a
      // network/parse surprise we still want to surface honestly.
      const apiErr = e as StudioApiError;
      if (apiErr && apiErr.kind) {
        setGenError(apiErr);
        toast({
          title: apiErr.title,
          description: apiErr.message,
          variant: 'destructive',
        });
        logError('[ImageStudio] generation failed', {
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
        logError('[ImageStudio] generation failed', e);
      }
    } finally {
      // Only clear the loading flag if this run is still the active one — a
      // cancelled run already returned above, and a newer run must not be
      // stomped by an older finally block (stale-closure guard).
      if (abortRef.current === controller) {
        abortRef.current = null;
        setGenerating(false);
      }
    }
  };

  // User-initiated cancel for long-running / multi-image generation. Aborts
  // the in-flight fetch; the catch block above distinguishes AbortError from
  // a real failure so we show a quiet toast instead of a destructive one.
  const handleCancel = () => {
    abortRef.current?.abort();
  };

  // One-tap retry from the inline error region — re-runs the exact same params
  // without forcing the user to scroll back to the prompt bar.
  const handleRetry = () => {
    handleGenerate();
  };

  const handleCopyLink = async (img: GeneratedImage) => {
    try {
      await navigator.clipboard.writeText(img.url);
      setCopiedId(img.id);
      setTimeout(() => setCopiedId(null), 2000);
      toast({
        title: 'Copied link',
        description: 'Image URL copied to clipboard.',
      });
    } catch {
      toast({
        title: 'Copy failed',
        description: 'Could not copy link.',
        variant: 'destructive',
      });
    }
  };

  const handleDownload = async (img: GeneratedImage) => {
    try {
      toast({
        title: 'Downloading...',
        description: 'Saving image file.',
      });

      const fileName = `cybrdeck-${img.model.replace(/[^a-zA-Z0-9-]/g, '_')}-${Date.now()}.png`;

      if (img.url.startsWith('data:')) {
        const a = document.createElement('a');
        a.href = img.url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }

      // Route through same-origin media proxy to eliminate CSP connect-src and cross-origin CORS blocks
      const proxyUrl = `/api/media-proxy?url=${encodeURIComponent(img.url)}&filename=${encodeURIComponent(fileName)}&download=1`;
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
      console.error('[ImageStudio] Download error:', err);
      // Fallback: trigger browser anchor download directly to media proxy attachment
      try {
        const fileName = `cybrdeck-${img.model.replace(/[^a-zA-Z0-9-]/g, '_')}-${Date.now()}.png`;
        const proxyUrl = `/api/media-proxy?url=${encodeURIComponent(img.url)}&filename=${encodeURIComponent(fileName)}&download=1`;
        const link = document.createElement('a');
        link.href = proxyUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch {
        toast({
          title: 'Download failed',
          description: 'Unable to save image directly. Try copying the link.',
          variant: 'destructive',
        });
      }
    }
  };

  return (
    <StudioShell 
      title="Image Studio" 
      description={studioMode === 'edit' ? "Precision image editing, style transfer, and subject replacement." : "Synthesize high-fidelity visual assets using frontier diffusion engines."}
      onClose={onClose}
      headerActions={
        <div className="flex items-center gap-2">
          {/* Header Mode Pills */}
          <div className="flex items-center rounded-lg bg-zinc-900 border border-white/10 p-1">
            <button
              type="button"
              onClick={() => handleModeChange('generate')}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all",
                studioMode === 'generate'
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-zinc-400 hover:text-white"
              )}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Generate
            </button>
            <button
              type="button"
              onClick={() => handleModeChange('edit')}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all",
                studioMode === 'edit'
                  ? "bg-brand-500 text-black shadow-sm font-bold"
                  : "text-zinc-400 hover:text-white"
              )}
            >
              <Paintbrush className="h-3.5 w-3.5" />
              Image Edit
            </button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col h-full w-full bg-zinc-950 text-foreground overflow-visible">

        {/* TOP TOOLBAR.
            - shrink-0 keeps this bar pinned at the top of the workspace.
            - z-50 sits above the canvas (default z-0) and the history
              sidebar so dropdowns cascade over the workspace instead of
              being clipped by any sibling's stacking context.
            - overflow-visible (not overflow-x-auto) so the absolutely-
              positioned dropdowns (Engine / Aspect / Style) extend below
              the toolbar without being cut off by the toolbar's own
              overflow rule. On narrow viewports the inner flex children
              are still laid out side-by-side; the toolbar's
              min-w-full is what prevents visual breakage when the user
              zooms — we leave that to the natural flex-wrap, not an
              internal scroll, so the dropdowns always anchor to their
              button. */}
        <div className="flex items-center justify-between border-b border-white/10 bg-zinc-900/90 px-3 md:px-6 py-2 md:py-2.5 backdrop-blur-md select-none shrink-0 gap-2 md:gap-4 relative z-50 overflow-visible max-w-full">
          <div className="flex items-center gap-2 md:gap-3 shrink-0">

            {/* Model Selector Dropdown (grouped by brand) */}
            <div className="flex items-center gap-1.5 sm:gap-2 relative" ref={modelMenuRef}>
              <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider hidden sm:inline">Engine:</span>
              <button
                type="button"
                onClick={() => setShowModelMenu((v) => !v)}
                aria-haspopup="listbox"
                aria-expanded={showModelMenu}
                className="h-8 rounded-lg border border-white/15 bg-zinc-950 px-2.5 sm:px-3 text-xs font-medium text-white focus:outline-none focus:ring-1 focus:ring-primary hover:border-white/30 transition-colors flex items-center gap-1.5 min-w-[130px] sm:min-w-[180px] justify-between"
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  {selectedModelBrand && (
                    <span className="text-[9px] font-mono uppercase text-brand-400/80 shrink-0 hidden xs:inline">{selectedModelBrand}</span>
                  )}
                  <span className="truncate">{selectedModelDisplayName}</span>
                </span>
                <Icon name="chevron-down" className={cn("h-3 w-3 text-zinc-400 shrink-0 transition-transform", showModelMenu && "rotate-180")} />
              </button>

              {showModelMenu && (
                <div
                  role="listbox"
                  aria-label="Image model"
                  className="absolute top-full mt-1.5 left-0 z-[100] w-72 rounded-xl border border-white/20 bg-zinc-950/95 backdrop-blur-md p-2 shadow-2xl space-y-2 animate-in fade-in zoom-in-95 duration-150 max-h-[420px] overflow-auto"
                >
                  {groupedModels.map((group) => (
                    <div key={group.brand} className="space-y-1">
                      <div
                        aria-hidden="true"
                        className="px-2 pt-1.5 pb-1 text-[9px] font-semibold text-zinc-500 uppercase tracking-wider select-none"
                      >
                        {group.brand}
                      </div>
                      {group.models.map((model) => {
                        const isSelected = model.apiVersionId === selectedModel;
                        const isGuestLocked = !user && !['z-image-turbo', 'wan2.6-t2i'].includes(model.apiVersionId);
                        return (
                          <button
                            key={model.id}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            onClick={() => {
                              if (isGuestLocked) {
                                toast({
                                  title: 'Model Locked for Guests',
                                  description: 'Guest mode supports Z-Image Turbo & Wan 2.6 T2I. Sign up for free to unlock all 15+ image models!',
                                });
                                return;
                              }
                              setSelectedModel(model.apiVersionId);
                              setShowModelMenu(false);
                            }}
                            className={cn(
                              "w-full text-left px-2.5 py-1.5 rounded-md text-xs font-medium transition-all flex items-center justify-between gap-2",
                              isGuestLocked
                                ? "opacity-50 text-zinc-500 hover:bg-zinc-900 cursor-not-allowed"
                                : isSelected
                                ? "bg-primary/20 text-brand-300 font-semibold"
                                : "text-zinc-300 hover:bg-zinc-700/60 hover:text-white cursor-pointer"
                            )}
                            title={isGuestLocked ? 'Sign up to unlock this model' : model.displayName}
                          >
                            <span className="truncate flex items-center gap-1.5">
                              {model.displayName}
                              {isGuestLocked && <Icon name="lock" className="h-3 w-3 text-amber-400/80 shrink-0" />}
                            </span>
                            <span className="flex items-center gap-2 shrink-0">
                              {model.credits != null && (
                                <span className={cn(
                                  "text-[10px] px-1.5 py-0.5 rounded font-mono",
                                  isSelected
                                    ? "bg-brand-500/30 text-brand-200"
                                    : "bg-white/10 text-zinc-400"
                                )}>
                                  {model.credits} cr
                                </span>
                              )}
                              {isSelected && <Icon name="check" className="h-3 w-3 text-brand-400 shrink-0" />}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                  {groupedModels.length === 0 && (
                    <p className="px-2 py-3 text-[10px] text-zinc-500 font-mono text-center">
                      No models available for {studioMode === 'edit' ? 'image editing' : 'generation'}.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Aspect Ratio Selector */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowAspectMenu(!showAspectMenu)}
                className="h-8 px-2.5 sm:px-3 rounded-lg border border-white/15 bg-zinc-950 text-xs font-medium text-zinc-300 hover:text-white hover:border-white/30 transition-colors flex items-center gap-1.5"
              >
                <Icon name="slider-01" className="h-3.5 w-3.5 text-brand-400" />
                <span>{ASPECT_RATIOS.find(r => r.value === aspectRatio)?.label || aspectRatio}</span>
                <Icon name="chevron-down" className="h-3 w-3 text-zinc-400" />
              </button>

              {showAspectMenu && (
                <div className="absolute top-full mt-1.5 left-0 z-[100] w-48 rounded-xl border border-white/15 bg-zinc-950/95 backdrop-blur-md p-2 shadow-2xl space-y-1 animate-in fade-in zoom-in-95 duration-150">
                  <span className="text-[9px] font-semibold text-zinc-400 uppercase tracking-wider px-2 block">Aspect Ratios</span>
                  {ASPECT_RATIOS.map((ratio) => (
                    <button
                      key={ratio.value}
                      type="button"
                      onClick={() => {
                        setAspectRatio(ratio.value);
                        setIsCustomSize(false);
                        setShowAspectMenu(false);
                      }}
                      className={cn(
                        "w-full text-left px-2.5 py-1.5 rounded-md text-xs font-medium transition-all flex items-center justify-between",
                        aspectRatio === ratio.value ? "bg-primary/20 text-brand-300 font-semibold" : "text-zinc-300 hover:bg-zinc-700/60 cursor-pointer"
                      )}
                    >
                      <span>{ratio.label}</span>
                      <span className="text-[10px] text-zinc-500 font-mono">{ratio.value}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Style Selector Dropdown */}
            {studioMode === 'generate' && (
              <div className="relative" ref={styleMenuRef}>
                <button
                  type="button"
                  onClick={() => setShowStyleMenu(!showStyleMenu)}
                  className="h-8 px-2.5 sm:px-3 rounded-lg border border-white/15 bg-zinc-950 text-xs font-medium text-zinc-300 hover:text-white hover:border-white/30 transition-colors flex items-center gap-1.5"
                >
                  <Sparkles className="h-3.5 w-3.5 text-brand-400" />
                  <span className="truncate max-w-[80px] sm:max-w-[110px]">
                    {stylePreset 
                      ? (STYLE_TEMPLATES.find(t => t.value === stylePreset)?.label || STYLE_PRESETS.find(s => s.value === stylePreset)?.label || 'Custom Style')
                      : 'None'}
                  </span>
                  <Icon name="chevron-down" className={cn("h-3 w-3 text-zinc-400 shrink-0 transition-transform", showStyleMenu && "rotate-180")} />
                </button>

                {showStyleMenu && (
                  <div className="absolute top-full mt-1.5 left-0 z-[100] w-52 rounded-xl border border-white/15 bg-zinc-950/95 backdrop-blur-md p-2 shadow-2xl space-y-1 animate-in fade-in zoom-in-95 duration-150 max-h-72 overflow-y-auto">
                    <span className="text-[9px] font-semibold text-zinc-400 uppercase tracking-wider px-2 block">Style Preset</span>
                    <button
                      type="button"
                      onClick={() => {
                        setStylePreset('');
                        setShowStyleMenu(false);
                      }}
                      className={cn(
                        "w-full text-left px-2.5 py-1.5 rounded-md text-xs font-medium transition-all flex items-center justify-between",
                        !stylePreset ? "bg-primary/20 text-brand-300 font-semibold" : "text-zinc-300 hover:bg-zinc-700/60 cursor-pointer"
                      )}
                    >
                      <span>None</span>
                      {!stylePreset && <Icon name="check" className="h-3 w-3 text-brand-400 shrink-0" />}
                    </button>

                    {STYLE_TEMPLATES.map((tmpl) => (
                      <button
                        key={tmpl.label}
                        type="button"
                        onClick={() => {
                          setStylePreset(tmpl.value);
                          setShowStyleMenu(false);
                        }}
                        className={cn(
                          "w-full text-left px-2.5 py-1.5 rounded-md text-xs font-medium transition-all flex items-center justify-between",
                          stylePreset === tmpl.value ? "bg-primary/20 text-brand-300 font-semibold" : "text-zinc-300 hover:bg-zinc-700/60 cursor-pointer"
                        )}
                      >
                        <span className="truncate">{tmpl.label}</span>
                        {stylePreset === tmpl.value && <Icon name="check" className="h-3 w-3 text-brand-400 shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Batch Size Slider (Desktop/Tablet) */}
            <div className="hidden md:flex items-center gap-2 border-l border-white/10 pl-3">
              <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Batch:</span>
              <div className="flex items-center gap-1 bg-zinc-950 border border-white/15 rounded-lg p-0.5">
                {[1, 2, 4].map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setNumImages(count)}
                    disabled={enableSequential || selectedModel.startsWith('z-image') || selectedModel === 'qwen-image-max' || selectedModel === 'qwen-image-plus' || selectedModel === 'qwen-image-edit'}
                    className={cn(
                      "px-2 py-0.5 rounded text-[11px] font-mono font-semibold transition-all",
                      numImages === count ? "bg-primary text-black" : "text-zinc-400 hover:text-white",
                      (enableSequential || selectedModel.startsWith('z-image') || selectedModel === 'qwen-image-max' || selectedModel === 'qwen-image-plus' || selectedModel === 'qwen-image-edit') && "opacity-40 cursor-not-allowed"
                    )}
                  >
                    {count}x
                  </button>
                ))}
              </div>
            </div>

          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Mobile Creation History Toggle Button */}
            <button
              type="button"
              onClick={() => setShowHistoryDrawer(!showHistoryDrawer)}
              className={cn(
                "h-8 px-2.5 rounded-lg border text-xs font-semibold transition-all flex md:hidden items-center gap-1.5",
                showHistoryDrawer ? "border-brand-500 bg-brand-950/60 text-brand-300" : "border-white/15 bg-zinc-950 text-zinc-300 hover:text-white"
              )}
            >
              <Icon name="grid" className="h-3.5 w-3.5 text-brand-400" />
              <span>History ({history.length})</span>
            </button>

            {/* Advanced Settings Toggle Button */}
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className={cn(
                "h-8 px-2.5 sm:px-3 rounded-lg border text-xs font-semibold transition-all flex items-center gap-1.5",
                showAdvanced ? "border-brand-500 bg-brand-950/60 text-brand-300" : "border-white/15 bg-zinc-950 text-zinc-300 hover:text-white"
              )}
            >
              <Icon name="slider-01" className="h-3.5 w-3.5 text-brand-400" />
              <span>Advanced</span>
            </button>
          </div>
        </div>

        {/* ADVANCED PARAMETERS PANEL (Collapsible) */}
        {showAdvanced && (
          <div className="border-b border-white/10 bg-zinc-900/95 p-4 animate-in slide-in-from-top-2 duration-200 select-none">
            <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4">
              
              {/* Negative Prompt */}
              {canNegativePrompt && (
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block">Negative Prompt (Avoid)</label>
                  <input
                    type="text"
                    placeholder="blurry, distorted, low resolution, bad anatomy"
                    value={negativePrompt}
                    onChange={(e) => setNegativePrompt(e.target.value)}
                    className="w-full h-8 rounded-lg border border-white/15 bg-zinc-950 px-3 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              )}

              {/* Seed */}
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Seed (Optional)</label>
                  <button
                    type="button"
                    onClick={handleRandomizeSeed}
                    className="text-[10px] text-brand-400 hover:underline font-mono"
                  >
                    Randomize
                  </button>
                </div>
                <input
                  type="number"
                  placeholder="Random seed (e.g. 4281920)"
                  value={seed}
                  onChange={(e) => setSeed(e.target.value)}
                  className="w-full h-8 rounded-lg border border-white/15 bg-zinc-950 px-3 text-xs font-mono text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Image Set Generation (Wan 2.7) */}
              {canImageSet && (
                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={enableSequential}
                      onChange={(e) => {
                        setEnableSequential(e.target.checked);
                        if (e.target.checked) setNumImages(4);
                      }}
                      className="accent-primary h-4 w-4 rounded"
                    />
                    <span className="text-xs text-zinc-200 group-hover:text-brand-300 transition-colors flex items-center gap-1.5 font-medium">
                      <Icon name="layers" className="h-4 w-4 text-brand-400" /> Image Set (4 consistent sequential images)
                    </span>
                  </label>
                </div>
              )}

            </div>
          </div>
        )}

        {/* MAIN CENTER WORKSPACE WITH RIGHT CREATION HISTORY SIDEBAR */}
        <div className="flex-1 min-h-0 relative flex overflow-hidden">
          
          {/* LEFT MAIN CANVAS WORKSPACE */}
          <div className="flex-1 min-h-0 relative flex flex-col overflow-hidden">
            
            {/* Floating Expand History Button (when collapsed) */}
            {isHistoryCollapsed && (
              <button
                type="button"
                onClick={() => setIsHistoryCollapsed(false)}
                className="hidden md:flex absolute top-4 right-4 z-30 h-8 px-3 rounded-xl border border-brand-500/40 bg-zinc-900/95 text-brand-300 hover:bg-zinc-800 hover:text-white shadow-xl backdrop-blur-md items-center gap-2 font-mono text-xs transition-all animate-in fade-in cursor-pointer"
                title="Expand Creation History"
              >
                <Icon name="chevron-left" className="h-4 w-4 text-brand-400" />
                <Icon name="grid" className="h-3.5 w-3.5" />
                <span>History ({history.length})</span>
              </button>
            )}

            <div className="flex-1 min-h-0 overflow-auto p-6 flex flex-col items-center justify-start gap-6 pb-44">
              
              {/* EDIT MODE WORKSPACE */}
              {studioMode === 'edit' && (
                <div className="w-full max-w-5xl space-y-6">
                  
                  {/* Source Image Upload / Canvas Area */}
                  <div className="border border-white/15 rounded-2xl bg-zinc-900/60 p-6 backdrop-blur-sm shadow-2xl relative">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Paintbrush className="h-4 w-4 text-brand-400" />
                        <h2 className="text-sm font-bold text-white uppercase tracking-wider">Source Image Canvas</h2>
                        <Badge variant="outline" className="text-[10px] border-brand-500/40 text-brand-300 font-mono">
                          {referenceImages.length > 0 ? `${referenceImages.length} Image(s) Attached` : 'No Image Loaded'}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="file"
                          ref={fileInputRef}
                          onChange={handleFileUpload}
                          accept="image/*"
                          multiple={canMultiRef}
                          className="hidden"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => fileInputRef.current?.click()}
                          className="gap-1.5 border-white/20 text-xs text-white hover:bg-white/10"
                        >
                          <Icon name="file-upload" className="h-3.5 w-3.5" /> Upload Source Image
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setShowRefPicker(!showRefPicker)}
                          className="gap-1.5 border-white/20 text-xs text-zinc-300 hover:text-white"
                        >
                          <ImagePlus className="h-3.5 w-3.5" /> Pick From History
                        </Button>
                      </div>
                    </div>

                    {/* Pick from History Grid Dropdown */}
                    {showRefPicker && (
                      <div className="mb-4 border border-brand-500/30 rounded-xl p-3 bg-zinc-950 space-y-2 animate-in fade-in duration-150">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-brand-300 font-semibold">Select an image from creation history:</span>
                          <button type="button" onClick={() => setShowRefPicker(false)} className="text-zinc-400 hover:text-white">
                            <Icon name="close-md" className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-40 overflow-auto">
                          {[...results, ...history].map((img) => (
                            <button
                              key={img.id}
                              type="button"
                              onClick={() => {
                                if (canMultiRef) {
                                  setReferenceImages(prev => [...prev, img.url]);
                                  setBboxList(prev => [...prev, []]);
                                } else {
                                  setReferenceImages([img.url]);
                                  setBboxList([[]]);
                                }
                                setShowRefPicker(false);
                                toast({
                                  title: 'Reference Loaded',
                                  description: 'Set selected image as source reference.',
                                });
                              }}
                              className="h-20 rounded-lg border border-white/15 overflow-hidden hover:border-brand-400 transition-all hover:scale-105"
                            >
                              <SourceImage
                                src={img.url}
                                alt=""
                                debugId={`image-studio.ref-picker.${img.id}`}
                                className="w-full h-full object-cover"
                              />
                            </button>
                          ))}
                        </div>
                        {[...results, ...history].length === 0 && (
                          <p className="text-xs text-zinc-500 text-center py-4">No past images found. Upload an image above to start editing.</p>
                        )}
                      </div>
                    )}

                    {/* EMPTY STATE — no image uploaded yet. */}
                    {referenceImages.length === 0 ? (
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed border-white/20 hover:border-brand-400/60 rounded-xl p-12 flex flex-col items-center justify-center text-center cursor-pointer transition-all bg-black/30 group"
                      >
                        <div className="h-14 w-14 rounded-full bg-brand-950/60 border border-brand-500/30 text-brand-300 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                          <Icon name="image" className="h-6 w-6" />
                        </div>
                        <p className="text-sm font-semibold text-white">Click or Drag & Drop Source Image to Edit</p>
                        <p className="text-xs text-zinc-400 mt-1 max-w-sm">
                          Supports JPEG, PNG, WebP. Wan 2.6 and Qwen Image Edit require a source image to apply modifications.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* Active Source Image Canvas Preview */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          
                          {/* Primary Source Image */}
                          <div className="relative border border-white/15 rounded-xl bg-black/60 overflow-hidden group flex flex-col items-center justify-center min-h-[300px]">
                            <span className="absolute top-3 left-3 z-10 px-2.5 py-1 rounded-md bg-black/70 border border-white/20 text-[10px] font-mono text-brand-300 uppercase">
                              Primary Source
                            </span>
                            <SourceImage
                              src={referenceImages[0]}
                              alt="Primary source image"
                              debugId="image-studio.primary-source"
                              className="max-h-[400px] w-auto object-contain rounded-lg p-2"
                              wrapperClassName="w-full"
                            />
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setPreviewImage({
                                    id: 'src-1',
                                    url: referenceImages[0],
                                    prompt: 'Source Reference',
                                    model: selectedModel,
                                    timestamp: Date.now(),
                                  });
                                  setIsAnnotating(true);
                                }}
                                className="gap-1.5 border-brand-500/50 bg-brand-950/80 text-brand-300 hover:bg-brand-900 text-xs font-semibold"
                              >
                                <Icon name="slider-01" className="h-3.5 w-3.5" />
                                Annotate & Select Region
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => {
                                  setReferenceImages(prev => prev.slice(1));
                                  setBboxList(prev => prev.slice(1));
                                }}
                                className="gap-1.5 text-xs font-semibold"
                              >
                                <Icon name="trash-empty" className="h-3.5 w-3.5" /> Remove
                              </Button>
                            </div>
                          </div>

                          {/* Edited Result / Compare Preview */}
                          <div className="relative border border-white/15 rounded-xl bg-black/60 overflow-hidden flex flex-col items-center justify-center min-h-[300px]">
                            <span className="absolute top-3 left-3 z-10 px-2.5 py-1 rounded-md bg-black/70 border border-white/20 text-[10px] font-mono text-emerald-400 uppercase">
                              {results.length > 0 ? 'Edit Result' : 'Output Preview'}
                            </span>

                            {results.length > 0 ? (
                              <SourceImage
                                src={results[0].url}
                                alt="Edited Result"
                                debugId="image-studio.edit-result"
                                className="max-h-[400px] w-auto object-contain rounded-lg p-2"
                                wrapperClassName="w-full"
                              />
                            ) : (
                              <div className="text-center p-6 space-y-2 select-none">
                                <Sparkles className="h-8 w-8 text-zinc-600 mx-auto" />
                                <p className="text-xs text-zinc-400 font-medium">Your edited output will appear here side-by-side.</p>
                                <p className="text-[10px] text-zinc-600">Type instructions in the bottom prompt bar and click 'Apply Edit'.</p>
                              </div>
                            )}
                          </div>

                        </div>

                        {/* Additional Reference Thumbnails */}
                        {referenceImages.length > 1 && (
                          <div className="space-y-1">
                            <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block">Additional Reference Images ({referenceImages.length - 1}):</span>
                            <div className="flex flex-wrap gap-2">
                              {referenceImages.slice(1).map((url, idx) => (
                                <div key={idx} className="relative group/thumb border border-white/15 rounded-lg overflow-hidden w-20 h-20 bg-black">
                                  <SourceImage
                                    src={url}
                                    alt=""
                                    debugId={`image-studio.additional-ref.${idx}`}
                                    className="w-full h-full object-cover"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setReferenceImages(prev => prev.filter((_, i) => i !== idx + 1));
                                      setBboxList(prev => prev.filter((_, i) => i !== idx + 1));
                                    }}
                                    className="absolute top-1 right-1 bg-black/80 text-white rounded-full p-1 opacity-0 group-hover/thumb:opacity-100 transition-opacity"
                                  >
                                    <Icon name="close-md" className="h-3 w-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                      </div>
                    )}

                  </div>

                </div>
              )}

              {/* GENERATE MODE WORKSPACE */}
              {studioMode === 'generate' && (
                <div className="w-full max-w-5xl space-y-6">
                  
                  {/* Active Generation Hero / Outputs */}
                  {results.length > 0 ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold uppercase text-zinc-400 tracking-wider flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-brand-400" /> Latest Output ({results.length})
                        </h3>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setResults([])}
                          className="h-6 text-[10px] text-zinc-400 hover:text-white"
                        >
                          Clear Active Outputs
                        </Button>
                      </div>

                      <div className={cn(
                        "grid gap-4",
                        results.length === 1 ? "grid-cols-1 max-w-2xl mx-auto" : "grid-cols-1 md:grid-cols-2"
                      )}>
                        {results.map((img) => (
                          <ResultCard
                            key={img.id}
                            img={img}
                            copiedId={copiedId}
                            onExpand={() => setPreviewImage(img)}
                            onDownload={() => handleDownload(img)}
                            onCopyLink={() => handleCopyLink(img)}
                            onSendToEdit={() => handleSendToEdit(img.url)}
                            onRegenerate={handleGenerate}
                          />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6 max-w-4xl mx-auto select-none">
                      {/* Gemini-Style Intro Header */}
                      <div className="text-center space-y-2">
                        <div className="h-10 w-10 rounded-xl bg-brand-950/80 border border-brand-500/30 text-brand-400 flex items-center justify-center mx-auto shadow-lg shadow-brand-950/40">
                          <Icon name="camera" className="h-5 w-5 text-brand-400" />
                        </div>
                        <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Create images</h2>
                        <p className="text-xs sm:text-sm text-zinc-400 max-w-md mx-auto">
                          Try a template or describe an idea in chat. Create with Cybrdeck.
                        </p>
                      </div>

                      {/* 20-Card Template Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 p-1">
                        {STYLE_TEMPLATES.map((tmpl) => {
                          const isSelected = stylePreset === tmpl.value;
                          return (
                            <button
                              key={tmpl.label}
                              type="button"
                              onClick={() => {
                                if (isSelected) {
                                  setStylePreset('');
                                } else {
                                  setStylePreset(tmpl.value);
                                }
                              }}
                              className={cn(
                                "group relative h-28 rounded-2xl overflow-hidden border transition-all duration-200 text-left p-3 flex flex-col justify-end shadow-md hover:scale-[1.03] active:scale-[0.98] cursor-pointer",
                                "bg-gradient-to-br",
                                tmpl.bg,
                                isSelected 
                                  ? "border-brand-400 ring-2 ring-brand-500/50 shadow-brand-500/20" 
                                  : "border-white/15 hover:border-white/40"
                              )}
                            >
                              {tmpl.img && (
                                <img
                                  src={tmpl.img}
                                  alt={tmpl.label}
                                  className="absolute inset-0 w-full h-full object-cover rounded-2xl group-hover:scale-105 transition-transform duration-300"
                                />
                              )}
                              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent z-10" />
                              <div className="relative z-20 space-y-0.5">
                                <span className="text-xs font-bold text-white flex items-center justify-between">
                                  {tmpl.label}
                                  {isSelected && <Icon name="check" className="h-3.5 w-3.5 text-brand-400 shrink-0" />}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {genError && !generating && (
                    <ErrorRegion
                      title={genError.title}
                      description={genError.message}
                      onRetry={handleRetry}
                      className="max-w-2xl mx-auto"
                    />
                  )}
                </div>
              )}

            </div>

          </div>

          {/* RIGHT CREATION HISTORY SIDEBAR (DESKTOP) */}
          <aside className={cn(
            "hidden md:flex shrink-0 border-l border-white/10 bg-zinc-950/80 backdrop-blur-md flex-col overflow-hidden select-none z-30 transition-all duration-300 relative",
            isHistoryCollapsed ? "w-0 opacity-0 border-l-0" : "w-72 sm:w-80 opacity-100"
          )}>
            {/* Sidebar Header */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-zinc-900/50">
              <div className="flex items-center gap-2">
                <Icon name="grid" className="h-4 w-4 text-brand-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">Creation History</h3>
                <span className="text-[10px] font-mono font-bold text-brand-400 bg-brand-950/80 border border-brand-500/30 px-2 py-0.5 rounded-full">
                  {history.length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {history.length > 0 && (
                  <button
                    type="button"
                    onClick={clearHistory}
                    className="text-[10px] text-zinc-400 hover:text-rose-400 flex items-center gap-1 font-mono transition-colors"
                    title="Clear all historical outputs"
                  >
                    <Icon name="trash-empty" className="h-3 w-3" /> Clear
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsHistoryCollapsed(true)}
                  className="h-6 w-6 rounded border border-white/15 bg-zinc-900 text-zinc-400 hover:text-white hover:border-brand-400/50 flex items-center justify-center transition-colors"
                  title="Collapse sidebar out of the way"
                >
                  <Icon name="chevron-right" className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Sidebar History Content Grid. We keep the scroll behavior
                (overflow-y-auto) so long history lists still scroll,
                but visually hide the scrollbar so it doesn't appear
                on the viewport's extreme right edge — the user
                complained about it. The main canvas (line 1270) is
                the canonical scroll region for the studio; the
                sidebar should look like a sheet, not a window. */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-none">
              {history.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-500 space-y-2.5">
                  <div className="h-10 w-10 rounded-full bg-zinc-900 border border-white/10 flex items-center justify-center text-zinc-600">
                    <Icon name="grid" className="h-5 w-5" />
                  </div>
                  <p className="text-xs font-semibold text-zinc-400">No creation history yet</p>
                  <p className="text-[10px] text-zinc-600 leading-normal max-w-[200px]">
                    Generated and edited images will appear here in real-time.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5">
                  {history.map((img) => (
                    <div
                      key={img.id}
                      className="group relative aspect-square rounded-xl border border-white/15 bg-zinc-900 overflow-hidden cursor-pointer shadow-md hover:border-brand-400 transition-all hover:scale-[1.02]"
                      onClick={() => setPreviewImage(img)}
                    >
                      <SourceImage
                        src={img.url}
                        alt={img.prompt}
                        debugId={`image-studio.history.${img.id}`}
                        className="w-full h-full object-cover"
                      />
                      {/* Hover Overlay with Action Buttons */}
                      <div className="absolute inset-0 bg-black/75 opacity-0 group-hover:opacity-100 transition-opacity p-2 flex flex-col justify-between">
                        <p className="text-[9px] text-zinc-200 line-clamp-3 leading-tight">{img.prompt}</p>
                        <div className="flex items-center justify-end gap-1 pt-1">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleSendToEdit(img.url); }}
                            className="h-5 px-1.5 bg-brand-500 hover:bg-brand-400 text-black rounded text-[9px] font-extrabold tracking-wide uppercase transition-colors"
                            title="Send to Image Edit"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleDownload(img); }}
                            className="h-5 w-5 bg-white/20 hover:bg-white/30 text-white rounded flex items-center justify-center transition-colors"
                            title="Download Image"
                          >
                            <Icon name="download" className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              saveHistory(history.filter(h => h.id !== img.id));
                            }}
                            className="h-5 w-5 bg-rose-500/20 hover:bg-rose-500/40 text-rose-300 rounded flex items-center justify-center transition-colors"
                            title="Remove from history"
                          >
                            <Icon name="trash-empty" className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>

        {/* MOBILE CREATION HISTORY SLIDE-OVER DRAWER MODAL */}
        {showHistoryDrawer && (
          <div className="md:hidden fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col animate-in fade-in duration-150">
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-zinc-900">
              <div className="flex items-center gap-2">
                <Icon name="grid" className="h-4 w-4 text-brand-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">Creation History ({history.length})</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowHistoryDrawer(false)}
                className="h-8 w-8 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20"
              >
                <Icon name="close-md" className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-none">
              {history.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 text-zinc-500 space-y-2">
                  <Icon name="grid" className="h-8 w-8 text-zinc-600 mx-auto" />
                  <p className="text-xs font-medium text-zinc-400">No creation history yet</p>
                  <p className="text-[10px] text-zinc-600">Generated images will appear here in real-time.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {history.map((img) => (
                    <div
                      key={img.id}
                      className="group relative aspect-square rounded-xl border border-white/15 bg-zinc-900 overflow-hidden cursor-pointer shadow-md"
                      onClick={() => {
                        setPreviewImage(img);
                        setShowHistoryDrawer(false);
                      }}
                    >
                      <SourceImage
                        src={img.url}
                        alt={img.prompt}
                        debugId={`image-studio.mobile-history.${img.id}`}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/75 p-2 flex flex-col justify-between">
                        <p className="text-[9px] text-zinc-200 line-clamp-3 leading-tight">{img.prompt}</p>
                        <div className="flex items-center justify-end gap-1 pt-1">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleSendToEdit(img.url); setShowHistoryDrawer(false); }}
                            className="h-5 px-2 bg-brand-500 text-black text-[9px] font-bold uppercase rounded"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleDownload(img); }}
                            className="h-5 w-5 bg-white/20 text-white rounded flex items-center justify-center"
                          >
                            <Icon name="download" className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

          {/* FLOATING BOTTOM PROMPT BAR (Midjourney / ChatGPT Style) */}
          <div className="fixed md:absolute bottom-3 md:bottom-16 left-2 right-2 md:left-0 md:right-0 z-40 md:z-30 px-1 md:px-8 pointer-events-auto">
            <div className="max-w-4xl mx-auto border border-white/20 rounded-2xl bg-zinc-900/95 backdrop-blur-xl shadow-2xl p-2.5 md:p-3 space-y-2">
              
              {/* Context Chips (Attached Target Regions, Style Templates & References) */}
              {(activeRegionCrop || referenceImages.length > 0 || stylePreset) && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                  {/* Attached Style Template Chip */}
                  {stylePreset && (() => {
                    const tmpl = STYLE_TEMPLATES.find(t => t.value === stylePreset);
                    return (
                      <div className="flex items-center gap-2 px-2.5 py-1 bg-zinc-950 border border-white/20 rounded-xl text-xs shrink-0 shadow-md animate-in fade-in zoom-in duration-150">
                        <div className={cn(
                          "w-6 h-6 rounded-lg bg-gradient-to-br border flex items-center justify-center overflow-hidden relative shadow-inner shrink-0",
                          tmpl?.bg || 'from-zinc-900 to-black',
                          tmpl?.border || 'border-white/20'
                        )}>
                          {tmpl?.img ? (
                            <img
                              src={tmpl.img}
                              alt={tmpl.label}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="text-[9px] font-bold text-white uppercase">{tmpl?.label?.[0]}</span>
                          )}
                        </div>
                        <span className="text-[10px] text-white font-bold uppercase tracking-wider">
                          {tmpl?.label || 'Style Attached'}
                        </span>
                        <button
                          type="button"
                          onClick={() => setStylePreset('')}
                          className="text-zinc-400 hover:text-white p-0.5 rounded hover:bg-white/10 transition-colors ml-0.5"
                          title="Detach style template"
                        >
                          <Icon name="close-md" className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })()}

                  {activeRegionCrop && (
                    <div className="flex items-center gap-2 px-2.5 py-1 bg-brand-950/80 border border-brand-500/50 rounded-lg text-xs shrink-0">
                      <SourceImage
                        src={activeRegionCrop.url}
                        alt="Region"
                        debugId="image-studio.region-chip"
                        className="w-6 h-6 object-cover rounded border border-brand-400"
                      />
                      <span className="text-[10px] text-brand-300 font-mono truncate max-w-[100px]">
                        Target ({Math.round(activeRegionCrop.bounds.width)}x{Math.round(activeRegionCrop.bounds.height)})
                      </span>
                      <button type="button" onClick={() => setActiveRegionCrop(null)} className="text-zinc-400 hover:text-white">
                        <Icon name="close-md" className="h-3 w-3" />
                      </button>
                    </div>
                  )}

                  {referenceImages.map((url, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 px-2 py-0.5 bg-zinc-950 border border-white/15 rounded-lg text-xs shrink-0">
                      <SourceImage
                        src={url}
                        alt=""
                        debugId={`image-studio.context-chip.ref.${idx}`}
                        className="w-5 h-5 object-cover rounded"
                      />
                      <span className="text-[10px] text-zinc-300 font-mono">Ref #{idx + 1}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setReferenceImages(prev => prev.filter((_, i) => i !== idx));
                          setBboxList(prev => prev.filter((_, i) => i !== idx));
                        }}
                        className="text-zinc-500 hover:text-white"
                      >
                        <Icon name="close-md" className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Honest generation progress */}
              {generating && (
                <LoadingRegion
                  label={
                    batchTotal > 1
                      ? studioMode === 'edit'
                        ? `Editing — generating ${batchTotal} image${batchTotal > 1 ? 's' : ''}…`
                        : `Generating ${batchTotal} image${batchTotal > 1 ? 's' : ''}…`
                      : studioMode === 'edit'
                        ? 'Applying edit…'
                        : 'Generating image…'
                  }
                  elapsedLabel={elapsedLabel}
                />
              )}

              {/* Prompt Textarea & Action Row */}
              <div className="flex flex-col gap-2.5">
                {/* Full-Width Unsquished Textarea */}
                <Textarea
                  placeholder={
                    studioMode === 'edit' 
                      ? "Describe modifications (e.g. 'Add neon glow background')..."
                      : "Describe image to synthesize (e.g. 'Futuristic city sunset')..."
                  }
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                      e.preventDefault();
                      if (!generating && prompt.trim()) {
                        handleGenerate();
                      }
                    }
                  }}
                  className="w-full min-h-[56px] max-h-32 text-xs border border-white/10 bg-zinc-950/80 focus-visible:ring-1 focus-visible:ring-brand-500/50 p-2.5 rounded-xl resize-none text-white placeholder-zinc-500 transition-colors"
                />

                {/* Prompt Utilities & Primary CTA Row */}
                <div className="flex items-center justify-between gap-2 shrink-0">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handlePickSample}
                      className="h-8 px-2.5 rounded-lg bg-zinc-950 border border-white/15 text-[10px] text-zinc-300 hover:text-white font-medium flex items-center gap-1.5 transition-colors"
                      title="Load Sample Prompt"
                    >
                      <Icon name="shuffle" className="h-3 w-3" />
                      <span>Sample</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleEnhancePrompt}
                      disabled={enhancing || !prompt.trim()}
                      className="h-8 px-2.5 rounded-lg bg-zinc-950 border border-white/15 text-[10px] text-brand-400 hover:text-brand-300 font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                      title="Enhance prompt with magic keywords"
                    >
                      {enhancing ? <Icon name="loading" className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                      <span>Magic</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Cancel a long-running batch */}
                    {generating && <CancelButton onCancel={handleCancel} />}

                    {/* Primary Submit Button */}
                    <Button
                      type="button"
                      onClick={handleGenerate}
                      disabled={generating || (studioMode === 'edit' && referenceImages.length === 0)}
                      className={cn(
                        "h-8 sm:h-9 px-3.5 sm:px-5 text-[11px] sm:text-xs font-bold uppercase tracking-wider gap-1.5 shadow-lg transition-all rounded-xl",
                        studioMode === 'edit'
                          ? "bg-brand-500 hover:bg-brand-400 text-black font-extrabold"
                          : "bg-primary text-primary-foreground"
                      )}
                    >
                      {generating ? (
                        <>
                          <Icon name="loading" className="h-3.5 w-3.5 animate-spin" />
                          <span>Processing...</span>
                        </>
                      ) : studioMode === 'edit' ? (
                        <>
                          <Paintbrush className="h-3.5 w-3.5" />
                          <span>Generate ({modelCreditCost}c)</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3.5 w-3.5" />
                          <span>Generate ({modelCreditCost}c)</span>
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Helper Shortcut Line — Hidden on mobile & tablet viewports */}
              <div className="hidden lg:flex justify-between items-center text-[9px] text-zinc-500 px-1 pt-0.5 border-t border-white/5">
                <span>
                  {studioMode === 'edit' && referenceImages.length === 0
                    ? '⚠ Attach at least 1 source image above to apply edits.'
                    : 'Press Ctrl+Enter to submit'}
                </span>
                <span className="font-mono">{selectedModel}</span>
              </div>

            </div>
          </div>

        </div>

      </div>

      {/* Lightbox / Expanded Image & Annotator Modal */}
      {previewImage && (
        <div 
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-200"
          onClick={() => setPreviewImage(null)}
        >
          <div 
            className="relative max-w-5xl max-h-[90vh] flex flex-col items-center justify-center bg-zinc-950 border border-white/15 rounded-2xl overflow-hidden shadow-2xl p-2"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              className="absolute top-4 right-4 z-10 h-10 w-10 bg-black/70 hover:bg-black text-white rounded-full flex items-center justify-center border border-white/20 transition-all"
              title="Close Preview"
            >
              <Icon name="close-md" className="h-5 w-5" />
            </button>

            {/* Expanded Image or Annotator View */}
            {isAnnotating ? (
              <div className="w-full h-[75vh] flex items-center justify-center p-2">
                <ImageAnnotatorCanvas
                  imageUrl={previewImage.url}
                  onApplyRegionCrop={async (croppedUrl, bounds) => {
                    const compressed = await compressImageDataUrl(croppedUrl);
                    setActiveRegionCrop({ url: compressed, bounds });
                    setIsAnnotating(false);
                    setPreviewImage(null);
                    // The bounds and cropped image are sent on the wire inside
                    // `handleGenerate`. We no longer mutate the visible prompt
                    // here with a generic placeholder, since the previous
                    // string gave the model no spatial information. The user
                    // can still type a free-form description in the textarea;
                    // the region geometry travels in the JSON body, not the
                    // visible text.
                    toast({
                      title: 'Region Attached',
                      description: 'Targeted image crop and bounds will be sent with the next request.',
                    });
                  }}
                  onCancel={() => setIsAnnotating(false)}
                />
              </div>
            ) : (
              <SourceImage
                src={previewImage.url}
                alt={previewImage.prompt}
                debugId={`image-studio.lightbox.${previewImage.id}`}
                loading="eager"
                className="max-h-[75vh] w-auto object-contain rounded-xl"
                wrapperClassName="w-full"
              />
            )}

            {/* Image Details Bar */}
            <div className="w-full p-4 flex flex-col md:flex-row items-center justify-between gap-4 border-t border-white/10 mt-2 bg-zinc-900/60">
              <div className="space-y-2 text-left max-w-2xl">
                <p className="text-xs text-zinc-300 font-mono line-clamp-2">{previewImage.prompt}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <ModelUsedBadge model={previewImage.model} detail={previewImage.aspectRatio} size="md" />
                  {previewImage.seed != null && (
                    <span className="font-mono text-[10px] text-zinc-500">seed {previewImage.seed}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsAnnotating(!isAnnotating)}
                  className={cn(
                    "gap-1.5 border-brand-500/40 text-xs font-semibold",
                    isAnnotating ? "bg-brand-600 text-white" : "bg-brand-950/40 hover:bg-brand-900/50 text-brand-300"
                  )}
                >
                  <Icon name="slider-01" className="h-3.5 w-3.5" />
                  {isAnnotating ? 'Close Annotator' : 'Annotate & Select Region'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleSendToEdit(previewImage.url)}
                  className="gap-1.5 border-brand-500/50 text-xs bg-brand-950/60 hover:bg-brand-900 text-brand-300"
                >
                  <Paintbrush className="h-3.5 w-3.5" />
                  Edit in Studio
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleSendToWorkbench(previewImage.url)}
                  className="gap-1.5 border-purple-500/50 text-xs bg-purple-950/60 hover:bg-purple-900 text-purple-300"
                >
                  <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                  Export to Workbench
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCopyLink(previewImage)}
                  className="gap-1.5 border-white/20 text-xs text-white"
                >
                  {copiedId === previewImage.id ? <Icon name="check" className="h-3.5 w-3.5 text-emerald-400" /> : <Icon name="copy" className="h-3.5 w-3.5" />}
                  Copy Link
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleDownload(previewImage)}
                  className="gap-1.5 bg-primary text-primary-foreground text-xs font-semibold"
                >
                  <Icon name="download" className="h-3.5 w-3.5" />
                  Download
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bbox Annotation Overlay for Wan 2.7 Interactive Editing */}
      {bboxAnnotatingIndex !== null && referenceImages[bboxAnnotatingIndex] && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-6">
          <div className="text-center mb-4 space-y-1">
            <h3 className="text-sm font-semibold text-white">Draw Bounding Box on Reference Image {bboxAnnotatingIndex + 1}</h3>
            <p className="text-[10px] text-zinc-400">Draw a rectangle to define where to place content from this image.</p>
          </div>
          <ImageAnnotatorCanvas
            imageUrl={referenceImages[bboxAnnotatingIndex]}
            onApplyRegionCrop={(_dataUrl, bounds) => {
              const bbox = [Math.round(bounds.x), Math.round(bounds.y), Math.round(bounds.x + bounds.width), Math.round(bounds.y + bounds.height)];
              setBboxList(prev => {
                const updated = [...prev];
                updated[bboxAnnotatingIndex] = [bbox];
                return updated;
              });
              setBboxAnnotatingIndex(null);
            }}
            onCancel={() => setBboxAnnotatingIndex(null)}
          />
          <div className="flex items-center gap-3 mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setBboxList(prev => {
                  const updated = [...prev];
                  updated[bboxAnnotatingIndex] = [];
                  return updated;
                });
                setBboxAnnotatingIndex(null);
              }}
              className="text-xs border-white/20 text-zinc-300"
            >
              Clear Bbox
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBboxAnnotatingIndex(null)}
              className="text-xs border-white/20 text-zinc-300"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

    </StudioShell>
  );
}
