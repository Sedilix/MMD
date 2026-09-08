'use client';

import { Sparkles } from 'lucide-react';
import { Icon } from '@/components/ui/icon';

export function EmptyState({
    title,
    message,
    spinner = false,
}: {
    title: string;
    message: string;
    spinner?: boolean;
}) {
    return (
        <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-white/20 bg-black/20 backdrop-blur-sm px-4 py-8 text-center text-xs text-white">
            <div className="flex items-center gap-2 font-semibold uppercase tracking-widest text-brand-300">
                {spinner ? (
                    <Icon name="loading" className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                    <Sparkles className="h-3.5 w-3.5" aria-hidden />
                )}
                {title}
            </div>
            <p className="max-w-xs text-[11px] leading-relaxed text-white/90 font-medium">{message}</p>
        </div>
    );
}
