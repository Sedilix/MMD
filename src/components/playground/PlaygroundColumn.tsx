'use client';

/**
 * A single model column in the workbench.
 *
 * Architectural invariant: each column owns its OWN `usePlaygroundStream`
 * hook instance, so failures are isolated to that column.
 *
 * Plumbing: the column registers its `send` callback into the page-level
 * `SendRegistry` so the global prompt bar can fan out without prop-drilling
 * through a context or a brittle CustomEvent bridge.
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Brain, BookText, FlaskConical, Hammer, Network, Share2, SlidersHorizontal } from 'lucide-react';
import { getAuth } from 'firebase/auth';
import {
    MAX_EVAL_CASES,
    MAX_EVAL_FIELD_CHARS,
    newEvalCaseId,
    scoreEvalCase,
    type EvalCase,
    type EvalCaseResult,
} from '@/lib/playground/eval';
import {
    appendPromptVersion,
    MAX_PROMPT_CLASSES,
    MAX_PROMPT_NAME_CHARS,
    MAX_PROMPT_TEXT_CHARS,
    newPromptClassId,
    PROMPT_CLASSES_STORAGE_KEY,
    resolveAppliedText,
    sanitizePromptClasses,
    type AppliedPromptClass,
    type PromptClass,
} from '@/lib/playground/prompt-registry';
import { useUser } from '@/firebase/auth/use-user';
import { useFirestore } from '@/firebase';
import { collection, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';
import { StreamingIndicator } from '@/components/playground/StreamingIndicator';
import { ModeDropdown } from '@/components/playground/ModeDropdown';
import { Icon } from '@/components/ui/icon';
import type { Skill } from '@/lib/playground/skills';
import preinstalledSkills from '@/data/playground/skills.json';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@/components/ui/accordion';
import { cn } from '@/lib/utils';
import { RadialProgress } from '@/components/ui/radial-progress';

import {
    usePlaygroundStream,
    type PlaygroundStreamSendOptions,
    type GuestQuotaSnapshot,
} from '@/lib/playground/hooks/usePlaygroundStream';
import { formatMsrpUsd } from '@/lib/playground/tier-config';
import type { ModelRegistryEntry } from '@/lib/playground/types';
import { resolveModelAccess } from '@/lib/playground/types';
import { ModelDropdown } from '@/components/playground/ModelDropdown';
import type { DockAttachment } from '@/components/playground/AttachmentDock';
import { GetCodeModal } from '@/components/playground/GetCodeModal';
import type { ParamValues } from '@/components/playground/ParamsSidebar';
import { detectArtifacts, mergeArtifactBlocks, type DetectedArtifact } from '@/lib/playground/artifact-parser';

import { MODELS, modelById, type SendRegistry } from '@/lib/playground/workbench';
import { CopyButton } from '@/components/playground/CopyButton';
import { formatMessageContent } from '@/components/playground/formatMessageContent';
import { TelemetryCell } from '@/components/playground/TelemetryCell';
import { ToolActivityStrip } from '@/components/playground/ToolActivityStrip';
import { ModelCapabilitiesBadge } from '@/components/playground/ModelCapabilitiesBadge';
import { EmptyState } from '@/components/playground/EmptyState';

/**
 * Per-column gateway flag state (audit Step 4). Empty string means "not
 * set" for the enum knobs — unset values are never sent, so the gateway
 * keeps its defaults.
 */
interface GatewayFlagState {
    routingStrategy: '' | 'cost-optimized' | 'latency-optimized' | 'quality-optimized' | 'balanced';
    piiRedaction: boolean;
    injectionDefense: boolean;
    moderationLevel: '' | 'off' | 'low' | 'standard' | 'strict';
    autoFixSyntax: boolean;
    enforceSchema: boolean;
    fallbackModels: string[];
}

const DEFAULT_GATEWAY_FLAGS: GatewayFlagState = {
    routingStrategy: '',
    piiRedaction: false,
    injectionDefense: false,
    moderationLevel: '',
    autoFixSyntax: false,
    enforceSchema: false,
    fallbackModels: [],
};

export interface PlaygroundColumnProps {
    columnId: string;
    modelId: string;
    attachments: DockAttachment[];
    onRemove(): void;
    onModelChange(nextModelId: string): void;
    paramValues: ParamValues;
    onParamChange(next: ParamValues): void;
    applyToAll: boolean;
    onApplyToAllChange(apply: boolean): void;
    onOpenSystemPrompt(): void;
    registry: SendRegistry;
    /**
     * When true the column sends without an Authorization header — the
     * `__pg_guest` fingerprint cookie carries the identity and the server
     * gates the call to the guest-access model subset + 10-request pool.
     * The picker renders guest-access models as pickable and registered-only
     * models as disabled-with-lock.
     */
    guestMode: boolean;
    /** Lifts the latest guest quota from the column up to the page banner. */
    onGuestQuota: (snapshot: GuestQuotaSnapshot | null) => void;
    /** Navigate to the sign-up flow. Used by the inline registered-model upsell. */
    onSignUp: () => void;
    onComplete?: (finalText: string) => void;
    isMMDEnabled?: boolean;
    isMMDIncluded?: boolean;
    onToggleMMDInclusion?: () => void;
    setActiveArtifact?: (artifact: DetectedArtifact | null) => void;
    /** "Make this an App" bridge: promotes an artifact into the preview + build preset. */
    onMakeApp?: (artifact: DetectedArtifact) => void;
    onTogglePreview?: () => void;
    isPreviewActive?: boolean;
    isSingleMode?: boolean;
    availableModels?: readonly ModelRegistryEntry[];
}

