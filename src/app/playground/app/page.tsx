'use client';

/**
 * /playground — the "War Room" workbench canvas.
 *
 * Layout:
 *   1. Header strip (title, credit counter pill, "Add column" button)
 *   2. Responsive grid of model columns (1 / 2 / 3 / 4)
 *   3. Global prompt bar (sticky bottom) with the attachment dock
 *   4. Footer credit (matches the spec verbatim)
 *
 * Architectural invariant: each column owns its OWN `usePlaygroundStream`
 * hook instance, so failures are isolated to that column. The prompt bar
 * fans out by calling each column's registered `send` callback in
 * parallel via `Promise.allSettled`; a rejected promise on one column
 * (auth_required, payment required, network error, …) does not prevent
 * the others from streaming.
 *
 * Plumbing: each column registers its `send` callback into a shared
 * `Map<columnId, sendFn>` via a `useRef` we pass down. The prompt bar
 * iterates that map and calls every registered send. This avoids both
 * prop-drilling through a context AND the brittle `CustomEvent` bridge.
 *
 * Auth: we use `useUser()` from `src/firebase/auth/use-user.tsx`.
 *
 * Guest experience:
 *   1. While `useUser().loading === true`, render a full-screen skeleton so
 *      no unauthenticated UI ever flashes on the screen.
 *   2. Once the auth state resolves, render the war room regardless of
 *      whether the user is signed in. Guests are admitted to the guest-
 *      category model subset on a 10-req/24h pool (see `guest-usage.ts`);
 *      authenticated users of any tier can reach every model.
 *   3. On the auth-flip transition (guest → authed), hydrate the chat
 *      history stored under `__pg_guest_mirror` in localStorage into the
 *      workbench columns so the guest's prompts are not lost, then clear
 *      the local key (see `guestHistory.ts`).
 *
 * History persistence uses `localStorage` keyed by the mirror cookie value.
 * No server-side write is needed because the signup-then-return flow is a
 * single in-memory transition.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SeamlessLoopVideo } from '@/components/playground/SeamlessLoopVideo';
import Image from 'next/image';
import { fileToOptimizedDataUrl } from '@/lib/playground/compress-image';
import { OneStatusBadge } from '@/components/one/OneStatusBadge';
import { useUser } from '@/firebase/auth/use-user';
import { Icon } from '@/components/ui/icon';
import { getModeById } from '@/lib/playground/modes';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

import {
    usePlaygroundStream,
    type PlaygroundStreamSendOptions,
    type GuestQuotaSnapshot,
} from '@/lib/playground/hooks/usePlaygroundStream';
import { GUEST_REQUEST_LIMIT, GUEST_IMAGE_LIMIT } from '@/lib/playground/tier-config';
import type { ModelBrand, ModelRegistryEntry, MMDConfig } from '@/lib/playground/types';
import { resolveModelAccess } from '@/lib/playground/types';
import { MMDDrawer } from '@/components/playground/MMDDrawer';
import { MMDColumn } from '@/components/playground/MMDColumn';
import { PlaygroundPromptBar } from '@/components/playground/PlaygroundPromptBar';
import { useMMD } from '@/lib/playground/hooks/useMMD';
import {
    freshGuestHistory,
    getGuestIdFromCookie,
    loadGuestHistory,
    saveGuestHistory,
    clearGuestHistory,
    flushGuestHistory,
    GUEST_HISTORY_MAX_TURNS,
    SCHEMA_VERSION,
    type GuestColumnPayload,
} from '@/lib/playground/guestHistory';
import type { DockAttachment } from '@/components/playground/AttachmentDock';
import type { ParamValues } from '@/components/playground/ParamsSidebar';
import { isDesktopApp, sendDesktopNotification } from '@/lib/desktop/desktop-bridge';
import { listLocalOllamaModels } from '@/lib/desktop/ollama-client';
import { PlaygroundLanding } from '@/components/playground/PlaygroundLanding';

// ─── Studio Imports ──────────────────────────────────────────────────────────
import { StudioNav, type StudioTab } from '@/components/studio/StudioNav';
import ImageStudio from '@/components/studio/ImageStudio';
import VideoStudio from '@/components/studio/VideoStudio';
import AudioStudio from '@/components/studio/AudioStudio';
import DesignStudio from '@/components/studio/DesignStudio';
import PresentationStudio from '@/components/studio/PresentationStudio';
import SkillsStudio from '@/components/studio/SkillsStudio';

// ─── Artifact Preview Imports ────────────────────────────────────────────────
import { PreviewPane } from '@/components/playground/PreviewPane';
import { detectArtifacts, mergeArtifactBlocks, type DetectedArtifact } from '@/lib/playground/artifact-parser';
import {
    parseBuildSuggestions,
    suggestionPromptFor,
    SUGGESTION_SYSTEM_PROMPT,
} from '@/lib/playground/build-suggestions';
import {
    chipPromptFor,
    CHIP_INFERENCE_SYSTEM_PROMPT,
    composeChipContract,
    isBuildIntent,
    randomStarter,
} from '@/lib/playground/prompt-chips';
import type { BuildSuggestion } from '@/lib/playground/types';

// ─── Workbench primitives + extracted column components ─────────────────────
import {
    MODELS,
    DEFAULT_MODEL_CYCLE,
    MAX_COLUMNS,
    genColumnId,
    modelById,
    nextDefaultModelId,
    createSendRegistry,
    type ColumnSlot,
    type SendRegistry,
} from '@/lib/playground/workbench';
import { PlaygroundColumn } from '@/components/playground/PlaygroundColumn';
import { ColumnGrid } from '@/components/playground/ColumnGrid';
import { GuestCTAModal } from '@/components/playground/GuestCTAModal';
import { GuestQuotaBanner } from '@/components/playground/GuestQuotaBanner';
import { SystemPromptModal } from '@/components/playground/SystemPromptModal';

// ─── Page component ─────────────────────────────────────────────────────────

export default function PlaygroundPage() {
    const router = useRouter();
    const { user, loading } = useUser();
    const { toast } = useToast();
    const [isDesktop, setIsDesktop] = useState(false);

    // The workbench is an app surface, not a webpage: lock body scroll while
    // this route is mounted so the document never scrolls past the viewport
    // (desktop shell and browser alike). Restored on unmount so marketing
    // and community pages keep their normal page scroll.
    useEffect(() => {
        const prevOverflow = document.body.style.overflow;
        const prevOverscroll = document.body.style.overscrollBehavior;
        document.body.style.overflow = 'hidden';
        document.body.style.overscrollBehavior = 'none';
        return () => {
            document.body.style.overflow = prevOverflow;
            document.body.style.overscrollBehavior = prevOverscroll;
        };
    }, []);

    const [localModels, setLocalModels] = useState<ModelRegistryEntry[]>([]);

    useEffect(() => {
        setIsDesktop(isDesktopApp());
        listLocalOllamaModels().then((models) => {
            if (models && models.length > 0) {
                const mapped: ModelRegistryEntry[] = models.map((m) => ({
                    id: `ollama:${m.name}`,
                    displayName: `${m.name} (Local)`,
                    provider: 'local' as const,
                    apiVersionId: m.name,
                    maxTokens: 8192,
                    brand: 'Local' as ModelBrand,
                    tier: 'local' as const,
                    access: 'guest' as const,
                    description: `Local model (${m.details?.parameter_size || 'Custom'}) running directly on your GPU via Ollama. 0 server load.`,
                    inputMultiplier: 0,
                    outputMultiplier: 0,
                    supportsReasoningEffort: false,
                    supportsAttachments: { image: false, audio: false, video: false, text: true },
                }));
                setLocalModels(mapped);
            }
        }).catch(() => {});
    }, []);

    const allModels = useMemo(() => [...localModels, ...MODELS], [localModels]);

    // ── Guest vs authed ──────────────────────────────────────────────────
    // Guests (no Firebase session) are admitted to /playground on a separate
    // request matrix: 10 weighted requests per 24h on guest-access models
    // (local Ollama + a curated set of cheap standard models). Once they sign
    // up they cross over to the credit matrix (5k credits /month, every model
    // in the registry). We no longer redirect unauthenticated visitors to
    // /login; instead we surface a guest banner with the remaining-request
    // counter and an upsell showing what an authed free user gets. `isGuest`
    // is false during the loading skeleton so we never misclassify a
    // not-yet-resolved session.
    const isGuest = !loading && !user;

    // Models a guest is allowed to pick
    const guestModels = useMemo(
        () => allModels.filter((m) => resolveModelAccess(m) === 'guest'),
        [allModels],
    );

    // ── Per-column send callbacks (stable ref-backed map). ───────────
    const registryRef = useRef<SendRegistry>(undefined);
    if (!registryRef.current) {
        registryRef.current = createSendRegistry();
    }



    // ── Column state ──────────────────────────────────────────────────
    // Initial seed uses the default cycle; if the visitor resolves to guest
    // mode (no Firebase session), a one-time effect below swaps the first
    // column to a guest-access model so the seed is always valid for the
    // caller's access path.
    const [columns, setColumns] = useState<ColumnSlot[]>(() => [
        { id: genColumnId(), modelId: DEFAULT_MODEL_CYCLE[0] },
    ]);

    // Guest-mode seed: once we know the visitor has no Firebase session,
    // swap any registered-only model choices for a guest-access fallback.
    // We only touch columns the user hasn't picked manually yet (the seed),
    // identified by checking against `DEFAULT_MODEL_CYCLE` membership.
    useEffect(() => {
        if (!isGuest) return;
        if (guestModels.length === 0) return;
        const fallback = guestModels[0].id;
        setColumns((prev) =>
            prev.map((col) =>
                guestModels.some((m) => m.id === col.modelId)
                    ? col
                    : { ...col, modelId: fallback },
            ),
        );
    }, [isGuest, guestModels]);

    // Active guest-quota snapshot surfaced from any column's 402 response.
    // We hold it at the page level so the header banner can render it
    // regardless of which column surfaced the update.
    const [guestQuota, setGuestQuota] = useState<GuestQuotaSnapshot | null>(null);
    // CTA modal shown when the guest's request pool is exhausted.
    const [showCTAModal, setShowCTAModal] = useState(false);
    useEffect(() => {
        if (!guestQuota) return;
        const remaining = Math.max(0, guestQuota.requestsLimit - guestQuota.requestsUsed);
        if (remaining <= 0) setShowCTAModal(true);
    }, [guestQuota]);

    // ── Global parameter state (single source of truth) ──────────────
    const [paramValues, setParamValues] = useState<ParamValues>({
        temperature: 0.7,
        topP: 0.95,
        maxTokens: 4096,
        reasoningEffort: 'none',
        systemPrompt: '',
    });
    const [applyToAll, setApplyToAll] = useState(true);

    // ── Staged attachments (shared across columns for the prompt bar) ─
    const [attachments, setAttachments] = useState<DockAttachment[]>([]);

    // ── Prompt input ──────────────────────────────────────────────────
    const [promptAll, setPromptAll] = useState<string>('');
    const [promptSelected, setPromptSelected] = useState<string>('');
    const [hasInteracted, setHasInteracted] = useState(false);

    // ── System-prompt editor modal ───────────────────────────────────
    const [sysPromptOpen, setSysPromptOpen] = useState(false);

    // ── Attach-menu state (the (+) button context menu in the prompt bar) ──
    const [attachMenuOpen, setAttachMenuOpen] = useState(false);
    const [promptDragOver, setPromptDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    /**
     * Ingest a list of dropped / pasted / picked files into the
     * shared `attachments` state. Mirrors `AttachmentDock`'s logic
     * (4 MiB cap, FileReader → data URL) so the rest of the pipeline
     * doesn't notice the source. Errors surface a toast.
     */
    const ingestFiles = useCallback(
        async (files: FileList | File[]): Promise<void> => {
            const list = Array.from(files);
            if (list.length === 0) return;
            const accepted: DockAttachment[] = [];
            const rejected: string[] = [];
            for (const file of list) {
                if (file.size > 15 * 1024 * 1024) {
                    rejected.push(`"${file.name}" is too large (max 15 MiB).`);
                    continue;
                }
                try {
                    const dataUrl = await fileToOptimizedDataUrl(file);
                    if (!dataUrl) throw new Error('Conversion failed');
                    accepted.push({
                        id:
                            typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                                ? crypto.randomUUID()
                                : `att-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                        name: file.name,
                        mimeType: file.type.startsWith('image/') ? 'image/jpeg' : (file.type || 'application/octet-stream'),
                        dataUrl,
                        size: file.size,
                    });
                } catch {
                    rejected.push(`Failed to read "${file.name}".`);
                }
            }
            if (accepted.length > 0) {
                setAttachments((prev) => [...prev, ...accepted]);
            }
            for (const msg of rejected) {
                toast({ title: 'Attachment skipped', description: msg, variant: 'destructive' });
            }
        },
        [toast],
    );

    // ── MMD State ─────────────────────────────────────────────────────
    const [mmdConfig, setMmdConfig] = useState<MMDConfig>({
        enabled: false,
        discussionType: 'single',
        executionMode: 'parallel',
        rounds: 3,
        chairmanModelId: DEFAULT_MODEL_CYCLE[0],
        includeOneObserver: true,
        mode: 'default',
        selectedColumnIds: [],
        timeoutMs: 30000,
        retries: 1,
        weighting: {},
        creditLimit: 500,
    });
    const [drawerOpen, setDrawerOpen] = useState(false);

    // ── Creative Studio States ───────────────────────────────────────────
    const [activeTab, setActiveTab] = useState<StudioTab | null>(() => {
        if (typeof window !== 'undefined') {
            const saved = window.sessionStorage.getItem('__cd_playground_active_tab');
            if (saved) return saved as StudioTab;
        }
        return null;
    });
    useEffect(() => {
        if (activeTab) window.sessionStorage.setItem('__cd_playground_active_tab', activeTab);
        else window.sessionStorage.removeItem('__cd_playground_active_tab');
    }, [activeTab]);
    // NOTE: the sidebar's collapsed state (and the `localStorage` key
    // `__cd_playground_sidebar_collapsed` that persisted it) was removed with
    // the sidebar itself — StudioNav is a horizontal bar with nothing to
    // collapse. The active tab above is now the only persisted nav state.

    // ── Active Artifact Preview ──────────────────────────────────────────────
    // Populated when the user clicks "Preview" on a detected code block.
    const [activeArtifact, setActiveArtifact] = useState<DetectedArtifact | null>(null);
    const [isPreviewCollapsed, setIsPreviewCollapsed] = useState(false);
    const [previewWidthPct, setPreviewWidthPct] = useState(50);
    const isDraggingRef = useRef(false);

    // ── Capability chips (Google AI Studio's "AI Chips", adapted) ───────────
    // Building an app is a feature OF the workbench, not a separate mode:
    // when the draft reads like a build request a strategist model infers
    // the chips adequate for that app; presets back the cold/rejected lane.
    const [inferredChips, setInferredChips] = useState<BuildSuggestion[]>([]);
    const [inferredChipsLoading, setInferredChipsLoading] = useState(false);
    const [selectedStaticChips, setSelectedStaticChips] = useState<string[]>([]);
    const [selectedInferredChips, setSelectedInferredChips] = useState<string[]>([]);
    const chipCacheRef = useRef<Map<string, BuildSuggestion[]>>(new Map());

    // Post-generation strategist rail (workbench-wide, un-gated in PreviewPane).
    const [buildSuggestions, setBuildSuggestions] = useState<BuildSuggestion[] | null>(null);
    const [buildSuggestionsLoading, setBuildSuggestionsLoading] = useState(false);

    const handleTogglePreview = useCallback(() => {
        setIsPreviewCollapsed((prev) => !prev);
    }, []);

    const handleMouseDownResize = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        isDraggingRef.current = true;
        const onMouseMove = (moveEvent: MouseEvent) => {
            if (!isDraggingRef.current) return;
            const newPct = Math.max(25, Math.min(75, ((window.innerWidth - moveEvent.clientX) / window.innerWidth) * 100));
            setPreviewWidthPct(newPct);
        };
        const onMouseUp = () => {
            isDraggingRef.current = false;
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    }, []);

    // ── Build Mode: AI feature-suggestion strategist stream ────────────────
    // Runs through the same credit pipeline as a normal prompt, billed to
    // the first column's model. The reply is parsed into clickable chips;
    // applying one composes an enhancement prompt back into the chat input.
    const suggestionStream = usePlaygroundStream(
        columns[0]?.modelId ?? MODELS[0].id,
        isGuest,
        (text) => {
            setBuildSuggestions(parseBuildSuggestions(text));
            setBuildSuggestionsLoading(false);
        },
    );

    // ── Chip inference stream: reads the draft and proposes chips ──────────
    // Restricted to signed-in tiers: inference runs through the credit
    // pipeline under the USER's own subscription (never guest pool / house
    // cost); the reply is parsed into toggleable chips.
    const chipDraftRef = useRef<string>('');
    const chipStream = usePlaygroundStream(
        columns[0]?.modelId ?? MODELS[0].id,
        false, // chip inference is signed-in-only — never bill the guest pool
        (text) => {
            const parsed = parseBuildSuggestions(text).slice(0, 5);
            if (parsed.length > 0) {
                chipCacheRef.current.set(chipDraftRef.current, parsed);
                setInferredChips(parsed);
            }
            setInferredChipsLoading(false);
        },
    );

    // Debounced inference: SIGNED-IN TIERS ONLY (billed to the user's own
    // credits, never the house); only fires on build intents; prompt-hash
    // cached; rejections (auth, network) fall back to the static lane.
    useEffect(() => {
        const draft = promptAll.trim();
        if (isGuest || draft.length < 12 || !isBuildIntent(draft)) {
            setInferredChips([]);
            setInferredChipsLoading(false);
            return;
        }
        const cached = chipCacheRef.current.get(draft);
        if (cached) {
            setInferredChips(cached);
            setInferredChipsLoading(false);
            return;
        }
        const timer = setTimeout(() => {
            setInferredChipsLoading(true);
            chipDraftRef.current = draft;
            chipStream.reset();
            void chipStream.send(chipPromptFor(draft), {
                systemPrompt: CHIP_INFERENCE_SYSTEM_PROMPT,
                maxTokens: 256,
                temperature: 0.7,
            }).catch(() => {
                setInferredChipsLoading(false);
                setInferredChips([]);
            });
        }, 700);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [promptAll, isGuest]);

    const handleToggleStaticChip = useCallback((id: string) => {
        setSelectedStaticChips((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    }, []);

    const handleToggleInferredChip = useCallback((title: string) => {
        setSelectedInferredChips((prev) => (prev.includes(title) ? prev.filter((x) => x !== title) : [...prev, title]));
    }, []);

    const handleRequestSuggestions = useCallback((code: string) => {
        setBuildSuggestionsLoading(true);
        suggestionStream.reset();
        // Rejections (guest quota exhausted, auth, network) must release the
        // spinner and surface the empty state, not hang the rail.
        void suggestionStream.send(suggestionPromptFor(code), {
            systemPrompt: SUGGESTION_SYSTEM_PROMPT,
            maxTokens: 512,
            temperature: 0.7,
        }).catch(() => {
            setBuildSuggestionsLoading(false);
            setBuildSuggestions([]);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [suggestionStream.send, suggestionStream.reset]);

    /**
     * Inject a composed prompt into the main chat input using the native
     * value setter + an input event so React's controlled onChange fires.
     * Targeted by id so we never hit the preview pane's own code editor.
     */
    const injectPrompt = useCallback((text: string) => {
        const box = document.getElementById('playground-prompt-input') as HTMLTextAreaElement | null;
        if (!box) return;
        const nativeSetter = Object.getOwnPropertyDescriptor(
            HTMLTextAreaElement.prototype, 'value',
        )?.set;
        nativeSetter?.call(box, text);
        box.dispatchEvent(new Event('input', { bubbles: true }));
        box.focus();
    }, []);

    // ParamOptions constructed dynamically
    const paramOptions = useMemo(() => ({
        ...(paramValues.systemPrompt && paramValues.systemPrompt.trim().length > 0
            ? { systemPrompt: paramValues.systemPrompt }
            : {}),
        ...(typeof paramValues.temperature === 'number' ? { temperature: paramValues.temperature } : {}),
        ...(typeof paramValues.topP === 'number' ? { topP: paramValues.topP } : {}),
        ...(typeof paramValues.maxTokens === 'number' ? { maxTokens: paramValues.maxTokens } : {}),
        ...(paramValues.reasoningEffort ? { reasoningEffort: paramValues.reasoningEffort } : {}),
        ...(attachments.length > 0
            ? {
                attachments: attachments.map((a) => ({
                    mimeType: a.mimeType,
                    dataUrl: a.dataUrl,
                })),
            }
            : {}),
    }), [paramValues, attachments]);

    // Instantiate Chairman's stream hook
    const chairmanStream = usePlaygroundStream(mmdConfig.chairmanModelId, isGuest, (text) => {
        mmd.onChairmanComplete(text);
    });

    // Deep-link entry: ?build=1 primes the build preset and seeds a buildable draft.
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (new URLSearchParams(window.location.search).get('build') === '1') {
            setParamValues((prev) => ({ ...prev, modeId: 'build' }));
            const starter = randomStarter();
            setPromptAll((prev) => (prev.trim() ? prev : starter));
            setPromptSelected((prev) => (prev.trim() ? prev : starter));
        }
    }, []);

    const mmd = useMMD({
        columns,
        mmdConfig,
        registry: registryRef.current,
        chairmanStream,
        models: MODELS,
        paramOptions,
    });

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const params = new URLSearchParams(window.location.search);
        const mmdParam = params.get('mmd') === '1';
        const modeParam = params.get('mode') === 'selective' ? 'selective' : 'default';
        const roundsParam = parseInt(params.get('rounds') || '3', 10);

        setMmdConfig(prev => ({
            ...prev,
            enabled: mmdParam,
            mode: modeParam,
            rounds: roundsParam,
        }));
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const params = new URLSearchParams(window.location.search);
        if (mmdConfig.enabled) {
            params.set('mmd', '1');
            params.set('mode', mmdConfig.mode);
            params.set('rounds', String(mmdConfig.rounds));
        } else {
            params.delete('mmd');
            params.delete('mode');
            params.delete('rounds');
        }
        const newSearch = params.toString();
        const newUrl = `${window.location.pathname}${newSearch ? '?' + newSearch : ''}`;
        window.history.replaceState(null, '', newUrl);
    }, [mmdConfig.enabled, mmdConfig.mode, mmdConfig.rounds]);


    const [quota, setQuota] = useState<{
        creditsUsed: number;
        creditsLimit: number;
        tier: string;
    } | null>(null);

    const fetchQuota = useCallback(async () => {
        try {
            const headers: Record<string, string> = {};
            if (user) {
                const idToken = await user.getIdToken();
                headers['Authorization'] = `Bearer ${idToken}`;
            }
            const res = await fetch('/api/playground/quota', { headers, credentials: 'include', cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                if (data.mode === 'authed') {
                    setQuota({
                        creditsUsed: data.creditsUsed,
                        creditsLimit: data.creditsLimit,
                        tier: data.tier,
                    });
                    return;
                }
                if (data.mode === 'guest') {
                    // Mirror the server's pool snapshot into the page-level
                    // guestQuota so the header banner + landing greeting
                    // decrement after each successful prompt.
                    setGuestQuota({
                        requestsUsed: typeof data.used === 'number' ? data.used : 0,
                        requestsLimit: typeof data.limit === 'number' ? data.limit : GUEST_REQUEST_LIMIT,
                        imageLimit: typeof data.imageLimit === 'number' ? data.imageLimit : GUEST_IMAGE_LIMIT,
                        imageUsed: typeof data.imageUsed === 'number' ? data.imageUsed : 0,
                        imageRemaining: typeof data.imageRemaining === 'number' ? data.imageRemaining : GUEST_IMAGE_LIMIT,
                        windowResetsAt: typeof data.windowResetsAt === 'number' && data.windowResetsAt > 0
                            ? data.windowResetsAt
                            : Date.now() + 72 * 60 * 60 * 1000,
                    });
                }
            }
        } catch (err) {
            console.error('Error fetching quota:', err);
        }
    }, [user]);

    useEffect(() => {
        if (loading) return;
        fetchQuota();
        const interval = setInterval(fetchQuota, 30000);
        return () => clearInterval(interval);
    }, [loading, fetchQuota]);

    const displayQuota = useMemo(() => {
        // Surface the real server snapshot only — never synthesise a fake
        // free/developer allowance while the quota fetch is pending. The old
        // fallback here flashed "Dev · 25,000 credits" in the header before the
        // real /api/playground/quota response landed, which was misleading for
        // free-tier users (audit #5).
        if (quota) return quota;
        return null;
    }, [quota]);

    const tierLabel = useMemo(() => {
        if (loading) return 'Loading…';
        if (!user) return 'Guest';
        if (displayQuota?.tier) {
            const t = displayQuota.tier.trim().toLowerCase();
            if (t === 'developer') return 'Dev';
            return t.charAt(0).toUpperCase() + t.slice(1);
        }
        // Quota not yet resolved — neutral placeholder instead of a guess.
        return '—';
    }, [loading, user, displayQuota]);

    const initials = useMemo(() => {
        if (!user) return '';
        if (user.displayName) {
            const parts = user.displayName.split(' ');
            return parts.map((p) => p[0]).join('').slice(0, 2).toUpperCase();
        }
        if (user.email) {
            return user.email.slice(0, 2).toUpperCase();
        }
        return 'U';
    }, [user]);

    const addColumn = useCallback((): void => {
        // `toast` dispatches state on the toaster component, so it MUST run
        // here (a normal event-handler call site), NOT inside the `setColumns`
        // updater — the updater executes during React's render phase, and
        // calling `toast` there triggers a cross-component setState-during-render
        // ("Cannot update FirebaseErrorListener while rendering PlaygroundPage").
        if (columns.length >= MAX_COLUMNS) {
            toast({
                title: 'Column limit reached',
                description: `You can compare up to ${MAX_COLUMNS} models side-by-side.`,
                variant: 'destructive',
            });
            return;
        }
        setColumns((prev) => {
            const usedIds = new Set(prev.map((c) => c.modelId));
            const modelId = nextDefaultModelId(usedIds);
            return [...prev, { id: genColumnId(), modelId }];
        });
    }, [toast, columns.length]);

    const removeColumn = useCallback((columnId: string): void => {
        setColumns((prev) => {
            if (prev.length <= 1) {
                return prev;
            }
            return prev.filter((c) => c.id !== columnId);
        });
    }, []);

    const updateColumnModel = useCallback((columnId: string, modelId: string): void => {
        setColumns((prev) => prev.map((c) => (c.id === columnId ? { ...c, modelId } : c)));
    }, []);

    // ── Sign-up CTA ────────────────────────────────────────────────────
    // Centralised so the header banner, the inline column upsell, and the
    // page-level guards all navigate to the same place. We deliberately
    // flush any pending guest-history write BEFORE navigating, so the
    // localStorage entry is in its final state by the time the user lands
    // on /login and then returns.
    const handleSignUp = useCallback((): void => {
        const guestId = getGuestIdFromCookie();
        if (guestId) {
            // `immediate: true` clears the debounce timer AND writes now.
            saveGuestHistory(
                guestId,
                { ...currentHistoryRef.current, version: SCHEMA_VERSION },
                { immediate: true },
            );
        }
        // /login is sign-in only and never read `mode`, so this sent a guest
        // with no account to a form that could only tell them to register
        // first. /register is the actual signup page and honours `redirect`,
        // returning them here with the locked studios unlocked.
        router.push('/register?redirect=%2Fplayground%2Fapp');
    }, [router]);

    // ── Guest chat-history persistence ─────────────────────────────────
    // We mirror the column state into localStorage on every mutation so a
    // guest who signs up mid-session has their prompts loaded into the
    // authed session when they return.
    const currentHistoryRef = useRef<{
        columns: GuestColumnPayload[];
        savedAt: number;
        version: number;
    }>(freshGuestHistory());
    useEffect(() => {
        if (!isGuest) return;
        const guestId = getGuestIdFromCookie();
        if (!guestId) return;
        // We don't currently capture the per-column messages here — the
        // streaming hook owns that state. The page-level snapshot we save
        // captures column id + modelId so the columns themselves can be
        // reconstructed; the prompt content is in the per-column hook
        // state and isn't visible at this level. The plan explicitly
        // accepts this trade-off: the model choice + column count is
        // preserved across the auth flip, and a follow-up can surface
        // the per-column messages via a separate `useImperativeHandle`
        // bridge if richer hydration becomes a requirement.
        const payload = {
            version: SCHEMA_VERSION,
            columns: columns.map((col) => ({
                id: col.id,
                modelId: col.modelId,
                messages: [],
                ...(paramValues
                    ? { paramValues: paramValues as unknown as Record<string, unknown> }
                    : {}),
            })),
            savedAt: Date.now(),
        };
        currentHistoryRef.current = payload;
        saveGuestHistory(guestId, payload);
    }, [columns, paramValues, isGuest]);

    // Flush on tab close / hide so the most recent turn isn't lost.
    useEffect(() => {
        if (!isGuest) return;
        function flush(): void {
            const guestId = getGuestIdFromCookie();
            if (guestId) flushGuestHistory(guestId);
        }
        window.addEventListener('pagehide', flush);
        document.addEventListener('visibilitychange', flush);
        return () => {
            window.removeEventListener('pagehide', flush);
            document.removeEventListener('visibilitychange', flush);
        };
    }, [isGuest]);

    // Once-only hydration on the auth-flip transition: when `user` first
    // becomes truthy after being null, load the persisted guest history and
    // merge it into the current columns, then clear the localStorage key.
    const hydratedRef = useRef<string | null>(null);
    useEffect(() => {
        if (loading) return;
        if (!user) return; // not yet authed
        const uid = user.uid;
        if (hydratedRef.current === uid) return; // already hydrated for this user
        hydratedRef.current = uid;

        const guestId = getGuestIdFromCookie();
        if (!guestId) return;
        const history = loadGuestHistory(guestId);
        if (history && history.columns.length > 0) {
            setHasInteracted(true);
            setColumns((prev) => {
                const byId = new Map(history.columns.map((c) => [c.id, c]));
                return prev.map((col) => {
                    const h = byId.get(col.id);
                    if (h && MODELS.some((m) => m.id === h.modelId)) {
                        return { ...col, modelId: h.modelId };
                    }
                    return col;
                });
            });
        }
        clearGuestHistory(guestId);
    }, [loading, user]);

    const handleSend = useCallback((text: string, scope: 'all' | 'selected'): void => {
        text = text.trim();
        if (text.length === 0) {
            toast({
                title: 'Empty prompt',
                description: 'Type something before sending.',
                variant: 'destructive',
            });
            return;
        }
        if (columns.length === 0) {
            toast({
                title: 'Add a column first',
                description: 'Drop in at least one model before dispatching a prompt.',
                variant: 'destructive',
            });
            return;
        }

        // Build intent detected without an explicit mode → run the build preset.
        const activeMode = getModeById(paramValues.modeId) ?? (isBuildIntent(text) ? getModeById('build') : undefined);
        const modePrompt = activeMode?.systemPrompt;
        const baseSysPrompt = paramValues.systemPrompt;
        const chipContract = composeChipContract(selectedStaticChips, selectedInferredChips);
        const combinedSysPrompt = [modePrompt, baseSysPrompt, chipContract].filter(Boolean).join('\n\n');

        const options: PlaygroundStreamSendOptions = {
            ...(combinedSysPrompt.trim().length > 0
                ? { systemPrompt: combinedSysPrompt }
                : {}),
            ...(typeof paramValues.temperature === 'number' ? { temperature: paramValues.temperature } : {}),
            ...(typeof paramValues.topP === 'number' ? { topP: paramValues.topP } : {}),
            ...(typeof paramValues.maxTokens === 'number' ? { maxTokens: paramValues.maxTokens } : {}),
            ...(paramValues.reasoningEffort ? { reasoningEffort: paramValues.reasoningEffort } : {}),
            ...(attachments.length > 0
                ? {
                    attachments: attachments.map((a) => ({
                        mimeType: a.mimeType,
                        dataUrl: a.dataUrl,
                    })),
                }
                : {}),
        };

        const selectedIds = mmdConfig.selectedColumnIds;

        // Clear input state & staged attachments immediately upon dispatch
        setPromptSelected('');
        setPromptAll('');
        setAttachments([]);
        setHasInteracted(true);

        // If specific windows are selected, send EXCLUSIVELY to those selected windows
        if (selectedIds.length > 0) {
            requestAnimationFrame(() => {
                registryRef.current!.fanOutSelective(text, options, selectedIds).then(() => {
                    fetchQuota();
                    sendDesktopNotification('Playground', `Completions finished for ${selectedIds.length} selected column${selectedIds.length > 1 ? 's' : ''}.`);
                });
            });
            return;
        }

        // If no windows are selected AND MMD is enabled, run full MMD debate across all columns
        if (mmdConfig.enabled) {
            requestAnimationFrame(() => {
                void mmd.runMMD(text).then(() => {
                    fetchQuota();
                    sendDesktopNotification('Playground', 'Multi-model debate rounds completed.');
                });
            });
            return;
        }

        // Standard fan-out to all columns
        requestAnimationFrame(() => {
            registryRef.current!.fanOut(text, options).then(() => {
                fetchQuota();
                sendDesktopNotification('Playground', `Completions finished across ${columns.length} column${columns.length > 1 ? 's' : ''}.`);
            });
        });
    }, [attachments, columns.length, paramValues, toast, fetchQuota, mmdConfig.enabled, mmdConfig.selectedColumnIds, mmd, selectedStaticChips, selectedInferredChips]);

    // ── Auth gate render states ────────────────────────────────────────
    // While the Firebase auth state is being resolved we render a skeleton
    // that mirrors the war-room layout. This avoids a half-second flash of
    // empty columns AND avoids the user staring at a spinner if they happen
    // to be on a slow connection.
    if (loading) {
        return (
            <div className={`flex ${isDesktop ? 'min-h-[calc(100dvh-2.25rem)]' : 'min-h-dvh'} flex-col items-center justify-center text-foreground relative z-0`}>
                {/* Ambient video background */}
                <video
                    src="/playground_anim_bg.mp4"
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="absolute inset-0 w-full h-full object-cover -z-10 pointer-events-none"
                />

                {/* Frosted Glass loading panel */}
                <div className="w-full max-w-sm bg-white/10 dark:bg-white/5 backdrop-blur-xl border border-white/20 shadow-2xl rounded-2xl p-6 text-center space-y-4">
                    <Icon name="loading" className="h-10 w-10 animate-spin text-sky-400 mx-auto" />
                    <h2 className="text-sm font-bold uppercase tracking-wider text-white">Initializing Workbench</h2>
                    <p className="text-xs text-zinc-300 animate-pulse">Synchronizing secure session...</p>
                </div>
            </div>
        );
    }
    // Authed and guest both render the war room. The `isGuest` flag drives
    // the picker restrictions, the guest quota banner, and the localStorage
    // history key. The page no longer redirects guests away.

    return (
        // On the Tauri desktop shell the WindowsTitlebar header renders
        // in-flow above this root (h-9 = 2.25rem); size the root to the
        // remainder so the document is exactly one viewport tall and the
        // window never shows webpage-style scroll.
        <div className={`flex ${isDesktop ? 'h-[calc(100dvh-2.25rem)] min-h-[calc(100dvh-2.25rem)]' : 'h-[100dvh] min-h-[100dvh]'} flex-col text-foreground relative z-0 overflow-hidden`}>
            {/* Background Video & Watermark Cover */}
            <div className="absolute inset-0 -z-10 flex items-center justify-center overflow-hidden pointer-events-none">
                {/* 16:9 Wrapper that perfectly matches the video's uncropped bounds */}
                <div 
                    className="relative flex-none"
                    style={{ 
                        width: 'max(100vw, 177.7778vh)', 
                        height: 'max(100dvh, 56.25vw)' 
                    }}
                >
                    <SeamlessLoopVideo
                        sources={['/playground_anim_bg.mp4', '/playground_anim_bg2.mp4']}
                        className="absolute inset-0 w-full h-full"
                    />
                    
                    {/* Cybrdeck icon overlay mathematically locked to the 16:9 video frame coordinates and scale */}
                    <div className="absolute bottom-[16.5%] right-[9.4%] w-[3.6%] aspect-square translate-x-1/2 translate-y-1/2 pointer-events-none z-10">
                        <Image
                            src="/cybrdeck-logo/cybrdeck_icon.png"
                            alt="Cybrdeck"
                            fill
                            sizes="10vw"
                            className="opacity-95 object-contain drop-shadow-xl"
                        />
                    </div>
                </div>
            </div>
            {/* Guest quota exhaustion CTA modal */}
            {isGuest && showCTAModal && (
                <GuestCTAModal
                    onSignUp={handleSignUp}
                    onClose={() => setShowCTAModal(false)}
                />
            )}
            {!isDesktop && (
                <header className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-2 sm:gap-3 border-b border-border bg-background/85 px-2 sm:px-4 py-2 sm:py-3 backdrop-blur min-h-[48px]">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                        <Link href="/" className="hover:opacity-80 transition-opacity flex items-center gap-1.5 sm:gap-2.5">
                            <Image
                                src="/cybrdeck-logo/cybrdeck_logo_cropped_white.png"
                                alt="Cybrdeck Logo"
                                width={100}
                                height={26}
                                className="h-4 sm:h-5 w-auto object-contain"
                                priority
                            />
                            <span className="hidden sm:inline-block text-zinc-800 font-light select-none">|</span>
                            <span className="hidden sm:inline-block text-brand-400 text-[11px] font-bold tracking-widest uppercase mt-0.5">Playground</span>
                        </Link>

                        <div className="hidden sm:block pl-2 border-l border-white/10">
                            <OneStatusBadge />
                        </div>

                        {/*
                         * Guest banner — only rendered when the visitor has no
                         * Firebase session. Shows the live 24h request-pool
                         * counter, the authed-free comparison, and a sign-up CTA.
                         */}
                        {isGuest && (
                            <GuestQuotaBanner
                                snapshot={guestQuota}
                                onSignUp={(): void => router.push('/register?redirect=%2Fplayground%2Fapp')}
                                onSignIn={(): void => router.push('/login?redirect=/playground/app')}
                            />
                        )}
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2">
                        <Link href="/">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 sm:h-8 gap-1 sm:gap-1.5 text-[10px] sm:text-xs font-mono text-zinc-400 hover:text-white px-2 sm:px-3"
                            >
                                <Icon name="arrow-left-md" className="h-3 sm:h-3.5 w-3 sm:w-3.5" />
                                <span className="hidden sm:inline">Back Home</span>
                            </Button>
                        </Link>

                        {user && (
                            <Avatar className="h-7 w-7 border border-border/80 shadow-sm flex-shrink-0">
                                {user.photoURL && (
                                    <AvatarImage src={user.photoURL} alt={user.displayName ?? 'User avatar'} />
                                )}
                                <AvatarFallback className="text-[9px] font-mono font-bold bg-zinc-800 text-zinc-300">
                                    {initials}
                                </AvatarFallback>
                            </Avatar>
                        )}
                        {isGuest && (
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={handleSignUp}
                                title="Create a free account to compare models side-by-side"
                                className="h-7 sm:h-8 px-2 sm:px-3 text-[10px] sm:text-xs opacity-60 border-dashed"
                            >
                                <Icon name="plus" className="h-3 sm:h-3.5 w-3 sm:w-3.5" aria-hidden />
                                <span className="hidden sm:inline">Sign up for multi-model</span>
                            </Button>
                        )}
                    </div>
                </header>
            )}

            <div className="flex flex-col flex-1 min-h-0 relative">
                <StudioNav
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    isGuest={isGuest}
                    onSignUp={handleSignUp}
                    tierLabel={tierLabel}
                    creditsUsed={user && displayQuota ? displayQuota.creditsUsed : undefined}
                    creditsLimit={user && displayQuota ? displayQuota.creditsLimit : undefined}
                    // Guests have prompts and images, not credits. Passing the
                    // real snapshot is what lets the bar stop inventing a
                    // credit balance for them.
                    guestQuota={isGuest ? guestQuota : null}
                    user={user ? { photoURL: user.photoURL, displayName: user.displayName } : null}
                    initials={initials}
                    isDesktop={isDesktop}
                />

                <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden">
                    {activeTab === 'image' && <ImageStudio onClose={(): void => setActiveTab(null)} />}
                    {activeTab === 'video' && <VideoStudio onClose={(): void => setActiveTab(null)} />}
                    {activeTab === 'audio' && <AudioStudio onClose={(): void => setActiveTab(null)} />}
                    {activeTab === 'design' && <DesignStudio onClose={(): void => setActiveTab(null)} />}
                    {activeTab === 'presentation' && <PresentationStudio onClose={(): void => setActiveTab(null)} />}
                    {activeTab === 'skills' && <SkillsStudio onClose={(): void => setActiveTab(null)} />}

                    {!activeTab && !hasInteracted && (
                        <PlaygroundLanding
                            prompt={promptAll}
                            onPromptChange={(v) => {
                                setPromptAll(v);
                                setPromptSelected(v);
                            }}
                            onSend={handleSend}
                            mmdEnabled={mmdConfig.enabled}
                            onMmdEnabledChange={(enabled) => {
                                setMmdConfig(prev => ({ ...prev, enabled }));
                                if (enabled && columns.length < 2) {
                                    addColumn();
                                }
                            }}
                            guestMode={isGuest}
                            guestQuota={guestQuota ? Math.max(0, guestQuota.requestsLimit - guestQuota.requestsUsed) : null}
                            guestModelId={columns[0]?.modelId}
                            onGuestModelChange={(id) => updateColumnModel(columns[0]?.id, id)}
                            guestModels={guestModels}
                            userModelId={columns[0]?.modelId}
                            onUserModelChange={(id) => updateColumnModel(columns[0]?.id, id)}
                            userModels={[...MODELS]}
                            columns={columns}
                            onUpdateColumnModel={updateColumnModel}
                            onRemoveColumn={removeColumn}
                            onAddColumn={addColumn}
                            showChips={!mmdConfig.enabled}
                            inferredChips={inferredChips}
                            inferredChipsLoading={inferredChipsLoading}
                            selectedStaticChips={selectedStaticChips}
                            selectedInferredChips={selectedInferredChips}
                            onToggleStaticChip={handleToggleStaticChip}
                            onToggleInferredChip={handleToggleInferredChip}
                        />
                    )}

                    {!activeTab && hasInteracted && (
                        <>
                            {/* Full-height flex row: left = chat+input, right = preview */}
                            <div className="flex flex-1 min-h-0 overflow-hidden">
                                {/* Left col: scrollable chat + sticky input bar */}
                                <div
                                    style={
                                        activeArtifact && !isPreviewCollapsed
                                            ? { width: `${100 - previewWidthPct}%`, flex: 'none' }
                                            : { flex: '1 1 0%' }
                                    }
                                    className="flex flex-col min-h-0 overflow-hidden transition-all duration-150"
                                >
                                    <main className="relative flex-1 flex flex-col overflow-hidden px-2 sm:px-4 py-2 sm:py-4 min-h-0">
                                        <ColumnGrid
                                            columns={columns}
                                            mmdEnabled={mmdConfig.enabled}
                                            renderMMDWindow={() => (
                                                <MMDColumn
                                                    key="mmd-chair"
                                                    config={mmdConfig}
                                                    state={mmd.mmdState}
                                                    round={mmd.mmdRound}
                                                    stream={chairmanStream}
                                                    model={modelById(mmdConfig.chairmanModelId)}
                                                    onConfigClick={() => setDrawerOpen(true)}
                                                />
                                            )}
                                            renderColumn={(col) => {
                                                const isIncluded = mmdConfig.selectedColumnIds.includes(col.id);
                                                return (
                                                    <PlaygroundColumn
                                                        key={col.id}
                                                        columnId={col.id}
                                                        modelId={col.modelId}
                                                        attachments={attachments}
                                                        onRemove={(): void => removeColumn(col.id)}
                                                        onModelChange={(next): void => updateColumnModel(col.id, next)}
                                                        paramValues={paramValues}
                                                        onParamChange={setParamValues}
                                                        applyToAll={applyToAll}
                                                        onApplyToAllChange={setApplyToAll}
                                                        onOpenSystemPrompt={(): void => setSysPromptOpen(true)}
                                                        registry={registryRef.current!}
                                                        guestMode={isGuest}
                                                        onGuestQuota={setGuestQuota}
                                                        onSignUp={handleSignUp}
                                                        onComplete={(text) => {
                                                            mmd.onColumnComplete(col.id, text);
                                                            const merged = mergeArtifactBlocks(text);
                                                            const detected = merged ? [merged] : detectArtifacts(text);
                                                            if (detected.length > 0) {
                                                                setActiveArtifact(detected[0]);
                                                                setIsPreviewCollapsed(false);
                                                            }
                                                        }}
                                                        isMMDEnabled={mmdConfig.enabled}
                                                        isMMDIncluded={isIncluded}
                                                        onToggleMMDInclusion={() => {
                                                            const selected = [...mmdConfig.selectedColumnIds];
                                                            const idx = selected.indexOf(col.id);
                                                            if (idx > -1) {
                                                                selected.splice(idx, 1);
                                                            } else {
                                                                selected.push(col.id);
                                                            }
                                                            setMmdConfig({ ...mmdConfig, selectedColumnIds: selected });
                                                        }}
                                                        setActiveArtifact={(art) => {
                                                            setActiveArtifact(art);
                                                            if (art) setIsPreviewCollapsed(false);
                                                        }}
                                                        onMakeApp={(art) => {
                                                            // "Make this an App": promote the artifact to the
                                                            // preview and flip the workbench into the build preset.
                                                            setActiveArtifact(art);
                                                            setIsPreviewCollapsed(false);
                                                            setParamValues((prev) => ({ ...prev, modeId: 'build' }));
                                                            setBuildSuggestions(null);
                                                        }}
                                                        onTogglePreview={handleTogglePreview}
                                                        isPreviewActive={!!activeArtifact && !isPreviewCollapsed}
                                                        isSingleMode={!mmdConfig.enabled && columns.length === 1}
                                                        availableModels={allModels}
                                                    />
                                                );
                                            }}
                                        />
                                    </main>

                                {/* Chatbox + footer inside left col so preview spans full height */}
                                <div id="playground-chatbox" className="sticky bottom-4 z-30 w-full bg-transparent pointer-events-none px-4">
                                <div className="mx-auto w-full max-w-4xl pointer-events-auto">
                                    {/* Compact attached-file dock */}
                                    {attachments.length > 0 && (
                                        <div className="mb-2 flex flex-wrap gap-1.5 p-2 rounded-xl bg-[#031d24] border border-brand-900/60 shadow-lg">
                                            {attachments.map((att) => (
                                                <div key={att.id} className="relative group/att">
                                                    <div className="relative w-12 h-12 rounded-md overflow-hidden border border-brand-800/40 bg-black/40">
                                                        {att.mimeType.startsWith('image/') ? (
                                                            // eslint-disable-next-line @next/next/no-img-element
                                                            <img
                                                                src={att.dataUrl}
                                                                alt={att.name ?? 'Attached image'}
                                                                className="h-full w-full object-cover"
                                                            />
                                                        ) : att.mimeType.startsWith('video/') ? (
                                                            <video
                                                                src={att.dataUrl}
                                                                className="h-full w-full object-cover"
                                                                aria-label={att.name ?? 'Attached video'}
                                                            />
                                                        ) : (
                                                            <div className="flex h-full w-full flex-col items-center justify-center gap-0.5">
                                                                <Icon name="file-document" className="h-4 w-4 text-brand-400" />
                                                            </div>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={() => setAttachments((prev) => prev.filter((a) => a.id !== att.id))}
                                                            className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-black/90 border border-brand-500/50 flex items-center justify-center opacity-0 group-hover/att:opacity-100 transition-opacity"
                                                            aria-label={`Remove ${att.name}`}
                                                        >
                                                            <Icon name="close-md" className="h-2.5 w-2.5 text-brand-200" />
                                                        </button>
                                                    </div>
                                                    {att.name && (
                                                        <span className="block text-[8px] text-brand-300/60 truncate max-w-12 mt-0.5 text-center leading-tight">
                                                            {att.name}
                                                        </span>
                                                    )}
                                                </div>
                                            ))}
                                            {attachments.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => setAttachments([])}
                                                    className="flex items-center justify-center w-12 h-12 rounded-md border border-brand-800/40 bg-brand-950/40 text-[10px] text-brand-400 hover:text-brand-200 hover:bg-brand-900/40 transition-colors"
                                                    title="Clear all attachments"
                                                >
                                                    <span className="leading-tight text-center">Clear<br />all</span>
                                                </button>
                                            )}
                                        </div>
                                    )}

                                    {/* Redesigned Prompt Bar */}
                                    {(() => {
                                        const maxContextLimit = Math.max(
                                            128000,
                                            ...columns.map((col) => modelById(col.modelId)?.maxTokens || 128000)
                                        );

                                        return (
                                            <PlaygroundPromptBar
                                                prompt={promptAll}
                                                onPromptChange={(val) => {
                                                    setPromptAll(val);
                                                    setPromptSelected(val);
                                                }}
                                                onSend={(mode) => handleSend(promptAll, mode)}
                                                isGuest={isGuest}
                                                columnCount={columns.length}
                                                maxColumns={MAX_COLUMNS}
                                                onAddColumn={addColumn}
                                                mmdEnabled={mmdConfig.enabled}
                                                onToggleMmd={() => {
                                                    const nextEnabled = !mmdConfig.enabled;
                                                    setMmdConfig((prev) => ({ ...prev, enabled: nextEnabled }));
                                                    setParamValues((prev) => ({
                                                        ...prev,
                                                        modeId: nextEnabled ? 'debate' : 'code',
                                                    }));
                                                }}
                                                onOpenMmdSettings={() => setDrawerOpen(true)}
                                                selectedColumnCount={mmdConfig.selectedColumnIds.length}
                                                totalTokensUsed={0}
                                                maxContextLimit={maxContextLimit}
                                                sessionCost={0}
                                                onIngestFiles={(files) => void ingestFiles(files)}
                                            />
                                        );
                                })()}
                                </div>
                            </div>

                            <div className="text-xs text-muted-foreground opacity-70 select-none tracking-wide text-center mt-8">
                                by Eve Count
                            </div>
                        </div>{/* end left col */}

                                {/* Draggable Splitter Handle & Resizable Preview Drawer */}
                                {activeArtifact && !isPreviewCollapsed && (
                                    <>
                                        {/* Drag Handle */}
                                        <div
                                            onMouseDown={handleMouseDownResize}
                                            className="w-1.5 hover:w-2 bg-border hover:bg-sky-500/50 cursor-col-resize transition-all shrink-0 flex items-center justify-center group"
                                            title="Drag to resize preview pane"
                                        >
                                            <div className="h-8 w-1 rounded-full bg-muted-foreground/40 group-hover:bg-sky-400" />
                                        </div>

                                        {/* Preview Pane */}
                                        <div
                                            style={{ width: `${previewWidthPct}%` }}
                                            className="flex-none min-w-0 h-full transition-all duration-150"
                                        >
                                            <PreviewPane
                                                artifact={activeArtifact}
                                                onClose={() => setIsPreviewCollapsed(true)}
                                                onRemix={(code) => {
                                                    injectPrompt(`Refine and improve this prototype code:\n\n\`\`\`tsx\n${code}\n\`\`\``);
                                                }}
                                                suggestions={buildSuggestions}
                                                suggestionsLoading={buildSuggestionsLoading}
                                                onRequestSuggestions={handleRequestSuggestions}
                                                onInjectPrompt={injectPrompt}
                                                className="w-full h-full"
                                            />
                                        </div>
                                    </>
                                )}
                            </div>{/* end outer flex row */}
                        </>
                    )}
                </div>
            </div>

            <SystemPromptModal
                open={sysPromptOpen}
                onOpenChange={setSysPromptOpen}
                value={paramValues.systemPrompt ?? ''}
                onSave={(v): void => setParamValues((prev) => ({ ...prev, systemPrompt: v }))}
            />
            <MMDDrawer
                open={drawerOpen}
                onOpenChange={setDrawerOpen}
                config={mmdConfig}
                onChange={setMmdConfig}
                models={MODELS}
                columns={columns}
                guestMode={isGuest}
            />
        </div>
    );
}
