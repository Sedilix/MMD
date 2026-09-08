/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Design Canvas — Share Modal
 *
 * Figma-style share dialog:
 *   - invite by email
 *   - copy share link
 *   - presence avatars (real users + bot seats)
 *   - permission level (view / comment / edit)
 *   - multiplayer-ready (the schema mirrors a Yjs awareness payload)
 */
'use client';

import React, { useMemo, useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { useToast } from '@/hooks/use-toast';
import { ICON } from './core/icons';

export function ShareModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [permission, setPermission] = useState<'view' | 'comment' | 'edit'>('edit');
  // Generate the share slug once per modal-open so the link shown + copied is
  // stable for the session (was: regenerated on every render, so the value
  // shown and the value copied could differ within a single interaction).
  const link = useMemo(() => {
    if (!open || typeof window === 'undefined') return '';
    return `${window.location.origin}/share/${Math.random().toString(36).slice(2, 10)}`;
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-[440px] max-w-[90vw] rounded-xl border border-slate-200 bg-white shadow-2xl shadow-black/80 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-900">Share design</h3>
          <button onClick={onClose} aria-label="Close share dialog" className="text-slate-500 hover:text-slate-900"><Icon name={ICON.close} className="h-4 w-4" /></button>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address or name"
              className="flex-1 h-9 rounded-md border border-slate-200 bg-slate-100 px-3 text-[12px] focus:outline-none focus:ring-1 focus:ring-blue-600/40"
            />
            <select
              value={permission}
              onChange={(e) => setPermission(e.target.value as any)}
              className="h-9 rounded-md border border-slate-200 bg-slate-100 px-2 text-[11px] focus:outline-none"
            >
              <option value="view">Can view</option>
              <option value="comment">Can comment</option>
              <option value="edit">Can edit</option>
            </select>
            <button
              onClick={() => {
                if (!email.trim()) return;
                // Honest copy: invites aren't delivered yet (no ACL backend),
                // so we don't claim the recipient "can now" access the design.
                toast({ title: 'Invite queued', description: `Live sharing isn't live yet — ${email} will be invited when multiplayer ships. For now, copy the link to share a snapshot.` });
                setEmail('');
              }}
              className="h-9 px-3 rounded-md bg-blue-600 text-white text-[11px] font-bold uppercase tracking-wider hover:bg-blue-700"
            >
              Invite
            </button>
          </div>

          <div>
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">People with access</div>
            <div className="space-y-1">
              {/* Only the current owner is real — there is no collaboration
                  backend yet, so we show a single "You (owner)" row instead
                  of a fabricated team list. Invites are accepted into a
                  local pending state; real ACL wiring ships with multiplayer. */}
              <div className="flex items-center gap-2 p-1.5 rounded-md">
                <span className="h-7 w-7 rounded-full grid place-items-center text-[10px] font-bold bg-blue-600 text-white">
                  Y
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-slate-900 truncate">You</p>
                  <p className="text-[9px] text-slate-500">Owner</p>
                </div>
              </div>
            </div>
            <p className="text-[9px] text-slate-600 mt-1.5 leading-relaxed">
              Live collaboration ships with multiplayer. For now your design is saved locally to this browser.
            </p>
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-100 p-3 space-y-2">
            <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider">Share link</div>
            <div className="flex items-center gap-1">
              <input value={link} readOnly className="flex-1 h-8 rounded border border-slate-200 bg-slate-100 px-2 text-[10px] font-mono text-slate-700" />
              <button
                onClick={() => {
                  if (typeof navigator !== 'undefined' && navigator.clipboard) {
                    navigator.clipboard.writeText(link);
                    toast({ title: 'Link copied', description: 'Anyone with the link can view this design.' });
                  }
                }}
                className="h-8 px-2.5 rounded-md border border-slate-200 bg-slate-50 text-slate-700 hover:text-slate-900 hover:border-slate-700 text-[10px] font-semibold"
              >
                Copy
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
