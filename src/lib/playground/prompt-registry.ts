/**
 * Prompt registry (audit Step 8): versioned prompt classes.
 *
 * A *class* is a named system-prompt definition; every save appends an
 * immutable version instead of overwriting, so a prompt can evolve
 * without losing what worked. Columns apply one (class, version) pair —
 * the column's `customSend` injects that text as the turn's system
 * prompt, overriding the board-level default for that column only.
 *
 * Storage mirrors the custom-skills pattern: Firestore doc
 * `users/{uid}/prompt_classes` for signed-in users, localStorage
 * `__cd_prompt_classes` otherwise. Everything is bounded so neither
 * store can grow unboundedly.
 */

export interface PromptClassVersion {
    /** 1-based, monotonically increasing per class. */
    v: number;
    text: string;
    /** Unix-ms when the version was saved. */
    savedAt: number;
}

export interface PromptClass {
    id: string;
    name: string;
    versions: PromptClassVersion[];
    /** The version a fresh apply uses; points into `versions`. */
    activeVersion: number;
}

/** Applied-override marker persisted per column. */
export interface AppliedPromptClass {
    classId: string;
    v: number;
}

// Defensive caps.
export const MAX_PROMPT_CLASSES = 20;
export const MAX_PROMPT_VERSIONS = 20;
export const MAX_PROMPT_TEXT_CHARS = 16_000;
export const MAX_PROMPT_NAME_CHARS = 80;

export const PROMPT_CLASSES_STORAGE_KEY = '__cd_prompt_classes';

export function newPromptClassId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `pc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Resolve the text a column should send for an applied override. */
export function resolveAppliedText(
    classes: PromptClass[],
    applied: AppliedPromptClass | null,
): string | null {
    if (!applied) return null;
    const klass = classes.find((c) => c.id === applied.classId);
    if (!klass) return null;
    const version = klass.versions.find((ver) => ver.v === applied.v);
    return version ? version.text : null;
}

/** Validate + normalise one class entry coming from storage. */
function sanitizeClass(raw: unknown): PromptClass | null {
    if (!raw || typeof raw !== 'object') return null;
    const c = raw as Record<string, unknown>;
    if (typeof c.id !== 'string' || typeof c.name !== 'string') return null;
    if (!Array.isArray(c.versions)) return null;
    const versions: PromptClassVersion[] = [];
    for (const verRaw of c.versions) {
        if (!verRaw || typeof verRaw !== 'object') continue;
        const ver = verRaw as Record<string, unknown>;
        if (typeof ver.v !== 'number' || typeof ver.text !== 'string') continue;
        versions.push({
            v: ver.v,
            text: ver.text.slice(0, MAX_PROMPT_TEXT_CHARS),
            savedAt: typeof ver.savedAt === 'number' ? ver.savedAt : 0,
        });
    }
    if (versions.length === 0) return null;
    versions.sort((a, b) => a.v - b.v);
    const activeVersion =
        typeof c.activeVersion === 'number' &&
        versions.some((ver) => ver.v === c.activeVersion)
            ? c.activeVersion
            : versions[versions.length - 1].v;
    return {
        id: c.id,
        name: c.name.slice(0, MAX_PROMPT_NAME_CHARS),
        versions: versions.slice(-MAX_PROMPT_VERSIONS),
        activeVersion,
    };
}

/** Validate a class list from storage; always returns a bounded array. */
export function sanitizePromptClasses(raw: unknown): PromptClass[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .map(sanitizeClass)
        .filter((c): c is PromptClass => c !== null)
        .slice(0, MAX_PROMPT_CLASSES);
}

/** Append a new immutable version and point the class at it. */
export function appendPromptVersion(
    classes: PromptClass[],
    classId: string,
    text: string,
): PromptClass[] {
    const trimmed = text.slice(0, MAX_PROMPT_TEXT_CHARS);
    return classes.map((c) => {
        if (c.id !== classId) return c;
        const nextV = c.versions.reduce((max, ver) => Math.max(max, ver.v), 0) + 1;
        const versions = [...c.versions, { v: nextV, text: trimmed, savedAt: Date.now() }];
        return {
            ...c,
            versions: versions.slice(-MAX_PROMPT_VERSIONS),
            activeVersion: nextV,
        };
    });
}
