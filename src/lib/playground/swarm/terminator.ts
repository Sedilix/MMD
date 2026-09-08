/**
 * Swarm cycle terminator — decides when a swarm wave is done and the
 * Chairman should run.
 *
 * A swarm converges when BOTH of these hold:
 *
 *   1. The bus is quiesced (no new peer messages queued for the next wave).
 *   2. Either the hop cap was reached, OR the settle window elapsed with
 *      no new messages since the last wave drained.
 *
 * The settle window is the important one: without it, a column that's
 * just slow to emit its `[TELL]` would be mistaken for convergence. The
 * hop cap is the hard backstop that stops A↔B ping-pong indefinitely.
 *
 * Like `bus.ts`, this module is engine-agnostic and free of React, so the
 * standalone `tsx` verification scripts can exercise it directly.
 */

export interface TerminatorState {
    /** Hops completed so far in this swarm cycle. */
    hopsCompleted: number;
    /** Unix-ms the swarm cycle started (set by `startCycle`). */
    startedAt: number;
    /** Unix-ms of the last wave drain (0 before the first drain). */
    lastDrainAt: number;
}

export interface TerminatorConfig {
    maxHops: number;
    settleMs: number;
    /** Optional hard wall-clock ceiling for the whole swarm, ms. */
    absoluteTimeoutMs?: number;
    /** Injectable clock for deterministic verification. */
    now?: () => number;
}

/**
 * Fresh terminator with `startedAt` set to now. The start anchor is
 * independent of wave drains so the settle window can elapse for the
 * very first round (when `lastDrainAt` is still 0) — without it a swarm
 * that produces no peer messages would never converge except by hitting
 * the hop cap.
 */
export function freshTerminator(config?: TerminatorConfig): TerminatorState {
    const now = (config?.now ?? Date.now)();
    return { hopsCompleted: 0, startedAt: now, lastDrainAt: 0 };
}

export type TerminationDecision =
    | { settle: true; reason: 'hops_exhausted' | 'quiesced' | 'absolute_timeout' }
    | { settle: false; reason: 'wave_pending' | 'within_settle_window' };

/**
 * Decide whether to settle now. `busQuiesced` is `true` when the next
 * wave is empty; the settle window only matters once the bus is quiet.
 */
export function shouldSettle(
    state: TerminatorState,
    config: TerminatorConfig,
    busQuiesced: boolean,
): TerminationDecision {
    const now = (config.now ?? Date.now)();

    if (config.absoluteTimeoutMs !== undefined) {
        if (now - state.startedAt >= config.absoluteTimeoutMs) {
            return { settle: true, reason: 'absolute_timeout' };
        }
    }

    if (state.hopsCompleted >= config.maxHops) {
        return { settle: true, reason: 'hops_exhausted' };
    }

    if (!busQuiesced) {
        return { settle: false, reason: 'wave_pending' };
    }

    // Bus is quiet. Reference the LAST drain if one happened (so a wave
    // that just settled gets its own window); otherwise fall back to the
    // cycle start so the initial round can converge.
    const reference = state.lastDrainAt === 0 ? state.startedAt : state.lastDrainAt;
    if (now - reference >= config.settleMs) {
        return { settle: true, reason: 'quiesced' };
    }
    return { settle: false, reason: 'within_settle_window' };
}

/**
 * Record that a wave drained — bumps the hop counter and stamps the clock.
 * Returns a new state object (immutable update) so the engine can't
 * accidentally mutate a ref that a closure still holds.
 */
export function recordWaveDrained(
    state: TerminatorState,
    config: TerminatorConfig,
): TerminatorState {
    return {
        startedAt: state.startedAt,
        hopsCompleted: state.hopsCompleted + 1,
        lastDrainAt: (config.now ?? Date.now)(),
    };
}
