'use client';

import Image from 'next/image';
import { ChevronRight } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { LoginIcon } from './Icons';

export default function MineTab({
  visible = true,
  user,
  userAvatar,
  lastSyncDisplay,
  onLogin,
  onMyEarnings,
  managerDetailEnabled = true,
  onManagerDetailEnabledChange
}) {
  return (
    <div className="mine-tab" style={{ display: visible ? undefined : 'none' }} aria-hidden={!visible || undefined}>
      <section className="mine-profile-card glass" aria-label="个人信息" style={{ position: 'relative' }}>
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
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  已登录 · 可使用云端同步
                </div>
                {lastSyncDisplay && (
                  <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                    同步于 {lastSyncDisplay}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="mine-profile-title">未登录</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  数据仅保存在本机
                </div>
                <button type="button" className="button mine-profile-login-btn" onClick={onLogin}>
                  <LoginIcon width={16} height={16} />
                  <span>登录</span>
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      <ul className="mine-menu-list" role="list">
        <li>
          <button type="button" className="mine-menu-row glass" onClick={onMyEarnings}>
            <span className="mine-menu-label">我的收益</span>
            <ChevronRight className="mine-menu-chevron" aria-hidden strokeWidth={2} />
          </button>
        </li>
        <li>
          <label className="mine-menu-row mine-menu-switch-row glass" htmlFor="manager-detail-style-switch">
            <span className="mine-menu-text">
              <span className="mine-menu-label">基金详情样式</span>
              <span className="mine-menu-description">{managerDetailEnabled ? '沉浸式' : '经典'}</span>
            </span>
            <span className="mine-menu-switch-hit">
              <Switch
                id="manager-detail-style-switch"
                checked={managerDetailEnabled}
                onCheckedChange={(checked) => onManagerDetailEnabledChange?.(Boolean(checked))}
                aria-label="使用沉浸式基金详情"
              />
            </span>
          </label>
        </li>
      </ul>
    </div>
  );
}
