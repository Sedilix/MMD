'use client';

import { AudioLines } from 'lucide-react';
import { Icon } from '@/components/ui/icon';
import type { ModelRegistryEntry } from '@/lib/playground/types';

export function ModelCapabilitiesBadge({ model }: { model?: ModelRegistryEntry }) {
    if (!model) return null;
    const support = model.supportsAttachments;

    if (!support || (!support.image && !support.video && !support.audio)) {
        return (
            <span
                className="inline-flex h-7 items-center gap-1.5 rounded-full border border-zinc-700/80 bg-zinc-950 px-2.5 text-[10px] font-semibold text-zinc-200 shadow-md select-none"
                title="Text only model"
            >
                TEXT
            </span>
        );
    }

    return (
        <div className="flex items-center gap-1.5">
            {support.image && (
                <span
                    className="inline-flex h-7 items-center gap-1.5 rounded-full border border-emerald-500/80 bg-zinc-950 px-2.5 text-[10px] font-semibold text-emerald-400 shadow-md select-none"
                    title="Supports Images"
                >
                    <Icon name="image-01" className="h-3.5 w-3.5 shrink-0 text-emerald-400" /> IMAGES
                </span>
            )}
            {support.video && (
                <span
                    className="inline-flex h-7 items-center gap-1.5 rounded-full border border-purple-500/80 bg-zinc-950 px-2.5 text-[10px] font-semibold text-purple-400 shadow-md select-none"
                    title="Supports Video"
                >
                    <Icon name="image-alt" className="h-3.5 w-3.5 shrink-0 text-purple-400" /> VIDEO
                </span>
            )}
            {support.audio && (
                <span
                    className="inline-flex h-7 items-center gap-1.5 rounded-full border border-amber-500/80 bg-zinc-950 px-2.5 text-[10px] font-semibold text-amber-400 shadow-md select-none"
                    title="Supports Audio"
                >
                    <AudioLines className="h-3.5 w-3.5 shrink-0 text-amber-400" /> AUDIO
                </span>
            )}
        </div>
    );
}
