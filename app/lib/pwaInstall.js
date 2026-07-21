export const PWA_INSTALL_OPEN_EVENT = 'guji:pwa-install-open';
export const PWA_INSTALL_PROMPT_READY_EVENT = 'guji:pwa-install-prompt-ready';

const INSTALL_STATE_KEY = 'guji_pwa_install_state_v3';
const STANDALONE_SEEN_KEY = 'guji_pwa_standalone_seen_v1';
const REMINDER_DELAY_MS = 7 * 24 * 60 * 60 * 1000;

const DEFAULT_STATE = {
  dismissCount: 0,
  lastDismissedAt: 0,
  suppressed: false
};

export function isStandaloneMode() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    window.navigator.standalone === true ||
    document.referrer.startsWith('android-app://')
  );
}

export function detectPwaEnvironment() {
  if (typeof window === 'undefined') {
    return {
      isMobile: false,
      isIOS: false,
      isAndroid: false,
      isSafari: false,
      isInApp: false,
      isWeChat: false,
      isVivoBrowser: false,
      browser: 'other'
    };
  }

  const ua = window.navigator.userAgent || '';
  const platform = window.navigator.platform || '';
  const isIPadDesktopMode = platform === 'MacIntel' && window.navigator.maxTouchPoints > 1;
  const isIOS = /iPad|iPhone|iPod/i.test(ua) || isIPadDesktopMode;
  const isAndroid = /Android/i.test(ua);
  const isWeChat = /MicroMessenger/i.test(ua);
  const isVivoBrowser = /VivoBrowser/i.test(ua);
  const isInApp =
    /MicroMessenger|Weibo|AlipayClient|DingTalk|Feishu|Lark|ByteLocale|Toutiao|Aweme|FBAN|FBAV|Instagram|Line\//i.test(
      ua
    );
  const isCriOS = /CriOS/i.test(ua);
  const isFxiOS = /FxiOS/i.test(ua);
  const isEdgeIOS = /EdgiOS/i.test(ua);
  const isOperaIOS = /OPiOS/i.test(ua);
  const isSafari =
    isIOS &&
    /WebKit/i.test(ua) &&
    /Safari/i.test(ua) &&
    !isCriOS &&
    !isFxiOS &&
    !isEdgeIOS &&
    !isOperaIOS &&
    !/DuckDuckGo|YaBrowser|GSA|MQQBrowser|QQ\//i.test(ua) &&
    !isInApp;

  let browser = 'other';
  if (isInApp) browser = 'in-app';
  else if (isSafari) browser = 'safari';
  else if (isVivoBrowser) browser = 'vivo';
  else if (/EdgA|EdgiOS/i.test(ua)) browser = 'edge';
  else if (/CriOS|Chrome/i.test(ua)) browser = 'chrome';
  else if (/FxiOS|Firefox/i.test(ua)) browser = 'firefox';

  return {
    isMobile: isIOS || isAndroid,
    isIOS,
    isAndroid,
    isSafari,
    isInApp,
    isWeChat,
    isVivoBrowser,
    browser
  };
}

export function readPwaInstallState() {
  if (typeof window === 'undefined') return { ...DEFAULT_STATE };
  try {
    const saved = JSON.parse(window.localStorage.getItem(INSTALL_STATE_KEY) || '{}');
    return {
      dismissCount: Number.isFinite(saved.dismissCount) ? Math.max(0, saved.dismissCount) : 0,
      lastDismissedAt: Number.isFinite(saved.lastDismissedAt) ? saved.lastDismissedAt : 0,
      suppressed: saved.suppressed === true
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function updatePwaInstallState(patch) {
  if (typeof window === 'undefined') return { ...DEFAULT_STATE };
  const next = { ...readPwaInstallState(), ...patch };
  try {
    window.localStorage.setItem(INSTALL_STATE_KEY, JSON.stringify(next));
  } catch {
    // 本地状态写入失败时，不影响页面的正常使用。
  }
  return next;
}

export function recordPwaInstallDismissal() {
  const current = readPwaInstallState();
  return updatePwaInstallState({
    dismissCount: Math.min(current.dismissCount + 1, 2),
    lastDismissedAt: Date.now()
  });
}

export function shouldAutoShowPwaGuide(now = Date.now()) {
  const environment = detectPwaEnvironment();
  const state = readPwaInstallState();
  if (!environment.isMobile || isStandaloneMode() || state.suppressed) return false;
  // Android Chrome uses its own native installation panel. Do not cover it
  // with a web drawer that looks similar but is not the system installer.
  if (environment.isAndroid && environment.browser === 'chrome') return false;
  if (state.dismissCount === 0) return true;
  if (state.dismissCount >= 2) return false;
  return now - state.lastDismissedAt >= REMINDER_DELAY_MS;
}

export function markStandaloneSeen() {
  if (typeof window === 'undefined') return;
  updatePwaInstallState({ suppressed: true });
  try {
    window.localStorage.setItem(STANDALONE_SEEN_KEY, '1');
  } catch {
    // 独立模式标记失败时，不影响启动。
  }
}

export function hasBlockingPwaGuideUi() {
  if (typeof document === 'undefined') return true;
  if (document.visibilityState !== 'visible') return true;

  const active = document.activeElement;
  if (active && (active.matches?.('input, textarea, select') || active.getAttribute?.('contenteditable') === 'true')) {
    return true;
  }

  return Boolean(
    document.querySelector(
      '[data-slot="dialog-content"][data-state="open"], [data-slot="drawer-content"][data-state="open"], .modal-overlay'
    )
  );
}

export function openPwaInstallGuide() {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(new CustomEvent(PWA_INSTALL_OPEN_EVENT));
}

export function promptChromePwaInstall() {
  if (typeof window === 'undefined') return false;
  const environment = detectPwaEnvironment();
  if (!environment.isAndroid || environment.browser !== 'chrome' || isStandaloneMode()) return false;

  const installPrompt = window.__gujiDeferredPwaPrompt;
  if (!installPrompt?.prompt) return false;

  try {
    // prompt() must run synchronously inside the user's tap handler.
    const promptResult = installPrompt.prompt();
    Promise.resolve(promptResult)
      .then(() => installPrompt.userChoice)
      .then((choice) => {
        window.__gujiDeferredPwaPrompt = null;
        if (choice?.outcome === 'accepted') updatePwaInstallState({ suppressed: true });
      })
      .catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}
