/**
 * Lightweight, environment-gated logger.
 *
 * Goals:
 *  - Suppress routine client/server logs in production so terminal noise from
 *    transient errors, VAD timeouts, polling, and admin-gate denials doesn't
 *    drown real signal.
 *  - Keep callsites cheap and dead-simple: `dbg("…")`, `warn("…")`,
 *    `error("…")` instead of spreading `process.env.NODE_ENV` checks everywhere.
 *  - Stay tree-shakable in prod — these are pure wrappers over `console.*`,
 *    so they cost nothing when the gate is closed.
 *
 * The dashboard/chat-interface files use this shared module; one-off routes
 * declare the same helpers inline at the top of the file (see
 * src/proxy.ts, src/hooks/use-project-tasks.ts, etc.) to keep the change
 * diff minimal and avoid creating an import edge where none is wanted.
 */

const isDev = process.env.NODE_ENV !== "production";

export const dbg = (...args: unknown[]): void => {
    if (isDev) console.debug(...args);
};

export const log = (...args: unknown[]): void => {
    if (isDev) console.log(...args);
};

export const warn = (...args: unknown[]): void => {
    if (isDev) console.warn(...args);
};

/**
 * `error` is intentionally NOT gated — server errors must always surface so
 * production monitoring can pick them up.
 */
export const error = (...args: unknown[]): void => {
    console.error(...args);
};