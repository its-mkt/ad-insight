import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ViewId } from './types/dashboard';
import { VALID_VIEWS, VIEW_TITLES } from './utils/constants';
import { THIS_M, THIS_Y } from './utils/format';
import { useDashboardData } from './hooks/useDashboardData';
import { Sidebar } from './components/Layout/Sidebar';
import { Header } from './components/Layout/Header';
import { Tooltip } from './components/Layout/Tooltip';
import { PeriodNav } from './components/common/PeriodNav';
import { lastMonthOfYear, TOTAL_PERIOD_VIEWS } from './utils/allPeriod';
import type { SearchTab } from './utils/search';
import { addRecentSearch, clearRecentSearches, loadFavoriteSearches, sameSearch, toggleFavoriteSearch } from './utils/recentSearches';
import { Star } from 'lucide-react';
import { SkeletonView } from './components/common/SkeletonView';
import { OverviewView } from './views/OverviewView';
import { AdsView } from './views/AdsView';
import { CatEfficiencyView } from './views/CatEfficiencyView';
import { KeywordsView } from './views/KeywordsView';
import { QuotesView } from './views/QuotesView';
import { SearchView } from './views/SearchView';
import { DataView } from './views/DataView';
import { AdminView } from './views/AdminView';
import { LoginModal } from './components/Layout/LoginModal';
import { SearchDialog } from './components/Layout/SearchDialog';
import { useAuth } from './context/AuthContext';
import { dayPeriodOf, type DayRange } from './utils/dayRange';
import { applyDayRange, rangeCovered } from './utils/dayData';

/** 주소의 해시 → 화면과 검색어 (#keywords, #search?q=HPE) */
function parseHash(): { view: ViewId; query: string } {
  const [name, params = ''] = window.location.hash.slice(1).split('?');
  const view = name as ViewId;
  if (!VALID_VIEWS.includes(view)) return { view: 'overview', query: '' };
  return { view, query: view === 'search' ? (new URLSearchParams(params).get('q') || '').trim() : '' };
}

function getInitialDark(): boolean {
  try {
    const t = localStorage.getItem('theme');
    if (t) {
      document.documentElement.dataset.theme = t;
      return t === 'dark';
    }
  } catch {
    // ignore
  }
  const r = document.documentElement;
  return r.dataset.theme
    ? r.dataset.theme === 'dark'
    : window.matchMedia('(prefers-color-scheme:dark)').matches;
}

