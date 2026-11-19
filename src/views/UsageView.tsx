import React, { useEffect, useMemo, useState } from 'react';
import { MultiChart } from '../components/charts/MultiChart';
import { KpiCard, KpiDetailItems, KpiSection } from '../components/charts/KpiCard';
import { Card } from '../components/common/Card';
import { EmptyState } from '../components/common/EmptyState';
import { ViewNote } from '../components/common/Note';
import { Notice } from '../components/common/Notice';
import { SegmentedControl, type SegmentOption } from '../components/common/SegmentedControl';
import { SkelKpi, SkelTable } from '../components/common/SkeletonView';
import { NumTd, TreeChildRow, TreeParentRow, childLabelOf, EmptyRow } from '../components/common/TableRows';
import { TabBar, TabButton } from '../components/common/TabButton';
import { Th } from '../components/common/Th';
import { View } from '../components/common/View';
import { ViewHeader } from '../components/common/ViewHeader';
import { loadUsageStats, USAGE_TRACKING_ON, type UsageDay, type UsageStats } from '../lib/usage';
import { addDays, daysBetween, toDayKey, type DayRange } from '../utils/dayRange';
import { fmt, sumBy } from '../utils/format';
import { toggledSet } from '../utils/toggleSet';
import { dayWithWeekday, daySlashLabel, durationText, lastAtText, monthText, viewTitle } from '../utils/usageFormat';
import { usagePeriodOf } from '../utils/usagePeriod';

const TITLE = '이용 현황';

/** 이 일수를 넘는 기간은 그래프·표를 월 단위로 묶는다 */
const DAILY_MAX_DAYS = 62;

/** 빠른 기간 — 누르면 기간 선택 바의 일·기간이 '오늘까지 N일' 로 바뀐다 */
const RECENT_DAYS = [1, 7, 30, 90] as const;

/** 상세 이용 표 탭 — 화면별 · 계정별 · 카테고리별 · 일별(월별) */
type UsageTab = 'views' | 'accounts' | 'categories' | 'daily';

type Loaded = { cur: UsageStats; prev: UsageStats | null } | { error: string; setupNeeded: boolean } | null;

interface UsageViewProps {
  /** 기간 선택의 기준월 (연도 합계면 그해 마지막 달) */
  selectedMonth: string;
  /** 기간 선택 '전체' */
  allPeriod?: boolean;
  /** 월 선택 '전체' — 선택 연도 합계 */
  yearTotal?: boolean;
  /** 일·기간 선택 (켜져 있으면 월 선택보다 우선) */
  dayRange?: DayRange | null;
  /** '최근 N일' 을 누르면 이용 현황 전용 기간으로 바꾼다 (다른 메뉴의 기간은 그대로) */
  onSelectDayRange: (range: DayRange) => void;
}

