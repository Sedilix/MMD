"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useUser } from "@/firebase";
import { getConsent, ensureAnonId, CONSENT_CHANGED_EVENT } from "@/lib/site-consent";

/**
 * Fires one first-party pageview per route change into /api/telemetry/pageview
 * — nothing else on the page needs to know this exists. Gated entirely by
 * site-consent: with no accepted consent, ensureAnonId() returns null and
 * this is a no-op, so declining the cookie banner really does stop tracking
 * rather than just hiding the banner.
 *
 * Listens for CONSENT_CHANGED_EVENT so accepting mid-session tracks the
 * page the visitor is already on, not just the next navigation.
 */
export function PageviewTracker() {
  const pathname = usePathname();
  const { user } = useUser();
  const lastSentPath = useRef<string | null>(null);

  useEffect(() => {
    const send = () => {
      if (getConsent() !== "accepted") return;
      if (lastSentPath.current === pathname) return;
      const anonId = ensureAnonId();
      if (!anonId) return;
      lastSentPath.current = pathname;

      const payload = JSON.stringify({
        path: pathname,
        referrer: document.referrer || null,
        anonId,
        userId: user?.uid || null,
      });

      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        navigator.sendBeacon("/api/telemetry/pageview", new Blob([payload], { type: "application/json" }));
      } else {
        fetch("/api/telemetry/pageview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: true,
        }).catch(() => {});
      }
    };

    send();
    window.addEventListener(CONSENT_CHANGED_EVENT, send);
    return () => window.removeEventListener(CONSENT_CHANGED_EVENT, send);
  }, [pathname, user?.uid]);

  return null;
}
