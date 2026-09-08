'use client';

/**
 * `AttachmentDock` — drag-and-drop multimodal staging area for the
 * Playground prompt bar. Accepts files via either click-to-browse or
 * drop-on-target, converts each to a data URL via `FileReader`, and
 * surfaces per-column compatibility badges.
 *
 * Compatibility for each attached file is computed against *every* active
 * column's model. The page passes in `columnModels: ModelRegistryEntry[]`
 * so the dock can show a row of green ✓ / yellow ⚠ / red ✗ chips beside
 * each thumbnail.
 *
 * Data URLs are emitted via the `onChange` callback so the prompt bar can
 * include them in `send(prompt, { attachments })` without round-tripping
 * through state again. Each attachment is shaped as
 * `{ mimeType, dataUrl }` — the full data URL (`data:<mime>;base64,<b64>`)
 * because the streaming route's `PlaygroundAttachment` schema accepts that
 * prefix.
 */

import { useCallback, useRef, useState } from 'react';
import { Icon } from '@/components/ui/icon';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { columnAttachmentCompatibility } from '@/lib/playground/compatibility';
import { fileToOptimizedDataUrl } from '@/lib/playground/compress-image';
import type { ModelRegistryEntry } from '@/lib/playground/types';

// ─── Public types ───────────────────────────────────────────────────────────

export interface DockAttachment {
    /** Stable client-side id for list keys. */
    id: string;
    /** Filename. */
    name: string;
    /** MIME type. */
    mimeType: string;
    /** `data:<mime>;base64,<payload>` URL. */
    dataUrl: string;
    /** Size in bytes (used for the badge label). */
    size: number;
}

export interface AttachmentDockProps {
    attachments: DockAttachment[];
    onChange(attachments: DockAttachment[]): void;
    /** Models for the active columns — drives the per-file badge row. */
    columnModels: ModelRegistryEntry[];
    /** Compact mode strips the heading for use inside the prompt bar. */
    compact?: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = (): void => reject(reader.error ?? new Error('Read failed'));
        reader.onload = (): void => {
            const result = reader.result;
            if (typeof result === 'string') resolve(result);
            else reject(new Error('FileReader returned non-string'));
        };
        reader.readAsDataURL(file);
    });
}

