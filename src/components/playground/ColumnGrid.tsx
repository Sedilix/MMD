'use client';

/**
 * Responsive column-grid layouts for the workbench main area.
 *
 * Pure function of (column count, MMD enabled) plus two render callbacks:
 * the MMD chairman window and a per-column renderer. All state and
 * callbacks stay at the page level; this component only owns the
 * responsive arrangement so the page doesn't carry a ~160-line layout
 * switch inline.
 *
 * Layout contract (2026-09-01 rework, user-directed):
 *   - The workbench is an app surface, not a webpage: every desktop
 *     layout fills the available height exactly and never contributes to
 *     page scroll. Grids therefore use `h-full` containers with
 *     `auto-rows-fr` / explicit `grid-rows-*` so implicit rows stretch to
 *     the container instead of collapsing to card content height (the
 *     pre-rework bug that rendered short, overlapping "stacked" cards).
 *   - Non-MMD: 1 column centered; 2 side by side; 3 side by side;
 *     4 in a 2×2 quadrant; 5 as 3-over-2 (bottom pair centered);
 *     6 in a 3×2 grid (audit Step 5).
 *   - MMD: chairman + up to 4 columns in one row; 5/6 columns switch
 *     to a 3-wide grid so every pane stays readable.
 *   - Mobile (<md) keeps the horizontal snap carousel.
 */

import type { ReactNode } from 'react';
import type { ColumnSlot } from '@/lib/playground/workbench';

interface ColumnGridProps {
    columns: ColumnSlot[];
    mmdEnabled: boolean;
    renderMMDWindow: () => ReactNode;
    renderColumn: (col: ColumnSlot) => ReactNode;
}

/** Mobile carousel cell: 85vw snap page on phones, grid-stretched on md+. */
const CELL = 'w-[85vw] md:w-auto shrink-0 h-full min-h-0 snap-center';

/** Desktop grid base: fills the pane, rows stretch to the container. */
const GRID = 'md:grid gap-3 h-full w-full overflow-x-auto md:overflow-hidden scrollbar-none snap-x snap-mandatory md:auto-rows-fr';

