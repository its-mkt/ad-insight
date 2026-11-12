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
  const { user, isLoggedIn, loading, logout } = useAuth();
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
        className={`btn ic header-profile-btn${isLoggedIn ? ' on' : ''}`}
        id="btn-profile"
        data-btn="profile"
        onClick={() => (isLoggedIn ? setOpen((v) => !v) : onLogin())}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={isLoggedIn ? '사용자 프로필' : '관리자 로그인'}
        title={isLoggedIn ? `${user?.name || user?.email} (관리자)` : '관리자 로그인'}
      >
        {isLoggedIn ? (
          <>
            <span className="pm-avatar">{avatar}</span>
            <span className="pm-name">{user?.name || '관리자'}</span>
          </>
        ) : (
          <>
            <User size="0.875rem" />
            <span>로그인</span>
          </>
        )}
      </button>

      {/* 팝오버 메뉴 */}
      {open && isLoggedIn && (
        <div role="dialog" className="pm-pop">
          {(
            /* 로그인된 상태 */
            <>
              <div className="pm-user">
                <div className="pm-avatar lg">{avatar}</div>
                <div className="pm-user-info">
                  <div className="pm-user-name">{user?.name || '관리자'}</div>
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
