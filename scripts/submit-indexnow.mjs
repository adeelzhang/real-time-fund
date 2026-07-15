const SITE_ORIGIN = 'https://www.myfunds.cc';
const SITE_HOST = 'www.myfunds.cc';
const INDEXNOW_KEY = process.env.INDEXNOW_KEY || '49fda30ab2bd0b3ca83c951572b333f0';
const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';

function extractSitemapUrls(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].trim());
}

async function getUrls() {
  const explicitUrls = process.argv.slice(2);
  if (explicitUrls.length) return explicitUrls;

  const response = await fetch(`${SITE_ORIGIN}/sitemap.xml`);
  if (!response.ok) {
    throw new Error(`Unable to read sitemap: HTTP ${response.status}`);
  }

  return extractSitemapUrls(await response.text());
}

const urlList = await getUrls();
if (!urlList.length) {
  throw new Error('No URLs found for IndexNow submission.');
}

const response = await fetch(INDEXNOW_ENDPOINT, {
  method: 'POST',
  headers: {
    'content-type': 'application/json; charset=utf-8'
  },
  body: JSON.stringify({
    host: SITE_HOST,
    key: INDEXNOW_KEY,
    keyLocation: `${SITE_ORIGIN}/${INDEXNOW_KEY}.txt`,
    urlList
  })
});

if (!response.ok) {
  throw new Error(`IndexNow submission failed: HTTP ${response.status} ${await response.text()}`);
}

console.log(`IndexNow accepted ${urlList.length} URLs (HTTP ${response.status}).`);
