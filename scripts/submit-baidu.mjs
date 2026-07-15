const SITE_ORIGIN = 'https://www.myfunds.cc';
const SITE_HOST = 'www.myfunds.cc';
const BAIDU_SITE_TOKEN = process.env.BAIDU_SITE_TOKEN;

if (!BAIDU_SITE_TOKEN) {
  throw new Error('BAIDU_SITE_TOKEN is required. Copy it from Baidu Search Resource Platform after site verification.');
}

function extractSitemapUrls(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].trim());
}

const sitemapResponse = await fetch(`${SITE_ORIGIN}/sitemap.xml`);
if (!sitemapResponse.ok) {
  throw new Error(`Unable to read sitemap: HTTP ${sitemapResponse.status}`);
}

const urlList = extractSitemapUrls(await sitemapResponse.text());
if (!urlList.length) {
  throw new Error('No URLs found for Baidu submission.');
}

const endpoint = `http://data.zz.baidu.com/urls?site=${SITE_HOST}&token=${encodeURIComponent(BAIDU_SITE_TOKEN)}`;
const response = await fetch(endpoint, {
  method: 'POST',
  headers: {
    'content-type': 'text/plain; charset=utf-8'
  },
  body: urlList.join('\n')
});
const result = await response.text();

if (!response.ok) {
  throw new Error(`Baidu submission failed: HTTP ${response.status} ${result}`);
}

console.log(`Baidu submission response: ${result}`);
