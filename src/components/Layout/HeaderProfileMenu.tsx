import React, { useRef, useState } from 'react';
import { useDismiss } from '../../hooks/useDismiss';
import { useAuth } from '../../context/AuthContext';
import { LogOut, Palette, Settings, User, Users, type LucideIcon } from 'lucide-react';
import { SkelBar } from '../common/SkeletonView';
import { Avatar } from '../common/Avatar';
import { StatusBadge } from '../common/StatusBadge';
import { SegmentedControl } from '../common/SegmentedControl';
import { AccountSettings } from './AccountSettings';
import type { ThemeMode } from '../../utils/theme';
import type { ViewId } from '../../types/dashboard';

interface HeaderProfileMenuProps {
  /** 미로그인 상태에서 누르면 로그인 모달을 연다 */
  onLogin: () => void;
  /** 지금 고른 테마 */
  themeMode?: ThemeMode;
  /** 메뉴에서 테마를 고를 때 (없으면 테마 줄을 두지 않는다) */
  onThemeMode?: (mode: ThemeMode) => void;
  /** 관리자 바로가기(계정 관리)로 화면을 옮길 때 (없으면 바로가기를 두지 않는다) */
  onNavigate?: (view: ViewId) => void;
}

/** 메뉴 한 줄 — 아이콘 + 이름 */
const MenuItem: React.FC<{ icon: LucideIcon; label: string; btn: string; onClick: () => void }> = ({ icon: Icon, label, btn, onClick }) => (
  <button type="button" role="menuitem" className="pm-item" data-btn={btn} onClick={onClick}>
    <Icon size="1rem" aria-hidden="true" />
    <span>{label}</span>
  </button>
);

const THEME_OPTIONS: { value: ThemeMode; label: string; title: string }[] = [
  { value: 'light', label: '라이트', title: '밝은 화면' },
  { value: 'dark', label: '다크', title: '어두운 화면' },
  { value: 'system', label: '시스템', title: '컴퓨터·휴대폰 설정을 따른다' },
];

export const HeaderProfileMenu: React.FC<HeaderProfileMenuProps> = ({ onLogin, themeMode = 'system', onThemeMode, onNavigate }) => {
  const { user, isLoggedIn, isSuperAdmin, isSignedIn, loading, logout } = useAuth();
  // 승인된 일반 계정도 로그인한 상태라 프로필·로그아웃을 보여 준다 (관리자 표시만 다르다)
  const roleLabel = isSuperAdmin ? '소유자' : isLoggedIn ? '운영자' : '뷰어';
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 바깥 클릭·Esc 로 닫기
  useDismiss(containerRef, open, () => setOpen(false));

  // 저장된 로그인 세션을 확인하는 동안은 버튼 자리만 잡아 둔다
  if (loading) {
    return (
      <div className="profile-menu" aria-busy="true">
        <SkelBar w="5rem" h="2rem" />
      </div>
    );
  }

  /** 메뉴를 닫고 할 일을 한다 */
  const pick = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div ref={containerRef} className="profile-menu">
      {/* 헤더 프로필 트리거 버튼 */}
      <button
        type="button"
        className={`btn ic header-profile-btn${isSignedIn ? ' on' : ''}`}
        id="btn-profile"
        data-btn="profile"
        onClick={() => (isSignedIn ? setOpen((v) => !v) : onLogin())}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={isSignedIn ? '사용자 프로필' : '관리자 로그인'}
        title={isSignedIn ? `${user?.name || user?.email} (${roleLabel})` : '관리자 로그인'}
      >
        {isSignedIn ? (
          <>
            <Avatar src={user?.avatarUrl} name={user?.name || user?.email} />
            <span className="pm-name">{user?.name || roleLabel}</span>
          </>
        ) : (
          <>
            <User size="0.875rem" />
            <span>로그인</span>
          </>
        )}
      </button>

      {/* 계정 메뉴 — 내 정보 · 계정 · 테마 · (관리자 바로가기) · 로그아웃 */}
      {open && isSignedIn && (
        <div role="menu" className="pm-pop" aria-label="계정 메뉴">
          <div className="pm-user">
            <Avatar src={user?.avatarUrl} name={user?.name || user?.email} size="lg" as="div" />
            <div className="pm-user-info">
              <div className="pm-user-name">{user?.name || roleLabel}</div>
              <div className="pm-user-email">{user?.email}</div>
            </div>
            <StatusBadge level={isLoggedIn ? 'ok' : 'man'} size="sm">
              {roleLabel}
            </StatusBadge>
          </div>

          <div className="pm-group" role="group" aria-label="계정">
            <MenuItem icon={Settings} label="내 계정 설정" btn="account-settings" onClick={pick(() => setSettingsOpen(true))} />
          </div>

          {onThemeMode && (
          <div className="pm-group pm-theme" role="group" aria-label="테마">
            <span className="pm-theme-label">
              <Palette size="1rem" aria-hidden="true" />
              테마
            </span>
            <SegmentedControl<ThemeMode> mini options={THEME_OPTIONS} value={themeMode} onChange={onThemeMode} dataKey="theme-mode" />
          </div>
          )}

          {isLoggedIn && onNavigate && (
            <div className="pm-group" role="group" aria-label="관리자">
              <MenuItem icon={Users} label="계정 관리" btn="menu-members" onClick={pick(() => onNavigate('members'))} />
            </div>
          )}

          <div className="pm-group" role="group">
            <MenuItem icon={LogOut} label="로그아웃" btn="logout" onClick={pick(() => void logout())} />
          </div>
        </div>
      )}

      <AccountSettings open={settingsOpen && isSignedIn} onClose={() => setSettingsOpen(false)} roleLabel={roleLabel} />
    </div>
  );
};
