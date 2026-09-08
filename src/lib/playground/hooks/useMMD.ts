'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { InterSessionMessage, MMDConfig, ModelRegistryEntry } from '../types';
import { UsePlaygroundStreamResult } from './usePlaygroundStream';
import {
    clearInbox,
    drainWave,
    enqueuePeerMessage,
    isQuiesced,
    renderInboxBlock,
    type SwarmBusOptions,
} from '../swarm/bus';
import {
    directivesToMessages,
    parseTellDirectives,
    stripTellDirectives,
} from '../swarm/parser';
import {
    freshTerminator,
    recordWaveDrained,
    shouldSettle,
} from '../swarm/terminator';

interface SendRegistry {
    fanOut(prompt: string, options: any): Promise<void>;
    fanOutSelective(prompt: string, options: any, columnIds: string[]): Promise<void>;
}

interface UseMMDProps {
    columns: { id: string; modelId: string }[];
    mmdConfig: MMDConfig;
    registry: SendRegistry;
    chairmanStream: UsePlaygroundStreamResult;
    models: readonly ModelRegistryEntry[];
    paramOptions: any;
}

export function useMMD({
    columns,
    mmdConfig,
    registry,
    chairmanStream,
    models,
    paramOptions,
}: UseMMDProps) {
    const [mmdState, setMmdState] = useState<'idle' | 'running' | 'synthesizing' | 'done' | 'error'>('idle');
    const [mmdRound, setMmdRound] = useState<number>(1);

    // Mirror of `mmdState` kept in a ref so the async stream-completion
    // guards (`onColumnComplete` / `onChairmanComplete`) always read the
    // *current* phase. Those callbacks fire from inside the SSE read loop —
    // outside React's render cycle — so the `mmdState` captured in their
    // closure can be stale by one phase transition (e.g. the chairman's
    // `done` calls `setMmdState('running')` + `runRound()` synchronously,
    // before React re-renders and before columns refresh their
    // `onCompleteRef`). Guarding on the ref eliminates that race.
    const mmdStateRef = useRef<'idle' | 'running' | 'synthesizing' | 'done' | 'error'>('idle');
    const setMmdStateBoth = useCallback(
        (next: 'idle' | 'running' | 'synthesizing' | 'done' | 'error') => {
            mmdStateRef.current = next;
            setMmdState(next);
        },
        [],
    );

    // Refs to hold run state across asynchronous stream callbacks
    const mmdAnswersRef = useRef<Record<string, string>>({});
    const originalPromptRef = useRef<string>('');
    const pendingColumnsRef = useRef<string[]>([]);
    const currentRoundRef = useRef<number>(1);
    const timeoutsRef = useRef<Record<string, NodeJS.Timeout>>({});
    const retryCountsRef = useRef<Record<string, number>>({});

    // ── Swarm (inter-session messaging) state ─────────────────────────
    // These are only touched when `mmdConfig.topology === 'swarm'`. They
    // live on refs for the same reason the refs above do: the completion
    // callbacks fire from inside the SSE read loop, outside React's render
    // cycle, so any state captured by closure would lag the actual phase.
    //
    //   - `peerInboxes`  → one queue per target column. Drained one wave at
    //     a time; each wave re-activates its targets with the peer banners
    //     folded into the prompt. The bus serializes + enforces hop caps.
    //   - `swarmTerminator` → hop counter + settle-window clock. Decides
    //     when the swarm is done and the Chairman should run.
    //   - `swarmMessageLog` → append-only audit trail of every accepted
    //     peer message this cycle. Folded into the Chairman synthesis
    //     prompt so consensus can attribute each handoff (see
    //     implementation_plan.md: Chairman scoreboard attribution).
    const peerInboxesRef = useRef<Map<string, InterSessionMessage[]>>(new Map());
    const swarmTerminatorRef = useRef(freshTerminator());
    const swarmMessageLogRef = useRef<InterSessionMessage[]>([]);
    const lastColumnHopRef = useRef<Record<string, number>>({});
    // Settle-window timer. When the swarm has no immediate wave to drain but
    // is still inside its settle window, we arm this once so convergence is
    // forced even if no more column completions arrive.
    const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    /** True only when the user opted into the swarm topology. Defaults off. */
    const isSwarmEnabled = (mmdConfig.topology ?? 'isolated') === 'swarm';

    // Tear down any pending per-column timeouts when the hook unmounts so a
    // mid-debate navigation away doesn't fire `handleTimeoutOrError` against
    // a dead hook (audit #8). `resetMMD` already clears these on an explicit
    // reset; this covers the unmount path and StrictMode re-mounts.
    useEffect(() => {
        return () => {
            const timeouts = timeoutsRef.current;
            Object.values(timeouts).forEach((t) => {
                clearTimeout(t as unknown as ReturnType<typeof setTimeout>);
            });
            timeoutsRef.current = {};
            if (settleTimerRef.current) {
                clearTimeout(settleTimerRef.current);
                settleTimerRef.current = null;
            }
        };
    }, []);

    const getParticipatingColumns = useCallback(() => {
        if (mmdConfig.selectedColumnIds.length === 0) {
            // No columns selected: all columns participate in MMD
            return columns;
        } else {
            // Selected columns are EXCLUDED from MMD debate (they are targeted directly instead)
            return columns.filter(c => !mmdConfig.selectedColumnIds.includes(c.id));
        }
    }, [columns, mmdConfig.selectedColumnIds]);

    const resetMMD = useCallback(() => {
        setMmdStateBoth('idle');
        setMmdRound(1);
        mmdAnswersRef.current = {};
        originalPromptRef.current = '';
        pendingColumnsRef.current = [];
        currentRoundRef.current = 1;
        retryCountsRef.current = {};

        // Clear any active timeouts
        Object.values(timeoutsRef.current).forEach(clearTimeout);
        timeoutsRef.current = {};

        // Reset swarm state so a stale cycle can't bleed into the next run.
        peerInboxesRef.current = new Map();
        swarmTerminatorRef.current = freshTerminator();
        swarmMessageLogRef.current = [];
        lastColumnHopRef.current = {};
        if (settleTimerRef.current) {
            clearTimeout(settleTimerRef.current);
            settleTimerRef.current = null;
        }
    }, []);

    // ── Run discussion round ──────────────────────────────────────────
    const runRound = useCallback(async (promptText: string, isCritique = false) => {
        const participants = getParticipatingColumns();
        if (participants.length === 0) {
            setMmdStateBoth('error');
            return;
        }

        const participantIds = participants.map(p => p.id);
        pendingColumnsRef.current = participantIds;

        const isRelayMode = mmdConfig.executionMode === 'relay';

        if (isRelayMode) {
            // RELAY MODE: Execute columns sequentially in a chain-of-thought relay pipeline
            let accumulatedContext = promptText;

            for (let i = 0; i < participants.length; i++) {
                const col = participants[i];
                const modelEntry = models.find(m => m.id === col.modelId);
                const modelName = modelEntry ? modelEntry.displayName : 'Model';

                const relayPrompt = i === 0
                    ? accumulatedContext
                    : `RELAY STEP ${i + 1}/${participants.length} (Building upon ${models.find(m => m.id === participants[i - 1].modelId)?.displayName || 'previous model'}):\n\nOriginal Task: "${originalPromptRef.current}"\n\nPrevious Relay Output:\n${accumulatedContext}\n\nYOUR TASK (${modelName}): Review, refine, optimize, and build upon the previous output above to improve quality and completeness.`;

                try {
                    await registry.fanOutSelective(relayPrompt, paramOptions, [col.id]);
                } catch (err) {
                    console.error(`[MMD Relay] Send failed for column ${col.id}:`, err);
                    handleTimeoutOrError(col.id, relayPrompt, isCritique);
                }
            }
        } else {
            // PARALLEL MODE: Trigger selected columns simultaneously in parallel
            participantIds.forEach(id => {
                const timeoutVal = mmdConfig.timeoutMs || 30000;

                if (timeoutsRef.current[id]) clearTimeout(timeoutsRef.current[id]);
                timeoutsRef.current[id] = setTimeout(() => {
                    console.warn(`[MMD] Column ${id} timed out after ${timeoutVal}ms.`);
                    handleTimeoutOrError(id, promptText, isCritique);
                }, timeoutVal);

                registry.fanOutSelective(promptText, paramOptions, [id]).catch(err => {
                    console.error(`[MMD] Send failed for column ${id}:`, err);
                    handleTimeoutOrError(id, promptText, isCritique);
                });
            });
        }
    }, [getParticipatingColumns, registry, mmdConfig.executionMode, mmdConfig.timeoutMs, models, paramOptions, setMmdStateBoth]);

    // Handle timeout or transmission error with retries
    const handleTimeoutOrError = useCallback((colId: string, promptText: string, isCritique: boolean) => {
        if (timeoutsRef.current[colId]) {
            clearTimeout(timeoutsRef.current[colId]);
            delete timeoutsRef.current[colId];
        }

        const maxRetries = mmdConfig.retries || 0;
        const currentRetries = retryCountsRef.current[colId] || 0;

        if (currentRetries < maxRetries) {
            retryCountsRef.current[colId] = currentRetries + 1;
            console.log(`[MMD] Retrying column ${colId} (attempt ${currentRetries + 1}/${maxRetries})`);

            const timeoutVal = mmdConfig.timeoutMs || 30000;
            timeoutsRef.current[colId] = setTimeout(() => {
                handleTimeoutOrError(colId, promptText, isCritique);
            }, timeoutVal);

            registry.fanOutSelective(promptText, paramOptions, [colId]).catch(() => {
                handleTimeoutOrError(colId, promptText, isCritique);
            });
        } else {
            // Out of retries, proceed with an empty or fallback answer
            console.error(`[MMD] Column ${colId} failed after ${maxRetries} retries. Proceeding.`);
            onColumnComplete(colId, `[Model failed to respond after retries]`);
        }
    }, [mmdConfig.retries, mmdConfig.timeoutMs, registry, paramOptions]);

    const runMMD = useCallback(async (promptText: string) => {
        resetMMD();
        originalPromptRef.current = promptText;
        setMmdStateBoth('running');
        await runRound(promptText, false);
    }, [resetMMD, runRound, setMmdStateBoth]);

    // ── Column Complete Handler ──────────────────────────────────────
    const onColumnComplete = useCallback((columnId: string, text: string) => {
        // Clear timeout
        if (timeoutsRef.current[columnId]) {
            clearTimeout(timeoutsRef.current[columnId]);
            delete timeoutsRef.current[columnId];
        }

        // Guard on the *ref*, not the state variable. `mmdState` is captured
        // by closure and lags the actual phase by one transition when these
        // callbacks fire synchronously from the SSE read loop (chairman
        // `done` -> `runRound` -> column `done`). Reading the ref keeps the
        // state machine advancing even before React re-renders, so a fast
        // round-2 column completion is never dropped by a stale guard.
        if (mmdStateRef.current !== 'running') return;

        mmdAnswersRef.current[columnId] = text;

        // Swarm: parse the just-finished column's output for `[TELL]`
        // directives BEFORE checking pending. This is the "parse on done
        // only" contract — by the time we reach here the stream has
        // completed, so no token-boundary splitting can corrupt a
        // directive. Messages route through the bus (hop caps + valid
        // targets) and land in the target's peer inbox for the next wave.
        if (isSwarmEnabled) {
            const col = columns.find((c) => c.id === columnId);
            if (col) ingestColumnSwarmDirectives(columnId, text, col.modelId);
        }

        pendingColumnsRef.current = pendingColumnsRef.current.filter(id => id !== columnId);

        if (pendingColumnsRef.current.length === 0) {
            // All participating columns have answered for this wave. In
            // swarm topology, a wave can spawn peer-handoff re-activations
            // before we're allowed to synthesize; drain those first. This
            // is the seam that solves the "done is terminal" problem — we
            // stay in `'running'` and fan out a fresh wave instead of
            // advancing to `'synthesizing'` prematurely.
            if (isSwarmEnabled && !maybeAdvanceSwarmWave()) {
                // Swarm still has pending work OR we force-settled; either
                // way, do NOT synthesize yet. `maybeAdvanceSwarmWave`
                // either kicked off a new wave (we stay in running) or
                // force-settled and called `triggerSynthesis` itself.
                return;
            }
            triggerSynthesis();
        }
    // NOTE: `ingestColumnSwarmDirectives`, `maybeAdvanceSwarmWave`, and
    // `triggerSynthesis` are intentionally omitted from deps. They are
    // defined later in this hook and only ever invoked from deferred
    // positions (inside if-blocks and the async settle timer), never
    // synchronously during the render where the TDZ would fire. This
    // mirrors the existing `handleTimeoutOrError` ↔ `onColumnComplete`
    // cycle, which omits `onColumnComplete` from `handleTimeoutOrError`'s
    // deps for the same circular reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [getParticipatingColumns, columns, models, mmdConfig.weighting, mmdConfig.discussionType, mmdConfig.rounds, chairmanStream, paramOptions, setMmdStateBoth, isSwarmEnabled]);

    /**
     * Resolve a `[TELL <target>]` token against the participating columns.
     * Accepts a raw column id OR a 1-based index into the participant list
     * (matching how the swarm system prompt describes the columns). Returns
     * `null` for anything unresolvable so the parser drops it cleanly.
     */
    const resolveTellTarget = useCallback(
        (token: string): string | null => {
            const trimmed = token.trim();
            if (!trimmed) return null;
            const participants = getParticipatingColumns();
            const byId = participants.find((p) => p.id === trimmed);
            if (byId) return byId.id;
            const idx = parseInt(trimmed, 10);
            if (!Number.isNaN(idx) && idx >= 1 && idx <= participants.length) {
                return participants[idx - 1].id;
            }
            return null;
        },
        [getParticipatingColumns],
    );

    /**
     * Collect every `[TELL …]` directive the just-finished column emitted,
     * route each through the bus (enforcing hop caps + valid targets), and
     * append accepted messages to the audit log. Called for every column
     * completion in swarm mode, even if the column produced no directives
     * (so its hop counter stays consistent). Mirrors the parser's
     * "parse on done only" contract.
     */
    const ingestColumnSwarmDirectives = useCallback(
        (columnId: string, text: string, fromModelId: string) => {
            const directives = parseTellDirectives(text, { resolveTarget: resolveTellTarget });
            if (directives.length === 0) return 0;

            const fromHop = lastColumnHopRef.current[columnId] ?? 0;
            const messages = directivesToMessages(directives, columnId, fromModelId, fromHop);
            const busOptions: SwarmBusOptions = {
                knownColumnIds: new Set(getParticipatingColumns().map((p) => p.id)),
                maxHops: mmdConfig.swarmMaxHops ?? 3,
            };
            let accepted = 0;
            for (const message of messages) {
                const result = enqueuePeerMessage(peerInboxesRef.current, message, busOptions);
                if (result.ok) {
                    accepted += 1;
                    swarmMessageLogRef.current.push(result.message);
                } else {
                    console.warn(
                        `[MMD Swarm] Dropped peer message from ${columnId}: ${result.reason}`,
                    );
                }
            }
            return accepted;
        },
        [resolveTellTarget, getParticipatingColumns, mmdConfig.swarmMaxHops],
    );

    /**
     * After a wave of columns finishes, decide whether to (a) re-activate
     * columns that received peer messages, (b) keep waiting inside the
     * settle window, or (c) settle and let the caller synthesize.
     *
     * Returns `true` when the caller should proceed to synthesis, `false`
     * when a new wave was dispatched (or we're still inside the settle
     * window) and the state machine must stay in `'running'`.
     *
     * The settle window is enforced by scheduling a single timer; we
     * re-check termination on every column completion rather than polling,
     * so a slow column landing during the window extends it naturally.
     */
    const maybeAdvanceSwarmWave = useCallback((): boolean => {
        const wave = drainWave(peerInboxesRef.current);
        const config = {
            maxHops: mmdConfig.swarmMaxHops ?? 3,
            settleMs: mmdConfig.swarmSettleMs ?? 4000,
        };
        const decision = shouldSettle(
            swarmTerminatorRef.current,
            config,
            isQuiesced(peerInboxesRef.current),
        );

        if (decision.settle) {
            // Force-settle: hop cap hit, settle window elapsed, or absolute
            // timeout. Drop any undelivered messages and hand off to the
            // caller's synthesis step.
            if (swarmMessageLogRef.current.length > 0) {
                console.log(
                    `[MMD Swarm] Settling (${decision.reason}); ${swarmMessageLogRef.current.length} peer messages attributed.`,
                );
            }
            triggerSynthesis();
            return false;
        }

        if (wave.length === 0) {
            // Nothing to re-activate right now, but we're still inside the
            // settle window OR waiting on a slow column. Stay in running;
            // a later column completion or the settle timer will re-enter.
            // Re-arm the settle timer so convergence is eventually forced.
            if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
            settleTimerRef.current = setTimeout(() => {
                // Only force-settle if we genuinely have no pending work.
                if (pendingColumnsRef.current.length === 0) {
                    triggerSynthesis();
                }
            }, config.settleMs);
            return false;
        }

        // Re-activate each target that received peer messages, folding the
        // peer banners into a continuation prompt. This is the re-entrant
        // round that makes a column react after it already "finished" once.
        swarmTerminatorRef.current = recordWaveDrained(swarmTerminatorRef.current, config);
        const participants = getParticipatingColumns();
        pendingColumnsRef.current = wave.map((w) => w.toColumnId);

        for (const entry of wave) {
            const target = participants.find((p) => p.id === entry.toColumnId);
            if (!target) continue;
            clearInbox(peerInboxesRef.current, entry.toColumnId);
            lastColumnHopRef.current[entry.toColumnId] =
                (lastColumnHopRef.current[entry.toColumnId] ?? 0) + 1;

            const inboxBlock = renderInboxBlock(entry.messages, (modelId) => {
                const m = models.find((mm) => mm.id === modelId);
                return m ? m.displayName : 'Peer';
            });

            const continuationPrompt = `PEER UPDATE for your ongoing work on the original task:

"${originalPromptRef.current}"

${inboxBlock}

Continue your task incorporating the peer updates above. If a peer flagged an error or schema change, adopt it before answering.`;

            const timeoutVal = mmdConfig.timeoutMs || 30000;
            if (timeoutsRef.current[entry.toColumnId]) {
                clearTimeout(timeoutsRef.current[entry.toColumnId]);
            }
            timeoutsRef.current[entry.toColumnId] = setTimeout(() => {
                console.warn(`[MMD Swarm] Re-activation timed out for ${entry.toColumnId}.`);
                handleTimeoutOrError(entry.toColumnId, continuationPrompt, false);
            }, timeoutVal);

            registry
                .fanOutSelective(continuationPrompt, paramOptions, [entry.toColumnId])
                .catch((err) => {
                    console.error(`[MMD Swarm] Re-activation send failed for ${entry.toColumnId}:`, err);
                    handleTimeoutOrError(entry.toColumnId, continuationPrompt, false);
                });
        }
        return false;
    }, [getParticipatingColumns, models, mmdConfig.swarmMaxHops, mmdConfig.swarmSettleMs, mmdConfig.timeoutMs, registry, paramOptions]);

    /**
     * Build the Chairman synthesis prompt (extended with the swarm peer log
     * when present) and kick off the chairman stream. Extracted so both the
     * normal completion path and the swarm settle path reach the same
     * synthesis — single source of truth for the scoreboard contract.
     */
    const triggerSynthesis = useCallback(() => {
        setMmdStateBoth('synthesizing');
        if (settleTimerRef.current) {
            clearTimeout(settleTimerRef.current);
            settleTimerRef.current = null;
        }

        const participants = getParticipatingColumns();
        const roundNum = currentRoundRef.current;

        const discussionContext = participants.map((col) => {
            const modelEntry = models.find((m) => m.id === col.modelId);
            const modelName = modelEntry ? modelEntry.displayName : 'Unknown Model';
            const weight = mmdConfig.weighting[col.modelId] ?? 1.0;
            // Strip raw `[TELL]` scaffolding from the visible output so the
            // Chairman doesn't see the plumbing, only the answer. The
            // directives themselves are surfaced separately in the log.
            const cleanAnswer = isSwarmEnabled
                ? stripTellDirectives(mmdAnswersRef.current[col.id] || 'No response.')
                : mmdAnswersRef.current[col.id] || 'No response.';
            return `### Member Model: ${modelName} (Weight: ${weight})\n${cleanAnswer}\n`;
        }).join('\n');

        const maxRounds = mmdConfig.discussionType === 'multi' ? mmdConfig.rounds : 1;

        // Swarm attribution: append the inter-agent handoff log so the
        // Chairman can attribute each peer message in the scoreboard.
        // This is the auditability layer that makes swarm defensible vs.
        // unstructured model chat (see implementation_plan.md review).
        const handoffSection = isSwarmEnabled && swarmMessageLogRef.current.length > 0
            ? `\nInter-Agent Handoff Log (Swarm):\n${swarmMessageLogRef.current
                  .map((m) => {
                      const fromModel = models.find((mm) => mm.id === m.fromModelId)?.displayName ?? m.fromColumnId;
                      const toModel = models.find((mm) => {
                          const target = participants.find((p) => p.id === m.toColumnId);
                          return target ? mm.id === target.modelId : false;
                      })?.displayName ?? m.toColumnId;
                      return `- ${fromModel} → ${toModel} (hop ${m.hop}): ${m.payload}`;
                  })
                  .join('\n')}\n`
            : '';

        const synthesisPrompt = `You are the Chairman of a Multi-LLM Debate (MAD) panel grounded in multi-agent consensus research. Your objective is to act as an active Socratic Vetting Director.

Your Vetting Protocol for Round ${roundNum}/${maxRounds}:
1. Audit Quality & Depth: Evaluate member outputs for superficiality, unstated assumptions, or factual errors.
2. Identify Critical Gaps: Spot unaddressed edge cases, mathematical gaps, or logical contradictions between member outputs.
3. Weigh Arguments: Evaluate member contributions according to their assigned weight parameters (0.0 to 1.0).
4. Probing Directive: Highlight sub-par conclusions and formulate specific Socratic questions to challenge member models for subsequent refinement.

Original Inquiry:
"${originalPromptRef.current}"

Debate Member Outputs (Round ${roundNum}):
${discussionContext}
${handoffSection}
Provide a comprehensive, unified Socratic synthesis.

IMPORTANT: At the top of your response, output a structured "### 📊 CHAIRMAN CONSENSUS SCOREBOARD" markdown table with columns:
| Model Name | Weight | Contribution Impact % | Alignment Level | MVP Award |
Evaluate each model's contribution rigorously. End with a [VERDICT & QUALITY RATING] line ([ROBUST CONSENSUS], [SOCRATICALLY VETTED], or [DIVERGENT PERSPECTIVES]).`;

        const chairmanOptions = {
            ...paramOptions,
            systemPrompt: `You are the Socratic Chairman of an expert Multi-LLM Debate panel. Evaluate member claims critically, expose weak arguments, and drive high-rigor consensus.`,
        };

        chairmanStream.send(synthesisPrompt, chairmanOptions).catch((err) => {
            console.error('[MMD] Chairman synthesis trigger failed:', err);
            setMmdStateBoth('error');
        });
    }, [getParticipatingColumns, models, mmdConfig.weighting, mmdConfig.discussionType, mmdConfig.rounds, mmdConfig.executionMode, chairmanStream, paramOptions, setMmdStateBoth, isSwarmEnabled]);

    // ── Chairman Complete Handler ─────────────────────────────────────
    const onChairmanComplete = useCallback((text: string) => {
        if (mmdStateRef.current !== 'synthesizing') return;

        const maxRounds = mmdConfig.discussionType === 'multi' ? mmdConfig.rounds : 1;
        const currentRound = currentRoundRef.current;

        if (currentRound >= maxRounds) {
            // Done!
            setMmdStateBoth('done');

            // Observer learning trigger if enabled
            if (mmdConfig.includeOneObserver) {
                console.log('[MMD Observer] One is observing final synthesis text:', text.slice(0, 100) + '...');
                fetch('/api/playground/observe-learning', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        prompt: originalPromptRef.current,
                        synthesis: text,
                        roundsCount: currentRound,
                    })
                }).catch(err => console.warn('[MMD Observer] Failed to send observation:', err));
            }
        } else {
            // Move to next critique-and-refine round
            const nextRound = currentRound + 1;
            currentRoundRef.current = nextRound;
            setMmdRound(nextRound);
            setMmdStateBoth('running');

            // Swarm: each Chairman critique round starts a FRESH swarm cycle
            // so the previous round's hop count and peer-message log don't
            // bleed into the new one. Without this, round 2 would either
            // immediately hit the hop cap or misattribute round-1 handoffs.
            if (isSwarmEnabled) {
                peerInboxesRef.current = new Map();
                swarmTerminatorRef.current = freshTerminator();
                swarmMessageLogRef.current = [];
                lastColumnHopRef.current = {};
                if (settleTimerRef.current) {
                    clearTimeout(settleTimerRef.current);
                    settleTimerRef.current = null;
                }
            }

            // Socratic Vetting Critique Prompt for member models
            const critiquePrompt = `CHAIRMAN SOCRATIC VETTING DIRECTIVE (Round ${currentRound}/${maxRounds}):

The Chairman has audited Round ${currentRound} outputs and issued the following evaluation & probing questions:

"${text}"

MEMBER DIRECTIVE FOR ROUND ${nextRound}:
Re-evaluate your previous thesis in light of the Chairman's audit above.
1. Address the specific gaps, edge cases, and challenges highlighted by the Chairman.
2. Defend your logic with concrete evidence or constructively update your thesis.
3. Help build a higher-rigor, verified consensus for Round ${nextRound}.`;

            // Reset round answers
            mmdAnswersRef.current = {};
            // Repopulate the pending set now (runRound does this too, but
            // writing it here protects against a column `done` firing during
            // the synchronous fan-out below before runRound's assignment
            // settles).
            pendingColumnsRef.current = getParticipatingColumns().map(p => p.id);
            runRound(critiquePrompt, true);
        }
    }, [mmdConfig.discussionType, mmdConfig.rounds, mmdConfig.includeOneObserver, runRound, getParticipatingColumns, setMmdStateBoth, isSwarmEnabled]);

    return {
        mmdState,
        mmdRound,
        runMMD,
        onColumnComplete,
        onChairmanComplete,
        resetMMD,
        participatingIds: getParticipatingColumns().map(p => p.id),
    };
}
