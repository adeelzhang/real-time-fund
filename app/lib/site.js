export const SITE_URL = 'https://www.myfunds.cc';
export const SITE_NAME = '估基';
export const SITE_TITLE = '估基 - 实时基金估值与持仓管理';
export const SITE_DESCRIPTION =
  '估基提供实时基金估值、日内走势、前十大重仓、持仓收益和全球行情查询，支持自选基金与多端数据同步。';
export const SITE_ORGANIZATION_ID = `${SITE_URL}/#organization`;
export const SITE_LOGO_URL = `${SITE_URL}/guji-icon-512-v2.png`;
export const SITE_HOME_UPDATED_ISO = '2026-07-15T00:00:00+08:00';
export const SITE_INFO_UPDATED_ISO = '2026-07-15T00:00:00+08:00';

export const INFO_LINKS = [
  { href: '/about', label: '关于估基' },
  { href: '/methodology', label: '计算说明' },
  { href: '/data-sources', label: '数据来源' },
  { href: '/help', label: '常见问题' },
  { href: '/risk-disclosure', label: '风险提示' },
  { href: '/privacy', label: '隐私政策' },
  { href: '/terms', label: '用户协议' }
];

export function createInfoMetadata({ title, description, path }) {
  return {
    title,
    description,
    alternates: {
      canonical: path
    },
    openGraph: {
      type: 'article',
      locale: 'zh_CN',
      url: path,
      siteName: SITE_NAME,
      title,
      description,
      images: [
        {
          url: '/guji-og-1200x630.png',
          width: 1200,
          height: 630,
          type: 'image/png',
          alt: `${title} - ${SITE_NAME}`
        }
      ]
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/guji-og-1200x630.png']
    }
  };
}
