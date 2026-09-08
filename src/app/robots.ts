import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  // Pure training/scraping bots: they consume content without returning
  // search or citation value. Citation and search crawlers — PerplexityBot,
  // ChatGPT-User, OAI-SearchBot, ClaudeBot, Google-Extended, Applebot-Extended
  // — fall under the wildcard allow below, which is what puts Cybrdeck in
  // AI-generated answers.
  const scrapingBots = ['GPTBot', 'Meta-ExternalAgent', 'ByteSpider', 'CCBot'];

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/rag/', '/admin/', '/dashboard/', '/desktop-auth/'],
      },
      ...scrapingBots.map((bot) => ({
        userAgent: bot,
        disallow: '/',
      })),
    ],
    sitemap: 'https://cybrdeck.com/sitemap.xml',
  };
}
