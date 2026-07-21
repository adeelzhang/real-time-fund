'use client';

import { useEffect, useRef } from 'react';

const VISITOR_KEY = 'guji_visitor_id';
const SESSION_KEY = 'guji_session_id';
const SESSION_STARTED_KEY = 'guji_session_started_at';
const ATTRIBUTION_KEY = 'guji_attribution';
const SESSION_TTL_MS = 30 * 60 * 1000;
const ATTRIBUTION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

function makeId(prefix) {
  const random =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${random}`;
}

function getVisitorId() {
  const existing = window.localStorage.getItem(VISITOR_KEY);
  if (existing) return existing;
  const next = makeId('v');
  window.localStorage.setItem(VISITOR_KEY, next);
  return next;
}

function getSessionId() {
  const now = Date.now();
  const startedAt = Number(window.sessionStorage.getItem(SESSION_STARTED_KEY) || 0);
  const existing = window.sessionStorage.getItem(SESSION_KEY);
  if (existing && startedAt && now - startedAt < SESSION_TTL_MS) {
    return existing;
  }
  const next = makeId('s');
  window.sessionStorage.setItem(SESSION_KEY, next);
  window.sessionStorage.setItem(SESSION_STARTED_KEY, String(now));
  return next;
}

function cleanAttributionValue(value, maxLength = 160) {
  return String(value || '')
    .trim()
    .slice(0, maxLength);
}

function getAttribution() {
  const now = Date.now();
  const url = new URL(window.location.href);
  const current = Object.fromEntries(
    UTM_KEYS.map((key) => [key, cleanAttributionValue(url.searchParams.get(key))]).filter(([, value]) => value)
  );

  if (Object.keys(current).length > 0) {
    const next = {
      ...current,
      capturedAt: now,
      landingPath: url.pathname || '/'
    };
    window.localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(next));
    return next;
  }

  try {
    const stored = JSON.parse(window.localStorage.getItem(ATTRIBUTION_KEY) || 'null');
    if (stored?.capturedAt && now - Number(stored.capturedAt) < ATTRIBUTION_TTL_MS) return stored;
  } catch {
    // Ignore malformed attribution state and continue anonymous tracking.
  }
  return {};
}

function getAnalyticsPath() {
  const url = new URL(window.location.href);
  UTM_KEYS.forEach((key) => url.searchParams.delete(key));
  const query = url.searchParams.toString();
  return `${url.pathname}${query ? `?${query}` : ''}`;
}

export function sendAnalytics(eventType) {
  try {
    const attribution = getAttribution();
    const payload = {
      eventType,
      visitorId: getVisitorId(),
      sessionId: getSessionId(),
      path: getAnalyticsPath(),
      referrer: document.referrer || '',
      title: document.title || '',
      screen: `${window.screen?.width || 0}x${window.screen?.height || 0}`,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      utmSource: attribution.utm_source || '',
      utmMedium: attribution.utm_medium || '',
      utmCampaign: attribution.utm_campaign || '',
      utmContent: attribution.utm_content || '',
      utmTerm: attribution.utm_term || '',
      attributionLandingPath: attribution.landingPath || ''
    };
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      if (navigator.sendBeacon('/api/analytics/track', blob)) return;
    }
    fetch('/api/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true
    }).catch(() => {});
  } catch {
    // 统计失败不影响主站使用。
  }
}

export default function SelfAnalytics() {
  const lastPathRef = useRef('');

  useEffect(() => {
    const trackPageView = () => {
      const path = `${window.location.pathname}${window.location.search}`;
      if (lastPathRef.current === path) return;
      lastPathRef.current = path;
      sendAnalytics('pageview');
    };

    trackPageView();
    const heartbeat = window.setInterval(() => sendAnalytics('heartbeat'), 60 * 1000);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') sendAnalytics('heartbeat');
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('popstate', trackPageView);

    return () => {
      window.clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('popstate', trackPageView);
    };
  }, []);

  return null;
}
