const SITE_URL = 'https://www.myfunds.cc';

export const dynamic = 'force-static';

export default function robots() {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: '/api/'
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL
  };
}