/** 직원 이용 현황 — 방문(기기당 하루 1회)·페이지뷰·체류시간. 로그인한 관리자만 보고, 기간은 상단 기간 선택을 따른다 */
export const UsageView: React.FC<UsageViewProps> = ({ selectedMonth, allPeriod = false, yearTotal = false, dayRange = null, onSelectDayRange }) => {
  const [loaded, setLoaded] = useState<Loaded>(null);
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const [openAccounts, setOpenAccounts] = useState<Set<string>>(new Set());
  // 처음에는 계정별 — 누가 쓰는지가 가장 먼저 궁금하다 (2026-11-19 사용자 결정). 계정별 기록이 없으면 첫 탭(화면별)
  const [tab, setTab] = useState<UsageTab>('accounts');

  const today = toDayKey(new Date());
  const { cur: range, prev: prevRange, label, cmpLabel } = usagePeriodOf(selectedMonth, allPeriod, yearTotal, dayRange, today);
  const future = range.from > today;
  // 지금 기간이 '오늘까지 N일' 이면 그 버튼을 켠다
  const recentOn = dayRange && dayRange.to === today ? RECENT_DAYS.find((n) => dayRange.from === addDays(today, -(n - 1))) : undefined;
  const recentOptions: SegmentOption<number>[] = RECENT_DAYS.map((n) => ({ value: n, label: `최근 ${n}일` }));

  useEffect(() => {
    let alive = true;
    setLoaded(null);
    Promise.all([
      loadUsageStats(range.from, range.to),
      prevRange ? loadUsageStats(prevRange.from, prevRange.to) : Promise.resolve(null),
    ]).then(([cur, prev]) => {
      if (!alive) return;
      if (!cur.ok) setLoaded({ error: cur.message, setupNeeded: cur.setupNeeded });
      else if (prev && !prev.ok) setLoaded({ error: prev.message, setupNeeded: prev.setupNeeded });
      else setLoaded({ cur: cur.stats, prev: prev && prev.ok ? prev.stats : null });
    });
    return () => {
      alive = false;
    };
  }, [range.from, range.to, prevRange?.from, prevRange?.to]);

  // 수집 시작일부터 기간 끝까지, 기록이 없는 날도 0 으로 채운다. 긴 기간은 월 단위로 묶는다
  const { buckets, monthly, spanDays } = useMemo(() => {
    if (!loaded || !('cur' in loaded) || future) return { buckets: [] as UsageDay[], monthly: false, spanDays: 0 };
    const since = loaded.cur.since;
    const from = since && since > range.from ? since : range.from;
    const days = since && from <= range.to ? daysBetween(from, range.to) : [];
    const byDate = new Map(loaded.cur.daily.map((d) => [d.date, d]));
    const daily = days.map((date) => byDate.get(date) ?? { date, visits: 0, pageviews: 0, seconds: 0 });
    if (daily.length <= DAILY_MAX_DAYS) return { buckets: daily, monthly: false, spanDays: daily.length };
    const byMonth = new Map<string, UsageDay>();
    daily.forEach((d) => {
      const key = d.date.slice(0, 7);
      const m = byMonth.get(key) ?? { date: key, visits: 0, pageviews: 0, seconds: 0 };
      byMonth.set(key, { ...m, visits: m.visits + d.visits, pageviews: m.pageviews + d.pageviews, seconds: m.seconds + d.seconds });
    });
    return { buckets: [...byMonth.values()], monthly: true, spanDays: daily.length };
  }, [loaded, range.from, range.to, future]);

  let body: React.ReactNode;
  if (!loaded) {
    body = (
      <>
        <KpiSection>
          {['방문', '이용 기기', '페이지뷰', '평균 체류시간'].map((l) => (
            <SkelKpi key={l} />
          ))}
        </KpiSection>
        <Card name="usage-loading">
          <SkelTable rows={6} />
        </Card>
      </>
    );
  } else if ('error' in loaded) {
    body = loaded.setupNeeded ? (
      <Notice tone="warn">
        이용 현황 테이블이 아직 없습니다. Supabase SQL Editor 에서 <code>supabase/usage.sql</code> 을 실행하면 그때부터 기록이 쌓입니다.
      </Notice>
    ) : (
      <Notice tone="warn">이용 현황을 불러오지 못했습니다 ({loaded.error})</Notice>
    );
  } else {
    const { cur, prev } = loaded;
    const visits = sumBy(cur.daily, (d) => d.visits);
    const pageviews = sumBy(cur.daily, (d) => d.pageviews);
    const seconds = sumBy(cur.daily, (d) => d.seconds);
    const prevVisits = prev ? sumBy(prev.daily, (d) => d.visits) : 0;
    const prevPageviews = prev ? sumBy(prev.daily, (d) => d.pageviews) : 0;
    const prevSeconds = prev ? sumBy(prev.daily, (d) => d.seconds) : 0;
    // 비교 기간이 수집 시작 전이면 비교하지 않는다
    const hasPrev = !!prev && !!prevRange && !!cur.since && cur.since <= prevRange.to;
    const avgSec = visits ? seconds / visits : 0;
    const prevAvgSec = prevVisits ? prevSeconds / prevVisits : 0;
    const activeDays = cur.daily.filter((d) => d.visits > 0).length;
    // 이용 기기 보조 줄 — PC·태블릿·모바일은 늘 보이고, 기기 종류를 기록하기 전 기록은 '미수집' 으로 (있을 때만)
    const kinds = cur.deviceKinds;
    const kindItems: [string, string][] = kinds
      ? [
          ['PC', `${fmt(kinds.pc)}대`] as [string, string],
          ['태블릿', `${fmt(kinds.tablet)}대`] as [string, string],
          ['모바일', `${fmt(kinds.mobile)}대`] as [string, string],
        ].concat(kinds.unknown > 0 ? [['미수집', `${fmt(kinds.unknown)}대`]] : [])
      : [];

    // 표는 탭으로 나눠 하나씩 보여 준다 — 계정별(맨 앞)은 기록 함수가 있을 때만
    const tabs: { id: UsageTab; label: string; count?: number; sort: string }[] = [
      ...(cur.accounts !== null
        ? [{ id: 'accounts' as const, label: '계정별', count: Array.isArray(cur.accounts) ? cur.accounts.length : undefined, sort: '페이지뷰 많은 순' }]
        : []),
      { id: 'views', label: '화면별', count: cur.views.length, sort: '페이지뷰 많은 순' },
      { id: 'categories', label: '카테고리별', count: cur.categoryGroups.length, sort: '많이 고른 순' },
      { id: 'daily', label: monthly ? '월별' : '일별', sort: '최근부터' },
    ];
    const activeTab: UsageTab = tabs.some((t) => t.id === tab) ? tab : tabs[0].id;
    const tabInfo = tabs.find((t) => t.id === activeTab)!;

    body = (
      <>
        <KpiSection id="usage-kpis">
          <KpiCard
            label="방문"
            value={`${fmt(visits)}회`}
            cur={visits}
            prev={hasPrev ? prevVisits : null}
            cmpLabel={cmpLabel}
            detail={<KpiDetailItems items={[['하루 평균', spanDays ? `${(visits / spanDays).toFixed(1)}회` : '–'], ['이용한 날', `${activeDays}일`]]} />}
          />
          <KpiCard
            label="이용 기기"
            value={`${fmt(cur.devices)}대`}
            cur={cur.devices}
            prev={hasPrev && prev ? prev.devices : null}
            cmpLabel={cmpLabel}
            detail={kindItems.length > 0 && <KpiDetailItems items={kindItems} />}
          />
          <KpiCard
            label="페이지뷰"
            value={`${fmt(pageviews)}회`}
            cur={pageviews}
            prev={hasPrev ? prevPageviews : null}
            cmpLabel={cmpLabel}
            detail={<KpiDetailItems items={[['방문당', visits ? `${(pageviews / visits).toFixed(1)}회` : '–']]} />}
          />
          <KpiCard
            label="평균 체류시간"
            value={durationText(avgSec)}
            cur={avgSec || null}
            prev={hasPrev && prevAvgSec ? prevAvgSec : null}
            cmpLabel={cmpLabel}
            detail={<KpiDetailItems items={[['총 체류', durationText(seconds)]]} />}
          />
        </KpiSection>

        <MultiChart
          id="chUsage"
          title={`${monthly ? '월별' : '일별'} 방문 · 페이지뷰`}
          labels={buckets.map((d) => (monthly ? monthText(d.date) : daySlashLabel(d.date)))}
          series={
            visits || pageviews
              ? [
                  { k: '방문', c: '--c-it', v: buckets.map((d) => d.visits) },
                  { k: '페이지뷰', c: '--c-g', v: buckets.map((d) => d.pageviews) },
                ]
              : []
          }
          unit="회"
          emptyMessage="이 기간에 기록된 방문이 없습니다"
        />

        <Card name="usage-detail" id="usage-detail" tableWrap title="상세 이용" subtitle={`(${label} · ${tabInfo.sort})`}>
          <TabBar>
            {tabs.map((t) => (
              <TabButton key={t.id} className="btn-usage-tab" data-btn={`usage-tab-${t.id}`} active={activeTab === t.id} label={t.label} count={t.count} onClick={() => setTab(t.id)} />
            ))}
          </TabBar>
          {activeTab === 'views' && (
            <>
              {cur.views.length ? (
                <table className="stk usage-table">
                  <colgroup>
                    <col />
                    <col className="col-us-count" />
                    <col className="col-us-count" />
                    <col className="col-us-duration" />
                    <col className="col-us-duration" />
                  </colgroup>
                  <thead>
                    <tr>
                      <Th>화면</Th>
                      <Th className="n" tip="방문|그 화면을 연 기기 수를 날마다 더한 값 (같은 기기는 하루 1회)">방문</Th>
                      <Th className="n">페이지뷰</Th>
                      <Th className="n">총 체류시간</Th>
                      <Th className="n" tip="평균 체류|총 체류시간 ÷ 페이지뷰">평균 체류</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {cur.views.map((v) => (
                      <tr key={v.view}>
                        <td>{viewTitle(v.view)}</td>
                        <NumTd value={v.visits} unit="회" />
                        <NumTd value={v.pageviews} unit="회" />
                        <NumTd>{durationText(v.seconds)}</NumTd>
                        <NumTd>{v.pageviews ? durationText(v.seconds / v.pageviews) : '–'}</NumTd>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <EmptyState message="이 기간에 기록된 화면 이용이 없습니다." />
              )}
            </>
          )}
          {activeTab === 'accounts' && cur.accounts !== null && (
            <>
              {cur.accounts === 'setup' ? (
                <Notice tone="warn">
                  계정별 기록 함수가 아직 없습니다. Supabase SQL Editor 에서 <code>supabase/usage.sql</code> 을 다시 실행하면 그때부터 계정별 기록이 쌓입니다.
                </Notice>
              ) : cur.accounts.length ? (
                <table className="stk usage-table usage-accounts">
                  <colgroup>
                    <col className="col-us-name" />
                    <col className="col-us-company" />
                    <col className="col-us-team" />
                    <col />
                    <col className="col-us-count" />
                    <col className="col-us-count" />
                    <col className="col-us-duration" />
                    <col className="col-us-date" />
                  </colgroup>
                  <thead>
                    <tr>
                      <Th>담당자</Th>
                      <Th>회사</Th>
                      <Th>팀</Th>
                      <Th>이메일</Th>
                      <Th className="n" tip="이용한 날|그 계정으로 로그인해 화면을 연 날 수 (펼친 줄은 그 화면을 연 날 수)">이용한 날</Th>
                      <Th className="n">페이지뷰</Th>
                      <Th className="n">총 체류시간</Th>
                      <Th className="n" tip="마지막 접속|그 계정의 마지막 기록 시각 (한국 시간)">마지막 접속</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {cur.accounts.map((a) => {
                      const isOpen = openAccounts.has(a.userId);
                      return (
                        <React.Fragment key={a.userId}>
                          <TreeParentRow
                            label={a.name || a.email.split('@')[0] || '(알 수 없음)'}
                            childCount={a.views.length}
                            showCount={false}
                            open={isOpen}
                            onToggle={() => setOpenAccounts((prev) => toggledSet(prev, a.userId))}
                          >
                            <td title={a.company || undefined}>{a.company || '–'}</td>
                            <td title={a.team || undefined}>{a.team || '–'}</td>
                            <td title={a.email || undefined}>{a.email || '–'}</td>
                            <NumTd value={a.days} unit="일" />
                            <NumTd value={a.pageviews} unit="회" bold />
                            <NumTd>{durationText(a.seconds)}</NumTd>
                            <NumTd>{lastAtText(a.lastAt)}</NumTd>
                          </TreeParentRow>
                          {isOpen &&
                            a.views.map((v) => (
                              <TreeChildRow key={v.view} label={viewTitle(v.view)} labelColSpan={4}>
                                <NumTd value={v.days} unit="일" />
                                <NumTd value={v.pageviews} unit="회" />
                                <NumTd>{durationText(v.seconds)}</NumTd>
                                <NumTd value={null} />
                              </TreeChildRow>
                            ))}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <EmptyState
                  message="이 기간에 로그인해서 이용한 기록이 없습니다."
                  subMessage={cur.accountSince ? `계정별 기록은 ${cur.accountSince.replace(/-/g, '.')} 부터 쌓였습니다.` : '계정별 기록은 배포 후부터 쌓입니다.'}
                />
              )}
            </>
          )}
          {activeTab === 'categories' && (
            <>
              {cur.categories === null ? (
                <Notice tone="warn">
                  카테고리 기록 함수가 아직 없습니다. Supabase SQL Editor 에서 <code>supabase/usage.sql</code> 을 다시 실행하면 그때부터 기록이 쌓입니다.
                </Notice>
              ) : cur.categoryGroups.length ? (
                <table className="stk usage-table">
                  <colgroup>
                    <col />
                    <col className="col-us-count" />
                    <col className="col-us-count" />
                    <col className="col-us-duration" />
                    <col className="col-us-duration" />
                  </colgroup>
                  <thead>
                    <tr>
                      <Th>카테고리</Th>
                      <Th className="n" tip="방문|그 카테고리를 고른 기기 수를 날마다 더한 값 (같은 기기는 하루 1회)">방문</Th>
                      <Th className="n" tip="선택|카테고리 필터(카테고리 효율·키워드·견적 목록)로 고르거나, 표에서 카테고리 줄을 펼치거나, 카테고리로 검색한 횟수">선택</Th>
                      <Th className="n" tip="필터 체류|카테고리 필터를 그 카테고리로 둔 채 실제로 본 시간 (줄 펼침·카테고리 검색은 시간을 세지 않음)">필터 체류</Th>
                      <Th className="n" tip="선택당 체류|필터 체류 ÷ 선택">선택당 체류</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {cur.categoryGroups.map((g) => {
                      const children = cur.categories!.filter((c) => c.category === g.category || c.category.startsWith(`${g.category} > `));
                      const hasChildren = children.some((c) => c.category !== g.category);
                      const isOpen = openCats.has(g.category);
                      return (
                        <React.Fragment key={g.category}>
                          <TreeParentRow
                            label={g.category}
                            sub={g.views.map(viewTitle).join(' · ')}
                            childCount={hasChildren ? children.length : 0}
                            open={isOpen}
                            onToggle={() => setOpenCats((prev) => toggledSet(prev, g.category))}
                          >
                            <NumTd value={g.visits} unit="회" />
                            <NumTd value={g.picks} unit="회" bold />
                            <NumTd>{durationText(g.seconds)}</NumTd>
                            <NumTd>{g.picks && g.seconds ? durationText(g.seconds / g.picks) : '–'}</NumTd>
                          </TreeParentRow>
                          {hasChildren &&
                            isOpen &&
                            children.map((c) => (
                              <TreeChildRow key={c.category} label={c.category === g.category ? '1차 전체' : childLabelOf(c.category, g.category)}>
                                <NumTd value={c.visits} unit="회" />
                                <NumTd value={c.picks} unit="회" />
                                <NumTd>{durationText(c.seconds)}</NumTd>
                                <NumTd>{c.picks && c.seconds ? durationText(c.seconds / c.picks) : '–'}</NumTd>
                              </TreeChildRow>
                            ))}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <EmptyState
                  message="이 기간에 카테고리를 고른 기록이 없습니다."
                  subMessage={`카테고리 효율·키워드·견적 목록의 카테고리 필터, 카테고리 효율 표의 줄 펼침, 카테고리로 연 검색(검색창 카테고리 필터·종합 요약 카테고리 이름·카테고리 이름 입력)을 셉니다.${cur.categorySince ? '' : ' 카테고리 기록은 배포 후부터 쌓입니다.'}`}
                />
              )}
            </>
          )}
          {activeTab === 'daily' && (
            <>
              <table className="stk usage-table">
                <colgroup>
                  <col />
                  <col className="col-us-count" />
                  <col className="col-us-count" />
                  <col className="col-us-duration" />
                  <col className="col-us-duration" />
                </colgroup>
                <thead>
                  <tr>
                    <Th>{monthly ? '월' : '날짜'}</Th>
                    <Th className="n" tip="방문|그날 접속한 기기 수 (같은 기기는 하루 1회, 월은 날마다 더한 값)">방문</Th>
                    <Th className="n">페이지뷰</Th>
                    <Th className="n">체류시간</Th>
                    <Th className="n" tip="방문당 체류|체류시간 ÷ 방문">방문당 체류</Th>
                  </tr>
                </thead>
                <tbody>
                  {buckets.length === 0 && (
                    <EmptyRow colSpan={5} message="이 기간에 기록된 방문이 없습니다." />
                  )}
                  {[...buckets].reverse().map((d) => (
                    <tr key={d.date}>
                      <td>{monthly ? monthText(d.date) : dayWithWeekday(d.date)}</td>
                      <NumTd value={d.visits || null} unit="회" />
                      <NumTd value={d.pageviews || null} unit="회" />
                      <NumTd>{durationText(d.seconds)}</NumTd>
                      <NumTd>{d.visits ? durationText(d.seconds / d.visits) : '–'}</NumTd>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Card>
      </>
    );
  }

  const since = loaded && 'cur' in loaded ? loaded.cur.since : null;

  return (
    <View name="usage" title={TITLE}>
      <ViewHeader title={TITLE} description="직원들이 광고 인사이트를 얼마나 자주, 얼마나 오래 보는지 보여 줍니다." status="live" />
      <ViewNote>
        ※ 방문은 기기당 하루 1회 · 체류시간은 5분 무조작 제외{since && ` · ${since.replace(/-/g, '.')}부터 수집`}
        {!USAGE_TRACKING_ON && ' · 개발 환경은 기록 안 함'}
      </ViewNote>
      <div className="usage-tools">
        <SegmentedControl<number>
          id="seg-usage-recent"
          options={recentOptions}
          value={recentOn ?? 0}
          onChange={(n) => onSelectDayRange({ from: addDays(today, -(n - 1)), to: today })}
        />
      </div>
      {body}
    </View>
  );
};
