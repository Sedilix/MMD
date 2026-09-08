'use client';

import React, { useEffect, useState, useRef } from 'react';
import { cn } from '@/lib/utils';

interface MMDConnectorsProps {
  columns: Array<{ id: string; modelId: string }>;
  mmdState: 'idle' | 'running' | 'synthesizing' | 'done' | 'error';
}

interface Point {
  x: number;
  y: number;
}

interface Connection {
  id: string;
  fromId: string;
  toId: string;
  path: string;
  fromPoint: Point;
  toPoint: Point;
  active: boolean;
}

export function MMDConnectors({ columns, mmdState }: MMDConnectorsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [chatboxConnection, setChatboxConnection] = useState<Connection | null>(null);

  // We want to update calculations on resize, scroll (if inside container), and when columns change
  useEffect(() => {
    const updateCoordinates = () => {
      const container = containerRef.current;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const mmdEl = document.getElementById('column-mmd-chair');
      const chatboxEl = document.getElementById('playground-chatbox');

      if (!mmdEl) {
        setConnections([]);
        setChatboxConnection(null);
        return;
      }

      const mmdRect = mmdEl.getBoundingClientRect();
      const mmdCenter: Point = {
        x: mmdRect.left - containerRect.left + mmdRect.width / 2,
        y: mmdRect.top - containerRect.top + mmdRect.height / 2,
      };

      const newConnections: Connection[] = [];

      // 1. Connect regular columns to MMD Chairman
      const activeCols: string[] = [];
      columns.forEach((col) => {
        const colEl = document.getElementById(`column-${col.id}`);
        if (!colEl) return;
        activeCols.push(col.id);

        const colRect = colEl.getBoundingClientRect();
        
        // Find best edge intersection (closest point on col boundary to mmdCenter)
        const colCenter = {
          x: colRect.left - containerRect.left + colRect.width / 2,
          y: colRect.top - containerRect.top + colRect.height / 2,
        };

        // Determine edge point
        let startX = colCenter.x;
        let startY = colCenter.y;
        
        if (colCenter.x < mmdCenter.x - mmdRect.width / 2) {
          startX = colRect.right - containerRect.left;
        } else if (colCenter.x > mmdCenter.x + mmdRect.width / 2) {
          startX = colRect.left - containerRect.left;
        }
        
        if (colCenter.y < mmdCenter.y - mmdRect.height / 2) {
          startY = colRect.bottom - containerRect.top;
        } else if (colCenter.y > mmdCenter.y + mmdRect.height / 2) {
          startY = colRect.top - containerRect.top;
        }

        // Target edge point on MMD column
        let endX = mmdCenter.x;
        let endY = mmdCenter.y;

        if (colCenter.x < mmdCenter.x) {
          endX = mmdRect.left - containerRect.left;
        } else if (colCenter.x > mmdCenter.x) {
          endX = mmdRect.right - containerRect.left;
        }

        if (colCenter.y < mmdCenter.y - mmdRect.height / 4) {
          endY = mmdRect.top - containerRect.top + mmdRect.height / 4;
        } else if (colCenter.y > mmdCenter.y + mmdRect.height / 4) {
          endY = mmdRect.bottom - containerRect.top - mmdRect.height / 4;
        }

        // Bezier curve control points
        const controlX = (startX + endX) / 2;
        const path = `M ${startX} ${startY} Q ${controlX} ${(startY + endY) / 2} ${endX} ${endY}`;

        newConnections.push({
          id: `col-to-mmd-${col.id}`,
          fromId: col.id,
          toId: 'mmd-chair',
          path,
          fromPoint: { x: startX, y: startY },
          toPoint: { x: endX, y: endY },
          active: mmdState === 'running' || mmdState === 'synthesizing',
        });
      });

      // 2. Connect sequential columns (debate flow: col 0 <-> col 1 <-> col 2)
      for (let i = 0; i < activeCols.length - 1; i++) {
        const fromColId = activeCols[i];
        const toColId = activeCols[i + 1];
        const fromEl = document.getElementById(`column-${fromColId}`);
        const toEl = document.getElementById(`column-${toColId}`);

        if (fromEl && toEl) {
          const fromRect = fromEl.getBoundingClientRect();
          const toRect = toEl.getBoundingClientRect();

          const fromPoint = {
            x: fromRect.right - containerRect.left,
            y: fromRect.top - containerRect.top + fromRect.height / 2,
          };
          const toPoint = {
            x: toRect.left - containerRect.left,
            y: toRect.top - containerRect.top + toRect.height / 2,
          };

          // Draw straight line or curve
          const path = `M ${fromPoint.x} ${fromPoint.y} L ${toPoint.x} ${toPoint.y}`;

          newConnections.push({
            id: `debate-${fromColId}-${toColId}`,
            fromId: fromColId,
            toId: toColId,
            path,
            fromPoint,
            toPoint,
            active: mmdState === 'running',
          });
        }
      }

      setConnections(newConnections);

      // 3. Connect MMD Chairman to Chatbox (always flows down)
      if (chatboxEl) {
        const chatboxRect = chatboxEl.getBoundingClientRect();
        
        // MMD Bottom
        const mmdBottom = {
          x: mmdRect.left - containerRect.left + mmdRect.width / 2,
          y: mmdRect.bottom - containerRect.top,
        };

        // Chatbox Top
        const chatboxTop = {
          x: chatboxRect.left - containerRect.left + chatboxRect.width / 2,
          y: chatboxRect.top - containerRect.top,
        };

        // If chatbox is not directly accessible (e.g. offscreen or weird layering), fallback
        const path = `M ${mmdBottom.x} ${mmdBottom.y} C ${mmdBottom.x} ${(mmdBottom.y + chatboxTop.y) / 2}, ${chatboxTop.x} ${(mmdBottom.y + chatboxTop.y) / 2}, ${chatboxTop.x} ${chatboxTop.y}`;

        setChatboxConnection({
          id: 'mmd-to-chatbox',
          fromId: 'mmd-chair',
          toId: 'playground-chatbox',
          path,
          fromPoint: mmdBottom,
          toPoint: chatboxTop,
          active: mmdState === 'synthesizing' || mmdState === 'done',
        });
      } else {
        setChatboxConnection(null);
      }
    };

    // Run initial calculations after a short timeout to let layout settle
    const timer = setTimeout(updateCoordinates, 300);

    window.addEventListener('resize', updateCoordinates);
    // Find the nearest scrollable parent of container
    const scrollParent = containerRef.current?.closest('.overflow-auto');
    if (scrollParent) {
      scrollParent.addEventListener('scroll', updateCoordinates);
    }

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateCoordinates);
      if (scrollParent) {
        scrollParent.removeEventListener('scroll', updateCoordinates);
      }
    };
  }, [columns, mmdState]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none z-10 w-full h-full overflow-visible"
    >
      <svg className="w-full h-full overflow-visible">
        <defs>
          {/* Glow filter for active lines and dots */}
          <filter id="red-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {connections.map((conn) => (
          <g key={conn.id}>
            {/* Background connection line */}
            <path
              d={conn.path}
              className={cn(
                "stroke-rose-500/20 transition-all duration-500",
                conn.active ? "stroke-rose-500/60 stroke-[2px]" : "stroke-[1px]"
              )}
              fill="none"
            />

            {/* Termination dots */}
            <circle
              cx={conn.fromPoint.x}
              cy={conn.fromPoint.y}
              r={3}
              className={cn(
                "fill-rose-500/40 transition-colors duration-500",
                conn.active && "fill-rose-500"
              )}
              filter={conn.active ? "url(#red-glow)" : undefined}
            />
            <circle
              cx={conn.toPoint.x}
              cy={conn.toPoint.y}
              r={3}
              className={cn(
                "fill-rose-500/40 transition-colors duration-500",
                conn.active && "fill-rose-500"
              )}
              filter={conn.active ? "url(#red-glow)" : undefined}
            />

            {/* Pulsing signal flowing along line */}
            {conn.active && (
              <circle r={3.5} fill="#ef4444" filter="url(#red-glow)">
                <animateMotion
                  path={conn.path}
                  dur="1.8s"
                  repeatCount="indefinite"
                />
              </circle>
            )}
          </g>
        ))}

        {chatboxConnection && (
          <g>
            <path
              d={chatboxConnection.path}
              className={cn(
                "stroke-emerald-500/20 transition-all duration-500",
                chatboxConnection.active ? "stroke-emerald-500/60 stroke-[2px]" : "stroke-[1px]"
              )}
              fill="none"
            />
            <circle
              cx={chatboxConnection.fromPoint.x}
              cy={chatboxConnection.fromPoint.y}
              r={3}
              className={cn(
                "fill-emerald-500/40 transition-colors duration-500",
                chatboxConnection.active && "fill-emerald-500"
              )}
              filter={chatboxConnection.active ? "url(#red-glow)" : undefined}
            />
            <circle
              cx={chatboxConnection.toPoint.x}
              cy={chatboxConnection.toPoint.y}
              r={3}
              className={cn(
                "fill-emerald-500/40 transition-colors duration-500",
                chatboxConnection.active && "fill-emerald-500"
              )}
              filter={chatboxConnection.active ? "url(#red-glow)" : undefined}
            />
            {chatboxConnection.active && (
              <circle r={3.5} fill="#10b981" filter="url(#red-glow)">
                <animateMotion
                  path={chatboxConnection.path}
                  dur="1.5s"
                  repeatCount="indefinite"
                />
              </circle>
            )}
          </g>
        )}
      </svg>
    </div>
  );
}
