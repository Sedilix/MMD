'use client';

/**
 * `usePlaygroundStream` — one hook instance per Playground column.
 *
 * Each call owns its own `AbortController`, telemetry state, and reader.
 * The global prompt bar fans out by invoking `send(prompt)` on every
 * active column's hook in parallel via `Promise.allSettled`, so a single
 * column failing to stream does not affect the others. This is the core
 * fault-isolation invariant of the "War Room" canvas.
 *
 * Wire contract:
 *   The hook POSTs `{ prompt, history?, ...opts }` to
 *   `/api/playground/stream/<modelId>` with a `Bearer` Firebase ID token.
 *   The route responds with `text/event-stream` SSE frames shaped per the
 *   `PlaygroundStreamEvent` discriminated union (see
 *   `src/lib/playground/types.ts`). Frames look like
 *   `event: token\ndata: {...}\n\n` and we parse both `event:` and `data:`
 *   lines so we can dispatch on the SSE type discriminator.
 *
 * Multi-turn:
 *   The hook maintains a `messages` array (user + assistant turns). On every
 *   `send(prompt)` we append the user turn, send the *prior* messages as
 *   `history`, stream the response, then append the assistant turn on
 *   success. A failed stream leaves the messages array unchanged so the
 *   user can retry with the same context.
 *
 * Telemetry:
 *   - `ttftMs` — captured at first byte arrival via `Date.now() - start`.
 *   - `tokensPerSec` — rolling estimate over a 1-second sliding window
 *     driven by `requestAnimationFrame` while `state === 'streaming'`.
 *   - `elapsedMs` — clock-driven, updates every animation frame so the
 *     column footer can render a live "streaming for 4.2s" indicator.
 *   - `costSoFar` — server-reported; we just consume it from each event.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getAuth } from 'firebase/auth';
import type { PlaygroundChatMessage, PlaygroundStreamEvent } from '../types';
import { streamLocalOllamaCompletion } from '@/lib/desktop/ollama-client';
import { getBYOKKeyForModel } from '@/lib/desktop/byok-store';
import { streamBYOKCompletion } from '@/lib/desktop/byok-client';

// ─── Guest-mode plumbing ─────────────────────────────────────────────────────
//
// When `guestMode` is true the hook sends the request WITHOUT an
// `Authorization` header — the `__pg_guest` fingerprint cookie (HttpOnly, set
// by the server on first visit) carries the identity. The route's guest
// gate then weights the prompt cost and debits the 24h request pool.
//
// The hook does NOT need to know the guest id itself; the server owns it.
// It only needs to surface the guest quota in the UI, which we do by
// reflecting the `guest` field the route includes on 402 responses.

// ─── Public types ───────────────────────────────────────────────────────────

export type PlaygroundStreamState =
    | 'idle'
    | 'connecting'
    | 'streaming'
    | 'done'
    | 'error';

export interface PlaygroundAttachmentInput {
    mimeType: string;
    dataUrl: string;
}

export interface PlaygroundStreamSendOptions {
    systemPrompt?: string;
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    reasoningEffort?: 'none' | 'light' | 'standard' | 'xhigh';
    attachments?: Array<PlaygroundAttachmentInput>;
    enabledSkills?: string[];
    /** MCP tool-server URLs registered on the column (audit Step 3). */
    mcpServers?: string[];
    /** Gateway flags (audit Step 4). */
    routingStrategy?: 'cost-optimized' | 'latency-optimized' | 'quality-optimized' | 'balanced';
    guardrails?: {
        piiRedaction?: boolean;
        injectionDefense?: boolean;
        moderationLevel?: 'off' | 'low' | 'standard' | 'strict';
    };
    fallbackModels?: string[];
    responseHealing?: { autoFixSyntax?: boolean; enforceSchema?: boolean };
}

/**
 * A single turn in the column's conversation history. This is the client-side
 * shape — `ts` is used for display ordering and guest-history persistence.
 * The server receives a trimmed version (without `ts`/`reasoning`) as
 * `PlaygroundChatMessage`.
 */
export interface PlaygroundMessageTurnAttachment {
    /** MIME type — used to decide whether to render an <img>, a video, or a doc chip. */
    mimeType: string;
    /** Stable client-side id (kept separate from `name` so duplicates don't collide). */
    id?: string;
    /** Original filename (best-effort). */
    name?: string;
    /** data:<mime>;base64,... — full data URL so the client can render thumbnails. */
    dataUrl: string;
}

export interface PlaygroundMessageTurn {
    role: 'user' | 'assistant';
    content: string;
    /** Thinking / reasoning content — only on assistant turns from reasoning models. */
    reasoning?: string;
    /** Unix-ms timestamp for ordering and display. */
    ts: number;
    /**
     * Multimodal attachments uploaded with this user turn. The server strips
     * these before forwarding history (it only carries the prompt + reasoning)
     * but we keep them on the client so the chat can show a thumbnail row.
     */
    attachments?: PlaygroundMessageTurnAttachment[];
}

