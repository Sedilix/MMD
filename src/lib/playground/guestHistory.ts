'use client';

/**
 * Playground guest chat-history persistence.
 *
 * Guests (no Firebase session) type into /playground and want their conversation
 * to survive signing up. The server stamps a signed `__pg_guest` fingerprint
 * cookie on first visit; we mirror that value into a non-HttpOnly
 * `__pg_guest_mirror` cookie the client can read and use as the storage key.
 *
 * Storage layer: window.localStorage. Pure client-side; no Firebase writes.
 * The rationale lives in the architect's plan — localStorage is the cleanest
 * fit for the "same-tab signup" flow because the auth redirect-and-back is a
 * single in-memory transition. Cross-device, no-no. The 5MB browser cap is
 * bounded by:
 *   - 50 turns per column across all columns (FIFO; on overflow drop the
 *     oldest HALF so a single 200k-char paste doesn't evict everything else);
 *   - 1MB soft-cap per key.
 *
 * Wire:
 *   loadGuestHistory(guestId) → history payload (or `null` when absent / stale)
 *   saveGuestHistory(guestId, payload) → internally debounced 800ms;
 *       immediate variants exist for the sign-up-CTA / pagehide paths.
 *   clearGuestHistory(guestId) → after a successful auth transition.
 *   getGuestIdFromCookie() → reads the mirror cookie value (or null).
 *
 * Hydration point: the playground page uses a once-per-uid transition
 * `useEffect` to call `loadGuestHistory` when `user?.uid` flips truthy,
 * copies the columns/messages into local state, and calls `clearGuestHistory`.
 */

import type { PlaygroundAttachment } from './types';

// ─── Constants ───────────────────────────────────────────────────────────────

/** localStorage namespace prefix. Keeps us out of other tools' keys. */
const STORAGE_PREFIX = 'cybrdeck.pg.guestHistory.';

/** Cookie name holding the non-HttpOnly mirror of the server's guest id. */
export const GUEST_COOKIE_MIRROR_NAME = '__pg_guest_mirror';

/** Current schema version. Bump when the shape changes incompatibly. */
export const SCHEMA_VERSION = 1;

/** Maximum message turns across all columns. On overflow drop oldest half. */
const MAX_TURNS_TOTAL = 50;

/** Soft-cap on serialized payload size (bytes). Truncates oldest half on overflow. */
const MAX_KEY_BYTES = 1_048_576; // 1 MB

/** Debounce window for `saveGuestHistory` — collapses burst typing into one write. */
const SAVE_DEBOUNCE_MS = 800;

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Single chat turn as persisted on the client. Mirrors the wire shape used by
 * `usePlaygroundStream` so the column can be reconstructed without translation.
 * Attachments are stored as plain serialisable descriptors so the payload
 * stays under the localStorage budget.
 */
export interface GuestTurn {
    role: 'user' | 'assistant' | 'system';
    content: string;
    /** Unix-ms timestamp the turn was stamped. */
    ts: number;
    /** Optional multimodal descriptors (read-only; never modified client-side). */
    attachments?: PlaygroundAttachment[];
}

export interface GuestColumnPayload {
    /** Column id used by the workbench. Stable across the same guest session. */
    id: string;
    modelId: string;
    messages: GuestTurn[];
    /**
     * Per-column parameter overrides. Mirrors `ParamValues` shape from
     * `ParamsSidebar.tsx`. We accept `unknown` here because the column
     * preserves the exact shape it held at save time — the page-level state
     * is the source of truth and we don't want to drift the snapshot.
     */
    paramValues?: Record<string, unknown>;
}

export interface GuestHistoryPayload {
    version: number;
    savedAt: number;
    columns: GuestColumnPayload[];
}

// ─── Cookie read ─────────────────────────────────────────────────────────────

/**
 * Read the non-HttpOnly mirror cookie and return its decoded value, or `null`
 * when the cookie is absent / unreadable. Uses the browser's `document.cookie`
 * which is only available client-side — never call from a server module.
 */
export function getGuestIdFromCookie(): string | null {
    if (typeof document === 'undefined') return null;
    const raw = document.cookie
        .split(';')
        .map((c) => c.trim())
        .find((c) => c.startsWith(`${GUEST_COOKIE_MIRROR_NAME}=`));
    if (!raw) return null;
    const encoded = raw.substring(GUEST_COOKIE_MIRROR_NAME.length + 1);
    try {
        const decoded = decodeURIComponent(encoded);
        if (decoded.length < 8 || decoded.length > 128) return null;
        // Mirror the server-side isPlausibleGuestId check from guest-usage.ts.
        if (!/^[A-Za-z0-9_.\-]+$/.test(decoded)) return null;
        return decoded;
    } catch {
        return null;
    }
}

