import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  // Explicitly set Turbopack root to the workspace folder. package.json sets
  // "type": "module", so __dirname is undefined under ESM; import.meta.dirname
  // is the static ESM equivalent and, unlike process.cwd(), doesn't trip
  // Node File Trace's dynamic-filesystem-call heuristic during desktop builds.
  turbopack: {
    root: import.meta.dirname,
  },
  // NOTE: ignoreBuildErrors was removed on the audit/csp-and-typecheck branch
  // to surface latent type errors. If the build fails here but passes on main,
  // the failing errors are the ones that were previously hidden.
  typescript: {
    ignoreBuildErrors: false,
  },
  httpAgentOptions: {
    keepAlive: false,
  },
  productionBrowserSourceMaps: false,
  serverExternalPackages: [
    '@opentelemetry/sdk-node',
    'genkit',
    '@genkit-ai/core',
    'firebase',
    '@firebase/firestore',
    '@firebase/app',
    '@firebase/auth',
    'googleapis',
    'jspdf',
    // Sentry + its OpenTelemetry peer deps are externalized so Turbopack does
    // not try to bundle them in the instrumentation hook. They resolve at
    // runtime from node_modules; if absent, the try/catch in instrumentation.ts
    // skips Sentry gracefully. Without this, Turbopack fails build-time
    // resolution on @opentelemetry/instrumentation (an optional Sentry peer).
    '@sentry/node',
    '@sentry/node-core',
    '@sentry/core',
    '@sentry/opentelemetry',
    '@opentelemetry/instrumentation',
    '@opentelemetry/api',
  ],
  // Force Next.js to bundle these rather than externalizing them.
  // Next.js automatically externalizes firebase-admin which causes native
  // Node.js to throw ERR_REQUIRE_ESM when jwks-rsa tries to require() jose.
  transpilePackages: ['firebase-admin', 'jwks-rsa', 'jose'],
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'fastly.picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
  async redirects() {
    return [
      {
        // The v2 bento hub replaced the original console; canonical URL is /community.
        source: '/community-v2',
        destination: '/community',
        permanent: true,
      },
      {
        // The /download page was retired; installer buttons live on the landing page.
        source: '/downloads',
        destination: '/',
        permanent: true,
      },
      {
        source: '/download',
        destination: '/',
        permanent: true,
      },
      {
        source: '/dashboard/applicants',
        destination: '/dashboard#applicants',
        permanent: false,
      },
      {
        source: '/dashboard/projects',
        destination: '/dashboard#projects',
        permanent: false,
      },
    ];
  },
  async rewrites() {
    return [
      {
        // /community serves the bento hub (community-v2 route) without wrapping it
        // in the hub's AuthGuard/chrome layout, which only applies to the
        // filesystem routes below it (games, rooms, channels, ...).
        source: '/community',
        destination: '/community-v2',
      },
    ];
  },
  // The Content-Security-Policy header is now generated per-request in
  // src/proxy.ts (where we have access to the nonce). Only the static,
  // nonce-independent security headers remain here.
  // (Next 16 renamed middleware.ts to proxy.ts.)
  async headers() {
    return [
      {
        source: '/spline-assets/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(self), geolocation=()',
          },
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin-allow-popups',
          },
        ],
      },
    ];
  },

  // The Spotify OAuth loopback redirect (and manual testing) browses the
  // dev server via http://127.0.0.1:9002; Next treats that host as
  // cross-origin for /_next/* dev resources unless allow-listed.
  allowedDevOrigins: ['127.0.0.1'],
};

export default nextConfig;