export function PlaygroundColumn({
    columnId,
    modelId,
    attachments,
    onRemove,
    onModelChange,
    paramValues,
    onParamChange,
    applyToAll,
    onApplyToAllChange,
    onOpenSystemPrompt,
    registry,
    guestMode,
    onGuestQuota,
    onSignUp,
    onComplete,
    isMMDEnabled,
    isMMDIncluded,
    onToggleMMDInclusion,
    setActiveArtifact,
    onMakeApp,
    onTogglePreview,
    isPreviewActive,
    isSingleMode,
    availableModels,
}: PlaygroundColumnProps) {
    const router = useRouter();
    void router; // router lives at page level; onSignUp is the canonical hook.
    const stream = usePlaygroundStream(modelId, guestMode, onComplete);
    const [codeOpen, setCodeOpen] = useState(false);

    const activeRegistry = useMemo(() => availableModels ?? MODELS, [availableModels]);

    // Skills local state
    const { user } = useUser();
    const firestore = useFirestore();
    const [skillsDropdownOpen, setSkillsDropdownOpen] = useState(false);
    const [allSkills, setAllSkills] = useState<Skill[]>([]);
    const [enabledSkillIds, setEnabledSkillIds] = useState<string[]>([]);

    // MCP tool servers (audit Step 3): user-supplied URLs, persisted per
    // column in localStorage. The stream route vets + connects them
    // server-side; guests are excluded there, and the button simply doesn't
    // render in guest columns.
    const [mcpDropdownOpen, setMcpDropdownOpen] = useState(false);
    const [mcpServerUrls, setMcpServerUrls] = useState<string[]>(() => {
        if (typeof window === 'undefined') return [];
        try {
            const raw = window.localStorage.getItem(`pg-mcp-${columnId}`);
            const parsed = raw ? (JSON.parse(raw) as unknown) : [];
            return Array.isArray(parsed)
                ? parsed.filter((u): u is string => typeof u === 'string').slice(0, 2)
                : [];
        } catch {
            return [];
        }
    });
    const [mcpDraftUrl, setMcpDraftUrl] = useState('');

    useEffect(() => {
        try {
            window.localStorage.setItem(`pg-mcp-${columnId}`, JSON.stringify(mcpServerUrls));
        } catch {
            /* storage unavailable (private mode) — session-only persistence */
        }
    }, [mcpServerUrls, columnId]);

    const handleAddMcpServer = () => {
        const trimmed = mcpDraftUrl.trim();
        if (trimmed.length === 0 || mcpServerUrls.length >= 2) return;
        let parsed: URL | null = null;
        try {
            parsed = new URL(trimmed);
        } catch {
            parsed = null;
        }
        if (!parsed || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) return;
        const url = parsed.toString();
        if (mcpServerUrls.includes(url)) return;
        setMcpServerUrls([...mcpServerUrls, url]);
        setMcpDraftUrl('');
    };

    // Gateway flags (audit Step 4): per-column routing strategy, guardrails,
    // fallback models, and response healing. Persisted like the MCP list;
    // the stream route validates every value before it reaches the gateway.
    const [gatewayDropdownOpen, setGatewayDropdownOpen] = useState(false);
    const [gatewayFlags, setGatewayFlags] = useState<GatewayFlagState>(() => {
        if (typeof window === 'undefined') return DEFAULT_GATEWAY_FLAGS;
        try {
            const raw = window.localStorage.getItem(`pg-gateway-${columnId}`);
            const parsed = raw ? (JSON.parse(raw) as Partial<GatewayFlagState>) : {};
            return {
                ...DEFAULT_GATEWAY_FLAGS,
                ...parsed,
                fallbackModels: Array.isArray(parsed.fallbackModels)
                    ? parsed.fallbackModels.filter((m): m is string => typeof m === 'string').slice(0, 4)
                    : [],
            };
        } catch {
            return DEFAULT_GATEWAY_FLAGS;
        }
    });
    const [fallbackDraft, setFallbackDraft] = useState('');

    useEffect(() => {
        try {
            window.localStorage.setItem(`pg-gateway-${columnId}`, JSON.stringify(gatewayFlags));
        } catch {
            /* storage unavailable — session-only persistence */
        }
    }, [gatewayFlags, columnId]);

    const activeGatewayCount =
        (gatewayFlags.routingStrategy ? 1 : 0) +
        (gatewayFlags.piiRedaction ? 1 : 0) +
        (gatewayFlags.injectionDefense ? 1 : 0) +
        (gatewayFlags.moderationLevel ? 1 : 0) +
        (gatewayFlags.autoFixSyntax ? 1 : 0) +
        (gatewayFlags.enforceSchema ? 1 : 0) +
        (gatewayFlags.fallbackModels.length > 0 ? 1 : 0);

    // Shareable run snapshot (audit Step 6): publishes THIS column's
    // transcript to `playground_runs` and surfaces the public link. The
    // route re-validates every field and strips anything but text —
    // attachments never leave the column.
    const [shareOpen, setShareOpen] = useState(false);
    const [shareState, setShareState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
    const [shareUrl, setShareUrl] = useState('');
    const [shareCopied, setShareCopied] = useState(false);

    const handleShareRun = async () => {
        if (shareState === 'saving' || stream.messages.length === 0) return;
        setShareState('saving');
        setShareUrl('');
        setShareCopied(false);
        try {
            const current = getAuth().currentUser;
            if (!current) {
                setShareState('error');
                return;
            }
            const token = await current.getIdToken();
            const model = activeRegistry.find((m) => m.id === modelId);
            const res = await fetch('/api/playground/runs', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    modelId,
                    modelLabel: model?.displayName ?? modelId,
                    messages: stream.messages.map((m) => ({
                        role: m.role,
                        content: m.content,
                        ...(m.reasoning ? { reasoning: m.reasoning } : {}),
                        ts: m.ts,
                    })),
                }),
            });
            if (!res.ok) {
                setShareState('error');
                return;
            }
            const data = (await res.json()) as { id?: string };
            if (!data.id) {
                setShareState('error');
                return;
            }
            setShareUrl(`${window.location.origin}/playground/run/${data.id}`);
            setShareState('done');
        } catch {
            setShareState('error');
        }
    };

    const handleCopyShareUrl = async () => {
        if (!shareUrl) return;
        try {
            await navigator.clipboard.writeText(shareUrl);
            setShareCopied(true);
        } catch {
            /* clipboard unavailable — the link stays selectable */
        }
    };

    // Eval strip (audit Step 7): a per-column prompt dataset replayed
    // through this column's own stream, scored deterministically on the
    // client (`src/lib/playground/eval.ts`). The run is a state machine
    // driven by `stream.state` in the effect below — one case at a time,
    // never parallel, never a second model call per case.
    const [evalOpen, setEvalOpen] = useState(false);
    const [evalDataset, setEvalDataset] = useState<EvalCase[]>(() => {
        if (typeof window === 'undefined') return [];
        try {
            const raw = window.localStorage.getItem(`pg-eval-${columnId}`);
            const parsed = raw ? (JSON.parse(raw) as unknown) : [];
            if (!Array.isArray(parsed)) return [];
            return parsed
                .filter(
                    (c): c is EvalCase =>
                        !!c &&
                        typeof c === 'object' &&
                        typeof (c as EvalCase).id === 'string' &&
                        typeof (c as EvalCase).prompt === 'string' &&
                        typeof (c as EvalCase).expected === 'string',
                )
                .slice(0, MAX_EVAL_CASES);
        } catch {
            return [];
        }
    });
    const [evalPhase, setEvalPhase] = useState<'idle' | 'running' | 'done'>('idle');
    const [evalResults, setEvalResults] = useState<EvalCaseResult[]>([]);
    const [evalDraftPrompt, setEvalDraftPrompt] = useState('');
    const [evalDraftExpected, setEvalDraftExpected] = useState('');
    const evalCursorRef = useRef(0);
    const evalAwaitingRef = useRef(false);

    useEffect(() => {
        try {
            window.localStorage.setItem(`pg-eval-${columnId}`, JSON.stringify(evalDataset));
        } catch {
            /* storage unavailable — session-only persistence */
        }
    }, [evalDataset, columnId]);

    const handleAddEvalCase = () => {
        const prompt = evalDraftPrompt.trim();
        const expected = evalDraftExpected.trim();
        if (prompt.length === 0 || expected.length === 0) return;
        if (evalDataset.length >= MAX_EVAL_CASES) return;
        setEvalDataset([
            ...evalDataset,
            {
                id: newEvalCaseId(),
                prompt: prompt.slice(0, MAX_EVAL_FIELD_CHARS),
                expected: expected.slice(0, MAX_EVAL_FIELD_CHARS),
            },
        ]);
        setEvalDraftPrompt('');
        setEvalDraftExpected('');
    };

    const handleStartEval = () => {
        if (evalPhase === 'running' || evalDataset.length === 0) return;
        evalCursorRef.current = 0;
        evalAwaitingRef.current = false;
        setEvalResults([]);
        setEvalPhase('running');
    };

    // Prompt registry (audit Step 8): versioned prompt classes the
    // column can apply as a per-column system-prompt override. Storage
    // mirrors custom skills: Firestore for signed-in users (loaded on
    // first popover open), localStorage fallback otherwise.
    const [promptRegistryOpen, setPromptRegistryOpen] = useState(false);
    const [promptClasses, setPromptClasses] = useState<PromptClass[]>(() => {
        if (typeof window === 'undefined') return [];
        try {
            const raw = window.localStorage.getItem(PROMPT_CLASSES_STORAGE_KEY);
            return sanitizePromptClasses(raw ? JSON.parse(raw) : []);
        } catch {
            return [];
        }
    });
    const [appliedPrompt, setAppliedPrompt] = useState<AppliedPromptClass | null>(() => {
        if (typeof window === 'undefined') return null;
        try {
            const raw = window.localStorage.getItem(`pg-prompt-class-${columnId}`);
            const parsed = raw ? (JSON.parse(raw) as unknown) : null;
            if (
                parsed &&
                typeof parsed === 'object' &&
                typeof (parsed as AppliedPromptClass).classId === 'string' &&
                typeof (parsed as AppliedPromptClass).v === 'number'
            ) {
                return parsed as AppliedPromptClass;
            }
            return null;
        } catch {
            return null;
        }
    });
    const [promptDraftName, setPromptDraftName] = useState('');
    // Separate drafts: the new-class form and the version editor can both
    // be visible at once, and sharing one field would leak text between them.
    const [promptNewText, setPromptNewText] = useState('');
    const [promptDraftText, setPromptDraftText] = useState('');
    const [editingClassId, setEditingClassId] = useState<string | null>(null);
    const promptLoadedRef = useRef(false);

    useEffect(() => {
        try {
            if (appliedPrompt) {
                window.localStorage.setItem(`pg-prompt-class-${columnId}`, JSON.stringify(appliedPrompt));
            } else {
                window.localStorage.removeItem(`pg-prompt-class-${columnId}`);
            }
        } catch {
            /* storage unavailable — session-only persistence */
        }
    }, [appliedPrompt, columnId]);

    const persistPromptClasses = async (next: PromptClass[]) => {
        setPromptClasses(next);
        try {
            window.localStorage.setItem(PROMPT_CLASSES_STORAGE_KEY, JSON.stringify(next));
        } catch {
            /* best effort */
        }
        try {
            if (user && firestore) {
                await setDoc(doc(firestore, 'users', user.uid, 'prompt_classes'), { classes: next });
            }
        } catch (err) {
            console.error('Error persisting prompt classes:', err);
        }
    };

    const handleTogglePromptRegistry = async () => {
        if (!promptRegistryOpen && !promptLoadedRef.current) {
            promptLoadedRef.current = true;
            try {
                if (user && firestore) {
                    const snap = await getDoc(doc(firestore, 'users', user.uid, 'prompt_classes'));
                    if (snap.exists()) {
                        const data = snap.data() as { classes?: unknown };
                        setPromptClasses(sanitizePromptClasses(data.classes));
                    }
                }
            } catch (err) {
                console.error('Error loading prompt classes:', err);
            }
        }
        setPromptRegistryOpen(!promptRegistryOpen);
    };

    const handleCreatePromptClass = () => {
        const name = promptDraftName.trim().slice(0, MAX_PROMPT_NAME_CHARS);
        const text = promptNewText.trim();
        if (name.length === 0 || text.length === 0) return;
        if (promptClasses.length >= MAX_PROMPT_CLASSES) return;
        const klass: PromptClass = {
            id: newPromptClassId(),
            name,
            versions: [{ v: 1, text: text.slice(0, MAX_PROMPT_TEXT_CHARS), savedAt: Date.now() }],
            activeVersion: 1,
        };
        void persistPromptClasses([...promptClasses, klass]);
        setPromptDraftName('');
        setPromptNewText('');
    };

    const handleDeletePromptClass = (classId: string) => {
        if (appliedPrompt && appliedPrompt.classId === classId) setAppliedPrompt(null);
        if (editingClassId === classId) setEditingClassId(null);
        void persistPromptClasses(promptClasses.filter((c) => c.id !== classId));
    };

    const handleSavePromptVersion = () => {
        if (!editingClassId) return;
        const text = promptDraftText.trim();
        if (text.length === 0) return;
        void persistPromptClasses(appendPromptVersion(promptClasses, editingClassId, text));
    };

    const handleSetActiveVersion = (classId: string, v: number) => {
        void persistPromptClasses(
            promptClasses.map((c) => (c.id === classId ? { ...c, activeVersion: v } : c)),
        );
    };

    const handleToggleSkillsDropdown = async () => {
        if (!skillsDropdownOpen) {
            const system = preinstalledSkills as Skill[];
            let custom: Skill[] = [];
            try {
                if (user && firestore) {
                    const snap = await getDocs(collection(firestore, 'users', user.uid, 'skills'));
                    snap.forEach((doc) => {
                        custom.push({ id: doc.id, ...doc.data() } as Skill);
                    });
                } else {
                    const local = localStorage.getItem('__cd_custom_skills');
                    if (local) {
                        custom = JSON.parse(local) as Skill[];
                    }
                }
            } catch (err) {
                console.error('Error loading skills for column dropdown:', err);
            }
            setAllSkills([...system, ...custom]);
        }
        setSkillsDropdownOpen(!skillsDropdownOpen);
    };

    const scrollRef = useRef<HTMLDivElement>(null);

    // Smart auto-scroll: only scrolls when the user is near the bottom of
    // the column's chat history. If they scrolled up to read older content,
    // we never fight them. Targets the Radix ScrollArea viewport directly
    // so it cannot cascade to ancestor scroll containers (the old
    // scrollIntoView call leaked upward and hijacked the page scroll).
    useEffect(() => {
        const sentinel = scrollRef.current;
        if (!sentinel) return;
        const viewport = sentinel.closest('[data-radix-scroll-area-viewport]') ||
            sentinel.parentElement?.querySelector('[data-radix-scroll-area-viewport]');
        if (viewport) {
            const isNearBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 150;
            if (isNearBottom) {
                viewport.scrollTop = viewport.scrollHeight;
            }
        } else {
            // Fallback: scope to the nearest scrollable ancestor only.
            sentinel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }, [stream.messages, stream.content, stream.reasoning, stream.toolCalls]);

    // Register custom send that merges the selected column skills + MCP servers
    // + gateway flags (audit Steps 3–4).
    const customSend = useCallback(
        async (prompt: string, opts: PlaygroundStreamSendOptions) => {
            const gw = gatewayFlags;
            const guard: {
                piiRedaction?: boolean;
                injectionDefense?: boolean;
                moderationLevel?: 'off' | 'low' | 'standard' | 'strict';
            } = {};
            if (gw.piiRedaction) guard.piiRedaction = true;
            if (gw.injectionDefense) guard.injectionDefense = true;
            if (gw.moderationLevel !== '') guard.moderationLevel = gw.moderationLevel;
            // Prompt registry override (audit Step 8): an applied class
            // version wins over the board-level system prompt for this
            // column only.
            const overrideText = resolveAppliedText(promptClasses, appliedPrompt);
            const mergedOpts: PlaygroundStreamSendOptions = {
                ...opts,
                ...(overrideText !== null ? { systemPrompt: overrideText } : {}),
                enabledSkills: enabledSkillIds,
                mcpServers: mcpServerUrls.length > 0 ? mcpServerUrls : undefined,
                routingStrategy: gw.routingStrategy !== '' ? gw.routingStrategy : undefined,
                guardrails: Object.keys(guard).length > 0 ? guard : undefined,
                fallbackModels: gw.fallbackModels.length > 0 ? gw.fallbackModels : undefined,
                responseHealing:
                    gw.autoFixSyntax || gw.enforceSchema
                        ? {
                            ...(gw.autoFixSyntax ? { autoFixSyntax: true } : {}),
                            ...(gw.enforceSchema ? { enforceSchema: true } : {}),
                        }
                        : undefined,
            };
            return stream.send(prompt, mergedOpts);
        },
        [stream.send, enabledSkillIds, mcpServerUrls, gatewayFlags, promptClasses, appliedPrompt]
    );

    useEffect(() => {
        const unregister = registry.register(columnId, customSend);
        return unregister;
    }, [registry, columnId, customSend]);

    // Eval runner (audit Step 7). Effect-driven state machine keyed on
    // `stream.state`: when not awaiting, it starts the cursor's case via
    // the column's own `customSend` (same skills / MCP / gateway flags as
    // a manual turn); once the stream reaches `done` / `error` it scores
    // the final assistant message and advances. `evalResults.length` is a
    // dependency so recording a result re-arms the next iteration.
    useEffect(() => {
        if (evalPhase !== 'running') return;
        const cursor = evalCursorRef.current;

        if (!evalAwaitingRef.current) {
            if (cursor >= evalDataset.length) {
                setEvalPhase('done');
                return;
            }
            // Column still busy with a manual turn — wait instead of
            // fighting the user.
            if (stream.state === 'connecting' || stream.state === 'streaming') return;
            evalAwaitingRef.current = true;
            stream.reset();
            void customSend(evalDataset[cursor].prompt, {});
            return;
        }

        // Awaiting the in-flight case — only terminal states settle it.
        if (stream.state === 'connecting' || stream.state === 'streaming') return;
        const kase = evalDataset[cursor];
        if (!kase) {
            evalAwaitingRef.current = false;
            setEvalPhase('done');
            return;
        }
        if (stream.state === 'done') {
            const last = stream.messages[stream.messages.length - 1];
            const output = last && last.role === 'assistant' ? last.content : '';
            setEvalResults((r) => [...r, scoreEvalCase(kase, output)]);
        } else {
            // 'error' (or an unexpected idle): transport failure, scored
            // honestly as an error rather than a fail.
            setEvalResults((r) => [
                ...r,
                { caseId: kase.id, status: 'error', score: 0, output: '' },
            ]);
        }
        evalAwaitingRef.current = false;
        evalCursorRef.current = cursor + 1;
    }, [evalPhase, evalDataset, evalResults.length, stream.state, stream.messages, stream, customSend]);

    // Lift guest quota changes up to the page so the header banner can
    // render the latest 24h pool snapshot regardless of which column's 402
    // surfaced it. Throttled to actual changes only.
    useEffect(() => {
        onGuestQuota(stream.guestQuota ?? null);
    }, [stream.guestQuota, onGuestQuota]);

    // Models the user is allowed to pick in this column.
    const modelsForPicker = useMemo(
        () => (guestMode ? activeRegistry.filter((m) => resolveModelAccess(m) === 'guest') : activeRegistry),
        [guestMode, activeRegistry],
    );

    // Legacy alias for the seeded-column logic further below
    const guestModels = useMemo(
        () => activeRegistry.filter((m) => resolveModelAccess(m) === 'guest'),
        [activeRegistry],
    );

    const model = activeRegistry.find((m) => m.id === modelId);

    const isStreaming = stream.state === 'streaming' || stream.state === 'connecting';
    const isError = stream.state === 'error';

    // When a guest tries to pick a Registered model the picker auto-reverts to the
    // last valid Guest model. We track `lastGuestModelId` here for that path.
    const [lastGuestModelId, setLastGuestModelId] = useState<string>(() => {
        const init = modelById(modelId);
        if (init && resolveModelAccess(init) === 'guest') return init.id;
        return guestModels[0]?.id ?? modelId;
    });
    useEffect(() => {
        if (model && resolveModelAccess(model) === 'guest') {
            setLastGuestModelId(model.id);
        }
    }, [model]);

    const handlePickerChange = useCallback(
        (nextId: string): void => {
            const next = modelById(nextId);
            if (!next) return;
            if (guestMode && resolveModelAccess(next) === 'registered') {
                // Guest: Registered is server-rejected. Revert selection and surface
                // an inline banner via `lockedModelName` so the user knows why.
                onModelChange(lastGuestModelId);
                setLockedModelName(next.displayName);
                return;
            }
            setLockedModelName(null);
            onModelChange(nextId);
        },
        [guestMode, lastGuestModelId, onModelChange],
    );

    const [lockedModelName, setLockedModelName] = useState<string | null>(null);
    useEffect(() => {
        if (!lockedModelName) return;
        const t = setTimeout(() => setLockedModelName(null), 5000);
        return () => clearTimeout(t);
    }, [lockedModelName]);

    const borderClass = isError
        ? 'border-destructive/40 shadow-sm'
        : isStreaming
            ? 'border-sky-400/40'
            : 'border-white/20';

    const hasMessages = stream.messages.length > 0 || stream.content.length > 0 || stream.state === 'streaming' || stream.state === 'connecting' || stream.state === 'error';

    return (
        <Card
            id={`column-${columnId}`}
            className={cn(
                'relative flex flex-col overflow-hidden transition-all duration-300 bg-white/10 dark:bg-white/5 backdrop-blur-lg shadow-2xl text-foreground',
                'h-full min-h-0',
                borderClass,
                isStreaming && 'border-brand-400/40',
            )}
            data-column-id={columnId}
        >
            <div className={cn(
                "absolute top-0 right-0 z-20 flex border-l border-b border-white/20 rounded-tr-lg rounded-bl-md overflow-hidden bg-black/60 backdrop-blur-md",
                isSingleMode ? "flex-row-reverse" : "flex-col"
            )}>
                {/* 1: Close Button (x) */}
                <button
                    type="button"
                    onClick={onRemove}
                    className={cn(
                        "h-8 w-8 flex items-center justify-center text-white/60 hover:bg-destructive hover:text-white transition-all focus:outline-none bg-black/45",
                        isSingleMode ? "border-l border-white/15" : "border-b border-white/15"
                    )}
                    title="Remove column"
                >
                    <Icon name="close-md" className="h-3.5 w-3.5" />
                </button>

                {/* 2: Selector Flag (Checkmark) */}
                {onToggleMMDInclusion ? (
                    <button
                        type="button"
                        onClick={onToggleMMDInclusion}
                        className={cn(
                            "h-8 w-8 flex items-center justify-center transition-all focus:outline-none group relative overflow-hidden",
                            isSingleMode ? "border-l border-white/15" : "border-b border-white/15"
                        )}
                        title={isMMDIncluded ? "Deselect column" : "Select column"}
                    >
                        <div className={cn(
                            "absolute inset-0 transition-colors",
                            isMMDIncluded
                                ? "bg-sky-600/50"
                                : "bg-black/65 group-hover:bg-white/10"
                        )} />
                        <Icon name="check" className={cn(
                            "h-4 w-4 z-30 transition-all",
                            isMMDIncluded
                                ? "text-white scale-110 opacity-100"
                                : "text-white/25 group-hover:text-white/65 scale-90 opacity-40"
                        )} />
                    </button>
                ) : null}

                {/* 3: Get Code Button (</>) */}
                <button
                    type="button"
                    onClick={(): void => setCodeOpen(true)}
                    className="h-8 w-8 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all focus:outline-none bg-black/45"
                    title="Copy code to clipboard and download an .md code file"
                >
                    <Icon name="code" className="h-3.5 w-3.5" />
                </button>

                {/* 4: Preview Toggle Flag */}
                {onTogglePreview && (
                    <button
                        type="button"
                        onClick={onTogglePreview}
                        className={cn(
                            "h-8 w-8 flex items-center justify-center transition-all focus:outline-none bg-black/45 border-l border-white/15",
                            isPreviewActive
                                ? "text-sky-400 bg-sky-500/20"
                                : "text-white/60 hover:text-white hover:bg-white/10"
                        )}
                        title="Toggle Live Preview Pane"
                    >
                        <Icon name="show" className="h-3.5 w-3.5" />
                    </button>
                )}
            </div>

            <div className="flex flex-col gap-2 border-b border-white/15 bg-white/5 px-3 py-2">
                <div className={cn("flex items-center gap-2 w-full", isSingleMode ? "pr-28" : "pr-10")}>
                    <ModelDropdown
                        models={modelsForPicker}
                        value={modelId}
                        onChange={(id) => handlePickerChange(id)}
                        guestMode={guestMode}
                        showCapabilities={false}
                        className="flex-1"
                        maxWidth="100%"
                    />
                    <StreamingIndicator
                        tokens={stream.tokensSoFar}
                        isStreaming={isStreaming}
                        ttftMs={stream.ttftMs}
                    />
                </div>

                <div className="flex items-center justify-between gap-2 pr-10">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <ModelCapabilitiesBadge model={model} />

                        <ModeDropdown
                            value={paramValues.modeId}
                            onChange={(modeId) => onParamChange({ ...paramValues, modeId })}
                        />

                        {/* Skills Dropdown Selector */}
                        <div className="relative">
                            <button
                                type="button"
                                onClick={handleToggleSkillsDropdown}
                                className={cn(
                                    "group/skillspill relative inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 overflow-hidden",
                                    "text-[10px] font-semibold transition-all duration-300 focus:outline-none select-none",
                                    enabledSkillIds.length > 0
                                        ? "bg-zinc-950 border border-rose-500/80 text-rose-300 shadow-md"
                                        : "bg-zinc-950 border border-zinc-700/80 text-zinc-100 shadow-md hover:border-zinc-500 hover:bg-zinc-900",
                                    "hover:border-white/40 hover:shadow-[0_0_18px_rgba(216,166,87,0.35)]",
                                )}
                                title="Toggle active skills"
                            >
                                {/* Animated sheen on hover */}
                                <span
                                    aria-hidden
                                    className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-brand-400/25 to-transparent transition-transform duration-700 ease-out group-hover/skillspill:translate-x-full"
                                />
                                <span className="relative flex items-center">
                                    <Icon
                                        name="settings"
                                        className={cn(
                                            "h-3.5 w-3.5 shrink-0",
                                            enabledSkillIds.length > 0 ? "text-rose-300" : "text-brand-400"
                                        )}
                                    />
                                </span>
                                <span className="relative font-semibold">
                                    {enabledSkillIds.length > 0 ? `Skills (${enabledSkillIds.length})` : 'Skills'}
                                </span>
                            </button>
                            {skillsDropdownOpen && (
                                <div className="absolute left-0 mt-1.5 w-60 rounded-md border border-white/15 bg-zinc-950/90 backdrop-blur-xl text-zinc-100 shadow-2xl z-50 p-2 text-xs space-y-1">
                                    <div className="px-2 py-1 font-bold text-[9px] uppercase tracking-wider text-brand-400 border-b border-white/15 mb-1">
                                        Enable Skills
                                    </div>
                                    <div className="max-h-48 overflow-y-auto space-y-1 custom-scrollbar">
                                        {allSkills.map((s) => {
                                            const isEnabled = enabledSkillIds.includes(s.id);
                                            // The stream route unconditionally excludes guests from
                                            // webSearch (guests have no uid and the gateway bills
                                            // each search on top of token cost). A guest could
                                            // otherwise toggle this on, see it light up exactly like
                                            // a real user, and never learn it was a silent no-op.
                                            const blockedForGuest = guestMode && s.permissions?.webSearch === true;
                                            return (
                                                <label
                                                    key={s.id}
                                                    className={cn(
                                                        "flex items-start gap-2 p-1.5 rounded select-none text-left",
                                                        blockedForGuest ? "opacity-50 cursor-not-allowed" : "hover:bg-white/10 cursor-pointer",
                                                    )}
                                                    title={blockedForGuest ? "Web search requires signing in" : undefined}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={isEnabled && !blockedForGuest}
                                                        disabled={blockedForGuest}
                                                        onChange={() => {
                                                            if (blockedForGuest) return;
                                                            if (isEnabled) {
                                                                setEnabledSkillIds(enabledSkillIds.filter(id => id !== s.id));
                                                            } else {
                                                                setEnabledSkillIds([...enabledSkillIds, s.id]);
                                                            }
                                                        }}
                                                        className="mt-0.5 rounded border-zinc-700 bg-zinc-950 text-rose-500 focus:ring-rose-500 h-3.5 w-3.5 shrink-0 disabled:cursor-not-allowed"
                                                    />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-semibold text-[11px] truncate leading-tight text-white">{s.name}</p>
                                                        <p className="text-[9px] text-zinc-400 line-clamp-2 mt-0.5 leading-normal">{s.description}</p>
                                                        {blockedForGuest && (
                                                            <p className="text-[9px] text-amber-400/90 mt-0.5">Sign in to enable web search</p>
                                                        )}
                                                    </div>
                                                </label>
                                            );
                                        })}
                                        {allSkills.length === 0 && (
                                            <p className="p-2 text-center text-zinc-400 italic text-[10px]">No skills found. Open Skills Manager to create some.</p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* MCP tool-server registration (audit Step 3) */}
                        {!guestMode && (
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setMcpDropdownOpen(!mcpDropdownOpen)}
                                    className={cn(
                                        "relative inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 overflow-hidden",
                                        "text-[10px] font-semibold transition-all duration-300 focus:outline-none select-none",
                                        mcpServerUrls.length > 0
                                            ? "bg-zinc-950 border border-emerald-500/80 text-emerald-300 shadow-md"
                                            : "bg-zinc-950 border border-zinc-700/80 text-zinc-100 shadow-md hover:border-zinc-500 hover:bg-zinc-900",
                                    )}
                                    title="Register MCP tool servers for this column"
                                >
                                    <Network
                                        className={cn(
                                            "h-3.5 w-3.5 shrink-0",
                                            mcpServerUrls.length > 0 ? "text-emerald-300" : "text-emerald-500/80"
                                        )}
                                    />
                                    <span>{mcpServerUrls.length > 0 ? `MCP (${mcpServerUrls.length})` : 'MCP'}</span>
                                </button>
                                {mcpDropdownOpen && (
                                    <div className="absolute left-0 mt-1.5 w-72 rounded-md border border-white/15 bg-zinc-950/90 backdrop-blur-xl text-zinc-100 shadow-2xl z-50 p-2 text-xs space-y-1.5">
                                        <div className="px-2 py-1 font-bold text-[9px] uppercase tracking-wider text-emerald-400 border-b border-white/15 mb-1">
                                            MCP Tool Servers
                                        </div>
                                        {mcpServerUrls.map((u) => (
                                            <div key={u} className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/5">
                                                <span className="flex-1 min-w-0 truncate font-mono text-[10px] text-zinc-300" title={u}>{u}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => setMcpServerUrls(mcpServerUrls.filter((x) => x !== u))}
                                                    className="text-zinc-500 hover:text-red-400 transition-colors"
                                                    aria-label={`Remove ${u}`}
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        ))}
                                        {mcpServerUrls.length < 2 && (
                                            <div className="flex items-center gap-1.5 px-1">
                                                <input
                                                    value={mcpDraftUrl}
                                                    onChange={(e) => setMcpDraftUrl(e.target.value)}
                                                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddMcpServer(); }}
                                                    placeholder="https://your-mcp-server/mcp"
                                                    className="flex-1 min-w-0 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-[10px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/70"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={handleAddMcpServer}
                                                    className="rounded border border-emerald-500/60 px-2 py-1 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/10 transition-colors"
                                                >
                                                    Add
                                                </button>
                                            </div>
                                        )}
                                        <p className="px-2 pb-1 text-[9px] leading-normal text-zinc-500">
                                            The server&apos;s tools are offered to the model; calls run on our side and show up in the tool feed. Max 2 servers per column.
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Gateway flags (audit Step 4) */}
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setGatewayDropdownOpen(!gatewayDropdownOpen)}
                                className={cn(
                                    "relative inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 overflow-hidden",
                                    "text-[10px] font-semibold transition-all duration-300 focus:outline-none select-none",
                                    activeGatewayCount > 0
                                        ? "bg-zinc-950 border border-amber-500/80 text-amber-300 shadow-md"
                                        : "bg-zinc-950 border border-zinc-700/80 text-zinc-100 shadow-md hover:border-zinc-500 hover:bg-zinc-900",
                                )}
                                title="Gateway flags: routing, guardrails, fallbacks, healing"
                            >
                                <SlidersHorizontal
                                    className={cn(
                                        "h-3.5 w-3.5 shrink-0",
                                        activeGatewayCount > 0 ? "text-amber-300" : "text-amber-500/80"
                                    )}
                                />
                                <span>{activeGatewayCount > 0 ? `Gateway (${activeGatewayCount})` : 'Gateway'}</span>
                            </button>
                            {gatewayDropdownOpen && (
                                <div className="absolute left-0 mt-1.5 w-72 rounded-md border border-white/15 bg-zinc-950/90 backdrop-blur-xl text-zinc-100 shadow-2xl z-50 p-2 text-xs space-y-2">
                                    <div className="px-2 py-1 font-bold text-[9px] uppercase tracking-wider text-amber-400 border-b border-white/15">
                                        Gateway Flags
                                    </div>

                                    <label className="block px-2 space-y-1">
                                        <span className="text-[9px] uppercase tracking-wider text-zinc-400">Routing strategy</span>
                                        <select
                                            value={gatewayFlags.routingStrategy}
                                            onChange={(e) => setGatewayFlags({ ...gatewayFlags, routingStrategy: e.target.value as GatewayFlagState['routingStrategy'] })}
                                            className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] text-zinc-100 focus:outline-none focus:border-amber-500/70"
                                        >
                                            <option value="">Gateway default</option>
                                            <option value="cost-optimized">Cost-optimized</option>
                                            <option value="latency-optimized">Latency-optimized</option>
                                            <option value="quality-optimized">Quality-optimized</option>
                                            <option value="balanced">Balanced</option>
                                        </select>
                                    </label>

                                    <div className="px-2 space-y-1">
                                        <span className="text-[9px] uppercase tracking-wider text-zinc-400">Guardrails</span>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={gatewayFlags.piiRedaction}
                                                onChange={(e) => setGatewayFlags({ ...gatewayFlags, piiRedaction: e.target.checked })}
                                                className="rounded border-zinc-700 bg-zinc-950 text-amber-500 focus:ring-amber-500 h-3 w-3"
                                            />
                                            <span className="text-[10px]">PII redaction</span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={gatewayFlags.injectionDefense}
                                                onChange={(e) => setGatewayFlags({ ...gatewayFlags, injectionDefense: e.target.checked })}
                                                className="rounded border-zinc-700 bg-zinc-950 text-amber-500 focus:ring-amber-500 h-3 w-3"
                                            />
                                            <span className="text-[10px]">Prompt-injection defense</span>
                                        </label>
                                        <select
                                            value={gatewayFlags.moderationLevel}
                                            onChange={(e) => setGatewayFlags({ ...gatewayFlags, moderationLevel: e.target.value as GatewayFlagState['moderationLevel'] })}
                                            className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] text-zinc-100 focus:outline-none focus:border-amber-500/70"
                                        >
                                            <option value="">Moderation: gateway default</option>
                                            <option value="off">Moderation: off</option>
                                            <option value="low">Moderation: low</option>
                                            <option value="standard">Moderation: standard</option>
                                            <option value="strict">Moderation: strict</option>
                                        </select>
                                    </div>

                                    <div className="px-2 space-y-1">
                                        <span className="text-[9px] uppercase tracking-wider text-zinc-400">Response healing</span>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={gatewayFlags.autoFixSyntax}
                                                onChange={(e) => setGatewayFlags({ ...gatewayFlags, autoFixSyntax: e.target.checked })}
                                                className="rounded border-zinc-700 bg-zinc-950 text-amber-500 focus:ring-amber-500 h-3 w-3"
                                            />
                                            <span className="text-[10px]">Auto-fix JSON syntax</span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={gatewayFlags.enforceSchema}
                                                onChange={(e) => setGatewayFlags({ ...gatewayFlags, enforceSchema: e.target.checked })}
                                                className="rounded border-zinc-700 bg-zinc-950 text-amber-500 focus:ring-amber-500 h-3 w-3"
                                            />
                                            <span className="text-[10px]">Enforce schema</span>
                                        </label>
                                    </div>

                                    <div className="px-2 space-y-1">
                                        <span className="text-[9px] uppercase tracking-wider text-zinc-400">Fallback models (max 4)</span>
                                        {gatewayFlags.fallbackModels.map((m) => (
                                            <div key={m} className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/5">
                                                <span className="flex-1 min-w-0 truncate font-mono text-[10px] text-zinc-300" title={m}>{m}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => setGatewayFlags({ ...gatewayFlags, fallbackModels: gatewayFlags.fallbackModels.filter((x) => x !== m) })}
                                                    className="text-zinc-500 hover:text-red-400 transition-colors"
                                                    aria-label={`Remove fallback ${m}`}
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        ))}
                                        {gatewayFlags.fallbackModels.length < 4 && (
                                            <div className="flex items-center gap-1.5">
                                                <input
                                                    value={fallbackDraft}
                                                    onChange={(e) => setFallbackDraft(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            const slug = fallbackDraft.trim();
                                                            if (slug.length > 0 && !gatewayFlags.fallbackModels.includes(slug)) {
                                                                setGatewayFlags({ ...gatewayFlags, fallbackModels: [...gatewayFlags.fallbackModels, slug] });
                                                                setFallbackDraft('');
                                                            }
                                                        }
                                                    }}
                                                    placeholder="model slug, e.g. gpt-5-4"
                                                    className="flex-1 min-w-0 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-[10px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/70"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const slug = fallbackDraft.trim();
                                                        if (slug.length > 0 && !gatewayFlags.fallbackModels.includes(slug)) {
                                                            setGatewayFlags({ ...gatewayFlags, fallbackModels: [...gatewayFlags.fallbackModels, slug] });
                                                            setFallbackDraft('');
                                                        }
                                                    }}
                                                    className="rounded border border-amber-500/60 px-2 py-1 text-[10px] font-semibold text-amber-300 hover:bg-amber-500/10 transition-colors"
                                                >
                                                    Add
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    <p className="px-2 pb-1 text-[9px] leading-normal text-zinc-500">
                                        Unset knobs keep the gateway defaults; every value is re-validated by the stream route.
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Shareable run snapshot (audit Step 6) */}
                        {!guestMode && (
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShareOpen(!shareOpen);
                                        if (shareOpen) {
                                            setShareState('idle');
                                            setShareUrl('');
                                        }
                                    }}
                                    disabled={stream.messages.length === 0}
                                    className={cn(
                                        "relative inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 overflow-hidden",
                                        "text-[10px] font-semibold transition-all duration-300 focus:outline-none select-none",
                                        stream.messages.length === 0
                                            ? "bg-zinc-950 border border-zinc-800 text-zinc-600 cursor-not-allowed"
                                            : shareState === 'done'
                                                ? "bg-zinc-950 border border-sky-500/80 text-sky-300 shadow-md"
                                                : "bg-zinc-950 border border-zinc-700/80 text-zinc-100 shadow-md hover:border-zinc-500 hover:bg-zinc-900",
                                    )}
                                    title={stream.messages.length === 0 ? 'Send a message first to share this run' : 'Publish this transcript as a shareable link'}
                                >
                                    <Share2
                                        className={cn(
                                            "h-3.5 w-3.5 shrink-0",
                                            shareState === 'done' ? "text-sky-300" : "text-sky-500/80"
                                        )}
                                    />
                                    <span>{shareState === 'done' ? 'Shared' : 'Share'}</span>
                                </button>
                                {shareOpen && (
                                    <div className="absolute left-0 mt-1.5 w-80 rounded-md border border-white/15 bg-zinc-950/90 backdrop-blur-xl text-zinc-100 shadow-2xl z-50 p-2 text-xs space-y-2">
                                        <div className="px-2 py-1 font-bold text-[9px] uppercase tracking-wider text-sky-400 border-b border-white/15">
                                            Share This Run
                                        </div>
                                        {shareState === 'idle' && (
                                            <div className="px-2 space-y-2">
                                                <p className="text-[10px] leading-normal text-zinc-400">
                                                    Publishes this column&apos;s transcript as a public, read-only page. Anyone with the link can read it.
                                                </p>
                                                <button
                                                    type="button"
                                                    onClick={handleShareRun}
                                                    disabled={stream.messages.length === 0}
                                                    className="w-full rounded border border-sky-500/60 px-2 py-1.5 text-[10px] font-semibold text-sky-300 hover:bg-sky-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    Publish snapshot
                                                </button>
                                            </div>
                                        )}
                                        {shareState === 'saving' && (
                                            <p className="px-2 py-1 text-[10px] text-zinc-400">Publishing…</p>
                                        )}
                                        {shareState === 'error' && (
                                            <div className="px-2 space-y-2">
                                                <p className="text-[10px] text-rose-400">Could not publish the snapshot. Try again.</p>
                                                <button
                                                    type="button"
                                                    onClick={handleShareRun}
                                                    className="w-full rounded border border-sky-500/60 px-2 py-1.5 text-[10px] font-semibold text-sky-300 hover:bg-sky-500/10 transition-colors"
                                                >
                                                    Retry
                                                </button>
                                            </div>
                                        )}
                                        {shareState === 'done' && shareUrl && (
                                            <div className="px-2 space-y-2">
                                                <input
                                                    readOnly
                                                    value={shareUrl}
                                                    onFocus={(e) => e.target.select()}
                                                    className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-[10px] text-zinc-100 focus:outline-none focus:border-sky-500/70"
                                                />
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={handleCopyShareUrl}
                                                        className="flex-1 rounded border border-sky-500/60 px-2 py-1 text-[10px] font-semibold text-sky-300 hover:bg-sky-500/10 transition-colors"
                                                    >
                                                        {shareCopied ? 'Copied' : 'Copy link'}
                                                    </button>
                                                    <a
                                                        href={shareUrl}
                                                        target="_blank"
                                                        rel="noreferrer noopener"
                                                        className="flex-1 rounded border border-zinc-700 px-2 py-1 text-center text-[10px] font-semibold text-zinc-100 hover:bg-zinc-900 transition-colors"
                                                    >
                                                        Open
                                                    </a>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Eval strip (audit Step 7) */}
                        {!guestMode && (
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setEvalOpen(!evalOpen)}
                                    className={cn(
                                        "relative inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 overflow-hidden",
                                        "text-[10px] font-semibold transition-all duration-300 focus:outline-none select-none",
                                        evalDataset.length > 0
                                            ? "bg-zinc-950 border border-violet-500/80 text-violet-300 shadow-md"
                                            : "bg-zinc-950 border border-zinc-700/80 text-zinc-100 shadow-md hover:border-zinc-500 hover:bg-zinc-900",
                                    )}
                                    title="Replay a prompt dataset through this column and score the answers"
                                >
                                    <FlaskConical
                                        className={cn(
                                            "h-3.5 w-3.5 shrink-0",
                                            evalDataset.length > 0 ? "text-violet-300" : "text-violet-500/80"
                                        )}
                                    />
                                    <span>
                                        {evalDataset.length > 0
                                            ? `Eval (${evalDataset.length})`
                                            : 'Eval'}
                                        {evalPhase === 'running' ? '…' : ''}
                                    </span>
                                </button>
                                {evalOpen && (
                                    <div className="absolute left-0 mt-1.5 w-96 rounded-md border border-white/15 bg-zinc-950/90 backdrop-blur-xl text-zinc-100 shadow-2xl z-50 p-2 text-xs space-y-2">
                                        <div className="px-2 py-1 font-bold text-[9px] uppercase tracking-wider text-violet-400 border-b border-white/15">
                                            Eval Strip
                                        </div>

                                        {/* Dataset */}
                                        <div className="px-2 space-y-1">
                                            {evalDataset.map((kase, idx) => (
                                                <div key={kase.id} className="flex items-start gap-1.5 px-2 py-1 rounded bg-white/5">
                                                    <div className="flex-1 min-w-0">
                                                        <p className="truncate text-[10px] text-zinc-200" title={kase.prompt}>{idx + 1}. {kase.prompt}</p>
                                                        <p className="truncate text-[9px] text-zinc-500" title={kase.expected}>expects: {kase.expected}</p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => setEvalDataset(evalDataset.filter((c) => c.id !== kase.id))}
                                                        disabled={evalPhase === 'running'}
                                                        className="text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-40"
                                                        aria-label={`Remove eval case ${idx + 1}`}
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            ))}
                                            {evalDataset.length === 0 && (
                                                <p className="text-[10px] text-zinc-500 italic">No cases yet — add a prompt and the text the answer must contain.</p>
                                            )}
                                        </div>

                                        {/* Add-case form */}
                                        {evalDataset.length < MAX_EVAL_CASES && (
                                            <div className="px-2 space-y-1">
                                                <input
                                                    value={evalDraftPrompt}
                                                    onChange={(e) => setEvalDraftPrompt(e.target.value)}
                                                    disabled={evalPhase === 'running'}
                                                    placeholder="Prompt to replay"
                                                    className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/70 disabled:opacity-50"
                                                />
                                                <div className="flex items-center gap-1.5">
                                                    <input
                                                        value={evalDraftExpected}
                                                        onChange={(e) => setEvalDraftExpected(e.target.value)}
                                                        onKeyDown={(e) => { if (e.key === 'Enter') handleAddEvalCase(); }}
                                                        disabled={evalPhase === 'running'}
                                                        placeholder="Expected text in the answer"
                                                        className="flex-1 min-w-0 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/70 disabled:opacity-50"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={handleAddEvalCase}
                                                        disabled={evalPhase === 'running'}
                                                        className="rounded border border-violet-500/60 px-2 py-1 text-[10px] font-semibold text-violet-300 hover:bg-violet-500/10 transition-colors disabled:opacity-50"
                                                    >
                                                        Add
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {/* Run + progress */}
                                        <div className="px-2 flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={handleStartEval}
                                                disabled={evalPhase === 'running' || evalDataset.length === 0}
                                                className="flex-1 rounded border border-violet-500/60 px-2 py-1.5 text-[10px] font-semibold text-violet-300 hover:bg-violet-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {evalPhase === 'running'
                                                    ? `Running ${evalResults.length}/${evalDataset.length}…`
                                                    : evalPhase === 'done'
                                                        ? 'Re-run eval'
                                                        : 'Run eval'}
                                            </button>
                                            {evalResults.length > 0 && (
                                                <span className="text-[10px] font-semibold text-zinc-300">
                                                    {evalResults.filter((r) => r.status === 'pass').length}/{evalResults.length} pass
                                                </span>
                                            )}
                                        </div>

                                        {/* Results + diff */}
                                        {evalResults.length > 0 && (
                                            <div className="px-1 space-y-1 max-h-40 overflow-y-auto scrollbar-none">
                                                {evalResults.map((result) => {
                                                    const kase = evalDataset.find((c) => c.id === result.caseId);
                                                    return (
                                                        <div key={result.caseId} className="rounded bg-white/5 px-2 py-1 space-y-0.5">
                                                            <div className="flex items-center gap-1.5">
                                                                <span
                                                                    className={cn(
                                                                        'text-[10px] font-bold',
                                                                        result.status === 'pass' && 'text-emerald-400',
                                                                        result.status === 'fail' && 'text-rose-400',
                                                                        result.status === 'error' && 'text-amber-400',
                                                                    )}
                                                                >
                                                                    {result.status === 'pass' ? '✓' : result.status === 'fail' ? '✗' : '!'}
                                                                </span>
                                                                <span className="flex-1 min-w-0 truncate text-[10px] text-zinc-300">{kase?.prompt ?? result.caseId}</span>
                                                                <span className="shrink-0 font-mono text-[9px] text-zinc-500">{result.score.toFixed(2)}</span>
                                                            </div>
                                                            {result.status === 'fail' && kase && (
                                                                <div className="pl-4 text-[9px] leading-normal">
                                                                    <p className="text-zinc-500">expected: <span className="text-zinc-300">{kase.expected.slice(0, 120)}</span></p>
                                                                    <p className="text-zinc-500">got: <span className="text-zinc-300">{(result.output || '(empty answer)').slice(0, 120)}</span></p>
                                                                </div>
                                                            )}
                                                            {result.status === 'error' && (
                                                                <p className="pl-4 text-[9px] text-amber-400/80">stream failed for this case</p>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        <p className="px-2 pb-1 text-[9px] leading-normal text-zinc-500">
                                            Cases replay through this column&apos;s live settings (skills, MCP, gateway flags). Pass = the expected text appears in the answer; everything else shows its real overlap, never a guessed pass. Max {MAX_EVAL_CASES} cases.
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Prompt registry (audit Step 8) */}
                        {!guestMode && (
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => void handleTogglePromptRegistry()}
                                    className={cn(
                                        "relative inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 overflow-hidden",
                                        "text-[10px] font-semibold transition-all duration-300 focus:outline-none select-none",
                                        appliedPrompt
                                            ? "bg-zinc-950 border border-brand-500/80 text-brand-300 shadow-md"
                                            : "bg-zinc-950 border border-zinc-700/80 text-zinc-100 shadow-md hover:border-zinc-500 hover:bg-zinc-900",
                                    )}
                                    title="Versioned prompt classes — apply one as this column's system prompt"
                                >
                                    <BookText
                                        className={cn(
                                            "h-3.5 w-3.5 shrink-0",
                                            appliedPrompt ? "text-brand-300" : "text-brand-500/80"
                                        )}
                                    />
                                    <span>
                                        {appliedPrompt
                                            ? `Prompts · ${promptClasses.find((c) => c.id === appliedPrompt.classId)?.name ?? 'unknown'}`
                                            : 'Prompts'}
                                    </span>
                                </button>
                                {promptRegistryOpen && (
                                    <div className="absolute left-0 mt-1.5 w-96 rounded-md border border-white/15 bg-zinc-950/90 backdrop-blur-xl text-zinc-100 shadow-2xl z-50 p-2 text-xs space-y-2">
                                        <div className="px-2 py-1 font-bold text-[9px] uppercase tracking-wider text-brand-400 border-b border-white/15">
                                            Prompt Registry
                                        </div>

                                        {/* Class list */}
                                        <div className="px-2 space-y-1">
                                            {promptClasses.map((klass) => {
                                                const isActive = appliedPrompt?.classId === klass.id;
                                                const isEditing = editingClassId === klass.id;
                                                return (
                                                    <div key={klass.id} className="rounded bg-white/5 px-2 py-1 space-y-1">
                                                        <div className="flex items-center gap-1.5">
                                                            <div className="flex-1 min-w-0">
                                                                <p className="truncate text-[10px] font-semibold text-zinc-200" title={klass.name}>{klass.name}</p>
                                                                <p className="text-[9px] text-zinc-500">{klass.versions.length} version(s) · active v{klass.activeVersion}</p>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => setAppliedPrompt(isActive ? null : { classId: klass.id, v: klass.activeVersion })}
                                                                className={cn(
                                                                    'rounded border px-1.5 py-0.5 text-[9px] font-semibold transition-colors',
                                                                    isActive
                                                                        ? 'border-brand-500/80 text-brand-300'
                                                                        : 'border-zinc-700 text-zinc-300 hover:bg-zinc-900',
                                                                )}
                                                            >
                                                                {isActive ? 'Active ✓' : 'Apply'}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    if (isEditing) {
                                                                        setEditingClassId(null);
                                                                    } else {
                                                                        setEditingClassId(klass.id);
                                                                        const active = klass.versions.find((ver) => ver.v === klass.activeVersion);
                                                                        setPromptDraftText(active?.text ?? '');
                                                                    }
                                                                }}
                                                                className="rounded border border-zinc-700 px-1.5 py-0.5 text-[9px] font-semibold text-zinc-300 hover:bg-zinc-900 transition-colors"
                                                            >
                                                                {isEditing ? 'Close' : 'Edit'}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeletePromptClass(klass.id)}
                                                                className="text-zinc-500 hover:text-red-400 transition-colors"
                                                                aria-label={`Delete prompt class ${klass.name}`}
                                                            >
                                                                ✕
                                                            </button>
                                                        </div>
                                                        {isEditing && (
                                                            <div className="space-y-1">
                                                                <textarea
                                                                    value={promptDraftText}
                                                                    onChange={(e) => setPromptDraftText(e.target.value)}
                                                                    rows={4}
                                                                    className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-[10px] text-zinc-100 focus:outline-none focus:border-brand-500/70 resize-y"
                                                                    placeholder="System prompt text…"
                                                                />
                                                                <button
                                                                    type="button"
                                                                    onClick={handleSavePromptVersion}
                                                                    disabled={promptDraftText.trim().length === 0}
                                                                    className="w-full rounded border border-brand-500/60 px-2 py-1 text-[10px] font-semibold text-brand-300 hover:bg-brand-500/10 transition-colors disabled:opacity-50"
                                                                >
                                                                    Save as new version
                                                                </button>
                                                                {klass.versions.length > 1 && (
                                                                    <div className="flex flex-wrap gap-1">
                                                                        {[...klass.versions].reverse().map((ver) => (
                                                                            <button
                                                                                key={ver.v}
                                                                                type="button"
                                                                                onClick={() => handleSetActiveVersion(klass.id, ver.v)}
                                                                                className={cn(
                                                                                    'rounded border px-1.5 py-0.5 font-mono text-[9px] transition-colors',
                                                                                    ver.v === klass.activeVersion
                                                                                        ? 'border-brand-500/80 text-brand-300'
                                                                                        : 'border-zinc-700 text-zinc-400 hover:bg-zinc-900',
                                                                                )}
                                                                                title={`Set v${ver.v} active`}
                                                                            >
                                                                                v{ver.v}
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                            {promptClasses.length === 0 && (
                                                <p className="text-[10px] text-zinc-500 italic">No prompt classes yet — create one below.</p>
                                            )}
                                        </div>

                                        {/* New class */}
                                        {promptClasses.length < MAX_PROMPT_CLASSES && (
                                            <div className="px-2 space-y-1">
                                                <input
                                                    value={promptDraftName}
                                                    onChange={(e) => setPromptDraftName(e.target.value)}
                                                    placeholder="New class name"
                                                    maxLength={MAX_PROMPT_NAME_CHARS}
                                                    className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-brand-500/70"
                                                />
                                                <textarea
                                                    value={promptNewText}
                                                    onChange={(e) => setPromptNewText(e.target.value)}
                                                    disabled={editingClassId !== null}
                                                    rows={2}
                                                    placeholder="v1 system prompt text…"
                                                    className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-[10px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-brand-500/70 resize-y disabled:opacity-50"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={handleCreatePromptClass}
                                                    disabled={editingClassId !== null || promptDraftName.trim().length === 0 || promptNewText.trim().length === 0}
                                                    className="w-full rounded border border-brand-500/60 px-2 py-1 text-[10px] font-semibold text-brand-300 hover:bg-brand-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    Create class
                                                </button>
                                            </div>
                                        )}

                                        <p className="px-2 pb-1 text-[9px] leading-normal text-zinc-500">
                                            An applied class overrides the board system prompt for this column only. Saving never overwrites — it appends a version you can switch back to. Max {MAX_PROMPT_CLASSES} classes, {MAX_PROMPT_TEXT_CHARS.toLocaleString()} chars each.
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <CardContent className={cn("p-0 min-h-0 relative", hasMessages ? "flex-1 overflow-hidden" : "h-auto")}>
                {hasMessages ? (
                    <div className="absolute inset-0">
                        <ScrollArea className="h-full">
                            <div className="px-3 py-3">
                                {/* Inline upsell: shown when a guest tries to pick a
                                    registered-only model (picker auto-reverts, this
                                    banner explains why). */}
                                {lockedModelName ? (
                                    <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-xs text-amber-200">
                                        <Icon name="lock" className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-400" aria-hidden />
                                        <div className="flex-1 leading-relaxed">
                                            <p className="font-semibold text-amber-100">
                                                This column was switched to a guest-access model.
                                            </p>
                                            <p className="mt-0.5 text-amber-200/80">
                                                <span className="font-semibold text-amber-100">{lockedModelName}</span>{' '}
                                                is for signed-in members. Sign up free to unlock it and
                                                the full cloud catalogue.
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={onSignUp}
                                            className="flex-shrink-0 rounded-md border border-amber-500/60 bg-amber-500/20 px-2 py-1 text-[10px] font-semibold text-amber-200 transition-colors hover:bg-amber-500/30"
                                        >
                                            Continue (sign up free)
                                        </button>
                                    </div>
                                ) : null}

                                {/* Prior turns — committed message history rendered as
                                    static user/assistant pairs. The current in-progress
                                    stream (reasoning + content) renders below this block. */}
                                {stream.messages.map((msg, idx) => (
                                    <div key={idx} className="mb-4">
                                        {msg.role === 'user' ? (
                                            <div>
                                                {/* Inline image/video/audio attachment previews */}
                                                {msg.attachments && msg.attachments.length > 0 && (
                                                    <div className="mb-2 grid grid-cols-3 gap-1.5">
                                                        {msg.attachments.map((att, ai) => (
                                                            <div
                                                                key={ai}
                                                                className="relative aspect-square overflow-hidden rounded-md border border-white/10 bg-black/40 group/att"
                                                            >
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
                                                                    <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2">
                                                                        <Icon name="file-document" className="h-5 w-5 text-white/50" aria-hidden />
                                                                        <span className="text-[9px] text-white/40 truncate max-w-full px-1">
                                                                            {att.name ?? 'Document'}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                <div className="whitespace-pre-wrap break-words rounded-md border border-primary/20 bg-primary/5 p-3 text-[12px] leading-relaxed text-foreground">
                                                    {msg.content}
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                {msg.reasoning && msg.reasoning.trim().length > 0 ? (
                                                    <Accordion
                                                        type="single"
                                                        collapsible
                                                        className="mb-2 rounded-md border border-white/15 bg-white/5"
                                                    >
                                                        <AccordionItem value={`thinking-${idx}`} className="border-0">
                                                            <AccordionTrigger className="px-3 py-2 text-xs font-semibold uppercase tracking-widest text-zinc-400 hover:text-zinc-200 hover:no-underline">
                                                                <span className="flex items-center gap-2">
                                                                    <Brain className="h-3.5 w-3.5 text-brand-400" aria-hidden />
                                                                    Thinking
                                                                    <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-mono normal-case text-zinc-300">
                                                                        {msg.reasoning.length.toLocaleString()} chars
                                                                    </span>
                                                                </span>
                                                            </AccordionTrigger>
                                                            <AccordionContent className="px-3 pb-3">
                                                                <pre className="custom-scrollbar max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-background/60 p-3 font-mono text-[11px] leading-relaxed text-foreground/80">
                                                                    {msg.reasoning}
                                                                </pre>
                                                            </AccordionContent>
                                                        </AccordionItem>
                                                    </Accordion>
                                                ) : null}
                                                <div className="relative group">
                                                    {formatMessageContent(msg.content)}
                                                    <div className="absolute right-2 bottom-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <CopyButton text={msg.content} />
                                                    </div>
                                                </div>
                                                {/* Artifact detector: show "Preview App" button for renderable code blocks */}
                                                {(() => {
                                                    // Build Mode emits one multi-file fence; merge same-family
                                                    // blocks so the preview shows the whole project, not fragments.
                                                    const merged = mergeArtifactBlocks(msg.content);
                                                    const artifacts = merged ? [merged] : detectArtifacts(msg.content);
                                                    if (artifacts.length === 0) return null;
                                                    return (
                                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                                            {artifacts.map((artifact, aIdx) => (
                                                                <Fragment key={aIdx}>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setActiveArtifact?.(artifact)}
                                                                        className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/40 bg-sky-500/10 px-3 py-1 text-[11px] font-medium text-sky-400 transition-colors hover:bg-sky-500/20 hover:border-sky-500/60"
                                                                    >
                                                                        <Icon name="show" className="h-3 w-3" />
                                                                        Preview {artifact.lang.toUpperCase()} App
                                                                        {artifacts.length > 1 && ` #${aIdx + 1}`}
                                                                    </button>
                                                                    {onMakeApp && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => onMakeApp(artifact)}
                                                                            className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-[11px] font-medium text-amber-400 transition-colors hover:bg-amber-500/20 hover:border-amber-500/60"
                                                                        >
                                                                            <Hammer className="h-3 w-3" aria-hidden />
                                                                            Make this an App
                                                                        </button>
                                                                    )}
                                                                </Fragment>
                                                            ))}
                                                        </div>
                                                    );
                                                })()}
                                            </>
                                        )}
                                    </div>
                                ))}

                                {stream.reasoning.trim().length > 0 ? (
                                    <Accordion
                                        type="single"
                                        collapsible
                                        className="mb-3 rounded-md border border-border bg-muted/30"
                                    >
                                        <AccordionItem value="thinking" className="border-0">
                                            <AccordionTrigger className="px-3 py-2 text-xs font-semibold uppercase tracking-widest text-zinc-400 hover:text-zinc-200 hover:no-underline">
                                                <span className="flex items-center gap-2">
                                                    <Brain className="h-3.5 w-3.5 text-brand-400" aria-hidden />
                                                    Thinking
                                                    <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-mono normal-case text-zinc-300">
                                                        {stream.reasoning.length.toLocaleString()} chars
                                                    </span>
                                                </span>
                                            </AccordionTrigger>
                                            <AccordionContent className="px-3 pb-3">
                                                <pre className="custom-scrollbar max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md border border-white/15 bg-white/5 p-3 font-mono text-[11px] leading-relaxed text-zinc-200">
                                                    {stream.reasoning}
                                                </pre>
                                            </AccordionContent>
                                        </AccordionItem>
                                    </Accordion>
                                ) : null}

                                {stream.content.trim().length > 0 ? (
                                    <div className="relative group">
                                        {formatMessageContent(stream.content)}
                                        <div className="absolute right-2 bottom-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <CopyButton text={stream.content} />
                                        </div>
                                    </div>
                                ) : null}

                                {isError ? (
                                    (() => {
                                        // Branch the error copy per `errorCode` so the
                                        // user gets an actionable message instead of the
                                        // raw gateway text (audit P1-3). Layout/styling is
                                        // unchanged — text-only improvement, no new UI.
                                        const code = stream.errorCode;
                                        // A user-initiated stop is not a failure —
                                        // it gets a neutral panel, not the red card.
                                        const aborted = code === 'aborted';
                                        const friendly =
                                            code === 'model_fallback'
                                                ? "Model unavailable on this key — the upstream provider doesn't have this model provisioned on the key for your current tier. Try a different model, or contact support to add it to your tier."
                                                : code === 'insufficient_credits'
                                                  ? "You're out of credits. Top up to continue."
                                                  : code === 'rate_limited'
                                                    ? 'Too many requests — please wait a moment and retry.'
                                                    : null;
                                        const display = friendly ?? stream.errorMessage ?? 'Unknown error';
                                        return (
                                            <div className={aborted
                                                ? 'rounded-md border border-white/20 bg-white/5 p-3 text-xs text-zinc-300'
                                                : 'rounded-md border border-destructive/60 bg-destructive/10 p-3 text-xs text-destructive'}>
                                                <div className="mb-1 flex items-center gap-2 font-semibold">
                                                    <Icon name="triangle-warning" className="h-3.5 w-3.5" aria-hidden />
                                                    {aborted ? 'Stopped' : 'Error'}
                                                </div>
                                                <div className="whitespace-pre-wrap break-words">
                                                    {aborted ? 'The run was cancelled.' : display}
                                                </div>
                                                <div className="mt-2 flex gap-2">
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={(): void => stream.reset()}
                                                        className="h-7 px-2 text-xs"
                                                    >
                                                        Clear
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })()
                                ) : null}
                                <div ref={scrollRef} />
                            </div>
                        </ScrollArea>
                    </div>
                ) : (
                    <div className="px-3 py-4">
                        {stream.state === 'idle' && stream.messages.length === 0 ? (
                            <EmptyState
                                title="Ready"
                                message="Type a prompt below to dispatch this column. Add another column to compare side-by-side."
                            />
                        ) : null}

                        {stream.state === 'connecting' ? (
                            <EmptyState title="Connecting" spinner message="Establishing stream…" />
                        ) : null}
                    </div>
                )}
            </CardContent>

            {/* Live tool-execution feed — appears only when the stream
                surfaced real `tool_call` events (gateway web-search loop). */}
            <ToolActivityStrip toolCalls={stream.toolCalls} isStreaming={isStreaming} />

            <div className="grid grid-cols-4 gap-1 border-t border-white/15 bg-white/5 px-3 py-2 text-[10px] uppercase tracking-wider text-blue-400">
                <TelemetryCell label="TTFT" value={stream.ttftMs !== null ? `${stream.ttftMs}ms` : '—'} />
                <TelemetryCell label="Speed" value={isStreaming ? `${stream.tokensPerSec.toFixed(0)} t/s` : '—'} />
                <TelemetryCell label="Tokens" value={stream.tokensSoFar.toLocaleString()} />
                {/* Guests never pay credits — their currency is the 24h
                    request pool, so claiming credits here would lie. */}
                <TelemetryCell label="Cost" value={guestMode ? 'guest pool' : `${stream.costSoFar.toFixed(2)} credits`} />
            </div>
            {(() => {
                const totalTokens = stream.inputTokens + stream.outputTokens;
                const contextLimit = model?.maxTokens || 4096;
                const contextPercent = Math.min(100, Math.round((totalTokens / contextLimit) * 100));
                return (
                    <div className="flex items-center gap-2 border-t border-white/15 bg-white/5 px-3 py-2 text-xs">
                        <RadialProgress value={totalTokens} max={contextLimit} size={14} strokeWidth={2} showText={false} />
                        <span className="text-[11px] font-mono text-zinc-300" title="Estimated retail market cost">
                            {contextPercent}% · {formatMsrpUsd(stream.costSoFar)} (MSRP)
                        </span>
                    </div>
                );
            })()}

            <GetCodeModal
                open={codeOpen}
                onOpenChange={setCodeOpen}
                modelId={modelId}
                modelDisplayName={model?.displayName}
                prompt={stream.messages.find((m) => m.role === 'user')?.content || ''}
                options={paramValues}
                conversationHistory={stream.messages}
            />
        </Card>
    );
}
