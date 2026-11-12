import React, { useMemo, useRef, useState } from 'react';
import type { CategoryMap, DashboardData, SiteId, SyncStatus } from '../types/dashboard';
import {
  buildCategoryBarItems,
  catSum,
  cpaRankByCat1,
  fmt,
  fmtWon,
  mLabel,
  prevM,
  LEGACY_ONLY_CATS,
  quoteCountFor,
  sumBy,
  THIS_M,
} from '../utils/format';
import { EXTERNAL_LINKS } from '../utils/constants';
import { CompareLegend } from '../components/common/Legend';
import type { DayPeriod } from '../utils/dayRange';
import type { SameDateCompare } from '../utils/dayData';
import { View } from '../components/common/View';
import { ViewNote } from '../components/common/Note';
import { ViewHeader, SecSrc, type SourceLinkItem } from '../components/common/ViewHeader';
import { KpiCard, KpiDetailItems, KpiPlaceholder, KpiSection } from '../components/charts/KpiCard';
import { CategoryBarChart } from '../components/charts/CategoryBarChart';
import {
  CategoryFilter,
  buildCategoryFilter,
  filterByCategory,
  matchesCategory,
  useCategoryFilterState,
} from '../components/common/CategoryFilter';
import { PeriodNavSlot } from '../components/common/PeriodNav';
import { CpaRankList } from '../components/cat-efficiency/CpaRankList';
import { CatEfficiencyTable } from '../components/cat-efficiency/CatEfficiencyTable';
import { LIST_LIMIT, ShowMoreButton } from '../components/common/MoreButton';
import { Card } from '../components/common/Card';
import { EmptyState } from '../components/common/EmptyState';
import { dotYm, inMonths, monthsUpTo, periodStartsOf, sameMonthsLastYear, yearRangeLabel } from '../utils/allPeriod';
import { useQuoteStats } from '../hooks/useDashboardData';

interface CatEfficiencyViewProps {
  data: DashboardData;
  categoryMap: CategoryMap;
  status: SyncStatus;
  selectedMonth?: string;
  /** 기간 선택이 '전체' */
  allPeriod?: boolean;
  /** 월 선택이 '전체' — selectedMonth 는 그 연도의 마지막 달이다 */
  yearTotal?: boolean;
  /** 일·기간 보기일 때 기간 문구·일수 (월 단위 보기면 없음) */
  period?: DayPeriod;
  /** 진행 중인 달을 전월 같은 날짜와 비교할 때의 기준 */
  sameDate?: SameDateCompare;
}

const CAT_EFF_SOURCES: SourceLinkItem[] = [
  { label: 'Google Ads API', href: EXTERNAL_LINKS.googleAds },
  { label: '네이버 검색광고 API', href: EXTERNAL_LINKS.naverSearchAd },
  { label: '취합 스프레드시트', href: EXTERNAL_LINKS.masterSheet },
  { label: '광고비·클릭·전환 + 고도몰 견적 시트 교차 집계' },
];

/** 행을 month 값별로 나눈다 */
function groupByMonth<T extends { month: string }>(rows: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  rows.forEach((r) => {
    const list = out.get(r.month);
    if (list) list.push(r);
    else out.set(r.month, [r]);
  });
  return out;
}

/** 같은 키로 다시 부르면 처음 계산한 값을 돌려준다 (한 번 렌더하는 동안만 쓴다) */
function memoByKey(f: (k: string) => number): (k: string) => number {
  const cache = new Map<string, number>();
  return (k) => {
    let v = cache.get(k);
    if (v === undefined) {
      v = f(k);
      cache.set(k, v);
    }
    return v;
  };
}

/** 화면 설명 — 아이티켓은 zbyhp·cadkorea·전화문의 견적을 합산하고, 다른 사이트는 그 사이트 견적만 */
const catEffDescription = (site?: SiteId) =>
  `카테고리별 광고비 소진 대비 견적 획득 성과 및 획득단가(CPA) 비교 (견적은 ${site === 'oncore' ? '온코어' : '아이티켓·zbyhp·cadkorea·전화문의 합산'})`;