/**
 * One executed tool call observed on the wire (`tool_call` SSE event).
 * The server only emits these on real evidence of execution (gateway
 * web-search spend or url_citation annotations), so every record here
 * corresponds to an actual tool run — never a guess.
 */
export interface PlaygroundToolCallRecord {
    /** Tool identifier, e.g. `web_search`. */
    toolName: string;
    /** JSON-encoded evidence/arguments; validate per tool at the call-site. */
    arguments: string;
    /** Client receive timestamp (unix ms) for ordering. */
    ts: number;
}

export interface UsePlaygroundStreamResult {
    state: PlaygroundStreamState;
    content: string;
    reasoning: string;
    /** Multi-turn conversation history. Empty on first send; grows with each exchange. */
    messages: PlaygroundMessageTurn[];
    /** Tool executions observed during the current run (cleared per send). */
    toolCalls: PlaygroundToolCallRecord[];
    ttftMs: number | null;
    tokensSoFar: number;
    inputTokens: number;
    outputTokens: number;
    costSoFar: number;
    tokensPerSec: number;
    startedAt: number | null;
    elapsedMs: number;
    errorMessage: string | null;
    /**
     * Short error code surfaced from the stream error event
     * (`model_fallback`, `insufficient_credits`, `rate_limited`,
     * `deduction_failed`, `upstream_failed`, …). Lets the UI branch the
     * message copy per code without parsing the human-readable message
     * (audit P1-3). `null` when no error is present.
     */
    errorCode: string | null;
    /** Snapshot of the guest request pool, surfaced from 402 responses. */
    guestQuota: GuestQuotaSnapshot | null;
    send(prompt: string, opts?: PlaygroundStreamSendOptions): Promise<void>;
    abort(): void;
    reset(): void;
    /** Replace the conversation history (used for guest hydration and model changes). */
    setMessages(messages: PlaygroundMessageTurn[]): void;
}

/**
 * Client-side mirror of the guest quota the server returns on a 402. The
 * playground page renders the "X of 8 requests left" banner from this.
 */
