/**
 * Prompt difficulty estimation — the routing input for Phase 1.3.
 *
 * Deliberately deterministic and free: no LLM call to decide which LLM
 * to call. A learned router can replace this later, but shipping a
 * heuristic first means the routing rationale is reproducible and
 * testable, which is what makes the audit trail worth keeping.
 *
 * This module is intentionally **not** `server-only`. It holds no
 * secrets and touches no I/O, so it stays importable from tests and
 * from the client — a difficulty preview in the picker UI should not
 * require a round trip.
 */

export interface DifficultySignals {
    /** Rough token count of the prompt (4-chars-per-token heuristic). */
    tokenCount: number;
    /** Whether the prompt contains a fenced code block. */
    hasCode: boolean;
    /** Count of verbs that imply multi-step reasoning. */
    reasoningVerbs: number;
    /** Count of explicit constraint markers (numbered items, "must", "without"). */
    constraintCount: number;
}

export interface DifficultyEstimate {
    /** 0..1. Higher means route to a more capable model. */
    score: number;
    /** Human-readable justification. Lands verbatim in the audit record. */
    rationale: string;
    signals: DifficultySignals;
}

/**
 * Verbs that reliably indicate the task needs more than recall.
 * Deliberately short and specific — a long list of weak signals
 * produces scores that all land mid-range and route nothing.
 */
const REASONING_VERBS = [
    'prove', 'derive', 'compare', 'contrast', 'refactor', 'debug',
    'optimise', 'optimize', 'analyse', 'analyze', 'evaluate', 'critique',
    'design', 'architect', 'explain why', 'trade-off', 'tradeoff',
    // Added after the live chain run: the diagnostic prompt "give the two
    // most likely causes and how to distinguish them" scored 0.00 and
    // routed cheap, because differential diagnosis — the single most
    // common shape of a hard technical question — used none of the verbs
    // above. Root-cause language is a strong difficulty signal and was
    // simply missing from the list.
    'distinguish', 'diagnose', 'root cause', 'why does', 'why is',
    'troubleshoot', 'reconcile', 'justify',
];

const CONSTRAINT_MARKERS = [
    'must', 'without', 'only if', 'ensure', 'never',
    'exactly', 'at least', 'at most', 'constraint',
];

/** Same 4-chars-per-token heuristic the provider layer uses. */
function roughTokens(text: string): number {
    if (!text) return 0;
    return Math.max(1, Math.ceil(text.length / 4));
}

function countOccurrences(haystack: string, needles: string[]): number {
    let n = 0;
    for (const needle of needles) {
        let from = 0;
        for (;;) {
            const at = haystack.indexOf(needle, from);
            if (at === -1) break;
            n += 1;
            from = at + needle.length;
        }
    }
    return n;
}

export const DIFFICULTY_LOW_MAX = 0.35;
export const DIFFICULTY_HIGH_MIN = 0.75;

/** Which capability band a score falls into. */
export function difficultyBand(score: number): 'low' | 'moderate' | 'high' {
    if (score < DIFFICULTY_LOW_MAX) return 'low';
    if (score > DIFFICULTY_HIGH_MIN) return 'high';
    return 'moderate';
}

/**
 * Score a prompt's difficulty from cheap structural signals.
 *
 * Weights are legible rather than tuned. Contribution caps:
 *
 *   reasoning verbs 0.35 · code 0.25 · constraints 0.25 · length 0.15
 *
 * summing to 1.0 only when every signal saturates, so a prompt has to
 * reason *and* carry code *and* constrain *and* be long before it pins
 * the scale.
 *
 * Length is deliberately the smallest share. It is the weakest
 * predictor of difficulty — a long prompt is usually a long paste, not
 * a hard question — and an earlier revision gave it 0.25. That let
 * length crowd out the signals that matter: a short prompt with four
 * reasoning verbs, a code block and hard constraints scored 0.71 and
 * routed to a cheap model, because it forfeited a quarter of the scale
 * for being concise. Reasoning density now carries the most weight,
 * since constraint-following and multi-step reasoning are where small
 * models visibly degrade. See `scripts/check-difficulty.ts`, whose
 * "multi-step analysis (short)" fixture pins exactly that case.
 */
export function estimateDifficulty(prompt: string): DifficultyEstimate {
    const raw = prompt ?? '';
    const text = raw.toLowerCase();
    const tokenCount = roughTokens(raw);
    const hasCode = /```/.test(raw);
    const reasoningVerbs = countOccurrences(text, REASONING_VERBS);
    const numberedLines = raw.split('\n').filter((l) => /^\s*\d+[.)]\s/.test(l)).length;
    const constraintCount = countOccurrences(text, CONSTRAINT_MARKERS) + numberedLines;

    const lengthScore = Math.min(tokenCount / 1500, 1) * 0.15;
    const codeScore = hasCode ? 0.25 : 0;
    const verbScore = Math.min(reasoningVerbs * 0.1, 0.35);
    const constraintScore = Math.min(constraintCount * 0.05, 0.25);

    const total = lengthScore + codeScore + verbScore + constraintScore;
    const score = Math.round(Math.min(Math.max(total, 0), 1) * 100) / 100;

    const parts: string[] = [`~${tokenCount} tokens`];
    if (hasCode) parts.push('contains a code block');
    if (reasoningVerbs > 0) {
        parts.push(`${reasoningVerbs} reasoning verb${reasoningVerbs === 1 ? '' : 's'}`);
    }
    if (constraintCount > 0) {
        parts.push(`${constraintCount} explicit constraint${constraintCount === 1 ? '' : 's'}`);
    }

    const rationale = `Difficulty ${score.toFixed(2)} (${difficultyBand(score)}): ${parts.join(', ')}.`;

    return {
        score,
        rationale,
        signals: { tokenCount, hasCode, reasoningVerbs, constraintCount },
    };
}
