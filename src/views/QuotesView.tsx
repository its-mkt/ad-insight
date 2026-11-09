import React, { useMemo } from 'react';
import type { DayPeriod } from '../utils/dayRange';
import type { DashboardData, QuoteRawRow, SyncStatus } from '../types/dashboard';
import {
  buildSourceShareData,
  fmt,
  fmtWon,
  mLabel,
  prevM,
  cat1Of,
  quoteSeriesColor,
  quoteCat1Order,
  quoteChartCats,
  sumBy,
  ym,
} from '../utils/format';
import { EXTERNAL_LINKS } from '../utils/constants';
import { quoteStatsOf } from '../hooks/useDashboardData';
import { ViewHeader, SecSrc, type SourceLinkItem } from '../components/common/ViewHeader';
import { KpiCard, KpiDetailItems, KpiSection } from '../components/charts/KpiCard';
import { MultiChart } from '../components/charts/MultiChart';
import { SourceBarChart } from '../components/charts/SourceBarChart';
import { MonthlyQuotesTable } from '../components/quotes/MonthlyQuotesTable';
import { Card } from '../components/common/Card';
import { EmptyState } from '../components/common/EmptyState';
import { dotYm, inMonths, periodStartsOf, sameMonthsLastYear, yearsOf } from '../utils/allPeriod';

interface QuotesViewProps {
  data: DashboardData;
  status: SyncStatus;
  /** 실데이터를 받는 중 */
  isSyncing?: boolean;
  selectedMonth?: string;
  /** 기간 선택이 '전체' */
  allPeriod?: boolean;
  /** 월 선택이 '전체' — selectedMonth 는 그 연도의 마지막 달이다 */
  yearTotal?: boolean;
  /** 일·기간 보기에서도 월별 추이 차트·표는 이 원본 월 데이터로 그린다 */
  monthly?: DashboardData;
  /** 일·기간 보기일 때 기간 문구·일수 (월 단위 보기면 없음) */
  period?: DayPeriod;
}

const QUOTES_SOURCES: SourceLinkItem[] = [
  { label: '아이티켓 고도몰 견적 목록', href: EXTERNAL_LINKS.itketEstimateList },
  { label: '취합 스프레드시트', href: EXTERNAL_LINKS.masterSheet },
  { label: '견적 접수 원본 시트', href: EXTERNAL_LINKS.quotesRawSheet },
  { label: 'collectQuotes · collectQuoteStatsExtra · 1시간 자동 동기화' },
];