// ─── Storage key / read / write ──────────────────────────────────────────────

function keyFor(guestId: string): string {
    return `${STORAGE_PREFIX}${guestId}`;
}

/**
 * Build a fresh empty payload — used on first save when there's no prior
 * history. Keeps the schema strict even if the caller writes a payload with
 * no columns yet.
 */
export function freshGuestHistory(): GuestHistoryPayload {
    return { version: SCHEMA_VERSION, savedAt: Date.now(), columns: [] };
}

/**
 * Load the guest's persisted history. Returns `null` when:
 *   - the key is absent;
 *   - the cookie / id is missing or malformed;
 *   - the persisted payload fails to parse or has an unrecognised schema
 *     version (so a stale entry from a previous schema never surfaces).
 *
 * On load we DO NOT enforce the cap — that's the writer's job. Loading just
 * reads what was saved, so a payload saved at exactly the cap is still valid.
 */
export function loadGuestHistory(guestId: string): GuestHistoryPayload | null {
    if (typeof window === 'undefined') return null;
    if (!guestId) return null;
    let raw: string | null = null;
    try {
        raw = window.localStorage.getItem(keyFor(guestId));
    } catch {
        // localStorage can throw in private-mode Safari when storage is full.
        return null;
    }
    if (!raw) return null;
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!parsed || typeof parsed !== 'object') return null;
    const obj = parsed as Record<string, unknown>;
    if (obj.version !== SCHEMA_VERSION) return null;
    if (!Array.isArray(obj.columns)) return null;
    // Defensive: skip any column that doesn't have the minimum shape.
    const columns: GuestColumnPayload[] = [];
    for (const col of obj.columns) {
        if (!col || typeof col !== 'object') continue;
        const c = col as Record<string, unknown>;
        if (typeof c.id !== 'string' || typeof c.modelId !== 'string') continue;
        if (!Array.isArray(c.messages)) continue;
        const messages: GuestTurn[] = [];
        for (const msg of c.messages) {
            if (!msg || typeof msg !== 'object') continue;
            const m = msg as Record<string, unknown>;
            const role = m.role;
            if (role !== 'user' && role !== 'assistant' && role !== 'system') continue;
            if (typeof m.content !== 'string') continue;
            const turn: GuestTurn = {
                role,
                content: m.content,
                ts: typeof m.ts === 'number' ? m.ts : Date.now(),
            };
            if (Array.isArray(m.attachments)) {
                turn.attachments = m.attachments as PlaygroundAttachment[];
            }
            messages.push(turn);
        }
        const payload: GuestColumnPayload = {
            id: c.id,
            modelId: c.modelId,
            messages,
        };
        if (c.paramValues && typeof c.paramValues === 'object') {
            payload.paramValues = c.paramValues as Record<string, unknown>;
        }
        columns.push(payload);
    }
    return {
        version: SCHEMA_VERSION,
        savedAt: typeof obj.savedAt === 'number' ? obj.savedAt : Date.now(),
        columns,
    };
}

/**
 * Apply turn-count and key-size caps to a payload before persistence.
 * Pure function — same input always produces same output — so the truncation
 * behaviour is testable in isolation later.
 */
function capPayload(payload: GuestHistoryPayload): GuestHistoryPayload {
    const totalTurns = payload.columns.reduce((acc, c) => acc + c.messages.length, 0);
    let columns = payload.columns;
    if (totalTurns > MAX_TURNS_TOTAL) {
        // Drop the oldest HALF of messages across columns. Halving instead of
        // dropping one-by-one keeps the cap bound under a single 200k-char paste.
        const allTurns: Array<{
            colIdx: number;
            msgIdx: number;
            turn: GuestTurn;
        }> = [];
        columns.forEach((col, colIdx) => {
            col.messages.forEach((turn, msgIdx) => {
                allTurns.push({ colIdx, msgIdx, turn });
            });
        });
        allTurns.sort((a, b) => a.turn.ts - b.turn.ts);
        const dropCount = Math.ceil(allTurns.length / 2);
        const dropSet = new Set(
            allTurns.slice(0, dropCount).map((t) => `${t.colIdx}:${t.msgIdx}`),
        );
        columns = columns.map((col, colIdx) => ({
            ...col,
            messages: col.messages.filter(
                (_, msgIdx) => !dropSet.has(`${colIdx}:${msgIdx}`),
            ),
        }));
    }
    // Soft-cap on serialized size. Drop columns from the end if we still
    // exceed the byte budget after message trimming.
    let serialized: string;
    try {
        serialized = JSON.stringify({ ...payload, columns });
    } catch {
        return { ...payload, columns: [] };
    }
    while (serialized.length > MAX_KEY_BYTES && columns.length > 1) {
        columns = columns.slice(0, -1);
        serialized = JSON.stringify({ ...payload, columns });
    }
    return { ...payload, columns };
}

