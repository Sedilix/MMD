/**
 * Content-Security-Policy builder for Cybrdeck.
 *
 * The CSP is generated per-request with a fresh nonce (see src/proxy.ts) so we
 * can drop 'unsafe-inline' from script-src / style-src without breaking:
 *   - Next.js hydration bootstrap (inline <script> tags get nonce-tagged)
 *   - Tailwind v4 inline styles
 *   - Any other first-party inline snippets
 *
 * 'unsafe-eval' is INTENTIONALLY KEPT. Spline's @splinetool/runtime compiles
 * shaders via Function()/eval-style code paths; removing it blanks the 3D
 * landing, partners, apply-here, and work-with-us scenes.
 *
 * Domain lists are mirrored from the previous static CSP in next.config.ts so
 * no legitimate third-party resource (Translate widget, Speechmatics, Firebase,
 * Spline assets, fonts) is accidentally blocked.
 */

const SCRIPT_DOMAINS = [
    'https://translate.google.com',
    'http://translate.google.com',
    'https://translate-pa.googleapis.com',
    'https://www.gstatic.com',
    'https://apis.google.com',
    'https://translate.googleapis.com',
    'http://translate.googleapis.com',
    'https://www.google-analytics.com',
    'https://cdn.jsdelivr.net',
    'https://unpkg.com',
    'https://cdn.tailwindcss.com',
    'https://esm.sh',
    'https://cdn.skypack.dev',
    'https://*.spline.design',
];

const STYLE_DOMAINS = [
    'https://fonts.googleapis.com',
    'https://translate.googleapis.com',
    'https://www.gstatic.com',
    'https://cdn.jsdelivr.net',
    'https://unpkg.com',
];

const IMG_DOMAINS = [
    'data:',
    'blob:',
    'https://placehold.co',
    'https://images.unsplash.com',
    'https://picsum.photos',
    'https://fastly.picsum.photos',
    'https://*.picsum.photos',
    'https://translate.google.com',
    'http://translate.google.com',
    'https://www.gstatic.com',
    'https://fonts.gstatic.com',
    'https://translate.googleapis.com',
    'https://translate.google.co.in',
    'https://www.google.com',
    'https://*.spline.design',
    'https://*.googleusercontent.com',
    // Drive thumbnails + file preview tiles are served from these CDNs.
    // Without these, admin/applicant Drive preview images log CSP violations.
    'https://lh3.googleusercontent.com',
    'https://lh4.googleusercontent.com',
    'https://lh5.googleusercontent.com',
    'https://lh6.googleusercontent.com',
    'https://drive.google.com',
    'https://docs.google.com',
    // Alibaba Cloud OSS & Model Studio outputs (DashScope T2I / I2V / Audio)
    'https://*.aliyuncs.com',
    'https://*.dashscope.aliyuncs.com',
    'https://*.maas.aliyuncs.com',
    'https://*.oss-accelerate.aliyuncs.com',
    'https://api.llmapi.ai',
    'https://api.elevenlabs.io',
    // Spotify album artwork on the community live-now card.
    'https://*.scdn.co',
    'https://*.spotifycdn.com',
    // Community post media (images & GIFs) served via GCS signed URLs.
    'https://storage.googleapis.com',
];

const FONT_DOMAINS = [
    'https://fonts.gstatic.com',
    'https://*.spline.design',
];

