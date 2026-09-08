/**
 * Inter-column peer bus for MMD Swarm topology.
 *
 * Swarm lets one column inject a structured notice into a sibling column's
 * context mid-task, then re-activates that column so it can react. This
 * module owns the two invariants that stop a swarm from looping forever
 * or racing itself:
 *
 *   1. **Serialized ingest per target.** If two columns `[TELL]` the same
 *      target concurrently, the messages must be applied in a deterministic
 *      order (arrival, then timestamp, then id) so a re-activation sees a
 *      stable inbox. We don't need a real mutex — the engine drains the
 *      bus synchronously between rounds — but we DO need the ordering to
 *      be reproducible so replay + tests are stable.
 *   2. **Bounded hops + settle window.** Without a hop cap, A→B→A→… can
 *      cycle until credits run out. Without a settle window, the swarm
 *      can't tell a pause apart from a convergence.
 *
 * The bus is deliberately engine-agnostic: it doesn't know how to invoke
 * a model. It exposes `enqueue` (called by the parser when a column
 * emits `[TELL]`) and `drain` (called by the engine between rounds to
 * collect the next wave of re-activations). Keeping it free of React /
 * stream hooks makes it unit-checkable by the standalone `tsx` scripts
 * the rest of the repo uses for verification.
 */

import type { InterSessionMessage } from '../types';

/** Outcome of an `enqueue` attempt. */
export type EnqueueResult =
    | { ok: true; message: InterSessionMessage }
    | { ok: false; reason: 'unknown_target' | 'max_hops' | 'self_route' };

export interface SwarmBusOptions {
    /** Valid column ids — messages to anything else are dropped (`unknown_target`). */
    knownColumnIds: ReadonlySet<string>;
    /** Hard cap on `message.hop`. Defaults to 3. */
    maxHops?: number;
    /** Payload length cap in chars. Defends against a column flooding a peer. */
    maxPayloadChars?: number;
}

const DEFAULT_MAX_HOPS = 3;
const DEFAULT_MAX_PAYLOAD_CHARS = 2000;

/**
 * Append the peer message to the target's inbox, enforcing the routing
 * rules. Pure w.r.t. the options it was constructed with; the caller owns
 * the `inboxes` map.
 */
export function enqueuePeerMessage(
    inboxes: Map<string, InterSessionMessage[]>,
    message: InterSessionMessage,
    options: SwarmBusOptions,
): EnqueueResult {
    const maxHops = options.maxHops ?? DEFAULT_MAX_HOPS;
    const maxPayload = options.maxPayloadChars ?? DEFAULT_MAX_PAYLOAD_CHARS;

    if (message.fromColumnId === message.toColumnId) {
        // A model telling itself is a no-op (and a common hallucination).
        return { ok: false, reason: 'self_route' };
    }
    if (!options.knownColumnIds.has(message.toColumnId)) {
        return { ok: false, reason: 'unknown_target' };
    }
    if (message.hop > maxHops) {
        return { ok: false, reason: 'max_hops' };
    }

    const cappedPayload =
        message.payload.length > maxPayload
            ? message.payload.slice(0, maxPayload)
            : message.payload;

    const sanitized: InterSessionMessage = {
        ...message,
        payload: cappedPayload,
    };

    const bucket = inboxes.get(message.toColumnId);
    if (bucket) {
        bucket.push(sanitized);
    } else {
        inboxes.set(message.toColumnId, [sanitized]);
    }

    return { ok: true, message: sanitized };
}

/**
 * Ordering key for a stable drain: arrival bucket (hop), then timestamp,
 * then id. `hop` first so earlier-wave messages are processed before later
 * ones even if a slow column's timestamp lagged.
 */
function orderKey(m: InterSessionMessage): string {
    return `${m.hop}:${m.timestamp}:${m.id}`;
}

/**
 * Collect every target column that has at least one queued message into a
 * flat, deterministically-ordered list of (target, messages) pairs. The
 * engine uses this to decide which columns to re-activate next. Does NOT
 * clear the inboxes — the engine calls `clearInbox(target)` once it has
 * folded the messages into the re-activation prompt.
 */
export function drainWave(
    inboxes: Map<string, InterSessionMessage[]>,
): Array<{ toColumnId: string; messages: InterSessionMessage[] }> {
    const out: Array<{ toColumnId: string; messages: InterSessionMessage[] }> = [];
    for (const [toColumnId, messages] of inboxes) {
        if (messages.length === 0) continue;
        const sorted = [...messages].sort((a, b) => {
            const ka = orderKey(a);
            const kb = orderKey(b);
            if (ka < kb) return -1;
            if (ka > kb) return 1;
            return 0;
        });
        out.push({ toColumnId, messages: sorted });
    }
    // Stable column order so two drains over identical state yield identical
    // activation sequences (important for replay + the standalone checks).
    out.sort((a, b) => {
        if (a.toColumnId < b.toColumnId) return -1;
        if (a.toColumnId > b.toColumnId) return 1;
        return 0;
    });
    return out;
}

/** Empty a single target's inbox after its messages have been folded in. */
export function clearInbox(
    inboxes: Map<string, InterSessionMessage[]>,
    toColumnId: string,
): void {
    inboxes.set(toColumnId, []);
}

/** True when every inbox is empty — i.e. the swarm has quiesced. */
export function isQuiesced(inboxes: Map<string, InterSessionMessage[]>): boolean {
    for (const messages of inboxes.values()) {
        if (messages.length > 0) return false;
    }
    return true;
}

/**
 * Format a peer message for injection into a re-activation prompt. Kept
 * centralized so the engine and the Chairman attribution render the same
 * shape. We do NOT prefix with a role marker the model could spoof — the
 * engine owns the `<from_model>` framing.
 */
export function renderPeerBanner(message: InterSessionMessage, fromModelName: string): string {
    return `[PEER · ${fromModelName}] ${message.payload}`;
}

/**
 * Fold an ordered set of pending peer messages for one target into a single
 * injection block, prefixed by a header the model can't impersonate.
 */
export function renderInboxBlock(
    messages: InterSessionMessage[],
    resolveName: (modelId: string) => string,
): string {
    if (messages.length === 0) return '';
    const lines = messages.map((m) => `- ${renderPeerBanner(m, resolveName(m.fromModelId))}`);
    return `The following peer updates arrived from sibling columns while you were working:\n${lines.join('\n')}`;
}
