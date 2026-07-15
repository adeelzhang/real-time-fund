import { SITE_URL } from './lib/site';

export const dynamic = 'force-static';

const PUBLIC_SEARCH_BOTS = [
  'Googlebot',
  'Bingbot',
  'Baiduspider',
  'YandexBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'PerplexityBot',
  'Perplexity-User',
  'Claude-SearchBot',
  'Claude-User'
];

export default function robots() {
  return {
    rules: [
      {
        userAgent: PUBLIC_SEARCH_BOTS,
        allow: '/',
        disallow: '/api/'
      },
      {
        userAgent: '*',
        allow: '/',
        disallow: '/api/'
      }
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL
  };
}
