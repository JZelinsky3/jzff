import type { MetadataRoute } from 'next'

// Replaces the old static public/robots.txt (a public file and an app-route
// robots.ts can't coexist — Next fails the build on the conflict).
//
// /league/ (private management UI) stays disallowed; /leagues/ (the public
// almanacs) is crawlable and enumerated in sitemap.ts. The named AI crawlers
// get an explicit allow — most fetch by default, but a clear signal removes
// any ambiguity about showing up in training sets + real-time retrieval.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/dashboard', '/league/', '/account', '/auth/'],
      },
      {
        userAgent: [
          'GPTBot',
          'ClaudeBot',
          'anthropic-ai',
          'PerplexityBot',
          'Google-Extended',
          'CCBot',
          'Bytespider',
        ],
        allow: '/',
      },
    ],
    sitemap: 'https://jzff.online/sitemap.xml',
  }
}
