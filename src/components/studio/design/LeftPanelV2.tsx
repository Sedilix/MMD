/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Design Canvas — Left Panel (v2)
 *
 * Figma-class left rail with collapsible sections:
 *   - Pages (multi-page document tree)
 *   - Assets (vector + image library, search, drag to canvas)
 *   - AI (image generation drawer — ported from v1)
 *   - Text (typography presets)
 *   - Shapes (vector primitives)
 *   - Templates (artboard presets)
 */
'use client';

import React, { useState, useRef } from 'react';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AIDrawer } from './AIDrawer';
import { addImageFromUrl, addShape, addTextPreset, resizeArtboard } from './core/actions';
import { ICON } from './core/icons';
import templatesData from '@/data/studio/design-templates.json';

// NOTE: the old 'pages' tab was removed — it maintained a local-only array of
// page rows that had no backing concept in the document store, so "adding a
// page" did nothing. The canvas is single-artboard today; when real
// multi-page support lands (a `pages` array on CanvasDocument) the tab can
// return against that real state.
type Tab = 'assets' | 'shapes' | 'text' | 'templates' | 'ai';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'assets', label: 'Assets', icon: ICON.shapes },
  { id: 'shapes', label: 'Shapes', icon: ICON.rect },
  { id: 'text', label: 'Text', icon: ICON.text },
  { id: 'templates', label: 'Templates', icon: ICON.grid },
  { id: 'ai', label: 'AI', icon: ICON.image },
];

const SHAPES: { kind: any; label: string; icon: string; preview: React.ReactNode }[] = [
  { kind: 'rect', label: 'Rectangle', icon: ICON.rect, preview: <div className="h-6 w-8 rounded-sm bg-blue-600" /> },
  { kind: 'ellipse', label: 'Ellipse', icon: ICON.ellipse, preview: <div className="h-6 w-6 rounded-full bg-indigo-400" /> },
  { kind: 'triangle', label: 'Triangle', icon: ICON.triangle, preview: <div className="h-0 w-0 border-l-[10px] border-r-[10px] border-b-[16px] border-l-transparent border-r-transparent border-b-blue-600" /> },
  { kind: 'line', label: 'Line', icon: ICON.line, preview: <div className="h-[2px] w-8 bg-slate-700" /> },
  { kind: 'star', label: 'Star', icon: ICON.star, preview: <div className="text-amber-300 text-base leading-none">★</div> },
  { kind: 'polygon', label: 'Hexagon', icon: ICON.polygon, preview: <div className="h-5 w-6 bg-purple-400" style={{ clipPath: 'polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)' }} /> },
  { kind: 'frame', label: 'Frame', icon: ICON.frame, preview: <div className="h-6 w-8 rounded-md border-2 border-dashed border-slate-600" /> },
];

const TEXT_PRESETS: { kind: any; label: string; preview: React.ReactNode }[] = [
  { kind: 'header', label: 'Heading', preview: <span className="text-base font-bold text-slate-900">Aa</span> },
  { kind: 'subheader', label: 'Subheading', preview: <span className="text-sm font-semibold text-slate-900">Aa</span> },
  { kind: 'body', label: 'Body', preview: <span className="text-[10px] text-slate-900">Aa</span> },
  { kind: 'caption', label: 'Caption', preview: <span className="text-[9px] uppercase tracking-wider text-slate-900">Aa</span> },
];

