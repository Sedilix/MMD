/**
 * Agent Builder graph export (audit Step 10, depends on Step 9).
 *
 * Exports the canvas graph as a standalone, runnable-looking scaffold in
 * TypeScript or Python. The export is honest: it embeds the real graph and
 * the real compiled `MMDConfig`, walks the real control/data wires in
 * topological order, and leaves the model call + gate approval as injected
 * callbacks — nothing invented, nothing fabricated.
 *
 * Deterministic by design: no timestamps, graph order preserved, so two
 * exports of the same graph are byte-identical.
 */

import { compileBuilderGraph, type BuilderGraph } from '@/lib/playground/builder/graph';

/**
 * Topological run order over all wires (control + data). Back-edges —
 * loops — are skipped here exactly as they are bounded by `swarmMaxHops`
 * in the compile; they never break the walk.
 */
function topoOrder(graph: BuilderGraph): string[] {
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const colour = new Map<string, number>(graph.nodes.map((n) => [n.id, WHITE]));
    const adjacency = new Map<string, string[]>();
    for (const edge of graph.edges) {
        const list = adjacency.get(edge.source) ?? [];
        list.push(edge.target);
        adjacency.set(edge.source, list);
    }
    const postorder: string[] = [];
    const visit = (nodeId: string): void => {
        colour.set(nodeId, GRAY);
        for (const next of adjacency.get(nodeId) ?? []) {
            const c = colour.get(next) ?? BLACK;
            if (c === WHITE) visit(next);
            // GRAY = back-edge (loop): bounded by swarmMaxHops, not re-walked.
        }
        colour.set(nodeId, BLACK);
        postorder.push(nodeId);
    };
    for (const node of graph.nodes) {
        if ((colour.get(node.id) ?? WHITE) === WHITE) visit(node.id);
    }
    return postorder.reverse();
}

function headerLines(graph: BuilderGraph, lang: 'ts' | 'py'): string[] {
    const compiled = compileBuilderGraph(graph);
    const lines = [
        'Cybrdeck Agent Builder export — compiles onto the MMD runtime.',
        `Topology: ${compiled.mmdConfig.topology ?? 'isolated'} | Execution: ${compiled.mmdConfig.executionMode} | Loop budget: swarmMaxHops=${compiled.mmdConfig.swarmMaxHops ?? 3}`,
        `Chairman model: ${compiled.mmdConfig.chairmanModelId} | Gates: ${compiled.gates.map((g) => g.label).join(', ') || 'none'}`,
        '',
        'Wires: control = "run next", data = pass the named output slot.',
        'Loops are legal back-edges; the hop budget bounds them, not this walk.',
        'Gates are human-approval interrupts: the run pauses until approve().',
    ];
    return lines.map((l) => (lang === 'ts' ? ` * ${l}`.trimEnd() : l));
}

const TS_RUNNER = `export type Send = (agentId: string, input: string) => Promise<string>;
export type Approve = (gateId: string) => Promise<boolean>;

/**
 * Walk the graph in RUN_ORDER. Gates pause for approval; data wires feed the
 * source's recorded output into the target's input; the chairman fans in
 * every recorded slot and settles the run.
 */
export async function runGraph(send: Send, approve: Approve): Promise<Record<string, string>> {
    const slots: Record<string, string> = {};
    for (const nodeId of RUN_ORDER) {
        const node = GRAPH.nodes.find((n) => n.id === nodeId);
        if (!node) continue;
        const incoming = GRAPH.edges
            .filter((e) => e.target === node.id && slots[e.source] !== undefined)
            .map((e) => slots[e.source]);
        if (node.kind === 'gate') {
            if (!(await approve(node.id))) {
                throw new Error('Gate ' + node.id + ' rejected the run');
            }
            // A gate passes what it received through — control and data wires both carry.
            slots[node.id] = incoming.join('\\n\\n');
            continue;
        }
        const input = node.kind === 'chairman'
            ? Object.values(slots).join('\\n\\n')
            : GRAPH.edges
                .filter((e) => e.kind === 'data' && e.target === node.id && slots[e.source] !== undefined)
                .map((e) => slots[e.source])
                .join('\\n\\n');
        slots[node.id] = await send(node.id, input);
    }
    return slots;
}
`;

