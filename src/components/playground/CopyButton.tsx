'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/icon';

export function CopyButton({ text }: { text: string }) {
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