export const CatEfficiencyView: React.FC<CatEfficiencyViewProps> = ({
  data,
  categoryMap,
  status,
  selectedMonth,
  allPeriod = false,
  yearTotal = false,
  period,
  sameDate,
}) => {
  const catState = useCategoryFilterState();
  const [visibleCount, setVisibleCount] = useState(LIST_LIMIT);
  const prevFilterKey = useRef('');
  // 견적은 아이티켓에 다른 사이트(zbyhp·cadkorea)와 전화문의를 더한 값으로 센다 (2026-11-06 사용자 결정: 모든 견적 지표 합산)
  const quoteRows = useQuoteStats(data).quotes;
  // 달별 견적·광고비 행 — 달마다 전체 행을 다시 거르지 않도록 한 번만 나눠 둔다 (달 안의 행 순서는 원본 그대로)
  const quotesByMonth = useMemo(() => groupByMonth(quoteRows), [quoteRows]);
  const spendByMonth = useMemo(() => groupByMonth(data.spend), [data.spend]);

  if (!data.spend.length) {
    return (
      <View name="cat-efficiency" title="카테고리 효율">
        <ViewHeader
          title="카테고리 효율 분석"
          description={catEffDescription(data.site)}
          status={status}
        />
        <KpiSection id="kpiCatEff">
          <KpiPlaceholder label="카테고리 데이터" message="데이터 연결 필요" />
        </KpiSection>
        <Card name="empty" id="cat-empty">
          <EmptyState message="취합된 데이터가 없습니다." />
        </Card>
      </View>
    );
  }

  const allMonths = [...new Set(data.spend.map((r) => r.month))].sort();
  const curM =
    (selectedMonth && allMonths.includes(selectedMonth) ? selectedMonth : undefined) ||
    selectedMonth ||
    allMonths.filter((m) => m <= THIS_M).pop() ||
    allMonths[allMonths.length - 1];
  const pv = prevM(curM);

  // 기준 기간: 한 달, 연도 합계(1월~마지막 달), 또는 전체 기간. 비교 대상은 전월·전년 같은 달들이고 전체 기간은 없다
  // 이 화면은 광고비와 견적을 맞대는 지표가 중심이라, 전체 기간은 둘 다 있는 달부터만 합산한다
  const cpaFrom = periodStartsOf(data).cpaFrom;
  const efficiencyMonths = [...new Set([...data.spend, ...quoteRows].map((r) => r.month))]
    .filter((mo) => mo && mo >= cpaFrom)
    .sort();
  const curMonths = allPeriod ? efficiencyMonths : yearTotal ? monthsUpTo(curM) : [curM];
  const prevMonths = allPeriod ? [] : yearTotal ? sameMonthsLastYear(curMonths) : [pv];
  const periodLabel = allPeriod ? `${dotYm(cpaFrom)} 이후` : yearTotal ? yearRangeLabel(curM) : period ? period.label : mLabel(curM);
  const prevLabel = yearTotal ? '전년 동기' : period ? period.cmpLabel : sameDate ? sameDate.cmpLabel : mLabel(pv);

  const rowsCur = data.spend.filter(inMonths(curMonths));
  const rowsPrev = data.spend.filter(inMonths(prevMonths));
  const catSpendCur = catSum(categoryMap, rowsCur, (r) => r.cost);
  const catSpendPrev = catSum(categoryMap, rowsPrev, (r) => r.cost);
  const catClk = catSum(categoryMap, rowsCur, (r) => r.clk);
  const catConv = catSum(categoryMap, rowsCur, (r) => r.conv);

  // quoteCountFor 는 한 달 치 기준이라, 여러 달은 달별로 계산해 더한다 (월별 화면의 합과 맞도록)
  const monthlyInputs = curMonths.map((mo) => ({
    rows: quotesByMonth.get(mo) || [],
    spend: allPeriod || yearTotal ? catSum(categoryMap, spendByMonth.get(mo) || [], (r) => r.cost) : catSpendCur,
  }));
  // 카테고리별 견적 수는 정렬 비교·표·차트에서 여러 번 쓰여 한 번만 계산한다
  const qOf = memoByKey((c: string) => sumBy(monthlyInputs, (m) => quoteCountFor(m.rows, c, m.spend)));

  const curQuotes = monthlyInputs.flatMap((m) => m.rows);
  // 견적 시트의 옛 분류(서버·워크스테이션…)는 역매핑(quoteCountFor)으로 처리하므로 allCatKeys에서 제외
  const legacyCatSet = LEGACY_ONLY_CATS;

  const allCatKeys = [
    ...new Set([
      ...Object.keys(catSpendCur),
      ...Object.keys(catSpendPrev),
      ...curQuotes.map((r) => r.category).filter((c): c is string => !!c && !legacyCatSet.has(c)),
    ]),
  ].sort((a, b) => (catSpendCur[b] || 0) - (catSpendCur[a] || 0) || qOf(b) - qOf(a));

  // 1차/2차 카테고리 필터 — 선택하면 표·차트·KPI·합계가 해당 카테고리만으로 다시 계산된다
  const catFilter = buildCategoryFilter(allCatKeys, catState);
  const isFiltered = !!(catFilter.cat1 || catFilter.cat2);
  const catKeys = allCatKeys.filter((k) => matchesCategory(k, catFilter.cat1, catFilter.cat2));

  const totSpend = isFiltered
    ? sumBy(catKeys, (k) => catSpendCur[k] || 0)
    : sumBy(rowsCur, (r) => r.cost);
  const totQuotes = isFiltered
    ? sumBy(catKeys, (k) => qOf(k))
    : sumBy(curQuotes, (r) => r.count);

  const catData = catKeys.map((k) => {
    const cost = catSpendCur[k] || 0;
    const prevCost = catSpendPrev[k] || 0;
    const quotes = qOf(k);
    const clk = catClk[k] || 0;
    const conv = catConv[k] || 0;
    const cpa = quotes > 0 ? cost / quotes : null;
    return {
      k,
      cost,
      prevCost,
      quotes,
      clk,
      conv,
      cpa,
      share: totSpend > 0 ? (cost / totSpend) * 100 : 0,
    };
  });

  const topSpendCat = catData[0];
  const topQuoteCat = catData.filter((c) => c.quotes > 0).sort((a, b) => b.quotes - a.quotes)[0]; // 견적이 없으면 '–'
  const cpaRank = cpaRankByCat1(catData);
  // 최고 효율: 평소에는 목록과 같은 1차 기준, 1차를 고르면 그 안의 2차끼리 비교한다. '기타'는 제품군이 아니라 뺀다
  const bestCpaPool = catFilter.cat1
    ? (() => {
        // 1차 필터를 고른 경우: 2차(YYYY > ZZZ 형태)만 비교한다
        // cost>0·quotes>0 조건을 만족하는 2차가 없으면 집계 CPA를 단일 항목으로 반환 (1차 직접 항목의 편향 방지)
        const asSorted = (pool: typeof catData) =>
          pool
            .filter((c) => c.cost > 0 && c.quotes > 0)
            .map((c) => ({ k: c.k, cpa: c.cost / c.quotes, quotes: c.quotes }))
            .sort((a, b) => a.cpa - b.cpa);
        const sub2 = asSorted(catData.filter((c) => c.k.includes(' > ')));
        if (sub2.length) return sub2;
        const aggQ = sumBy(catData, (c) => c.quotes);
        const aggC = sumBy(catData, (c) => c.cost);
        return aggQ > 0 ? [{ k: catFilter.cat1, cpa: aggC / aggQ, quotes: aggQ }] : [];
      })()
    : cpaRank;
  // 1차 필터 활성 시에는 집계 항목 자체가 KPI이므로 '기타' 제외를 적용하지 않는다
  const bestCpaCat = catFilter.cat1
    ? bestCpaPool[0]
    : bestCpaPool.find((c) => c.k.split(' > ').pop() !== '기타');
  const avgCpa = totQuotes > 0 ? totSpend / totQuotes : 0;

  // KPI 비교 기준: 월 선택은 전월, 연도 전체는 전년 동기. 전체 기간은 비교하지 않는다
  const cmpLabel = allPeriod ? undefined : yearTotal ? '전년 동기' : period ? period.cmpLabel : sameDate ? sameDate.cmpLabel : '전월';
  const prevInputs = prevMonths.map((mo) => ({
    rows: quotesByMonth.get(mo) || [],
    spend: catSum(categoryMap, spendByMonth.get(mo) || [], (r) => r.cost),
  }));
  const qPrevOf = memoByKey((c: string) => sumBy(prevInputs, (m) => quoteCountFor(m.rows, c, m.spend)));
  const cpaOf = (cost: number, quotes: number) => (quotes > 0 ? cost / quotes : null);
  // 최고 효율은 1차 합산일 수 있어 그 아래 2차까지 더해 같은 기준으로 비교한다
  const bestPrevKeys = bestCpaCat ? allCatKeys.filter((k) => k === bestCpaCat.k || k.startsWith(`${bestCpaCat.k} > `)) : [];
  const bestPrevCpa = cpaOf(sumBy(bestPrevKeys, (k) => catSpendPrev[k] || 0), sumBy(bestPrevKeys, qPrevOf));
  const totSpendPrev = isFiltered ? sumBy(catKeys, (k) => catSpendPrev[k] || 0) : sumBy(rowsPrev, (r) => r.cost);
  const totQuotesPrev = isFiltered ? sumBy(catKeys, qPrevOf) : sumBy(prevInputs.flatMap((m) => m.rows), (r) => r.count);
  const sharePct = (n: number, total: number) => `${(total > 0 ? (n / total) * 100 : 0).toFixed(1)}%`;
  const noCompareSub = allPeriod ? periodLabel : undefined;

  const fullList = buildCategoryBarItems(
    filterByCategory(catSpendCur, catFilter.cat1, catFilter.cat2),
    filterByCategory(catSpendPrev, catFilter.cat1, catFilter.cat2),
    qOf,
    true,
    Infinity
  );

  // 필터·월 변경 시 visibleCount 리셋
  const filterKey = `${allPeriod ? 'ALL' : yearTotal ? `Y${curM}` : curM}|${catFilter.cat1}|${catFilter.cat2}`;
  if (prevFilterKey.current !== filterKey) {
    prevFilterKey.current = filterKey;
    setVisibleCount(LIST_LIMIT);
  }
  const list = fullList.slice(0, visibleCount);

  const totClk = isFiltered ? sumBy(catKeys, (k) => catClk[k] || 0) : sumBy(rowsCur, (r) => r.clk);
  const totConv = isFiltered ? sumBy(catKeys, (k) => catConv[k] || 0) : sumBy(rowsCur, (r) => r.conv);

  return (
    <View name="cat-efficiency" title="카테고리 효율">
      <ViewHeader
        title="카테고리 효율 분석"
        description={catEffDescription(data.site)}
        status={status}
      />

      <PeriodNavSlot active={!!catFilter.cat1} onReset={() => catState.setCat1('')}>
        <CategoryFilter filter={catFilter} />
      </PeriodNavSlot>

      {allPeriod && (
        <ViewNote>
          ※ 전체 기간은 광고비·견적이 모두 있는 {dotYm(cpaFrom)} 이후만 합산해, 종합 요약의 누적 광고비보다 적습니다.
        </ViewNote>
      )}

      {yearTotal && curMonths[0] < cpaFrom && (
        <ViewNote>
          ※ {dotYm(cpaFrom)} 이전은 광고비·견적이 모두 갖춰지지 않아 CPA가 실제와 다를 수 있습니다.
        </ViewNote>
      )}

      <KpiSection id="kpiCatEff">
        <KpiCard
          label="최다 집행 카테고리"
          value={topSpendCat?.k || '–'}
          cur={topSpendCat?.cost}
          prev={topSpendCat?.prevCost}
          cmpLabel={cmpLabel}
          sub={noCompareSub}
          detail={topSpendCat ? <KpiDetailItems items={[['광고비', fmtWon(topSpendCat.cost)], ['비중', sharePct(topSpendCat.cost, totSpend)]]} /> : <KpiDetailItems items={[['광고비', '0원'], ['비중', '0%']]} />}
        />
        <KpiCard
          label="최다 견적 카테고리"
          value={topQuoteCat?.k || '–'}
          cur={topQuoteCat?.quotes}
          prev={topQuoteCat ? qPrevOf(topQuoteCat.k) : null}
          cmpLabel={cmpLabel}
          sub={noCompareSub}
          detail={topQuoteCat ? <KpiDetailItems items={[['견적', `${fmt(topQuoteCat.quotes)}건`], ['비중', sharePct(topQuoteCat.quotes, totQuotes)]]} /> : <KpiDetailItems items={[['견적', '0건'], ['비중', '0%']]} />}
        />
        <KpiCard
          label="최고 효율 (최저 CPA)"
          value={bestCpaCat?.k || '–'}
          cur={bestCpaCat?.cpa}
          prev={bestPrevCpa}
          cmpLabel={cmpLabel}
          sub={noCompareSub}
          detail={bestCpaCat ? <KpiDetailItems items={[['건당', `${fmt(bestCpaCat.cpa)}원`], ['견적', `${fmt(bestCpaCat.quotes)}건`]]} /> : <KpiDetailItems items={[['건당', '0원'], ['견적', '0건']]} />}
        />
        <KpiCard
          label={`${periodLabel} 전체 평균 CPA`}
          value={avgCpa ? `${fmt(avgCpa)}원` : '–'}
          cur={avgCpa || null}
          prev={cpaOf(totSpendPrev, totQuotesPrev)}
          cmpLabel={cmpLabel}
          sub={noCompareSub}
          detail={<KpiDetailItems items={[['광고비', fmtWon(totSpend)], ['견적', `${fmt(totQuotes)}건`]]} />}
        />
      </KpiSection>

      <div className="grid">
        <Card
          name="cat-spend"
          id="cat-spend"
          titleId="ttCatEff"
          title="카테고리별 광고비 소진 비교"
          subtitle={allPeriod ? `(${periodLabel})` : `(${periodLabel} vs ${prevLabel})`}
        >
          <CategoryBarChart
            id="chCatEff"
            list={list}
            hidePrev={allPeriod}
            curLabel={yearTotal ? periodLabel : undefined}
            totalCur={sumBy(fullList, (c) => c.cur)}
            totalPrev={sumBy(fullList, (c) => c.prev)}
            prevLabel={yearTotal || period || sameDate ? prevLabel : undefined}
          />
          <CompareLegend
            unit="만원"
            curLabel={allPeriod || yearTotal || period ? periodLabel : '기준월'}
            prevLabel={allPeriod ? undefined : yearTotal || period || sameDate ? prevLabel : '전월'}
          />
          <ShowMoreButton
            total={fullList.length}
            expanded={visibleCount >= fullList.length}
            onToggle={() => setVisibleCount((v) => (v >= fullList.length ? LIST_LIMIT : fullList.length))}
          />
        </Card>
        <CpaRankList sortedCats={cpaRank} periodLabel={periodLabel} />
      </div>

      <CatEfficiencyTable
        catData={catData}
        periodLabel={periodLabel}
        totSpend={totSpend}
        totClk={totClk}
        totConv={totConv}
        totQuotes={totQuotes}
        avgCpa={avgCpa}
      />
      <SecSrc sources={CAT_EFF_SOURCES} />
    </View>
  );
};
