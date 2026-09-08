"use client";

import React, { useId, useRef, useState } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useReducedMotion,
  animate,
  type PanInfo,
} from "framer-motion";
import { cn } from "@/lib/utils";

/** Uniform pointer coordinates across mouse / touch / pen events. */
function pointOf(e: MouseEvent | TouchEvent | PointerEvent) {
  const t = "touches" in e ? (e.touches[0] ?? e.changedTouches[0]) : e;
  return { px: t?.clientX ?? 0, py: t?.clientY ?? 0 };
}

/**
 * DraggableCard — working draft of the iOS-style "draggable bubble".
 *
 * The card lifts on press (scale + deeper shadow), drags freely, and a
 * blurred shadow "trail" lags a beat behind it (low-stiffness spring on the
 * same x/y motion values). On release the card springs back to its grid
 * slot while the trail settles, and a dashed ghost well is revealed in the
 * slot for the duration of the drag — mirroring the reference recording.
 *
 * This is a feel prototype: it demonstrates the interaction language only.
 * Full grid re-ordering (drop-to-swap) is the next step once the direction
 * is approved.
 */
export function DraggableCard({
  children,
  className,
  label,
  registerRef,
  onDragMove,
  sortOrder = 0,
}: {
  children: React.ReactNode;
  className?: string;
  /** Accessible name for the draggable region. */
  label: string;
  /** Registers the grid-slot element so the page can hit-test swaps. */
  registerRef?: (el: HTMLDivElement | null) => void;
  /** Live pointer offset, so the page can reorder while dragging. */
  onDragMove?: (dx: number, dy: number) => void;
  /** CSS grid `order` — the page reorders cards by mutating this. */
  sortOrder?: number;
}) {
  const reduce = useReducedMotion();
  const [dragging, setDragging] = useState(false);

  // Live pointer-driven offset (framer-motion rewrites these with the raw
  // pan delta on every pointermove — never compensate into them directly).
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // Rebase offset: when the page swaps our grid slot mid-drag we shift
  // these instead, so the bubble stays glued under the pointer.
  const compX = useMotionValue(0);
  const compY = useMotionValue(0);
  const posX = useTransform([x, compX], ([a, b]) => (a as number) + (b as number));
  const posY = useTransform([y, compY], ([a, b]) => (a as number) + (b as number));

  // Lagging trail: soft springs chase the pointer, producing the short
  // shadow trail. Higher stiffness = tighter follow; we keep it loose.
  const trailX = useSpring(posX, { stiffness: 140, damping: 22, mass: 0.6 });
  const trailY = useSpring(posY, { stiffness: 140, damping: 22, mass: 0.6 });
  const trailScale = useSpring(1, { stiffness: 200, damping: 24 });
  const trailOpacity = useSpring(0, { stiffness: 260, damping: 26 });

  const id = useId();

  // Pointer-absolute glue: on every pointermove we solve for the comp
  // offset that keeps the grabbed point of the bubble exactly under the
  // pointer, no matter where the grid slot currently is. Self-correcting
  // each move, so mid-drag slot swaps can never accumulate drift.
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const grab = useRef<{ dx: number; dy: number } | null>(null);
  const setWrapRef = (el: HTMLDivElement | null) => {
    wrapRef.current = el;
    registerRef?.(el);
  };

  const onDragStart = (e: MouseEvent | TouchEvent | PointerEvent) => {
    // Framer v12 invokes this asynchronously with currentTarget already
    // null, so measure from the wrapper ref instead of the event target.
    captureGrab(e);
    setDragging(true);
    trailScale.set(reduce ? 1 : 1.03);
    trailOpacity.set(reduce ? 0 : 0.55);
  };

  const captureGrab = (e: MouseEvent | TouchEvent | PointerEvent) => {
    const el = wrapRef.current;
    if (!el || grab.current) return;
    const r = el.getBoundingClientRect();
    const p = pointOf(e);
    // Bubble visual origin = slot origin + composed offset.
    grab.current = {
      dx: p.px - (r.left + posX.get()),
      dy: p.py - (r.top + posY.get()),
    };
  };

  const onDrag = (e: MouseEvent | TouchEvent | PointerEvent) => {
    captureGrab(e);
    const el = wrapRef.current;
    if (el && grab.current) {
      const r = el.getBoundingClientRect();
      const p = pointOf(e);
      compX.set(p.px - grab.current.dx - r.left - x.get());
      compY.set(p.py - grab.current.dy - r.top - y.get());
    }
    onDragMove?.(posX.get(), posY.get());
  };

  const onDragEnd = (_: unknown, info: PanInfo) => {
    setDragging(false);
    grab.current = null;
    trailScale.set(1);
    trailOpacity.set(0);

    // Spring the bubble home. Velocity carries over for a natural settle.
    const spring = { type: "spring", stiffness: 320, damping: 26, mass: 0.9 } as const;
    animate(x, 0, { ...spring, velocity: x.getVelocity() });
    animate(y, 0, { ...spring, velocity: y.getVelocity() });
    animate(compX, 0, spring);
    animate(compY, 0, spring);
    void info;
  };

  return (
    <motion.div
      ref={setWrapRef}
      layout={!reduce && !dragging}
      transition={{ layout: { type: "spring", stiffness: 160, damping: 22, mass: 1 } }}
      className={cn("relative", className, dragging && "z-40")}
      style={{ isolation: "isolate", order: sortOrder }}
    >
      {/* Ghost well revealed while lifted */}
      <div
        aria-hidden
        className={cn(
          "cdv2-ghost absolute inset-0 transition-opacity duration-200",
          dragging ? "opacity-100" : "opacity-0",
        )}
      />

      {/* Lagging shadow trail (paints above the ghost well, below the bubble) */}
      <motion.div
        aria-hidden
        className="cdv2-trail pointer-events-none absolute inset-0"
        style={{ x: trailX, y: trailY, scale: trailScale, opacity: trailOpacity }}
      />

      {/* Rebase layer: carries the mid-drag slot-swap compensation so the
          bubble stays glued under the pointer. Framer owns the bubble's
          x/y and never touches these values. */}
      <motion.div className="h-full" style={{ x: compX, y: compY }}>
        {/* The bubble */}
        <motion.div
          role="group"
          aria-label={label}
          drag={!reduce}
          dragMomentum={false}
          dragElastic={0.12}
          dragListener
          style={{ x, y }}
          onDrag={onDrag}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          whileHover={reduce ? undefined : { y: -2 }}
          whileDrag={
            reduce
              ? undefined
              : {
                  scale: 1.04,
                  // Literal value: framer cannot interpolate CSS var() shadows.
                  boxShadow:
                    "0 2px 4px rgba(32, 26, 22, 0.06), 0 24px 48px -16px rgba(32, 26, 22, 0.28)",
                  cursor: "grabbing",
                }
          }
          transition={{ type: "spring", stiffness: 320, damping: 26 }}
          className={cn(
            "cdv2-card relative h-full cursor-grab select-none overflow-hidden",
            "transition-shadow duration-200 focus-visible:outline-2 focus-visible:outline-offset-2",
          )}
          data-card={id}
        >
          {children}
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
