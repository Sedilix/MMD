/**
 * Playground core type definitions.
 *
 * These types are intentionally framework-agnostic — they describe the shape
 * of a request flowing into the streaming route, the registry of models, and
 * the discriminated event union emitted on the wire. Routes, hooks, and UI
 * components import from this module so the contract stays centralized.
 *
 * The discriminated union on `PlaygroundStreamEvent` is the contract that the
 * per-model stream route (`app/api/playground/stream/[modelId]/route.ts`)
 * serializes to the client as `text/event-stream` lines; see the route
 * implementation in a later phase.
 */

// ─── Access / brand enums ──────────────────────────────────────────────────

/**
 * Access level for a model — drives the guest vs registered-user split in
 * the playground picker and the guest-mode gate.
 *  - `guest`      → available to guests (within the 10-req/24h pool) and all
 *                    authenticated users. These are basic, non-frontier models.
 *  - `registered` → requires authentication. Authenticated users of any tier
 *                    (free / pro / developer) can use these — the per-tier
 *                    difference is credit allowance, not model reach.
 *
 * Defaults to `'registered'` when a registry entry forgets to tag itself
 * (see `resolveModelAccess`); a mistagged entry therefore CANNOT
 * accidentally become guest-accessible.
 */
export type ModelAccess = 'guest' | 'registered';

/**
 * Brand grouping for models — used by the picker dropdown to organise
 * models into brand optgroups (Google, OpenAI, Anthropic, etc.) instead
 * of Free/Paid tiers.
 */
export type ModelBrand =
    | 'Local'
    | 'Google'
    | 'OpenAI'
    | 'Anthropic'
    | 'Meta'
    | 'Mistral'
    | 'Alibaba'
    | 'Z.ai'
    | 'Moonshot'
    | 'DeepSeek'
    | 'xAI'
    | 'MiniMax'
    | 'Amazon';

/**
 * Resolve the access level for a model entry. Defaults to `'registered'`
 * when the field is missing or unrecognised so a stale registry entry
 * cannot silently become guest-accessible. This is the only path
 * entitlements code should use; checking `entry.access === 'guest'`
 * directly is discouraged because it misses the default behaviour.
 */
export function resolveModelAccess(
    entry: Pick<ModelRegistryEntry, 'access'>,
): ModelAccess {
    return entry.access === 'guest' ? 'guest' : 'registered';
}

/**
 * Provider backing a model. The streaming route switches on this to choose
 * the correct SDK / HTTP client. `local` covers our own Ollama deployment.
 */
export type ModelProvider =
    | 'google'
    | 'alibaba'
    | 'openai'
    | 'anthropic'
    | 'meta'
    | 'mistral'
    | 'zhipu'
    | 'amazon'
    | 'deepseek'
    | 'zai'
    | 'togetherai'
    | 'moonshot'
    | 'minimax'
    | 'azure'
    | 'aws-bedrock'
    | 'novita'
    | 'nebius'
    | 'canopywave'
    | 'cloudflare'
    | 'xai'
    | 'zyphra'
    | 'embercloud'
    | 'groq'
    | 'cybrdeck'
    | 'local';

/**
 * Per-tier model classification. Retained for visual badges
 * (the `premium` / `standard` / `local` chip in the picker) and to keep
 * the cost-multiplier heuristic readable, but it is NO LONGER used for
 * entitlement gating — that moved to `ModelAccess` and credit
 * allowance is the only thing the user tier controls.
 *  - `local`     → free-tier OK; runs via Ollama with zero multipliers.
 *  - `standard`  → mid-cost standard cluster.
 *  - `premium`   → high-cost frontier cluster.
 */
export type ModelTier = 'standard' | 'premium' | 'local';

/**
 * Subscription tier cached in the user's Firestore doc. Mirrors the spec's
 * Stripe webhook mapping (`Free → Pro → Developer`).
 */
export type UserTier = 'free' | 'pro' | 'developer';

// ─── Registry entry ─────────────────────────────────────────────────────────

/**
 * One row of the static model registry (loaded from `data/playground/models.json`).
 *
 * `inputMultiplier` / `outputMultiplier` are the weighted burn coefficients
 * used by `credit-engine.computeCreditCost`. Premium models must have
 * multipliers ≥ 2× the standard baseline; `local` models use 0.
 */
