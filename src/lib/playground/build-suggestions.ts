/**
 * build-suggestions.ts
 *
 * The "Suggest features" engine for Build Mode. Asks a model to look at the
 * current prototype and propose concrete, high-value enhancements. Output is
 * requested as JSON; the parser degrades gracefully to numbered lines when a
 * model ignores the format.
 */

import type { BuildSuggestion } from './types';

export type { BuildSuggestion };

export const SUGGESTION_SYSTEM_PROMPT = [
    'You are a product strategist reviewing a working app prototype.',
    'Propose exactly 3 concrete, high-value enhancements a user would immediately notice.',
    'Each must be implementable inside the same single-file prototype (no new backend).',
    'Respond with ONLY a JSON array: [{"title":"max 6 words","detail":"one sentence"}].',
    'No markdown fences, no commentary.',
].join(' ');

export function suggestionPromptFor(code: string): string {
    // Cap the payload — the strategist needs the shape of the app, not every
    // character of a 500-line prototype.
    const trimmed = code.length > 12000 ? `${code.slice(0, 12000)}\n…(truncated)` : code;
    return `Here is the current prototype source:\n\n${trimmed}\n\nPropose 3 enhancements as JSON.`;
}

/** Parse a model reply into suggestions. Returns [] when nothing usable. */
export function parseBuildSuggestions(text: string): BuildSuggestion[] {
    if (!text) return [];

    // 1. Strict-ish JSON: grab the first [...] array in the reply.
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
        try {
            const parsed = JSON.parse(jsonMatch[0]) as unknown;
            if (Array.isArray(parsed)) {
                const items = parsed
                    .map((raw) => {
                        if (typeof raw === 'string') {
                            const [t, ...rest] = raw.split('—');
                            return { title: t.trim().slice(0, 80), detail: rest.join('—').trim() };
                        }
                        if (raw && typeof raw === 'object') {
                            const obj = raw as Record<string, unknown>;
                            const title = typeof obj.title === 'string' ? obj.title : '';
                            const detail = typeof obj.detail === 'string'
                                ? obj.detail
                                : typeof obj.description === 'string' ? obj.description : '';
                            return { title: title.slice(0, 80), detail };
                        }
                        return null;
                    })
                    .filter((s): s is BuildSuggestion => !!s && s.title.length > 0);
                if (items.length > 0) return items.slice(0, 5);
            }
        } catch {
            // fall through to line parsing
        }
    }

    // 2. Numbered/bulleted lines fallback.
    const lines = text
        .split('\n')
        .map((l) => l.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, '').trim())
        .filter((l) => l.length > 8 && !/^\s*[{[]/.test(l));
    return lines.slice(0, 5).map((line) => {
        const cut = line.indexOf(':');
        if (cut > 4 && cut < 70) {
            return { title: line.slice(0, cut).trim().slice(0, 80), detail: line.slice(cut + 1).trim() };
        }
        return { title: line.slice(0, 80), detail: '' };
    });
}
