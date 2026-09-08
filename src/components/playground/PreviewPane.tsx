'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';
import {
    buildSandboxDoc,
    buildFileSpans,
    buildProjectExport,
    type DetectedArtifact,
    type VfsSpan,
} from '@/lib/playground/artifact-parser';
import { buildZipBlob } from '@/lib/playground/zip';
import type { BuildSuggestion } from '@/lib/playground/types';
import { useUser } from '@/firebase';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

type ViewMode = 'preview' | 'code';
type DeviceMode = 'desktop' | 'mobile' | 'tablet';

/** Approx line height (px) of the code editor — used for caret-jump scrolling. */
const EDITOR_LINE_HEIGHT = 18;

function fileIcon(path: string): { name: string; className: string } {
    if (path.endsWith('.json')) return { name: 'settings', className: 'text-amber-400' };
    if (/\.env(\.|$)/.test(path) || path.endsWith('.env')) return { name: 'lock', className: 'text-emerald-400' };
    if (path.endsWith('.md')) return { name: 'document', className: 'text-zinc-400' };
    if (path.endsWith('.py')) return { name: 'file-code', className: 'text-sky-300' };
    if (path.endsWith('.html') || path.endsWith('.htm')) return { name: 'globe', className: 'text-orange-400' };
    return { name: 'file-code', className: 'text-sky-400' };
}

interface PreviewPaneProps {
    artifact: DetectedArtifact;
    onClose: () => void;
    onRemix?: (code: string) => void;
    className?: string;
    /** Suggestions from the strategist model; null = never requested. */
    suggestions?: BuildSuggestion[] | null;
    suggestionsLoading?: boolean;
    /** Kick off the AI suggestion call with the current (edited) source. */
    onRequestSuggestions?: (code: string) => void;
    /** Inject a composed prompt into the chat input (native-setter safe). */
    onInjectPrompt?: (text: string) => void;
}