export interface ModelRegistryEntry {
    id: string;
    displayName: string;
    provider: ModelProvider;
    /**
     * Provider-specific model identifier used by the upstream SDK or REST
     * endpoint. May include a version suffix (e.g. `claude-sonnet-5-20260630`).
     */
    apiVersionId: string;
    /** Maximum context window in tokens. */
    maxTokens: number;
    /**
     * Visual chip — kept so the picker can still render the
     * `premium / standard / local` badge. NOT used for entitlement
     * gating; see `access` for that.
     */
    tier: ModelTier;
    /**
     * Access level. `'guest'` makes a model reachable to guests
     * (within the 10-req/24h pool) and all authed users. `'registered'`
     * requires authentication. The entitlements resolver treats a
     * missing / unrecognised value as `'registered'`, so omitting this
     * field is the safe default.
     */
    access?: ModelAccess;
    /**
     * Brand grouping for the picker dropdown. Models are organised into
     * brand optgroups (Google, OpenAI, Anthropic, etc.) instead of by
     * Free/Paid tiers.
     */
    brand: ModelBrand;
    description: string;
    /** Credit burn per 1,000 input tokens. Local models: 0. */
    inputMultiplier: number;
    /**
     * Optional credit burn per 1,000 CACHED input tokens. Some providers
     * (e.g. Anthropic prompt caching, OpenAI automatic caching) discount
     * repeated prompt prefixes. When omitted, falls back to
     * `inputMultiplier` so the credit engine never silently zeroes out
     * cached-token accounting.
     */
    cachedInputMultiplier?: number;
    /** Credit burn per 1,000 output tokens. Local models: 0. */
    outputMultiplier: number;
    /**
     * Whether this model exposes OpenAI's `reasoning_effort` ladder. Only
     * GPT-5.x currently sets this to `true`; Anthropic's `thinking` ladder
     * is gated by `apiVersionId` on the provider mapper, not by this flag.
     */
    supportsReasoningEffort?: boolean;
    /**
     * Multimodal input matrix. Drives the compatibility badges in the
     * attachment dock and the `image/audio/video/text` forwarding rules in
     * the per-provider mappers. Local (Ollama) models only support `text`.
     */
    supportsAttachments?: ModelAttachmentSupport;
    /**
     * Per-key provisioning manifest. Indicates whether the model's slug
     * is actually served by the resolved key on each tier branch.
     *
     *   - `pro`        → check against the PRO gateway key
     *   - `dev`        → check against the DEV gateway key
     *   - `free`       → explicit gate for free-tier authed callers. When
     *                    set, this value is consulted directly. When
     *                    omitted,
     *                    `canAuthenticatedUseModel` falls back to
     *                    `pro && dev` so a model only needs to work on one
     *                    branch to be reachable.
     *
     * `local` models (Ollama) never hit the gateway and should set all
     * three flags to `false` (the entitlements gate treats them as a
     * special case — see `entitlements.ts`).
     *
     * Backward compatibility: a missing `provisioning` field means "no
     * data" → treated as fully provisioned. Operators populate this after
     * running the smoke probe in `scripts/playground-smoke.ts` with their
     * PRO and DEV keys.
     */
    provisioning?: {
        pro?: boolean;
        dev?: boolean;
        free?: boolean;
    };
}

export interface ModelAttachmentSupport {
    image: boolean;
    audio: boolean;
    video: boolean;
    text: boolean;
}

// ─── Subscription / user doc ────────────────────────────────────────────────

/**
 * User subscription record cached in Firestore at `users/{uid}`.
 *
 * Written by the Stripe webhook (a later phase) and read by the credit
 * engine here. `creditsLimit` and `creditsUsed` are updated atomically via
 * `FieldValue.increment()`; `creditsResetAt` lets the UI show a countdown.
 */
export interface UserSubscription {
    userId: string;
    tier: UserTier;
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    /** Total credits allowed in the current billing cycle. */
    creditsLimit: number;
    /** Credits spent in the current billing cycle. */
    creditsUsed: number;
    /** Unix-ms when the cycle resets and `creditsUsed` is zeroed. */
    creditsResetAt: number;
    /** Unix-ms of the last write to this doc. */
    updatedAt: number;
}

// ─── Request shape ──────────────────────────────────────────────────────────

/**
 * Single chat turn in a column's conversation history. Mirrors the OpenAI
 * chat-completions message shape so we can pass the array straight through
 * to the gateway without translation. Assistant turns also carry the
 * `reasoning` accordion content for models that emit thinking deltas.
 */
export interface PlaygroundChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
    /**
     * Thinking / reasoning content emitted by reasoning-capable models.
     * Only populated on `assistant` turns and only for the models that
     * expose it (GLM 5.2, Kimi, DeepSeek R1, etc.). Not sent to the
     * provider — kept purely for client-side rendering of the thinking
     * accordion on prior turns.
     */
    reasoning?: string;
}

/**
 * Single model run request. The client constructs one of these per active
 * column in the workbench; the route at
 * `app/api/playground/stream/[modelId]/route.ts` consumes this on the server.
 *
 * `modelId` and the dynamic segment of the URL are validated against the
 * registry for defence-in-depth — the URL param is the truth, but the body
 * lets the client be explicit.
 */
