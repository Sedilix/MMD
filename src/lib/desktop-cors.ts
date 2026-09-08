import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

/**
 * CORS for the native desktop app (Tauri v2).
 *
 * The desktop shell is a cross-origin client: inside the webview its origin
 * is `tauri://localhost` (Windows: `http://tauri.localhost`), and in
 * `desktop:dev` it is `http://localhost:<dev-port>`. Every account-credits
 * call it makes (chat streaming, quota, TTS/STT, image studio, Google
 * pairing) therefore arrives at these API routes as a cross-origin request
 * and dies in preflight unless we answer with CORS headers. The web
 * playground is same-origin and never needed this.
 *
 * Trust model is unchanged: CORS only lets the desktop origin *present the
 * user's own Bearer token*; every route still verifies it server-side.
 */

const EXACT_ORIGINS = new Set([
    'tauri://localhost',
    'http://tauri.localhost',
    'https://www.cybrdeck.com',
    'https://cybrdeck.com',
]);

export function isAllowedDesktopOrigin(origin: string | null): origin is string {
    if (!origin) return false;
    if (EXACT_ORIGINS.has(origin)) return true;
    // desktop:dev loads the app from a local Next dev port.
    return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(origin);
}

/** API surfaces the desktop shell calls cross-origin. */
const DESKTOP_CORS_ROUTES = [
    '/api/playground/stream/',
    '/api/playground/quota',
    '/api/desktop-pairing/',
    '/api/stt/token',
    '/api/studio/image',
    '/api/tts',
];

export function isDesktopCorsRoute(pathname: string): boolean {
    return DESKTOP_CORS_ROUTES.some(
        (p) => pathname === p.replace(/\/$/, '') || pathname.startsWith(p),
    );
}

export function desktopCorsHeaders(request: NextRequest): Record<string, string> {
    const origin = request.headers.get('origin');
    const headers: Record<string, string> = { Vary: 'Origin' };
    if (isAllowedDesktopOrigin(origin)) {
        headers['Access-Control-Allow-Origin'] = origin;
        headers['Access-Control-Allow-Methods'] = 'GET,POST,OPTIONS';
        headers['Access-Control-Allow-Headers'] = 'content-type, authorization';
        headers['Access-Control-Max-Age'] = '600';
    }
    return headers;
}

export function desktopCorsPreflight(request: NextRequest): NextResponse {
    return new NextResponse(null, {
        status: 204,
        headers: desktopCorsHeaders(request),
    });
}
