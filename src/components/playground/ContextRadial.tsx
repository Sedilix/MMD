'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { ContextTooltip, formatTokenCount } from './ContextTooltip';

export interface ContextRadialProps {
  usedTokens: number;
  maxTokens: number;
  reservedTokens?: number;
  size?: number;
  strokeWidth?: number;
  showText?: boolean;
  showPercentLabel?: boolean;
  className?: string;
  tooltipPosition?: 'top' | 'bottom';
}

export function ContextRadial({
  usedTokens,
  maxTokens,
  reservedTokens,
  size = 24,
  strokeWidth = 2.5,
  showText = false,
  showPercentLabel = true,
  className,
  tooltipPosition = 'bottom',
}: ContextRadialProps) {
  const [isHovered, setIsHovered] = useState(false);

  const safeMax = Math.max(1, maxTokens);
  const percentage = Math.min(100, Math.max(0, (usedTokens / safeMax) * 100));

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div
      className={cn('relative inline-flex items-center gap-1.5 select-none cursor-pointer', className)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className="relative inline-flex items-center justify-center shrink-0"
        style={{ width: size, height: size }}
      >
        <svg className="transform -rotate-90" width={size} height={size}>
          {/* Background Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            className="stroke-brand-950/80"
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          {/* Active Progress Ring */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            className="stroke-brand-400 transition-all duration-300 ease-in-out"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="transparent"
          />
        </svg>

        {showText && (
          <span className="absolute text-[9px] font-bold text-brand-200">
            {Math.round(percentage)}%
          </span>
        )}
      </div>

      {showPercentLabel && (
        <span className="text-xs font-semibold font-mono text-brand-300/90">
          {Math.round(percentage)}%
        </span>
      )}

      {/* Hover Tooltip Card */}
      {isHovered && (
        <div
          className={cn(
            'absolute z-50 transition-all duration-200 animate-in fade-in zoom-in-95',
            tooltipPosition === 'bottom'
              ? 'top-full left-0 mt-2'
              : 'bottom-full left-0 mb-2'
          )}
        >
          <ContextTooltip
            usedTokens={usedTokens}
            maxTokens={safeMax}
            reservedTokens={reservedTokens}
            arrowPosition={tooltipPosition === 'bottom' ? 'top' : 'bottom'}
          />
        </div>
      )}
    </div>
  );
}
