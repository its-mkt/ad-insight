import React, { useEffect, useMemo, useState } from 'react';
import type { ViewId } from '../types/dashboard';
import { MultiChart } from '../components/charts/MultiChart';
import { KpiCard, KpiDetailItems, KpiPlaceholder, KpiSection } from '../components/charts/KpiCard';
import { Card } from '../components/common/Card';
import { EmptyState } from '../components/common/EmptyState';
import { ViewNote } from '../components/common/Note';
import { Notice } from '../components/common/Notice';
import { SegmentedControl, type SegmentOption } from '../components/common/SegmentedControl';
import { SkelTable } from '../components/common/SkeletonView';
import { Muted } from '../components/common/Muted';
import { NumTd, TreeChildRow, TreeParentRow, childLabelOf } from '../components/common/TableRows';
import { Th } from '../components/common/Th';
import { View } from '../components/common/View';
import { ViewHeader } from '../components/common/ViewHeader';
import { loadUsageStats, USAGE_TRACKING_ON, type UsageDay, type UsageStats } from '../lib/usage';
import { yearRangeLabel } from '../utils/allPeriod';
import { VIEW_TITLES } from '../utils/constants';
import { daysOfMonth, fromDayKey, lastDayOf, previousRange, rangeDays, rangeLabel, toDayKey, type DayRange } from '../utils/dayRange';
import { fmt, prevM } from '../utils/format';
import { toggledSet } from '../utils/toggleSet';

const TITLE = '이용 현황';

/** 이용 현황 수집을 시작한 달 — '전체' 기간의 시작 */
const USAGE_START = '2026-11-01';
/** 이 일수를 넘는 기간은 그래프·표를 월 단위로 묶는다 */
const DAILY_MAX_DAYS = 62;

/** 빠른 기간 — 누르면 기간 선택 바의 일·기간이 '오늘까지 N일' 로 바뀐다 */
const RECENT_DAYS = [1, 7, 30, 90] as const;

const addDays = (key: string, n: number) => {
  const d = fromDayKey(key);
  d.setDate(d.getDate() + n);
  return toDayKey(d);
};

/** 1년 전 같은 날 (2월 29일은 28일) */
const lastYearDay = (key: string) => {
  const md = key.slice(5) === '02-29' ? '02-28' : key.slice(5);
  return `${+key.slice(0, 4) - 1}-${md}`;
};

/** from~to 의 날짜 목록 */
const daysBetween = (from: string, to: string) => {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
};

/** 초 → "1시간 5분" · "12분 30초" · "40초" */
const durationText = (sec: number) => {
  const s = Math.round(sec);
  if (s <= 0) return '–';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return m ? `${h}시간 ${m}분` : `${h}시간`;
  if (m) return s % 60 && m < 10 ? `${m}분 ${s % 60}초` : `${m}분`;
  return `${s}초`;
};

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const dayLabel = (key: string) => `${+key.slice(5, 7)}/${+key.slice(8, 10)}`;
const dayWithWeekday = (key: string) => `${key.slice(2).replace(/-/g, '.')} (${WEEKDAYS[fromDayKey(key).getDay()]})`;
const monthText = (key: string) => key.slice(0, 7).replace('-', '.');

const viewTitle = (id: string) => VIEW_TITLES[id as ViewId] ?? id;

const sum = (rows: UsageDay[], k: 'visits' | 'pageviews' | 'seconds') => rows.reduce((a, r) => a + r[k], 0);

interface UsagePeriod {
  cur: DayRange;
  /** 비교 기간 (전체 기간은 없음) */
  prev: DayRange | null;
  /** 화면에 보이는 기간 이름 */
  label: string;
  cmpLabel?: string;
}

/** 상단 기간 선택 → 조회할 날짜 범위와 비교 범위. 오늘 이후는 자른다 */
function usagePeriodOf(month: string, allPeriod: boolean, yearTotal: boolean, dayRange: DayRange | null, today: string): UsagePeriod {
  const clip = (r: DayRange): DayRange => ({ from: r.from, to: r.to > today ? today : r.to });
  if (dayRange) {
    const cur = clip(dayRange);
    return { cur, prev: previousRange(cur), label: rangeLabel(cur), cmpLabel: `직전 ${rangeDays(cur)}일 대비` };
  }
  if (allPeriod) return { cur: { from: USAGE_START, to: today }, prev: null, label: '전체 기간' };
  if (yearTotal) {
    const cur = clip({ from: `${month.slice(0, 4)}-01-01`, to: lastDayOf(month) });
    return { cur, prev: { from: lastYearDay(cur.from), to: lastYearDay(cur.to) }, label: yearRangeLabel(month), cmpLabel: '전년 동기 대비' };
  }
  const cur = clip({ from: `${month}-01`, to: lastDayOf(month) });
  const pm = prevM(month);
  // 진행 중인 달은 전월 같은 날짜까지와 비교한다
  const partial = cur.to < lastDayOf(month);
  const prevDay = Math.min(+cur.to.slice(8, 10), daysOfMonth(pm));
  return {
    cur,
    prev: { from: `${pm}-01`, to: partial ? `${pm}-${String(prevDay).padStart(2, '0')}` : lastDayOf(pm) },
    label: `${month.slice(0, 4)}년 ${+month.slice(5, 7)}월`,
    cmpLabel: partial ? '전월 동기간 대비' : '전월 대비',
  };
}

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
  /** '최근 N일' 을 누르면 기간 선택 바의 일·기간을 바꾼다 */
  onSelectDayRange: (range: DayRange) => void;
}

