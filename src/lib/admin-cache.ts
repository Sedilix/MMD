/**
 * Cached list of admin emails for the Edge proxy.
 *
 * Mirrors the staleness pattern used in src/cybrshield.ts: fetch the `admins`
 * Firestore collection via the public REST endpoint (no service account
 * required — the firestore.rules allow a signed-in user to read their own
 * admin doc; for an unauthenticated proxy the collection must be readable to
 * the Admin SDK or via the REST endpoint if exposed). We refresh in the
 * background every CACHE_TTL.
 *
 * NOTE on Edge runtime compatibility: this module only uses `fetch` and `crypto`
 * (Web APIs) — safe to import from src/proxy.ts which runs on the Edge runtime.
 */

interface CacheEntry {
    isAdmin: boolean;
    fetchedAt: number;
}

const emailCache = new Map<string, CacheEntry>();
const activeFetches = new Set<string>();
const CACHE_TTL = 60 * 1000; // 60 seconds

function projectId(): string {
    return process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'cybrdeck';
}

async function checkAdminStatus(email: string, origin = 'unknown') {
    if (activeFetches.has(email)) return;
    activeFetches.add(email);
    try {
        const debug = process.env.DEBUG_ADMIN_CACHE === 'true';
        if (debug) console.log(`[ADMIN-CACHE][DEBUG] origin=${origin} fetching admin doc`);

        // Generate email variants — Google social logins sometimes store
        // the email with different casing than the admin doc. We try
        // lowercase, raw, and a re-cased variant so any of the common
        // patterns resolve.
        const emailLower = email.toLowerCase();
        const emailCands = Array.from(new Set([
            emailLower,
            email,
            emailLower.split('@')[0] + '@' + (email.split('@')[1] || '').toLowerCase(),
        ]));

        // Race all variants in parallel; first hit wins.
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const racers = emailCands.map(async (candidate) => {
            const url = `https://firestore.googleapis.com/v1/projects/${projectId()}/databases/(default)/documents/admins/${encodeURIComponent(candidate)}`;
            const res = await fetch(url, { signal: controller.signal });
            return { candidate, res };
        });

        let isAdmin = false;
        let anyNonOk = false;
        let any404 = false;
        try {
            const results = await Promise.all(racers);
            for (const { res, candidate } of results) {
                if (debug) console.log(`[ADMIN-CACHE][DEBUG] origin=${origin} candidate=${candidate} status=${res.status}`);
                if (res.ok) {
                    const data = await res.json();
                    const fields = data.fields || {};
                    const role = fields.role?.stringValue;
                    const uiAccess = fields.uiAccess?.booleanValue !== false;
                    if (role === 'admin' && uiAccess) {
                        isAdmin = true;
                        // Cache the canonical (lowercase) email so subsequent
                        // lookups hit the same key.
                        emailCache.set(emailLower, { isAdmin: true, fetchedAt: Date.now() });
                        return;
                    }
                } else if (res.status === 404) {
                    any404 = true;
                } else {
                    anyNonOk = true;
                    if (res.status === 403) {
                        console.warn(
                            `[ADMIN-CACHE][DEBUG] 403 on admin doc read for ${candidate} — check Firebase API key restrictions or firestore.rules deployment.`,
                        );
                    }
                }
            }
        } finally {
            clearTimeout(timeoutId);
        }

        // Fallback: also accept role:'admin' or portalRole:'Admin' on the user
        // doc (lets Google-signed-in users in even without an /admins doc).
        if (!isAdmin) {
            try {
                const userUrl = `https://firestore.googleapis.com/v1/projects/${projectId()}/databases/(default)/documents/users/${encodeURIComponent(emailLower)}`;
                const controller2 = new AbortController();
                const tid2 = setTimeout(() => controller2.abort(), 2000);
                const ures = await fetch(userUrl, { signal: controller2.signal });
                clearTimeout(tid2);
                if (ures.ok) {
                    const udata = await ures.json();
                    const ufields = udata.fields || {};
                    const urole = ufields.role?.stringValue;
                    const uportal = ufields.portalRole?.stringValue;
                    if (urole === 'admin' || uportal === 'Admin') {
                        isAdmin = true;
                    }
                }
            } catch {
                // Silent — treat as not admin if the user doc is unreachable.
            }
        }

        // Deny-by-default, but backdate transient failures so we retry sooner.
        if (!isAdmin) {
            emailCache.set(emailLower, {
                isAdmin: false,
                fetchedAt: anyNonOk && !any404 ? Date.now() - (CACHE_TTL - 10000) : Date.now(),
            });
        }
        console.log(`[ADMIN-CACHE] Refreshed admin status for ${email}: ${isAdmin}`);
    } catch (err) {
        console.error(`[ADMIN-CACHE] Check failed for ${email}:`, err);
        if (!emailCache.has(email)) {
            emailCache.set(email, {
                isAdmin: false,
                fetchedAt: Date.now() - (CACHE_TTL - 10000),
            });
        }
    } finally {
        activeFetches.delete(email);
    }
}

/**
 * Returns true if `email` is in the cached admin allowlist.
 * Triggers a background refresh if the cache is missing or stale.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
    if (!email) return false;
    const emailLower = email.toLowerCase();
    const now = Date.now();
    const entry = emailCache.get(emailLower);

    if (!entry) {
        void checkAdminStatus(emailLower, 'isAdminEmail-cold');
        return false; // Deny on first lookup, background fetch resolves it
    }

    if (now - entry.fetchedAt > CACHE_TTL) {
        void checkAdminStatus(emailLower, 'isAdminEmail-stale');
    }

    return entry.isAdmin;
}