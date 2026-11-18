import React, { useEffect, useRef, useState } from 'react';
import type { ViewId } from '../../types/dashboard';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { SkeletonView } from '../common/SkeletonView';
import { VIEW_TITLES } from '../../utils/constants';
import { parseRoute, routePath } from '../../utils/route';
import { applyTheme, getInitialDark } from '../../utils/theme';

/** 로그인 전에 둘러볼 수 있는 화면 — 사이드바 대시보드 메뉴와 같다 (설정·연동·검색은 로그인 후) */
const PREVIEW_VIEWS: ViewId[] = ['overview', 'ads', 'quotes', 'cat-efficiency', 'keywords', 'purchases', 'devices'];
/** 표 위주 화면은 표 모양 자리표시 */
const TABLE_VIEWS: ViewId[] = ['keywords'];

const APP_TITLE = '아이티스 광고 인사이트';

interface GuestPreviewProps {
  /** 화면 위에 띄울 로그인·회원가입 카드 내용 */
  children: React.ReactNode;
}

/**
 * 로그인 전 둘러보기 — 사이드바·헤더·화면 틀은 그대로 보여 주고, 숫자 자리는 가린 채 로그인 카드를 띄운다.
 * 데이터는 한 건도 받지 않는다 (웹앱도 로그인 토큰이 없으면 데이터를 주지 않는다, 2026-11-18 사용자 결정)
 */
export const GuestPreview: React.FC<GuestPreviewProps> = ({ children }) => {
  const [view, setView] = useState<ViewId>(() => {
    const v = parseRoute().view;
    return PREVIEW_VIEWS.includes(v) ? v : 'overview';
  });
  const [isDark, setIsDark] = useState<boolean>(getInitialDark);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = `${VIEW_TITLES[view]} · ${APP_TITLE}`;
  }, [view]);

  const closeDrawer = () => {
    setDrawerOpen(false);
    document.body.classList.remove('lock');
  };
  // 로그인 후 같은 화면으로 열리도록 주소도 바꿔 둔다
  const navigate = (next: ViewId) => {
    const target = PREVIEW_VIEWS.includes(next) ? next : 'overview';
    setView(target);
    closeDrawer();
    window.history.replaceState(null, '', routePath('itket', target));
    window.scrollTo({ top: 0 });
  };
  // 헤더의 로그인·검색 버튼은 로그인 카드의 첫 입력칸으로 보낸다
  const focusLogin = () => {
    cardRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    cardRef.current?.querySelector<HTMLInputElement>('input')?.focus();
  };

  return (
    <div className="app guest-preview">
      <Sidebar
        currentView={view}
        drawerOpen={drawerOpen}
        status="live"
        updated=""
        isSyncing={false}
        onNavigate={navigate}
        onCloseDrawer={closeDrawer}
        onReload={() => undefined}
        site="itket"
        onSiteChange={() => undefined}
        preview
      />
      <div className="wrap">
        <Header
          title={VIEW_TITLES[view]}
          drawerOpen={drawerOpen}
          isDark={isDark}
          onOpenDrawer={() => {
            setDrawerOpen(true);
            document.body.classList.add('lock');
          }}
          onToggleTheme={() => {
            applyTheme(!isDark);
            setIsDark(!isDark);
          }}
          onLogin={focusLogin}
          onSearch={focusLogin}
        />
        {/* 앱과 같은 본문 틀(.cont > main) — 여백·좁은 화면 순서가 같게 */}
        <div className="cont guest-main">
          <main id="main">
            <SkeletonView title={VIEW_TITLES[view]} variant={TABLE_VIEWS.includes(view) ? 'table' : 'dashboard'} locked />
          </main>
          <div className="guest-lock">
            <div className="card login-modal" ref={cardRef} role="region" aria-labelledby="access-gate-title">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
