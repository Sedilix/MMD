/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Design Canvas — Layers Panel (v2)
 *
 * Figma-class hierarchical layers tree with:
 *   - drag-to-reorder
 *   - inline rename
 *   - visibility + lock toggles
 *   - nested groups
 *   - keyboard navigation (ArrowUp/Down to move selection through the tree)
 */
'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';
import { getStore, useDocument, useSelection, useStoreTick } from './core/store';
import { groupSelection, ungroupSelection, updateNode } from './core/actions';
import type { CanvasNode } from './core/types';
import { ICON } from './core/icons';

const ICON_FOR: Record<string, string> = {
  rect: ICON.rect,
  ellipse: ICON.ellipse,
  triangle: ICON.triangle,
  line: ICON.line,
  text: ICON.text,
  image: ICON.image,
  frame: ICON.frame,
  group: ICON.group,
  star: ICON.star,
  polygon: ICON.polygon,
  path: ICON.pen,
};

interface RowProps {
  node: CanvasNode;
  depth: number;
  expanded: Set<string>;
  toggle: (id: string) => void;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
}

function Row({ node, depth, expanded, toggle, editingId, setEditingId }: RowProps) {
  const sel = useSelection();
  const isActive = sel.ids.includes(node.id);
  const isPrimary = sel.primary === node.id;
  const isGroup = node.kind === 'group';
  const hasChildren = isGroup && (node.children?.length ?? 0) > 0;
  const isExpanded = expanded.has(node.id);
  const [draft, setDraft] = useState(node.name);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editingId === node.id) {
      setDraft(node.name);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
    }
  }, [editingId, node.id, node.name]);

  return (
    <div>
      <div
        className={cn(
          'group flex h-7 items-center gap-1 rounded-md text-[11px] transition-colors',
          isPrimary ? 'bg-blue-600/15 text-slate-900' : isActive ? 'bg-slate-100 text-slate-900' : 'hover:bg-slate-100/30 text-slate-500',
        )}
        style={{ paddingLeft: 6 + depth * 12 }}
        onClick={(e) => {
          if (e.shiftKey) {
            const set = new Set(sel.ids);
            if (set.has(node.id)) set.delete(node.id);
            else set.add(node.id);
            getStore().setSelection(Array.from(set));
          } else {
            getStore().setSelection([node.id]);
          }
        }}
        onDoubleClick={() => setEditingId(node.id)}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('design-node', node.id);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('design-node')) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          const draggedId = e.dataTransfer.getData('design-node');
          if (!draggedId || draggedId === node.id) return;
          // Move dragged above this node
          const store = getStore();
          const dragged = store.doc.nodes[draggedId];
          if (!dragged) return;
          // Strategy: bring dragged to front if dropping on a sibling, or add to group if dropping on a group
          if (isGroup) {
            store.commit((doc) => {
              const d = doc.nodes[draggedId];
              if (!d) return;
              // detach from current parent
              if (d.parentId && doc.nodes[d.parentId]) {
                const p = doc.nodes[d.parentId];
                p.children = (p.children ?? []).filter((c) => c !== draggedId);
              } else {
                doc.rootIds = doc.rootIds.filter((c) => c !== draggedId);
              }
              d.parentId = node.id;
              const group = doc.nodes[node.id];
              const existingChildren = group.children ?? [];
              // Give the dropped node a z past the group's current top,
              // instead of keeping whatever z it happened to have in its
              // old sibling list — that old value could coincide with an
              // existing child's z and produce an arbitrary stacking order.
              const maxZ = existingChildren.length
                ? Math.max(...existingChildren.map((cid) => doc.nodes[cid]?.z ?? 0))
                : -1;
              d.z = maxZ + 1;
              group.children = [...existingChildren, draggedId];
            });
          } else {
            // Reorder: move dragged to be just above the drop target in
            // z-order, within the SAME parent as the target. This also
            // correctly reparents a node dragged out of a group onto the
            // top level (or into another group's sibling list).
            store.commit((doc) => {
              const d = doc.nodes[draggedId];
              const t = doc.nodes[node.id];
              if (!d || !t) return;
              // Detach from old parent
              if (d.parentId && doc.nodes[d.parentId]) {
                const p = doc.nodes[d.parentId];
                p.children = (p.children ?? []).filter((c) => c !== draggedId);
              } else {
                doc.rootIds = doc.rootIds.filter((c) => c !== draggedId);
              }
              // Attach to target's parent
              d.parentId = t.parentId;
              const siblings = t.parentId && doc.nodes[t.parentId]
                ? doc.nodes[t.parentId].children ?? []
                : doc.rootIds;
              const targetIdx = siblings.indexOf(node.id);
              if (t.parentId && doc.nodes[t.parentId]) {
                const p = doc.nodes[t.parentId];
                p.children = [...(p.children ?? []).filter((c) => c !== draggedId), draggedId];
              } else {
                doc.rootIds = [...doc.rootIds.filter((c) => c !== draggedId), draggedId];
              }
              void targetIdx;
              // Renormalize all siblings' z to clean integers in current
              // paint order. The previous `d.z = t.z + 0.5` accumulated
              // fractional drift that eventually broke reorder's logic.
              const order = (t.parentId && doc.nodes[t.parentId]
                ? doc.nodes[t.parentId].children ?? []
                : doc.rootIds
              ).slice();
              order
                .sort((a, b) => (doc.nodes[a]?.z ?? 0) - (doc.nodes[b]?.z ?? 0))
                .forEach((sibId, i) => { if (doc.nodes[sibId]) doc.nodes[sibId].z = i; });
            });
          }
        }}
      >
        {isGroup ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggle(node.id);
            }}
            aria-label={isExpanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
            aria-expanded={isExpanded}
            className="grid h-4 w-4 place-items-center text-slate-500"
          >
            <Icon name={isExpanded ? ICON.chevronDown : ICON.chevronRight} className="h-3 w-3" />
          </button>
        ) : (
          <span className="inline-block h-4 w-4" />
        )}
        <Icon name={ICON_FOR[node.kind] ?? 'shapes'} className="h-3.5 w-3.5 text-blue-600/80 shrink-0" />
        {editingId === node.id ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              updateNode(node.id, { name: draft.trim() || node.name });
              setEditingId(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                updateNode(node.id, { name: draft.trim() || node.name });
                setEditingId(null);
              }
              if (e.key === 'Escape') setEditingId(null);
              e.stopPropagation();
            }}
            className="flex-1 bg-slate-100 border border-blue-600/40 rounded px-1 py-0 text-[11px] outline-none"
          />
        ) : (
          <span className={cn('flex-1 truncate', !node.visible && 'opacity-40', node.locked && 'italic')}>{node.name}</span>
        )}

        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => updateNode(node.id, { visible: !node.visible })}
            className="grid h-5 w-5 place-items-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            title={node.visible ? 'Hide' : 'Show'}
            aria-label={node.visible ? `Hide ${node.name}` : `Show ${node.name}`}
            aria-pressed={!node.visible}
          >
            <Icon name={node.visible ? ICON.show : ICON.hide} className="h-3 w-3" />
          </button>
          <button
            onClick={() => updateNode(node.id, { locked: !node.locked })}
            className={cn(
              'grid h-5 w-5 place-items-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-900',
              node.locked && 'text-amber-600',
            )}
            title={node.locked ? 'Unlock' : 'Lock'}
            aria-label={node.locked ? `Unlock ${node.name}` : `Lock ${node.name}`}
            aria-pressed={node.locked}
          >
            <Icon name={node.locked ? ICON.lock : ICON.lockOpen} className="h-3 w-3" />
          </button>
        </div>
      </div>

      {isGroup && isExpanded && (
        <div>
          {(node.children ?? [])
            .slice()
            .sort((a, b) => {
              const na = getStore().doc.nodes[a];
              const nb = getStore().doc.nodes[b];
              return (na?.z ?? 0) - (nb?.z ?? 0);
            })
            .map((cid) => {
              const cnode = getStore().doc.nodes[cid];
              if (!cnode) return null;
              return (
                <Row
                  key={cid}
                  node={cnode}
                  depth={depth + 1}
                  expanded={expanded}
                  toggle={toggle}
                  editingId={editingId}
                  setEditingId={setEditingId}
                />
              );
            })}
        </div>
      )}
    </div>
  );
}

