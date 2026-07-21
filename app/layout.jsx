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
import { SITE_DESCRIPTION, SITE_TITLE, SITE_URL } from './lib/site';

const verificationOther = Object.fromEntries(
  [
    ['msvalidate.01', process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION],
    ['baidu-site-verification', process.env.NEXT_PUBLIC_BAIDU_SITE_VERIFICATION],
    ['360-site-verification', process.env.NEXT_PUBLIC_360_SITE_VERIFICATION],
    ['sogou_site_verification', process.env.NEXT_PUBLIC_SOGOU_SITE_VERIFICATION],
    ['naver-site-verification', process.env.NEXT_PUBLIC_NAVER_SITE_VERIFICATION]
  ].filter(([, value]) => Boolean(value))
);

const siteVerification = {
  ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
    ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION }
    : {}),
  ...(process.env.NEXT_PUBLIC_YANDEX_SITE_VERIFICATION
    ? { yandex: process.env.NEXT_PUBLIC_YANDEX_SITE_VERIFICATION }
    : {}),
  ...(Object.keys(verificationOther).length ? { other: verificationOther } : {})
};

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  applicationName: '估基',
  manifest: '/manifest.webmanifest?v=20260714',
  keywords: ['基金估值', '实时估值', '基金净值', '基金持仓', '基金收益', '重仓股', '全球行情'],
  authors: [{ name: '估基', url: SITE_URL }],
  creator: '估基',
  publisher: '估基',
  category: 'finance',
  ...(Object.keys(siteVerification).length ? { verification: siteVerification } : {}),
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

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0f172a'
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
        {/* 尽早设置 data-theme，减少首屏主题闪烁；与 suppressHydrationWarning 配合避免服务端/客户端 html 属性不一致报错 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t);}catch(e){}try{window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__gujiDeferredPwaPrompt=e;window.dispatchEvent(new Event("guji:pwa-install-prompt-ready"));});}catch(e){}})();`
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
