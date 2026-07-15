import { INFO_LINKS, SITE_HOME_UPDATED_ISO, SITE_INFO_UPDATED_ISO, SITE_URL } from './lib/site';

export const dynamic = 'force-static';

export default function sitemap() {
  const infoLastModified = new Date(SITE_INFO_UPDATED_ISO);
  return [
    {
      url: SITE_URL,
      lastModified: new Date(SITE_HOME_UPDATED_ISO),
      changeFrequency: 'daily',
      priority: 1
    },
    ...INFO_LINKS.map((item) => ({
      url: `${SITE_URL}${item.href}`,
      lastModified: infoLastModified,
      changeFrequency: 'monthly',
      priority: item.href === '/help' || item.href === '/methodology' ? 0.7 : 0.5
    }))
  ];
}
