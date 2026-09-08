/**
 * Next.js Instrumentation hook — runs once in the Node.js server runtime at
 * boot (App Hosting / `next start`). Wires Sentry error reporting when a DSN
 * is present; otherwise no-ops so local dev and CI builds are unaffected.
 *
 * Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 *
 * To enable in prod:
 *   1. firebase apphosting:secrets:set SENTRY_DSN --backend cybrdeck-2705
 *   2. Add to apphosting.yaml env:
 *        - variable: SENTRY_DSN
 *          secret: SENTRY_DSN
 *   3. (optional) SENTRY_ENV=production, SENTRY_RELEASE=<git sha>
 *   4. Ensure `@sentry/node` is installed (it is a regular dependency in package.json).
 *   5. Redeploy.
 */
export async function register() {
  // Only register in the Node.js runtime, not the Edge runtime.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const dsn = process.env.SENTRY_DSN;
    if (!dsn) {
      // No DSN configured — skip silently. Keeps local dev / CI clean.
      if (process.env.NODE_ENV === "production") {
        // Surface a warning in prod logs so a forgotten secret is visible.
        // eslint-disable-next-line no-console
        console.warn("[instrumentation] SENTRY_DSN not set — error reporting disabled.");
      }
      return;
    }

    try {
      // Dynamic import so the Sentry SDK is only loaded when configured.
      const Sentry = await import("@sentry/node");
      Sentry.init({
        dsn,
        environment: process.env.SENTRY_ENV || process.env.NODE_ENV || "development",
        release: process.env.SENTRY_RELEASE,
        // Tune sample rates for cost: 100% errors, 10% transactions.
        tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1),
        // Don't send PII.
        sendDefaultPii: false,
      });
      // eslint-disable-next-line no-console
      console.log("[instrumentation] Sentry initialized.");
    } catch (err) {
      // SDK not installed — log once and continue without instrumentation
      // rather than crashing the server boot.
      // eslint-disable-next-line no-console
      console.warn("[instrumentation] @sentry/node not available — skipping:", (err as Error).message);
    }
  }
}