// Each sample photo needs a human search term — the previous version was a
// bare URL array, and the search box matched against that raw URL string.
// No search term a user would actually type is ever a substring of an
// opaque Unsplash photo id, so typing anything here ("beach", "office")
// silently returned zero results. `label` is what search now matches, and
// what the picker shows on hover.
const SAMPLE_IMAGES: { url: string; label: string }[] = [
  { url: 'https://images.unsplash.com/photo-1557682250-33bd709cbe85?w=400&h=300&fit=crop', label: 'Mountain landscape' },
  { url: 'https://images.unsplash.com/photo-1558591710-4b4a1ae0f04d?w=400&h=300&fit=crop', label: 'City skyline' },
  { url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&h=300&fit=crop', label: 'Ocean coastline' },
  { url: 'https://images.unsplash.com/photo-1620207418302-439b387441b0?w=400&h=300&fit=crop', label: 'Forest trees' },
  { url: 'https://images.unsplash.com/photo-1635776063043-2bf08c1b1c94?w=400&h=300&fit=crop', label: 'Desert dunes' },
  { url: 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=400&h=300&fit=crop', label: 'Abstract texture' },
];

// Icons are defined as raw SVG path/markup strings so they can be embedded
// into a data-URI <svg> verbatim (the previous version stored JSX elements
// and tried to read `.props.children` off them, producing an empty <g> and
// a blank inserted image). Each entry renders the same markup in the picker
// (via dangerouslySetInnerHTML) and in the inserted canvas asset.
const SAMPLE_ICONS: { id: string; markup: string }[] = [
  { id: 'arrow', markup: '<path d="M5 12h14M13 5l7 7-7 7" stroke="#1e293b" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" />' },
  { id: 'star', markup: '<path d="M12 2l3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" fill="#1e293b" />' },
  { id: 'heart', markup: '<path d="M12 21s-7-4.5-9-9.5C2 7 5 4 8 5c1.5.5 3 1.5 4 3 1-1.5 2.5-2.5 4-3 3-1 6 2 5 6.5-2 5-9 9.5-9 9.5z" fill="#1e293b" />' },
  { id: 'circle', markup: '<circle cx="12" cy="12" r="9" stroke="#1e293b" stroke-width="2" fill="none" />' },
  { id: 'square', markup: '<rect x="3" y="3" width="18" height="18" rx="2" stroke="#1e293b" stroke-width="2" fill="none" />' },
  { id: 'check', markup: '<path d="M5 13l4 4L19 7" stroke="#1e293b" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" />' },
];

/** Build a self-contained SVG data URL for an icon's markup. */
function iconToDataUrl(markup: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="240" height="240" fill="none">${markup}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Read an uploaded File as a data URL so it survives persistence/reload.
 *  A blob: URL would be invalidated on tab close, breaking saved designs. */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function LeftPanelV2() {
  const [active, setActive] = useState<Tab>('shapes');
  const [search, setSearch] = useState('');

  // Default to the assets/shapes tab; the 'pages' search-gate is removed
  // along with the tab.

  return (
    <div className="flex h-full w-64 shrink-0 border-r border-slate-200 bg-white select-none flex-col">
      {/* Vertical tab rail */}
      <div className="flex border-b border-slate-200 bg-slate-50">
        {TABS.map((tab) => {
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              className={cn(
                'flex-1 grid place-items-center h-10 transition-all border-b-2',
                isActive ? 'border-blue-600 text-blue-600 bg-blue-600/5' : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50',
              )}
              title={tab.label}
              aria-label={tab.label}
              aria-pressed={isActive}
            >
              <Icon name={tab.icon} className="h-4 w-4" />
            </button>
          );
        })}
      </div>

      {/* Search bar */}
      {active !== 'ai' && (
        <div className="px-2 py-2 border-b border-slate-200">
          <div className="relative">
            <Icon name={ICON.search} className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${active}…`}
              className="w-full h-7 pl-7 pr-2 text-[11px] rounded-md border border-slate-200 bg-slate-100 text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-600/40"
            />
          </div>
        </div>
      )}

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {active === 'assets' && <AssetsTab search={search} />}
        {active === 'shapes' && <ShapesTab search={search} />}
        {active === 'text' && <TextTab search={search} />}
        {active === 'templates' && <TemplatesTab search={search} />}
        {active === 'ai' && <AIDrawer onAddImage={(url) => addImageFromUrl(url)} />}
      </div>
    </div>
  );
}

/* ---------- Assets ---------- */
type AssetCategory = 'all' | 'photos' | 'icons';
const ASSET_CATEGORIES: { id: AssetCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'photos', label: 'Photos' },
  { id: 'icons', label: 'Icons' },
];

function AssetsTab({ search }: { search: string }) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [category, setCategory] = useState<AssetCategory>('all');
  const filter = search.trim().toLowerCase();
  const images = (filter ? SAMPLE_IMAGES.filter((i) => i.label.toLowerCase().includes(filter)) : SAMPLE_IMAGES)
    .filter(() => category !== 'icons');
  const icons = (filter ? SAMPLE_ICONS.filter((i) => i.id.includes(filter)) : SAMPLE_ICONS)
    .filter(() => category !== 'photos');
  return (
    <div className="p-2 space-y-3">
      <div className="flex gap-1.5">
        {ASSET_CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setCategory(c.id)}
            aria-pressed={category === c.id}
            className={cn(
              'h-6 px-2.5 rounded-full text-[9.5px] font-semibold border transition-colors',
              category === c.id
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300',
            )}
          >
            {c.label}
          </button>
        ))}
      </div>
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={async (e) => {
        // Read each upload as a data URL so the inserted image survives
        // persistence + reload. A blob: URL would be revoked on tab close
        // and would never restore from localStorage.
        const files = Array.from(e.target.files ?? []);
        for (const f of files) {
          try {
            const dataUrl = await readFileAsDataUrl(f);
            if (dataUrl) addImageFromUrl(dataUrl);
          } catch {
            /* skip unreadable file */
          }
        }
        // Reset the input so selecting the same file twice re-fires onChange.
        if (fileRef.current) fileRef.current.value = '';
      }} />
      <div
        onClick={() => fileRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileRef.current?.click();
          }
        }}
        aria-label="Upload assets: PNG, JPG, SVG, or WebP"
        className="rounded-lg border border-dashed border-slate-200 bg-slate-100 hover:border-blue-600/40 hover:bg-blue-600/5 focus-visible:ring-1 focus-visible:ring-blue-600/40 transition-colors p-4 text-center cursor-pointer"
      >
        <Icon name={ICON.fileUpload} className="h-5 w-5 text-slate-500 mx-auto mb-1" />
        <p className="text-[10px] font-medium text-slate-900">Upload assets</p>
        <p className="text-[9px] text-slate-600">PNG, JPG, SVG, WebP</p>
      </div>

      {category !== 'photos' && (
      <Section title="Icons" count={icons.length}>
        <div className="grid grid-cols-4 gap-1.5">
          {icons.map((i) => (
            <button
              key={i.id}
              onClick={() => addImageFromUrl(iconToDataUrl(i.markup))}
              className="aspect-square grid place-items-center rounded-md bg-slate-50 border border-slate-200 hover:border-blue-600/40 hover:text-blue-600 text-slate-700 transition"
              title={`Insert ${i.id} icon`}
              aria-label={`Insert ${i.id} icon`}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" dangerouslySetInnerHTML={{ __html: i.markup }} />
            </button>
          ))}
        </div>
      </Section>
      )}

      {category !== 'icons' && (
      <Section title="Photos" count={images.length}>
        <div className="grid grid-cols-2 gap-1.5">
          {images.map((img) => (
            <button
              key={img.url}
              onClick={() => addImageFromUrl(img.url)}
              aria-label={`Insert photo: ${img.label}`}
              title={img.label}
              className="aspect-video rounded-md overflow-hidden border border-slate-200 hover:border-blue-600/40 group relative"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={img.label} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition grid place-items-center">
                <Icon name={ICON.plus} className="h-4 w-4 text-white" />
              </div>
            </button>
          ))}
        </div>
      </Section>
      )}
    </div>
  );
}

/* ---------- Shapes ---------- */
function ShapesTab({ search }: { search: string }) {
  const filter = search.trim().toLowerCase();
  const items = filter ? SHAPES.filter((s) => s.label.toLowerCase().includes(filter)) : SHAPES;
  return (
    <div className="p-2 space-y-3">
      <Section title="Primitives" count={items.length}>
        <div className="grid grid-cols-2 gap-1.5">
          {items.map((s) => (
            <button
              key={s.kind}
              onClick={() => addShape(s.kind)}
              aria-label={`Add ${s.label}`}
              // Was `grid place-items-center` with the label as an
              // `absolute` sibling — with no `relative` ancestor, `absolute`
              // resolves against the viewport (the initial containing
              // block), not this button, so every shape's name rendered
              // stacked in one spot near the page origin instead of under
              // its icon. Normal flex-column flow needs no positioning
              // context and can't drift like that.
              className="aspect-[5/4] rounded-md bg-slate-50 border border-slate-200 hover:border-blue-600/40 hover:bg-slate-50 transition flex flex-col items-center justify-center gap-1.5"
              title={s.label}
            >
              {s.preview}
              <span className="text-[9px] uppercase tracking-wider text-slate-600">{s.label}</span>
            </button>
          ))}
        </div>
      </Section>
    </div>
  );
}

/* ---------- Text ---------- */
function TextTab({ search }: { search: string }) {
  const filter = search.trim().toLowerCase();
  const items = filter ? TEXT_PRESETS.filter((t) => t.label.toLowerCase().includes(filter)) : TEXT_PRESETS;
  return (
    <div className="p-2 space-y-1.5">
      {items.map((t) => (
        <button
          key={t.kind}
          onClick={() => addTextPreset(t.kind as any)}
          className="w-full text-left p-3 rounded-md bg-slate-50 border border-slate-200 hover:border-blue-600/40 hover:bg-slate-50 transition flex items-center justify-between"
        >
          <span className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">{t.label}</span>
            <span>{t.preview}</span>
          </span>
          <Icon name={ICON.plus} className="h-3 w-3 text-slate-500" />
        </button>
      ))}
    </div>
  );
}

/* ---------- Templates ---------- */
function TemplatesTab({ search }: { search: string }) {
  const [w, setW] = useState('1920');
  const [h, setH] = useState('1080');
  const filter = search.trim().toLowerCase();
  const items = (templatesData as any[]).filter(
    (t) => !filter || t.name.toLowerCase().includes(filter) || t.category.toLowerCase().includes(filter),
  );
  return (
    <div className="p-2 space-y-2">
      <div className="grid grid-cols-2 gap-1.5">
        {items.map((t) => (
          <button
            key={t.id}
            onClick={() => resizeArtboard(t.width, t.height)}
            className="text-left p-2 rounded-md bg-slate-50 border border-slate-200 hover:border-blue-600/40 transition"
          >
            <div
              className="rounded-sm border border-slate-700 bg-slate-200 mb-1.5"
              style={{
                aspectRatio: `${t.width} / ${t.height}`,
                maxHeight: 60,
                maxWidth: '100%',
                margin: '0 auto',
              }}
            />
            <p className="text-[10px] font-semibold text-slate-900 truncate">{t.name}</p>
            <p className="text-[9px] font-mono text-slate-600">{t.width} × {t.height}</p>
          </button>
        ))}
      </div>
      <div className="rounded-md border border-slate-200 bg-slate-100 p-2 space-y-1.5">
        <p className="text-[10px] font-semibold text-slate-700 uppercase tracking-wider">Custom size</p>
        <div className="grid grid-cols-2 gap-1.5">
          <Input type="number" value={w} onChange={(e) => setW(e.target.value)} className="h-7 font-mono" />
          <Input type="number" value={h} onChange={(e) => setH(e.target.value)} className="h-7 font-mono" />
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            const nw = parseInt(w, 10);
            const nh = parseInt(h, 10);
            if (!isNaN(nw) && !isNaN(nh) && nw > 0 && nh > 0) resizeArtboard(nw, nh);
          }}
          className="w-full h-7 text-[10px] border-slate-200"
        >
          Resize
        </Button>
      </div>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between px-1">
        <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider">{title}</span>
        {typeof count === 'number' && (
          <span className="text-[9px] font-mono text-slate-600">{count}</span>
        )}
      </div>
      {children}
    </div>
  );
}
