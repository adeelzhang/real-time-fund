'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { AnimatePresence } from 'framer-motion';
import {
  BookOpen,
  Calculator,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Cloud,
  FileText,
  Info,
  LogOut,
  Settings,
  ShieldCheck,
  SquarePlus
} from 'lucide-react';
import { LoginIcon } from './Icons';
import ConfirmModal from './ConfirmModal';
import { isStandaloneMode, openPwaInstallGuide } from '@/app/lib/pwaInstall';

function MenuRow({ icon: Icon, label, description, onClick, disabled = false, danger = false, compact = false }) {
  return (
    <li>
      <button
        type="button"
        className={`mine-menu-row glass${danger ? ' danger' : ''}${compact ? ' compact' : ''}`}
        onClick={onClick}
        disabled={disabled}
      >
        <span className="mine-menu-main">
          <Icon className="mine-menu-icon" aria-hidden />
          <span className="mine-menu-text">
            <span className="mine-menu-label">{label}</span>
            {description ? <span className="mine-menu-description">{description}</span> : null}
          </span>
        </span>
        <ChevronRight className="mine-menu-chevron" aria-hidden strokeWidth={2} />
      </button>
    </li>
  );
}

function LinkRow({ icon: Icon, label, href, onNavigate }) {
  return (
    <li>
      <Link className="mine-menu-row glass mine-menu-link compact" href={href} prefetch={false} onNavigate={onNavigate}>
        <span className="mine-menu-main">
          <Icon className="mine-menu-icon" aria-hidden />
          <span className="mine-menu-text">
            <span className="mine-menu-label">{label}</span>
          </span>
        </span>
        <ChevronRight className="mine-menu-chevron" aria-hidden strokeWidth={2} />
      </Link>
    </li>
  );
}

export default function MineTab({
  visible = true,
  user,
  userAvatar,
  lastSyncDisplay,
  onLogin,
  onLogout,
  onMyEarnings,
  onOpenSettings
}) {
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    setIsStandalone(isStandaloneMode());
  }, []);
  const handleInfoNavigate = () => sessionStorage.setItem('guji-info-return', 'mine');

  return (
    <div className="mine-tab" style={{ display: visible ? undefined : 'none' }} aria-hidden={!visible || undefined}>
      <section className="mine-install-section" aria-label="添加到主屏幕">
        <button
          type="button"
          className={`mine-install-card${isStandalone ? ' is-installed' : ''}`}
          onClick={openPwaInstallGuide}
          disabled={isStandalone}
        >
          <span className="mine-install-icon-wrap">
            {isStandalone ? <CheckCircle2 aria-hidden /> : <SquarePlus aria-hidden />}
          </span>
          <span className="mine-install-copy">
            <span className="mine-install-title">{isStandalone ? '已添加到主屏幕' : '添加估基到主屏幕'}</span>
            <span className="mine-install-description">
              {isStandalone ? '当前正以桌面快捷方式打开' : '像 App 一样从手机桌面快速打开'}
            </span>
          </span>
          {!isStandalone ? <ChevronRight className="mine-install-chevron" aria-hidden /> : null}
        </button>
      </section>

      <section className="mine-section" aria-labelledby="mine-account-title">
        <h2 id="mine-account-title" className="mine-section-title">
          账户
        </h2>
        <div className="mine-profile-card glass" aria-label="个人信息">
          <div className="mine-profile-row">
            <div className="mine-profile-avatar">
              {user ? (
                userAvatar ? (
                  <Image
                    src={userAvatar}
                    alt="用户头像"
                    width={44}
                    height={44}
                    unoptimized
                    style={{ borderRadius: '50%', objectFit: 'cover' }}
                  />
                ) : (
                  <span className="mine-profile-avatar-fallback">{user.email?.charAt(0).toUpperCase() || 'U'}</span>
                )
              ) : (
                <span className="mine-profile-avatar-fallback muted">?</span>
              )}
            </div>
            <div className="mine-profile-text">
              {user ? (
                <>
                  <div className="mine-profile-title">{user.email || '已登录用户'}</div>
                  <div className="muted mine-profile-sync">
                    <Cloud aria-hidden />
                    <span>{lastSyncDisplay ? `同步时间 ${lastSyncDisplay}` : '等待首次云端同步'}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="mine-profile-title">未登录</div>
                  <div className="muted mine-profile-status">数据仅保存在本机</div>
                </>
              )}
            </div>
            {!user ? (
              <button type="button" className="button mine-profile-login-btn" onClick={onLogin}>
                <LoginIcon width={16} height={16} />
                <span>登录 / 注册</span>
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="mine-section" aria-labelledby="mine-data-title">
        <h2 id="mine-data-title" className="mine-section-title">
          功能与数据
        </h2>
        <ul className="mine-menu-list" role="list">
          <MenuRow icon={CalendarDays} label="收益日历" description="查看每日收益与历史明细" onClick={onMyEarnings} />
          <MenuRow icon={Settings} label="设置" description="刷新、显示与数据管理" onClick={onOpenSettings} />
        </ul>
      </section>

      <section className="mine-section" aria-labelledby="mine-info-title">
        <h2 id="mine-info-title" className="mine-section-title">
          帮助与关于
        </h2>
        <ul className="mine-menu-list mine-info-list" role="list">
          <LinkRow icon={BookOpen} label="使用帮助" href="/help" onNavigate={handleInfoNavigate} />
          <LinkRow icon={Calculator} label="数据与计算" href="/methodology" onNavigate={handleInfoNavigate} />
          <LinkRow icon={Info} label="关于估基" href="/about" onNavigate={handleInfoNavigate} />
          <LinkRow icon={ShieldCheck} label="隐私政策" href="/privacy" onNavigate={handleInfoNavigate} />
          <LinkRow icon={FileText} label="用户协议" href="/terms" onNavigate={handleInfoNavigate} />
        </ul>
      </section>

      {user ? (
        <section className="mine-logout-section" aria-label="账户操作">
          <ul className="mine-menu-list" role="list">
            <MenuRow icon={LogOut} label="退出登录" onClick={() => setLogoutConfirmOpen(true)} danger compact />
          </ul>
        </section>
      ) : null}

      <AnimatePresence>
        {logoutConfirmOpen ? (
          <ConfirmModal
            title="确认退出登录"
            message="退出后，本机数据仍会保留。"
            icon={<LogOut width="20" height="20" className="shrink-0 text-[var(--danger)]" />}
            confirmText="确认退出"
            onConfirm={() => {
              setLogoutConfirmOpen(false);
              onLogout?.();
            }}
            onCancel={() => setLogoutConfirmOpen(false)}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