export const App: React.FC = () => {
  const { data, categoryMap, status, isSyncing, load, updateQuotesRaw, updateQuotesSites } = useDashboardData();
  const [currentView, setCurrentView] = useState<ViewId>(() => parseHash().view);
  const [searchQuery, setSearchQuery] = useState(() => parseHash().query);
  const [searchTab, setSearchTab] = useState<SearchTab | undefined>();
  const [searchOpen, setSearchOpen] = useState(false);
  const { isLoggedIn, loading: authLoading } = useAuth();
  const [loginOpen, setLoginOpen] = useState(false);
  const wasLoggedIn = useRef(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  // 로그인 상태마다 목록이 따로라 바뀌면 다시 읽는다
  useEffect(() => setFavorites(loadFavoriteSearches(isLoggedIn)), [isLoggedIn]);
  const toggleFavorite = (query: string) => setFavorites(toggleFavoriteSearch(query, isLoggedIn));
  const queryIsFavorite = favorites.some((q) => sameSearch(q, searchQuery));
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [isDark, setIsDark] = useState<boolean>(getInitialDark);

  // 캐시가 없어 보여 줄 데이터가 하나도 없는 첫 동기화 동안만 스켈레톤 (캐시가 있으면 이전 데이터를 그대로 보여 준다)
  const hasData = data.spend.length > 0 || data.quotes.length > 0;
  // 데이터 연결 화면은 연결 설정을 봐야 하므로 스켈레톤 없이 바로 보여 준다
  const isLoading = !hasData && (status === 'init' || isSyncing) && currentView !== 'data' && currentView !== 'admin';

  const allMonths = useMemo(() => {
    return [
      ...new Set([
        ...(data.spend || []).map((r) => r.month),
        ...(data.quotes || []).map((r) => r.month),
      ]),
    ]
      .filter(Boolean)
      .sort();
  }, [data.spend, data.quotes]);

  const maxAvailableMonth = useMemo(() => {
    return (
      allMonths.filter((m) => m <= THIS_M).pop() ||
      allMonths[allMonths.length - 1] ||
      THIS_M
    );
  }, [allMonths]);

  // 기준월 선택에서 데이터가 없는 이른 달(예: 2021년 1~11월)은 고를 수 없게 한다
  const minAvailableMonth = useMemo(
    () => allMonths.find((m) => /^\d{4}-\d{2}$/.test(m)) || maxAvailableMonth,
    [allMonths, maxAvailableMonth]
  );

  const availableYears = useMemo(() => {
    const yrs = [...new Set(allMonths.map((m) => m.slice(0, 4)))].sort((a, b) =>
      b.localeCompare(a)
    );
    if (!yrs.includes(String(THIS_Y))) {
      yrs.unshift(String(THIS_Y));
    }
    return yrs.length > 0 ? yrs : [String(THIS_Y)];
  }, [allMonths]);

  const [selectedYear, setSelectedYear] = useState<string>(String(THIS_Y));
  const [selectedMonth, setSelectedMonth] = useState<string>(THIS_M);
  // 기간 선택의 '전체' — 지원하는 화면에서만 켜지고, 달을 고르면 풀린다. 고른 달은 그대로 남겨 다른 화면에서 쓴다
  const [allPeriodOn, setAllPeriodOn] = useState(false);
  const supportsTotal = TOTAL_PERIOD_VIEWS.includes(currentView);
  const allPeriod = allPeriodOn && supportsTotal;
  // 월 선택의 '전체' — 선택 연도의 1월~최신 달 합계. 화면에는 그 마지막 달을 기준월로 넘긴다
  const [yearTotalOn, setYearTotalOn] = useState(false);
  const yearTotal = yearTotalOn && supportsTotal && !allPeriod;
  const viewMonth = yearTotal ? lastMonthOfYear(selectedMonth, maxAvailableMonth) : selectedMonth;
  // 검색 결과의 기간 — 보던 화면의 기간과 분리한다. 새 검색은 당월(가장 최근 수집 달)에서 시작하고, 여기서 넓혀도 다른 화면은 그대로다
  const isSearchView = currentView === 'search';
  const [searchPeriod, setSearchPeriod] = useState<{ mode: 'all' | 'year' | 'month'; month: string }>({ mode: 'month', month: '' });
  // 검색 결과의 일·기간 선택 — 켜져 있으면 월 선택보다 우선한다 (견적은 날짜 그대로, 광고는 걸친 달 전체). 월·연도·전체를 고르면 풀린다
  const [searchDay, setSearchDay] = useState<DayRange | null>(null);
  // 일·기간 — 일별 광고비 구간 안이면 그 기간의 광고비·견적으로 다시 모은 자료를 화면에 준다 (구간 밖이면 월 단위)
  const dayCovered = !!searchDay && rangeCovered(data, searchDay);
  const viewData = useMemo(
    () => (searchDay && currentView !== 'admin' && currentView !== 'data' ? applyDayRange(data, searchDay, { quotes: currentView !== 'search' }) : data),
    [data, searchDay, currentView]
  );
  const period = useMemo(() => (searchDay && dayCovered ? dayPeriodOf(searchDay) : undefined), [searchDay, dayCovered]);
  const searchMonth = searchPeriod.month || maxAvailableMonth;

  useEffect(() => {
    if (maxAvailableMonth) {
      setSelectedYear((prev) => prev || maxAvailableMonth.slice(0, 4));
      setSelectedMonth((prev) => prev || maxAvailableMonth);
    }
  }, [maxAvailableMonth]);

  const closeDrawer = () => {
    setDrawerOpen(false);
    document.body.classList.remove('lock');
  };

  const handleNavigate = (view: ViewId) => {
    setSearchDay(null);
    const target = VALID_VIEWS.includes(view) ? view : 'overview';
    setCurrentView(target);
    closeDrawer();
    document.title = `${VIEW_TITLES[target]} · 아이티캣 광고 인사이트`;
    window.history.replaceState(
      null,
      '',
      target === 'overview' ? window.location.pathname + window.location.search : `#${target}`
    );
    window.scrollTo({ top: 0 });
  };

  const goSearch = (
    query: string,
    tab?: SearchTab,
    opts?: { period?: { mode: 'all' | 'year' | 'month'; month: string }; record?: boolean }
  ) => {
    if (opts?.record !== false) addRecentSearch(query, isLoggedIn);
    setSearchQuery(query);
    setSearchTab(tab);
    setSearchOpen(false);
    setSearchPeriod(opts?.period ?? { mode: 'month', month: '' });
    setSearchDay(null);
    setCurrentView('search');
    closeDrawer();
    window.history.pushState(null, '', `#search?q=${encodeURIComponent(query)}`);
    window.scrollTo({ top: 0 });
  };

  // 표의 이름(카테고리·유입 매체)을 눌러 검색 결과로 — 보던 기간을 그대로 쓰고, 최근 검색 기록에는 남기지 않는다
  const searchFromName = (query: string) =>
    goSearch(query, undefined, {
      record: false,
      period: allPeriod
        ? { mode: 'all', month: '' }
        : { mode: yearTotal ? 'year' : 'month', month: yearTotal ? selectedMonth : viewMonth },
    });

  useEffect(() => {
    document.title = `${currentView === 'search' && searchQuery ? `"${searchQuery}" ` : ''}${VIEW_TITLES[currentView]} · 아이티캣 광고 인사이트`;
  }, [currentView, searchQuery]);

  // 설정·연동(데이터 연결·어드민 관리)은 로그인한 관리자만. 로그아웃하면 종합 요약으로, 로그인 없이 주소(#data·#admin)로 들어오면 종합 요약 + 로그인 모달
  useEffect(() => {
    if (authLoading) return;
    if ((currentView === 'data' || currentView === 'admin') && !isLoggedIn) {
      handleNavigate('overview');
      if (!wasLoggedIn.current) setLoginOpen(true);
    }
    // 관리자가 찾은 고객사 이름이 로그아웃 상태 화면에 남지 않게 한다
    if (wasLoggedIn.current && !isLoggedIn) clearRecentSearches(true);
    wasLoggedIn.current = isLoggedIn;
  }, [authLoading, isLoggedIn, currentView]);

  useEffect(() => {
    const onHashChange = () => {
      const { view, query } = parseHash();
      setCurrentView(view);
      if (view === 'search') {
        setSearchQuery(query);
        setSearchPeriod({ mode: 'month', month: '' });
        setSearchDay(null);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer();
      // 한글 입력 상태에서도 되도록 글자 대신 키 위치로 판단한다
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyK') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    const onResize = () => {
      if (window.innerWidth > 768) closeDrawer();
    };
    const mq = window.matchMedia('(prefers-color-scheme:dark)');
    const onSystemThemeChange = () => {
      if (!document.documentElement.dataset.theme) {
        setIsDark(mq.matches);
      }
    };

    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);
    mq.addEventListener('change', onSystemThemeChange);

    return () => {
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
      mq.removeEventListener('change', onSystemThemeChange);
    };
  }, []);

  const handleToggleTheme = () => {
    const nextDark = !isDark;
    const nextTheme = nextDark ? 'dark' : 'light';
    document.documentElement.dataset.theme = nextTheme;
    try {
      localStorage.setItem('theme', nextTheme);
    } catch {
      // ignore
    }
    setIsDark(nextDark);
  };

  const handleOpenDrawer = () => {
    setDrawerOpen(true);
    document.body.classList.add('lock');
  };

  return (
    <>
      <div className="app">
        <Sidebar
          currentView={currentView}
          drawerOpen={drawerOpen}
          status={status}
          updated={data.updated}
          isSyncing={isSyncing}
          onNavigate={handleNavigate}
          onCloseDrawer={closeDrawer}
          onReload={load}
        />
        <div className="wrap">
          <Header
            title={VIEW_TITLES[currentView]}
            titleDetail={isSearchView ? searchQuery : undefined}
            titleAction={
              isSearchView && searchQuery ? (
                <button
                  type="button"
                  className={`crumb-star btn-search-star${queryIsFavorite ? ' on' : ''}`}
                  id="btn-search-favorite"
                  data-btn="search-favorite-toggle"
                  aria-pressed={queryIsFavorite}
                  aria-label={queryIsFavorite ? '검색어 즐겨찾기 해제' : '검색어 즐겨찾기'}
                  title={queryIsFavorite ? '즐겨찾기 해제' : '즐겨찾기'}
                  onClick={() => toggleFavorite(searchQuery)}
                >
                  <Star size="1rem" aria-hidden="true" />
                </button>
              ) : undefined
            }
            drawerOpen={drawerOpen}
            isDark={isDark}
            onOpenDrawer={handleOpenDrawer}
            onToggleTheme={handleToggleTheme}
            onLogin={() => setLoginOpen(true)}
            onSearch={() => setSearchOpen(true)}
          />
          {currentView !== 'data' && (
            <PeriodNav
              years={availableYears}
              selectedYear={selectedYear}
              selectedMonth={isSearchView ? searchMonth : selectedMonth}
              minAvailableMonth={minAvailableMonth}
              maxAvailableMonth={maxAvailableMonth}
              onSelectYear={setSelectedYear}
              onSelectMonth={(m) => {
                if (isSearchView) {
                  setSearchDay(null);
                  setSearchPeriod({ mode: 'month', month: m });
                  return;
                }
                setSearchDay(null);
                setAllPeriodOn(false);
                setYearTotalOn(false);
                setSelectedMonth(m);
              }}
              allPeriod={isSearchView ? searchPeriod.mode === 'all' : allPeriod}
              onSelectAll={
                isSearchView
                  ? () => {
                      setSearchDay(null);
                      setSearchPeriod((p) => ({ ...p, mode: 'all' }));
                    }
                  : supportsTotal
                    ? () => {
                        setSearchDay(null);
                        setAllPeriodOn(true);
                        setYearTotalOn(false);
                      }
                    : undefined
              }
              yearTotal={isSearchView ? searchPeriod.mode === 'year' : yearTotal}
              dayRange={searchDay}
              dayNote={
                searchDay && !isSearchView
                  ? dayCovered
                    ? '광고비·견적은 선택한 기간, 비교는 직전 같은 일수 기준입니다 (키워드·소재 성과는 월 단위)'
                    : `이 기간은 일별 광고비 수집 전이라 ${+searchDay.to.slice(5, 7)}월 전체 기준으로 표시됩니다`
                  : undefined
              }
              onSelectDayRange={(r) => {
                setSearchDay(r);
                if (!r) return;
                const month = r.to.slice(0, 7);
                if (isSearchView) {
                  setSearchPeriod({ mode: 'month', month });
                  return;
                }
                // 광고 데이터는 월 단위라, 종료일이 속한 달을 기준월로 본다
                setAllPeriodOn(false);
                setYearTotalOn(false);
                setSelectedYear(month.slice(0, 4));
                setSelectedMonth(month);
              }}
              onSelectYearTotal={
                isSearchView
                  ? (m) => {
                      setSearchDay(null);
                      setSearchPeriod({ mode: 'year', month: m });
                    }
                  : supportsTotal
                    ? (m) => {
                        setSearchDay(null);
                        setAllPeriodOn(false);
                        setYearTotalOn(true);
                        setSelectedMonth(m);
                      }
                    : undefined
              }
            />
          )}
          <div className="cont">
            <main id="main">
              {isLoading && (
                <SkeletonView
                  title={VIEW_TITLES[currentView]}
                  variant={currentView === 'keywords' ? 'table' : 'dashboard'}
                />
              )}
              {!isLoading && currentView === 'overview' && (
                <OverviewView monthly={period ? data : undefined} period={period}
                  data={viewData}
                  categoryMap={categoryMap}
                  status={status}
                  selectedMonth={viewMonth}
                  allPeriod={allPeriod}
                  yearTotal={yearTotal}
                  onSearchName={searchFromName}
                />
              )}
              {!isLoading && currentView === 'ads' && (
                <AdsView monthly={period ? data : undefined} period={period}
                  data={viewData}
                  status={status}
                  selectedMonth={viewMonth}
                  allPeriod={allPeriod}
                  yearTotal={yearTotal}
                />
              )}
              {!isLoading && currentView === 'cat-efficiency' && (
                <CatEfficiencyView period={period}
                  data={viewData}
                  categoryMap={categoryMap}
                  status={status}
                  selectedMonth={viewMonth}
                  allPeriod={allPeriod}
                  yearTotal={yearTotal}
                />
              )}
              {!isLoading && currentView === 'keywords' && (
                <KeywordsView period={period}
                  data={viewData}
                  categoryMap={categoryMap}
                  status={status}
                  isSyncing={isSyncing}
                  selectedMonth={viewMonth}
                  allPeriod={allPeriod}
                  yearTotal={yearTotal}
                />
              )}
              {!isLoading && currentView === 'quotes' && (
                <QuotesView monthly={period ? data : undefined} period={period}
                  data={viewData}
                  status={status}
                  isSyncing={isSyncing}
                  selectedMonth={viewMonth}
                  allPeriod={allPeriod}
                  yearTotal={yearTotal}
                />
              )}
              {!isLoading && currentView === 'search' && (
                <SearchView
                  key={`${searchQuery}|${searchTab || ''}`}
                  data={viewData}
                  categoryMap={categoryMap}
                  status={status}
                  query={searchQuery}
                  initialTab={searchTab}
                  selectedMonth={searchPeriod.mode === 'year' ? lastMonthOfYear(searchMonth, maxAvailableMonth) : searchMonth}
                  allPeriod={searchPeriod.mode === 'all'}
                  yearTotal={searchPeriod.mode === 'year'}
                  dayRange={searchDay}
                  dayCovered={dayCovered}
                  isLoggedIn={isLoggedIn}
                  onLogin={() => setLoginOpen(true)}
                  onSelectAllPeriod={() => setSearchPeriod((p) => ({ ...p, mode: 'all' }))}
                />
              )}
              {currentView === 'data' && authLoading && <SkeletonView title={VIEW_TITLES.data} variant="table" />}
              {currentView === 'data' && isLoggedIn && (
                <DataView loading={!hasData && (status === 'init' || isSyncing)} data={data} categoryMap={categoryMap} status={status} />
              )}
              {/* 로그인 세션을 확인하는 동안은 표 자리표시, 로그인한 경우에만 어드민 화면 */}
              {currentView === 'admin' && authLoading && <SkeletonView title={VIEW_TITLES.admin} variant="table" />}
              {currentView === 'admin' && isLoggedIn && (
                <AdminView data={data} isSyncing={isSyncing || status === 'init'} onUpdateQuotesRaw={updateQuotesRaw} onUpdateQuotesSites={updateQuotesSites} onReload={load} />
              )}
            </main>
          </div>
        </div>
      </div>
      <Tooltip />
      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
      {searchOpen && (
        <SearchDialog
          data={data}
          categoryMap={categoryMap}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
          initialQuery={currentView === 'search' ? searchQuery : ''}
          isLoggedIn={isLoggedIn}
          month={maxAvailableMonth}
          onClose={() => setSearchOpen(false)}
          onSubmit={goSearch}
        />
      )}
    </>
  );
};
