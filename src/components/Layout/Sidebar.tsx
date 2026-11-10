import React from 'react';
import type { DashboardData, SyncStatus, ViewId } from '../../types/dashboard';
import { useAuth } from '../../context/AuthContext';
import { ChartColumnIncreasing, ChartLine, Database, DollarSign, FileText, LayoutGrid, Lock, Search, ShoppingCart, X } from 'lucide-react';
import { Button } from '../common/Button';

interface SidebarProps {
  currentView: ViewId;
  drawerOpen: boolean;
  status: SyncStatus;
  updated: string;
  /** 매체별 마지막 수집 시각 — 수집 배지에 마우스를 올리면 툴팁으로 보여 준다 */
  sources?: DashboardData['sources'];
  isSyncing: boolean;
  onNavigate: (view: ViewId) => void;
  onCloseDrawer: () => void;
  onReload: () => void;
}

// 순서는 종합 요약 KPI 카드 순서와 같다 — 광고비 → 견적 → 효율(광고비 ÷ 견적) → 키워드·소재 상세, 구매 상세는 맨 아래
const NAV_ITEMS: { id: ViewId; label: string; icon: React.ReactNode }[] = [
  {
    id: 'overview',
    label: '종합 요약',
    icon: (
      <LayoutGrid />
    ),
  },
  {
    id: 'ads',
    label: '매체 광고비',
    icon: (
      <DollarSign />
    ),
  },
  {
    id: 'quotes',
    label: '견적 상세',
    icon: (
      <FileText />
    ),
  },
  {
    id: 'cat-efficiency',
    label: '카테고리 효율',
    icon: (
      <ChartLine />
    ),
  },
  {
    id: 'keywords',
    label: '키워드 · 소재',
    icon: (
      <Search />
    ),
  },
  {
    id: 'purchases',
    label: '구매 상세',
    icon: (
      <ShoppingCart />
    ),
  },
];

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  drawerOpen,
  status,
  updated,
  sources,
  isSyncing,
  onNavigate,
  onCloseDrawer,
  onReload,
}) => {
  const { isLoggedIn } = useAuth();
  const live = status === 'live';
  // 배지 시각은 화면이 데이터를 받아 온 시각이다. 실제로 수집한 시각은 매체마다 다르므로 툴팁에서 나눠 보여 준다
  const sourceLines = [
    ['Google 광고비·키워드', sources?.google],
    ['네이버 광고비·키워드', sources?.naver],
    ['아이티켓 견적 접수', sources?.quote],
    // 고도몰 수집 시각은 수집기가 기록하기 시작한 뒤부터 있다
    ...(sources?.godo ? [['고도몰 주문·제품', sources.godo]] : []),
  ]
    .map(([label, at]) => `${label} · ${at || '기록 없음'}`)
    .join('\n');
  const restNote = `${sources?.godo ? '' : '고도몰 주문·'}GA4 등 나머지 값은 각 화면 안내 문구의 기준일을 따릅니다`;
  const updTip = live ? `${updated || '취합본'} 기준 데이터|${sourceLines}\n${restNote}` : undefined;
  return (
    <>
      <div className={`scrim${drawerOpen ? ' on' : ''}`} id="scrim" onClick={onCloseDrawer} />
      <aside className={`side${drawerOpen ? ' open' : ''}`} id="side">
        <Button iconOnly icon={X} className="sclose" id="sclose" data-btn="close" aria-label="메뉴 닫기" onClick={onCloseDrawer} />
        <a
          className="brand"
          id="brand"
          href="./"
          title="처음으로"
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;
            e.preventDefault();
            onNavigate('overview');
          }}
        >
          <i>
            <ChartColumnIncreasing />
          </i>
          <span>아이티캣 광고 인사이트</span>
        </a>
        <div className="sm">
          <div className="lbl">대시보드</div>
          <nav className="toc" id="toc">
            {NAV_ITEMS.map((item) => {
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  className={`nv nv-${item.id}${isActive ? ' on' : ''}`}
                  id={`nav-${item.id}`}
                  data-v={item.id}
                  data-btn={item.id}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => onNavigate(item.id)}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
        {/* 설정·연동은 로그인한 관리자에게만 보인다 (주소로 들어오는 경우는 App 에서 막는다) */}
        {isLoggedIn && (
          <div className="sm">
            <div className="lbl">설정 · 연동</div>
            <nav className="toc">
              <button
                className={`nv nv-data${currentView === 'data' ? ' on' : ''}`}
                id="nav-data"
                data-v="data"
                data-btn="data"
                aria-current={currentView === 'data' ? 'page' : undefined}
                onClick={() => onNavigate('data')}
              >
                <Database />
                <span>데이터 연결</span>
              </button>
              <button
                className={`nv nv-admin${currentView === 'admin' ? ' on' : ''}`}
                id="nav-admin"
                data-v="admin"
                data-btn="admin"
                aria-current={currentView === 'admin' ? 'page' : undefined}
                onClick={() => onNavigate('admin')}
              >
                <Lock />
                <span>어드민 관리</span>
              </button>
            </nav>
          </div>
        )}
        {/* 마케팅팀 · 배포 날짜 기준 릴리즈 (같은 날 여러 번이면 -2, -3 …) */}
        <div className="sfoot">
          <span className={`upd${live ? ' live' : ''}`} data-tip={updTip} data-tip-desc={updTip ? '' : undefined} data-tip-pos="top">
            {live ? (
              <span className="upd-body">
                <span>{updated || '취합본'} 수집</span>
                {isSyncing && <span className="sync-pulse">동기화 중...</span>}
              </span>
            ) : (
              <span className="upd-body">
                <span>{status === 'error' ? '연동 지연 (자동 재시도 중)' : '실데이터 자동 연결 중...'}</span>
                <Button variant="link" className="btn-reload" id="btn-reload" data-btn="reload" onClick={onReload}>
                  지금 새로고침
                </Button>
              </span>
            )}
          </span>
          <span className="sfoot-ver">
            마케팅팀 ·{' '}
            <span className="rel" title={__APP_COMMIT__ ? `커밋 ${__APP_COMMIT__}` : undefined}>
              {__APP_RELEASE__}
            </span>
          </span>
        </div>
      </aside>
    </>
  );
};
