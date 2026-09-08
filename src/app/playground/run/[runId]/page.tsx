/**
 * /playground/run/[runId] — public viewer for a shared playground run
 * snapshot (audit Step 6).
 *
 * Server-rendered read-only transcript: the snapshot was validated on
 * write (see `/api/playground/runs`), re-normalised on read (see
 * `runs-store.ts`), and is rendered here with no client interactivity —
 * content is plain text in `whitespace-pre-wrap`, never parsed as HTML,
 * so a shared transcript cannot inject markup into the viewer.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { getRunSnapshot } from '@/lib/playground/runs-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Props {
    params: Promise<{ runId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { runId } = await params;
    const snapshot = await getRunSnapshot(runId);
    if (!snapshot) return { title: 'Run not found | Cybrdeck Playground' };
    return {
        title: `${snapshot.modelLabel} — Playground run | Cybrdeck`,
        description: `Shared playground transcript: ${snapshot.messages.length} message(s) from ${snapshot.modelLabel}.`,
    };
}

function formatTime(ts: number): string {
    if (!ts) return '';
    try {
        return new Date(ts).toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch {
        return '';
    }
}

export default async function PlaygroundRunPage({ params }: Props) {
    const { runId } = await params;
    const snapshot = await getRunSnapshot(runId);

    if (!snapshot) {
        return (
            <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center px-6">
                <div className="max-w-md text-center space-y-4">
                    <h1 className="text-xl font-bold">Run not found</h1>
                    <p className="text-sm text-zinc-400 leading-relaxed">
                        This shared run does not exist or was removed. The link may be mistyped.
                    </p>
                    <Link
                        href="/playground/app"
                        className="inline-block rounded-md border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-900 transition-colors"
                    >
                        Open the Playground
                    </Link>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-zinc-950 text-zinc-100">
            <header className="sticky top-0 z-10 border-b border-white/10 bg-zinc-950/90 backdrop-blur">
                <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                        <h1 className="truncate text-sm font-bold">{snapshot.modelLabel}</h1>
                        <p className="text-[11px] text-zinc-500">
                            Shared playground run · {snapshot.messages.length} message(s)
                            {snapshot.createdAt > 0 ? ` · ${formatTime(snapshot.createdAt)}` : ''}
                        </p>
                    </div>
                    <Link
                        href="/playground/app"
                        className="shrink-0 rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-100 hover:bg-zinc-900 transition-colors"
                    >
                        Open Playground
                    </Link>
                </div>
            </header>

            <div className="mx-auto max-w-3xl px-4 py-6 space-y-4">
                {snapshot.messages.map((m, i) => (
                    <section
                        key={`${m.ts}-${i}`}
                        className={
                            m.role === 'user'
                                ? 'rounded-lg border border-white/10 bg-white/5 p-4'
                                : 'rounded-lg border border-zinc-800 bg-zinc-900/60 p-4'
                        }
                    >
                        <div className="mb-2 flex items-center gap-2">
                            <span
                                className={
                                    m.role === 'user'
                                        ? 'text-[10px] font-bold uppercase tracking-wider text-sky-400'
                                        : 'text-[10px] font-bold uppercase tracking-wider text-emerald-400'
                                }
                            >
                                {m.role === 'user' ? 'You' : snapshot.modelLabel}
                            </span>
                            {m.ts > 0 && (
                                <span className="text-[10px] text-zinc-600">{formatTime(m.ts)}</span>
                            )}
                        </div>
                        {m.reasoning ? (
                            <details className="mb-2 rounded border border-zinc-800 bg-zinc-950/60 px-3 py-2">
                                <summary className="cursor-pointer text-[11px] font-semibold text-zinc-400">
                                    Reasoning
                                </summary>
                                <pre className="mt-2 whitespace-pre-wrap font-sans text-xs leading-relaxed text-zinc-400">
                                    {m.reasoning}
                                </pre>
                            </details>
                        ) : null}
                        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-100">
                            {m.content}
                        </pre>
                    </section>
                ))}

                <p className="pt-2 pb-8 text-center text-[11px] text-zinc-600">
                    Read-only snapshot published from the Cybrdeck Playground.
                </p>
            </div>
        </main>
    );
}
