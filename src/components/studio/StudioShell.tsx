'use client';

import React from 'react';
import { Icon } from '@/components/ui/icon';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface StudioShellProps {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  headerActions?: React.ReactNode;
  icon?: React.ElementType;
}

export function StudioShell({
  title,
  description,
  onClose,
  children,
  headerActions,
  icon: Icon = Sparkles,
}: StudioShellProps) {
  return (
    <div className="flex h-full w-full flex-col bg-background text-foreground overflow-hidden">
      {/* Studio Header */}
      <header className="flex h-12 sm:h-14 items-center justify-between border-b border-border bg-card/50 px-3 sm:px-6 py-2 select-none shrink-0 relative z-30">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="flex items-center justify-center h-7 w-7 sm:h-8 sm:w-8 rounded-lg bg-primary/10 border border-primary/20 text-primary shrink-0">
            <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xs sm:text-sm font-semibold tracking-tight text-foreground truncate">{title}</h1>
            {description && (
              <p className="text-[11px] text-muted-foreground hidden sm:block truncate max-w-xs">{description}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {headerActions}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-7 w-7 sm:h-8 sm:w-8 p-0 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
            title="Back to chat workbench"
          >
            <Icon name="close-md" className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Main Studio Workspace */}
      <main className="flex-1 min-h-0 relative bg-background flex flex-col overflow-visible">
        {children}
      </main>
    </div>
  );
}