export const QuotesView: React.FC<QuotesViewProps> = ({ data, status, selectedMonth, allPeriod = false, yearTotal = false, monthly, period }) => {
  // 건수·CPA 모두 아이티켓에 다른 사이트(zbyhp·cadkorea)·전화문의를 더해 센다 (2026-11-06 사용자 결정)
  const { quotes, quotesRaw } = useMemo(() => quoteStatsOf(data), [data.quotes, data.quotesRaw, data.quotesExtra]);
  const trend = useMemo(() => (monthly ? quoteStatsOf(monthly) : null), [monthly]);
  const trendQuotes = trend?.quotes ?? quotes;
  const trendRaw = trend?.quotesRaw ?? quotesRaw;

  if (!quotes.length) {
    return (
      <div className="view on" data-view="quotes" data-title="견적 상세">
        <ViewHeader
          title="ITKET 견적 상세 현황"
          description="아이티켓·zbyhp·cadkorea 견적과 전화문의의 월별·카테고리별 유입 추이"
          status={status}
        />
        <KpiSection id="kpiQuotes">
          <div className="kpi">
            <div className="l">견적 데이터</div>
            <div className="v">–</div>
            <div className="d flat">데이터 연결 필요</div>
          </div>
        </KpiSection>
        <Card name="empty" id="quotes-empty">
          <EmptyState message="취합된 실제 견적 데이터가 없습니다. 상단 [연결 설정] 버튼에서 데이터 연결을 완료해 주세요." />
        </Card>
      </div>
    );
  }

  const allAvailable = quotes.map((r) => r.month).filter(Boolean).sort();
  const fallbackLast = quotes.reduce((m, r) => (r.month > m ? r.month : m), '');
  const last = allPeriod ? fallbackLast :
    (selectedMonth && allAvailable.includes(selectedMonth) ? selectedMonth : undefined) ||
    selectedMonth ||
    fallbackLast;
  const years = yearsOf(allAvailable);
  const yr = allPeriod ? '' : last.slice(0, 4);
  const mm = +last.slice(5, 7);
  const curM = last.slice(0, 7);
  const pv = prevM(curM);
  // 전체 기간이면 달 대신 연도 단위로 본다
  const labels = allPeriod ? years.map((y) => `${y}년`) : Array.from({ length: mm }, (_, i) => `${i + 1}월`);
  const axisKeys = allPeriod ? years : Array.from({ length: mm }, (_, i) => ym(yr, i + 1));
  const months = axisKeys;
  const allMonths = allPeriod ? years : Array.from({ length: 12 }, (_, i) => ym(yr, i + 1));
  const firstM = allAvailable[0] || '';

  const allTotal = sumBy(quotes, (r) => r.count);

  const totM = (mo: string) =>
    quotes.filter((r) => r.month === mo).reduce((a, r) => a + r.count, 0);
  const curTot = totM(curM);
  const pvTot = totM(pv);
  const ytdQuotes = sumBy(
    quotes.filter((r) => r.month >= ym(yr, 1) && r.month <= curM),
    (r) => r.count
  );



  const starts = periodStartsOf(data);
  const cpaMonths = yr ? Array.from({ length: mm }, (_, i) => ym(yr, i + 1)) : [];
  const lastYrMonths = sameMonthsLastYear(cpaMonths);
  const cpaIn = (list: string[]) => {
    const valid = list.filter((mo) => mo >= starts.cpaFrom);
    const q = sumBy(quotes.filter(inMonths(valid)), (r) => r.count);
    return q > 0 ? sumBy(data.spend.filter(inMonths(valid)), (r) => r.cost) / q : 0;
  };
  const ytdCpa = cpaIn(cpaMonths);
  const lastYrCpa = cpaIn(lastYrMonths);
  const cpaSpend = sumBy(data.spend.filter((r) => r.month >= starts.cpaFrom), (r) => r.cost);
  const cpaQuotesCount = sumBy(quotes.filter((r) => r.month >= starts.cpaFrom), (r) => r.count);
  const allCpa = cpaQuotesCount > 0 ? cpaSpend / cpaQuotesCount : 0;

  /** 최다 접수 담당자 카드 — 미지정은 순위·평균에서 빼고, 하단 줄에는 담당 현황만 보여 준다 */
  const repCard = (label: string, rows: QuoteRawRow[], prevRows: QuoteRawRow[] | null = null, withAverage = true) => {
    const counts = new Map<string, number>();
    rows.forEach((r) => {
      if (r.salesRep) counts.set(r.salesRep, (counts.get(r.salesRep) || 0) + 1);
    });
    const ranked = [...counts.entries()].sort(([a, x], [b, y]) => y - x || a.localeCompare(b, 'ko'));
    const top = ranked[0];
    const assigned = sumBy(ranked, ([, n]) => n);
    const average = assigned / ranked.length;
    const unassigned = rows.length - assigned;
    const prevTopCount = prevRows && top
      ? prevRows.filter((r) => r.salesRep === top[0]).length || null
      : null;
    const items: [string, string][] = [
      ...(top ? ([['최다 접수', `${top[1]}건`]] as [string, string][]) : []),
      ...(withAverage ? ([['1인 평균', `${average < 10 ? average.toFixed(1) : fmt(average)}건`]] as [string, string][]) : []),
      ...(unassigned ? ([['미지정', `${fmt(unassigned)}건`]] as [string, string][]) : []),
    ];
    return (
      <KpiCard
        label={label}
        value={top?.[0] || '–'}
        cur={top?.[1] ?? null}
        prev={prevTopCount}
        cmpLabel={prevRows ? cmp : undefined}
        detail={top ? <KpiDetailItems items={items} /> : null}
      />
    );
  };

  const hasMultiSite = quotesRaw.some((r) => r.site);
  const siteBreak = (rows: QuoteRawRow[]): React.ReactNode => {
    if (!hasMultiSite || !rows.length) return null;
    const counts: Record<string, number> = {};
    rows.forEach((r) => {
      const k = r.inquiryType ? '전화/톡플러스' : !r.site ? 'itket' : r.site === 'zbyhp' ? 'zbyhp' : r.site === 'cadkorea' ? 'cadkorea' : 'itket';
      counts[k] = (counts[k] || 0) + 1;
    });
    const parts = ['itket', 'zbyhp', 'cadkorea', '전화/톡플러스'].filter((k) => k === 'cadkorea' || k === 'zbyhp' || counts[k]);
    if (parts.length <= 1) return null;
    return <KpiDetailItems items={parts.map((k): [string, number] => [k, counts[k] ?? 0])} />;
  };
  const curSiteDetail = siteBreak(quotesRaw.filter((r) => r.date?.slice(0, 7) === curM));
  const allSiteDetail = siteBreak(quotesRaw);

  const { items: srcItems } = buildSourceShareData(
    quotesRaw,
    period ? curM : yr,
    quotes,
    allPeriod ? undefined : curM
  );

  // 카테고리는 분류표 1차 기준 (2차는 1차에 합산). 최다 카테고리는 '기타'를 빼고 고른다
  // 선택한 달까지만 본다 — 비중의 분모인 누적 견적(1~선택 월)과 기간을 맞춘다
  const yrQuotes = trendQuotes.filter((r) => r.month.startsWith(yr) && r.month <= curM);
  const topCatKey = quoteCat1Order(yrQuotes).find((c) => c !== '기타');
  const topCat = topCatKey
    ? { k: topCatKey, c: sumBy(yrQuotes.filter((r) => cat1Of(r.category) === topCatKey), (r) => r.count) }
    : undefined;

  // 2~3위 견적 카테고리 (기타 제외)
  const catRunnerUpItems = quoteCat1Order(yrQuotes)
    .filter((c) => c !== '기타' && c !== topCatKey)
    .slice(0, 2)
    .map((k): [string, number] => [k, sumBy(yrQuotes.filter((r) => cat1Of(r.category) === k), (r) => r.count)]);
  const catRunnerUps = catRunnerUpItems.length ? <KpiDetailItems items={catRunnerUpItems} /> : null;

  // KPI 카드 범위: 월 선택 → 당월, 연도 전체 → 연간 (차트는 항상 yrQuotes 사용)
  const kpiQuotes = yearTotal
    ? quotes.filter((r) => r.month.startsWith(yr) && r.month <= curM)
    : quotes.filter((r) => r.month === curM);
  const kpiLabel = yearTotal ? `${yr}년` : period ? period.label : mLabel(curM);
  const cmp = period ? period.cmpLabel : '전월';
  const kpiTotal = sumBy(kpiQuotes, (r) => r.count);

  const kpiTopCatKey = quoteCat1Order(kpiQuotes).find((c) => c !== '기타');
  const kpiTopCat = kpiTopCatKey
    ? { k: kpiTopCatKey, c: sumBy(kpiQuotes.filter((r) => cat1Of(r.category) === kpiTopCatKey), (r) => r.count) }
    : undefined;
  const kpiCatRunnerUpItems = quoteCat1Order(kpiQuotes)
    .filter((c) => c !== '기타' && c !== kpiTopCatKey)
    .slice(0, 2)
    .map((k): [string, number] => [k, sumBy(kpiQuotes.filter((r) => cat1Of(r.category) === k), (r) => r.count)]);
  const kpiCatRunnerUps = kpiCatRunnerUpItems.length ? <KpiDetailItems items={kpiCatRunnerUpItems} /> : null;
  const pvTopCatCount = !yearTotal && kpiTopCatKey
    ? sumBy(quotes.filter((r) => r.month === pv && cat1Of(r.category) === kpiTopCatKey), (r) => r.count)
    : 0;
  const catDelta = !yearTotal && kpiTopCat ? kpiTopCat.c - pvTopCatCount : null;
  const catDeltaNode = catDelta !== null && catDelta !== 0
    ? <span style={{ color: catDelta > 0 ? 'var(--up)' : 'var(--down)' }}>{' · '}{catDelta > 0 ? '▲' : '▼'} {fmt(Math.abs(catDelta))}건 {cmp}</span>
    : null;

  // KPI CPA: 월 선택 → 당월 / 전월 비교, 연도 전체 → 연간 / 전년 동기 비교
  const curSpendTot = sumBy(data.spend.filter((r) => r.month === curM), (r) => r.cost);
  const curAdQuotes = sumBy(quotes.filter((r) => r.month === curM), (r) => r.count);
  const pvSpendTot = sumBy(data.spend.filter((r) => r.month === pv), (r) => r.cost);
  const pvAdQuotes = sumBy(quotes.filter((r) => r.month === pv), (r) => r.count);
  const curCpa = curM >= starts.cpaFrom && curAdQuotes > 0 ? curSpendTot / curAdQuotes : 0;
  const pvCpa = pv >= starts.cpaFrom && pvAdQuotes > 0 ? pvSpendTot / pvAdQuotes : 0;
  const kpiCpa = yearTotal ? ytdCpa : curCpa;
  const kpiPrevCpa = yearTotal ? (lastYrMonths[0] >= starts.cpaFrom ? lastYrCpa : null) : (pvCpa || null);
  const kpiCpaCompLabel = yearTotal ? '전년 동기' : cmp;
  const ytdValidMonths = cpaMonths.filter((mo) => mo >= starts.cpaFrom);
  const kpiSpend = yearTotal
    ? sumBy(data.spend.filter(inMonths(ytdValidMonths)), (r) => r.cost)
    : curM >= starts.cpaFrom ? curSpendTot : 0;
  const kpiAdQuotes = yearTotal
    ? sumBy(quotes.filter(inMonths(ytdValidMonths)), (r) => r.count)
    : curM >= starts.cpaFrom ? curAdQuotes : 0;
  const kpiCpaDetail = kpiCpa ? (
    <>
      <p>광고비 <b>{fmtWon(kpiSpend)}</b></p>
      <i>|</i>
      <p>견적 <b>{fmt(kpiAdQuotes)}건</b></p>
    </>
  ) : null;

  // 추이 차트: 건수 상위 6개 1차 카테고리 + 그 외
  const chartCats = quoteChartCats(yrQuotes);
  const series = chartCats.keys
    .map((k, ci) => ({
      k,
      c: quoteSeriesColor(k, ci),
      v: axisKeys.map((key) =>
        sumBy(
          yrQuotes.filter((r) => r.month.startsWith(key) && chartCats.keyOf(r.category) === k),
          (r) => r.count
        )
      ),
    }))
    .filter((s) => s.v.some((x) => x));

  return (
    <div className="view on" data-view="quotes" data-title="견적 상세">
      <ViewHeader
        title="ITKET 견적 상세 현황"
        description="아이티켓·zbyhp·cadkorea 견적과 전화문의의 월별·카테고리별 유입 추이"
        status={status}
      />

      {allPeriod && (
        <p className="leg-note quote-src-note">
          ※ 전체 기간 합산입니다. 견적 데이터는 {dotYm(firstM)}부터 있고, 유입 매체는 2026년 10월부터 추적합니다.
        </p>
      )}

      <KpiSection id="kpiQuotes">
        {allPeriod ? (
          <>
            <KpiCard label="전체 누적 견적" value={`${fmt(allTotal)}건`} sub={`${dotYm(firstM)} ~ ${dotYm(curM)}`} detail={allSiteDetail} />
            <KpiCard to="cat-efficiency"
              label={<>견적당 광고비 (CPA)</>}
              value={allCpa ? `${fmt(allCpa)}원` : '–'}
              sub={`${dotYm(starts.cpaFrom)} 이후 기준`}
              detail={allCpa ? <><p>광고비 <b>{fmtWon(cpaSpend)}</b></p><i>|</i><p>견적 <b>{fmt(cpaQuotesCount)}건</b></p></> : null}
            />
            {repCard('전체 최다 접수 담당자', quotesRaw, null, false)}
            <KpiCard
              label="전체 최다 견적 카테고리"
              value={topCat?.k || '–'}
              sub={`${fmt(topCat?.c || 0)}건 (${allTotal > 0 ? (((topCat?.c || 0) / allTotal) * 100).toFixed(1) : 0}%)`}
              detail={catRunnerUps}
            />
          </>
        ) : (
          <>
        {!yearTotal && (
          <KpiCard
            label={`${kpiLabel} 총 견적`}
            value={`${fmt(curTot)}건`}
            cur={curTot}
            prev={pvTot}
            cmpLabel={cmp}
            detail={curSiteDetail}
          />
        )}
        {yearTotal && (
          <KpiCard
            label={<>{yr}년 누적 견적 (1~{mm}월)</>}
            value={`${fmt(ytdQuotes)}건`}
            cur={ytdQuotes}
            prev={sumBy(quotes.filter((r) => r.month >= ym(+yr - 1, 1) && r.month <= ym(+yr - 1, mm)), (r) => r.count)}
            cmpLabel="전년 동기"
            detail={siteBreak(quotesRaw.filter((r) => r.date?.slice(0, 4) === yr))}
          />
        )}
        <KpiCard to="cat-efficiency"
          label={<>{kpiLabel} 견적당 광고비 (CPA)</>}
          value={kpiCpa ? `${fmt(kpiCpa)}원` : '–'}
          cur={kpiCpa || null}
          prev={kpiPrevCpa}
          cmpLabel={kpiCpaCompLabel}
          detail={kpiCpaDetail}
        />
        {repCard(
          `${kpiLabel} 최다 접수 담당자`,
          quotesRaw.filter((r) => {
            const mo = r.date?.slice(0, 7) ?? '';
            return yearTotal ? mo.startsWith(yr) && mo <= curM : mo === curM;
          }),
          yearTotal ? null : quotesRaw.filter((r) => r.date?.slice(0, 7) === pv),
        )}
        <KpiCard
          label={`${kpiLabel} 최다 견적 카테고리`}
          value={kpiTopCat?.k || '–'}
          cur={kpiTopCat?.c ?? null}
          prev={pvTopCatCount || null}
          sub={<>{fmt(kpiTopCat?.c || 0)}건 ({kpiTotal > 0 ? (((kpiTopCat?.c || 0) / kpiTotal) * 100).toFixed(1) : 0}%){catDeltaNode}</>}
          detail={kpiCatRunnerUps}
        />
          </>
        )}
      </KpiSection>

      <div className="grid grid-2-1">
        <MultiChart
          id="chQuote"
          title={allPeriod ? '연도별 견적 접수 수' : '월별 견적 접수 수'}
          labels={labels}
          series={series}
          unit="건"
        />
        <Card name="quotes-src" id="quotes-src" title="유입 매체 비중">
          <SourceBarChart
            id="chSrc"
            items={srcItems}
            emptyMessage="취합된 실제 유입 매체 데이터가 없습니다."
          />
        </Card>
      </div>

      <MonthlyQuotesTable
        quotes={trendQuotes}
        quotesRaw={trendRaw}
        yr={yr}
        curM={curM}
        months={months}
        allMonths={allMonths}
        allPeriod={allPeriod}
        yearTotal={yearTotal}
      />
      <SecSrc sources={QUOTES_SOURCES} />
    </div>
  );
};
