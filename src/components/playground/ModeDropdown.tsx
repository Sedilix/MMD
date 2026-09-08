'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { PLAYGROUND_MODES, PlaygroundMode } from '@/lib/playground/modes';
import { cn } from '@/lib/utils';

import { Icon } from '@/components/ui/icon';

interface ModeDropdownProps {
    value?: string;
    onChange: (modeId: string | undefined) => void;
    className?: string;
}

export function ModeDropdown({ value, onChange, className }: ModeDropdownProps) {
    const [open, setOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
    const activeMode = PLAYGROUND_MODES.find((m) => m.id === value);

    const recalcPosition = useCallback(() => {
        if (!triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();
        setMenuStyle({
            position: 'fixed',
            left: Math.max(8, Math.min(rect.left, window.innerWidth - 300)),
            top: rect.bottom + 6,
            width: '280px',
            maxHeight: '340px',
            zIndex: 9999,
        });
    }, []);

    useEffect(() => {
        if (open) {
            recalcPosition();
            window.addEventListener('resize', recalcPosition);
            window.addEventListener('scroll', recalcPosition, true);
        }
        return () => {
            window.removeEventListener('resize', recalcPosition);
            window.removeEventListener('scroll', recalcPosition, true);
        };
    }, [open, recalcPosition]);

    useEffect(() => {
        if (!open) return;
        const handleClick = (e: MouseEvent) => {
            if (
                triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
                menuRef.current && !menuRef.current.contains(e.target as Node)
            ) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [open]);

    const menu = open ? (
        <div
            ref={menuRef}
            style={menuStyle}
            className="p-1.5 bg-zinc-950/95 border border-white/15 backdrop-blur-md shadow-2xl text-white rounded-xl overflow-y-auto custom-scrollbar animate-in fade-in-0 zoom-in-95 duration-100"
        >
            <div className="px-2 py-1.5 border-b border-white/10 mb-1 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1">
                    <Icon name="star" className="h-3 w-3" /> Select Mode / Persona
                </span>
                {activeMode && (
                    <button
                        type="button"
                        onClick={() => {
                            onChange(undefined);
                            setOpen(false);
                        }}
                        className="text-[9px] text-zinc-400 hover:text-zinc-200 underline cursor-pointer"
                    >
                        Reset
                    </button>
                )}
            </div>

            <div className="space-y-0.5">
                {PLAYGROUND_MODES.map((mode) => {
                    const isSelected = mode.id === value;
                    return (
                        <button
                            key={mode.id}
                            type="button"
                            onClick={() => {
                                onChange(isSelected ? undefined : mode.id);
                                setOpen(false);
                            }}
                            className={cn(
                                'w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors cursor-pointer group',
                                isSelected
                                    ? 'bg-amber-500/20 text-amber-200 border border-amber-500/30'
                                    : 'hover:bg-white/10 text-zinc-200'
                            )}
                        >
                            <span className="text-base shrink-0 leading-none mt-0.5">{mode.icon}</span>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-1">
                                    <span className="text-xs font-bold truncate group-hover:text-white">
                                        {mode.name}
                                    </span>
                                    {isSelected && <Icon name="check" className="h-3.5 w-3.5 text-amber-400 shrink-0" />}
                                </div>
                                <p className="text-[10px] text-zinc-400 leading-tight line-clamp-2 mt-0.5">
                                    {mode.description}
                                </p>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    ) : null;

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                onClick={() => setOpen(!open)}
                className={cn(
                    'flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[10px] font-semibold transition-all cursor-pointer select-none',
                    activeMode
                        ? 'bg-zinc-950 border-amber-500/80 text-amber-300 shadow-md hover:bg-zinc-900'
                        : 'bg-zinc-950 border-zinc-700/80 text-zinc-100 shadow-md hover:border-zinc-500 hover:bg-zinc-900',
                    className
                )}
                title="Select model persona mode"
            >
                {activeMode ? (
                    <span>{activeMode.icon}</span>
                ) : (
                    <Icon name="star" className="h-3.5 w-3.5 text-amber-400" />
                )}
                <span className="truncate max-w-[90px]">
                    {activeMode ? activeMode.name : 'Mode'}
                </span>
                <Icon name="chevron-down" className="h-3.5 w-3.5 opacity-60 shrink-0" />
            </button>
            {typeof document !== 'undefined' && menu && createPortal(menu, document.body)}
        </>
    );
}