/** 직원 이용 현황 — 방문(기기당 하루 1회)·페이지뷰·체류시간. 로그인한 관리자만 보고, 기간은 상단 기간 선택을 따른다 */
export const UsageView: React.FC<UsageViewProps> = ({ selectedMonth, allPeriod = false, yearTotal = false, dayRange = null, onSelectDayRange }) => {
  const [loaded, setLoaded] = useState<Loaded>(null);
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());

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
            <KpiPlaceholder key={l} label={l} message="불러오는 중…" />
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
    const visits = sum(cur.daily, 'visits');
    const pageviews = sum(cur.daily, 'pageviews');
    const seconds = sum(cur.daily, 'seconds');
    const prevVisits = prev ? sum(prev.daily, 'visits') : 0;
    const prevPageviews = prev ? sum(prev.daily, 'pageviews') : 0;
    const prevSeconds = prev ? sum(prev.daily, 'seconds') : 0;
    // 비교 기간이 수집 시작 전이면 비교하지 않는다
    const hasPrev = !!prev && !!prevRange && !!cur.since && cur.since <= prevRange.to;
    const avgSec = visits ? seconds / visits : 0;
    const prevAvgSec = prevVisits ? prevSeconds / prevVisits : 0;
    const activeDays = cur.daily.filter((d) => d.visits > 0).length;
    // 이용 기기 보조 줄 — PC·태블릿·모바일
    const kinds = cur.deviceKinds;
    const kindItems: [string, string][] = kinds
      ? [
          ['PC', `${fmt(kinds.pc)}대`],
          ['태블릿', `${fmt(kinds.tablet)}대`],
          ['모바일', `${fmt(kinds.mobile)}대`],
        ]
      : [];

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
          labels={buckets.map((d) => (monthly ? monthText(d.date) : dayLabel(d.date)))}
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

        <Card name="usage-views" id="usage-views" tableWrap title="화면별 이용" subtitle={`(${label} · 페이지뷰 많은 순)`}>
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
        </Card>

        <Card name="usage-categories" id="usage-categories" tableWrap title="카테고리별 이용" subtitle={`(${label} · 많이 고른 순)`}>
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
                  <Th className="n" tip="선택|카테고리 필터로 고르거나 표에서 카테고리 줄을 펼친 횟수">선택</Th>
                  <Th className="n" tip="필터 체류|카테고리 필터를 그 카테고리로 둔 채 실제로 본 시간 (줄 펼침은 시간을 세지 않음)">필터 체류</Th>
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
                        label={
                          <>
                            {g.category} <Muted small>{g.views.map(viewTitle).join(' · ')}</Muted>
                          </>
                        }
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
              subMessage={`카테고리 효율·키워드 화면의 카테고리 필터와 카테고리 효율 표의 줄 펼침을 셉니다.${cur.categorySince ? '' : ' 카테고리 기록은 배포 후부터 쌓입니다.'}`}
            />
          )}
        </Card>

        <Card name="usage-daily" id="usage-daily" tableWrap title={monthly ? '월별 이용' : '일별 이용'} subtitle={`(${label} · 최근부터)`}>
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
                <tr>
                  <td colSpan={5}>
                    <EmptyState message="이 기간에 기록된 방문이 없습니다." />
                  </td>
                </tr>
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
        </Card>
      </>
    );
  }

  const since = loaded && 'cur' in loaded ? loaded.cur.since : null;

  return (
    <View name="usage" title={TITLE}>
      <ViewHeader title={TITLE} description="직원들이 광고 인사이트를 얼마나 자주, 얼마나 오래 보는지 보여 줍니다." status="live" />
      <ViewNote>
        ※ 방문은 같은 기기(PC·휴대폰)에서 하루(한국 시간)에 여러 번 열어도, 브라우저·시크릿 창이 달라도 1회로 셉니다. 이용 기기는 기간 동안 들어온 기기 대수이고, PC·태블릿·모바일로 나눠 보여 줍니다. 체류시간은 탭이 보이는 동안만 재고, 5분 넘게 조작이 없으면
        뺍니다. 개발 서버(localhost) 접속은 기록하지 않습니다. 기간은 위 기간 선택을 따르고, 진행 중인 달은 전월 같은 날짜까지와 비교합니다.{since && ` 수집 시작 ${since.replace(/-/g, '.')}.`}
        {!USAGE_TRACKING_ON && ' (지금 창은 개발 환경이라 기록되지 않습니다)'}
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
