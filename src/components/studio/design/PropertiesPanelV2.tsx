/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Design Canvas — Properties Panel (v2)
 *
 * Figma-class right-rail inspector with sections:
 *   - Document (background, artboard)
 *   - Geometry (x, y, w, h, rotation, corner radius, flip)
 *   - Fill (solid / linear / radial)
 *   - Stroke
 *   - Effects (shadows, blur)
 *   - Typography (text only)
 *   - Arrange (z-order)
 *   - Export
 *
 * All edits debounce to the store so the undo stack only sees the final
 * value when the user blurs / commits.
 */
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';
import { ICON } from './core/icons';
import { getStore, uid, useDocument, useSelection, useStoreTick } from './core/store';
import { reorder, resizeArtboard, setArtboardBackground, updateNode, updateNodes } from './core/actions';
import type { CanvasNode, Effect, Fill, Shadow } from './core/types';

const FONT_OPTIONS = [
  'Inter', 'Helvetica', 'Arial', 'Times New Roman', 'Georgia',
  'Courier New', 'Verdana', 'Trebuchet MS', 'Palatino', 'Garamond',
  'Comic Sans MS', 'Impact',
];

const BLEND_OPTIONS = [
  'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten',
  'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion',
];

const SWATCHES = [
  '#0f172a', '#0b1220', '#1e293b', '#475569', '#94a3b8', '#cbd5e1', '#f1f5f9', '#f8fafc',
  '#0ea5e9', '#38bdf8', '#d8a657', '#6366f1', '#a855f7', '#f43f5e', '#f97316', '#f59e0b',
  '#84cc16', '#10b981', '#14b8a6', '#ec4899', '#d946ef', '#8b5cf6', '#fbbf24', '#fb7185',
  'transparent',
];

/* ---------- Section header ---------- */
function Section({ title, defaultOpen = true, children, right }: { title: string; defaultOpen?: boolean; children: React.ReactNode; right?: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-slate-200">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-3 py-2 hover:bg-slate-50 transition"
      >
        <span className="text-[10px] font-semibold text-slate-700 uppercase tracking-wider">{title}</span>
        <div className="flex items-center gap-1">
          {right}
          <Icon name={open ? ICON.chevronDown : ICON.chevronRight} className="h-3 w-3 text-slate-500" />
        </div>
      </button>
      {open && <div className="space-y-2 px-3 pb-3">{children}</div>}
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  className,
  suffix,
  min,
  max,
  step = 1,
}: {
  value: number;
  onChange: (n: number) => void;
  className?: string;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  const [draft, setDraft] = useState(String(Math.round(value * 100) / 100));
  useEffect(() => setDraft(String(Math.round(value * 100) / 100)), [value]);
  return (
    <div className={cn('relative flex items-center', className)}>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const n = parseFloat(draft);
          if (isNaN(n)) {
            // Revert to the committed value — typing then clearing shouldn't
            // silently mutate the node to 0 or leave a stale draft.
            setDraft(String(value));
            return;
          }
          // Skip the commit if the parsed value equals the current one, so
          // blurring an unchanged field doesn't push a no-op undo entry.
          if (n !== value) onChange(n);
          else setDraft(String(value));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'ArrowUp') {
            onChange((parseFloat(draft) || 0) + (e.shiftKey ? 10 : step));
          }
          if (e.key === 'ArrowDown') {
            onChange((parseFloat(draft) || 0) - (e.shiftKey ? 10 : step));
          }
        }}
        className="h-6 w-full rounded border border-slate-200 bg-slate-100 px-1.5 text-[10px] font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600/40"
      />
      {suffix && <span className="absolute right-1.5 text-[9px] text-slate-500">{suffix}</span>}
    </div>
  );
}

