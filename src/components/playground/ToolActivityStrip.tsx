'use client';

/**
 * Live tool-activity feed for a playground column.
 *
 * Renders one row per `tool_call` SSE event observed on the current run.
 * The server only emits those events on real execution evidence (gateway
 * web-search spend / url_citation annotations, or MCP tool invocations it
 * executed itself), so everything shown here actually happened — this strip
 * is the honest counterpart to the legacy `[TOOL: ...]` directive cards,
 * which only ever displayed fabricated output.
 */

import { memo, useMemo } from 'react';
import { Network } from 'lucide-react';
import { Icon } from '@/components/ui/icon';
import type { PlaygroundToolCallRecord } from '@/lib/playground/hooks/usePlaygroundStream';

interface ParsedCitationEvidence {
    evidence: 'citations';
    citations: Array<{ url: string; title?: string }>;
}

interface ParsedUsageEvidence {
    evidence: 'usage';
    costUsd: number;
}

interface ParsedMcpCallEvidence {
    evidence: 'mcp_call';
    toolArguments?: string;
}

interface ParsedMcpResultEvidence {
    evidence: 'mcp_result';
    ok: boolean;
    preview?: string;
}

type ParsedEvidence =
    | ParsedCitationEvidence
    | ParsedUsageEvidence
    | ParsedMcpCallEvidence
    | ParsedMcpResultEvidence
    | null;

function parseEvidence(rawArgs: string): ParsedEvidence {
    if (!rawArgs) return null;
    try {
        const parsed = JSON.parse(rawArgs) as unknown;
        if (!parsed || typeof parsed !== 'object') return null;
        const obj = parsed as { evidence?: unknown };
        if (obj.evidence === 'citations') {
            const c = (parsed as ParsedCitationEvidence).citations;
            if (Array.isArray(c) && c.length > 0) {
                return parsed as ParsedCitationEvidence;
            }
            return null;
        }
        if (obj.evidence === 'usage') {
            const cost = (parsed as ParsedUsageEvidence).costUsd;
            if (typeof cost === 'number' && cost > 0) {
                return parsed as ParsedUsageEvidence;
            }
            return null;
        }
        if (obj.evidence === 'mcp_call') {
            const a = (parsed as ParsedMcpCallEvidence).toolArguments;
            return {
                evidence: 'mcp_call',
                ...(typeof a === 'string' ? { toolArguments: a } : {}),
            };
        }
        if (obj.evidence === 'mcp_result') {
            const r = parsed as Partial<ParsedMcpResultEvidence>;
            return {
                evidence: 'mcp_result',
                ok: r.ok !== false,
                ...(typeof r.preview === 'string' ? { preview: r.preview } : {}),
            };
        }
        return null;
    } catch {
        return null;
    }
}

/** One MCP tool observed on the wire, merged across call/result events. */
interface McpToolRow {
    tool: string;
    invocations: number;
    lastPreview: string | null;
    lastOk: boolean;
    awaitingResult: boolean;
}

function mergeEvidence(toolCalls: PlaygroundToolCallRecord[]) {
    // Merge evidence across events: citations accumulate, usage costs sum,
    // and MCP call/result pairs fold into one row per tool — so a multi-hop
    // run renders as one coherent feed instead of a wall of events.
    const citations: Array<{ url: string; title?: string }> = [];
    let searchCostUsd = 0;
    const seenUrls = new Set<string>();
    const mcpByTool = new Map<string, McpToolRow>();
    for (const rec of toolCalls) {
        const ev = parseEvidence(rec.arguments);
        if (!ev) continue;
        if (ev.evidence === 'citations') {
            for (const c of ev.citations) {
                if (!seenUrls.has(c.url)) {
                    seenUrls.add(c.url);
                    citations.push(c);
                }
            }
            continue;
        }
        if (ev.evidence === 'usage') {
            searchCostUsd += ev.costUsd;
            continue;
        }
        const row = mcpByTool.get(rec.toolName) ?? {
            tool: rec.toolName,
            invocations: 0,
            lastPreview: null,
            lastOk: true,
            awaitingResult: false,
        };
        if (ev.evidence === 'mcp_call') {
            row.invocations += 1;
            row.awaitingResult = true;
        } else {
            row.awaitingResult = false;
            row.lastOk = ev.ok;
            row.lastPreview = ev.preview ?? row.lastPreview;
        }
        mcpByTool.set(rec.toolName, row);
    }
    return { citations, searchCostUsd, mcpRows: [...mcpByTool.values()] };
}

