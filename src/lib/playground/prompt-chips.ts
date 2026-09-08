/**
 * prompt-chips.ts
 *
 * The AI-inferred capability-chip engine for the Chat Workbench — Google AI
 * Studio's "AI Chips" adapted to our client-side sandbox.
 *
 * Two lanes:
 *  - Inferred (primary): a fast strategist model reads the draft prompt and
 *    proposes the chips adequate for the app being described (semantic
 *    inference, pre-generation). SIGNED-IN TIERS ONLY — billed to the
 *    user's own playground subscription credits, never the guest pool.
 *  - Static (fallback): preset contract chips for guests, while inference
 *    is cold, while the draft is too short to infer from, or when the
 *    inference call is rejected (auth, network).
 *
 * Chips never mutate the textarea: selected chips ride along at send time as
 * contract lines appended to the system prompt (mirrors `enabledSkills`).
 */

import type { BuildSuggestion } from './types';

export type { BuildSuggestion };

export interface CapabilityChip {
    id: string;
    label: string;
    /** Contract line appended to the system prompt when selected. */
    contract: string;
}

/** Fallback / seed lane — honest to the sandbox's library allowlist. */
export const STATIC_CAPABILITY_CHIPS: CapabilityChip[] = [
    { id: 'charts', label: 'Charts', contract: 'Include data visualizations using recharts.' },
    { id: 'motion', label: 'Motion', contract: 'Add framer-motion micro-interactions on hover, focus, and entry.' },
    { id: 'dark-mode', label: 'Dark mode', contract: 'Ship a working light/dark theme toggle.' },
    { id: 'persistence', label: 'Persistence', contract: 'Persist app state to localStorage and hydrate on load.' },
    { id: 'sample-data', label: 'Sample data', contract: 'Seed realistic in-memory sample data; mark backend seams with // TODO(backend): comments.' },
    { id: 'responsive', label: 'Responsive', contract: 'Do a mobile-first responsive layout pass.' },
    { id: 'a11y', label: 'A11y', contract: 'Ensure AA color contrast and visible focus states.' },
];

/** "I'm Feeling Lucky" starters for the dice button. */
export const LUCKY_STARTERS: string[] = [
    'Build a habit tracker with streaks and weekly stats',
    'Build an invoice generator with live totals and PDF-style preview',
    'Build a kanban board with drag & drop cards',
    'Build a crypto price dashboard with charts',
    'Build a pomodoro timer with session history',
    'Build a recipe box with search and favorites',
    'Build a markdown note editor with live preview',
    'Build a personal budget dashboard with category charts',
];

export function randomStarter(): string {
    return LUCKY_STARTERS[Math.floor(Math.random() * LUCKY_STARTERS.length)];
}

/**
 * Intent gate: chips only infer when the draft reads like a build request,
 * so ordinary chat never gets chip noise.
 */
export function isBuildIntent(text: string): boolean {
    const t = text.trim();
    if (t.length < 12) return false;
    return (
        /\b(build|make|create|design|prototype|generate)\b[\s\S]{0,60}\b(app|dashboard|tracker|tool|board|timer|calculator|generator|widget|site|page|interface|ui|kanban|todo|planner|editor|viewer|store|shop)\b/i.test(t)
        || /\b(build|make|create|design)\s+(me\s+)?(an?|the)\s+/i.test(t)
    );
}

export const CHIP_INFERENCE_SYSTEM_PROMPT = [
    'You are a product-intuition engine inside an app-building workbench.',
    'Given a draft description of an app the user wants to build, propose the capability chips they most likely want.',
    'Propose 3-5 chips, each a concrete phrase of at most 4 words, implementable inside a single-file React prototype (e.g. charts, timers, drag & drop, dark mode, localStorage persistence, filters, profiles, sample data, animations, responsive layout, search, sorting, export).',
    'Respond with ONLY a JSON array: [{"title":"max 4 words","detail":"one sentence"}].',
    'No markdown fences, no commentary.',
].join(' ');

export function chipPromptFor(draft: string): string {
    return `Draft app description:\n\n${draft}\n\nPropose 3-5 capability chips as JSON.`;
}

/** Compose the contract block for selected chips (static ids + inferred titles). */
export function composeChipContract(selectedStaticIds: string[], selectedInferredTitles: string[]): string {
    const lines: string[] = selectedStaticIds
        .map((id) => STATIC_CAPABILITY_CHIPS.find((c) => c.id === id)?.contract ?? '')
        .filter(Boolean);
    for (const title of selectedInferredTitles) {
        lines.push(`Include: ${title}.`);
    }
    if (lines.length === 0) return '';
    return `USER-SELECTED BUILD CHIPS (honor each):\n${lines.map((l) => `- ${l}`).join('\n')}`;
}