export interface GuestQuotaSnapshot {
    requestsUsed: number;
    requestsLimit: number;
    imageLimit?: number;
    imageUsed?: number;
    imageRemaining?: number;
    /** Unix-ms when the 72h window resets. */
    windowResetsAt: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Endpoint shape — `modelId` is interpolated, never trusted from user input. */
const STREAM_PATH_PREFIX = '/api/playground/stream/';

/**
 * Default system prompt prepended when the caller doesn't supply one.
 * Helps narrow the model's behavior toward a development-assistant tone.
 */
const DEFAULT_SYSTEM_PROMPT =
    'You are a helpful, expert developer assistant.';

// ─── Hook ───────────────────────────────────────────────────────────────────

/**
 * Subscribe to a single streaming lane for `modelId`.
 *
 * The returned object is stable across renders except for `state` and
 * content fields. Each call to `send(prompt)` appends the user turn to
 * `messages`, sends prior history to the server, streams the response into
 * the live `content`/`reasoning` slots, then on `done` moves the completed
 * assistant turn into `messages` so it survives across turns.
 */
export function usePlaygroundStream(
    modelId: string,
    guestMode = false,
    onComplete?: (finalText: string, finalReasoning?: string) => void
): UsePlaygroundStreamResult {
    const [state, setState] = useState<PlaygroundStreamState>('idle');
    /** Live streaming content (last assistant turn in progress). */
    const [content, setContent] = useState<string>('');
    /** Live reasoning/thinking accordion content. */
    const [reasoning, setReasoning] = useState<string>('');
    /** Committed conversation history (user + completed assistant turns). */
    const [messages, setMessages] = useState<PlaygroundMessageTurn[]>([]);
    const [ttftMs, setTtftMs] = useState<number | null>(null);
    const [tokensSoFar, setTokensSoFar] = useState<number>(0);
    const [inputTokens, setInputTokens] = useState<number>(0);
    const [outputTokens, setOutputTokens] = useState<number>(0);
    const [costSoFar, setCostSoFar] = useState<number>(0);
    const [tokensPerSec, setTokensPerSec] = useState<number>(0);
    const [startedAt, setStartedAt] = useState<number | null>(null);
    const [elapsedMs, setElapsedMs] = useState<number>(0);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [errorCode, setErrorCode] = useState<string | null>(null);
    const [guestQuota, setGuestQuota] = useState<GuestQuotaSnapshot | null>(null);
    /** Tool executions observed during the current run. */
    const [toolCalls, setToolCalls] = useState<PlaygroundToolCallRecord[]>([]);

    // ── Latest-modelId ref (defense-in-depth) ─────────────────────────
    // The `modelId` prop drives the URL the hook POSTs to. The `send`
    // callback is memoized on `[modelId]` so it normally re-binds on every
    // model change — but callers like `PlaygroundColumn` wrap `send` in
    // another `useCallback` whose deps include `stream.send`. If a parent
    // ever captures our `send` in a long-lived closure (e.g. through a ref
    // or a stale selector), the URL would still point at the original model
    // and the route's URL-param-is-truthy contract would silently serve the
    // first-picked model. We mirror `modelId` into a ref every render and
    // read it from inside `send` so the URL is *always* built from the
    // freshest prop value, independently of any outer memoization.
    const modelIdRef = useRef<string>(modelId);
    modelIdRef.current = modelId;

    // ── Latest-callback ref for `onComplete` ─────────────────────────────
    // `send` is memoized on `[modelId]` only (it captures a stable fetch
    // pipeline), which means the `handleSseFrame` it closes over — and
    // therefore the `onComplete` passed to this hook — is frozen at the
    // render where `modelId` last changed. Without this ref, callers like
    // the MMD hook (which pass an arrow capturing the live `mmd.onColumnComplete`
    // / `mmd.onChairmanComplete`) would invoke a stale closure whose guarded
    // `mmdState` never advances. We keep the ref updated every render and
    // invoke `onCompleteRef.current` from the `done` handler so the MMD state
    // machine always sees the latest `mmdState`/`mmdRound`.
    const onCompleteRef = useRef(onComplete);
    onCompleteRef.current = onComplete;

    // ── Latest-messages ref (multi-turn truth) ───────────────────────
    // `send` is memoized on `[modelId]`, so reading the `messages` state
    // inside it would snapshot the history as of the last model change
    // and silently freeze multi-turn context. Mirror the committed
    // history into a ref every render and snapshot from the ref.
    const messagesRef = useRef<PlaygroundMessageTurn[]>(messages);
    messagesRef.current = messages;

    // ── TTFT once-stamp guard ────────────────────────────────────────
    // The memoized `send` closes over a `handleSseFrame` whose `ttftMs`
    // state binding never changes, so a state-based guard would re-stamp
    // on every token event and drift TTFT toward total stream time —
    // the headline benchmark metric would lie. A ref makes the stamp
    // exactly-once per run.
    const ttftStampedRef = useRef<boolean>(false);

    // Mutable refs that survive renders and aren't tied to React state —
    // used for the rolling tokens/sec window, the AbortController, and
    // the SSE byte buffer.
    const abortControllerRef = useRef<AbortController | null>(null);
    const tokenWindowRef = useRef<Array<{ t: number; tokens: number }>>([]);
    const tokensSoFarRef = useRef<number>(0);
    const rafRef = useRef<number | null>(null);
    const bufferRef = useRef<string>('');
    // Live content refs — updated on every token event without triggering
    // a full history re-render. Flushed to `messages` on stream completion.
    const liveContentRef = useRef<string>('');
    const liveReasoningRef = useRef<string>('');
    // Set true when the stream emits an error event so we know to roll back the
    // optimistically-appended user turn on completion.
    const streamErroredRef = useRef<boolean>(false);

    // ── Telemetry tick ─────────────────────────────────────────────────
    // We use a single rAF loop that drives both `elapsedMs` and
    // `tokensPerSec` while a stream is active. This keeps the column
    // footer in sync without spinning multiple timers.
    useEffect(() => {
        function tick(): void {
            const start = abortControllerRef.current ? startedAt : null;
            const localStart = start ?? startedAt;
            if (state === 'streaming' && localStart !== null) {
                setElapsedMs(Date.now() - localStart);

                // Roll the 1-second window: drop entries older than 1s.
                const now = Date.now();
                const window = tokenWindowRef.current;
                while (window.length > 0 && now - window[0].t > 1000) {
                    window.shift();
                }
                const sum = window.reduce((acc, entry) => acc + entry.tokens, 0);
                setTokensPerSec(sum);
            }
            rafRef.current = requestAnimationFrame(tick);
        }

        if (state === 'streaming') {
            rafRef.current = requestAnimationFrame(tick);
        }
        return () => {
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
        };
    }, [state, startedAt]);

    // ── Reset (also fires on unmount to free the controller) ────────────
    const reset = useCallback((): void => {
        if (abortControllerRef.current) {
            try {
                abortControllerRef.current.abort();
            } catch {
                /* noop */
            }
            abortControllerRef.current = null;
        }
        tokenWindowRef.current = [];
        tokensSoFarRef.current = 0;
        bufferRef.current = '';
        liveContentRef.current = '';
        liveReasoningRef.current = '';
        setState('idle');
        setContent('');
        setReasoning('');
        setMessages([]);
        setTtftMs(null);
        setTokensSoFar(0);
        setInputTokens(0);
        setOutputTokens(0);
        setCostSoFar(0);
        setTokensPerSec(0);
        setStartedAt(null);
        setElapsedMs(0);
        setErrorMessage(null);
        setToolCalls([]);
        ttftStampedRef.current = false;
        // Guest quota snapshot is sticky across column resets so the banner
        // doesn't flicker on every column clear — explicit `setGuestQuota(null)`
        // belongs to the page-level reset, not here.
    }, []);

    /** Replace the conversation history (used for guest hydration and model changes). */
    const setMessagesCallback = useCallback((next: PlaygroundMessageTurn[]): void => {
        setMessages(next);
    }, []);

    // Free the controller if the column unmounts mid-stream.
    useEffect(() => {
        return () => {
            if (abortControllerRef.current) {
                try {
                    abortControllerRef.current.abort();
                } catch {
                    /* noop */
                }
                abortControllerRef.current = null;
            }
        };
    }, []);

    // ── Abort ──────────────────────────────────────────────────────────
    const abort = useCallback((): void => {
        if (abortControllerRef.current) {
            try {
                abortControllerRef.current.abort();
            } catch {
                /* noop */
            }
        }
    }, []);

    // ── Send ───────────────────────────────────────────────────────────
    const send = useCallback(
        async (prompt: string, opts: PlaygroundStreamSendOptions = {}): Promise<void> => {
            // Read from the ref every call so the URL always reflects the
            // current model — even if an outer closure captured a stale `send`.
            const liveModelId = modelIdRef.current;
            if (!liveModelId) {
                setState('error');
                setErrorMessage('Missing model id.');
                return;
            }
            if (!prompt || prompt.trim().length === 0) {
                setState('error');
                setErrorMessage('Prompt is required.');
                return;
            }

            // 1) Resolve the Firebase ID token unless we're in guest mode.
            //    Guest mode skips auth entirely — the `__pg_guest` cookie
            //    (HttpOnly, sent automatically by the browser) carries the
            //    identity and the server gates it to the local model + the
            //    8-request pool.
            let token: string | null = null;
            if (!guestMode) {
                const auth = getAuth();
                const current = auth.currentUser;
                if (!current) {
                    setState('error');
                    setErrorCode('auth_required');
                    setErrorMessage('auth_required');
                    return;
                }
                try {
                    token = await current.getIdToken();
                } catch {
                    setState('error');
                    setErrorCode('auth_required');
                    setErrorMessage('auth_required');
                    return;
                }
            }

            // 2) Cancel any in-flight stream and reset streaming state for the
            //    new run. We do NOT clear messages — they persist across turns.
            if (abortControllerRef.current) {
                try {
                    abortControllerRef.current.abort();
                } catch {
                    /* noop */
                }
            }
            const controller = new AbortController();
            abortControllerRef.current = controller;
            tokenWindowRef.current = [];
            tokensSoFarRef.current = 0;
            bufferRef.current = '';
            liveContentRef.current = '';
            liveReasoningRef.current = '';
            streamErroredRef.current = false;
            ttftStampedRef.current = false;

            // 2b) Append the user turn to the conversation history and snapshot
            //     prior history for the request body.
            const userTurn: PlaygroundMessageTurn = {
                role: 'user',
                content: prompt,
                ts: Date.now(),
                ...(opts.attachments && opts.attachments.length > 0
                    ? {
                        attachments: opts.attachments.map((a) => ({
                            mimeType: a.mimeType,
                            dataUrl: a.dataUrl,
                        })),
                    }
                    : {}),
            };
            setMessages((prev) => [...prev, userTurn]);
            // Snapshot the history *before* the user turn so the server gets
            // the prior context. Read from the ref: the memoized closure's
            // `messages` binding is frozen at the last model change.
            const priorHistory: PlaygroundChatMessage[] = messagesRef.current.map((m) => ({
                role: m.role,
                content: m.content,
            }));

            setState('connecting');
            setContent('');
            setReasoning('');
            setTtftMs(null);
            setTokensSoFar(0);
            setInputTokens(0);
            setOutputTokens(0);
            setCostSoFar(0);
            setTokensPerSec(0);
            setStartedAt(Date.now());
            setElapsedMs(0);
            setErrorMessage(null);
            setErrorCode(null);
            setToolCalls([]);

            const startTime = Date.now();

            // Local Ollama client-direct streaming (0 server cost / 0 credit deduction)
            if (liveModelId.startsWith('ollama:') || liveModelId.startsWith('local:')) {
                const cleanModelName = liveModelId.replace(/^(ollama:|local:)/, '');
                const systemPrompt = opts.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
                const formattedMessages: Array<{ role: string; content: string }> = [];
                if (systemPrompt) {
                    formattedMessages.push({ role: 'system', content: systemPrompt });
                }
                for (const m of priorHistory) {
                    formattedMessages.push({ role: m.role, content: m.content });
                }
                formattedMessages.push({ role: 'user', content: prompt });

                setState('streaming');
                try {
                    let firstToken = true;
                    const result = await streamLocalOllamaCompletion({
                        model: cleanModelName,
                        messages: formattedMessages,
                        signal: controller.signal,
                        onToken: (chunk) => {
                            if (firstToken) {
                                firstToken = false;
                                setTtftMs(Date.now() - startTime);
                            }
                            liveContentRef.current += chunk;
                            setContent((prev) => prev + chunk);
                            tokensSoFarRef.current += 1;
                            setTokensSoFar((prev) => prev + 1);
                            tokenWindowRef.current.push({ t: Date.now(), tokens: 1 });
                        },
                    });

                    const finalAssistantMessage: PlaygroundMessageTurn = {
                        role: 'assistant',
                        content: result.fullText,
                        ts: Date.now(),
                    };
                    setMessages((prev) => [...prev, finalAssistantMessage]);
                    setInputTokens(result.promptTokens ?? 0);
                    setOutputTokens(result.completionTokens ?? tokensSoFarRef.current);
                    setState('done');
                    if (onCompleteRef.current) onCompleteRef.current(result.fullText, undefined);
                    return;
                } catch (err: unknown) {
                    if (controller.signal.aborted) {
                        setState('error');
                        setErrorCode('aborted');
                        setErrorMessage('aborted');
                        return;
                    }
                    setState('error');
                    setErrorCode('network_error');
                    setErrorMessage(err instanceof Error ? err.message : 'Local Ollama connection failed. Ensure Ollama is running on localhost:11434');
                    return;
                }
            }

            // 2.5) BYOK Primary: If the user configured their own API key, stream directly
            // with 0 credit deduction. If it fails (e.g. rate limit 429, quota exhausted),
            // seamlessly fall back to Cybrdeck managed provider so their workflow never stops.
            const byokInfo = getBYOKKeyForModel(liveModelId);
            if (byokInfo) {
                try {
                    setState('streaming');
                    const startTime = Date.now();
                    const result = await streamBYOKCompletion(liveModelId, byokInfo, {
                        prompt,
                        systemPrompt: opts.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
                        history: priorHistory,
                        temperature: opts.temperature,
                        topP: opts.topP,
                        maxTokens: opts.maxTokens,
                        signal: controller.signal,
                        onChunk: (chunk: string) => {
                            if (!ttftStampedRef.current) {
                                ttftStampedRef.current = true;
                                setTtftMs(Date.now() - startTime);
                            }
                            liveContentRef.current += chunk;
                            setContent((prev) => prev + chunk);
                            tokensSoFarRef.current += 1;
                            setTokensSoFar((prev) => prev + 1);
                            tokenWindowRef.current.push({ t: Date.now(), tokens: 1 });
                        },
                    });

                    const finalAssistantMessage: PlaygroundMessageTurn = {
                        role: 'assistant',
                        content: result.fullText,
                        ts: Date.now(),
                    };
                    setMessages((prev) => [...prev, finalAssistantMessage]);
                    setInputTokens(result.promptTokens ?? 0);
                    setOutputTokens(result.completionTokens ?? tokensSoFarRef.current);
                    setState('done');
                    if (onCompleteRef.current) onCompleteRef.current(result.fullText, undefined);
                    return;
                } catch (byokErr: unknown) {
                    if (controller.signal.aborted) {
                        setState('error');
                        setErrorCode('aborted');
                        setErrorMessage('aborted');
                        return;
                    }
                    console.warn(`[BYOK] Direct ${byokInfo.provider} stream failed, automatically falling back to Cybrdeck managed provider:`, byokErr);
                    // Reset accumulators for the fallback stream
                    bufferRef.current = '';
                    liveContentRef.current = '';
                    setContent('');
                    tokensSoFarRef.current = 0;
                    setTokensSoFar(0);
                    // Fallthrough to step 3 (Cybrdeck managed provider backup)
                }
            }

            // 3) POST to the streaming endpoint (Cybrdeck Managed / Backup Provider).
            // `liveModelId` is read from the ref so the URL always matches
            // the currently selected model — the route treats the URL param
            // as the source of truth, so a stale URL would silently serve the
            // wrong model.
            const url = `${STREAM_PATH_PREFIX}${encodeURIComponent(liveModelId)}`;
            const body = JSON.stringify({
                modelId: liveModelId,
                prompt,
                history: priorHistory.length > 0 ? priorHistory : undefined,
                systemPrompt: opts.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
                enabledSkills: opts.enabledSkills,
                ...(opts.mcpServers && opts.mcpServers.length > 0
                    ? { mcpServers: opts.mcpServers }
                    : {}),
                ...(opts.routingStrategy ? { routingStrategy: opts.routingStrategy } : {}),
                ...(opts.guardrails ? { guardrails: opts.guardrails } : {}),
                ...(opts.fallbackModels && opts.fallbackModels.length > 0
                    ? { fallbackModels: opts.fallbackModels }
                    : {}),
                ...(opts.responseHealing ? { responseHealing: opts.responseHealing } : {}),
                ...(typeof opts.temperature === 'number' ? { temperature: opts.temperature } : {}),
                ...(typeof opts.topP === 'number' ? { topP: opts.topP } : {}),
                ...(typeof opts.maxTokens === 'number' ? { maxTokens: opts.maxTokens } : {}),
                ...(opts.reasoningEffort ? { reasoningEffort: opts.reasoningEffort } : {}),
                ...(opts.attachments && opts.attachments.length > 0
                    ? {
                        attachments: opts.attachments.map((a) => ({
                            mimeType: a.mimeType,
                            data: a.dataUrl,
                            name: a.dataUrl.slice(0, 64),
                        })),
                    }
                    : {}),
            });

            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            };

            let response: Response;
            try {
                response = await fetch(url, {
                    method: 'POST',
                    headers,
                    body,
                    signal: controller.signal,
                    credentials: 'include',
                });
            } catch (err: unknown) {
                if (controller.signal.aborted) {
                    setState('error');
                    setErrorCode('aborted');
                    setErrorMessage('aborted');
                    return;
                }
                setState('error');
                setErrorCode('network_error');
                const msg = err instanceof Error ? err.message : 'Network error';
                setErrorMessage(msg);
                return;
            }

            // 4) HTTP-level error gates (401, 402, 4xx/5xx).
            if (!response.ok) {
                if (response.status === 401) {
                    setState('error');
                    setErrorCode('auth_required');
                    setErrorMessage('auth_required');
                    return;
                }
                if (response.status === 402) {
                    let payload: {
                        error?: string;
                        message?: string;
                        guest?: {
                            requestsUsed: number;
                            requestsLimit: number;
                            windowResetsAt: number;
                            imageLimit?: number;
                            imageUsed?: number;
                            imageRemaining?: number;
                        };
                    } = {};
                    try {
                        payload = (await response.json()) as typeof payload;
                    } catch {
                        /* non-JSON body */
                    }
                    // The server stamps a `guest` quota on 402s so the UI
                    // banner can show exactly how many requests remain. Forward
                    // the image-quota fields too when present so the banner's
                    // "X/5 Img Gens" counter reflects the real pool instead of
                    // always rendering the default (audit #11).
                    if (payload.guest) {
                        const g = payload.guest;
                        const imageLimit = typeof g.imageLimit === 'number' ? g.imageLimit : undefined;
                        const imageUsed = typeof g.imageUsed === 'number' ? g.imageUsed : 0;
                        setGuestQuota({
                            requestsUsed: g.requestsUsed,
                            requestsLimit: g.requestsLimit,
                            // windowResetsAt is mandatory in the type; fall back
                            // to now+72h if the server omits it (matches
                            // GUEST_WINDOW_MS) instead of 0 which would render
                            // a 1970 timestamp.
                            windowResetsAt:
                                typeof g.windowResetsAt === 'number' && g.windowResetsAt > 0
                                    ? g.windowResetsAt
                                    : Date.now() + 72 * 60 * 60 * 1000,
                            ...(imageLimit !== undefined
                                ? {
                                      imageLimit,
                                      imageUsed,
                                      imageRemaining:
                                          typeof g.imageRemaining === 'number'
                                              ? g.imageRemaining
                                              : Math.max(0, imageLimit - imageUsed),
                                  }
                                : {}),
                        });
                    }
                    // Surface the server error code (e.g. insufficient_credits,
                    // insufficient_requests, rate_limited) so the UI can branch
                    // the message copy per code (audit P1-3).
                    const code402 =
                        typeof payload.error === 'string' && payload.error.length > 0
                            ? payload.error
                            : null;
                    setState('error');
                    setErrorCode(code402);
                    setErrorMessage(payload.message ?? payload.error ?? 'Payment required');
                    return;
                }
                let payloadText = `HTTP ${response.status}`;
                try {
                    const payload = (await response.json()) as { error?: string };
                    if (payload?.error) payloadText = payload.error;
                } catch {
                    /* non-JSON body */
                }
                setState('error');
                setErrorMessage(payloadText);
                return;
            }

            // Extract guest quota headers stamped by the route middleware
            // on successful responses so the quota banner updates immediately.
            const usedHeader = response.headers.get('X-Guest-Quota-Used');
            const limitHeader = response.headers.get('X-Guest-Quota-Limit');
            if (usedHeader !== null) {
                const parsedUsed = parseInt(usedHeader, 10);
                const parsedLimit = limitHeader ? parseInt(limitHeader, 10) : 10;
                if (!isNaN(parsedUsed)) {
                    setGuestQuota({
                        requestsUsed: parsedUsed,
                        requestsLimit: parsedLimit,
                        windowResetsAt: Date.now() + 72 * 60 * 60 * 1000,
                    });
                }
            }

            // 5) Stream the SSE body.
            const reader = response.body?.getReader();
            if (!reader) {
                setState('error');
                setErrorMessage('Stream reader unavailable');
                return;
            }
            const decoder = new TextDecoder();
            setState('streaming');

            try {
                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    if (controller.signal.aborted) break;
                    const chunk = decoder.decode(value, { stream: true });
                    bufferRef.current += chunk;
                    // SSE frames are terminated by a blank line. Split on
                    // double newline, keeping the remainder in the buffer.
                    const frames = bufferRef.current.split(/\r?\n\r?\n/);
                    bufferRef.current = frames.pop() ?? '';
                    for (const frame of frames) {
                        if (frame.trim().length === 0) continue;
                        handleSseFrame(frame, startTime, controller.signal);
                    }
                }
                // Drain any trailing partial frame.
                if (bufferRef.current.trim().length > 0) {
                    handleSseFrame(bufferRef.current, startTime, controller.signal);
                    bufferRef.current = '';
                }
            } catch (err: unknown) {
                if (controller.signal.aborted) {
                    setState('error');
                    setErrorCode('aborted');
                    setErrorMessage('aborted');
                    return;
                }
                const msg = err instanceof Error ? err.message : 'Stream read error';
                setState('error');
                setErrorCode('upstream_failed');
                setErrorMessage(msg);
                return;
            }

            // 6) Final state transition: `done` if not already in `error`.
            // On error (set inside handleSseFrame), roll back the user turn we
            // optimistically appended so the next retry doesn't dup the prompt.
            const rolledBack = streamErroredRef.current;
            if (rolledBack) {
                setMessages((prev) =>
                    prev.length > 0 && prev[prev.length - 1].role === 'user'
                        ? prev.slice(0, -1)
                        : prev,
                );
                streamErroredRef.current = false;
            }
            setState((prev) => (rolledBack || prev === 'error' ? 'error' : 'done'));
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [modelId],
    );

