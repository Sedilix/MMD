'use client';

/**
 * Renders an assistant turn, lifting the legacy `[TOOL: name(args)]`
 * directives out of the prose into structured "execution sandbox" blocks.
 * Returns JSX because the tool blocks are styled cards, not plain text.
 *
 * Honesty note: these cards display the directive the model emitted —
 * nothing more. Real tool executions (the gateway web-search loop) are
 * surfaced by `tool_call` SSE events and rendered by `ToolActivityStrip`;
 * this renderer never fabricates success output.
 */

import { Icon } from '@/components/ui/icon';

export function formatMessageContent(content: string) {
    const regex = /\[TOOL:\s*(\w+)\((.*?)\)\]/g;

    const parts: Array<string | { type: 'tool'; name: string; args: string }> = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(content)) !== null) {
        const index = match.index;
        if (index > lastIndex) {
            parts.push(content.substring(lastIndex, index));
        }

        parts.push({
            type: 'tool',
            name: match[1],
            args: match[2]
        });

        lastIndex = regex.lastIndex;
    }

    if (lastIndex < content.length) {
        parts.push(content.substring(lastIndex));
    }

    if (parts.length === 0) {
        return (
            <pre className="custom-scrollbar whitespace-pre-wrap break-words [overflow-wrap:anywhere] [word-break:break-word] rounded-md border border-border bg-background/40 p-3 pr-9 font-mono text-[12px] leading-relaxed text-foreground">
                {content}
            </pre>
        );
    }

    return (
        <div className="space-y-3">
            {parts.map((p, i) => {
                if (typeof p === 'string') {
                    if (p.trim().length === 0) return null;
                    return (
                        <pre key={i} className="custom-scrollbar whitespace-pre-wrap break-words [overflow-wrap:anywhere] [word-break:break-word] rounded-md border border-border bg-background/40 p-3 pr-9 font-mono text-[12px] leading-relaxed text-foreground">
                            {p}
                        </pre>
                    );
                }

                const isSearch = p.name.toLowerCase().includes('search');
                return (
                    <div key={i} className="my-2 rounded-lg border border-zinc-800 bg-zinc-950 font-mono text-[11px] overflow-hidden text-zinc-300">
                        <div className="flex items-center justify-between bg-zinc-900 px-3 py-1.5 border-b border-zinc-800">
                            <div className="flex items-center gap-2">
                                {isSearch ? <Icon name="globe" className="h-3.5 w-3.5 text-sky-400" /> : <Icon name="terminal" className="h-3.5 w-3.5 text-purple-400" />}
                                <span className="font-semibold text-zinc-200">{p.name}({p.args})</span>
                            </div>
                            <span className="text-[9px] text-zinc-500 uppercase tracking-widest">Execution Sandbox</span>
                        </div>
                        <div className="p-3 space-y-1 bg-zinc-950 text-left">
                            <p className="text-zinc-500">&gt; Tool directive captured</p>
                            <p className="text-zinc-400 text-[10px] leading-relaxed">
                                {isSearch
                                    ? 'Live web searches run in the gateway tool loop — see the tool activity feed below for actual executions and sources.'
                                    : 'Command execution is not wired yet; enabled tools surface real results through the tool activity feed.'}
                            </p>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
