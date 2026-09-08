'use client';

import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/icon';

const THINKING_LEVELS = [
    {
        value: 'none',
        label: 'OFF',
        tagline: 'fastest, no reasoning',
        description: 'Disables extended thinking. Best for simple, fast tasks like translation, summarization, or straightforward Q&A where deep reasoning is unnecessary.',
    },
    {
        value: 'light',
        label: 'Light',
        tagline: 'fastest, light reasoning',
        description: 'Quick reasoning passes on non-trivial steps. Ideal for tasks that need occasional reflection — clarifying intent, catching obvious contradictions, or short planning bursts.',
    },
    {
        value: 'standard',
        label: 'Medium',
        tagline: 'balanced, default',
        description: 'Standard multi-step reasoning with moderate thought depth. The default for most tasks: coding, analysis, long-form writing, and multi-hop questions.',
    },
    {
        value: 'xhigh',
        label: 'High',
        tagline: 'deepest, hardest steps',
        description: 'Deep reasoning on the most complex, ambiguous problems. Allocates maximum thought tokens for multi-stage proofs, architectural decisions, and difficult debugging.',
    },
] as const;

interface ThinkingDrawerProps {
    /** Currently selected thinking level. */
    value: 'none' | 'light' | 'standard' | 'xhigh';
    /** Called when the user picks a new level. */
    onChange: (level: 'none' | 'light' | 'standard' | 'xhigh') => void;
    /** Whether the drawer is open. */
    open: boolean;
    /** Called to close the drawer. */
    onClose: () => void;
}

/**
 * A Hermes-style thinking level selector drawer that appears below the
 * Thinking button in the playground toolbar. Shows the current selection
 * with a checkmark and reveals the full description on the active item.
 */
export function ThinkingDrawer({ value, onChange, open, onClose }: ThinkingDrawerProps) {
    if (!open) return null;

    return (
        <div
            className={cn(
                'absolute top-full left-0 mt-2 z-50',
                'w-80 rounded-xl border border-white/15 bg-zinc-950/95 backdrop-blur-xl',
                'shadow-2xl shadow-black/60',
                'overflow-hidden',
            )}
            role="listbox"
            aria-label="Select thinking effort level"
        >
            {/* Header */}
            <div className="px-4 pt-3 pb-2 border-b border-white/10">
                <p className="text-[10px] font-bold uppercase tracking-widest text-brand-400">
                    Thinking Effort
                </p>
                <p className="mt-0.5 text-[10px] text-white/40">
                    Applies from the next message
                </p>
            </div>

            {/* Level list */}
            <div className="p-2 space-y-0.5">
                {THINKING_LEVELS.map((level) => {
                    const isActive = value === level.value;
                    return (
                        <button
                            key={level.value}
                            type="button"
                            role="option"
                            aria-selected={isActive}
                            onClick={() => { onChange(level.value); onClose(); }}
                            className={cn(
                                'w-full flex items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                                isActive ? 'bg-brand-400/10' : 'hover:bg-white/[0.08]',
                            )}
                        >
                            {/* Checkmark */}
                            <span className="mt-0.5 shrink-0">
                                {isActive ? (
                                    <Icon name="check" className="h-3.5 w-3.5 text-brand-400" />
                                ) : (
                                    <span className="inline-block h-3.5 w-3.5 rounded-full border border-white/20" />
                                )}
                            </span>

                            {/* Text */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-baseline gap-2">
                                    <span className={cn(
                                        'text-[11px] font-semibold',
                                        isActive ? 'text-brand-300' : 'text-white',
                                    )}>
                                        {level.label}
                                    </span>
                                    <span className="text-[9px] text-white/40 truncate">
                                        {level.tagline}
                                    </span>
                                </div>
                                <p className={cn(
                                    'mt-0.5 text-[10px] leading-relaxed',
                                    isActive ? 'text-brand-400/70' : 'text-white/50',
                                )}>
                                    {level.description}
                                </p>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
