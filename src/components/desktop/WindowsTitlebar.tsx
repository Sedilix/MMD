'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import {
  isDesktopApp,
  minimizeWindow,
  toggleMaximizeWindow,
  isWindowMaximized,
  closeWindow,
} from '@/lib/desktop/desktop-bridge';
import { UpdatePill } from './UpdatePill';
import { BYOKSettingsModal } from './BYOKSettingsModal';
import { subscribeBYOKKeys, type BYOKKeys } from '@/lib/desktop/byok-store';
import { Icon } from '@/components/ui/icon';

export function WindowsTitlebar() {
  const [isDesktop, setIsDesktop] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [byokModalOpen, setByokModalOpen] = useState(false);
  const [byokKeys, setByokKeys] = useState<BYOKKeys>({});

  useEffect(() => {
    const desktop = isDesktopApp();
    setIsDesktop(desktop);

    if (desktop) {
      // Wait for Tauri IPC to be ready before querying window state
      const initializeWindowState = async () => {
        try {
          const isMax = await isWindowMaximized();
          setMaximized(isMax);
        } catch (err) {
          // IPC not ready yet, silently ignore
        }
      };

      const timer = setTimeout(initializeWindowState, 100);

      // Listen for window resize/maximize events
      const handleResize = async () => {
        try {
          const isMax = await isWindowMaximized();
          setMaximized(isMax);
        } catch {
          // Ignore IPC errors during resize events
        }
      };
      window.addEventListener('resize', handleResize);

      const unsubByok = subscribeBYOKKeys(setByokKeys);

      return () => {
        clearTimeout(timer);
        window.removeEventListener('resize', handleResize);
        unsubByok();
      };
    }
  }, []);

  if (!isDesktop) return null;

  const activeByokCount = Object.values(byokKeys).filter(Boolean).length;

  return (
    <>
      {/* Dragging is handled entirely by `data-tauri-drag-region`, which Tauri
          matches against the exact mousedown target — so the caption buttons
          and the BYOK / update pills below stay clickable. Do NOT add a JS
          onMouseDown drag handler here: mousedown bubbles, so a handler on
          this header fires for clicks on those buttons too, starts a native
          window drag, and the OS then swallows the click before onClick runs.
          That is what broke every caption button in v0.1.2. */}
      <header
        data-tauri-drag-region
        className="sticky top-0 z-[9999] flex h-9 w-full items-center justify-between border-b border-neutral-800/80 bg-neutral-950/95 px-3 text-xs text-neutral-300 select-none backdrop-blur-md pointer-events-auto"
      >
        {/* Left: App Branding & Status */}
        <div
          data-tauri-drag-region
          className="flex items-center gap-2.5 pointer-events-none"
        >
          <div className="relative flex h-4 w-4 items-center justify-center shrink-0">
            <Image
              src="/cybrdeck-logo/cybrdeck_icon.png"
              alt="Playground"
              width={16}
              height={16}
              className="h-4 w-4 object-contain"
              unoptimized
            />
          </div>
          <div className="flex items-center gap-1.5 font-medium text-neutral-200">
            <span>Playground</span>
            <span className="text-[10px] text-neutral-500 font-normal">|</span>
            <span className="rounded bg-neutral-800/80 px-1.5 py-0.5 text-[10px] font-normal text-neutral-400">
              Desktop
            </span>
          </div>
        </div>

        {/* Middle: Drag Region Spacer & In-App Actions */}
        <div
          data-tauri-drag-region
          className="flex-1 h-full flex items-center justify-end px-3 gap-2 pointer-events-none"
        >
          {/* In-App Auto-Updater Pill */}
          <div className="pointer-events-auto">
            <UpdatePill />
          </div>

          {/* BYOK (Bring Your Own Key) Pill */}
          <button
            type="button"
            onClick={() => setByokModalOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-neutral-800/60 border border-neutral-700/70 text-neutral-300 hover:bg-neutral-800 hover:text-white transition-all active:scale-95 pointer-events-auto"
            title="Configure your own API keys (OpenAI, Anthropic, Gemini, DeepSeek, Groq, OpenRouter)"
          >
            <Icon name="key" className="h-3 w-3 text-sky-400" />
            <span>BYOK</span>
            {activeByokCount > 0 && (
              <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
            )}
          </button>
        </div>

        {/* Right: Windows 11 Caption Controls */}
        <div className="flex h-full items-center pointer-events-auto">
          {/* Minimize Button */}
          <button
            type="button"
            onClick={minimizeWindow}
            aria-label="Minimize"
            className="inline-flex h-full w-11 items-center justify-center text-neutral-400 transition-colors hover:bg-neutral-800/80 hover:text-neutral-100 cursor-pointer"
          >
            <svg
              width="10"
              height="1"
              viewBox="0 0 10 1"
              fill="currentColor"
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect width="10" height="1" />
            </svg>
          </button>

          {/* Maximize / Restore Button */}
          <button
            type="button"
            onClick={async () => {
              await toggleMaximizeWindow();
              setMaximized(!maximized);
            }}
            aria-label={maximized ? 'Restore' : 'Maximize'}
            className="inline-flex h-full w-11 items-center justify-center text-neutral-400 transition-colors hover:bg-neutral-800/80 hover:text-neutral-100 cursor-pointer"
          >
            {maximized ? (
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                xmlns="http://www.w3.org/2000/svg"
              >
                <rect x="2.5" y="0.5" width="7" height="7" rx="0.5" />
                <polyline points="0.5,2.5 0.5,9.5 7.5,9.5" />
              </svg>
            ) : (
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                xmlns="http://www.w3.org/2000/svg"
              >
                <rect x="0.5" y="0.5" width="9" height="9" rx="0.5" />
              </svg>
            )}
          </button>

          {/* Close Button (Hover Red per Windows convention) */}
          <button
            type="button"
            onClick={closeWindow}
            aria-label="Close"
            className="inline-flex h-full w-11 items-center justify-center text-neutral-400 transition-colors hover:bg-[#e81123] hover:text-white cursor-pointer"
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              strokeLinecap="round"
              xmlns="http://www.w3.org/2000/svg"
            >
              <line x1="1" y1="1" x2="9" y2="9" />
              <line x1="9" y1="1" x2="1" y2="9" />
            </svg>
          </button>
        </div>
      </header>

      {/* BYOK Settings Dialog */}
      <BYOKSettingsModal open={byokModalOpen} onOpenChange={setByokModalOpen} />
    </>
  );
}
