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
import packageJson from '../package.json';

export const metadata = {
  title: `估基 V${packageJson.version}`,
  description: '输入基金编号添加基金，实时显示估值与前10重仓'
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
