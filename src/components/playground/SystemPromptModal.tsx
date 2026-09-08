'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export function SystemPromptModal({
    open,
    onOpenChange,
    value,
    onSave,
}: {
    open: boolean;
    onOpenChange(open: boolean): void;
    value: string;
    onSave(value: string): void;
}) {
    const [draft, setDraft] = useState(value);
    useEffect(() => {
        if (open) setDraft(value);
    }, [open, value]);

    return (
        <div
            aria-hidden={!open}
            className={cn(
                'fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 transition-opacity',
                open ? 'opacity-100' : 'pointer-events-none opacity-0',
            )}
            onClick={(): void => onOpenChange(false)}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Edit system prompt"
                className="w-full max-w-2xl rounded-lg border border-border bg-card p-6 shadow-2xl"
                onClick={(e): void => e.stopPropagation()}
            >
                <div className="mb-3 flex items-center justify-between">
                    <h2 className="font-headline text-base font-semibold tracking-tight">System prompt</h2>
                    <button
                        type="button"
                        onClick={(): void => onOpenChange(false)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                        aria-label="Close system prompt editor"
                    >
                        <Icon name="close-md" className="h-4 w-4" aria-hidden />
                    </button>
                </div>
                <p className="mb-3 text-xs text-muted-foreground">
                    Sent to every column as a <code className="font-mono text-foreground">system</code> message before the user prompt.
                </p>
                <Textarea
                    value={draft}
                    onChange={(e): void => setDraft(e.target.value)}
                    placeholder="You are a senior staff engineer …"
                    className="min-h-[160px] font-mono"
                />
                <div className="mt-3 flex items-center justify-end gap-2">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={(): void => onOpenChange(false)}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        onClick={(): void => {
                            onSave(draft);
                            onOpenChange(false);
                        }}
                    >
                        Save
                    </Button>
                </div>
                <Input type="hidden" value={draft} readOnly className="hidden" tabIndex={-1} aria-hidden />
            </div>
        </div>
    );
}