export function PreviewPane({
    artifact,
    onClose,
    onRemix,
    className,
    suggestions = null,
    suggestionsLoading = false,
    onRequestSuggestions,
    onInjectPrompt,
}: PreviewPaneProps) {
    const { user } = useUser();
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [viewMode, setViewMode] = useState<ViewMode>('preview');
    const [device, setDevice] = useState<DeviceMode>('desktop');
    const [copied, setCopied] = useState(false);
    const [fullscreen, setFullscreen] = useState(false);
    const [key, setKey] = useState(0); // Force iframe refresh
    const [activePath, setActivePath] = useState<string | null>(null);
    const [deploying, setDeploying] = useState(false);
    const [deployUrl, setDeployUrl] = useState<string | null>(null);

    // Live Prototype Editing & Diagnostics State
    const [liveCode, setLiveCode] = useState(artifact.code);
    // Debounced mirror of `liveCode` — the sandbox iframe is built from THIS
    // value, not the live textarea value, so editing the code editor doesn't
    // re-bootstrap the Babel + React runtime on every keystroke (audit #9).
    // The textarea stays responsive (bound to `liveCode`); the sandbox catches
    // up 400ms after the user stops typing.
    const [sandboxCode, setSandboxCode] = useState(artifact.code);
    const [consoleLogs, setConsoleLogs] = useState<Array<{ level: string; text: string; time: string }>>([]);
    const [isConsoleOpen, setIsConsoleOpen] = useState(false);

    // Keep liveCode + sandboxCode in sync when a new artifact is passed from
    // the parent (e.g. clicking "Preview" on a different code block).
    useEffect(() => {
        setLiveCode(artifact.code);
        setSandboxCode(artifact.code);
        setConsoleLogs([]);
    }, [artifact]);

    // Debounce live edits → sandbox rebuild. Each keystroke mutates `liveCode`
    // immediately; the sandbox only re-bootstraps once the user pauses.
    useEffect(() => {
        const t = setTimeout(() => setSandboxCode(liveCode), 400);
        return () => clearTimeout(t);
    }, [liveCode]);

    // Capture console.log and runtime errors posted from iframe sandbox
    useEffect(() => {
        const handleMessage = (e: MessageEvent) => {
            if (e.data?.type === 'PREVIEW_CONSOLE') {
                const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                setConsoleLogs((prev) => [...prev.slice(-99), { level: e.data.level || 'info', text: e.data.text, time }]);
            }
        };
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    // ── Real VFS: parse `// file:` spans from the live source ──────────────
    const spans = useMemo<VfsSpan[]>(
        () => buildFileSpans({ ...artifact, code: liveCode }),
        [artifact, liveCode],
    );
    const entryPath = useMemo(() => {
        const def = artifact.type === 'python' ? 'main.py' : artifact.type === 'html' ? 'index.html' : 'App.tsx';
        const hit = spans.find((s) => s.path.toLowerCase() === def.toLowerCase());
        return (hit ?? spans[0])?.path ?? def;
    }, [spans, artifact.type]);

    // Track which file the caret sits in so the explorer highlights it.
    const syncActivePath = useCallback(() => {
        const el = textareaRef.current;
        if (!el) return;
        const pos = el.selectionStart ?? 0;
        const hit = spans.find((s) => pos >= s.start && pos < s.end)
            ?? spans.filter((s) => s.start <= pos).pop()
            ?? spans[0];
        if (hit) setActivePath(hit.path);
    }, [spans]);

    const jumpToFile = useCallback((span: VfsSpan) => {
        setActivePath(span.path);
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(span.start, span.start);
        const line = liveCode.slice(0, span.start).split('\n').length - 1;
        el.scrollTop = Math.max(0, line * EDITOR_LINE_HEIGHT - EDITOR_LINE_HEIGHT * 2);
    }, [liveCode]);

    // The sandbox / deploy path uses the debounced `sandboxCode` so the iframe
    // doesn't re-bootstrap on every keystroke.
    const activeArtifact = useMemo(() => ({ ...artifact, code: sandboxCode }), [artifact, sandboxCode]);
    const liveArtifact = useMemo(() => ({ ...artifact, code: liveCode }), [artifact, liveCode]);
    const sandboxDoc = useMemo(() => buildSandboxDoc(activeArtifact), [activeArtifact]);

    // Route prompt injection through the page callback when available (it
    // targets the chat input by id); fall back to first-textarea lookup.
    const injectPrompt = useCallback((text: string) => {
        if (onInjectPrompt) {
            onInjectPrompt(text);
            return;
        }
        const promptBox = document.querySelector('textarea') as HTMLTextAreaElement | null;
        if (promptBox) {
            promptBox.value = text;
            promptBox.focus();
        } else if (onRemix) {
            onRemix(text);
        }
    }, [onInjectPrompt, onRemix]);

    const handleCopy = useCallback(() => {
        navigator.clipboard.writeText(liveCode).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }, [liveCode]);

    const handleOpenNewTab = useCallback(() => {
        const blob = new Blob([sandboxDoc], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
    }, [sandboxDoc]);

    const handleDeployFirebase = useCallback(async () => {
        setDeploying(true);
        try {
            if (!user) {
                alert('Please sign in to deploy a preview.');
                return;
            }
            // P2-15: server requires a Firebase ID token; the deploy is now
            // tied to the signed-in uid rather than anonymous.
            const idToken = await user.getIdToken();
            const res = await fetch('/api/playground/preview', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({ artifact: activeArtifact }),
            });
            const data = await res.json();
            if (data.url) {
                setDeployUrl(data.url);
                await navigator.clipboard.writeText(data.url);
                window.open(data.url, '_blank');
            }
        } catch (err) {
            console.error('Firebase preview deployment error:', err);
        } finally {
            setDeploying(false);
        }
    }, [activeArtifact, user]);

    const handleDownload = useCallback(() => {
        const fileName = `cybrdeck-prototype-${Date.now()}.html`;
        // Always export self-contained runnable HTML doc so double clicking opens in any browser offline
        const blob = new Blob([sandboxDoc], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, [sandboxDoc]);

    /** Build Mode: export the whole project (source + scaffolding) as ZIP. */
    const handleExportZip = useCallback(() => {
        const project = buildProjectExport(liveArtifact);
        const blob = buildZipBlob(project.files.map((f) => ({ path: f.path, content: f.content })));
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cybrdeck-build-${Date.now()}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, [liveArtifact]);

    const handleRefresh = useCallback(() => setKey((k) => k + 1), []);

    const handleRefinementShortcut = useCallback((instruction: string) => {
        const errorLogs = consoleLogs.filter((l) => l.level === 'error').map((l) => l.text).join('\n');
        const consoleContext = errorLogs ? `\n\nRuntime Console Errors:\n${errorLogs}` : '';
        const fence = artifact.type === 'html' ? 'html' : artifact.type === 'python' ? 'python' : 'tsx';
        injectPrompt(`${instruction}${consoleContext}\n\nExisting Prototype Code:\n\`\`\`${fence}\n${liveCode}\n\`\`\``);
    }, [liveCode, consoleLogs, artifact.type, injectPrompt]);

    /** Build Mode: ask the AI to apply one of its own suggestions. */
    const handleApplySuggestion = useCallback((s: BuildSuggestion) => {
        const fence = artifact.type === 'html' ? 'html' : artifact.type === 'python' ? 'python' : 'tsx';
        const detail = s.detail ? ` — ${s.detail}` : '';
        injectPrompt(
            `Apply this enhancement to the prototype: ${s.title}${detail}\n\n` +
            `Return the COMPLETE updated project as ONE fenced \`\`\`${fence} block, keeping any \`// file:\` structure intact. Keep everything that already works.\n\n` +
            `Current project:\n\`\`\`${fence}\n${liveCode}\n\`\`\``,
        );
    }, [artifact.type, liveCode, injectPrompt]);

    // Device frame dimensions
    const deviceFrame: Record<DeviceMode, { width: string; height: string; label: string }> = {
        desktop: { width: '100%', height: '100%', label: 'Desktop' },
        tablet: { width: '768px', height: '1024px', label: 'Tablet' },
        mobile: { width: '375px', height: '812px', label: 'Mobile' },
    };
    const frame = deviceFrame[device];
    const isConstrained = device !== 'desktop';

    return (
        <div
            className={cn(
                'flex flex-col border-l border-border bg-card select-none',
                fullscreen
                    ? 'fixed inset-0 z-50 h-dvh w-screen'
                    : 'h-full',
                className,
            )}
        >
            {/* ── Toolbar ─────────────────────────────────────────────── */}
            <div className="flex shrink-0 items-center gap-2 border-b border-border bg-background/80 px-3 py-2 backdrop-blur">
                {/* View toggle */}
                <div className="flex rounded-md border border-border bg-muted/30 p-0.5">
                    <button
                        type="button"
                        onClick={() => setViewMode('preview')}
                        className={cn(
                            'flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors',
                            viewMode === 'preview'
                                ? 'bg-background text-foreground shadow-sm font-semibold'
                                : 'text-muted-foreground hover:text-foreground',
                        )}
                    >
                        <Icon name="show" className="h-3 w-3" /> Live Preview
                    </button>
                    <button
                        type="button"
                        onClick={() => { setViewMode('code'); setActivePath(entryPath); }}
                        className={cn(
                            'flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors',
                            viewMode === 'code'
                                ? 'bg-background text-foreground shadow-sm font-semibold'
                                : 'text-muted-foreground hover:text-foreground',
                        )}
                    >
                        <Icon name="code" className="h-3 w-3" /> Live Code Editor
                    </button>
                </div>

                {/* Device toggles — only visible in Preview mode */}
                {viewMode === 'preview' && (
                    <div className="flex rounded-md border border-border bg-muted/30 p-0.5">
                        {(['desktop', 'tablet', 'mobile'] as const).map((d) => (
                            <button
                                key={d}
                                type="button"
                                onClick={() => setDevice(d)}
                                title={deviceFrame[d].label}
                                className={cn(
                                    'flex items-center justify-center rounded px-2 py-1 transition-colors',
                                    device === d
                                        ? 'bg-background text-foreground shadow-sm'
                                        : 'text-muted-foreground hover:text-foreground',
                                )}
                            >
                                {d === 'desktop' ? (
                                    <Icon name="monitor" className="h-3 w-3" />
                                ) : d === 'tablet' ? (
                                    <Icon name="monitor" className="h-3 w-3 scale-75" />
                                ) : (
                                    <Icon name="mobile" className="h-3 w-3" />
                                )}
                            </button>
                        ))}
                    </div>
                )}

                {/* Type badge + file count */}
                <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-400 uppercase tracking-wider">
                    {artifact.lang}
                </span>
                {spans.length > 1 && (
                    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400" title="Files detected in this prototype">
                        {spans.length} files
                    </span>
                )}

                <div className="ml-auto flex items-center gap-1.5">
                    {onRemix && (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => onRemix(liveCode)}
                            className="h-7 text-[11px] border-brand-500/40 text-brand-400 hover:bg-brand-500/20 gap-1 px-2"
                            title="Refine/Remix code in chat"
                        >
                            <Sparkles className="h-3 w-3" /> Remix
                        </Button>
                    )}

                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleExportZip}
                        className="h-7 text-[11px] border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/20 gap-1 px-2"
                        title="Download the full project (source, package.json, .env.example) as a ZIP"
                    >
                        <Icon name="download" className="h-3 w-3" /> Export Project
                    </Button>

                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={deploying}
                        onClick={handleDeployFirebase}
                        className="h-7 text-[11px] border-amber-500/40 text-amber-400 hover:bg-amber-500/20 gap-1 px-2"
                        title="Deploy & share live preview on Firebase"
                    >
                        {deploying ? <Icon name="loading" className="h-3 w-3 animate-spin" /> : <Icon name="cloud-upload" className="h-3 w-3" />}
                        {deployUrl ? 'Shared Link!' : 'Deploy Preview'}
                    </Button>

                    <button
                        type="button"
                        onClick={handleOpenNewTab}
                        title="Open preview in new tab"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                        <Icon name="external-link" className="h-3 w-3" />
                    </button>

                    {viewMode === 'preview' && (
                        <button
                            type="button"
                            onClick={handleRefresh}
                            title="Refresh preview"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                            <Icon name="refresh" className="h-3 w-3" />
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={handleCopy}
                        title="Copy source code"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                        {copied ? <Icon name="check" className="h-3 w-3 text-emerald-400" /> : <Icon name="copy" className="h-3 w-3" />}
                    </button>
                    <button
                        type="button"
                        onClick={handleDownload}
                        title="Download runnable app as a single offline HTML file"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                        <Icon name="download" className="h-3 w-3" />
                    </button>
                    <button
                        type="button"
                        onClick={() => setFullscreen((f) => !f)}
                        title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                        {fullscreen ? <Icon name="shrink" className="h-3 w-3" /> : <Icon name="expand" className="h-3 w-3" />}
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        title="Close preview"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground"
                    >
                        <Icon name="close-md" className="h-3 w-3" />
                    </button>
                </div>
            </div>

            {/* Quick Refinement Prompt Shortcuts Rail */}
            <div className="flex items-center gap-1.5 border-b border-border bg-slate-950/80 px-3 py-1.5 overflow-x-auto text-[10px]">
                <span className="text-muted-foreground font-semibold uppercase tracking-wider text-[9px] shrink-0 mr-1">Quick Prompt Refine:</span>
                {[
                    { label: '🎨 Dark Theme', prompt: 'Refine UI with a dark mode glassmorphism layout and cyan/emerald accents.' },
                    { label: '📱 Responsive', prompt: 'Make this layout fully mobile-responsive with collapsible navigation and grid layout.' },
                    { label: '⚡ Animations', prompt: 'Add interactive states, hover effects, and micro-animations to buttons and cards.' },
                    { label: '🛠️ Fix Errors', prompt: 'Analyze and resolve any runtime console warnings or styling bugs in this code.' }
                ].map((item, idx) => (
                    <button
                        key={idx}
                        type="button"
                        onClick={() => handleRefinementShortcut(item.prompt)}
                        className="shrink-0 rounded-full border border-border bg-card/60 px-2.5 py-0.5 text-muted-foreground hover:text-foreground hover:border-brand-500/40 hover:bg-brand-950/20 transition-all font-medium"
                    >
                        {item.label}
                    </button>
                ))}
            </div>

            {/* AI Feature Suggestions Rail — workbench-wide, not mode-gated */}
            <div className="flex items-center gap-1.5 border-b border-border bg-slate-950/60 px-3 py-1.5 overflow-x-auto text-[10px]">
                    <span className="text-violet-300 font-semibold uppercase tracking-wider text-[9px] shrink-0 mr-1">AI Features:</span>
                    <button
                        type="button"
                        disabled={suggestionsLoading || !onRequestSuggestions}
                        onClick={() => onRequestSuggestions?.(liveCode)}
                        className="shrink-0 inline-flex items-center gap-1 rounded-full border border-violet-500/40 bg-violet-500/10 px-2.5 py-0.5 font-medium text-violet-300 hover:bg-violet-500/20 hover:border-violet-400/60 transition-all disabled:opacity-50"
                        title="Ask the AI to propose 3 enhancements for this prototype"
                    >
                        {suggestionsLoading
                            ? <><Icon name="loading" className="h-3 w-3 animate-spin" /> Thinking…</>
                            : <><Sparkles className="h-3 w-3" /> Suggest features</>}
                    </button>
                    {suggestions && suggestions.length === 0 && !suggestionsLoading && (
                        <span className="text-muted-foreground italic">No suggestions parsed — try again.</span>
                    )}
                    {suggestions?.map((s, idx) => (
                        <button
                            key={idx}
                            type="button"
                            onClick={() => handleApplySuggestion(s)}
                            title={`${s.detail || 'Apply this enhancement'} — click to draft the refinement prompt`}
                            className="shrink-0 max-w-[260px] rounded-full border border-border bg-card/60 px-2.5 py-0.5 text-left text-muted-foreground hover:text-foreground hover:border-violet-500/50 hover:bg-violet-950/20 transition-all"
                        >
                            <span className="font-medium text-foreground/90">✨ {s.title}</span>
                            {s.detail && <span className="hidden sm:inline text-slate-500"> — {s.detail.length > 70 ? `${s.detail.slice(0, 70)}…` : s.detail}</span>}
                        </button>
                    ))}
            </div>

            {/* ── Body ─────────────────────────────────────────────────── */}
            {viewMode === 'preview' ? (
                <div className="flex flex-col flex-1 min-h-0 overflow-hidden relative">
                    <div className="flex flex-1 min-h-0 items-center justify-center overflow-auto bg-[repeating-conic-gradient(#ffffff08_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] p-4">
                        <div
                            style={
                                isConstrained
                                    ? {
                                          width: frame.width,
                                          height: frame.height,
                                          flexShrink: 0,
                                          overflow: 'hidden',
                                          borderRadius: '12px',
                                          boxShadow: '0 0 0 2px hsl(var(--border)), 0 8px 32px rgba(0,0,0,0.4)',
                                      }
                                    : { width: '100%', height: '100%', minHeight: 0 }
                            }
                            className="relative"
                        >
                            {isConstrained && (
                                <div className="absolute -top-6 left-0 right-0 flex justify-center">
                                    <span className="text-[10px] text-muted-foreground">
                                        {frame.width} × {frame.height}
                                    </span>
                                </div>
                            )}
                            <iframe
                                key={key}
                                ref={iframeRef}
                                srcDoc={sandboxDoc}
                                title="Cybrdeck Artifact Preview"
                                sandbox="allow-scripts allow-same-origin allow-modals allow-forms allow-popups"
                                className="h-full w-full rounded-[inherit] border-0 bg-white"
                            />
                        </div>
                    </div>

                    {/* Developer Console & Diagnostics Drawer */}
                    <div className="border-t border-border bg-slate-950 shrink-0">
                        <div className="flex items-center justify-between px-3 py-1.5 bg-card/40 border-b border-border/40">
                            <button
                                type="button"
                                onClick={() => setIsConsoleOpen((o) => !o)}
                                className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors"
                            >
                                <span className={cn("h-2 w-2 rounded-full", consoleLogs.some((l) => l.level === 'error') ? 'bg-red-500 animate-pulse' : 'bg-emerald-500')} />
                                <span>Developer Console & Diagnostics</span>
                                <span className="text-slate-500 font-normal">({consoleLogs.length} events)</span>
                            </button>
                            <div className="flex items-center gap-2">
                                {consoleLogs.some((l) => l.level === 'error') && (
                                    <button
                                        type="button"
                                        onClick={() => handleRefinementShortcut('Analyze and resolve this runtime error in the prototype component:')}
                                        className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500/30 transition-colors animate-pulse"
                                        title="Trigger autonomous AI repair payload for this error"
                                    >
                                        <Sparkles className="h-3 w-3" /> Auto-Fix Runtime Error
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setIsConsoleOpen((o) => !o)}
                                    className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    {isConsoleOpen ? 'Collapse ▲' : 'Expand Console ▼'}
                                </button>
                            </div>
                        </div>
                        {isConsoleOpen && (
                            <div className="h-32 overflow-auto p-2 font-mono text-[10px] space-y-1 bg-black/90">
                                {consoleLogs.length === 0 ? (
                                    <div className="text-slate-600 text-center py-4">No console logs or errors recorded.</div>
                                ) : (
                                    consoleLogs.map((log, idx) => (
                                        <div
                                            key={idx}
                                            className={cn(
                                                "flex items-start gap-2 leading-relaxed px-1 py-0.5 rounded",
                                                log.level === 'error' ? "bg-red-950/40 text-red-400 border border-red-900/30" :
                                                log.level === 'warn' ? "bg-amber-950/30 text-amber-300" : "text-slate-300"
                                            )}
                                        >
                                            <span className="text-slate-500 shrink-0">{log.time}</span>
                                            <span className={cn("uppercase font-bold shrink-0 text-[8px] px-1 rounded", log.level === 'error' ? "bg-red-900/60 text-red-200" : "bg-slate-800 text-slate-400")}>
                                                {log.level}
                                            </span>
                                            <span className="break-all">{log.text}</span>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                /* Live Code Editor: file explorer + interactive editor split */
                <div className="flex flex-1 min-h-0 overflow-hidden">
                    {/* File Explorer — real VFS from `// file:` spans */}
                    <div className="w-44 shrink-0 overflow-y-auto border-r border-border bg-card/60 py-2">
                        <div className="px-3 pb-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Project Files
                        </div>
                        {spans.map((span) => {
                            const icon = fileIcon(span.path);
                            const isActive = activePath === span.path;
                            const isEntry = entryPath === span.path;
                            const lines = span.content.split('\n').length;
                            return (
                                <button
                                    key={span.path}
                                    type="button"
                                    onClick={() => jumpToFile(span)}
                                    title={`${span.path} — ${lines} lines${isEntry ? ' (entry point)' : ''}`}
                                    className={cn(
                                        'flex w-full items-center gap-1.5 px-3 py-1 text-left text-[11px] transition-colors',
                                        isActive
                                            ? 'bg-primary/10 text-primary font-medium'
                                            : 'text-foreground/80 hover:text-foreground hover:bg-muted/40',
                                    )}
                                >
                                    <Icon name={icon.name} className={cn('h-3 w-3 shrink-0', icon.className)} />
                                    <span className="truncate">{span.path.split('/').pop()}</span>
                                    {isEntry && (
                                        <span className="ml-auto shrink-0 rounded bg-emerald-500/15 px-1 text-[8px] font-bold uppercase text-emerald-400">
                                            entry
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                        <div className="mt-2 px-3 text-[9px] leading-relaxed text-slate-500">
                            {spans.length > 1
                                ? 'Separate files inside the source with `// file: path` lines.'
                                : 'Add `// file: path` markers to split this into a multi-file project.'}
                        </div>
                    </div>

                    {/* Interactive Code Editor */}
                    <div className="flex flex-1 min-w-0 flex-col overflow-hidden">
                        <div className="flex items-center gap-2 border-b border-border bg-muted/20 px-3 py-1.5">
                            <Icon name="file-code" className="h-3 w-3 text-sky-400" />
                            <span className="font-mono text-[11px] text-muted-foreground truncate">
                                {activePath ?? entryPath}
                            </span>
                            <span className="ml-auto text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                Live Editing Active
                            </span>
                        </div>
                        <textarea
                            ref={textareaRef}
                            value={liveCode}
                            onChange={(e) => setLiveCode(e.target.value)}
                            onKeyUp={syncActivePath}
                            onClick={syncActivePath}
                            onSelect={syncActivePath}
                            spellCheck={false}
                            className="custom-scrollbar flex-1 w-full overflow-auto p-4 font-mono text-[11px] leading-relaxed text-foreground bg-slate-950 border-0 focus:outline-none focus:ring-0 resize-none"
                        />
                        <div className="p-2 border-t border-border bg-card/40 flex justify-end gap-2">
                            <Button
                                type="button"
                                size="sm"
                                onClick={() => {
                                    // Sync the live textarea value into the sandbox
                                    // immediately (bypassing the 400ms debounce) and
                                    // force the iframe to re-bootstrap with the new
                                    // code via a key bump.
                                    setSandboxCode(liveCode);
                                    setViewMode('preview');
                                    setKey((k) => k + 1);
                                }}
                                className="h-7 text-xs font-semibold uppercase tracking-wider"
                            >
                                Apply & View Live Prototype →
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