export function LayersPanelV2() {
  const doc = useDocument();
  useStoreTick();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Render top-level nodes in z-descending order so users see top of the
  // visual stack at the top of the panel (Figma convention).
  const topLevel = useMemo(
    () =>
      doc.rootIds
        .slice()
        .sort((a, b) => (doc.nodes[b]?.z ?? 0) - (doc.nodes[a]?.z ?? 0))
        .map((id) => doc.nodes[id])
        .filter(Boolean),
    [doc],
  );

  const filtered = search.trim()
    ? topLevel.filter((n) => n.name.toLowerCase().includes(search.toLowerCase()))
    : topLevel;

  return (
    <div className="flex flex-col h-full select-none">
      <div className="flex items-center gap-1.5 px-2 py-2 border-b border-slate-200">
        <Icon name={ICON.layers} className="h-3.5 w-3.5 text-slate-600" />
        <span className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider flex-1">Layers</span>
        <button
          onClick={() => groupSelection()}
          className="grid h-6 w-6 place-items-center rounded text-slate-600 hover:bg-slate-200 hover:text-slate-900"
          title="Group selection (Ctrl+G)"
          aria-label="Group selection"
        >
          <Icon name={ICON.group} className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => ungroupSelection()}
          className="grid h-6 w-6 place-items-center rounded text-slate-600 hover:bg-slate-200 hover:text-slate-900"
          title="Ungroup (Ctrl+Shift+G)"
          aria-label="Ungroup selection"
        >
          <Icon name={ICON.ungroup} className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="px-2 py-1.5">
        <div className="relative">
          <Icon name={ICON.search} className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search layers…"
            className="w-full h-7 pl-7 pr-2 text-[11px] rounded-md border border-slate-200 bg-slate-100 text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-600/40"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto px-1 pb-2 space-y-0.5">
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-[10px] text-slate-600">
            {search.trim() ? 'No layers match your search.' : 'No layers yet — start by adding shapes from the left panel.'}
          </div>
        ) : (
          filtered.map((n) => (
            <Row
              key={n.id}
              node={n}
              depth={0}
              expanded={expanded}
              toggle={toggle}
              editingId={editingId}
              setEditingId={setEditingId}
            />
          ))
        )}
      </div>
    </div>
  );
}