function ColorInput({ value, onChange, allowNone = true }: { value: string; onChange: (v: string) => void; allowNone?: boolean }) {
  const [open, setOpen] = useState(false);
  const isNone = value === 'transparent' || value === 'none' || !value;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex h-6 w-full items-center gap-1.5 rounded border border-slate-200 bg-slate-100 px-1.5 text-[10px] hover:border-slate-700"
      >
        <span
          className="h-3.5 w-3.5 rounded-sm border border-slate-700 shrink-0"
          style={{ background: isNone ? 'repeating-conic-gradient(#475569 0% 25%, #1e293b 25% 50%) 50% / 6px 6px' : value }}
        />
        <span className="font-mono truncate text-slate-700">{isNone ? 'None' : value}</span>
        {allowNone && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onChange('transparent');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onChange('transparent');
              }
            }}
            className="ml-auto text-slate-500 hover:text-slate-900"
            title="Clear fill"
            aria-label="Clear fill"
          >
            <Icon name={ICON.delete} className="h-3 w-3" />
          </span>
        )}
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-44 rounded-lg border border-slate-200 bg-white shadow-2xl shadow-black/60 p-2 space-y-2">
          <input
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000'}
            onChange={(e) => onChange(e.target.value)}
            className="h-7 w-full rounded border border-slate-200 cursor-pointer"
          />
          <div className="grid grid-cols-8 gap-1">
            {SWATCHES.map((c) => (
              <button
                key={c}
                onClick={() => {
                  onChange(c);
                  setOpen(false);
                }}
                title={c}
                aria-label={`Set color ${c}`}
                className="h-4 w-4 rounded-sm border border-slate-200 hover:scale-110 transition"
                style={{ background: c === 'transparent' ? 'repeating-conic-gradient(#475569 0% 25%, #1e293b 25% 50%) 50% / 4px 4px' : c }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Geometry ---------- */
function GeometrySection({ node, multi }: { node: CanvasNode; multi?: boolean }) {
  const g = node.geometry;
  const set = (patch: Partial<typeof g>) => {
    if (multi) {
      updateNodes([node.id], { geometry: { ...g, ...patch } as any });
    } else {
      updateNode(node.id, { geometry: { ...g, ...patch } as any });
    }
  };
  return (
    <div className="grid grid-cols-2 gap-1.5">
      <Field label="X"><NumberInput value={g.x} onChange={(v) => set({ x: v })} /></Field>
      <Field label="Y"><NumberInput value={g.y} onChange={(v) => set({ y: v })} /></Field>
      <Field label="W"><NumberInput value={g.w} onChange={(v) => set({ w: Math.max(1, v) })} /></Field>
      <Field label="H"><NumberInput value={g.h} onChange={(v) => set({ h: Math.max(1, v) })} /></Field>
      <Field label="↻"><NumberInput value={g.rotation} onChange={(v) => set({ rotation: v })} suffix="°" /></Field>
      <div className="flex items-end gap-1">
        <button
          onClick={() => set({ flip: g.flip === 'x' ? 'none' : 'x' })}
          className={cn('h-6 flex-1 rounded border border-slate-200 text-[10px] font-bold', g.flip === 'x' ? 'bg-blue-600/20 text-blue-600 border-blue-600/40' : 'bg-slate-100 text-slate-700')}
          title="Flip horizontal"
          aria-label="Flip horizontal"
          aria-pressed={g.flip === 'x'}
        >
          ⇋ H
        </button>
        <button
          onClick={() => set({ flip: g.flip === 'y' ? 'none' : 'y' })}
          className={cn('h-6 flex-1 rounded border border-slate-200 text-[10px] font-bold', g.flip === 'y' ? 'bg-blue-600/20 text-blue-600 border-blue-600/40' : 'bg-slate-100 text-slate-700')}
          title="Flip vertical"
          aria-label="Flip vertical"
          aria-pressed={g.flip === 'y'}
        >
          ⇊ V
        </button>
      </div>

      {node.kind === 'rect' || node.kind === 'frame' ? (
        <div className="col-span-2 space-y-1">
          <div className="flex items-center justify-between text-[9px] text-slate-600">
            <span>Corner radius</span>
            <button
              onClick={() => set({ radius: g.w === g.h ? [g.w / 2, g.w / 2, g.w / 2, g.w / 2] : [8, 8, 8, 8] })}
              className="text-blue-600 hover:text-blue-600"
            >
              Round all
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {(['TL', 'TR', 'BR', 'BL'] as const).map((c, i) => (
              <NumberInput
                key={c}
                value={g.radius[i]}
                onChange={(v) => {
                  const r = [...g.radius] as [number, number, number, number];
                  r[i] = Math.max(0, v);
                  set({ radius: r });
                }}
                suffix={c}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('space-y-0.5', className)}>
      <div className="text-[9px] text-slate-600">{label}</div>
      {children}
    </div>
  );
}

/* ---------- Fill ---------- */
function FillSection({ node, multi }: { node: CanvasNode; multi?: boolean }) {
  const fill = node.fill;
  const setFill = (patch: Partial<Fill>) => {
    if (multi) updateNodes([node.id], { fill: { ...fill, ...patch } as any });
    else updateNode(node.id, { fill: { ...fill, ...patch } as any });
  };
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1">
        <select
          value={fill.type}
          onChange={(e) => {
            const t = e.target.value as Fill['type'];
            if (t === 'linear-gradient') {
              setFill({ type: t, value: 'linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)' });
            } else if (t === 'radial-gradient') {
              setFill({ type: t, value: 'radial-gradient(circle, #0ea5e9 0%, #6366f1 100%)' });
            } else if (t === 'none') {
              setFill({ type: 'none', value: 'transparent', opacity: 0 });
            } else {
              setFill({ type: 'solid', value: fill.value && fill.value !== 'transparent' ? fill.value : '#0ea5e9', opacity: fill.opacity || 1 });
            }
          }}
          className="h-6 rounded border border-slate-200 bg-slate-100 px-1.5 text-[10px] text-slate-900 focus:outline-none"
        >
          <option value="solid">Solid</option>
          <option value="linear-gradient">Linear</option>
          <option value="radial-gradient">Radial</option>
          <option value="none">None</option>
        </select>
      </div>
      {fill.type !== 'none' && (
        <>
          {fill.type === 'solid' ? (
            <ColorInput value={fill.value || '#0ea5e9'} onChange={(v) => setFill({ value: v })} />
          ) : (
            <input
              value={fill.value}
              onChange={(e) => setFill({ value: e.target.value })}
              className="h-6 w-full rounded border border-slate-200 bg-slate-100 px-1.5 text-[10px] font-mono text-slate-900 focus:outline-none"
            />
          )}
          <div>
            <div className="flex items-center justify-between text-[9px] text-slate-600 mb-0.5">
              <span>Opacity</span>
              <span className="font-mono">{Math.round(fill.opacity * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={fill.opacity}
              onChange={(e) => setFill({ opacity: parseFloat(e.target.value) })}
              className="w-full accent-blue-600"
            />
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- Stroke ---------- */
function StrokeSection({ node, multi }: { node: CanvasNode; multi?: boolean }) {
  const s = node.stroke;
  const setStroke = (patch: Partial<typeof s>) => {
    if (multi) updateNodes([node.id], { stroke: { ...s, ...patch } as any });
    else updateNode(node.id, { stroke: { ...s, ...patch } as any });
  };
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <ColorInput value={s.color || '#0f172a'} onChange={(v) => setStroke({ color: v, enabled: true })} />
        <NumberInput value={s.width} onChange={(v) => setStroke({ width: Math.max(0, v), enabled: v > 0 })} className="w-12" suffix="px" />
        <select
          value={s.align}
          onChange={(e) => setStroke({ align: e.target.value as any })}
          className="h-6 rounded border border-slate-200 bg-slate-100 px-1 text-[10px] text-slate-900 focus:outline-none"
        >
          <option value="center">↔ Center</option>
          <option value="inside">→ Inside</option>
          <option value="outside">← Outside</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <Field label="Dashes">
          <input
            value={s.dashArray.join(', ')}
            onChange={(e) => setStroke({ dashArray: e.target.value.split(',').map((n) => parseFloat(n.trim())).filter((n) => !isNaN(n)) })}
            placeholder="0, 0"
            className="h-6 w-full rounded border border-slate-200 bg-slate-100 px-1.5 text-[10px] font-mono focus:outline-none"
          />
        </Field>
        <Field label="Cap / Join">
          <div className="flex gap-0.5">
            {(['butt', 'round', 'square'] as const).map((c) => (
              <button
                key={c}
                onClick={() => setStroke({ cap: c })}
                className={cn('h-6 flex-1 rounded border border-slate-200 text-[9px] uppercase', s.cap === c ? 'bg-blue-600/20 text-blue-600 border-blue-600/40' : 'bg-slate-100 text-slate-700')}
                title={`Cap: ${c}`}
                aria-label={`Line cap: ${c}`}
                aria-pressed={s.cap === c}
              >
                {c[0].toUpperCase()}
              </button>
            ))}
          </div>
        </Field>
      </div>
    </div>
  );
}

/* ---------- Effects ---------- */
function EffectsSection({ node, multi }: { node: CanvasNode; multi?: boolean }) {
  const setEffects = (effects: Effect[]) => {
    if (multi) updateNodes([node.id], { effects } as any);
    else updateNode(node.id, { effects } as any);
  };
  const add = (type: Effect['type']) => {
    const eff: Effect = {
      // Collision-free id (two effects added in the same millisecond would
      // previously share an id and React would key-warn / mis-patch rows).
      id: uid('eff'),
      type,
      enabled: true,
      shadow: { type: 'drop', x: 0, y: 4, blur: 12, spread: 0, color: '#000000', opacity: 0.25 },
      blur: 4,
    };
    setEffects([...(node.effects || []), eff]);
  };
  return (
    <div className="space-y-1.5">
      {(node.effects || []).map((e, i) => (
        <EffectRow
          key={e.id}
          effect={e}
          onChange={(p) => {
            const next = (node.effects || []).map((x, idx) => (idx === i ? { ...x, ...p } : x));
            setEffects(next);
          }}
          onRemove={() => {
            setEffects((node.effects || []).filter((_, idx) => idx !== i));
          }}
        />
      ))}
      <div className="flex gap-1">
        <button onClick={() => add('shadow')} className="flex-1 h-6 rounded border border-slate-200 bg-slate-100 text-[10px] text-slate-700 hover:text-slate-900 hover:border-slate-700">+ Shadow</button>
        <button onClick={() => add('blur')} className="flex-1 h-6 rounded border border-slate-200 bg-slate-100 text-[10px] text-slate-700 hover:text-slate-900 hover:border-slate-700">+ Blur</button>
      </div>
    </div>
  );
}

function EffectRow({ effect, onChange, onRemove }: { effect: Effect; onChange: (p: Partial<Effect>) => void; onRemove: () => void }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-100 p-1.5 space-y-1">
      <div className="flex items-center justify-between text-[10px] text-slate-700">
        <span className="uppercase tracking-wider font-semibold">{effect.type}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onChange({ enabled: !effect.enabled })}
            className="text-blue-600 text-[9px] uppercase"
            aria-label={effect.enabled ? `Disable ${effect.type} effect` : `Enable ${effect.type} effect`}
            aria-pressed={effect.enabled}
          >{effect.enabled ? 'On' : 'Off'}</button>
          <button
            onClick={onRemove}
            className="grid h-4 w-4 place-items-center text-slate-500 hover:text-rose-600"
            title={`Remove ${effect.type} effect`}
            aria-label={`Remove ${effect.type} effect`}
          ><Icon name={ICON.delete} className="h-3 w-3" /></button>
        </div>
      </div>
      {effect.type === 'shadow' && effect.shadow && (
        <div className="grid grid-cols-2 gap-1">
          <Field label="X"><NumberInput value={effect.shadow.x} onChange={(v) => onChange({ shadow: { ...effect.shadow!, x: v } })} /></Field>
          <Field label="Y"><NumberInput value={effect.shadow.y} onChange={(v) => onChange({ shadow: { ...effect.shadow!, y: v } })} /></Field>
          <Field label="Blur"><NumberInput value={effect.shadow.blur} onChange={(v) => onChange({ shadow: { ...effect.shadow!, blur: v } })} /></Field>
          <Field label="Spread"><NumberInput value={effect.shadow.spread} onChange={(v) => onChange({ shadow: { ...effect.shadow!, spread: v } })} /></Field>
          <div className="col-span-2"><ColorInput value={effect.shadow.color} onChange={(v) => onChange({ shadow: { ...effect.shadow!, color: v } })} /></div>
          <div className="col-span-2">
            <div className="flex items-center justify-between text-[9px] text-slate-600 mb-0.5">
              <span>Opacity</span>
              <span className="font-mono">{Math.round(effect.shadow.opacity * 100)}%</span>
            </div>
            <input type="range" min="0" max="1" step="0.05" value={effect.shadow.opacity} onChange={(e) => onChange({ shadow: { ...effect.shadow!, opacity: parseFloat(e.target.value) } })} className="w-full accent-blue-600" />
          </div>
        </div>
      )}
      {effect.type === 'blur' && (
        <Field label="Radius"><NumberInput value={effect.blur || 0} onChange={(v) => onChange({ blur: v })} suffix="px" /></Field>
      )}
    </div>
  );
}

/* ---------- Typography ---------- */
function TypographySection({ node, multi }: { node: CanvasNode; multi?: boolean }) {
  if (!node.text) return null;
  const t = node.text;
  const set = (patch: Partial<typeof t>) => {
    if (multi) updateNodes([node.id], { text: { ...t, ...patch } as any });
    else updateNode(node.id, { text: { ...t, ...patch } as any });
  };
  return (
    <div className="space-y-2">
      <textarea
        value={t.content}
        onChange={(e) => set({ content: e.target.value })}
        rows={2}
        className="w-full rounded border border-slate-200 bg-slate-100 px-2 py-1 text-[11px] text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600/40 resize-none"
      />
      <div className="grid grid-cols-[1fr_auto] gap-1.5">
        <Field label="Font">
          <select
            value={t.fontFamily}
            onChange={(e) => set({ fontFamily: e.target.value })}
            className="h-6 w-full rounded border border-slate-200 bg-slate-100 px-1.5 text-[10px] focus:outline-none"
          >
            {FONT_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </Field>
        <Field label="Size">
          <NumberInput value={t.fontSize} onChange={(v) => set({ fontSize: Math.max(1, v) })} className="w-14" suffix="px" />
        </Field>
      </div>
      <div className="grid grid-cols-[1fr_1fr_1fr] gap-1">
        <button
          onClick={() => set({ fontWeight: t.fontWeight >= 700 ? 400 : 700 })}
          className={cn('h-6 rounded border border-slate-200 text-[10px] font-bold', t.fontWeight >= 700 ? 'bg-blue-600/20 text-blue-600 border-blue-600/40' : 'bg-slate-100 text-slate-700')}
          title="Bold"
          aria-label="Bold"
          aria-pressed={t.fontWeight >= 700}
        >B</button>
        <button
          onClick={() => set({ italic: !t.italic })}
          className={cn('h-6 rounded border border-slate-200 text-[10px] italic', t.italic ? 'bg-blue-600/20 text-blue-600 border-blue-600/40' : 'bg-slate-100 text-slate-700')}
          title="Italic"
          aria-label="Italic"
          aria-pressed={t.italic}
        >I</button>
        <button
          onClick={() => set({ underline: !t.underline })}
          className={cn('h-6 rounded border border-slate-200 text-[10px] underline', t.underline ? 'bg-blue-600/20 text-blue-600 border-blue-600/40' : 'bg-slate-100 text-slate-700')}
          title="Underline"
          aria-label="Underline"
          aria-pressed={t.underline}
        >U</button>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {(['left', 'center', 'right', 'justify'] as const).map((a) => (
          <button
            key={a}
            onClick={() => set({ align: a })}
            className={cn('h-6 rounded border border-slate-200 text-[10px] uppercase', t.align === a ? 'bg-blue-600/20 text-blue-600 border-blue-600/40' : 'bg-slate-100 text-slate-700')}
            title={`Align ${a}`}
            aria-label={`Align ${a}`}
            aria-pressed={t.align === a}
          >
            <Icon name={a === 'left' ? ICON.alignLeft : a === 'right' ? ICON.alignRight : ICON.alignCenter} className="h-3 w-3 mx-auto" />
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <Field label="Line"><NumberInput value={t.lineHeight} onChange={(v) => set({ lineHeight: v })} step={0.1} /></Field>
        <Field label="Letter"><NumberInput value={t.letterSpacing} onChange={(v) => set({ letterSpacing: v })} suffix="px" /></Field>
      </div>
      <Field label="Color"><ColorInput value={t.color} onChange={(v) => set({ color: v })} allowNone={false} /></Field>
      <div>
        <div className="flex items-center justify-between text-[9px] text-slate-600 mb-0.5">
          <span>Opacity</span>
          <span className="font-mono">{Math.round(t.opacity * 100)}%</span>
        </div>
        <input type="range" min="0" max="1" step="0.05" value={t.opacity} onChange={(e) => set({ opacity: parseFloat(e.target.value) })} className="w-full accent-blue-600" />
      </div>
    </div>
  );
}

/* ---------- Arrange ---------- */
function ArrangeSection() {
  const sel = useSelection();
  return (
    <div className="grid grid-cols-4 gap-1">
      <ArrangeBtn icon={ICON.bringFront} title="Bring to Front" onClick={() => sel.primary && reorder(sel.primary, 'front')} />
      <ArrangeBtn icon={ICON.bringForward} title="Bring Forward" onClick={() => sel.primary && reorder(sel.primary, 'forward')} />
      <ArrangeBtn icon={ICON.sendBackward} title="Send Backward" onClick={() => sel.primary && reorder(sel.primary, 'backward')} />
      <ArrangeBtn icon={ICON.sendBack} title="Send to Back" onClick={() => sel.primary && reorder(sel.primary, 'back')} />
    </div>
  );
}

function ArrangeBtn({ icon, title, onClick }: { icon: string; title: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className="grid h-7 place-items-center rounded border border-slate-200 bg-slate-100 text-slate-700 hover:text-slate-900 hover:border-slate-700"
    >
      <Icon name={icon} className="h-3.5 w-3.5" />
    </button>
  );
}

/* ---------- Blend ---------- */
function BlendSection({ node, multi }: { node: CanvasNode; multi?: boolean }) {
  return (
    <select
      value={node.blend}
      onChange={(e) => {
        if (multi) updateNodes([node.id], { blend: e.target.value as any });
        else updateNode(node.id, { blend: e.target.value as any });
      }}
      className="h-6 w-full rounded border border-slate-200 bg-slate-100 px-1.5 text-[10px] focus:outline-none"
    >
      {BLEND_OPTIONS.map((b) => <option key={b} value={b}>{b}</option>)}
    </select>
  );
}

/* ---------- Document (no selection) ---------- */
function DocumentSection() {
  const doc = useDocument();
  return (
    <div className="space-y-2">
      <Field label="Document name">
        <input
          value={doc.name}
          onChange={(e) => {
            // soft commit (no history) so the undo stack isn't polluted
            // by every keystroke while renaming the artboard
            getStore().commit((d) => { d.name = e.target.value; }, { history: false });
          }}
          className="h-6 w-full rounded border border-slate-200 bg-slate-100 px-1.5 text-[10px] focus:outline-none"
        />
      </Field>
      <div className="grid grid-cols-2 gap-1.5">
        <Field label="Width"><NumberInput value={doc.width} onChange={(v) => resizeArtboard(v, doc.height)} /></Field>
        <Field label="Height"><NumberInput value={doc.height} onChange={(v) => resizeArtboard(doc.width, v)} /></Field>
      </div>
      <Field label="Artboard background">
        <ColorInput value={doc.background} onChange={(v) => setArtboardBackground(v)} allowNone={false} />
      </Field>
    </div>
  );
}

/* ---------- Public ---------- */
export function PropertiesPanelV2() {
  const doc = useDocument();
  const sel = useSelection();
  useStoreTick();

  if (sel.ids.length === 0) {
    return (
      <div className="flex flex-col h-full select-none">
        <div className="px-3 py-2 border-b border-slate-200 text-[10px] font-semibold uppercase tracking-wider text-slate-600">Document</div>
        <div className="flex-1 overflow-auto">
          <Section title="Canvas"><DocumentSection /></Section>
        </div>
        <div className="p-4 text-center text-[10px] text-slate-600 border-t border-slate-200">
          Select an element to edit its properties.
        </div>
      </div>
    );
  }

  if (sel.ids.length > 1) {
    return (
      <div className="flex flex-col h-full select-none">
        <div className="px-3 py-2 border-b border-slate-200 text-[10px] font-semibold uppercase tracking-wider text-slate-700">
          {sel.ids.length} elements selected
        </div>
        <div className="flex-1 overflow-auto">
          <Section title="Arrange"><ArrangeSection /></Section>
        </div>
      </div>
    );
  }

  const node = doc.nodes[sel.primary!];
  if (!node) return null;
  const isText = node.kind === 'text';

  return (
    <div className="flex flex-col h-full select-none">
      <div className="px-3 py-2 border-b border-slate-200 flex items-center gap-2">
        <Icon name={ICON.shapes} className="h-3.5 w-3.5 text-blue-600" />
        <input
          value={node.name}
          onChange={(e) => updateNode(node.id, { name: e.target.value })}
          className="flex-1 bg-transparent text-[11px] font-semibold text-slate-900 focus:outline-none focus:bg-slate-50 rounded px-1"
        />
        <span className="text-[9px] font-mono text-slate-500 uppercase">{node.kind}</span>
      </div>
      <div className="flex-1 overflow-auto">
        <Section title="Geometry"><GeometrySection node={node} /></Section>
        <Section title="Appearance">
          <Field label="Opacity">
            <div className="flex items-center gap-1.5">
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={node.opacity}
                // Transient updates while dragging — no undo entry per tick.
                onChange={(e) => updateNode(node.id, { opacity: parseFloat(e.target.value) }, { transient: true })}
                // One history entry when the drag ends.
                onPointerUp={() => updateNode(node.id, { opacity: node.opacity })}
                className="flex-1 accent-blue-600"
              />
              <span className="text-[9px] font-mono w-8 text-right text-slate-600">{Math.round(node.opacity * 100)}%</span>
            </div>
          </Field>
          <Field label="Blend mode"><BlendSection node={node} /></Field>
        </Section>
        {/* Fill/Stroke/Effects are hidden for groups: a group has no fill,
            stroke, or shadow/blur of its own to render — the renderer only
            ever paints its children (see core/renderer.tsx). Showing these
            controls for a group let the user "style" values that were
            silently discarded. Opacity and Blend mode above ARE real for
            groups (they wrap the children in a compositing layer), so those
            stay visible. */}
        {node.kind !== 'line' && node.kind !== 'image' && node.kind !== 'group' && (
          <Section title="Fill"><FillSection node={node} /></Section>
        )}
        {node.kind !== 'line' && node.kind !== 'group' && (
          <Section title="Stroke" defaultOpen={node.stroke.enabled}>
            <StrokeSection node={node} />
          </Section>
        )}
        {node.kind !== 'group' && (
          <Section title="Effects" defaultOpen={(node.effects || []).length > 0}>
            <EffectsSection node={node} />
          </Section>
        )}
        {isText && <Section title="Typography"><TypographySection node={node} /></Section>}
        <Section title="Arrange"><ArrangeSection /></Section>
      </div>
    </div>
  );
}
