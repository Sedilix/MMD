'use client';

import React, { useState, useRef } from 'react';
import { Icon } from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ContextRadial } from './ContextRadial';
import { formatTokenCount } from './ContextTooltip';
import { Brain, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PlaygroundPromptBarProps {
  prompt: string;
  onPromptChange: (val: string) => void;
  onSend: (mode: 'all' | 'selected') => void;
  isGuest: boolean;
  columnCount: number;
  maxColumns: number;
  onAddColumn: () => void;
  mmdEnabled: boolean;
  onToggleMmd: () => void;
  onOpenMmdSettings: () => void;
  selectedColumnCount: number;
  totalTokensUsed: number;
  maxContextLimit: number;
  sessionCost: number;
  onIngestFiles: (files: File[]) => void;
  onOpenSkillsModal?: () => void;
  enabledSkillsCount?: number;
}

export function PlaygroundPromptBar({
  prompt,
  onPromptChange,
  onSend,
  isGuest,
  columnCount,
  maxColumns,
  onAddColumn,
  mmdEnabled,
  onToggleMmd,
  onOpenMmdSettings,
  selectedColumnCount,
  totalTokensUsed,
  maxContextLimit,
  sessionCost,
  onIngestFiles,
  onOpenSkillsModal,
  enabledSkillsCount = 0,
}: PlaygroundPromptBarProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const safeMax = Math.max(1, maxContextLimit);
  const contextRatio = Math.min(1, Math.max(0, totalTokensUsed / safeMax));

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onSend(selectedColumnCount > 0 ? 'selected' : 'all');
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      onIngestFiles(files);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onIngestFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onIngestFiles(Array.from(e.target.files));
    }
  };

  return (
    <div className="w-full space-y-3 font-sans">
      {/* Floating Glass Prompt Card */}
      <div
        className={cn(
          'relative overflow-hidden rounded-2xl border transition-all duration-200',
          'bg-[#031d24]/75 backdrop-blur-xl border-[#4a3a1e]/80 shadow-2xl',
          isDragging && 'border-brand-400 ring-2 ring-brand-400/30'
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Top Context Status Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#083e4e]/70 bg-[#02171d]/40 px-4 py-2 text-xs">
          <div className="flex items-center gap-2.5 text-brand-200/90 font-mono">
            {/* Context Radial % */}
            <ContextRadial
              usedTokens={totalTokensUsed}
              maxTokens={safeMax}
              size={18}
              strokeWidth={2.5}
              showPercentLabel={true}
              tooltipPosition="bottom"
            />

            <span className="text-brand-700 select-none">·</span>

            {/* Session Cost */}
            <span className="font-semibold text-brand-100 text-[11px]">
              ${sessionCost.toFixed(2)}
            </span>
          </div>

          <div className="flex items-center gap-3 font-mono text-xs text-brand-200/90">
            {/* Token count */}
            <span className="font-medium text-brand-100 text-[11px]">
              {formatTokenCount(totalTokensUsed)}
            </span>

            {/* Horizontal Track Bar */}
            <div className="h-2 w-28 sm:w-40 overflow-hidden rounded-full bg-brand-950/80 p-0.5 border border-brand-800/40">
              <div
                className="h-full rounded-full bg-brand-300 transition-all duration-300"
                style={{ width: `${Math.max(4, contextRatio * 100)}%` }}
              />
            </div>

            {/* Max Limit Badge */}
            <span className="font-bold text-brand-300 text-[11px]">
              {formatTokenCount(safeMax)}
            </span>
          </div>
        </div>

        {/* Prompt Input Box */}
        <div className="relative p-4 space-y-3 bg-transparent">
          <div className="relative flex items-start justify-between gap-3">
            <Textarea
              id="playground-prompt-input"
              value={prompt}
              onChange={(e) => onPromptChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder="Type a message..."
              className="min-h-[76px] max-h-[220px] flex-1 resize-none border-none bg-transparent p-0 text-brand-50 placeholder:text-brand-300/40 focus-visible:ring-0 focus-visible:ring-offset-0 font-sans leading-relaxed"
              rows={3}
            />

            {/* Right Side Attachment Trigger */}
            <div className="flex flex-col items-end gap-2 shrink-0">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileSelect}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#094d5e] bg-[#021820]/70 text-brand-300 transition-all hover:bg-brand-900/60 hover:text-white hover:border-brand-400 shadow-md"
                title="Attach files or images"
              >
                <Icon name="image" className="h-4 w-4" />
              </button>

              {/* Custom Skill Pill Button */}
              {onOpenSkillsModal && (
                <button
                  type="button"
                  onClick={onOpenSkillsModal}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all duration-200 select-none',
                    'border border-brand-800/60 bg-brand-950/60 text-brand-300 hover:bg-brand-900/70 hover:text-brand-100 hover:border-brand-400',
                    enabledSkillsCount > 0 && 'border-brand-400/80 bg-brand-900/80 text-brand-100'
                  )}
                  title="Manage custom skills"
                >
                  <Sparkles className="h-3 w-3 text-brand-300" />
                  <span>
                    {enabledSkillsCount > 0
                      ? `Skills (${enabledSkillsCount})`
                      : '+ Custom Skill'}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Helper Text Footer */}
          <div className="text-[11px] text-brand-400/60 font-sans tracking-wide select-none">
            (You can drag and drop files & images into the box.)
          </div>
        </div>
      </div>

      {/* Bottom Controls Bar (Column Controls + Send & Brand Icon) */}
      <div className="flex items-center justify-between gap-3 pt-1">
        {/* Left Group: MMD & Add Column Buttons */}
        <div className="flex items-center gap-2.5">
          {!isGuest && (
            <Button
              type="button"
              variant="outline"
              onClick={onToggleMmd}
              className={cn(
                'h-11 px-4 rounded-xl flex items-center gap-2 font-sans text-xs font-bold uppercase tracking-wider transition-all',
                'bg-[#02202a] border border-[#094d5e] text-brand-200 hover:bg-[#042e3d] hover:border-brand-400 hover:text-white shadow-md',
                mmdEnabled && 'bg-emerald-600/80 text-white border-transparent hover:bg-emerald-700'
              )}
              title="Multi-Model Discussion"
            >
              <Brain className="h-4 w-4 text-brand-400 shrink-0" />
              <span>MMD</span>
            </Button>
          )}

          {mmdEnabled && (
            <Button
              type="button"
              variant="outline"
              onClick={onOpenMmdSettings}
              className="h-11 px-3.5 rounded-xl bg-zinc-950 border border-brand-500/60 text-brand-300 shadow-md transition-all hover:bg-brand-950 hover:border-brand-400 hover:text-brand-200"
              title="MMD Settings"
            >
              <Icon name="settings" className="h-4 w-4 text-brand-300" />
            </Button>
          )}

          {!isGuest && (
            <Button
              type="button"
              variant="outline"
              onClick={onAddColumn}
              disabled={columnCount >= maxColumns}
              className="h-11 px-4 rounded-xl flex items-center gap-2 font-sans text-xs font-bold uppercase tracking-wider transition-all bg-[#02202a] border border-[#094d5e] text-brand-200 hover:bg-[#042e3d] hover:border-brand-400 hover:text-white shadow-md disabled:opacity-50"
              title="Add model column"
            >
              <Icon name="plus" className="h-4 w-4 text-brand-300 shrink-0" />
              <span>ADD COLUMN</span>
            </Button>
          )}
        </div>

        {/* Right Group: Send Button & Cybrdeck Logo Icon Box */}
        <div className="flex items-center gap-2.5 ml-auto">
          <Button
            type="button"
            onClick={() => onSend(selectedColumnCount > 0 ? 'selected' : 'all')}
            disabled={prompt.trim().length === 0}
            className={cn(
              'h-11 px-5 rounded-2xl flex items-center gap-2 font-semibold text-sm transition-all',
              'bg-[#2f8f6f] hover:bg-[#38a682] text-white shadow-lg shadow-emerald-950/40 disabled:opacity-50'
            )}
            title="Send prompt"
          >
            <Icon name="paper-plane" className="h-4 w-4 stroke-[2.2] shrink-0" />
            <span>
              {selectedColumnCount > 0
                ? `Send Selected (${selectedColumnCount})`
                : mmdEnabled
                ? 'Run MMD (All Columns)'
                : 'Send'}
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
}

export default PlaygroundPromptBar;
