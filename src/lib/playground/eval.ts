/**
 * Eval-strip scoring (audit Step 7).
 *
 * The eval strip replays a column's prompt dataset through the column's
 * own stream and scores each answer deterministically on the client —
 * no extra model calls, no LLM-as-judge. Two honest metrics:
 *
 *  - Containment: does the expected text appear in the answer
 *    (case-insensitive, whitespace-normalised)? That is a pass and
 *    scores 1.
 *  - Token overlap: Jaccard similarity of the lowercased word sets,
 *    reported as partial credit when containment fails.
 *
 * Both are cheap, explainable, and cannot pretend to understand the
 * answer — the strip labels everything else as fail/error, never pass.
 */

export interface EvalCase {
    id: string;
    prompt: string;
    /** Expected text the answer must contain to pass. */
    expected: string;
}

export type EvalCaseStatus = 'pass' | 'fail' | 'error';

export interface EvalCaseResult {
    caseId: string;
    status: EvalCaseStatus;
    /** 0..1 — 1 for containment, Jaccard overlap otherwise. */
    score: number;
    /** The model's answer (empty on transport errors). */
    output: string;
}

/** Defensive caps for the persisted dataset. */
export const MAX_EVAL_CASES = 20;
export const MAX_EVAL_FIELD_CHARS = 4_000;

function normalise(text: string): string {
    return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function tokens(text: string): Set<string> {
    return new Set(
        normalise(text)
            .split(' ')
            .filter((t) => t.length > 0),
    );
}

/** Jaccard similarity of the lowercased word sets. 0 when either is empty. */
export function tokenOverlap(expected: string, actual: string): number {
    const a = tokens(expected);
    const b = tokens(actual);
    if (a.size === 0 || b.size === 0) return 0;
    let intersection = 0;
    for (const t of a) {
        if (b.has(t)) intersection += 1;
    }
    return intersection / (a.size + b.size - intersection);
}

/**
 * Score one case. Containment is a pass (score 1); anything else is a
 * fail carrying its Jaccard overlap as partial credit. `error` is the
 * runner's job (transport / model failure), never the scorer's.
 */
export function scoreEvalCase(kase: EvalCase, output: string): EvalCaseResult {
    const expected = normalise(kase.expected);
    const actual = normalise(output);
    const contained = expected.length > 0 && actual.includes(expected);
    return {
        caseId: kase.id,
        status: contained ? 'pass' : 'fail',
        score: contained ? 1 : tokenOverlap(kase.expected, output),
        output,
    };
}

/** Stable client-side id for dataset rows. */
export function newEvalCaseId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `eval-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}