export interface PlaygroundStreamRequest {
    modelId: string;
    /**
     * Newest user message. Kept for backwards compatibility — when
     * `history` is omitted, the server treats this as a single-turn
     * exchange. When `history` is provided, `prompt` is appended as the
     * final user turn before sending.
     */
    prompt: string;
    /**
     * Prior conversation turns (user + assistant) the model should see.
     * When present, the server sends `systemPrompt` (if any) → `history`
     * → `{ role: 'user', content: prompt }` to the model. Empty / omitted
     * preserves the legacy single-turn behaviour.
     */
    history?: PlaygroundChatMessage[];
    systemPrompt?: string;
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    /**
     * Reasoning effort knob, primarily for OpenAI GPT-5.x. Models without
     * native reasoning effort support ignore this and fall back to defaults.
     */
    reasoningEffort?: 'none' | 'light' | 'standard' | 'xhigh';
    /** Optional multimodal attachments staged in the workbench dock. */
    attachments?: PlaygroundAttachment[];
    /**
     * Ids of skills the user enabled in the workbench skills dropdown. The
     * server resolves each against `data/playground/skills.json` and appends
     * the skill prompt text to the system prompt (audit P2-7). Empty /
     * omitted → no skill injection.
     */
    enabledSkills?: string[];
    /**
     * MCP tool-server URLs registered on the column (audit Step 3). The
     * server connects each (http/https only, vetted by
     * `sanitizeMcpServerUrl`), advertises their tools to the model, and
     * executes model-issued calls server-side. Ignored for guests.
     */
    mcpServers?: string[];
    /**
     * Gateway flags (audit Step 4). The provider mapper already forwards
     * each of these when set; the route validates and threads them through.
     */
    routingStrategy?: 'cost-optimized' | 'latency-optimized' | 'quality-optimized' | 'balanced';
    guardrails?: {
        piiRedaction?: boolean;
        injectionDefense?: boolean;
        moderationLevel?: 'off' | 'low' | 'standard' | 'strict';
    };
    /** Backup models the gateway tries when the primary 429s / 5xxs. */
    fallbackModels?: string[];
    responseHealing?: { autoFixSyntax?: boolean; enforceSchema?: boolean };
}

export interface PlaygroundAttachment {
    /** MIME type, used by the provider SDK to choose the right inline / file part. */
    mimeType: string;
    /** Stable client-side identifier for list-keying. */
    name: string;
    /**
     * Base64 / data-URL form for short payloads (images, short audio clips).
     * Long documents should be uploaded to Storage first and referenced by
     * `storageUrl`; both fields are optional but exactly one is expected at
     * attachment time.
     */
    data?: string;
    storageUrl?: string;
}

// ─── Stream event union ─────────────────────────────────────────────────────

/**
 * Per-model server-sent events emitted by the streaming route. The client
 * parses each line and narrows on `type`; carrying `modelId` and the running
 * `tokensSoFar` / `costSoFar` lets the UI update TTFT, speed, and the cost
 * counter without an extra round-trip.
 */
export type PlaygroundStreamEvent =
    | PlaygroundStreamStartEvent
    | PlaygroundStreamTokenEvent
    | PlaygroundStreamReasoningEvent
    | PlaygroundStreamToolCallEvent
    | PlaygroundStreamUsageEvent
    | PlaygroundStreamErrorEvent
    | PlaygroundStreamDoneEvent;

interface PlaygroundStreamEventBase {
    /** Echo of the model that produced this event, for client-side correlation. */
    modelId: string;
    /** Time-to-first-token in ms, set on `start` and frozen on first `token`. */
    ttftMs: number | null;
    /** Total tokens generated so far (excludes reasoning, which is reported separately). */
    tokensSoFar: number;
    /** Running credit cost in playground credits. */
    costSoFar: number;
}

export interface PlaygroundStreamStartEvent extends PlaygroundStreamEventBase {
    type: 'start';
    /** Stable run id; useful for log correlation and dedupe on retry. */
    runId: string;
}

export interface PlaygroundStreamTokenEvent extends PlaygroundStreamEventBase {
    type: 'token';
    /** Delta text chunk for the visible stream. */
    text: string;
}

export interface PlaygroundStreamReasoningEvent extends PlaygroundStreamEventBase {
    type: 'reasoning';
    /**
     * Thinking / chain-of-thought delta. Models like GLM-5.2 and Kimi K2.6
     * emit these; the client renders them inside a collapsible accordion
     * above the main stream.
     */
    thought: string;
}

export interface PlaygroundStreamToolCallEvent extends PlaygroundStreamEventBase {
    type: 'tool_call';
    /** Identifier of the tool being invoked. */
    toolName: string;
    /** JSON-encoded arguments. Use `unknown` at the call-site and validate per tool. */
    arguments: string;
    /**
     * Gateway-billed web-search spend for this request, when this event
     * carries that evidence (see the `cost_usd_web_search` usage-evidence
     * branch in openai-compatible.ts). A real, typed field so the credit
     * engine can read it directly instead of re-parsing `arguments` —
     * billing shouldn't depend on the same fragile JSON envelope the UI
     * evidence strip uses for display only.
     */
    webSearchCostUsd?: number;
}

