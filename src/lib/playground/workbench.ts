/**
 * Workbench registry primitives shared by the playground page and its
 * column components.
 *
 * Kept React-free (no JSX) so hooks and the standalone `tsx` verification
 * scripts can import it without dragging a component tree through the
 * compiler.
 */

import modelsData from '@/data/playground/models.json';
import type { ModelRegistryEntry } from './types';
import type { PlaygroundStreamSendOptions } from './hooks/usePlaygroundStream';

// ─── Model registry (client-safe) ───────────────────────────────────────────

export const MODELS: readonly ModelRegistryEntry[] = (() => {
    const raw = modelsData as unknown as ModelRegistryEntry[];
    if (!Array.isArray(raw) || raw.length === 0) return [];
    return raw;
})();

export const DEFAULT_MODEL_CYCLE: ReadonlyArray<string> = [
    'gemini-3-flash',
    'gpt-5-4',
    'claude-sonnet-5',
    'glm-5-2',
];

// Audit Step 5: the engine always supported six concurrent columns; the
// UI cap was the only limiter. ColumnGrid carries the 5/6 arrangements.
export const MAX_COLUMNS = 6;

export function genColumnId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `col-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function modelById(id: string): ModelRegistryEntry | undefined {
    return MODELS.find((m) => m.id === id);
}

export function nextDefaultModelId(usedIds: ReadonlySet<string>): string {
    for (const candidate of DEFAULT_MODEL_CYCLE) {
        if (!usedIds.has(candidate)) return candidate;
    }
    return MODELS[0]?.id ?? DEFAULT_MODEL_CYCLE[0];
}

// ─── Column descriptor (state shape) ────────────────────────────────────────

export interface ColumnSlot {
    id: string;
    modelId: string;
}

// ─── Send registry ──────────────────────────────────────────────────────────

/**
 * Each column registers a `(prompt, opts) => Promise<void>` callback so
 * the global prompt bar can fan out. We keep this in a ref (not React
 * state) so re-renders don't churn the registration logic, and the
 * identity of `send` per column stays stable across renders.
 */
export type ColumnSendFn = (prompt: string, options: PlaygroundStreamSendOptions) => Promise<void>;

export interface SendRegistry {
    register(id: string, send: ColumnSendFn): () => void;
    fanOut(prompt: string, options: PlaygroundStreamSendOptions): Promise<void>;
    fanOutSelective(prompt: string, options: PlaygroundStreamSendOptions, columnIds: string[]): Promise<void>;
}

export function createSendRegistry(): SendRegistry {
    const map = new Map<string, ColumnSendFn>();
    return {
        register(id, send) {
            map.set(id, send);
            return (): void => {
                if (map.get(id) === send) map.delete(id);
            };
        },
        fanOut(prompt, options) {
            const fns = Array.from(map.values());
            return Promise.allSettled(fns.map((fn) => fn(prompt, options))).then(() => undefined);
        },
        fanOutSelective(prompt, options, columnIds) {
            const promises = columnIds.map((id) => {
                const fn = map.get(id);
                if (fn) return fn(prompt, options);
                return Promise.resolve();
            });
            return Promise.allSettled(promises).then(() => undefined);
        },
    };
}
