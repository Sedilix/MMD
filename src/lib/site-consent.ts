"use client";

/**
 * Cookie/analytics consent for the public site — the lawful-basis switch
 * behind the CookieConsent banner. Separate from src/lib/one/consent.ts
 * (Telegram PDPA consent for One's DMs, a different surface entirely).
 *
 * The anon-id cookie only gets set when consent is "accepted" — declining
 * means no analytics cookie is ever written, so pageview tracking has
 * nothing to key events to. Accepting later than a previous decline (or
 * vice versa) clears/creates that cookie accordingly.
 */

export const CONSENT_COOKIE = "cybrdeck-cookie-consent";
export const ANON_ID_COOKIE = "cybrdeck-anon-id";
export const CONSENT_CHANGED_EVENT = "cybrdeck-consent-changed";

export type ConsentValue = "accepted" | "declined";

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(";").shift() || null;
  return null;
}

function setCookie(name: string, value: string, days: number) {
  if (typeof document === "undefined") return;
  const date = new Date();
  date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${value || ""}; expires=${date.toUTCString()}; path=/; SameSite=Lax; Secure`;
}

function deleteCookie(name: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax; Secure`;
}

export function getConsent(): ConsentValue | null {
  try {
    const v = localStorage.getItem(CONSENT_COOKIE) || getCookie(CONSENT_COOKIE);
    return v === "accepted" || v === "declined" ? v : null;
  } catch {
    return null;
  }
}

export function setConsent(value: ConsentValue) {
  try {
    localStorage.setItem(CONSENT_COOKIE, value);
  } catch {
    // storage blocked — the cookie fallback below still carries the choice
  }
  setCookie(CONSENT_COOKIE, value, 365);

  if (value === "declined") {
    deleteCookie(ANON_ID_COOKIE);
  } else {
    ensureAnonId();
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CONSENT_CHANGED_EVENT));
  }
}

/** Returns a persistent anonymous visitor id, minting one if consent allows it. Returns null if not consented. */
export function ensureAnonId(): string | null {
  if (getConsent() !== "accepted") return null;
  let id = getCookie(ANON_ID_COOKIE);
  if (!id) {
    id = crypto.randomUUID();
    setCookie(ANON_ID_COOKIE, id, 365);
  }
  return id;
}
