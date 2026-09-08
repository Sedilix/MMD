'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export interface ContextTooltipProps {
  usedTokens: number;
  maxTokens: number;
  reservedTokens?: number;
  className?: string;
  arrowPosition?: 'top' | 'bottom';
}

export function formatTokenCount(num: number): string {
  if (num >= 1_000_000) {
    const val = num / 1_000_000;
    return val % 1 === 0 ? `${val.toFixed(0)}.0m` : `${val.toFixed(1)}m`;
  }
  if (num >= 1_000) {
    const val = num / 1_000;
    return val % 1 === 0 ? `${val.toFixed(0)}k` : `${val.toFixed(1)}k`;
  }
  return num.toString();
}

export function ContextTooltip({
  usedTokens,
  maxTokens,
  reservedTokens = 16400,
  className,
  arrowPosition = 'top',
}: ContextTooltipProps) {
  const safeMax = Math.max(1, maxTokens);
  const reserved = Math.min(reservedTokens, safeMax);
  const availableSpace = Math.max(0, safeMax - usedTokens - reserved);

  return (
    <div
      className={cn(
        'relative z-50 min-w-[260px] rounded-xl border border-brand-700/50 bg-[#042832] p-3 text-xs shadow-2xl backdrop-blur-md transition-all duration-200 text-brand-50',
        className
      )}
    >
      {/* Tooltip arrow */}
      <div
        className={cn(
          'absolute left-5 h-2.5 w-2.5 rotate-45 border border-brand-700/50 bg-[#042832]',
          arrowPosition === 'top'
            ? '-top-1.5 border-b-0 border-r-0'
            : '-bottom-1.5 border-t-0 border-l-0'
        )}
      />

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-4 font-sans text-xs">
          <span className="font-semibold text-brand-100/90">Tokens used</span>
          <span className="font-mono text-brand-100 font-bold">
            {formatTokenCount(usedTokens)} / {formatTokenCount(safeMax)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-4 font-sans text-xs">
          <span className="font-semibold text-brand-100/90">Reserved for response</span>
          <span className="font-mono text-brand-100/80">
            {formatTokenCount(reserved)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-4 font-sans text-xs">
          <span className="font-semibold text-brand-100/90">Available space</span>
          <span className="font-mono text-brand-100/80">
            {formatTokenCount(availableSpace)}
          </span>
        </div>
      </div>
    </div>
  );
}
