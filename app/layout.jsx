import { Toaster } from '@/components/ui/sonner';
import './globals.css';
import KeepScreenAwake from './components/KeepScreenAwake';
import PwaRegister from './components/PwaRegister';
import PwaInstallGuide from './components/PwaInstallGuide';
import ThemeColorSync from './components/ThemeColorSync';
import SelfAnalytics from './components/SelfAnalytics';
import ClientErrorBoundary from './components/ClientErrorBoundary';
import GlobalClientErrorHandler from './components/GlobalClientErrorHandler';
import { QueryClientProviderWrapper } from './providers/query-client-provider';
import { TooltipProvider } from '@/components/ui/tooltip';

const SITE_URL = 'https://www.myfunds.cc';
const SITE_TITLE = '估基 - 实时基金估值与持仓管理';
const SITE_DESCRIPTION =
  '估基提供实时基金估值、日内走势、前十大重仓、持仓收益和全球行情查询，支持自选基金与多端数据同步。';
const STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: '估基',
  alternateName: '估基基金估值',
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  applicationCategory: 'FinanceApplication',
  applicationSubCategory: '基金估值与持仓管理',
  operatingSystem: 'Web, iOS, Android',
  browserRequirements: 'Requires JavaScript. Requires HTML5.',
  inLanguage: 'zh-CN',
  image: `${SITE_URL}/guji-og-1200x630.png`,
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'CNY'
  },
  featureList: ['实时基金估值', '基金日内走势', '前十大重仓走势', '持仓收益管理', '全球行情查询']
};

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  applicationName: '估基',
  keywords: ['基金估值', '实时估值', '基金净值', '基金持仓', '基金收益', '重仓股', '全球行情'],
  authors: [{ name: '估基', url: SITE_URL }],
  creator: '估基',
  publisher: '估基',
  category: 'finance',
  alternates: {
    canonical: '/'
  },
  openGraph: {
    type: 'website',
    locale: 'zh_CN',
    url: '/',
    siteName: '估基',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: '/guji-og-1200x630.png',
        width: 1200,
        height: 630,
        type: 'image/png',
        alt: '估基 - 实时基金估值与持仓管理'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ['/guji-og-1200x630.png']
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1
    }
  },
  formatDetection: {
    telephone: false,
    address: false,
    email: false
  }
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <meta name="apple-mobile-web-app-title" content="估基" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="icon" href="/favicon.ico?v=20260710" sizes="any" />
        <link rel="icon" type="image/png" sizes="16x16" href="/guji-icon-16-v2.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/guji-icon-32-v2.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/guji-icon-192-v2.png" />
        <link rel="apple-touch-icon" href="/guji-icon-180-v2.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/guji-icon-180-v2.png" />
        <link rel="manifest" href="/manifest.webmanifest?v=20260714" />
        {/* 初始为暗色；ThemeColorSync 会按 data-theme 同步为亮/暗 */}
        <meta name="theme-color" content="#0f172a" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA).replace(/</g, '\\u003c') }}
        />
        {/* 尽早设置 data-theme，减少首屏主题闪烁；与 suppressHydrationWarning 配合避免服务端/客户端 html 属性不一致报错 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`
          }}
        />
      </head>
      <body>
        <ThemeColorSync />
        <KeepScreenAwake />
        <PwaRegister />
        <PwaInstallGuide />
        <SelfAnalytics />
        <QueryClientProviderWrapper>
          <TooltipProvider>
            <ClientErrorBoundary toastTitle="页面渲染异常" toastId="app-render-error" closeModals>
              {children}
            </ClientErrorBoundary>
          </TooltipProvider>
        </QueryClientProviderWrapper>
        <Toaster />
        <GlobalClientErrorHandler />
      </body>
    </html>
  );
}