    // ── SSE frame parser ───────────────────────────────────────────────
    // `handleSseFrame` mutates hook state directly via the setters above.
    // It is defined inline because it captures only those setters — no
    // external dependencies, so it can live inside the component closure.
    function handleSseFrame(
        rawFrame: string,
        startTime: number,
        signal: AbortSignal,
    ): void {
        if (signal.aborted) return;

        // Parse `event:` + `data:` lines. Ignore comments (`:` prefix)
        // and blank lines.
        let eventName: string | null = null;
        const dataLines: string[] = [];
        for (const line of rawFrame.split(/\r?\n/)) {
            if (line.length === 0) continue;
            if (line.startsWith(':')) continue;
            if (line.startsWith('event:')) {
                eventName = line.substring('event:'.length).trim();
            } else if (line.startsWith('data:')) {
                dataLines.push(line.substring('data:'.length).trim());
            }
        }
        const dataStr = dataLines.join('\n');
        if (dataStr.length === 0) return;

        let parsed: PlaygroundStreamEvent | null = null;
        try {
            parsed = JSON.parse(dataStr) as PlaygroundStreamEvent;
        } catch {
            // Malformed frame — ignore silently. The route's encoder is
            // well-behaved; a parse error here is almost always a split
            // packet that the next iteration will repair.
            return;
        }
        if (!parsed || typeof parsed !== 'object') return;

        // TTFT: stamp exactly once, on the first content-bearing event
        // after `start`. The guard is a ref because this frame handler
        // lives inside a memoized closure whose state bindings freeze.
        if (parsed.type === 'token' || parsed.type === 'reasoning') {
            if (!ttftStampedRef.current) {
                ttftStampedRef.current = true;
                setTtftMs(Date.now() - startTime);
            }
        }

        switch (parsed.type) {
            case 'start': {
                if (!ttftStampedRef.current && typeof parsed.ttftMs === 'number') {
                    ttftStampedRef.current = true;
                    setTtftMs(parsed.ttftMs);
                }
                if (typeof parsed.costSoFar === 'number') setCostSoFar(parsed.costSoFar);
                break;
            }
            case 'token': {
                const text = parsed.text ?? '';
                if (text.length > 0) {
                    liveContentRef.current += text;
                    setContent((prev) => prev + text);
                    // Token count is read from the event's `tokensSoFar`
                    // (server-reported). We treat each chunk as the delta
                    // computed below for the rolling-speed window.
                    const before = tokensSoFarRef.current;
                    const after = typeof parsed.tokensSoFar === 'number'
                        ? parsed.tokensSoFar
                        : before;
                    const delta = Math.max(0, after - before);
                    tokensSoFarRef.current = after;
                    setTokensSoFar(after);
                    if (delta > 0) {
                        tokenWindowRef.current.push({ t: Date.now(), tokens: delta });
                    }
                }
                if (typeof parsed.costSoFar === 'number') setCostSoFar(parsed.costSoFar);
                break;
            }
            case 'reasoning': {
                const thought = parsed.thought ?? '';
                if (thought.length > 0) {
                    liveReasoningRef.current += thought;
                    setReasoning((prev) => prev + thought);
                }
                if (typeof parsed.tokensSoFar === 'number') {
                    setTokensSoFar(parsed.tokensSoFar);
                    tokensSoFarRef.current = parsed.tokensSoFar;
                }
                if (typeof parsed.costSoFar === 'number') setCostSoFar(parsed.costSoFar);
                break;
            }
            case 'usage': {
                if (typeof parsed.inputTokens === 'number') setInputTokens(parsed.inputTokens);
                if (typeof parsed.outputTokens === 'number') setOutputTokens(parsed.outputTokens);
                if (typeof parsed.tokensSoFar === 'number') {
                    setTokensSoFar(parsed.tokensSoFar);
                    tokensSoFarRef.current = parsed.tokensSoFar;
                }
                if (typeof parsed.costSoFar === 'number') setCostSoFar(parsed.costSoFar);
                break;
            }
            case 'done': {
                if (typeof parsed.inputTokens === 'number') setInputTokens(parsed.inputTokens);
                if (typeof parsed.outputTokens === 'number') setOutputTokens(parsed.outputTokens);
                if (typeof parsed.tokensSoFar === 'number') {
                    setTokensSoFar(parsed.tokensSoFar);
                    tokensSoFarRef.current = parsed.tokensSoFar;
                }
                if (typeof parsed.costSoFar === 'number') setCostSoFar(parsed.costSoFar);
                setState('done');
                // Flush the completed assistant turn into the history so the
                // next `send()` includes it as prior context. Skip empties —
                // an aborted / empty-response turn shouldn't pollute history.
                if (liveContentRef.current.length > 0 || liveReasoningRef.current.length > 0) {
                    const finalContent = liveContentRef.current;
                    const finalReasoning = liveReasoningRef.current;
                    const assistantTurn: PlaygroundMessageTurn = {
                        role: 'assistant',
                        content: finalContent,
                        reasoning: finalReasoning.length > 0
                            ? finalReasoning
                            : undefined,
                        ts: Date.now(),
                    };
                    setMessages((prev) => [...prev, assistantTurn]);
                    liveContentRef.current = '';
                    liveReasoningRef.current = '';
                    setContent('');
                    setReasoning('');

                    if (onCompleteRef.current) {
                        onCompleteRef.current(finalContent, finalReasoning);
                    }
                }
                break;
            }
            case 'error': {
                setState('error');
                streamErroredRef.current = true;
                // Surface the error code alongside the message so the UI can
                // branch the copy per code (model_fallback /
                // insufficient_credits / rate_limited / …) without parsing the
                // human-readable message (audit P1-3). Keep the existing
                // message fallback chain for unknown codes.
                const code = typeof parsed.code === 'string' && parsed.code.length > 0 ? parsed.code : null;
                setErrorCode(code);
                setErrorMessage(parsed.message ?? code ?? 'Stream error');
                break;
            }
            case 'tool_call': {
                // Real tool execution surfaced by the server (gateway
                // web-search loop evidence). Recorded so the column can
                // render a live tool-activity feed; the SSE reader advances
                // cleanly either way.
                const record: PlaygroundToolCallRecord = {
                    toolName: typeof parsed.toolName === 'string' ? parsed.toolName : 'unknown',
                    arguments: typeof parsed.arguments === 'string' ? parsed.arguments : '',
                    ts: Date.now(),
                };
                setToolCalls((prev) => [...prev, record]);
                break;
            }
            default: {
                // Unknown event type — ignore.
                break;
            }
        }

        // Mirror `costSoFar` onto the rolling speed window so the footer
        // tick reads a coherent value.
        if (typeof parsed.costSoFar === 'number') setCostSoFar(parsed.costSoFar);
        // Suppress unused-locals lint for `eventName` — it's preserved so
        // future code can switch on SSE event discriminator.
        void eventName;
    }

    // Cancel in-flight stream and cleanup reader when the column is unmounted
    useEffect(() => {
        return () => {
            if (abortControllerRef.current) {
                try {
                    abortControllerRef.current.abort();
                } catch {
                    /* noop */
                }
            }
        };
    }, []);

    return {
        state,
        content,
        reasoning,
        messages,
        ttftMs,
        tokensSoFar,
        inputTokens,
        outputTokens,
        costSoFar,
        tokensPerSec,
        startedAt,
        elapsedMs,
        errorMessage,
        errorCode,
        guestQuota,
        toolCalls,
        send,
        abort,
        reset,
        setMessages: setMessagesCallback,
    };
}