import React, { useRef, useState } from 'react';
import { useDismiss } from '../../hooks/useDismiss';
import { useAuth } from '../../context/AuthContext';
import { User } from 'lucide-react';
import { SkelBar } from '../common/SkeletonView';

interface HeaderProfileMenuProps {
  /** 미로그인 상태에서 누르면 로그인 모달을 연다 */
  onLogin: () => void;
}

export const HeaderProfileMenu: React.FC<HeaderProfileMenuProps> = ({ onLogin }) => {
  const { user, isLoggedIn, isSuperAdmin, isSignedIn, loading, logout } = useAuth();
  // 승인된 일반 계정도 로그인한 상태라 프로필·로그아웃을 보여 준다 (관리자 표시만 다르다)
  const roleLabel = isSuperAdmin ? '최고 관리자' : isLoggedIn ? '관리자' : '열람';
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 바깥 클릭·Esc 로 닫기
  useDismiss(containerRef, open, () => setOpen(false));

  const avatar = user?.avatarUrl ? <img src={user.avatarUrl} alt="" /> : (user?.name || user?.email || 'A')[0].toUpperCase();

  // 저장된 로그인 세션을 확인하는 동안은 버튼 자리만 잡아 둔다
  if (loading) {
    return (
      <div className="profile-menu" aria-busy="true">
        <SkelBar w="5rem" h="2rem" />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="profile-menu">
      {/* 헤더 프로필 트리거 버튼 */}
      <button
        type="button"
        className={`btn ic header-profile-btn${isSignedIn ? ' on' : ''}`}
        id="btn-profile"
        data-btn="profile"
        onClick={() => (isSignedIn ? setOpen((v) => !v) : onLogin())}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={isSignedIn ? '사용자 프로필' : '관리자 로그인'}
        title={isSignedIn ? `${user?.name || user?.email} (${roleLabel})` : '관리자 로그인'}
      >
        {isSignedIn ? (
          <>
            <span className="pm-avatar">{avatar}</span>
            <span className="pm-name">{user?.name || roleLabel}</span>
          </>
        ) : (
          <>
            <User size="0.875rem" />
            <span>로그인</span>
          </>
        )}
      </button>

      {/* 팝오버 메뉴 */}
      {open && isSignedIn && (
        <div role="dialog" className="pm-pop">
          {(
            /* 로그인된 상태 */
            <>
              <div className="pm-user">
                <div className="pm-avatar lg">{avatar}</div>
                <div className="pm-user-info">
                  <div className="pm-user-name">{user?.name || roleLabel}</div>
                  <div className="pm-user-email">{user?.email}</div>
                </div>
              </div>

              <div className="pm-foot">
                <button
                  type="button"
                  className="btn btn-logout"
                  id="btn-logout"
                  data-btn="logout"
                  onClick={() => {
                    setOpen(false);
                    logout();
                  }}
                >
                  로그아웃
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
