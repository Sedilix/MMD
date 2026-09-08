'use client';

import React, { useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { Sparkles, Brain, LayoutTemplate, Mic, Dices } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ModelDropdown } from '@/components/playground/ModelDropdown';
import { ChipRow } from '@/components/playground/ChipRow';
import { cn } from '@/lib/utils';
import { GUEST_REQUEST_LIMIT } from '@/lib/playground/tier-config';
import { MAX_COLUMNS } from '@/lib/playground/workbench';
import { randomStarter } from '@/lib/playground/prompt-chips';
import type { ModelRegistryEntry, BuildSuggestion } from '@/lib/playground/types';

interface ColumnSlot {
    id: string;
    modelId: string;
}

/** Minimal Web Speech API surface (not in the default TS DOM lib). */
interface SpeechRecognitionLike {
    lang: string;
    interimResults: boolean;
    maxAlternatives: number;
    onresult: ((e: { results?: ArrayLike<ArrayLike<{ transcript?: string }>> }) => void) | null;
    onend: (() => void) | null;
    onerror: (() => void) | null;
    start(): void;
}

interface playgroundLandingProps {
    prompt: string;
    onPromptChange: (val: string) => void;
    onSend: (prompt: string, target: 'all' | 'selected') => void;
    mmdEnabled: boolean;
    onMmdEnabledChange: (enabled: boolean) => void;
    guestMode: boolean;
    guestQuota: number | null;
    guestModelId?: string;
    onGuestModelChange?: (modelId: string) => void;
    guestModels?: ModelRegistryEntry[];
    userModelId?: string;
    onUserModelChange?: (modelId: string) => void;
    userModels?: ModelRegistryEntry[];
    columns?: ColumnSlot[];
    onUpdateColumnModel?: (columnId: string, modelId: string) => void;
    onRemoveColumn?: (columnId: string) => void;
    onAddColumn?: () => void;
    /** Capability-chip lane (AI-inferred primary + static fallback). */
    showChips?: boolean;
    inferredChips?: BuildSuggestion[];
    inferredChipsLoading?: boolean;
    selectedStaticChips?: string[];
    selectedInferredChips?: string[];
    onToggleStaticChip?: (id: string) => void;
    onToggleInferredChip?: (title: string) => void;
}

const QUICK_STARTS = [
    "Write a landing page for a SaaS startup in React",
    "Explain quantum computing to a 5 year old",
    "Create a Python script to analyze CSV data",
    "Design a mobile app for plant care tracking"
];