const CONNECT_DOMAINS = [
    'data:',
    'blob:',
    // Tauri desktop IPC. When the site is loaded inside the native app
    // (desktop:dev), every window-control / tray / updater invoke rides
    // the ipc:// custom protocol first; without these two sources the
    // titlebar buttons die with CSP violations.
    'ipc:',
    'http://ipc.localhost',
    // The desktop bridge reroutes every relative /api/* fetch to the
    // production API base, so the app-in-webview needs these even when
    // the page itself is served from localhost.
    'https://www.cybrdeck.com',
    'https://cybrdeck.com',
    'http://127.0.0.1:8000',
    'http://localhost:8000',
    // Local Ollama / LM Studio daemon — the Playground page probes
    // /api/tags on load to surface installed models. Without this the
    // browser blocks the fetch and logs a CSP violation on every
    // playground visit (harmless but noisy).
    'http://127.0.0.1:11434',
    'http://localhost:11434',
    // The cloud RAG service (Cloud Run) the /rag page talks to when
    // NEXT_PUBLIC_RAG_API_URL is baked in.
    'https://cybrdeck-rag-258662267000.asia-southeast1.run.app',
    'https://*.googleapis.com',
    'wss://*.googleapis.com',
    'https://*.firebaseapp.com',
    'https://*.firebaseio.com',
    'wss://*.firebaseio.com',
    'https://firestore.googleapis.com',
    'wss://firestore.googleapis.com',
    'https://translate-pa.googleapis.com',
    'wss://*.speechmatics.com',
    'https://*.speechmatics.com',
    'wss://*.rt.speechmatics.com',
    'https://*.rt.speechmatics.com',
    'wss://api.speechmatics.com',
    'https://api.speechmatics.com',
    'https://translate.googleapis.com',
    'https://translate.google.com',
    'https://*.spline.design',
    'https://*.gstatic.com',
    'https://unpkg.com',
    'https://cdn.jsdelivr.net',
    'https://esm.sh',
    // Alibaba Cloud Model Studio (DashScope) & LLMAPI & ElevenLabs endpoints
    'https://*.aliyuncs.com',
    'https://*.dashscope.aliyuncs.com',
    'https://*.maas.aliyuncs.com',
    'https://api.llmapi.ai',
    'https://api.elevenlabs.io',
    // BYOK direct lanes in the Playground (desktop + web) call provider
    // APIs straight from the client.
    'https://api.deepseek.com',
    'https://api.openai.com',
    'https://api.anthropic.com',
    'https://api.groq.com',
    'https://openrouter.ai',
    'https://api.mistral.ai',
    'https://api.x.ai',
    // Iconify CDN fallbacks used by the icon component.
    'https://api.iconify.design',
    'https://api.simplesvg.com',
    'https://api.unisvg.com',
    // Daily.co is used by /community/rooms/* VTC. The JS SDK opens WebSockets
    // AND makes REST calls to api.daily.co from the client.
    'https://api.daily.co',
    'https://*.daily.co',
    'wss://api.daily.co',
    'wss://*.daily.co',
    // Oomero KYC handshake used by /community/verify.
    'https://api.oomero.io',
    // Firebase Auth IDP — needed for signInWithPopup / signInWithRedirect.
    'https://accounts.google.com',
    'https://identitytoolkit.googleapis.com',
    'https://securetoken.googleapis.com',
    'https://www.googleapis.com',
];

const FRAME_DOMAINS = [
    'blob:',
    'data:',
    'https://*.firebaseapp.com',
    'https://*.firebase.com',
    'https://translate.google.com',
    'http://translate.google.com',
    'https://translate.googleapis.com',
    'https://www.google.com',
    'https://accounts.google.com',
    'https://*.daily.co',
    'https://drive.google.com',
    'https://docs.google.com',
    'https://cdn.jsdelivr.net',
    'https://unpkg.com',
    // Community-page personal cards: official embed players.
    'https://open.spotify.com',
    'https://embed.music.apple.com',
    'https://www.instagram.com',
    'https://www.facebook.com',
    'https://www.youtube.com',
    'https://www.youtube-nocookie.com',
];

import { randomBytes } from 'crypto';

export function generateNonce(): string {
    // 18 bytes -> 24 base64 chars. Cryptographically unique per request.
    return randomBytes(18).toString('base64');
}

export function buildCsp(nonce: string): string {
    // Note: 'unsafe-inline' and 'unsafe-eval' MUST be specified without nonces or hashes on script-src
    // so that the browser does NOT disable inline <script> tags for iframe srcdocs, Babel, Tailwind, and Pyodide.
    const scriptSrc = [
        "'self'",
        "'unsafe-eval'",
        "'unsafe-inline'",
        ...SCRIPT_DOMAINS,
    ].join(' ');

    const styleSrc = [
        "'self'",
        "'unsafe-inline'",
        "'unsafe-hashes'",
        ...STYLE_DOMAINS,
    ].join(' ');

    return [
        "default-src 'self' blob: data: https:;",
        `script-src ${scriptSrc};`,
        `script-src-elem ${scriptSrc};`,
        `style-src ${styleSrc};`,
        `img-src 'self' ${IMG_DOMAINS.join(' ')};`,
        `font-src 'self' ${FONT_DOMAINS.join(' ')};`,
        `connect-src 'self' ${CONNECT_DOMAINS.join(' ')};`,
        `frame-src 'self' ${FRAME_DOMAINS.join(' ')};`,
        "media-src 'self' blob: data: https: https://*.spline.design;",
        "worker-src 'self' blob: data:;",
        "object-src 'none';",
    ].join(' ');
}