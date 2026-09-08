"use client";

import { useEffect, useRef, useCallback } from "react";
import { useUser } from "@/firebase";

export interface TelemetryItem {
  targetId: string;
  entityType?: "community_post" | "studio_preset" | "model_route";
  positionIndex?: number;
  propensityScore?: number;
}

/**
 * High-performance, non-blocking telemetry hook for feed impressions & dwell time.
 * Uses IntersectionObserver to record when an item enters the viewport and measures dwell.
 */
export function useFeedTelemetry() {
  const { user } = useUser();
  const queueRef = useRef<Array<any>>([]);
  const dwellTimersRef = useRef<Map<string, number>>(new Map());

  const flushQueue = useCallback(() => {
    if (queueRef.current.length === 0) return;
    const payload = {
      events: queueRef.current.map((evt) => ({
        ...evt,
        userId: user?.uid || "anonymous",
      })),
    };
    queueRef.current = [];

    const jsonStr = JSON.stringify(payload);
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([jsonStr], { type: "application/json" });
      navigator.sendBeacon("/api/telemetry/feed-event", blob);
    } else {
      fetch("/api/telemetry/feed-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: jsonStr,
        keepalive: true,
      }).catch(() => {});
    }
  }, [user?.uid]);

  // Periodic and unmount flush
  useEffect(() => {
    const interval = setInterval(flushQueue, 10_000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushQueue();
      }
    };
    window.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", flushQueue);

    return () => {
      clearInterval(interval);
      window.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", flushQueue);
      flushQueue();
    };
  }, [flushQueue]);

  const trackAction = useCallback(
    (item: TelemetryItem, action: "clone_preset" | "run_studio" | "upvote" | "bounce") => {
      queueRef.current.push({
        targetId: item.targetId,
        entityType: item.entityType || "community_post",
        positionIndex: item.positionIndex ?? 0,
        action,
        propensityScore: item.propensityScore ?? 1.0,
      });
      if (queueRef.current.length >= 10) {
        flushQueue();
      }
    },
    [flushQueue],
  );

  const observeElement = useCallback(
    (el: HTMLElement | null, item: TelemetryItem) => {
      if (!el || typeof IntersectionObserver === "undefined") return;

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              // Started viewing
              dwellTimersRef.current.set(item.targetId, Date.now());
              queueRef.current.push({
                targetId: item.targetId,
                entityType: item.entityType || "community_post",
                positionIndex: item.positionIndex ?? 0,
                action: "impression",
                propensityScore: item.propensityScore ?? 1.0,
              });
            } else {
              // Left viewport - record dwell if >= 500ms
              const startTime = dwellTimersRef.current.get(item.targetId);
              if (startTime) {
                const dwellMs = Date.now() - startTime;
                dwellTimersRef.current.delete(item.targetId);
                if (dwellMs >= 500) {
                  queueRef.current.push({
                    targetId: item.targetId,
                    entityType: item.entityType || "community_post",
                    positionIndex: item.positionIndex ?? 0,
                    action: "dwell",
                    dwellMs,
                    propensityScore: item.propensityScore ?? 1.0,
                  });
                }
              }
            }
          });
        },
        { threshold: 0.5 },
      );

      observer.observe(el);
      return () => observer.disconnect();
    },
    [],
  );

  return { trackAction, observeElement, flushQueue };
}
