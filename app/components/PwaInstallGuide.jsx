'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
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
  recordPwaInstallDismissal,
  shouldAutoShowPwaGuide,
  updatePwaInstallState
} from '@/app/lib/pwaInstall';

const AUTO_SHOW_DELAY_MS = 2500;
const IDLE_RETRY_MS = 1000;
const MAX_IDLE_RETRIES = 30;

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

function getGuideVariant(environment, promptReady) {
  if (environment.isAndroid && promptReady && !environment.isInApp) return 'android-native';
  if (environment.isIOS && environment.isSafari) return 'ios-safari';
  if (environment.isInApp) return 'in-app';
  if (environment.isIOS) return 'ios-browser';
  return 'android-manual';
}

export default function PwaInstallGuide() {
  const [open, setOpen] = useState(false);
  const [environment, setEnvironment] = useState(() => detectPwaEnvironment());
  const [promptReady, setPromptReady] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [source, setSource] = useState('auto');
  const [visualGuideOpen, setVisualGuideOpen] = useState(false);
  const [visualGuideStep, setVisualGuideStep] = useState(0);
  const deferredPromptRef = useRef(null);

  const variant = useMemo(() => getGuideVariant(environment, promptReady), [environment, promptReady]);

  const closeWithoutDismiss = useCallback(() => {
    setOpen(false);
  }, []);

  const showGuide = useCallback((nextSource) => {
    setEnvironment(detectPwaEnvironment());
    setSource(nextSource);
    setVisualGuideOpen(false);
    setVisualGuideStep(0);
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

  const handleMarkedInstalled = useCallback(() => {
    updatePwaInstallState({ installed: true, suppressed: true });
    sendAnalytics('pwa_marked_installed');
    closeWithoutDismiss();
    toast.success('已记录', { description: '之后不会再自动提醒' });
  }, [closeWithoutDismiss]);

  const handleCopyUrl = useCallback(async () => {
    sendAnalytics('pwa_copy_url_clicked');
    const mainUrl = `${window.location.origin}/`;
    try {
      await window.navigator.clipboard.writeText(mainUrl);
      toast.success('网址已复制', { description: '请粘贴到 Safari 或系统浏览器打开' });
    } catch {
      toast.error('复制失败', { description: mainUrl });
    }
  }, []);

  const handleNativeInstall = useCallback(async () => {
    const installPrompt = deferredPromptRef.current;
    if (!installPrompt) return;

    setInstalling(true);
    sendAnalytics('pwa_install_cta_clicked');
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      deferredPromptRef.current = null;
      setPromptReady(false);
      if (choice?.outcome === 'accepted') {
        updatePwaInstallState({ installed: true, suppressed: true });
        sendAnalytics('pwa_prompt_accepted');
        closeWithoutDismiss();
      } else {
        recordPwaInstallDismissal();
        sendAnalytics('pwa_prompt_dismissed');
        closeWithoutDismiss();
      }
    } catch {
      toast.error('暂时无法打开安装面板', { description: '请从浏览器菜单选择“添加到主屏幕”' });
    } finally {
      setInstalling(false);
    }
  }, [closeWithoutDismiss]);

  const handleVisualGuideOpen = useCallback(() => {
    setVisualGuideStep(0);
    setVisualGuideOpen(true);
    sendAnalytics('pwa_ios_visual_guide_opened');
  }, []);

  const handleVisualGuideComplete = useCallback(() => {
    setVisualGuideOpen(false);
    setVisualGuideStep(0);
    sendAnalytics('pwa_ios_visual_guide_done');
  }, []);

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

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      deferredPromptRef.current = event;
      setPromptReady(true);
    };
    const handleAppInstalled = () => {
      deferredPromptRef.current = null;
      setPromptReady(false);
      updatePwaInstallState({ installed: true, suppressed: true });
      sendAnalytics('pwa_app_installed');
      closeWithoutDismiss();
      toast.success('已添加到主屏幕');
    };
    const handleManualOpen = () => {
      if (isStandaloneMode()) {
        toast.success('已添加到主屏幕', { description: '当前正在桌面模式中运行' });
        return;
      }
      if (!detectPwaEnvironment().isMobile) {
        toast.info('请在移动设备使用', { description: '用 iOS 或 Android 设备打开本站后即可添加' });
        return;
      }
      showGuide('manual');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener(PWA_INSTALL_OPEN_EVENT, handleManualOpen);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener(PWA_INSTALL_OPEN_EVENT, handleManualOpen);
    };
  }, [closeWithoutDismiss, showGuide]);

  useEffect(() => {
    let timeoutId;
    let attempts = 0;

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

  const guideContent = {
    'android-native': {
      badge: 'Android',
      title: '添加估基到主屏幕',
      description: '点击下方按钮后，在系统面板中确认安装。',
      steps: [
        [Download, '点击“添加到主屏幕”唤起系统安装面板'],
        [Check, '在系统提示中确认安装']
      ]
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
      description: '按照浏览器菜单中的选项完成添加。',
      steps: [
        [MoreVertical, '点击浏览器右上角菜单'],
        [SquarePlus, '选择“添加到主屏幕”或“安装应用”'],
        [Check, '在系统提示中确认添加']
      ]
    }
  }[variant];

  const needsBrowserTransfer = variant === 'ios-browser' || variant === 'in-app';
  const currentVisualStep = IOS_VISUAL_GUIDE[visualGuideStep];
  const defaultHeight = visualGuideOpen
    ? '86vh'
    : variant === 'android-native'
      ? '56vh'
      : variant === 'ios-safari'
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
                    图片指引 · 第 {visualGuideStep + 1} / {IOS_VISUAL_GUIDE.length} 步
                  </span>
                  <DrawerTitle>{currentVisualStep.title}</DrawerTitle>
                </div>
              </div>
            </DrawerHeader>

            <div className="pwa-ios-visual-guide">
              <div className="pwa-ios-visual-image-wrap">
                <Image
                  src={currentVisualStep.image}
                  alt={`iOS 添加到主屏幕第 ${visualGuideStep + 1} 步：${currentVisualStep.description}`}
                  width={720}
                  height={960}
                  sizes="(max-width: 640px) calc(100vw - 40px), 420px"
                  priority={visualGuideStep === 0}
                />
              </div>
              <p className="pwa-ios-visual-description">{currentVisualStep.description}</p>

              <div className="pwa-ios-visual-dots" aria-label="图片步骤">
                {IOS_VISUAL_GUIDE.map((step, index) => (
                  <button
                    key={step.image}
                    type="button"
                    className={index === visualGuideStep ? 'active' : ''}
                    onClick={() => setVisualGuideStep(index)}
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
                  onClick={() => setVisualGuideStep((current) => Math.max(0, current - 1))}
                  disabled={visualGuideStep === 0}
                >
                  <ChevronLeft aria-hidden />
                  上一步
                </button>
                {visualGuideStep < IOS_VISUAL_GUIDE.length - 1 ? (
                  <button
                    type="button"
                    className="button"
                    onClick={() => setVisualGuideStep((current) => Math.min(IOS_VISUAL_GUIDE.length - 1, current + 1))}
                  >
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

              {variant === 'ios-safari' ? (
                <button type="button" className="pwa-install-visual-entry" onClick={handleVisualGuideOpen}>
                  <span className="pwa-install-visual-entry-icon" aria-hidden>
                    <Images />
                  </span>
                  <span className="pwa-install-visual-entry-copy">
                    <strong>查看图片指引</strong>
                    <small>红框标出每一步要点的位置</small>
                  </span>
                  <ChevronRight aria-hidden />
                </button>
              ) : null}

              <div className="pwa-install-actions">
                {variant === 'android-native' ? (
                  <button
                    type="button"
                    className="button pwa-install-primary"
                    onClick={handleNativeInstall}
                    disabled={installing}
                    aria-busy={installing}
                  >
                    <Download aria-hidden />
                    {installing ? '正在打开…' : '添加到主屏幕'}
                  </button>
                ) : needsBrowserTransfer ? (
                  <button type="button" className="button pwa-install-primary" onClick={handleCopyUrl}>
                    <ExternalLink aria-hidden />
                    复制主站网址
                  </button>
                ) : (
                  <button type="button" className="button pwa-install-primary" onClick={handleMarkedInstalled}>
                    <CheckCircle2 aria-hidden />
                    我已添加
                  </button>
                )}

                <button type="button" className="button secondary pwa-install-secondary" onClick={handleLater}>
                  稍后
                </button>
              </div>

              <div className="pwa-install-text-actions">
                {needsBrowserTransfer ? (
                  <button type="button" onClick={handleMarkedInstalled}>
                    我已添加
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