export function ColumnGrid({ columns, mmdEnabled, renderMMDWindow, renderColumn }: ColumnGridProps) {
    const count = columns.length;

    // ──── MMD Enabled Layouts (chairman first, then columns in a row) ──
    if (mmdEnabled) {
        if (count === 1) {
            return (
                <div className="flex flex-col md:grid md:grid-cols-2 md:auto-rows-fr gap-3 h-full w-full overflow-y-auto md:overflow-hidden scrollbar-none">
                    <div className="min-h-0 md:h-full">{renderMMDWindow()}</div>
                    <div className="min-h-0 md:h-full">{renderColumn(columns[0])}</div>
                </div>
            );
        }
        if (count === 2) {
            return (
                <div className={`flex md:grid-cols-3 ${GRID}`}>
                    <div className={CELL}>{renderMMDWindow()}</div>
                    <div className={CELL}>{renderColumn(columns[0])}</div>
                    <div className={CELL}>{renderColumn(columns[1])}</div>
                </div>
            );
        }
        if (count === 3) {
            return (
                <div className={`flex md:grid-cols-4 ${GRID}`}>
                    <div className={CELL}>{renderMMDWindow()}</div>
                    <div className={CELL}>{renderColumn(columns[0])}</div>
                    <div className={CELL}>{renderColumn(columns[1])}</div>
                    <div className={CELL}>{renderColumn(columns[2])}</div>
                </div>
            );
        }
        if (count === 4) {
            return (
                <div className={`flex md:grid-cols-5 ${GRID}`}>
                    <div className={CELL}>{renderMMDWindow()}</div>
                    <div className={CELL}>{renderColumn(columns[0])}</div>
                    <div className={CELL}>{renderColumn(columns[1])}</div>
                    <div className={CELL}>{renderColumn(columns[2])}</div>
                    <div className={CELL}>{renderColumn(columns[3])}</div>
                </div>
            );
        }
        // Audit Step 5: five+ columns abandon the single row — six panes
        // plus the chairman in one strip would be unreadably narrow.
        // Chairman + columns flow into a 3-wide grid instead.
        if (count === 5) {
            return (
                <div className={`flex md:grid md:grid-cols-3 md:grid-rows-2 gap-3 h-full w-full overflow-x-auto md:overflow-hidden scrollbar-none snap-x snap-mandatory md:auto-rows-fr`}>
                    <div className={CELL}>{renderMMDWindow()}</div>
                    <div className={CELL}>{renderColumn(columns[0])}</div>
                    <div className={CELL}>{renderColumn(columns[1])}</div>
                    <div className={CELL}>{renderColumn(columns[2])}</div>
                    <div className={CELL}>{renderColumn(columns[3])}</div>
                    <div className={CELL}>{renderColumn(columns[4])}</div>
                </div>
            );
        }
        if (count === 6) {
            return (
                <div className={`flex md:grid md:grid-cols-3 gap-3 h-full w-full overflow-x-auto md:overflow-hidden scrollbar-none snap-x snap-mandatory md:auto-rows-fr`}>
                    <div className={`${CELL} md:col-span-3`}>{renderMMDWindow()}</div>
                    <div className={CELL}>{renderColumn(columns[0])}</div>
                    <div className={CELL}>{renderColumn(columns[1])}</div>
                    <div className={CELL}>{renderColumn(columns[2])}</div>
                    <div className={CELL}>{renderColumn(columns[3])}</div>
                    <div className={CELL}>{renderColumn(columns[4])}</div>
                    <div className={CELL}>{renderColumn(columns[5])}</div>
                </div>
            );
        }
    }

    // ──── MMD Disabled Layouts ──────────────────
    if (count === 1) {
        return (
            <div className="h-full w-full flex justify-center">
                <div className="w-full max-w-4xl h-full min-h-0">
                    {renderColumn(columns[0])}
                </div>
            </div>
        );
    }
    if (count === 2) {
        // Two windows side by side.
        return (
            <div className={`flex md:grid-cols-2 ${GRID}`}>
                <div className={CELL}>{renderColumn(columns[0])}</div>
                <div className={CELL}>{renderColumn(columns[1])}</div>
            </div>
        );
    }
    if (count === 3) {
        // Three windows side by side.
        return (
            <div className={`flex md:grid-cols-3 ${GRID}`}>
                <div className={CELL}>{renderColumn(columns[0])}</div>
                <div className={CELL}>{renderColumn(columns[1])}</div>
                <div className={CELL}>{renderColumn(columns[2])}</div>
            </div>
        );
    }
    if (count === 4) {
        // Four windows in their own 2×2 quadrants.
        return (
            <div className={`flex md:grid-cols-2 md:grid-rows-2 ${GRID}`}>
                <div className={CELL}>{renderColumn(columns[0])}</div>
                <div className={CELL}>{renderColumn(columns[1])}</div>
                <div className={CELL}>{renderColumn(columns[2])}</div>
                <div className={CELL}>{renderColumn(columns[3])}</div>
            </div>
        );
    }
    if (count === 5) {
        // Audit Step 5: three across the top, two centered below on a
        // six-track grid so the bottom pair doesn't hang to the left.
        return (
            <div className={`flex md:grid md:grid-cols-6 md:grid-rows-2 ${GRID}`}>
                <div className={`${CELL} md:col-span-2`}>{renderColumn(columns[0])}</div>
                <div className={`${CELL} md:col-span-2`}>{renderColumn(columns[1])}</div>
                <div className={`${CELL} md:col-span-2`}>{renderColumn(columns[2])}</div>
                <div className={`${CELL} md:col-span-2 md:col-start-2`}>{renderColumn(columns[3])}</div>
                <div className={`${CELL} md:col-span-2`}>{renderColumn(columns[4])}</div>
            </div>
        );
    }
    if (count === 6) {
        // Audit Step 5: six windows as a 3×2 grid.
        return (
            <div className={`flex md:grid md:grid-cols-3 md:grid-rows-2 ${GRID}`}>
                <div className={CELL}>{renderColumn(columns[0])}</div>
                <div className={CELL}>{renderColumn(columns[1])}</div>
                <div className={CELL}>{renderColumn(columns[2])}</div>
                <div className={CELL}>{renderColumn(columns[3])}</div>
                <div className={CELL}>{renderColumn(columns[4])}</div>
                <div className={CELL}>{renderColumn(columns[5])}</div>
            </div>
        );
    }
    return null;
}
