'use client';

/**
 * Agent Builder canvas (audit Step 9) — behind the `pg-flag-agent-builder`
 * flag on `/playground/builder`.
 *
 * React Flow (@xyflow/react) with one custom node type carrying Cybrdeck
 * tokens. Nodes are *instances of classes* (audit §7): kind, label, model
 * binding, prompt-class reference, and declared input/output slot
 * contracts. Two wire kinds: control ("run next") and data (named slot).
 * Data wires render red when the source's output slot can't satisfy the
 * target's input slot — the editor validates what free-text `[TELL peer]`
 * directives could never promise.
 *
 * Compile = `compileBuilderGraph` → `MMDConfig` + column activation plan
 * (one runtime, two front doors). Nothing here invents results: the
 * compile panel shows the real config and the real issue list.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ReactFlow,
    Background,
    Controls,
    Handle,
    Position,
    addEdge,
    useNodesState,
    useEdgesState,
    type Connection,
    type Edge,
    type EdgeChange,
    type Node,
    type NodeChange,
    type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Bot, Network, ShieldCheck, Crown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MODELS } from '@/lib/playground/workbench';
import {
    BUILDER_NODE_KINDS,
    BUILDER_SLOTS,
    MAX_BUILDER_NODES,
    MAX_BUILDER_EDGES,
    compileBuilderGraph,
    type BuilderEdgeKind,
    type BuilderGraph,
    type BuilderNodeConfig,
    type BuilderNodeKind,
    type BuilderSlot,
} from '@/lib/playground/builder/graph';
import { builderGraphToPython, builderGraphToTypeScript } from '@/lib/playground/builder/export';

const BUILDER_STORAGE_KEY = 'pg-builder-graph';

interface BuilderFlowNodeData extends Record<string, unknown> {
    label: string;
    kind: BuilderNodeKind;
    modelId?: string;
    promptClassId?: string;
    outputSlot: BuilderSlot;
    inputSlot: BuilderSlot;
    invalid: boolean;
}

type BuilderFlowNode = Node<BuilderFlowNodeData, 'builder'>;

const KIND_META: Record<BuilderNodeKind, { label: string; accent: string; Icon: typeof Bot }> = {
    agent: { label: 'Agent', accent: 'border-sky-500/70 text-sky-300', Icon: Bot },
    router: { label: 'Router', accent: 'border-amber-500/70 text-amber-300', Icon: Network },
    gate: { label: 'Gate', accent: 'border-rose-500/70 text-rose-300', Icon: ShieldCheck },
    chairman: { label: 'Chairman', accent: 'border-emerald-500/70 text-emerald-300', Icon: Crown },
};

function BuilderNodeView({ data }: NodeProps<BuilderFlowNode>) {
    const meta = KIND_META[data.kind];
    return (
        <div
            className={cn(
                'rounded-lg border bg-zinc-950/95 px-3 py-2 shadow-xl min-w-40',
                meta.accent,
                data.invalid && 'ring-2 ring-rose-500/80',
            )}
        >
            <Handle type="target" position={Position.Left} className="!bg-zinc-400 !border-zinc-700" />
            <div className="flex items-center gap-1.5">
                <meta.Icon className="h-3.5 w-3.5" />
                <span className="text-[9px] font-bold uppercase tracking-wider opacity-80">{meta.label}</span>
            </div>
            <p className="mt-0.5 text-xs font-semibold text-zinc-100">{data.label}</p>
            {data.modelId && (
                <p className="font-mono text-[9px] text-zinc-400 truncate max-w-44">{data.modelId}</p>
            )}
            <p className="mt-0.5 font-mono text-[8px] text-zinc-500">
                in:{data.inputSlot} → out:{data.outputSlot}
            </p>
            <Handle type="source" position={Position.Right} className="!bg-zinc-400 !border-zinc-700" />
        </div>
    );
}

// Stable identity — defined outside the component so React Flow never
// remounts every node on re-render.
const nodeTypes = { builder: BuilderNodeView };

function newNodeId(): string {
    return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `bn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function defaultNode(kind: BuilderNodeKind, index: number): BuilderFlowNode {
    return {
        id: newNodeId(),
        type: 'builder',
        position: { x: 80 + (index % 4) * 220, y: 80 + Math.floor(index / 4) * 160 },
        data: {
            label: `${KIND_META[kind].label} ${index + 1}`,
            kind,
            modelId: kind === 'gate' ? undefined : MODELS[0]?.id,
            outputSlot: 'text',
            inputSlot: 'text',
            invalid: false,
        },
    };
}

interface StoredGraph {
    nodes: BuilderFlowNode[];
    edges: Edge[];
}

export function BuilderCanvas() {
    const [initial] = useState<StoredGraph>(() => {
        if (typeof window === 'undefined') return { nodes: [], edges: [] };
        try {
            const raw = window.localStorage.getItem(BUILDER_STORAGE_KEY);
            const parsed = raw ? (JSON.parse(raw) as StoredGraph) : { nodes: [], edges: [] };
            return {
                nodes: Array.isArray(parsed.nodes) ? parsed.nodes.slice(0, MAX_BUILDER_NODES) : [],
                edges: Array.isArray(parsed.edges) ? parsed.edges.slice(0, MAX_BUILDER_EDGES) : [],
            };
        } catch {
            return { nodes: [], edges: [] };
        }
    });
    const [nodes, setNodes, onNodesChange] = useNodesState<BuilderFlowNode>(initial.nodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges);
    const [edgeMode, setEdgeMode] = useState<BuilderEdgeKind>('control');
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [compileOpen, setCompileOpen] = useState(false);
    const [copiedExport, setCopiedExport] = useState<'ts' | 'py' | null>(null);

    useEffect(() => {
        try {
            window.localStorage.setItem(BUILDER_STORAGE_KEY, JSON.stringify({ nodes, edges }));
        } catch {
            /* best effort */
        }
    }, [nodes, edges]);

    // Validate + compile the live graph. Issues drive the red wires and
    // the node rings; the compile panel shows the real output.
    const liveGraph: BuilderGraph = useMemo(() => {
        const nodeConfigs: BuilderNodeConfig[] = nodes.map((n) => ({
            id: n.id,
            kind: n.data.kind,
            label: n.data.label,
            ...(n.data.modelId ? { modelId: n.data.modelId } : {}),
            ...(n.data.promptClassId ? { promptClassId: n.data.promptClassId } : {}),
            outputSlot: n.data.outputSlot,
            inputSlot: n.data.inputSlot,
        }));
        const edgeConfigs = edges.flatMap((e) => {
            const kind = e.data?.kind as BuilderEdgeKind | undefined;
            if (kind !== 'control' && kind !== 'data') return [];
            return [{ id: e.id, source: e.source, target: e.target, kind }];
        });
        return { nodes: nodeConfigs, edges: edgeConfigs };
    }, [nodes, edges]);

    const compiled = useMemo(() => compileBuilderGraph(liveGraph), [liveGraph]);

    // Export the live graph as a standalone TS / Python scaffold (audit Step 10).
    const copyExport = (kind: 'ts' | 'py') => {
        const text = kind === 'ts' ? builderGraphToTypeScript(liveGraph) : builderGraphToPython(liveGraph);
        if (typeof navigator === 'undefined' || !navigator.clipboard) return;
        navigator.clipboard
            .writeText(text)
            .then(() => {
                setCopiedExport(kind);
                window.setTimeout(() => setCopiedExport((c) => (c === kind ? null : c)), 1600);
            })
            .catch(() => {
                /* clipboard blocked — the compile panel still shows the real config */
            });
    };

    const mismatchedEdges = useMemo(
        () => new Set(compiled.issues.filter((i) => i.code === 'slot-mismatch').map((i) => i.edgeId)),
        [compiled],
    );
    const invalidNodes = useMemo(
        () => new Set(compiled.issues.filter((i) => i.nodeId).map((i) => i.nodeId)),
        [compiled],
    );

    // Reflect validation back into the node data (invalid ring).
    useEffect(() => {
        setNodes((nds) =>
            nds.map((n) => {
                const invalid = invalidNodes.has(n.id);
                return n.data.invalid === invalid ? n : { ...n, data: { ...n.data, invalid } };
            }),
        );
    }, [invalidNodes, setNodes]);

    const styledEdges = useMemo(
        () =>
            edges.map((e) => {
                const kind = (e.data?.kind as BuilderEdgeKind | undefined) ?? 'control';
                const mismatched = mismatchedEdges.has(e.id);
                return {
                    ...e,
                    animated: kind === 'data',
                    style: {
                        stroke: mismatched ? '#f43f5e' : kind === 'data' ? '#10b981' : '#71717a',
                        strokeWidth: 1.5,
                        strokeDasharray: kind === 'control' ? '6 3' : undefined,
                    },
                    label: kind === 'data' ? 'data' : undefined,
                    labelStyle: { fill: '#a1a1aa', fontSize: 9 },
                };
            }),
        [edges, mismatchedEdges],
    );

    const handleAddNode = (kind: BuilderNodeKind) => {
        if (nodes.length >= MAX_BUILDER_NODES) return;
        setNodes((nds) => [...nds, defaultNode(kind, nds.length)]);
    };

    const handleConnect = useCallback(
        (params: Connection) => {
            setEdges((eds) => {
                if (eds.length >= MAX_BUILDER_EDGES) return eds;
                return addEdge(
                    {
                        ...params,
                        id: `be-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
                        data: { kind: edgeMode },
                    },
                    eds,
                );
            });
        },
        [edgeMode, setEdges],
    );

    const handleEdgesChange = useCallback(
        (changes: EdgeChange[]) => onEdgesChange(changes),
        [onEdgesChange],
    );
    const handleNodesChange = useCallback(
        (changes: NodeChange<BuilderFlowNode>[]) => onNodesChange(changes),
        [onNodesChange],
    );

    const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;

    const patchSelectedNode = (patch: Partial<BuilderFlowNodeData>) => {
        if (!selectedNodeId) return;
        setNodes((nds) =>
            nds.map((n) => (n.id === selectedNodeId ? { ...n, data: { ...n.data, ...patch } } : n)),
        );
    };

    return (
        <div className="relative h-full w-full">
            <ReactFlow
                nodes={nodes}
                edges={styledEdges}
                onNodesChange={handleNodesChange}
                onEdgesChange={handleEdgesChange}
                onConnect={handleConnect}
                onNodeClick={(_evt, node) => setSelectedNodeId(node.id)}
                onPaneClick={() => setSelectedNodeId(null)}
                nodeTypes={nodeTypes}
                fitView
                proOptions={{ hideAttribution: true }}
                colorMode="dark"
            >
                <Background color="#27272a" gap={24} />
                <Controls />
            </ReactFlow>

            {/* Toolbar */}
            <div className="absolute left-3 top-3 z-10 flex flex-wrap items-center gap-1.5 rounded-lg border border-white/10 bg-zinc-950/90 p-1.5 backdrop-blur">
                {BUILDER_NODE_KINDS.map((kind) => {
                    const meta = KIND_META[kind];
                    return (
                        <button
                            key={kind}
                            type="button"
                            onClick={() => handleAddNode(kind)}
                            disabled={nodes.length >= MAX_BUILDER_NODES}
                            className={cn(
                                'inline-flex h-7 items-center gap-1.5 rounded-md border bg-zinc-950 px-2 text-[10px] font-semibold transition-colors hover:bg-zinc-900 disabled:opacity-40',
                                meta.accent,
                            )}
                        >
                            <meta.Icon className="h-3.5 w-3.5" />
                            {meta.label}
                        </button>
                    );
                })}
                <div className="mx-1 h-5 w-px bg-white/15" />
                <button
                    type="button"
                    onClick={() => setEdgeMode(edgeMode === 'control' ? 'data' : 'control')}
                    className={cn(
                        'inline-flex h-7 items-center rounded-md border px-2 font-mono text-[10px] font-semibold transition-colors',
                        edgeMode === 'data'
                            ? 'border-emerald-500/70 text-emerald-300'
                            : 'border-zinc-600 text-zinc-300',
                    )}
                    title="Wire kind used for the next connection"
                >
                    wire: {edgeMode}
                </button>
                <button
                    type="button"
                    onClick={() => setCompileOpen(!compileOpen)}
                    className="inline-flex h-7 items-center rounded-md border border-violet-500/70 px-2 text-[10px] font-semibold text-violet-300 transition-colors hover:bg-violet-500/10"
                >
                    Compile
                </button>
                <button
                    type="button"
                    onClick={() => { setNodes([]); setEdges([]); setSelectedNodeId(null); }}
                    className="inline-flex h-7 items-center rounded-md border border-zinc-700 px-2 text-[10px] font-semibold text-zinc-400 transition-colors hover:bg-zinc-900"
                >
                    Clear
                </button>
            </div>

            {/* Inspector panel */}
            {selectedNode && (
                <div className="absolute right-3 top-3 z-10 w-64 space-y-2 rounded-lg border border-white/10 bg-zinc-950/95 p-3 backdrop-blur">
                    <div className="flex items-center justify-between">
                        <span className={cn('text-[10px] font-bold uppercase tracking-wider', KIND_META[selectedNode.data.kind].accent.split(' ')[1])}>
                            {KIND_META[selectedNode.data.kind].label}
                        </span>
                        <button
                            type="button"
                            onClick={() => {
                                setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
                                setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id));
                                setSelectedNodeId(null);
                            }}
                            className="text-zinc-500 hover:text-rose-400 transition-colors"
                            aria-label="Delete node"
                        >
                            ✕
                        </button>
                    </div>
                    <input
                        value={selectedNode.data.label}
                        onChange={(e) => patchSelectedNode({ label: e.target.value.slice(0, 60) })}
                        className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-100 focus:outline-none focus:border-zinc-500"
                    />
                    {selectedNode.data.kind !== 'gate' && (
                        <select
                            value={selectedNode.data.modelId ?? ''}
                            onChange={(e) => patchSelectedNode({ modelId: e.target.value || undefined })}
                            className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-100 focus:outline-none focus:border-zinc-500"
                        >
                            <option value="">No model binding</option>
                            {MODELS.map((m) => (
                                <option key={m.id} value={m.id}>{m.displayName}</option>
                            ))}
                        </select>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                        <label className="space-y-0.5">
                            <span className="text-[9px] uppercase tracking-wider text-zinc-500">Input slot</span>
                            <select
                                value={selectedNode.data.inputSlot}
                                onChange={(e) => patchSelectedNode({ inputSlot: e.target.value as BuilderSlot })}
                                className="w-full rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 font-mono text-[10px] text-zinc-100 focus:outline-none"
                            >
                                {BUILDER_SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </label>
                        <label className="space-y-0.5">
                            <span className="text-[9px] uppercase tracking-wider text-zinc-500">Output slot</span>
                            <select
                                value={selectedNode.data.outputSlot}
                                onChange={(e) => patchSelectedNode({ outputSlot: e.target.value as BuilderSlot })}
                                className="w-full rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 font-mono text-[10px] text-zinc-100 focus:outline-none"
                            >
                                {BUILDER_SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </label>
                    </div>
                    {selectedNode.data.kind === 'gate' && (
                        <p className="text-[9px] leading-normal text-zinc-500">
                            Gates are human-approval interrupt points — the run pauses here until an operator approves.
                        </p>
                    )}
                </div>
            )}

            {/* Compile drawer */}
            {compileOpen && (
                <div className="absolute bottom-3 left-3 right-3 z-10 max-h-56 overflow-y-auto scrollbar-none rounded-lg border border-white/10 bg-zinc-950/95 p-3 backdrop-blur">
                    <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-violet-400">
                            Compile → MMD runtime
                        </span>
                        <div className="flex items-center gap-1.5">
                            <button
                                type="button"
                                onClick={() => copyExport('ts')}
                                className="rounded border border-sky-500/60 px-2 py-0.5 font-mono text-[9px] font-semibold text-sky-300 transition-colors hover:bg-sky-500/10"
                                title="Copy the graph as a standalone TypeScript scaffold"
                            >
                                {copiedExport === 'ts' ? 'copied ✓' : 'export .ts'}
                            </button>
                            <button
                                type="button"
                                onClick={() => copyExport('py')}
                                className="rounded border border-amber-500/60 px-2 py-0.5 font-mono text-[9px] font-semibold text-amber-300 transition-colors hover:bg-amber-500/10"
                                title="Copy the graph as a standalone Python scaffold"
                            >
                                {copiedExport === 'py' ? 'copied ✓' : 'export .py'}
                            </button>
                            <button
                                type="button"
                                onClick={() => setCompileOpen(false)}
                                className="text-zinc-500 hover:text-zinc-200 transition-colors"
                                aria-label="Close compile panel"
                            >
                                ✕
                            </button>
                        </div>
                    </div>
                    {compiled.issues.length > 0 ? (
                        <ul className="mb-2 space-y-0.5">
                            {compiled.issues.map((issue, i) => (
                                <li key={`${issue.code}-${i}`} className="text-[10px] text-rose-300">
                                    • {issue.message}
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="mb-2 text-[10px] text-emerald-300">
                            Graph valid — {compiled.columns.length} column(s), {compiled.gates.length} gate(s), {compiled.loopEdges} loop edge(s).
                        </p>
                    )}
                    <pre className="whitespace-pre-wrap rounded bg-zinc-900 p-2 font-mono text-[9px] leading-relaxed text-zinc-400">
{JSON.stringify({ mmdConfig: compiled.mmdConfig, columns: compiled.columns, gates: compiled.gates }, null, 2)}
                    </pre>
                </div>
            )}
        </div>
    );
}
