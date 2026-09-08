/**
 * Agent Builder graph model (audit Step 9).
 *
 * The canvas edits a `BuilderGraph`; this module is the pure core that
 * validates it and compiles it onto the existing MMD runtime — one
 * runtime, two front doors (audit §7). Node kinds v1: Agent, Router,
 * Gate, Chairman (Input/Output/Tool land in v1.1).
 *
 * Two wire kinds:
 *  - `control` — "run next"; carries nothing.
 *  - `data`    — carries a named slot (`text` | `json` | `artifact`).
 *    A data wire is invalid when the source's output slot can't satisfy
 *    the target's input slot — the canvas renders those red.
 *
 * Loops are legal (they are back-edges) and become the swarm's
 * `swarmMaxHops` budget instead of validation errors.
 */

import type { MMDConfig } from '@/lib/playground/types';

export type BuilderNodeKind = 'agent' | 'router' | 'gate' | 'chairman';
export type BuilderSlot = 'text' | 'json' | 'artifact';
export type BuilderEdgeKind = 'control' | 'data';

export const BUILDER_NODE_KINDS: readonly BuilderNodeKind[] = [
    'agent',
    'router',
    'gate',
    'chairman',
];
export const BUILDER_SLOTS: readonly BuilderSlot[] = ['text', 'json', 'artifact'];

/** Bound on the graph size — the canvas stays legible and the compile stays cheap. */
export const MAX_BUILDER_NODES = 12;
export const MAX_BUILDER_EDGES = 32;

export interface BuilderNodeConfig {
    id: string;
    kind: BuilderNodeKind;
    label: string;
    /** Model binding (an agent/chairman without one is a validation issue). */
    modelId?: string;
    /** Prompt-registry class reference (audit Step 8). */
    promptClassId?: string;
    outputSlot: BuilderSlot;
    inputSlot: BuilderSlot;
}

export interface BuilderEdgeConfig {
    id: string;
    source: string;
    target: string;
    kind: BuilderEdgeKind;
}

export interface BuilderGraph {
    nodes: BuilderNodeConfig[];
    edges: BuilderEdgeConfig[];
}

export interface BuilderIssue {
    /** `slot-mismatch` issues carry `edgeId` so the canvas can render the wire red. */
    code: 'slot-mismatch' | 'dangling-edge' | 'missing-model' | 'no-chairman' | 'gate-terminal';
    message: string;
    edgeId?: string;
    nodeId?: string;
}

export interface BuilderCompileResult {
    /** The compiled MMD config — one runtime, two front doors. */
    mmdConfig: MMDConfig;
    /** Column activation plan: one entry per agent/router node, in graph order. */
    columns: Array<{ nodeId: string; label: string; modelId: string; promptClassId?: string }>;
    /** Human-approval interrupt points (Gate nodes). */
    gates: Array<{ nodeId: string; label: string }>;
    /** Back-edge count — loops are bounded by `swarmMaxHops`, not forbidden. */
    loopEdges: number;
    issues: BuilderIssue[];
}

/** Every validation pass over the graph in one place. */
export function validateBuilderGraph(graph: BuilderGraph): BuilderIssue[] {
    const issues: BuilderIssue[] = [];
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));

    for (const edge of graph.edges) {
        const source = byId.get(edge.source);
        const target = byId.get(edge.target);
        if (!source || !target) {
            issues.push({
                code: 'dangling-edge',
                message: 'A wire lost its endpoint.',
                edgeId: edge.id,
            });
            continue;
        }
        if (edge.kind === 'data' && source.outputSlot !== target.inputSlot) {
            issues.push({
                code: 'slot-mismatch',
                message: `${source.label} outputs '${source.outputSlot}' but ${target.label} expects '${target.inputSlot}'.`,
                edgeId: edge.id,
            });
        }
    }

    for (const node of graph.nodes) {
        if ((node.kind === 'agent' || node.kind === 'chairman') && !node.modelId) {
            issues.push({
                code: 'missing-model',
                message: `${node.label} has no model binding.`,
                nodeId: node.id,
            });
        }
        if (node.kind === 'gate') {
            const outgoing = graph.edges.some((e) => e.source === node.id);
            if (!outgoing) {
                issues.push({
                    code: 'gate-terminal',
                    message: `${node.label} never releases approval — nothing runs after it.`,
                    nodeId: node.id,
                });
            }
        }
    }

    const hasChairman = graph.nodes.some((n) => n.kind === 'chairman');
    if (graph.nodes.length > 0 && !hasChairman) {
        issues.push({
            code: 'no-chairman',
            message: 'Add a Chairman to settle the run — consensus needs a fan-in.',
        });
    }

    return issues;
}

/** Count back-edges (loops) with a DFS colouring pass over all wires. */
function countLoopEdges(graph: BuilderGraph): number {
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const colour = new Map<string, number>(graph.nodes.map((n) => [n.id, WHITE]));
    const adjacency = new Map<string, string[]>();
    for (const edge of graph.edges) {
        const list = adjacency.get(edge.source) ?? [];
        list.push(edge.target);
        adjacency.set(edge.source, list);
    }
    let loops = 0;
    const visit = (nodeId: string): void => {
        colour.set(nodeId, GRAY);
        for (const next of adjacency.get(nodeId) ?? []) {
            const c = colour.get(next) ?? BLACK;
            if (c === GRAY) loops += 1;
            else if (c === WHITE) visit(next);
        }
        colour.set(nodeId, BLACK);
    };
    for (const node of graph.nodes) {
        if ((colour.get(node.id) ?? WHITE) === WHITE) visit(node.id);
    }
    return loops;
}

/**
 * Compile the graph onto the MMD runtime. Agents/routers become columns,
 * the chairman node becomes `chairmanModelId`, data wires switch the
 * topology to the swarm peer bus, and control wires pick relay ordering.
 */
export function compileBuilderGraph(graph: BuilderGraph): BuilderCompileResult {
    const issues = validateBuilderGraph(graph);
    const chairman = graph.nodes.find((n) => n.kind === 'chairman');
    const columns = graph.nodes
        .filter((n) => n.kind === 'agent' || n.kind === 'router')
        .map((n) => ({
            nodeId: n.id,
            label: n.label,
            modelId: n.modelId ?? 'gpt-5-4',
            ...(n.promptClassId ? { promptClassId: n.promptClassId } : {}),
        }));
    const gates = graph.nodes
        .filter((n) => n.kind === 'gate')
        .map((n) => ({ nodeId: n.id, label: n.label }));
    const hasDataEdges = graph.edges.some((e) => e.kind === 'data');
    const hasControlEdges = graph.edges.some((e) => e.kind === 'control');
    const loopEdges = countLoopEdges(graph);

    const mmdConfig: MMDConfig = {
        enabled: graph.nodes.length > 0,
        discussionType: 'multi',
        executionMode: hasControlEdges ? 'relay' : 'parallel',
        rounds: 1,
        chairmanModelId: chairman?.modelId ?? 'gpt-5-4',
        includeOneObserver: false,
        mode: 'default',
        selectedColumnIds: columns.map((c) => c.nodeId),
        timeoutMs: 120_000,
        retries: 1,
        weighting: {},
        creditLimit: 0,
        topology: hasDataEdges ? 'swarm' : 'isolated',
        // Loops are back-edges: legal, but bounded. Each detected back-edge
        // adds one hop of budget on top of the swarm default of 3.
        swarmMaxHops: 3 + loopEdges,
        swarmSettleMs: 4000,
    };

    return { mmdConfig, columns, gates, loopEdges, issues };
}
