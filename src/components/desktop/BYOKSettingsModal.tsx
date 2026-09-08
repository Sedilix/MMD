'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  BYOK_PROVIDERS,
  getBYOKKeys,
  setBYOKKey,
  clearAllBYOKKeys,
  type BYOKProvider,
  type BYOKKeys,
} from '@/lib/desktop/byok-store';
import { Icon } from '@/components/ui/icon';
import { openExternalUrl } from '@/lib/desktop/desktop-bridge';

interface BYOKSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BYOKSettingsModal({ open, onOpenChange }: BYOKSettingsModalProps) {
  const [keys, setKeys] = useState<BYOKKeys>({});
  const [visibleKey, setVisibleKey] = useState<Record<string, boolean>>({});
  const [copiedProvider, setCopiedProvider] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setKeys(getBYOKKeys());
    }
  }, [open]);

  const handleKeyChange = (provider: BYOKProvider, value: string) => {
    setKeys((prev) => ({ ...prev, [provider]: value }));
    setBYOKKey(provider, value);
  };

  const toggleVisibility = (provider: string) => {
    setVisibleKey((prev) => ({ ...prev, [provider]: !prev[provider] }));
  };

  const configuredCount = Object.values(keys).filter(Boolean).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-zinc-950 border border-zinc-800 text-zinc-100 p-6 rounded-2xl shadow-2xl overflow-hidden max-h-[88vh] flex flex-col">
        <DialogHeader className="space-y-1.5 pb-3 border-b border-zinc-800/80">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
                <Icon name="key" className="h-4 w-4" />
              </div>
              <DialogTitle className="text-lg font-semibold tracking-tight text-white">
                Bring Your Own Key (BYOK)
              </DialogTitle>
            </div>
            {configuredCount > 0 && (
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-medium">
                {configuredCount} key{configuredCount > 1 ? 's' : ''} active
              </span>
            )}
          </div>
          <DialogDescription className="text-xs text-zinc-400 leading-relaxed">
            Use your own API keys to run models with unlimited tokens and zero platform credit deductions. Keys are saved securely in your local environment and never stored on remote servers.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-4 pr-1 scrollbar-thin">
          {BYOK_PROVIDERS.map((provider) => {
            const val = keys[provider.id] || '';
            const isVisible = !!visibleKey[provider.id];
            const isSet = Boolean(val.trim());

            return (
              <div
                key={provider.id}
                className="p-3.5 rounded-xl bg-zinc-900/70 border border-zinc-800/90 transition-all hover:border-zinc-700/80"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-200">{provider.name}</span>
                    {isSet && (
                      <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => openExternalUrl(provider.docsUrl)}
                    className="text-[11px] text-sky-400 hover:text-sky-300 flex items-center gap-1 transition-colors"
                  >
                    <span>Get Key</span>
                    <Icon name="arrow-right" className="h-2.5 w-2.5 -rotate-45" />
                  </button>
                </div>

                <p className="text-[11px] text-zinc-400 mb-2.5">{provider.description}</p>

                <div className="relative flex items-center">
                  <input
                    type={isVisible ? 'text' : 'password'}
                    value={val}
                    onChange={(e) => handleKeyChange(provider.id, e.target.value)}
                    placeholder={`Enter ${provider.placeholder}`}
                    className="w-full h-9 px-3 pr-20 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-colors"
                  />
                  <div className="absolute right-1.5 flex items-center gap-1">
                    {isSet && (
                      <button
                        type="button"
                        onClick={() => handleKeyChange(provider.id, '')}
                        className="h-6 px-1.5 text-[10px] text-zinc-500 hover:text-red-400 transition-colors"
                        title="Clear key"
                      >
                        Clear
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleVisibility(provider.id)}
                      className="h-7 w-7 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80 transition-all"
                      title={isVisible ? 'Hide key' : 'Show key'}
                    >
                      <Icon name={isVisible ? 'eye-off' : 'show'} className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              if (confirm('Remove all configured BYOK keys?')) {
                clearAllBYOKKeys();
                setKeys({});
              }
            }}
            className="text-xs text-zinc-500 hover:text-red-400 transition-colors"
          >
            Clear All Keys
          </button>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-4 py-1.5 rounded-lg text-xs font-medium bg-sky-500 text-white hover:bg-sky-400 transition-all shadow-sm active:scale-95"
          >
            Done
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
