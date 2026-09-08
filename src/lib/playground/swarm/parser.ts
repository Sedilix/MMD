/**
 * Constrained `[TELL]` directive parser for MMD Swarm.
 *
 * Design choices (see implementation_plan.md review notes):
 *
 *   - **Parse on `done` text only, never mid-stream.** A streaming token
 *     boundary can split `[TELL col-2` from `] payload`, and stitching that
 *     back together across chunks is fragile. We wait for the model's final
 *     output and parse the whole thing once. This is the reason the engine
 *     treats each handoff as a *round boundary* rather than interrupting an
 *     in-flight stream.
 *
 *   - **One canonical form.** `^\\[TELL\\s+(.+?)\\]\\s*(.+)$` on its own
 *     line (case-insensitive on the verb). We deliberately do NOT try to
 *     catch `[tell]`, `TELL:`, `Tell column 2`, `@col2`, etc. Supporting
 *     every phrasing is how parsers drift; a single rigid form is easy to
 *     document, easy to test, and easy for a model to satisfy via the
 *     swarm system prompt.
 *
 *   - **Validate, don't trust.** The target must be a known column id or
 *     a 1-based column index. Payloads over the cap are truncated (not
 *     dropped) so a chatty column still contributes its point.
 *
 * The long-term answer is function-calling (a `send_peer_message` tool),
 * which supersedes this parser entirely. But the tool pipeline isn't wired
 * through the streaming route yet, so this constrained parser is the MVP
 * path. It is marked as the temporary layer so nobody mistakes it for the
 * final design.
 */

import type { InterSessionMessage } from '../types';

export interface ParsedDirective {
    toColumnId: string;
    payload: string;
}

export interface ParseTellOptions {
    /**
     * Resolve a column index (`1`, `2`, …) or a raw column id to a concrete
     * id. Returns `null` if the target doesn't resolve to a known column.
     * Indices are 1-based and refer to the participating columns in order.
     */
    resolveTarget: (token: string) => string | null;
    /** Payload length cap in chars (mirrors the bus default). */
    maxPayloadChars?: number;
    /**
     * When true, directives whose `payload` itself contains a `[TELL …]`
     * line are stripped of that inner line so a model can't cascade a
     * forwarded message as its own. Default true.
     */
    stripNested?: boolean;
}

const MAX_PAYLOAD_CHARS = 2000;

/**
 * One directive per line, of the form:
 *
 *     [TELL col-2] schema normalized; please adopt it
 *     [tell 3] disagree — see reasoning below
 *
 * The verb is case-insensitive; the target token is non-greedy up to `]`;
 * the payload is the rest of the line. Leading/trailing whitespace trimmed.
 * Blank payloads are dropped (a `[TELL]` with nothing to say is noise).
 */
const TELL_LINE = /^\[\s*TELL\s+([^\]]+?)\s*\]\s*(.+)$/i;
/**
 * Non-anchored form of `TELL_LINE` for scrubbing forwarded directives out
 * of a payload mid-string. The anchored `TELL_LINE` only matches whole
 * lines (the directive producer); this one matches a `[TELL …]` fragment
 * embedded inside a payload so a relayed banner can't be re-parsed as a
 * fresh hop.
 */
const TELL_FRAGMENT = /\[\s*TELL\s+[^\]]+?\]\s*/gi;

/**
 * Extract every `[TELL <target>] <payload>` directive from a finished
 * model output. Returns them in document order. Unknown / unresolvable
 * targets are silently dropped here — the engine logs the count — so a
 * model that names a non-existent column doesn't poison the wave.
 */
export function parseTellDirectives(
    text: string,
    options: ParseTellOptions,
): ParsedDirective[] {
    if (typeof text !== 'string' || text.length === 0) return [];
    const maxPayload = options.maxPayloadChars ?? MAX_PAYLOAD_CHARS;
    const stripNested = options.stripNested ?? true;

    const found: ParsedDirective[] = [];
    const lines = text.split(/\r?\n/);
    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (line.length === 0) continue;
        const match = TELL_LINE.exec(line);
        if (!match) continue;
        const targetToken = match[1].trim();
        const toColumnId = options.resolveTarget(targetToken);
        if (!toColumnId) continue;

        let payload = match[2].trim();
        if (payload.length === 0) continue;

        // Defang forwarded directives so a model relaying a peer banner
        // can't re-trigger a hop by quoting it verbatim. Uses the
        // non-anchored fragment form because the payload starts with the
        // sender's prose, not with `[TELL`.
        if (stripNested) {
            payload = payload.replace(TELL_FRAGMENT, '').trim();
            if (payload.length === 0) continue;
        }

        if (payload.length > maxPayload) {
            payload = payload.slice(0, maxPayload);
        }
        found.push({ toColumnId, payload });
    }
    return found;
}

/**
 * Remove directive lines from the visible output so the user doesn't see
 * raw `[TELL …]` scaffolding mixed into the answer. The directives still
 * flow to the bus via `parseTellDirectives`; this is purely cosmetic.
 */
export function stripTellDirectives(text: string): string {
    if (typeof text !== 'string' || text.length === 0) return text;
    return text
        .split(/\r?\n/)
        .filter((rawLine) => !TELL_LINE.test(rawLine.trim()))
        .join('\n');
}

/**
 * Turn parsed directives into the bus message shape, stamping each with a
 * monotonically increasing hop (the sender's hop + 1) and a unique id.
 */
export function directivesToMessages(
    directives: ParsedDirective[],
    fromColumnId: string,
    fromModelId: string,
    fromHop: number,
): InterSessionMessage[] {
    const now = Date.now();
    return directives.map((d, i) => ({
        id: `swarm-${now}-${fromColumnId}-${i}`,
        fromColumnId,
        fromModelId,
        toColumnId: d.toColumnId,
        payload: d.payload,
        timestamp: now + i,
        hop: fromHop + 1,
    }));
}
