'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Icon } from '@/components/ui/icon';
import { createPortal } from 'react-dom';
import { ImageIcon, Film, Mic } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ModelRegistryEntry, ModelBrand } from '@/lib/playground/types';
import { getBYOKKeyForModel } from '@/lib/desktop/byok-store';

const BRAND_ORDER: ModelBrand[] = [
    'Local', 'Google', 'OpenAI', 'Anthropic', 'Meta', 'Mistral',
    'Alibaba', 'Z.ai', 'Moonshot', 'DeepSeek', 'xAI',
    'MiniMax', 'Amazon',
];

interface ModelDropdownProps {
    /** All models to show, grouped by brand */
    models: readonly ModelRegistryEntry[];
    /** Currently selected model id */
    value: string;
    /** Called when the user picks a model */
    onChange: (modelId: string) => void;
    /** If true, models with access === 'registered' are shown as locked */
    guestMode?: boolean;
    /** Extra class on the trigger button */
    className?: string;
    /** Max width of the trigger label */
    maxWidth?: string;
    /** Show attachment capability icons next to the selected model */
    showCapabilities?: boolean;
    /** Font size of the trigger label */
    triggerTextSize?: string;
}

export function ModelDropdown({
    models,
    value,
    onChange,
    guestMode = false,
    className,
    maxWidth = '180px',
    showCapabilities = false,
    triggerTextSize = 'text-[11px]',
}: ModelDropdownProps) {
    const [open, setOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
    const selectedModel = models.find(m => m.id === value);

    const recalcPosition = useCallback(() => {
        if (!triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();
        setMenuStyle({
            position: 'fixed',
            left: rect.left,
            top: rect.bottom + 6,
            minWidth: Math.max(rect.width, 220),
            maxHeight: '320px',
            zIndex: 9999,
        });
    }, []);

    // Recalculate on open and on scroll/resize
    useEffect(() => {
        if (!open) return;
        recalcPosition();
        window.addEventListener('scroll', recalcPosition, true);
        window.addEventListener('resize', recalcPosition);
        return () => {
            window.removeEventListener('scroll', recalcPosition, true);
            window.removeEventListener('resize', recalcPosition);
        };
    }, [open, recalcPosition]);

    // Close when clicking outside (checks both trigger and portal menu)
    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            const target = e.target as Node;
            if (
                triggerRef.current && triggerRef.current.contains(target)
            ) return;
            if (
                menuRef.current && menuRef.current.contains(target)
            ) return;
            setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    // Build brand groups
    const modelsByBrand = React.useMemo(() => {
        const map = new Map<ModelBrand, ModelRegistryEntry[]>();
        for (const m of models) {
            const list = map.get(m.brand) ?? [];
            list.push(m);
            map.set(m.brand, list);
        }
        return map;
    }, [models]);

    const visibleBrands = BRAND_ORDER.filter(b => modelsByBrand.has(b));

    const handleSelect = (modelId: string) => {
        onChange(modelId);
        setOpen(false);
    };

    const capabilities = selectedModel?.supportsAttachments;

    const dropdownContent = open ? (
        <div
            ref={menuRef}
            style={menuStyle}
            className="overflow-y-auto rounded-lg border border-white/15 bg-zinc-950/95 backdrop-blur-xl shadow-2xl"
        >
            {visibleBrands.map((brand, bi) => (
                <div key={brand}>
                    {bi > 0 && (
                        <div className="mx-2 my-1 border-t border-white/10" />
                    )}
                    <div className="px-3 pt-2 pb-1 text-[9px] font-bold uppercase tracking-widest text-white/30">
                        {brand}
                    </div>
                    {(modelsByBrand.get(brand) ?? []).map(m => {
                        const isLocked = guestMode && m.access === 'registered';
                        const isSelected = m.id === value;
                        const hasBYOK = !!getBYOKKeyForModel(m.id, m.brand, m.provider);
                        return (
                            <button
                                key={m.id}
                                type="button"
                                onClick={() => !isLocked && handleSelect(m.id)}
                                disabled={isLocked}
                                className={cn(
                                    'w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors',
                                    isLocked
                                        ? 'text-white/30 cursor-not-allowed'
                                        : isSelected
                                            ? 'bg-white/15 text-white'
                                            : 'text-white/70 hover:bg-white/10 hover:text-white'
                                )}
                            >
                                {isLocked && (
                                    <Icon name="lock" className="h-3 w-3 shrink-0 text-white/30" />
                                )}
                                <span className="truncate">{m.displayName}</span>
                                {m.provider === 'alibaba' && m.brand !== 'Alibaba' && (
                                    <span className="text-[9px] px-1 py-0.5 rounded bg-sky-500/20 text-sky-300 font-medium tracking-tight">
                                        AMS
                                    </span>
                                )}
                                {hasBYOK && (
                                    <span className="ml-auto text-[9px] px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-medium tracking-tight">
                                        BYOK
                                    </span>
                                )}
                                {showCapabilities && m.supportsAttachments && (
                                    <span className={cn("flex items-center gap-0.5 shrink-0 opacity-60", !hasBYOK && "ml-auto")}>
                                        {m.supportsAttachments.image && <ImageIcon className="h-2.5 w-2.5 text-emerald-400" />}
                                        {m.supportsAttachments.video && <Film className="h-2.5 w-2.5 text-purple-400" />}
                                        {m.supportsAttachments.audio && <Mic className="h-2.5 w-2.5 text-amber-400" />}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            ))}
        </div>
    ) : null;

    const selectedHasBYOK = selectedModel ? !!getBYOKKeyForModel(selectedModel.id, selectedModel.brand, selectedModel.provider) : false;

    return (
        <div className={cn('relative', className)}>
            {/* Trigger button — dark grey background (bg-zinc-900/90), bright
                white text, and an animated outer-glow that pulses cyan on
                hover. Capability icons retain their semantic colors. */}
            <button
                ref={triggerRef}
                type="button"
                onClick={() => setOpen(o => !o)}
                className={cn(
                    "group/modelpill relative inline-flex items-center gap-1.5 overflow-hidden",
                    "bg-zinc-900/90 border border-white/15 rounded-full px-2.5 h-6",
                    "text-[11px] font-semibold text-white",
                    "transition-all duration-300 focus:outline-none",
                    "hover:border-white/40 hover:shadow-[0_0_18px_rgba(216,166,87,0.35)]",
                    open && "border-brand-400/60 shadow-[0_0_22px_rgba(216,166,87,0.55)]",
                )}
            >
                {/* Animated lighting effect — a moving cyan sheen that sweeps
                    across the pill on hover/open. Pure CSS, no JS. */}
                <span
                    aria-hidden
                    className={cn(
                        "pointer-events-none absolute inset-0 -translate-x-full",
                        "bg-gradient-to-r from-transparent via-brand-400/30 to-transparent",
                        "transition-transform duration-700 ease-out",
                        "group-hover/modelpill:translate-x-full",
                        open && "translate-x-full",
                    )}
                />
                {/* Soft inner glow on open */}
                <span
                    aria-hidden
                    className={cn(
                        "pointer-events-none absolute inset-0 rounded-full",
                        "bg-[radial-gradient(circle_at_50%_120%,rgba(216, 166, 87,0.18),transparent_60%)]",
                        "opacity-0 transition-opacity duration-300",
                        "group-hover/modelpill:opacity-100",
                        open && "opacity-100",
                    )}
                />

                {selectedHasBYOK && (
                    <span className="relative flex h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]" title="Personal BYOK Key Active (0 Credits, Cybrdeck backup standby)" />
                )}

                <span
                    className={cn(
                        triggerTextSize,
                        'relative font-semibold text-white truncate max-w-[140px] drop-shadow-[0_0_2px_rgba(255,255,255,0.25)]'
                    )}
                    style={{ maxWidth }}
                    title={selectedModel?.displayName}
                >
                    {selectedModel?.displayName ?? 'Select model'}
                </span>

                {showCapabilities && capabilities && (
                    <span className="relative flex items-center gap-1">
                        {capabilities.image && <ImageIcon className="h-3.5 w-3.5 text-emerald-400 drop-shadow-[0_0_3px_rgba(16,185,129,0.6)]" />}
                        {capabilities.video && <Film className="h-3.5 w-3.5 text-purple-400 drop-shadow-[0_0_3px_rgba(168,85,247,0.6)]" />}
                        {capabilities.audio && <Mic className="h-3.5 w-3.5 text-amber-400 drop-shadow-[0_0_3px_rgba(245,158,11,0.6)]" />}
                    </span>
                )}

                <Icon name="chevron-down"
                    className={cn(
                        'relative h-3 w-3 shrink-0 text-white/80 transition-transform duration-300',
                        'group-hover/modelpill:text-brand-300',
                        open && 'rotate-180 text-brand-300'
                    )}
                />
            </button>

            {/* Dropdown menu — rendered via portal so it escapes overflow-hidden parents */}
            {dropdownContent && typeof window !== 'undefined' && createPortal(dropdownContent, document.body)}
        </div>
    );
}
