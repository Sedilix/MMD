'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Icon } from '@/components/ui/icon';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { MMDConfig, ModelRegistryEntry } from '@/lib/playground/types';
import { UsePlaygroundStreamResult } from '@/lib/playground/hooks/usePlaygroundStream';
import { formatMsrpUsd } from '@/lib/playground/tier-config';
import { Brain, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ContextRadial } from './ContextRadial';

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    
    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
        }
    };

    return (
        <button
            type="button"
            onClick={handleCopy}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-all hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
            title="Copy response"
        >
            {copied ? (
                <Icon name="check" className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
                <Icon name="copy" className="h-3.5 w-3.5" />
            )}
        </button>
    );
}

interface MMDColumnProps {
    config: MMDConfig;
    state: 'idle' | 'running' | 'synthesizing' | 'done' | 'error';
    round: number;
    stream: UsePlaygroundStreamResult;
    model?: ModelRegistryEntry;
    onConfigClick: () => void;
}

export function MMDColumn({
    config,
    state,
    round,
    stream,
    model,
    onConfigClick,
}: MMDColumnProps) {
    const isStreaming = stream.state === 'streaming' || stream.state === 'connecting';
    const isError = stream.state === 'error';

    const scrollRef = useRef<HTMLDivElement>(null);

    // Smart auto-scroll: only scrolls when the user is near the bottom.
    // Targets the Radix ScrollArea viewport directly so it cannot cascade
    // to ancestor scroll containers or hijack the page scroll.
    useEffect(() => {
        const sentinel = scrollRef.current;
        if (!sentinel) return;
        const viewport = sentinel.closest('[data-radix-scroll-area-viewport]') ||
            sentinel.parentElement?.querySelector('[data-radix-scroll-area-viewport]');
        if (viewport) {
            const isNearBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 150;
            if (isNearBottom) {
                viewport.scrollTop = viewport.scrollHeight;
            }
        } else {
            sentinel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }, [stream.messages, stream.content, stream.reasoning, state]);

    const borderClass = isError
        ? 'border-destructive/40 shadow-sm'
        : isStreaming || state === 'running' || state === 'synthesizing'
            ? 'border-sky-400/40 shadow-[0_0_12px_rgba(56,189,248,0.25)]'
            : 'border-white/20';

    const hasMessages = stream.messages.length > 0 || stream.content.length > 0 || stream.state === 'streaming' || stream.state === 'connecting' || stream.state === 'error' || state === 'running' || state === 'synthesizing';

    return (
        <Card
            id="column-mmd-chair"
            className={cn(
                'flex flex-col overflow-hidden transition-all duration-300 bg-sky-500/10 dark:bg-sky-500/5 backdrop-blur-sm border border-sky-400/25 shadow-2xl text-foreground',
                'h-full min-h-0',
                borderClass,
            )}
        >
            {/* Header */}
            <div className="flex items-center gap-2 border-b border-sky-400/15 bg-sky-400/10 px-3 py-2">
                <div className="flex items-center gap-1.5">
                    <Brain className="h-4 w-4 text-sky-400" />
                    <span className="text-xs font-bold uppercase tracking-wider text-white">
                        MMD Chairman
                    </span>
                    <Badge variant="outline" className="text-[9px] border-sky-400/40 bg-sky-500/10 text-sky-200 px-1 py-0 h-4 uppercase">
                        {model?.displayName || 'Synthesizer'}
                    </Badge>
                </div>

                <div className="ml-auto flex items-center gap-1">
                    <button
                        type="button"
                        onClick={onConfigClick}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-brand-500/50 bg-zinc-950 text-brand-300 shadow-md transition-all hover:bg-brand-950 hover:border-brand-400 hover:text-brand-200 hover:shadow-[0_0_12px_rgba(216,166,87,0.35)] focus:outline-none"
                        aria-label="MMD Settings"
                        title="MMD Settings"
                    >
                        <Icon name="settings" className="h-3.5 w-3.5" aria-hidden />
                    </button>
                </div>
            </div>

            {/* Status bar */}
            <div className="bg-sky-500/10 px-3 py-1.5 border-b border-sky-400/15 flex items-center justify-between text-[11px] font-medium text-white">
                <span className="flex items-center gap-1.5 text-white">
                    {state === 'idle' && 'MMD: Socratic Vetting Ready'}
                    {state === 'running' && (
                        <>
                            <Icon name="loading" className="h-3 w-3 animate-spin text-sky-400" />
                            {config.discussionType === 'multi' ? `Round ${round}/${config.rounds}: Socratic Vetting Active...` : 'Gathering responses...'}
                        </>
                    )}
                    {state === 'synthesizing' && (
                        <>
                            <Icon name="loading" className="h-3 w-3 animate-spin text-sky-400" />
                            Synthesizing Vetted Consensus...
                        </>
                    )}
                    {state === 'done' && '🟢 Consensus Vetted & Complete'}
                    {state === 'error' && 'Synthesis failed'}
                </span>
                <span className="text-[10px] text-white font-semibold">
                    {config.discussionType === 'multi' ? `Multi-Round (${config.rounds})` : 'Single-Pass'}
                </span>
            </div>

            {/* Content area */}
            <CardContent className="p-0 min-h-0 relative flex-1 overflow-hidden flex flex-col">
                {hasMessages ? (
                    <div className="absolute inset-0">
                        <ScrollArea className="h-full">
                            <div className="px-3 py-3">
                                {/* Discussion metadata / settings card */}
                                {stream.messages.length === 0 && stream.content.length === 0 && (
                                    <div className="mb-4 rounded-md border border-white/15 bg-white/5 p-3 text-xs text-zinc-100 space-y-2">
                                        <p className="font-semibold flex items-center gap-1.5 text-sky-300">
                                            <Icon name="info" className="h-3.5 w-3.5" />
                                            Active Discussion Session
                                        </p>
                                        <div className="space-y-1 font-mono text-[10px] text-zinc-300">
                                            <div>Type: {config.discussionType === 'multi' ? `Multi-Round (${config.rounds} rds)` : 'Single Round'}</div>
                                            <div>Inclusion: {config.mode === 'default' ? 'All active models' : `${config.selectedColumnIds.length} selected`}</div>
                                            <div>Observer: {config.includeOneObserver ? 'One (Passive)' : 'None'}</div>
                                        </div>
                                    </div>
                                )}

                                {/* Prior turn history (each synthesis turn) */}
                                {stream.messages.map((msg, idx) => (
                                    <div key={idx} className="mb-4">
                                        {msg.role === 'user' ? (
                                            <div className="whitespace-pre-wrap break-words rounded-md border border-white/15 bg-white/5 p-3 text-[11px] font-mono leading-relaxed text-zinc-300">
                                                <div className="font-sans font-bold uppercase tracking-wider text-[9px] text-sky-300 mb-1 flex items-center gap-1">
                                                    <Icon name="message" className="h-3 w-3" />
                                                    MMD Protocol Context
                                                </div>
                                                {msg.content.slice(0, 300)}...
                                            </div>
                                        ) : (
                                            <>
                                                {msg.reasoning && msg.reasoning.trim().length > 0 ? (
                                                    <Accordion
                                                        type="single"
                                                        collapsible
                                                        className="mb-2 rounded-md border border-border bg-muted/30"
                                                    >
                                                        <AccordionItem value={`thinking-${idx}`} className="border-0">
                                                            <AccordionTrigger className="px-3 py-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground hover:no-underline">
                                                                <span className="flex items-center gap-2">
                                                                    <Brain className="h-3.5 w-3.5 text-primary" aria-hidden />
                                                                    Thinking (Chairman)
                                                                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-mono normal-case text-foreground">
                                                                        {msg.reasoning.length.toLocaleString()} chars
                                                                    </span>
                                                                </span>
                                                            </AccordionTrigger>
                                                            <AccordionContent className="px-3 pb-3">
                                                                <pre className="custom-scrollbar max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-background/60 p-3 font-mono text-[11px] leading-relaxed text-foreground/80">
                                                                    {msg.reasoning}
                                                                </pre>
                                                            </AccordionContent>
                                                        </AccordionItem>
                                                    </Accordion>
                                                ) : null}
                                                <div className="relative group rounded-md border border-sky-500/25 bg-background p-4 pr-9 leading-relaxed text-foreground text-xs shadow-sm">
                                                    <div className="absolute top-2 right-2 flex items-center gap-1 text-[9px] uppercase font-bold tracking-wider text-sky-600/60 font-mono">
                                                        <Sparkles className="h-3 w-3 text-sky-400" />
                                                        Synthesis R{Math.floor(idx / 2) + 1}
                                                    </div>
                                                    <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap break-words [overflow-wrap:anywhere] [word-break:break-word]">
                                                        {msg.content}
                                                    </div>
                                                    <div className="absolute right-2 bottom-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <CopyButton text={msg.content} />
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ))}

                                {/* Stream thinking delta */}
                                {stream.reasoning.trim().length > 0 ? (
                                    <Accordion
                                        type="single"
                                        collapsible
                                        className="mb-3 rounded-md border border-border bg-muted/30"
                                    >
                                        <AccordionItem value="thinking" className="border-0">
                                            <AccordionTrigger className="px-3 py-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground hover:no-underline">
                                                <span className="flex items-center gap-2">
                                                    <Brain className="h-3.5 w-3.5 text-primary" aria-hidden />
                                                    Thinking (Chairman)
                                                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-mono normal-case text-foreground">
                                                        {stream.reasoning.length.toLocaleString()} chars
                                                    </span>
                                                </span>
                                            </AccordionTrigger>
                                            <AccordionContent className="px-3 pb-3">
                                                <pre className="custom-scrollbar max-h-72 overflow-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere] [word-break:break-word] rounded-md border border-border bg-background/60 p-3 font-mono text-[11px] leading-relaxed text-foreground/80">
                                                    {stream.reasoning}
                                                </pre>
                                            </AccordionContent>
                                        </AccordionItem>
                                    </Accordion>
                                ) : null}

                                {/* Stream text content delta */}
                                {stream.content.trim().length > 0 ? (
                                    <div className="relative group rounded-md border border-sky-500/25 bg-background p-4 pr-9 leading-relaxed text-foreground text-xs shadow-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere] [word-break:break-word]">
                                        {stream.content}
                                        <div className="absolute right-2 bottom-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <CopyButton text={stream.content} />
                                        </div>
                                    </div>
                                ) : null}

                                {/* Error state */}
                                {isError ? (
                                    <div className="rounded-md border border-destructive/60 bg-destructive/10 p-3 text-xs text-destructive">
                                        <div className="mb-1 flex items-center gap-2 font-semibold">
                                            <Icon name="info" className="h-3.5 w-3.5" aria-hidden />
                                            Synthesis Error
                                        </div>
                                        <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] [word-break:break-word]">
                                            {stream.errorMessage ?? 'Chairman failed to synthesize consensus.'}
                                        </div>
                                    </div>
                                ) : null}
                                <div ref={scrollRef} />
                            </div>
                        </ScrollArea>
                    </div>
                ) : (
                    <div className="p-3 flex-1 min-h-0 flex flex-col justify-between overflow-y-auto">
                        {/* Discussion metadata / settings card */}
                        <div className="rounded-md border border-white/15 bg-white/5 p-3 text-xs text-zinc-100 space-y-2">
                            <p className="font-semibold flex items-center gap-1.5 text-sky-300">
                                <Icon name="info" className="h-3.5 w-3.5" />
                                Active Discussion Session
                            </p>
                            <div className="space-y-1 font-mono text-[10px] text-zinc-300">
                                <div>Type: {config.discussionType === 'multi' ? `Multi-Round (${config.rounds} rds)` : 'Single Round'}</div>
                                <div>Inclusion: {config.mode === 'default' ? 'All active models' : `${config.selectedColumnIds.length} selected`}</div>
                                <div>Observer: {config.includeOneObserver ? 'One (Passive)' : 'None'}</div>
                            </div>
                        </div>

                        {/* Empty state */}
                        {stream.state === 'idle' && stream.messages.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-4 my-auto text-center">
                                <Brain className="h-10 w-10 text-sky-400 mb-2" />
                                <h3 className="text-xs font-bold text-white">MMD Chairman Ready</h3>
                                <p className="text-[11px] text-white/90 font-medium max-w-[220px] mt-1">
                                    Submit a prompt below to launch debate and synthesis.
                                </p>
                            </div>
                        )}

                        {/* Connection indicator */}
                        {stream.state === 'connecting' && (
                            <div className="flex flex-col items-center justify-center py-4 my-auto text-center">
                                <Icon name="loading" className="h-8 w-8 animate-spin text-sky-500 mb-2" />
                                <h3 className="text-xs font-bold text-foreground">Chairman Connecting</h3>
                                <p className="text-[11px] text-muted-foreground mt-1">
                                    Acquiring context & building consensus...
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </CardContent>

            {/* Telemetry */}
            <div className="grid grid-cols-4 gap-1 border-t border-white/15 bg-white/5 px-3 py-2 text-[10px] uppercase tracking-wider text-blue-400">
                <div className="flex flex-col items-center text-center">
                    <span className="text-[8px] font-semibold text-blue-400">TTFT</span>
                    <span className="font-mono text-foreground">{stream.ttftMs !== null ? `${stream.ttftMs}ms` : '—'}</span>
                </div>
                <div className="flex flex-col items-center text-center">
                    <span className="text-[8px] font-semibold text-blue-400">Speed</span>
                    <span className="font-mono text-foreground">{isStreaming ? `${stream.tokensPerSec.toFixed(0)} t/s` : '—'}</span>
                </div>
                <div className="flex flex-col items-center text-center">
                    <span className="text-[8px] font-semibold text-blue-400">Tokens</span>
                    <span className="font-mono text-foreground">{stream.tokensSoFar.toLocaleString()}</span>
                </div>
                <div className="flex flex-col items-center text-center">
                    <span className="text-[8px] font-semibold text-blue-400">Cost</span>
                    <span className="font-mono text-foreground">{stream.costSoFar.toFixed(2)} credits</span>
                </div>
            </div>

            {(() => {
                const totalTokens = stream.inputTokens + stream.outputTokens;
                const contextLimit = model?.maxTokens || 4096;
                const contextPercent = Math.min(100, Math.round((totalTokens / contextLimit) * 100));
                return (
                    <div className="flex items-center gap-2 border-t border-white/15 bg-white/5 px-3 py-2 text-xs">
                        <ContextRadial
                            usedTokens={totalTokens}
                            maxTokens={contextLimit}
                            size={16}
                            strokeWidth={2}
                            showPercentLabel={false}
                            tooltipPosition="top"
                        />
                        <span className="text-[11px] font-mono text-zinc-300" title="Estimated retail market cost">
                            {contextPercent}% · {formatMsrpUsd(stream.costSoFar)} (MSRP)
                        </span>
                    </div>
                );
            })()}
        </Card>
    );
}
