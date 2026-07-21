'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Compass,
  Download,
  ExternalLink,
  Images,
  MoreHorizontal,
  MoreVertical,
  Share2,
  Smartphone,
  SquarePlus
} from 'lucide-react';
import { toast } from 'sonner';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { sendAnalytics } from './SelfAnalytics';
import {
  PWA_INSTALL_OPEN_EVENT,
  detectPwaEnvironment,
  hasBlockingPwaGuideUi,
  isStandaloneMode,
  markStandaloneSeen,
  openPwaInstallGuide,
  recordPwaInstallDismissal,
  shouldAutoShowPwaGuide,
  updatePwaInstallState
} from '@/app/lib/pwaInstall';

const AUTO_SHOW_DELAY_MS = 2500;
const IDLE_RETRY_MS = 1000;
const MAX_IDLE_RETRIES = 30;
const VISUAL_SWIPE_OFFSET = 52;
const VISUAL_SWIPE_VELOCITY = 520;

const IOS_VISUAL_GUIDE = [
  {
    image: '/pwa-guide/ios-step-1.webp',
    title: '打开 Safari 共享菜单',
    description: '先点工具栏的“…”按钮，再点弹出菜单里的“共享”。'
  },
  {
    image: '/pwa-guide/ios-step-2.webp',
    title: '选择添加到主屏幕',
    description: '在共享菜单中向上滑动，找到并点击“添加到主屏幕”。'
  },
  {
    image: '/pwa-guide/ios-step-3.webp',
    title: '确认添加',
    description: '确认名称为“估基”，再点击右上角的“添加”。'
  }
];

const WECHAT_IOS_VISUAL_GUIDE = [
  {
    image: '/pwa-guide/wechat-system-browser.webp',
    title: '使用系统浏览器打开',
    description: '点击微信右上角的“…”按钮，再选择“系统浏览器”。'
  }
];

const ANDROID_VISUAL_GUIDE = [
  {
    image: '/pwa-guide/android-step-1.svg',
    title: '打开浏览器菜单',
    description: '在 Chrome 或系统浏览器右上角，点击“⋮”菜单。'
  },
  {
    image: '/pwa-guide/android-step-2.svg',
    title: '选择安装应用',
    description: '在菜单中点击“安装应用”或“添加到主屏幕”。'
  },
  {
    image: '/pwa-guide/android-step-3.svg',
    title: '确认添加',
    description: '在系统安装面板确认后，估基图标会出现在桌面。'
  }
];

function Step({ number, icon: Icon, children }) {
  return (
    <li className="pwa-install-step">
      <span className="pwa-install-step-number" aria-hidden>
        {number}
      </span>
      <span className="pwa-install-step-icon" aria-hidden>
        <Icon />
      </span>
      <span>{children}</span>
    </li>
  );
}

function getGuideVariant(environment) {
  if (environment.isAndroid && environment.isInApp) return 'android-in-app';
  if (environment.isAndroid && environment.browser === 'chrome') return 'android-chrome';
  if (environment.isAndroid) return 'android-recommend-chrome';
  if (environment.isIOS && environment.isSafari) return 'ios-safari';
  if (environment.isIOS && environment.isWeChat) return 'ios-wechat';
  if (environment.isInApp) return 'in-app';
  if (environment.isIOS) return 'ios-browser';
  return 'android-manual';
}

