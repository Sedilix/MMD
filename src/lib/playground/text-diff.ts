/**
 * Token-level LCS diff — the algorithm behind `ModelDiffViewer`.
 *
 * Kept out of the component (and free of `server-only`) so it can be
 * exercised directly. A diff that typechecks can still be wrong in the
 * traceback, which is exactly the kind of bug a rendered component
 * hides behind plausible-looking colour.
 *
 * No dependencies: a diff library would be several hundred kilobytes
 * for an algorithm that fits in forty lines.
 */

export type DiffOp = 'equal' | 'insert' | 'delete';

export interface DiffPart {
    op: DiffOp;
    text: string;
}

/**
 * Above this per-side token count we stop doing word-level LCS and
 * diff by line instead. Classic LCS is O(n·m) in time and memory, so
 * two 8k-token answers would allocate a 64-million-cell table and lock
 * the main thread. A coarser diff beats a frozen tab.
 */
export const MAX_DIFF_TOKENS = 4000;

/** Split into words while preserving whitespace runs as their own tokens. */
export function tokenize(text: string): string[] {
    return text.match(/\s+|[^\s]+/g) ?? [];
}

/** Split after each newline, keeping the newline attached to its line. */
export function splitLines(text: string): string[] {
    return text.split(/(?<=\n)/);
}

/**
 * Longest common subsequence over two token arrays, returned as an
 * ordered list of equal/insert/delete runs.
 *
 * The table holds LCS length for suffixes, so `table[i][j]` is the LCS
 * of `a[i..]` and `b[j..]`. Walking forward from (0,0) and preferring
 * whichever neighbour retains the larger suffix-LCS reconstructs one
 * optimal alignment. `Uint32Array` keeps a 16M-cell table at 64MB
 * rather than the ~128MB a plain number array would take.
 */
export function diffTokens(a: string[], b: string[]): DiffPart[] {
    const n = a.length;
    const m = b.length;

    const table = new Uint32Array((n + 1) * (m + 1));
    const at = (i: number, j: number) => i * (m + 1) + j;

    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            table[at(i, j)] =
                a[i] === b[j]
                    ? table[at(i + 1, j + 1)] + 1
                    : Math.max(table[at(i + 1, j)], table[at(i, j + 1)]);
        }
    }

    const parts: DiffPart[] = [];
    const push = (op: DiffOp, text: string) => {
        const last = parts[parts.length - 1];
        if (last && last.op === op) last.text += text;
        else parts.push({ op, text });
    };

    let i = 0;
    let j = 0;
    while (i < n && j < m) {
        if (a[i] === b[j]) {
            push('equal', a[i]);
            i++;
            j++;
        } else if (table[at(i + 1, j)] >= table[at(i, j + 1)]) {
            push('delete', a[i]);
            i++;
        } else {
            push('insert', b[j]);
            j++;
        }
    }
    while (i < n) push('delete', a[i++]);
    while (j < m) push('insert', b[j++]);

    return parts;
}

export interface DiffResult {
    parts: DiffPart[];
    /** True when the inputs were too large for word-level and we diffed by line. */
    degraded: boolean;
}

export function computeDiff(leftText: string, rightText: string): DiffResult {
    const a = tokenize(leftText);
    const b = tokenize(rightText);

    if (a.length <= MAX_DIFF_TOKENS && b.length <= MAX_DIFF_TOKENS) {
        return { parts: diffTokens(a, b), degraded: false };
    }
    return { parts: diffTokens(splitLines(leftText), splitLines(rightText)), degraded: true };
}

export interface DiffStats {
    added: number;
    removed: number;
    /** Percentage of characters common to both sides, 0..100. */
    similarity: number;
}

export function diffStats(parts: readonly DiffPart[]): DiffStats {
    let added = 0;
    let removed = 0;
    let same = 0;
    for (const p of parts) {
        if (p.op === 'insert') added += p.text.length;
        else if (p.op === 'delete') removed += p.text.length;
        else same += p.text.length;
    }
    const total = added + removed + same;
    return { added, removed, similarity: total > 0 ? Math.round((same / total) * 100) : 100 };
}

/**
 * Reconstruct each side from a diff. Equal and delete runs rebuild the
 * left input; equal and insert runs rebuild the right. Used by the
 * split view, and the property worth asserting in any check: a correct
 * diff always round-trips.
 */
export function reconstruct(parts: readonly DiffPart[]): { left: string; right: string } {
    let left = '';
    let right = '';
    for (const p of parts) {
        if (p.op === 'equal') {
            left += p.text;
            right += p.text;
        } else if (p.op === 'delete') {
            left += p.text;
        } else {
            right += p.text;
        }
    }
    return { left, right };
}
