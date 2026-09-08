/**
 * Shared session-cookie name.
 *
 * The Firebase session cookie is minted in /api/session/login and read by the
 * Edge proxy, the playground guards, and the lets-chat / notify-admin routes.
 *
 * P3-1: in production we use the `__Host-` cookie prefix, which the browser
 * only honours when the cookie is `Secure`, `Path=/`, and has no `Domain`
 * — exactly the constraints we already set. `__Host-` defends against a
 * subdomain being able to set a session cookie for the apex, so a
 * compromised sandbox subdomain can't forge an admin session.
 *
 * In development (http://localhost) the `__Host-` prefix is illegal (it
 * requires Secure), so we fall back to the plain `__session` name there.
 *
 * This constant is safe to import from both client and server bundles — it
 * reads only NEXT_PUBLIC_* vars and NODE_ENV, no secrets.
 */
export const SESSION_COOKIE_NAME =
    process.env.NODE_ENV === 'production' ? '__Host-session' : '__session';