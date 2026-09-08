'use client';

import React from 'react';
import { Icon } from '@/components/ui/icon';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ModelRegistryEntry, MMDConfig } from '@/lib/playground/types';
import { Brain } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MMDDrawerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    config: MMDConfig;
    onChange: (config: MMDConfig) => void;
    models: readonly ModelRegistryEntry[];
    columns: { id: string; modelId: string }[];
    /**
     * When true, the chairman `<select>` filters to guest-access models so an
     * unauthenticated visitor can't pick a registered-tier synthesizer (the
     * server gate would 402 the call anyway, but the UI shouldn't offer the
     * option). Audit #15.
     */
    guestMode?: boolean;
}

export function MMDDrawer({
    open,
    onOpenChange,
    config,
    onChange,
    models,
    columns,
    guestMode = false,
}: MMDDrawerProps) {
    // Chairman candidates: in guest mode only guest-access models are pickable.
    const chairmanModels = guestMode
        ? models.filter((m) => m.access === 'guest')
        : models;
    const handleToggleEnabled = () => {
        onChange({ ...config, enabled: !config.enabled });
    };

    const handleTypeChange = (type: 'single' | 'multi') => {
        onChange({ ...config, discussionType: type });
    };

    const handleRoundsChange = (val: string) => {
        const num = Math.min(10, Math.max(1, parseInt(val, 10) || 1));
        onChange({ ...config, rounds: num });
    };

    const handleChairmanChange = (val: string) => {
        onChange({ ...config, chairmanModelId: val });
    };

    const handleObserverToggle = () => {
        onChange({ ...config, includeOneObserver: !config.includeOneObserver });
    };

    const handleModeChange = (mode: 'default' | 'selective') => {
        onChange({ ...config, mode });
    };

    const handleColumnToggle = (colId: string) => {
        const selected = [...config.selectedColumnIds];
        const idx = selected.indexOf(colId);
        if (idx > -1) {
            selected.splice(idx, 1);
        } else {
            selected.push(colId);
        }
        onChange({ ...config, selectedColumnIds: selected });
    };

    const handleNumberField = (field: keyof MMDConfig, val: string) => {
        const num = parseFloat(val) || 0;
        onChange({ ...config, [field]: num });
    };

    const handleWeightChange = (modelId: string, val: string) => {
        const num = parseFloat(val) || 0;
        onChange({
            ...config,
            weighting: {
                ...config.weighting,
                [modelId]: Math.min(1, Math.max(0, num)),
            },
        });
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-full sm:max-w-md overflow-y-auto bg-background border-l border-border p-6 font-sans">
                <SheetHeader className="mb-6">
                    <div className="flex items-center gap-2">
                        <Brain className="h-5 w-5 text-primary" />
                        <SheetTitle className="text-lg font-semibold tracking-tight text-foreground">
                            Multi-Model Discussion
                        </SheetTitle>
                    </div>
                    <SheetDescription className="text-xs text-muted-foreground">
                        Configure collaborative decision-making across multiple language models.
                    </SheetDescription>
                </SheetHeader>

                <div className="space-y-6">
                    {/* Enable MMD */}
                    <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 p-4">
                        <div className="space-y-0.5">
                            <span className="text-sm font-medium text-foreground">Enable Discussion Mode</span>
                            <p className="text-xs text-muted-foreground">Route prompts through the MMD pipeline.</p>
                        </div>
                        <button
                            type="button"
                            onClick={handleToggleEnabled}
                            className={cn(
                                "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                                config.enabled ? "bg-primary" : "bg-muted"
                            )}
                        >
                            <span
                                className={cn(
                                    "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow-lg ring-0 transition duration-200 ease-in-out",
                                    config.enabled ? "translate-x-5" : "translate-x-0"
                                )}
                            />
                        </button>
                    </div>

                    {/* MMD Config options (disabled if MMD is not enabled) */}
                    <div className={cn("space-y-6 transition-opacity duration-200", !config.enabled && "opacity-50 pointer-events-none")}>
                        {/* Execution Architecture */}
                        <div className="space-y-2">
                            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                                <span>Execution Architecture</span>
                                <span className="text-[10px] text-brand-400 font-mono font-bold">
                                    {(config.executionMode || 'parallel') === 'parallel' ? '⚡ Parallel' : '🔗 Relay'}
                                </span>
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                <Button
                                    variant={(config.executionMode || 'parallel') === 'parallel' ? 'default' : 'outline'}
                                    onClick={() => onChange({ ...config, executionMode: 'parallel' })}
                                    className="h-9 text-xs font-semibold"
                                    type="button"
                                >
                                    ⚡ Parallel Mode
                                </Button>
                                <Button
                                    variant={(config.executionMode || 'parallel') === 'relay' ? 'default' : 'outline'}
                                    onClick={() => onChange({ ...config, executionMode: 'relay' })}
                                    className="h-9 text-xs font-semibold"
                                    type="button"
                                >
                                    🔗 Relay Mode
                                </Button>
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-relaxed mt-1">
                                {(config.executionMode || 'parallel') === 'parallel'
                                    ? 'All open model windows execute simultaneously in parallel for fast, multi-perspective debate.'
                                    : 'Models run sequentially in a chain-of-thought relay pipeline, where each model builds upon and refines the previous model\'s output before final Chairman synthesis.'}
                            </p>
                        </div>

                        {/* Inter-Session Topology (Swarm) */}
                        <div className="space-y-2">
                            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                                <span>Inter-Agent Topology</span>
                                <span className="text-[10px] text-amber-400 font-mono font-bold">
                                    {(config.topology ?? 'isolated') === 'swarm' ? '🐝 Swarm' : '🔒 Isolated'}
                                </span>
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                <Button
                                    variant={(config.topology ?? 'isolated') === 'isolated' ? 'default' : 'outline'}
                                    onClick={() => onChange({ ...config, topology: 'isolated' })}
                                    className="h-9 text-xs font-semibold"
                                    type="button"
                                >
                                    🔒 Isolated
                                </Button>
                                <Button
                                    variant={(config.topology ?? 'isolated') === 'swarm' ? 'default' : 'outline'}
                                    onClick={() => onChange({ ...config, topology: 'swarm' })}
                                    className="h-9 text-xs font-semibold"
                                    type="button"
                                >
                                    🐝 Swarm Mode
                                </Button>
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-relaxed mt-1">
                                {(config.topology ?? 'isolated') === 'swarm'
                                    ? 'Columns can pass mid-task peer updates ([TELL <col>]) to siblings, which re-activate and incorporate them before final Chairman synthesis. Bounded by a hop cap and settle window.'
                                    : 'Columns work independently. This is the original MMD behavior — no inter-column messaging mid-task.'}
                            </p>
                        </div>

                        {/* Discussion Type */}
                        <div className="space-y-2">
                            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Discussion Type
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                <Button
                                    variant={config.discussionType === 'single' ? 'default' : 'outline'}
                                    onClick={() => handleTypeChange('single')}
                                    className="h-9 text-xs"
                                    type="button"
                                >
                                    Single Round
                                </Button>
                                <Button
                                    variant={config.discussionType === 'multi' ? 'default' : 'outline'}
                                    onClick={() => handleTypeChange('multi')}
                                    className="h-9 text-xs"
                                    type="button"
                                >
                                    Multi-Round
                                </Button>
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-1">
                                {config.discussionType === 'single'
                                    ? 'Models respond independently once, then the chairman synthesizes.'
                                    : 'A multi-round feedback loop where models refine outputs based on peer critiques.'}
                            </p>
                        </div>

                        {/* Rounds Input if Multi-Round */}
                        {config.discussionType === 'multi' && (
                            <div className="space-y-2">
                                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    Number of Rounds (1-10)
                                </label>
                                <Input
                                    type="number"
                                    min={1}
                                    max={10}
                                    value={config.rounds}
                                    onChange={(e) => handleRoundsChange(e.target.value)}
                                    className="h-9"
                                />
                            </div>
                        )}

                        {/* Chairman Model Selector */}
                        <div className="space-y-2">
                            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Chairman Model
                            </label>
                            <select
                                value={config.chairmanModelId}
                                onChange={(e) => handleChairmanChange(e.target.value)}
                                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                            >
                                {chairmanModels.map((m) => (
                                    <option key={m.id} value={m.id}>
                                        {m.displayName}
                                    </option>
                                ))}
                            </select>
                            <p className="text-[11px] text-muted-foreground">
                                Responsible for synthesizing consensus and generating the final outcome.
                            </p>
                        </div>

                        {/* Observer Option */}
                        <div className="flex items-center justify-between rounded-md border border-border bg-card p-3">
                            <div className="space-y-0.5">
                                <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
                                    <Icon name="shield-check" className="h-3.5 w-3.5 text-sky-500" />
                                    Include One as observer
                                </span>
                                <p className="text-[10px] text-muted-foreground">Allows the "One" model to observe and learn from this discussion.</p>
                            </div>
                            <button
                                type="button"
                                onClick={handleObserverToggle}
                                className={cn(
                                    "relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                                    config.includeOneObserver ? "bg-sky-600" : "bg-muted"
                                )}
                            >
                                <span
                                    className={cn(
                                        "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out",
                                        config.includeOneObserver ? "translate-x-4" : "translate-x-0"
                                    )}
                                />
                            </button>
                        </div>

                        {/* Mode (Default vs Selective) */}
                        <div className="space-y-2">
                            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Column Inclusion Mode
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                <Button
                                    variant={config.mode === 'default' ? 'default' : 'outline'}
                                    onClick={() => handleModeChange('default')}
                                    className="h-8 text-xs"
                                    type="button"
                                >
                                    Default (All)
                                </Button>
                                <Button
                                    variant={config.mode === 'selective' ? 'default' : 'outline'}
                                    onClick={() => handleModeChange('selective')}
                                    className="h-8 text-xs"
                                    type="button"
                                >
                                    Selective
                                </Button>
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-1">
                                {config.mode === 'default'
                                    ? 'All active models in your playground workspace will be included.'
                                    : 'Choose specifically which models should take part in this discussion.'}
                            </p>
                        </div>

                        {/* Selective Column Checkboxes */}
                        {config.mode === 'selective' && (
                            <div className="space-y-2 border rounded-lg p-3 bg-muted/20">
                                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-2">
                                    Select Columns to Include
                                </label>
                                <div className="space-y-2">
                                    {columns.map((col) => {
                                        const modelInfo = models.find(m => m.id === col.modelId);
                                        const isChecked = config.selectedColumnIds.includes(col.id);
                                        return (
                                            <div
                                                key={col.id}
                                                className="flex items-center gap-2 text-xs cursor-pointer p-1.5 rounded hover:bg-muted/40 transition-colors"
                                                onClick={() => handleColumnToggle(col.id)}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={isChecked}
                                                    onChange={() => {}} // handled by parent div onClick
                                                    className="rounded border-input text-primary focus:ring-ring"
                                                />
                                                <span className="font-medium text-foreground">
                                                    {modelInfo ? modelInfo.displayName : 'Unknown Model'}
                                                </span>
                                                <span className="text-[10px] text-muted-foreground font-mono">
                                                    ({col.id.slice(0, 6)})
                                                </span>
                                            </div>
                                        );
                                    })}
                                    {columns.length === 0 && (
                                        <p className="text-xs text-muted-foreground italic">No columns active in the workspace.</p>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Advanced Settings */}
                        <div className="border-t border-border pt-4">
                            <details className="group">
                                <summary className="flex items-center justify-between cursor-pointer select-none text-xs font-semibold uppercase tracking-wider text-muted-foreground list-none">
                                    <span className="flex items-center gap-1.5">
                                        <Icon name="settings" className="h-3.5 w-3.5" />
                                        Advanced Controls
                                    </span>
                                    <span className="transition-transform group-open:rotate-180">▼</span>
                                </summary>

                                <div className="mt-4 space-y-4">
                                    {/* Timeout & Retries */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-medium text-muted-foreground block">
                                                Timeout (ms)
                                            </label>
                                            <Input
                                                type="number"
                                                value={config.timeoutMs}
                                                onChange={(e) => handleNumberField('timeoutMs', e.target.value)}
                                                className="h-8"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-medium text-muted-foreground block">
                                                Retries
                                            </label>
                                            <Input
                                                type="number"
                                                value={config.retries}
                                                onChange={(e) => handleNumberField('retries', e.target.value)}
                                                className="h-8"
                                            />
                                        </div>
                                    </div>

                                    {/* Credit limit */}
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-medium text-muted-foreground block">
                                            Credit Consumption Limit (total)
                                        </label>
                                        <Input
                                            type="number"
                                            value={config.creditLimit}
                                            onChange={(e) => handleNumberField('creditLimit', e.target.value)}
                                            className="h-8"
                                        />
                                    </div>

                                    {/* Swarm tuning — only relevant in swarm topology */}
                                    <div className={cn('space-y-3', (config.topology ?? 'isolated') !== 'swarm' && 'opacity-40 pointer-events-none')}>
                                        <div className="rounded-md bg-amber-500/5 border border-amber-500/20 p-2.5 text-[10px] leading-relaxed text-muted-foreground flex gap-1.5">
                                            <Icon name="info" className="h-3.5 w-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                                            <span>
                                                Swarm guards against runaway chatter: the hop cap cuts A↔B ping-pong, and the settle window forces convergence when no new peer messages arrive.
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-medium text-muted-foreground block">
                                                    Max Hops
                                                </label>
                                                <Input
                                                    type="number"
                                                    min={1}
                                                    max={10}
                                                    value={config.swarmMaxHops ?? 3}
                                                    onChange={(e) => onChange({ ...config, swarmMaxHops: Math.min(10, Math.max(1, parseInt(e.target.value, 10) || 3)) })}
                                                    className="h-8"
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-medium text-muted-foreground block">
                                                    Settle Window (ms)
                                                </label>
                                                <Input
                                                    type="number"
                                                    min={500}
                                                    step={500}
                                                    value={config.swarmSettleMs ?? 4000}
                                                    onChange={(e) => onChange({ ...config, swarmSettleMs: Math.max(500, parseInt(e.target.value, 10) || 4000) })}
                                                    className="h-8"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Model weighting description */}
                                    <div className="rounded-md bg-muted/30 p-2.5 text-[10px] leading-relaxed text-muted-foreground flex gap-1.5">
                                        <Icon name="info" className="h-3.5 w-3.5 text-primary flex-shrink-0 mt-0.5" />
                                        <span>
                                            Model weighting assigns relative influence to each member's answers in the final synthesis. Defaults to equal weight (1.0).
                                        </span>
                                    </div>

                                    {/* Model Weights */}
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-medium text-muted-foreground block">
                                            Model Weights
                                        </label>
                                        <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                                            {columns.map((col) => {
                                                const modelInfo = models.find(m => m.id === col.modelId);
                                                if (!modelInfo) return null;
                                                const weight = config.weighting[col.modelId] ?? 1.0;
                                                return (
                                                    <div key={col.id} className="flex items-center justify-between gap-4 text-xs">
                                                        <span className="truncate max-w-[150px] font-medium text-foreground">{modelInfo.displayName}</span>
                                                        <Input
                                                            type="number"
                                                            step={0.1}
                                                            min={0}
                                                            max={1}
                                                            value={weight}
                                                            onChange={(e) => handleWeightChange(col.modelId, e.target.value)}
                                                            className="h-7 w-20 text-right pr-1"
                                                        />
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </details>
                        </div>
                    </div>
                </div>

                <div className="mt-8 flex justify-end gap-2 border-t border-border pt-4">
                    <Button variant="ghost" onClick={() => onOpenChange(false)} className="h-9 text-xs" type="button">
                        Cancel
                    </Button>
                    <Button onClick={() => onOpenChange(false)} className="h-9 text-xs bg-primary hover:bg-primary/95 text-primary-foreground" type="button">
                        Apply Settings
                    </Button>
                </div>
            </SheetContent>
        </Sheet>
    );
}