/** Export the graph as a standalone TypeScript scaffold. */
export function builderGraphToTypeScript(graph: BuilderGraph): string {
    const compiled = compileBuilderGraph(graph);
    const payload = { nodes: graph.nodes, edges: graph.edges, mmd: compiled.mmdConfig };
    const order = topoOrder(graph);
    return [
        '/**',
        ...headerLines(graph, 'ts'),
        ' */',
        '',
        `export const GRAPH = ${JSON.stringify(payload, null, 4)} as const;`,
        '',
        `export const RUN_ORDER = ${JSON.stringify(order, null, 4)} as const;`,
        '',
        TS_RUNNER,
    ].join('\n');
}

/** Emit a Python literal (JSON is not a Python literal: true/false/null differ). */
function toPythonLiteral(value: unknown, indent: number): string {
    const pad = '    '.repeat(indent + 1);
    const close = '    '.repeat(indent);
    if (value === null || value === undefined) return 'None';
    if (value === true) return 'True';
    if (value === false) return 'False';
    if (typeof value === 'number') return String(value);
    if (typeof value === 'string') return JSON.stringify(value); // valid Python str literal
    if (Array.isArray(value)) {
        if (value.length === 0) return '[]';
        return '[\n' + value.map((v) => pad + toPythonLiteral(v, indent + 1)).join(',\n') + ',\n' + close + ']';
    }
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return '{}';
    return (
        '{\n' +
        entries.map(([k, v]) => `${pad}${JSON.stringify(k)}: ${toPythonLiteral(v, indent + 1)}`).join(',\n') +
        ',\n' + close + '}'
    );
}

const PY_RUNNER = `def run_graph(send, approve):
    """Walk the graph in RUN_ORDER.

    send(agent_id, input) -> str    -- the model call, injected by the host
    approve(gate_id) -> bool        -- human-approval interrupt (HITL)

    Data wires feed the source's recorded output into the target's input;
    the chairman fans in every recorded slot and settles the run.
    """
    slots = {}
    for node_id in RUN_ORDER:
        node = next((n for n in GRAPH["nodes"] if n["id"] == node_id), None)
        if node is None:
            continue
        # Control and data wires both carry into a gate's passthrough.
        incoming = [
            slots[e["source"]]
            for e in GRAPH["edges"]
            if e["target"] == node_id and e["source"] in slots
        ]
        if node["kind"] == "gate":
            if not approve(node_id):
                raise RuntimeError(f"Gate {node_id} rejected the run")
            # A gate passes what it received through — downstream wires stay live.
            slots[node_id] = "\\n\\n".join(incoming)
            continue
        if node["kind"] == "chairman":
            graph_input = "\\n\\n".join(slots.values())
        else:
            data_incoming = [
                slots[e["source"]]
                for e in GRAPH["edges"]
                if e["kind"] == "data" and e["target"] == node_id and e["source"] in slots
            ]
            graph_input = "\\n\\n".join(data_incoming)
        slots[node_id] = send(node_id, graph_input)
    return slots
`;

/** Export the graph as a standalone Python scaffold. */
export function builderGraphToPython(graph: BuilderGraph): string {
    const compiled = compileBuilderGraph(graph);
    const payload = { nodes: graph.nodes, edges: graph.edges, mmd: compiled.mmdConfig };
    const order = topoOrder(graph);
    return [
        '"""',
        ...headerLines(graph, 'py'),
        '"""',
        '',
        `GRAPH = ${toPythonLiteral(payload, 0)}`,
        '',
        `RUN_ORDER = ${toPythonLiteral(order, 0)}`,
        '',
        PY_RUNNER,
    ].join('\n');
}