export default function PwaInstallGuide() {
  const [open, setOpen] = useState(false);
  const [environment, setEnvironment] = useState(() => detectPwaEnvironment());
  const [source, setSource] = useState('auto');
  const [visualGuideOpen, setVisualGuideOpen] = useState(false);
  const [visualGuideStep, setVisualGuideStep] = useState(0);
  const [visualGuideDirection, setVisualGuideDirection] = useState(1);
  const reduceMotion = useReducedMotion();

  const variant = useMemo(() => getGuideVariant(environment), [environment]);
  const visualGuideItems = useMemo(() => {
    if (variant.startsWith('android')) return ANDROID_VISUAL_GUIDE;
    if (variant === 'ios-wechat') return WECHAT_IOS_VISUAL_GUIDE;
    if (variant === 'ios-safari') return IOS_VISUAL_GUIDE;
    return [];
  }, [variant]);

  const closeWithoutDismiss = useCallback(() => {
    setOpen(false);
  }, []);

  const showGuide = useCallback((nextSource) => {
    setEnvironment(detectPwaEnvironment());
    setSource(nextSource);
    setVisualGuideOpen(false);
    setVisualGuideStep(0);
    setVisualGuideDirection(1);
    setOpen(true);
    sendAnalytics('pwa_guide_shown');
  }, []);

  const handleLater = useCallback(() => {
    recordPwaInstallDismissal();
    sendAnalytics('pwa_guide_dismissed');
    closeWithoutDismiss();
  }, [closeWithoutDismiss]);

  const handleNeverRemind = useCallback(() => {
    updatePwaInstallState({ suppressed: true });
    sendAnalytics('pwa_guide_suppressed');
    closeWithoutDismiss();
    toast.success('已关闭自动提醒', { description: '仍可在“我的”中随时查看添加方法' });
  }, [closeWithoutDismiss]);

  const handleManualComplete = useCallback(() => {
    updatePwaInstallState({ suppressed: true });
    sendAnalytics('pwa_manual_guide_completed');
    closeWithoutDismiss();
    toast.success('已关闭提醒', { description: '添加完成后可从桌面图标打开' });
  }, [closeWithoutDismiss]);

  const handleCopyUrl = useCallback(async () => {
    sendAnalytics('pwa_copy_url_clicked');
    const mainUrl = `${window.location.origin}/`;
    try {
      await window.navigator.clipboard.writeText(mainUrl);
      toast.success('网址已复制', { description: '请粘贴到系统浏览器打开' });
    } catch {
      toast.error('复制失败', { description: mainUrl });
    }
  }, []);

  const handleOpenInChrome = useCallback(() => {
    const targetUrl = new URL('/', window.location.origin);
    targetUrl.searchParams.set('source', 'android-install');
    const scheme = targetUrl.protocol.replace(':', '');
    const intentTarget = `${targetUrl.host}${targetUrl.pathname}${targetUrl.search}`;
    const chromeIntent = `intent://${intentTarget}#Intent;scheme=${scheme};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(targetUrl.toString())};end`;

    sendAnalytics('pwa_android_open_chrome_clicked');
    window.location.assign(chromeIntent);
  }, []);

  const handleVisualGuideOpen = useCallback(() => {
    setVisualGuideStep(0);
    setVisualGuideDirection(1);
    setVisualGuideOpen(true);
    sendAnalytics('pwa_ios_visual_guide_opened');
  }, []);

  const handleVisualGuideComplete = useCallback(() => {
    setVisualGuideOpen(false);
    setVisualGuideStep(0);
    setVisualGuideDirection(1);
    sendAnalytics('pwa_ios_visual_guide_done');
  }, []);

  const goToVisualGuideStep = useCallback(
    (nextStep) => {
      const clampedStep = Math.max(0, Math.min(visualGuideItems.length - 1, nextStep));
      if (clampedStep === visualGuideStep) return;
      setVisualGuideDirection(clampedStep > visualGuideStep ? 1 : -1);
      setVisualGuideStep(clampedStep);
    },
    [visualGuideItems.length, visualGuideStep]
  );

  const handleVisualGuideSwipe = useCallback(
    (_event, info) => {
      if (info.offset.x <= -VISUAL_SWIPE_OFFSET || info.velocity.x <= -VISUAL_SWIPE_VELOCITY) {
        goToVisualGuideStep(visualGuideStep + 1);
        return;
      }
      if (info.offset.x >= VISUAL_SWIPE_OFFSET || info.velocity.x >= VISUAL_SWIPE_VELOCITY) {
        goToVisualGuideStep(visualGuideStep - 1);
      }
    },
    [goToVisualGuideStep, visualGuideStep]
  );

  const handleOpenChange = useCallback(
    (nextOpen) => {
      if (nextOpen) {
        setOpen(true);
        return;
      }
      handleLater();
    },
    [handleLater]
  );

  useEffect(() => {
    const nextEnvironment = detectPwaEnvironment();
    setEnvironment(nextEnvironment);

    if (isStandaloneMode()) {
      markStandaloneSeen();
      sendAnalytics('pwa_standalone_launch');
      return undefined;
    }

    const handleAppInstalled = () => {
      updatePwaInstallState({ suppressed: true });
      sendAnalytics('pwa_app_installed');
      closeWithoutDismiss();
    };
    const handleManualOpen = () => {
      if (isStandaloneMode()) {
        toast.info('当前正从桌面快捷方式打开');
        return;
      }
      const nextEnvironment = detectPwaEnvironment();
      if (!nextEnvironment.isMobile) {
        toast.info('请在移动设备使用', { description: '用 iOS 或 Android 设备打开本站后即可添加' });
        return;
      }
      if (nextEnvironment.isAndroid && nextEnvironment.browser === 'chrome') {
        toast.info('Chrome 正在准备安装面板', { description: '请刷新页面后再点击“添加到主屏幕”' });
        return;
      }
      showGuide('manual');
    };

    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener(PWA_INSTALL_OPEN_EVENT, handleManualOpen);

    return () => {
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener(PWA_INSTALL_OPEN_EVENT, handleManualOpen);
    };
  }, [closeWithoutDismiss, showGuide]);

  useEffect(() => {
    let timeoutId;
    let attempts = 0;

    if (window.location.pathname !== '/' || new URLSearchParams(window.location.search).has('source')) return undefined;

    const tryShow = () => {
      if (!shouldAutoShowPwaGuide()) return;
      if (hasBlockingPwaGuideUi()) {
        attempts += 1;
        if (attempts <= MAX_IDLE_RETRIES) timeoutId = window.setTimeout(tryShow, IDLE_RETRY_MS);
        return;
      }
      showGuide('auto');
    };

    timeoutId = window.setTimeout(tryShow, AUTO_SHOW_DELAY_MS);
    return () => window.clearTimeout(timeoutId);
  }, [showGuide]);

  useEffect(() => {
    if (!open) return undefined;

    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) activeElement.blur();

    const resetScroll = () => {
      const drawer = document.querySelector('.pwa-install-drawer');
      if (drawer) drawer.scrollTop = 0;
    };

    resetScroll();
    const frameId = window.requestAnimationFrame(resetScroll);
    const timeoutId = window.setTimeout(resetScroll, 240);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timeoutId);
    };
  }, [open, visualGuideOpen]);

  const guideContent = {
    'android-chrome': {
      badge: 'Android · Chrome',
      title: '打开系统安装面板',
      description: '将使用 Chrome 原生安装面板创建估基桌面图标。',
      steps: [[Download, '打开后按系统提示确认添加']]
    },
    'ios-safari': {
      badge: 'iOS · Safari',
      title: '获得和 App 一致的体验',
      description: '添加到主屏幕后，可像 App 一样从桌面打开估基。',
      steps: [
        [Share2, '点击 Safari 工具栏的“…”按钮，再点菜单里的“共享”'],
        [SquarePlus, '向上滑动，选择“添加到主屏幕”'],
        [Check, '确认名称后，点击右上角“添加”']
      ]
    },
    'ios-wechat': {
      badge: 'iOS · 微信',
      title: '建议添加桌面快捷方式',
      description: '先从微信使用系统浏览器打开，再将估基添加到主屏幕。',
      steps: [
        [MoreHorizontal, '点击微信页面右上角的“…”按钮'],
        [Compass, '在菜单中选择“系统浏览器”'],
        [SquarePlus, '进入系统浏览器后，继续添加到主屏幕']
      ]
    },
    'ios-browser': {
      badge: 'iOS · 其他浏览器',
      title: '请先使用 Safari 打开',
      description: 'iOS 仅支持从 Safari 将网页添加到主屏幕。',
      steps: [
        [MoreHorizontal, '打开当前浏览器的菜单或分享菜单'],
        [Compass, '选择“在 Safari 中打开”；没有该选项时请复制网址'],
        [SquarePlus, '在 Safari 分享菜单中选择“添加到主屏幕”']
      ]
    },
    'in-app': {
      badge: '内置浏览器',
      title: '请先在系统浏览器打开',
      description: '当前浏览器无法直接添加，请先转到 Safari 或 Chrome。',
      steps: [
        [MoreHorizontal, '点击页面右上角的菜单'],
        [ExternalLink, '选择“在浏览器打开”或“在 Safari 中打开”'],
        [SquarePlus, '再从系统浏览器菜单添加到主屏幕']
      ]
    },
    'android-manual': {
      badge: 'Android',
      title: '添加估基到主屏幕',
      description: '当前浏览器没有提供一键安装，按图片指引从浏览器菜单添加。',
      steps: [
        [MoreVertical, '点击浏览器右上角菜单'],
        [SquarePlus, '选择“添加到主屏幕”或“安装应用”'],
        [Check, '在系统提示中确认添加']
      ]
    },
    'android-in-app': {
      badge: 'Android · 内置浏览器',
      title: '请先在系统浏览器打开',
      description: '内置浏览器不能直接创建快捷方式，请转到 Chrome 或系统浏览器完成添加。',
      steps: [
        [MoreVertical, '点击页面右上角的菜单'],
        [ExternalLink, '选择“在浏览器打开”'],
        [SquarePlus, '按图片指引添加到主屏幕']
      ]
    },
    'android-recommend-chrome': {
      badge: 'Android · 当前浏览器',
      title: '用 Chrome 一键添加',
      description: 'Chrome 支持直接唤起系统安装面板，可将估基添加到桌面启动。',
      steps: [[ExternalLink, '点击下方按钮，在 Chrome 中继续添加']]
    }
  }[variant];

  const needsBrowserTransfer =
    variant === 'ios-browser' || variant === 'ios-wechat' || variant === 'in-app' || variant === 'android-in-app';
  const currentVisualStep = visualGuideItems[visualGuideStep];
  const isAndroidGuide = variant.startsWith('android');
  const hasVisualGuide = visualGuideItems.length > 0;
  const visualEntryTitle =
    variant === 'ios-wechat'
      ? '查看微信系统浏览器图示'
      : variant === 'android-native'
        ? '没有弹出安装面板？查看图片指引'
        : variant === 'android-recommend-chrome'
          ? '查看 Chrome 安装图示'
          : '查看图片指引';
  const visualEntryDescription =
    variant === 'ios-wechat'
      ? '红框标出微信右上角和“系统浏览器”入口'
      : isAndroidGuide
        ? '红框标出 Android 浏览器菜单和安装入口'
        : '红框标出每一步要点的位置';
  const defaultHeight = visualGuideOpen
    ? '86vh'
    : variant === 'android-native'
      ? '64vh'
      : variant === 'ios-safari' || variant === 'ios-wechat'
        ? '78vh'
        : '68vh';

  return (
    <Drawer open={open} onOpenChange={handleOpenChange} direction="bottom">
      <DrawerContent
        className="pwa-install-drawer"
        defaultHeight={defaultHeight}
        minHeight="48vh"
        maxHeight={visualGuideOpen ? '92vh' : '84vh'}
      >
        {visualGuideOpen ? (
          <>
            <DrawerHeader className="pwa-install-header pwa-visual-guide-header">
              <div className="pwa-install-heading">
                <button
                  type="button"
                  className="pwa-visual-guide-back"
                  onClick={() => setVisualGuideOpen(false)}
                  aria-label="返回文字指引"
                >
                  <ArrowLeft aria-hidden />
                </button>
                <div className="pwa-install-heading-copy">
                  <span className="pwa-install-platform">
                    图片指引 · 第 {visualGuideStep + 1} / {visualGuideItems.length} 步
                  </span>
                  <DrawerTitle>{currentVisualStep.title}</DrawerTitle>
                </div>
              </div>
            </DrawerHeader>

            <div className="pwa-ios-visual-guide">
              <div className="pwa-ios-visual-image-wrap">
                <AnimatePresence initial={false} custom={visualGuideDirection} mode="popLayout">
                  <motion.div
                    key={currentVisualStep.image}
                    className="pwa-ios-visual-slide"
                    custom={visualGuideDirection}
                    variants={{
                      enter: (direction) => ({ x: reduceMotion ? 0 : direction * 72, opacity: reduceMotion ? 1 : 0 }),
                      center: { x: 0, opacity: 1 },
                      exit: (direction) => ({ x: reduceMotion ? 0 : direction * -72, opacity: reduceMotion ? 1 : 0 })
                    }}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: reduceMotion ? 0 : 0.2, ease: 'easeOut' }}
                    drag="x"
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.18}
                    dragDirectionLock
                    onDragEnd={handleVisualGuideSwipe}
                  >
                    <Image
                      src={currentVisualStep.image}
                      alt={`操作图第 ${visualGuideStep + 1} 步：${currentVisualStep.description}`}
                      width={720}
                      height={960}
                      sizes="(max-width: 640px) calc(100vw - 40px), 420px"
                      priority={visualGuideStep === 0}
                      draggable={false}
                    />
                  </motion.div>
                </AnimatePresence>
              </div>
              <p className="pwa-ios-visual-description">{currentVisualStep.description}</p>

              <div className="pwa-ios-visual-dots" aria-label="图片步骤">
                {visualGuideItems.map((step, index) => (
                  <button
                    key={step.image}
                    type="button"
                    className={index === visualGuideStep ? 'active' : ''}
                    onClick={() => goToVisualGuideStep(index)}
                    aria-label={`查看第 ${index + 1} 步`}
                    aria-current={index === visualGuideStep ? 'step' : undefined}
                  >
                    <span aria-hidden />
                  </button>
                ))}
              </div>

              <div className="pwa-ios-visual-controls">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => goToVisualGuideStep(visualGuideStep - 1)}
                  disabled={visualGuideStep === 0}
                >
                  <ChevronLeft aria-hidden />
                  上一步
                </button>
                {visualGuideStep < visualGuideItems.length - 1 ? (
                  <button type="button" className="button" onClick={() => goToVisualGuideStep(visualGuideStep + 1)}>
                    下一步
                    <ChevronRight aria-hidden />
                  </button>
                ) : (
                  <button type="button" className="button" onClick={handleVisualGuideComplete}>
                    <Check aria-hidden />
                    看完了
                  </button>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            <DrawerHeader className="pwa-install-header">
              <div className="pwa-install-heading">
                <Image
                  className="pwa-install-app-icon"
                  src="/guji-icon-180-v2.png"
                  alt="估基"
                  width={52}
                  height={52}
                  priority
                />
                <div className="pwa-install-heading-copy">
                  <span className="pwa-install-platform">
                    <Smartphone aria-hidden />
                    {guideContent.badge}
                  </span>
                  <DrawerTitle>{guideContent.title}</DrawerTitle>
                </div>
              </div>
              <DrawerDescription>{guideContent.description}</DrawerDescription>
            </DrawerHeader>

            <div className="pwa-install-body">
              <ol className="pwa-install-steps">
                {guideContent.steps.map(([Icon, text], index) => (
                  <Step key={text} number={index + 1} icon={Icon}>
                    {text}
                  </Step>
                ))}
              </ol>

              {hasVisualGuide ? (
                <button type="button" className="pwa-install-visual-entry" onClick={handleVisualGuideOpen}>
                  <span className="pwa-install-visual-entry-icon" aria-hidden>
                    <Images />
                  </span>
                  <span className="pwa-install-visual-entry-copy">
                    <strong>{visualEntryTitle}</strong>
                    <small>{visualEntryDescription}</small>
                  </span>
                  <ChevronRight aria-hidden />
                </button>
              ) : null}

              <div className="pwa-install-actions">
                {variant === 'android-chrome' ? (
                  <button type="button" className="button pwa-install-primary" onClick={openPwaInstallGuide}>
                    <Download aria-hidden />
                    打开安装面板
                  </button>
                ) : variant === 'android-recommend-chrome' ? (
                  <button type="button" className="button pwa-install-primary" onClick={handleOpenInChrome}>
                    <ExternalLink aria-hidden />
                    使用 Chrome 打开
                  </button>
                ) : needsBrowserTransfer ? (
                  <button type="button" className="button pwa-install-primary" onClick={handleCopyUrl}>
                    <ExternalLink aria-hidden />
                    复制主站网址
                  </button>
                ) : (
                  <button type="button" className="button pwa-install-primary" onClick={handleManualComplete}>
                    <CheckCircle2 aria-hidden />
                    完成后关闭提醒
                  </button>
                )}

                <button type="button" className="button secondary pwa-install-secondary" onClick={handleLater}>
                  {variant === 'android-recommend-chrome' ? '继续网页使用' : '稍后'}
                </button>
              </div>

              <div className="pwa-install-text-actions">
                {needsBrowserTransfer ? (
                  <button type="button" onClick={handleManualComplete}>
                    完成后关闭提醒
                  </button>
                ) : null}
                <button type="button" onClick={handleNeverRemind}>
                  不再提醒
                </button>
              </div>

              {source === 'auto' ? <p className="pwa-install-reminder-note">选择“稍后”将在 7 天后再提醒一次</p> : null}
            </div>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}
