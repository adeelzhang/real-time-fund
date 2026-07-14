'use client';

import { useState } from 'react';
import Image from 'next/image';
import { AnimatePresence } from 'framer-motion';
import { CalendarDays, ChevronRight, LogOut, RefreshCw, Settings } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { LoginIcon } from './Icons';
import ConfirmModal from './ConfirmModal';

function MenuRow({ icon: Icon, label, description, onClick, disabled = false, danger = false, trailing }) {
  return (
    <li>
      <button
        type="button"
        className={`mine-menu-row glass${danger ? ' danger' : ''}`}
        onClick={onClick}
        disabled={disabled}
      >
        <span className="mine-menu-main">
          <Icon className={`mine-menu-icon${label === '云端同步' && disabled ? ' is-spinning' : ''}`} aria-hidden />
          <span className="mine-menu-text">
            <span className="mine-menu-label">{label}</span>
            {description ? <span className="mine-menu-description">{description}</span> : null}
          </span>
        </span>
        {trailing || <ChevronRight className="mine-menu-chevron" aria-hidden strokeWidth={2} />}
      </button>
    </li>
  );
}

export default function MineTab({
  visible = true,
  user,
  userAvatar,
  lastSyncDisplay,
  isSyncing = false,
  onLogin,
  onLogout,
  onSync,
  onMyEarnings,
  onOpenSettings,
  managerDetailEnabled = true,
  onManagerDetailEnabledChange
}) {
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const syncDescription = user
    ? isSyncing
      ? '正在同步持仓与设置'
      : lastSyncDisplay
        ? `上次同步 ${lastSyncDisplay}`
        : '将持仓与设置同步到云端'
    : '登录后同步持仓与设置';

  return (
    <div className="mine-tab" style={{ display: visible ? undefined : 'none' }} aria-hidden={!visible || undefined}>
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
                    width={56}
                    height={56}
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
                  <div className="muted mine-profile-status">已登录 · 数据自动同步</div>
                  {lastSyncDisplay ? <div className="muted mine-profile-sync">同步于 {lastSyncDisplay}</div> : null}
                </>
              ) : (
                <>
                  <div className="mine-profile-title">未登录</div>
                  <div className="muted mine-profile-status">数据仅保存在本机</div>
                  <button type="button" className="button mine-profile-login-btn" onClick={onLogin}>
                    <LoginIcon width={16} height={16} />
                    <span>登录 / 注册</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
        {user ? (
          <ul className="mine-menu-list" role="list">
            <MenuRow icon={LogOut} label="退出登录" onClick={() => setLogoutConfirmOpen(true)} danger />
          </ul>
        ) : null}
      </section>

      <section className="mine-section" aria-labelledby="mine-data-title">
        <h2 id="mine-data-title" className="mine-section-title">
          资产与数据
        </h2>
        <ul className="mine-menu-list" role="list">
          <MenuRow icon={CalendarDays} label="我的收益" description="查看收益日历与历史明细" onClick={onMyEarnings} />
          <MenuRow
            icon={RefreshCw}
            label="云端同步"
            description={syncDescription}
            onClick={user ? onSync : onLogin}
            disabled={isSyncing}
          />
        </ul>
      </section>

      <section className="mine-section" aria-labelledby="mine-preferences-title">
        <h2 id="mine-preferences-title" className="mine-section-title">
          偏好设置
        </h2>
        <ul className="mine-menu-list" role="list">
          <li>
            <label className="mine-menu-row mine-menu-switch-row glass" htmlFor="manager-detail-style-switch">
              <span className="mine-menu-main">
                <Settings className="mine-menu-icon" aria-hidden />
                <span className="mine-menu-text">
                  <span className="mine-menu-label">基金详情页</span>
                  <span className="mine-menu-description">
                    {managerDetailEnabled ? 'Fund Manager 模式' : '经典模式'}
                  </span>
                </span>
              </span>
              <span className="mine-menu-switch-hit">
                <Switch
                  id="manager-detail-style-switch"
                  checked={managerDetailEnabled}
                  onCheckedChange={(checked) => onManagerDetailEnabledChange?.(Boolean(checked))}
                  aria-label="使用 Fund Manager 基金详情页"
                />
              </span>
            </label>
          </li>
          <MenuRow icon={Settings} label="设置" description="刷新、显示与数据管理" onClick={onOpenSettings} />
        </ul>
      </section>

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