// Per-guest debounce timer map so concurrent calls coalesce on the same window.
const pendingTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
// Per-guest stashed payload for the pending debounced write. Kept in parallel
// with `pendingTimers` so `flushGuestHistory` (called from `pagehide` /
// `visibilitychange`) can fire the write synchronously without having to reach
// into the timer closure. Cleared when the timer fires or is cancelled.
const pendingPayloads: Map<string, GuestHistoryPayload> = new Map();

/**
 * Debounced write to localStorage. Collapses burst edits (a streaming token
 * batch, for example, or a long user paste) into a single write per 800ms.
 *
 * Returns the timer id so callers can `clearTimeout` on a forced flush.
 */
export function saveGuestHistory(
    guestId: string,
    payload: GuestHistoryPayload,
    opts: { immediate?: boolean } = {},
): void {
    if (typeof window === 'undefined') return;
    if (!guestId) return;

    const capped = capPayload({ ...payload, savedAt: Date.now(), version: SCHEMA_VERSION });
    const writeNow = (): void => {
        try {
            window.localStorage.setItem(keyFor(guestId), JSON.stringify(capped));
        } catch {
            // Quota exceeded or private-mode storage disabled. Best-effort — the
            // guest keeps their current page state in memory but the next reload
            // may not rehydrate. We swallow because this is a soft feature.
        }
    };

    if (opts.immediate) {
        const existing = pendingTimers.get(guestId);
        if (existing) {
            clearTimeout(existing);
            pendingTimers.delete(guestId);
        }
        pendingPayloads.delete(guestId);
        writeNow();
        return;
    }

    const existing = pendingTimers.get(guestId);
    if (existing) clearTimeout(existing);
    // Stash the capped payload so `flushGuestHistory` can write it synchronously
    // if the tab closes before the debounce window elapses.
    pendingPayloads.set(guestId, capped);
    const t = setTimeout(() => {
        pendingTimers.delete(guestId);
        pendingPayloads.delete(guestId);
        writeNow();
    }, SAVE_DEBOUNCE_MS);
    pendingTimers.set(guestId, t);
}

/**
 * Flush any pending debounced write AND delete the key. Used on the auth
 * transition so we don't leak localStorage to the signed-in account.
 */
export function clearGuestHistory(guestId: string): void {
    if (typeof window === 'undefined') return;
    if (!guestId) return;
    const t = pendingTimers.get(guestId);
    if (t) {
        clearTimeout(t);
        pendingTimers.delete(guestId);
    }
    pendingPayloads.delete(guestId);
    try {
        window.localStorage.removeItem(keyFor(guestId));
    } catch {
        /* swallow */
    }
}

/**
 * Best-effort flush of any pending debounced write for `guestId` without
 * deleting the key. Useful on `pagehide` / `visibilitychange` so the user
 * doesn't lose the most recent turn when closing the tab.
 *
 * The stashed payload (mirrored from `saveGuestHistory`'s debounced closure)
 * is written synchronously here. If no write is pending, this is a no-op —
 * the prior `if (cached) return` short-circuit was backwards and meant a
 * pending write was silently dropped on tab close (audit #1).
 */
export function flushGuestHistory(guestId: string): void {
    if (typeof window === 'undefined') return;
    if (!guestId) return;
    const t = pendingTimers.get(guestId);
    const payload = pendingPayloads.get(guestId);
    if (!t || !payload) return;
    clearTimeout(t);
    pendingTimers.delete(guestId);
    pendingPayloads.delete(guestId);
    try {
        window.localStorage.setItem(keyFor(guestId), JSON.stringify(payload));
    } catch {
        /* Quota exceeded or storage disabled — best-effort, swallow. */
    }
}

/**
 * The cap is exposed so the playground page can render "Showing the last 50
 * turns" copy without re-implementing the policy.
 */
export const GUEST_HISTORY_MAX_TURNS = MAX_TURNS_TOTAL;