function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let val = bytes;
    let i = 0;
    while (val >= 1024 && i < units.length - 1) {
        val /= 1024;
        i += 1;
    }
    return `${val.toFixed(val >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function mimeBadge(mime: string): string {
    if (mime.startsWith('image/')) return 'IMG';
    if (mime.startsWith('audio/')) return 'AUD';
    if (mime.startsWith('video/')) return 'VID';
    if (mime.startsWith('text/')) return 'TXT';
    return 'BIN';
}

function compatTone(
    v: 'full' | 'partial' | 'none',
): { icon: React.ReactNode; tone: string; label: string } {
    if (v === 'full') {
        return {
            icon: <Icon name="check" className="h-3 w-3" aria-hidden />,
            tone: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/40',
            label: 'OK',
        };
    }
    if (v === 'partial') {
        return {
            icon: <Icon name="triangle-warning" className="h-3 w-3" aria-hidden />,
            tone: 'text-amber-400 bg-amber-500/10 border-amber-500/40',
            label: 'TXT',
        };
    }
    return {
        icon: <Icon name="close-md" className="h-3 w-3" aria-hidden />,
        tone: 'text-red-400 bg-red-500/10 border-red-500/40',
        label: 'X',
    };
}

// ─── Component ──────────────────────────────────────────────────────────────

export function AttachmentDock({
    attachments,
    onChange,
    columnModels,
    compact = false,
}: AttachmentDockProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [dragOver, setDragOver] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const ingest = useCallback(
        async (files: FileList | File[]): Promise<void> => {
            const list = Array.from(files);
            if (list.length === 0) return;

            const accepted: DockAttachment[] = [];
            for (const file of list) {
                if (file.size > 15 * 1024 * 1024) {
                    setErrorMsg(`"${file.name}" is too large (max 15 MiB).`);
                    continue;
                }
                try {
                    const dataUrl = await fileToOptimizedDataUrl(file);
                    if (!dataUrl) throw new Error('Conversion failed');
                    accepted.push({
                        id:
                            typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                                ? crypto.randomUUID()
                                : `att-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                        name: file.name,
                        mimeType: file.type.startsWith('image/') ? 'image/jpeg' : (file.type || 'application/octet-stream'),
                        dataUrl,
                        size: file.size,
                    });
                } catch {
                    setErrorMsg(`Failed to read "${file.name}".`);
                }
            }

            if (accepted.length > 0) {
                onChange([...attachments, ...accepted]);
                setErrorMsg(null);
            }
        },
        [attachments, onChange],
    );

    const handleRemove = useCallback(
        (id: string): void => {
            onChange(attachments.filter((a) => a.id !== id));
        },
        [attachments, onChange],
    );

    const handleClearAll = useCallback((): void => {
        onChange([]);
    }, [onChange]);

    const handleDrop = useCallback(
        (e: React.DragEvent<HTMLLabelElement>): void => {
            e.preventDefault();
            setDragOver(false);
            const files = e.dataTransfer?.files;
            if (files && files.length > 0) {
                void ingest(files);
            }
        },
        [ingest],
    );

    const handleDragOver = useCallback((e: React.DragEvent<HTMLLabelElement>): void => {
        e.preventDefault();
        setDragOver(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent<HTMLLabelElement>): void => {
        e.preventDefault();
        setDragOver(false);
    }, []);

    const openPicker = useCallback((): void => {
        inputRef.current?.click();
    }, []);

    const handlePickerChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>): void => {
            const files = e.target.files;
            if (files && files.length > 0) {
                void ingest(files);
            }
            // Reset so the same file can be re-selected later.
            e.target.value = '';
        },
        [ingest],
    );

    return (
        <div className={cn('w-full', compact ? '' : 'rounded-md border border-border bg-card/40 p-3')}>
            <div className="flex items-center justify-between gap-2">
                <label
                    className={cn(
                        'flex flex-1 cursor-pointer items-center gap-2 rounded-md border border-dashed px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs transition-colors',
                        dragOver
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-muted/40 text-muted-foreground hover:border-primary/60 hover:text-foreground',
                    )}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                >
                    <Icon name="file-upload" className="h-3 sm:h-3.5 w-3 sm:w-3.5 flex-shrink-0" aria-hidden />
                    <span className="select-none truncate">
                        {dragOver ? 'Drop to attach' : 'Drag files here, or click to browse'}
                    </span>
                    <input
                        ref={inputRef}
                        type="file"
                        multiple
                        className="sr-only"
                        onChange={handlePickerChange}
                        aria-label="Attach files"
                    />
                </label>
                {attachments.length > 0 ? (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleClearAll}
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                    >
                        Clear all
                    </Button>
                ) : null}
            </div>

            {errorMsg ? (
                <p className="mt-2 text-xs text-destructive">{errorMsg}</p>
            ) : null}

            {attachments.length > 0 ? (
                <ul className="mt-3 space-y-2" role="list">
                    {attachments.map((att) => {
                        return (
                            <li
                                key={att.id}
                                className="flex items-start gap-3 rounded-md border border-border bg-background/50 p-2"
                            >
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
                                    {att.mimeType.startsWith('image/') ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={att.dataUrl}
                                            alt={att.name}
                                            className="h-full w-full object-cover"
                                        />
                                    ) : att.mimeType.startsWith('image/') ? (
                                        <Icon name="image" className="h-4 w-4 text-muted-foreground" aria-hidden />
                                    ) : (
                                        <Icon name="file-document" className="h-4 w-4 text-muted-foreground" aria-hidden />
                                    )}
                                </div>

                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <span
                                            className="truncate text-xs font-medium text-foreground"
                                            title={att.name}
                                        >
                                            {att.name}
                                        </span>
                                        <Badge variant="outline" className="h-4 px-1 text-[9px] font-mono uppercase">
                                            {mimeBadge(att.mimeType)}
                                        </Badge>
                                        <span className="text-[10px] text-muted-foreground">
                                            {formatBytes(att.size)}
                                        </span>
                                    </div>

                                    {columnModels.length > 0 ? (
                                        <div
                                            className="mt-1 flex flex-wrap gap-1"
                                            aria-label="Per-column compatibility"
                                        >
                                            {columnModels.map((model) => {
                                                const v = columnAttachmentCompatibility(model, [att.mimeType]);
                                                const tone = compatTone(v);
                                                return (
                                                    <span
                                                        key={`${att.id}-${model.id}`}
                                                        className={cn(
                                                            'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium',
                                                            tone.tone,
                                                        )}
                                                        title={`${model.displayName}: ${v}`}
                                                    >
                                                        {tone.icon}
                                                        <span className="max-w-[8rem] truncate">{model.displayName}</span>
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    ) : null}
                                </div>

                                <button
                                    type="button"
                                    onClick={(): void => handleRemove(att.id)}
                                    className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                                    aria-label={`Remove ${att.name}`}
                                >
                                    <Icon name="close-md" className="h-3.5 w-3.5" aria-hidden />
                                </button>
                            </li>
                        );
                    })}
                </ul>
            ) : null}

            {/* Hidden browse trigger is inside the label; explicit button is for keyboard users. */}
            <div className="sr-only">
                <button type="button" onClick={openPicker} aria-label="Browse files" />
            </div>
        </div>
    );
}