export interface PlaygroundStreamUsageEvent extends PlaygroundStreamEventBase {
    type: 'usage';
    /** Provider-reported input tokens for the completed request. */
    inputTokens: number;
    /** Provider-reported output tokens for the completed request. */
    outputTokens: number;
    /**
     * Prompt tokens served from the provider's prompt cache (OpenAI
     * `prompt_tokens_details.cached_tokens` / Anthropic prompt caching).
     * These are billed at the cached multiplier rather than full input
     * rate; defaults to 0 when the provider doesn't report them.
     */
    cachedInputTokens?: number;
    /** Credits deducted by this run (rounded to the nearest integer at write-time). */
    creditsCharged: number;
}

export interface PlaygroundStreamErrorEvent extends PlaygroundStreamEventBase {
    type: 'error';
    /** Short error code for client logic (`rate_limited`, `upstream_500`, `insufficient_credits`, …). */
    code: string;
    /** Human-readable error message. */
    message: string;
    /** True if the error is non-retryable (e.g. invalid request, insufficient credits). */
    fatal: boolean;
}

export interface PlaygroundStreamDoneEvent extends PlaygroundStreamEventBase {
    type: 'done';
    /** Final input token count for this run (provider-reported or estimated). */
    inputTokens: number;
    /** Final output token count for this run. */
    outputTokens: number;
    /** Total credits consumed by this run. */
    creditsConsumed: number;
}

// ─── Multi-Modal Discussion (MMD) Types ─────────────────────────────────────

/**
 * Peer-to-peer communication topology layered ON TOP of `executionMode`.
 *
 *   - `isolated` → columns never talk mid-task (the original MMD behavior).
 *   - `swarm`    → a column may emit `[TELL <colId>] <payload>` directives in
 *                  its final output; the engine re-activates the target column
 *                  with the injected peer message before final Chairman
 *                  synthesis.
 *
 * `topology` is orthogonal to `executionMode`: the swarm peer bus composes
 * with both `'parallel'` and `'relay'` temporal ordering. Keeping it a
 * separate axis avoids a 3-way branch in `runRound`. Defaults to `'isolated'`
 * when absent so pre-existing configs stay equivalent.
 */
export type MMDTopology = 'isolated' | 'swarm';

export interface MMDConfig {
    enabled: boolean;
    discussionType: 'single' | 'multi';
    executionMode: 'parallel' | 'relay';
    rounds: number; // 1-10
    chairmanModelId: string;
    includeOneObserver: boolean;
    mode: 'default' | 'selective';
    selectedColumnIds: string[];
    timeoutMs: number;
    retries: number;
    weighting: Record<string, number>; // modelId -> weight (0-1)
    creditLimit: number; // credit consumption limit in total
    /**
     * Peer-to-peer topology layered on top of `executionMode`. Omitted in
     * legacy configs → treated as `'isolated'` (the original MMD behavior).
     * See `MMDTopology`.
     */
    topology?: MMDTopology;
    /**
     * Swarm: maximum peer-message hops before the cycle force-settles to the
     * Chairman. Prevents A→B→A→… ping-pong. Defaults to `3` when absent
     * (see `swarm/bus.ts`).
     */
    swarmMaxHops?: number;
    /**
     * Swarm: quiesce window in ms — if no new peer messages arrive for this
     * long, the swarm is considered converged and the Chairman runs. Acts as
     * a soft backstop; the per-column `timeoutMs` remains the hard ceiling.
     * Defaults to `4000`.
     */
    swarmSettleMs?: number;
}

/**
 * One directed peer-to-peer payload between two MMD columns during a swarm.
 *
 * The engine produces these by parsing a model's final (`done`) output for
 * `[TELL <colId>] <payload>` directives (see `swarm/parser.ts`) and routes
 * them through `swarm/bus.ts`, which serializes ingest per target and
 * enforces the hop / settle terminators. They are surfaced to the Chairman
 * in the synthesis prompt so consensus can attribute each handoff.
 */
export interface InterSessionMessage {
    id: string;
    fromColumnId: string;
    fromModelId: string;
    toColumnId: string;
    payload: string;
    timestamp: number;
    /** Monotonic hop count — rejected when it exceeds `swarmMaxHops`. */
    hop: number;
}

/**
 * One AI-generated feature suggestion surfaced in the Build Mode preview
 * pane. Produced by `build-suggestions.ts`; applying one injects a
 * refinement prompt carrying the suggestion + current source into chat.
 */
export interface BuildSuggestion {
    title: string;
    detail: string;
}

