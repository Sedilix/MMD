import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import './globals.css';
import { Toaster } from "@/components/ui/toaster"
import { FirebaseClientProvider } from '@/firebase/client-provider';
import { FirebaseErrorListener } from '@/components/FirebaseErrorListener';
import { CookieConsent } from '@/components/cookie-consent';
import { PageviewTracker } from '@/components/analytics/PageviewTracker';
import { ThemeProvider } from '@/components/theme-provider';
import { WindowsTitlebar } from '@/components/desktop/WindowsTitlebar';
import { DesktopRouterGuard } from '@/components/desktop/DesktopRouterGuard';
import { DesktopErrorNotification } from '@/components/desktop/DesktopErrorNotification';
import { WindowShowTrigger } from '@/components/desktop/WindowShowTrigger';

/**
 * Mobile browser chrome takes the page's ground colour, and `viewport-fit=cover`
 * lets notched devices render edge-to-edge (paired with safe-area handling in
 * the fixed header/chat surfaces).
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#01040c',
};

export const metadata: Metadata = {
  title: 'cybrdeck | Custom AI Development, AI Venture Studio & CAC Ecosystem',
  description: 'Singapore-based AI Venture Studio & Custom Enterprise AI Developer. We build tailored AI solutions for SMEs & Enterprises, incubate ventures, and operate on a Community-as-a-Company model.',
  metadataBase: new URL('https://cybrdeck.com'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'cybrdeck | Custom AI Development, AI Venture Studio & CAC Ecosystem',
    description: 'Singapore-based AI Venture Studio & Custom Enterprise AI Developer. We build tailored AI solutions for SMEs & Enterprises, incubate ventures, and operate on a Community-as-a-Company model.',
    url: 'https://cybrdeck.com',
    siteName: 'cybrdeck',
    locale: 'en_US',
    type: 'website',
    images: [
      {
        url: 'https://cybrdeck.com/og-image.png',
        width: 1200,
        height: 630,
        alt: 'cybrdeck - Custom AI Development & Venture Studio',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'cybrdeck | Custom AI Development, AI Venture Studio & CAC Ecosystem',
    description: 'Singapore-based AI Venture Studio & Custom Enterprise AI Developer. We build tailored AI solutions for SMEs & Enterprises, incubate ventures, and operate on a Community-as-a-Company model.',
    images: ['https://cybrdeck.com/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
};

const jsonLdOrg = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Cybrdeck Venture Studio & Custom AI Solutions',
  url: 'https://cybrdeck.com',
  logo: 'https://cybrdeck.com/cybrdeck-logo/full.png',
  description: 'Cybrdeck is a Singapore-based AI Venture Studio and custom AI software developer operating on the Community-as-a-Company model.',
  address: {
    '@type': 'PostalAddress',
    addressCountry: 'SG',
    addressLocality: 'Singapore'
  },
  knowsAbout: [
    'Artificial Intelligence',
    'Custom AI Development',
    'Venture Building',
    'Multi-Model LLM Orchestration',
    'Community-as-a-Company'
  ]
};

const jsonLdService = {
  '@context': 'https://schema.org',
  '@type': 'ProfessionalService',
  name: 'Cybrdeck Custom AI Solutions & Engineering',
  url: 'https://cybrdeck.com/work-with-us',
  description: 'Work-for-hire custom AI software development, agentic workflow automation, and LLM API integrations for SMEs, enterprises, and startups.',
  provider: {
    '@type': 'Organization',
    name: 'Cybrdeck'
  },
  areaServed: ['Singapore', 'Southeast Asia', 'Worldwide'],
  serviceType: 'Custom AI Software Development'
};

const jsonLdSoftware = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Cybrdeck Desktop & Multi-Model Playground',
  operatingSystem: 'Windows 10, Windows 11, Web',
  applicationCategory: ['DeveloperApplication', 'BusinessApplication'],
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
  description:
    'Multi-model LLM workspace and consensus studio for comparing, testing, and orchestrating models side-by-side with local Ollama, BYOK, and cloud provider APIs.',
  downloadUrl: 'https://github.com/Sedilix/MMD/releases',
  featureList: [
    'Side-by-side multi-model LLM comparisons',
    'Local Ollama and BYOK inference support',
    'Automated latency and token cost arbitration',
    'Private air-gapped enterprise execution',
    'Community-as-a-Company integration',
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read the per-request CSP nonce from proxy-injected request headers.
  // We pass it onto inline tags so the browser accepts them under the strict
  // CSP set in src/proxy.ts (Next 16 renamed middleware.ts to proxy.ts).
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html lang="en" nonce={nonce} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify([jsonLdOrg, jsonLdService, jsonLdSoftware]) }}
        />
      </head>
      <body className="font-body antialiased bg-background text-foreground relative min-h-dvh">
        <WindowShowTrigger />
        <WindowsTitlebar />
        <DesktopRouterGuard />
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} themes={['dark']} nonce={nonce}>
          <FirebaseClientProvider>
            <FirebaseErrorListener />
            <div className="relative z-10">
              {children}
            </div>
            <Toaster />
            <CookieConsent />
            <PageviewTracker />
            <DesktopErrorNotification />
          </FirebaseClientProvider>
        </ThemeProvider>
        {/* Reserved for future nonce-tagged inline scripts (e.g. early theme bootstrap). */}
        {/* The nonce prop is intentionally read here even if unused so the import remains live. */}
        {nonce ? <meta name="csp-nonce" data-nonce={nonce} /> : null}
      </body>
    </html>
  );
}
