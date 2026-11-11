import React from 'react';
import type { DashboardData, SiteId, SyncStatus, ViewId } from '../../types/dashboard';
import { SegmentedControl, type SegmentOption } from '../common/SegmentedControl';
import { SITE_ENABLED } from '../../utils/route';
import { useAuth } from '../../context/AuthContext';
import { Activity, ChartColumnIncreasing, ChartLine, Database, DollarSign, FileText, LayoutGrid, Lock, MonitorSmartphone, Search, ShoppingCart, X } from 'lucide-react';
import { Button } from '../common/Button';
import { Dropdown, type DropdownOption } from '../common/Dropdown';

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
  /** 보고 있는 사이트 (아이티켓 / 온코어) */
  site: SiteId;
  onSiteChange: (site: SiteId) => void;
}

type DashboardId = 'ad-insight' | 'analytics';

/** 브랜드 선택 박스로 오가는 대시보드 — 개발 서버에서는 각 프로젝트의 로컬 서버, 배포본에서는 운영 주소로 간다 */
const DASHBOARDS: { id: DashboardId; label: string; local: string; live: string }[] = [
  { id: 'ad-insight', label: 'its-ad-insight', local: 'http://localhost:2000/', live: 'https://its-ad-insight.itket.com/' },
  { id: 'analytics', label: 'its-analytics', local: 'http://localhost:1000/', live: 'https://its-analytics.itket.com/' },
];
const DASHBOARD_OPTIONS: DropdownOption<DashboardId>[] = DASHBOARDS.map((d) => ({ value: d.id, label: d.label, title: import.meta.env.DEV ? d.local : d.live }));
const goDashboard = (id: DashboardId) => {
  const d = DASHBOARDS.find((x) => x.id === id);
  if (d) window.location.href = import.meta.env.DEV ? d.local : d.live;
};

/** 사이트 선택 — 막아 둔 사이트(route.ts SITE_ENABLED)와, 로그인 전의 온코어는 고를 수 없게 둔다 */
const siteOptions = (isLoggedIn: boolean): SegmentOption<SiteId>[] => [
  { value: 'itket', label: '아이티켓' },
  {
    value: 'oncore',
    label: '온코어',
    title: !SITE_ENABLED.oncore ? '온코어 데이터 연결 준비 중' : isLoggedIn ? undefined : '로그인하면 온코어 데이터를 볼 수 있습니다',
    disabled: !SITE_ENABLED.oncore || !isLoggedIn,
  },
];

// 순서는 종합 요약 KPI 카드 순서와 같다 — 광고비 → 견적 → 효율(광고비 ÷ 견적) → 키워드·소재 상세, 구매 상세·기기별 통계는 맨 아래
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
  {
    id: 'devices',
    label: '기기별 통계',
    icon: (
      <MonitorSmartphone />
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
  site,
  onSiteChange,
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
        {/* 브랜드: 아이콘은 종합 요약으로, 이름은 대시보드 선택 박스 (its-ad-insight ↔ its-analytics) */}
        <div className="brand" id="brand">
          <a
            className="brand-home"
            href="/"
            title="종합 요약으로"
            aria-label="종합 요약으로"
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;
              e.preventDefault();
              onNavigate('overview');
            }}
          >
            <i>
              <ChartColumnIncreasing />
            </i>
          </a>
          <Dropdown<DashboardId> className="brand-dd" id="dd-dashboard" ariaLabel="대시보드 선택" options={DASHBOARD_OPTIONS} value="ad-insight" onChange={goDashboard} />
        </div>
        <div className="site-switch">
          <SegmentedControl<SiteId> id="seg-site" options={siteOptions(isLoggedIn)} value={site} onChange={onSiteChange} />
        </div>
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
              <button
                className={`nv nv-usage${currentView === 'usage' ? ' on' : ''}`}
                id="nav-usage"
                data-v="usage"
                data-btn="usage"
                aria-current={currentView === 'usage' ? 'page' : undefined}
                onClick={() => onNavigate('usage')}
              >
                <Activity />
                <span>이용 현황</span>
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
