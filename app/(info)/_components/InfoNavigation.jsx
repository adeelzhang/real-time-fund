'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeft, Home } from 'lucide-react';

const SECTIONS = [
  { href: '/help', label: '使用帮助' },
  { href: '/methodology', label: '数据与计算', aliases: ['/data-sources'] },
  { href: '/about', label: '关于估基' },
  { href: '/privacy', label: '隐私政策' },
  { href: '/terms', label: '用户协议' }
];

const PAGE_TITLES = {
  '/help': '使用帮助',
  '/methodology': '数据与计算',
  '/data-sources': '数据来源',
  '/about': '关于估基',
  '/privacy': '隐私政策',
  '/terms': '用户协议',
  '/risk-disclosure': '风险提示'
};

export default function InfoNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const activeRef = useRef(null);
  const title = PAGE_TITLES[pathname] || '帮助与关于';

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [pathname]);

  const handleBack = () => {
    const returnTarget = sessionStorage.getItem('guji-info-return');

    if (returnTarget === 'mine') {
      sessionStorage.removeItem('guji-info-return');
      sessionStorage.setItem('guji-restore-main-tab', 'mine');
      router.replace('/');
      return;
    }

    let hasSameOriginReferrer = false;
    try {
      hasSameOriginReferrer =
        Boolean(document.referrer) && new URL(document.referrer).origin === window.location.origin;
    } catch {
      hasSameOriginReferrer = false;
    }

    if (hasSameOriginReferrer && window.history.length > 1) {
      router.back();
    } else {
      router.push('/');
    }
  };

  return (
    <header className="info-app-header">
      <div className="info-app-bar">
        <button type="button" className="info-nav-action" onClick={handleBack} aria-label="返回">
          <ArrowLeft aria-hidden strokeWidth={2.2} />
        </button>
        <p className="info-app-title">{title}</p>
        <Link
          className="info-nav-action"
          href="/"
          aria-label="返回估基首页"
          onNavigate={() => {
            sessionStorage.removeItem('guji-info-return');
            sessionStorage.removeItem('guji-restore-main-tab');
          }}
        >
          <Home aria-hidden strokeWidth={2.1} />
        </Link>
      </div>

      <nav className="info-section-nav" aria-label="帮助与关于栏目">
        <div className="info-section-nav-track">
          {SECTIONS.map((item) => {
            const active = pathname === item.href || item.aliases?.includes(pathname);
            return (
              <Link
                key={item.href}
                ref={active ? activeRef : undefined}
                className={active ? 'is-active' : undefined}
                href={item.href}
                aria-current={active ? 'page' : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