export function PlaygroundLanding({
    prompt,
    onPromptChange,
    onSend,
    mmdEnabled,
    onMmdEnabledChange,
    guestMode,
    guestQuota,
    guestModelId,
    onGuestModelChange,
    guestModels,
    userModelId,
    onUserModelChange,
    userModels,
    columns = [],
    onUpdateColumnModel,
    onRemoveColumn,
    onAddColumn,
    showChips = false,
    inferredChips = [],
    inferredChipsLoading = false,
    selectedStaticChips = [],
    selectedInferredChips = [],
    onToggleStaticChip,
    onToggleInferredChip,
}: playgroundLandingProps) {
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSend(prompt, 'all');
        }
    };

    const handleQuickStart = (text: string) => {
        onPromptChange(text);
        onSend(text, 'all');
    };

    // "I'm Feeling Lucky" — the dice composes a starter idea into the input.
    const handleFeelingLucky = (): void => {
        onPromptChange(randomStarter());
    };

    // Speech-to-text mic (Web Speech API, zero-dep). The final transcript is
    // appended to the draft so dictation composes with typing.
    const [listening, setListening] = useState(false);
    const handleMic = (): void => {
        if (typeof window === 'undefined' || listening) return;
        const w = window as unknown as {
            SpeechRecognition?: new () => SpeechRecognitionLike;
            webkitSpeechRecognition?: new () => SpeechRecognitionLike;
        };
        const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
        if (!SR) return;
        const rec = new SR();
        rec.lang = 'en-US';
        rec.interimResults = false;
        rec.maxAlternatives = 1;
        setListening(true);
        rec.onresult = (e) => {
            const transcript = String(e.results?.[0]?.[0]?.transcript ?? '').trim();
            if (transcript) onPromptChange(prompt ? `${prompt} ${transcript}` : transcript);
        };
        rec.onend = () => setListening(false);
        rec.onerror = () => setListening(false);
        rec.start();
    };

    const modelSource = guestMode ? guestModels : userModels;
    const activeModelId = guestMode ? guestModelId : userModelId;
    const onModelChange = guestMode ? onGuestModelChange : onUserModelChange;

    const singleCol = columns[0];
    const singleModelId = singleCol?.modelId || activeModelId;
    const handleSingleModelChange = (id: string) => {
        if (singleCol && onUpdateColumnModel) {
            onUpdateColumnModel(singleCol.id, id);
        } else if (onModelChange) {
            onModelChange(id);
        }
    };

    return (
        <div className="flex flex-1 items-center justify-center p-4 overflow-hidden relative min-h-0">
            <div className="w-full max-w-3xl flex flex-col items-center gap-8 z-10 animate-in fade-in zoom-in-95 duration-500 pb-[10vh]">

                {/* Greeting */}
                <div className="text-center space-y-2">
                    {guestMode ? (
                        <h1 className="text-2xl sm:text-3xl font-medium tracking-tight text-white flex items-center justify-center gap-2">
                            You have {guestQuota !== null ? guestQuota : GUEST_REQUEST_LIMIT} free credits for your first prompt
                            <Sparkles className="h-5 w-5 text-amber-400" />
                        </h1>
                    ) : (
                        <h1 className="text-2xl sm:text-3xl font-medium tracking-tight text-white">
                            Welcome Back! Ready to Play?
                        </h1>
                    )}
                    {!guestMode && (
                        <p className="text-sm text-white bg-white/10 backdrop-blur-md px-4 py-1.5 rounded-full border border-white/20 shadow-sm">
                            Ever thought of combining minds? - Try MMD (Multi-Model Discussion)
                        </p>
                    )}
                </div>

                {/* Main Input Area */}
                <div className="w-full relative bg-white/10 dark:bg-white/5 backdrop-blur-sm border border-white/20 shadow-2xl rounded-2xl overflow-hidden mx-4 sm:mx-0">

                    {/* Tabs */}
                    {!guestMode && (
                        <div className="flex bg-white/5 border-b border-white/15 p-1 gap-1">
                            <button
                                type="button"
                                onClick={() => onMmdEnabledChange(false)}
                                className={cn(
                                    "flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium transition-colors",
                                    !mmdEnabled
                                        ? "bg-white/15 text-white shadow-sm"
                                        : "text-white hover:bg-white/10"
                                )}
                            >
                                <LayoutTemplate className="h-3.5 w-3.5" />
                                Single Model
                            </button>
                            <button
                                type="button"
                                onClick={() => onMmdEnabledChange(true)}
                                className={cn(
                                    "flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium transition-colors",
                                    mmdEnabled
                                        ? "bg-emerald-600/70 text-white shadow-sm"
                                        : "text-purple-500 hover:bg-white/10 hover:text-purple-400"
                                )}
                            >
                                <Brain className="h-3.5 w-3.5" />
                                Multi-Model (MMD)
                            </button>
                        </div>
                    )}

                    {showChips && (
                        <ChipRow
                            inferred={inferredChips}
                            inferredLoading={inferredChipsLoading}
                            guestMode={guestMode}
                            selectedStatic={selectedStaticChips}
                            selectedInferred={selectedInferredChips}
                            onToggleStatic={(id) => onToggleStaticChip?.(id)}
                            onToggleInferred={(t) => onToggleInferredChip?.(t)}
                        />
                    )}

                    <div className="p-2 sm:p-4 pb-2">
                        <Textarea
                            id="playground-prompt-input"
                            value={prompt}
                            onChange={(e) => onPromptChange(e.target.value)}
                            onKeyDown={handleKeyDown}
                            className={cn(
                                "min-h-[120px] text-base resize-none border-0 shadow-none focus-visible:ring-0 p-2 bg-transparent text-white placeholder:text-white/60",
                            )}
                            placeholder={guestMode
                                ? "Build me a Forex market analysis tool that..."
                                : (mmdEnabled ? "Prompt all columns... (Cmd/Ctrl+Enter)" : "Ask anything — or describe the app you want to build...")}
                        />
                        <div className="flex flex-wrap items-center justify-between gap-3 mt-2 px-2">
                            {mmdEnabled ? (
                                <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
                                    {columns.length > 0 ? (
                                        columns.map((col) => (
                                            <div key={col.id} className="flex items-center gap-1">
                                                <ModelDropdown
                                                    models={modelSource || []}
                                                    value={col.modelId}
                                                    onChange={(id) => onUpdateColumnModel?.(col.id, id)}
                                                    guestMode={guestMode}
                                                    showCapabilities={false}
                                                />
                                                {columns.length > 1 && onRemoveColumn && (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            onRemoveColumn(col.id);
                                                        }}
                                                        className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 transition-colors text-xs cursor-pointer"
                                                        title="Remove model selector"
                                                    >
                                                        <Icon name="close-md" className="h-3.5 w-3.5" />
                                                    </button>
                                                )}
                                            </div>
                                        ))
                                    ) : (
                                        singleModelId && modelSource && (
                                            <ModelDropdown
                                                models={modelSource}
                                                value={singleModelId}
                                                onChange={handleSingleModelChange}
                                                guestMode={guestMode}
                                                showCapabilities={true}
                                            />
                                        )
                                    )}

                                    {columns.length < MAX_COLUMNS && onAddColumn && (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                onAddColumn();
                                            }}
                                            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-white hover:bg-white/10 hover:scale-105 transition-all cursor-pointer"
                                            title="Add model selector"
                                        >
                                            <Icon name="plus" className="h-4 w-4 stroke-[2.5]" />
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    {singleModelId && modelSource ? (
                                        <ModelDropdown
                                            models={modelSource}
                                            value={singleModelId}
                                            onChange={handleSingleModelChange}
                                            guestMode={guestMode}
                                            showCapabilities={true}
                                        />
                                    ) : (
                                        onAddColumn && (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={onAddColumn}
                                                className="h-6 px-2.5 rounded-md border-dashed border-white/20 bg-white/5 text-[10px] font-semibold text-white hover:text-white hover:bg-white/10"
                                            >
                                                + Add column
                                            </Button>
                                        )
                                    )}
                                </div>
                            )}

                            <button
                                type="button"
                                onClick={handleFeelingLucky}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white hover:scale-105 transition-all cursor-pointer"
                                title="I'm Feeling Lucky — draft a starter idea"
                            >
                                <Dices className="h-4 w-4" />
                            </button>
                            <button
                                type="button"
                                onClick={handleMic}
                                className={cn(
                                    "inline-flex h-7 w-7 items-center justify-center rounded-full transition-all cursor-pointer",
                                    listening ? "text-rose-400 bg-rose-500/20 animate-pulse" : "text-white/70 hover:bg-white/10 hover:text-white"
                                )}
                                title="Dictate your prompt (speech-to-text)"
                            >
                                <Mic className="h-4 w-4" />
                            </button>
                            <Button
                                type="button"
                                size="sm"
                                disabled={prompt.trim().length === 0}
                                onClick={() => onSend(prompt, 'all')}
                                className={cn(
                                    "h-9 w-9 p-0 rounded-full shadow-sm transition-all flex-shrink-0 border ml-auto",
                                    prompt.trim().length > 0
                                        ? "bg-white/20 hover:bg-white/30 text-white border-white/20 hover:scale-105"
                                        : "bg-white/5 text-white/30 border-white/10"
                                )}
                            >
                                <Icon name="paper-plane" className="h-4 w-4 text-emerald-400" />
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Quick Starts */}
                <div className="w-full flex flex-col items-center gap-4">
                    <div className="text-[10px] text-white bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/20 shadow-sm uppercase tracking-widest flex items-center gap-2">
                        <Icon name="arrow-down-md" className="h-3 w-3 text-amber-400" />
                        Not sure where to start? Try these
                        <Icon name="arrow-down-md" className="h-3 w-3 text-amber-400" />
                    </div>
                    <div className="flex flex-wrap justify-center gap-2 sm:gap-3 max-w-2xl">
                        {QUICK_STARTS.map((text, i) => (
                            <button
                                key={i}
                                onClick={() => handleQuickStart(text)}
                                className="px-4 py-2 rounded-full border border-white/15 bg-white/5 backdrop-blur-md text-[11px] sm:text-xs text-white hover:text-white hover:bg-white/10 hover:border-white/25 transition-all whitespace-nowrap shadow-sm"
                            >
                                {text}
                            </button>
                        ))}
                    </div>
                </div>

            </div>
        </div>
    );
}

