'use client';

import { useState, useRef, useEffect } from 'react';
import { Icon } from '@/components/ui/icon';
// Video has no coolicons equivalent, so the attach menu stores each icon
// as a render function — the one shape that carries both libraries while
// still taking the per-entry colour class.
import { Video, Wrench, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { ModelRegistryEntry } from '@/lib/playground/types';
import type { ParamValues } from '@/components/playground/ParamsSidebar';
import { ModelDropdown } from './ModelDropdown';
import { ModeDropdown } from './ModeDropdown';
import { ThinkingPowerSelector } from './ThinkingPowerSelector';
import { ThinkingDrawer } from './ThinkingDrawer';

interface DockAttachment {
    id: string;
    dataUrl: string;
    name?: string;
    mimeType: string;
}

interface HermesCardProps {
    columnId: string;
    modelId: string;
    models: ModelRegistryEntry[];
    guestMode: boolean;
    messages: Array<{ role: 'user' | 'assistant'; content: string; attachments?: DockAttachment[] }>;
    content: string;
    isStreaming: boolean;
    tokensSoFar: number;
    ttftMs: number | null;
    reasoningEffort: 'none' | 'light' | 'standard' | 'xhigh';
    thinkingDrawerOpen: boolean;
    skillsDropdownOpen: boolean;
    enabledSkillIds: string[];
    allSkills: Array<{ id: string; name: string; description: string }>;
    lockedModelName: string | null;
    guestQuota: { used: number; limit: number } | null;
    paramValues: ParamValues;
    onModelChange: (modelId: string) => void;
    onThinkingDrawerToggle: () => void;
    onThinkingDrawerClose: () => void;
    onThinkingChange: (level: 'none' | 'light' | 'standard' | 'xhigh') => void;
    onSkillsToggle: () => void;
    onSkillToggle: (skillId: string) => void;
    onRemove: () => void;
    onCodeOpen: () => void;
    onParamChange: (values: ParamValues) => void;
    onApplyToAllChange: (apply: boolean) => void;
    onOpenSystemPrompt: () => void;
    onThinkingDrawerOpen: (open: boolean) => void;
    onTogglePreview?: () => void;
    isPreviewActive?: boolean;
    scrollRef?: React.RefObject<HTMLDivElement>;
}

/**
 * Hermes-style single-model chat card.
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────────┐
 *   │ TOOLBAR: model · thinking · skills ........ quota    │  ← 48px
 *   ├─────────────────────────────────────────────────────┤
 *   │                                                     │
 *   │                   CHAT HISTORY                      │  ← flex-1
 *   │                (ScrollArea)                       │
 *   │                                                     │
 *   ├─────────────────────────────────────────────────────┤
 *   │ [+] [THINK] [SKILLS] [⚙]   │ textarea  [📤]       │  ← ~80px
 *   └─────────────────────────────────────────────────────┘
 */
export function HermesCard({
    columnId,
    modelId,
    models,
    guestMode,
    messages,
    content,
    isStreaming,
    tokensSoFar,
    ttftMs,
    reasoningEffort,
    thinkingDrawerOpen,
    skillsDropdownOpen,
    enabledSkillIds,
    allSkills,
    lockedModelName,
    guestQuota,
    paramValues,
    onModelChange,
    onThinkingDrawerToggle,
    onThinkingDrawerClose,
    onThinkingChange,
    onSkillsToggle,
    onSkillToggle,
    onRemove,
    onCodeOpen,
    onParamChange,
    onApplyToAllChange,
    onOpenSystemPrompt,
    onTogglePreview,
    isPreviewActive,
    scrollRef,
}: HermesCardProps) {
    const model = models.find((m) => m.id === modelId);
    const [promptText, setPromptText] = useState('');
    const [promptDragOver, setPromptDragOver] = useState(false);
    const [attachMenuOpen, setAttachMenuOpen] = useState(false);
    const [attachments, setAttachments] = useState<DockAttachment[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const thinkingContainerRef = useRef<HTMLDivElement>(null);
    const skillsContainerRef = useRef<HTMLDivElement>(null);

    const hasMessages = messages.length > 0 || content.length > 0 || isStreaming;
    const borderClass = 'border-white/20';

    // Quota display
    const quotaUsed = guestQuota ? guestQuota.used : 0;
    const quotaLimit = guestQuota ? guestQuota.limit : 0;
    const quotaPct = quotaLimit > 0 ? Math.min(100, Math.round((quotaUsed / quotaLimit) * 100)) : 0;

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + 'px';
        }
    }, [promptText]);

    // Close drawers on outside click
    useEffect(() => {
        if (!thinkingDrawerOpen && !skillsDropdownOpen) return;
        const onClick = (e: MouseEvent) => {
            const target = e.target as Node;
            if (
                thinkingDrawerOpen &&
                thinkingContainerRef.current &&
                !thinkingContainerRef.current.contains(target)
            ) {
                onThinkingDrawerClose();
            }
            if (
                skillsDropdownOpen &&
                skillsContainerRef.current &&
                !skillsContainerRef.current.contains(target)
            ) {
                onSkillsToggle();
            }
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onThinkingDrawerClose();
                onSkillsToggle();
            }
        };
        document.addEventListener('mousedown', onClick);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onClick);
            document.removeEventListener('keydown', onKey);
        };
    }, [thinkingDrawerOpen, skillsDropdownOpen, onThinkingDrawerClose, onSkillsToggle]);

    return (
        <div className="relative flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border bg-white/10 shadow-2xl backdrop-blur-sm dark:bg-white/5">
            {/* ─── TOP TOOLBAR ────────────────────────────────────────────── */}
            <div className="flex h-12 items-center justify-between gap-1.5 border-b border-white/15 bg-white/5 px-2.5 min-w-0">
                {/* Left group: Model Selector */}
                <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
                    <div className="min-w-0 flex-1 shrink">
                        <ModelDropdown
                            models={models}
                            value={modelId}
                            onChange={onModelChange}
                            guestMode={guestMode}
                            showCapabilities={false}
                            className="w-full"
                            maxWidth="100%"
                        />
                    </div>
                </div>

                {/* Right group: Actions & Remove */}
                <div className="flex items-center gap-1 shrink-0 z-10">
                    {/* Thinking button + drawer */}
                    <div ref={thinkingContainerRef} className="relative hidden xl:block">
                        <button
                            type="button"
                            onClick={onThinkingDrawerToggle}
                            className={cn(
                                'flex items-center gap-1 rounded-full border px-2 h-6 text-[10px] font-semibold transition-all',
                                reasoningEffort !== 'none'
                                    ? 'bg-brand-400/15 border-brand-400/40 text-brand-300'
                                    : 'bg-zinc-900/80 border-white/15 text-white/60 hover:border-white/30 hover:text-white',
                            )}
                            title="Change thinking effort"
                        >
                            <Zap className="h-3 w-3" />
                            <span>
                                {reasoningEffort === 'none' ? 'OFF' : reasoningEffort === 'light' ? 'Light' : reasoningEffort === 'standard' ? 'Med' : 'High'}
                            </span>
                        </button>
                        <ThinkingDrawer
                            value={reasoningEffort}
                            onChange={onThinkingChange}
                            open={thinkingDrawerOpen}
                            onClose={onThinkingDrawerClose}
                        />
                    </div>

                    {/* Settings / Params */}
                    <button
                        type="button"
                        onClick={onCodeOpen}
                        className="flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-zinc-900/80 text-white/60 hover:border-white/30 hover:text-white transition-all shrink-0"
                        title="Parameters"
                    >
                        <Icon name="settings" className="h-3 w-3" />
                    </button>

                    {/* Get Code */}
                    <button
                        type="button"
                        onClick={onCodeOpen}
                        className="flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-zinc-900/80 text-white/60 hover:border-white/30 hover:text-white transition-all shrink-0"
                        title="Get code snippet & export"
                    >
                        <Icon name="code" className="h-3 w-3" />
                    </button>

                    {/* Preview Flag Toggle */}
                    {onTogglePreview && (
                        <button
                            type="button"
                            onClick={onTogglePreview}
                            className={cn(
                                'flex h-6 items-center gap-1 rounded-full border px-2 text-[10px] font-semibold transition-all shrink-0',
                                isPreviewActive
                                    ? 'bg-sky-500/20 border-sky-400/50 text-sky-300 shadow-[0_0_10px_rgba(56,189,248,0.2)]'
                                    : 'bg-zinc-900/80 border-white/15 text-white/60 hover:border-white/30 hover:text-white',
                            )}
                            title="Toggle / Expand Live Preview Pane"
                        >
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse" />
                            <span>Preview</span>
                        </button>
                    )}

                    {/* Quota bar */}
                    {guestQuota && quotaLimit > 0 && (
                        <div className="hidden lg:flex items-center gap-1.5 shrink-0">
                            <div className="h-1.5 w-12 overflow-hidden rounded-full bg-white/10">
                                <div
                                    className={cn(
                                        'h-full rounded-full transition-all',
                                        quotaPct > 80 ? 'bg-rose-500' : quotaPct > 50 ? 'bg-amber-500' : 'bg-brand-400',
                                    )}
                                    style={{ width: `${quotaPct}%` }}
                                />
                            </div>
                            <span className="text-[9px] font-mono text-white/40 tabular-nums">
                                {quotaUsed}/{quotaLimit}
                            </span>
                        </div>
                    )}

                    {/* Remove */}
                    <button
                        type="button"
                        onClick={onRemove}
                        className="flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-zinc-900/80 text-white/60 hover:border-rose-500/50 hover:text-rose-400 transition-all shrink-0 ml-0.5"
                        title="Remove column"
                    >
                        <Icon name="close-md" className="h-3 w-3" />
                    </button>
                </div>
            </div>

            {/* ─── CHAT HISTORY ───────────────────────────────────────────── */}
            <div className="flex-1 overflow-hidden">
                {hasMessages ? (
                    <ScrollArea className="h-full">
                        <div className="px-4 py-4 space-y-4">
                            {lockedModelName && (
                                <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-xs text-amber-200">
                                    <span className="mt-0.5 shrink-0 font-semibold text-amber-100">Guest mode:</span>
                                    <span>Switched to a guest-access model. <span className="font-semibold text-amber-100">{lockedModelName}</span> requires sign-in.</span>
                                </div>
                            )}
                            {messages.map((msg, i) => (
                                <div key={i} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                                    <div
                                        className={cn(
                                            'max-w-[95%] min-w-0 rounded-2xl px-4 py-3 text-sm leading-relaxed break-words [overflow-wrap:anywhere] [word-break:break-word]',
                                            msg.role === 'user'
                                                ? 'bg-brand-600/40 text-white border border-brand-500/20'
                                                : 'bg-white/10 text-zinc-100 border border-white/10',
                                        )}
                                    >
                                        <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] [word-break:break-word]">{msg.content}</p>
                                    </div>
                                </div>
                            ))}
                            {content && (
                                <div className="flex justify-start">
                                    <div className="max-w-[95%] min-w-0 rounded-2xl bg-white/10 px-4 py-3 text-sm leading-relaxed text-zinc-100 border border-white/10 break-words [overflow-wrap:anywhere] [word-break:break-word]">
                                        <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] [word-break:break-word]">{content}</p>
                                        <span className="mt-1 inline-block h-4 w-4 animate-pulse rounded-full bg-white/20" />
                                    </div>
                                </div>
                            )}
                        </div>
                        <div ref={scrollRef} />
                    </ScrollArea>
                ) : (
                    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
                        <p className="text-sm font-medium text-white/40">
                            {model?.displayName ?? 'Select a model'}
                        </p>
                        <p className="mt-1 text-xs text-white/25">
                            Send a message to start the conversation
                        </p>
                    </div>
                )}
            </div>

            {/* ─── PROMPT INPUT ───────────────────────────────────────────── */}
            <div className="border-t border-white/15 p-3">
                {/* Attachment pills */}
                {attachments.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1.5">
                        {attachments.map((att) => (
                            <div
                                key={att.id}
                                className="relative group"
                            >
                                <div className="relative h-10 w-10 overflow-hidden rounded-md border border-white/20 bg-black/40">
                                    {att.mimeType.startsWith('image/') ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={att.dataUrl} alt={att.name ?? ''} className="h-full w-full object-cover" />
                                    ) : (
                                        <div className="flex h-full w-full items-center justify-center">
                                            <Icon name="file-document" className="h-4 w-4 text-white/40" />
                                        </div>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => setAttachments((p) => p.filter((a) => a.id !== att.id))}
                                        className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-white/20 bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity"
                                        title="Remove"
                                    >
                                        <Icon name="close-md" className="h-2.5 w-2.5 text-white" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Input row */}
                <div className="flex items-end gap-2">
                    {/* Attach */}
                    <div className="relative shrink-0">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setAttachMenuOpen((p) => !p)}
                            className="h-11 w-11 p-0 bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white"
                        >
                            <Icon name="plus" className="h-4 w-4" />
                        </Button>
                        {attachMenuOpen && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setAttachMenuOpen(false)} />
                                <div className="absolute bottom-full left-0 mb-2 z-50 min-w-[160px] space-y-0.5 rounded-xl border border-white/15 bg-zinc-950/95 p-1.5 shadow-2xl backdrop-blur-xl">
                                    {[
                                        { icon: (c: string) => <Icon name="image" className={c} />, label: 'Images', color: 'text-emerald-400', accept: 'image/*' },
                                        { icon: (c: string) => <Video className={c} />, label: 'Videos', color: 'text-purple-400', accept: 'video/*' },
                                        { icon: (c: string) => <Icon name="file-upload" className={c} />, label: 'Documents', color: 'text-white/60', accept: '.pdf,.txt,.csv,.json,.md' },
                                    ].map(({ icon, label, color, accept }) => (
                                        <button
                                            key={label}
                                            type="button"
                                            onClick={() => { setAttachMenuOpen(false); fileInputRef.current?.click(); }}
                                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-white hover:bg-white/[0.08] transition-colors"
                                        >
                                            {icon(cn('h-4 w-4', color))}
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            accept="image/*,video/*,.pdf,.txt,.csv,.json,.md"
                            className="hidden"
                            onChange={(e) => {
                                if (e.target.files && e.target.files.length > 0) {
                                    void ingestFiles(e.target.files);
                                    e.target.value = '';
                                }
                            }}
                        />
                    </div>

                    {/* Mode / Persona selector (shifted to bottom toolbar) */}
                    <ModeDropdown
                        value={paramValues.modeId}
                        onChange={(modeId) => onParamChange({ ...paramValues, modeId })}
                        className="h-11 shrink-0"
                    />

                    {/* Thinking selector */}
                    <ThinkingPowerSelector
                        value={reasoningEffort}
                        onChange={onThinkingChange}
                        models={[model]}
                    />

                    {/* Skills */}
                    <button
                        type="button"
                        onClick={onSkillsToggle}
                        className={cn(
                            'flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 h-11 text-[10px] font-semibold transition-all',
                            enabledSkillIds.length > 0
                                ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                                : 'bg-white/5 border-white/10 text-white/60 hover:border-white/20 hover:text-white',
                        )}
                    >
                        <Wrench className="h-3.5 w-3.5" />
                        {enabledSkillIds.length > 0 ? `${enabledSkillIds.length}` : ''}
                    </button>

                    {/* Textarea */}
                    <textarea
                        ref={textareaRef}
                        value={promptText}
                        onChange={(e) => setPromptText(e.target.value)}
                        placeholder="Ask anything... (drop or paste an image)"
                        className="flex-1 resize-none rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none focus:ring-1 focus:ring-white/20 min-h-[44px] max-h-[160px]"
                        rows={1}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                void handleSend();
                            }
                        }}
                    />

                    {/* Send */}
                    <Button
                        type="button"
                        onClick={() => void handleSend()}
                        disabled={!promptText.trim()}
                        className="h-11 w-11 shrink-0 rounded-xl bg-brand-600 text-white hover:bg-brand-500 disabled:opacity-30"
                    >
                        <Icon name="arrow-up-md" className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
}

// Placeholder — actual implementation uses page-level handlers
function ingestFiles(files: FileList): Promise<void> {
    return Promise.resolve();
}
function handleSend(): void {}
