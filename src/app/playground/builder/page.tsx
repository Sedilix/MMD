'use client';

/**
 * /playground/builder — Agent Builder canvas (audit Step 9), behind the
 * `pg-flag-agent-builder` flag.
 *
 * Entry: `/playground/builder?flag=1` turns the flag on (persisted to
 * localStorage); `/playground/builder?flag=0` turns it off. Without the
 * flag the page renders the preview gate instead of the canvas, so the
 * surface ships dark until it's deliberately opened.
 *
 * Signed-in users only: the builder compiles onto the MMD runtime, which
 * builds on the tool-call loop (Step 1) and the MCP client (Step 3) —
 * both already gated to accounts.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useUser } from '@/firebase/auth/use-user';
import { BuilderCanvas } from '@/components/playground/builder/BuilderCanvas';

const BUILDER_FLAG_KEY = 'pg-flag-agent-builder';

export default function AgentBuilderPage() {
    const { user, loading } = useUser();
    const [flagState, setFlagState] = useState<'loading' | 'on' | 'off'>('loading');

    useEffect(() => {
        try {
            const params = new URLSearchParams(window.location.search);
            const requested = params.get('flag');
            if (requested === '1') {
                window.localStorage.setItem(BUILDER_FLAG_KEY, '1');
                setFlagState('on');
                return;
            }
            if (requested === '0') {
                window.localStorage.removeItem(BUILDER_FLAG_KEY);
                setFlagState('off');
                return;
            }
            setFlagState(window.localStorage.getItem(BUILDER_FLAG_KEY) === '1' ? 'on' : 'off');
        } catch {
            setFlagState('off');
        }
    }, []);

    if (flagState === 'loading' || loading) {
        return (
            <main className="flex h-screen items-center justify-center bg-zinc-950 text-zinc-400 text-sm">
                Loading…
            </main>
        );
    }

    if (flagState === 'off') {
        return (
            <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 text-zinc-100">
                <div className="max-w-md space-y-4 text-center">
                    <h1 className="text-xl font-bold">Agent Builder — preview</h1>
                    <p className="text-sm leading-relaxed text-zinc-400">
                        The Agent Builder canvas is behind a preview flag. Open{' '}
                        <code className="rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-xs text-zinc-200">
                            /playground/builder?flag=1
                        </code>{' '}
                        to turn it on.
                    </p>
                    <Link
                        href="/playground/app"
                        className="inline-block rounded-md border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-900 transition-colors"
                    >
                        Back to the Playground
                    </Link>
                </div>
            </main>
        );
    }

    if (!user) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 text-zinc-100">
                <div className="max-w-md space-y-4 text-center">
                    <h1 className="text-xl font-bold">Agent Builder — preview</h1>
                    <p className="text-sm leading-relaxed text-zinc-400">
                        The builder compiles graphs onto the MMD runtime and its tool/MCP
                        lanes, which need an account. Sign in to open the canvas.
                    </p>
                    <Link
                        href="/playground/app"
                        className="inline-block rounded-md border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-900 transition-colors"
                    >
                        Sign in via the Playground
                    </Link>
                </div>
            </main>
        );
    }

    return (
        <main className="flex h-screen flex-col bg-zinc-950 text-zinc-100 overflow-hidden">
            <header className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-2">
                <div className="flex items-center gap-3">
                    <h1 className="text-sm font-bold">Agent Builder</h1>
                    <span className="rounded-full border border-violet-500/60 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-violet-300">
                        Preview flag
                    </span>
                </div>
                <Link
                    href="/playground/app"
                    className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-100 hover:bg-zinc-900 transition-colors"
                >
                    Workbench
                </Link>
            </header>
            <div className="min-h-0 flex-1">
                <BuilderCanvas />
            </div>
        </main>
    );
}