export const ToolActivityStrip = memo(function ToolActivityStrip({
    toolCalls,
    isStreaming,
}: {
    toolCalls: PlaygroundToolCallRecord[];
    isStreaming: boolean;
}) {
    // Re-parsing every accumulated tool call (JSON.parse per record) is
    // real work that must not repeat on every streamed token — the parent
    // column re-renders on each token, so without this the whole history
    // got re-parsed dozens of times per turn instead of once per new call.
    const { citations, searchCostUsd, mcpRows } = useMemo(
        () => mergeEvidence(toolCalls),
        [toolCalls],
    );

    const hasWebSearch = searchCostUsd > 0 || citations.length > 0;
    if (!hasWebSearch && mcpRows.length === 0) return null;

    return (
        <div className="border-t border-sky-500/20 bg-sky-950/25 px-3 py-2 space-y-2">
            {hasWebSearch ? (
                <div className="flex items-start gap-2">
                    <Icon
                        name="globe"
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-400"
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-sky-300">
                            <span className="font-semibold">web_search</span>
                            <span className="text-sky-500/70 normal-case tracking-normal">
                                executed by gateway
                            </span>
                            {isStreaming ? (
                                <span className="ml-auto flex items-center gap-1 text-sky-400/80">
                                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400" />
                                    live
                                </span>
                            ) : null}
                        </div>
                        {searchCostUsd > 0 ? (
                            <p className="font-mono text-[10px] text-zinc-400">
                                search spend ${searchCostUsd.toFixed(4)}
                            </p>
                        ) : null}
                        {citations.length > 0 ? (
                            <ul className="space-y-0.5">
                                {citations.slice(0, 4).map((c) => (
                                    <li key={c.url} className="truncate font-mono text-[10px]">
                                        <a
                                            href={c.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-sky-400/90 underline-offset-2 hover:underline"
                                        >
                                            {c.title || c.url}
                                        </a>
                                    </li>
                                ))}
                                {citations.length > 4 ? (
                                    <li className="font-mono text-[10px] text-zinc-500">
                                        +{citations.length - 4} more source{citations.length - 4 === 1 ? '' : 's'}
                                    </li>
                                ) : null}
                            </ul>
                        ) : null}
                    </div>
                </div>
            ) : null}

            {mcpRows.length > 0 ? (
                <div className="flex items-start gap-2">
                    <Network className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-emerald-300">
                            <span className="font-semibold">MCP tools</span>
                            <span className="text-emerald-500/70 normal-case tracking-normal">
                                executed by workbench
                            </span>
                        </div>
                        {mcpRows.map((row) => (
                            <div key={row.tool} className="min-w-0">
                                <p className="font-mono text-[10px] text-zinc-200">
                                    <span className={row.lastOk ? 'text-emerald-300' : 'text-red-300'}>
                                        {row.awaitingResult ? '…' : row.lastOk ? '✓' : '✗'}
                                    </span>{' '}
                                    {row.tool}
                                    {row.invocations > 1 ? (
                                        <span className="text-zinc-500"> ×{row.invocations}</span>
                                    ) : null}
                                </p>
                                {row.lastPreview ? (
                                    <p className="truncate font-mono text-[10px] text-zinc-400">
                                        {row.lastPreview}
                                    </p>
                                ) : null}
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}
        </div>
    );
});
