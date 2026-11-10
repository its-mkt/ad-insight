import React, { useMemo, useState } from 'react';
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
import { inDayRange, type DayPeriod } from '../utils/dayRange';
import type { SameDateCompare } from '../utils/dayData';
import { QuoteListTable } from '../components/quotes/QuoteListTable';
import { originGroupCounts, originOf } from '../utils/quoteOrigin';
import { TrendTable } from '../components/quotes/TrendTable';
import { SourceShareTable } from '../components/quotes/SourceShareTable';
import { SegmentedControl } from '../components/common/SegmentedControl';
import { View } from '../components/common/View';
import { ViewNote } from '../components/common/Note';
import { ViewHeader, SecSrc, type SourceLinkItem } from '../components/common/ViewHeader';
import { KpiCard, KpiDetailItems, KpiPlaceholder, KpiSection, QuoteSalesValue } from '../components/charts/KpiCard';
import { GODOMALL_ORDERS, salesInMonths, salesInRange } from '../data/godomallOrders';
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
  /** 진행 중인 달을 전월 같은 날짜와 비교할 때의 기준 */
  sameDate?: SameDateCompare;
}

const QUOTES_SOURCES: SourceLinkItem[] = [
  { label: '아이티켓 고도몰 견적 목록', href: EXTERNAL_LINKS.itketEstimateList },
  { label: '취합 스프레드시트', href: EXTERNAL_LINKS.masterSheet },
  { label: '견적 접수 원본 시트', href: EXTERNAL_LINKS.quotesRawSheet },
  { label: '1시간 자동 동기화' },
];

const ORIGIN_COLORS: Record<string, string> = {
  itket: '--c-it',
  zbyhp: '--c-n',
  cadkorea: '--c-m',
  전화: '--c-g',
  톡플러스: '--c-ka',
};

export const QuotesView: React.FC<QuotesViewProps> = ({ data, status, selectedMonth, allPeriod = false, yearTotal = false, monthly, period, sameDate }) => {
  // 건수·CPA 모두 아이티켓에 다른 사이트(zbyhp·cadkorea)·전화문의를 더해 센다 (2026-11-06 사용자 결정)
  const { quotes, quotesRaw } = useMemo(() => quoteStatsOf(data), [data.quotes, data.quotesRaw, data.quotesExtra]);
  const trend = useMemo(() => (monthly ? quoteStatsOf(monthly) : null), [monthly]);
  const [mode, setMode] = useState<'chart' | 'table'>('chart');
  const trendQuotes = trend?.quotes ?? quotes;
  const trendRaw = trend?.quotesRaw ?? quotesRaw;

  if (!quotes.length) {
    return (
      <View name="quotes" title="견적 상세">
        <ViewHeader
          title="ITKET 견적 상세 현황"
          description="아이티켓·zbyhp·cadkorea 견적과 전화문의의 월별·카테고리별 유입 추이"
          status={status}
        />
        <KpiSection id="kpiQuotes">
          <KpiPlaceholder label="견적 데이터" message="데이터 연결 필요" />
        </KpiSection>
        <Card name="empty" id="quotes-empty">
          <EmptyState message="취합된 실제 견적 데이터가 없습니다. 상단 [연결 설정] 버튼에서 데이터 연결을 완료해 주세요." />
        </Card>
      </View>
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
  // 견적 카드에 함께 보여 줄 고도몰 판매 건수 — 일·기간 보기는 그 기간, 전체는 견적과 같은 시작 달부터
  const curSales = period ? salesInRange(period.range.from, period.range.to) : salesInMonths([curM]);
  const ytdSales = salesInMonths(Array.from({ length: mm }, (_, i) => ym(yr, i + 1)));
  const allSales = salesInMonths(Object.keys(GODOMALL_ORDERS).filter((mo) => mo >= firstM && mo <= curM));



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
        detail={top ? <KpiDetailItems items={items} /> : <KpiDetailItems items={[['최다 접수', '0건']]} />}
      />
    );
  };

  const siteBreak = (rows: QuoteRawRow[]): React.ReactNode => <KpiDetailItems items={originGroupCounts(rows)} />;
  const curSiteDetail = siteBreak(quotesRaw.filter((r) => r.date?.slice(0, 7) === curM));
  const allSiteDetail = siteBreak(quotesRaw);

  const { items: srcItems } = buildSourceShareData(
    quotesRaw,
    allPeriod || yearTotal ? yr : curM, // 월·일 기간을 고르면 그 달, 연도 합계·전체 기간이면 누적
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
  const catRunnerUps = catRunnerUpItems.length ? <KpiDetailItems items={catRunnerUpItems} /> : <KpiDetailItems items={[['다른 카테고리', '0건']]} />;

  // KPI 카드 범위: 월 선택 → 당월, 연도 전체 → 연간 (차트는 항상 yrQuotes 사용)
  const kpiQuotes = yearTotal
    ? quotes.filter((r) => r.month.startsWith(yr) && r.month <= curM)
    : quotes.filter((r) => r.month === curM);
  const kpiLabel = yearTotal ? `${yr}년` : period ? period.label : mLabel(curM);
  const cmp = period ? period.cmpLabel : sameDate ? sameDate.cmpLabel : '전월';
  const kpiTotal = sumBy(kpiQuotes, (r) => r.count);

  const kpiTopCatKey = quoteCat1Order(kpiQuotes).find((c) => c !== '기타');
  const kpiTopCat = kpiTopCatKey
    ? { k: kpiTopCatKey, c: sumBy(kpiQuotes.filter((r) => cat1Of(r.category) === kpiTopCatKey), (r) => r.count) }
    : undefined;
  const kpiCatRunnerUpItems = quoteCat1Order(kpiQuotes)
    .filter((c) => c !== '기타' && c !== kpiTopCatKey)
    .slice(0, 2)
    .map((k): [string, number] => [k, sumBy(kpiQuotes.filter((r) => cat1Of(r.category) === k), (r) => r.count)]);
  const kpiCatRunnerUps = kpiCatRunnerUpItems.length ? <KpiDetailItems items={kpiCatRunnerUpItems} /> : <KpiDetailItems items={[['다른 카테고리', '0건']]} />;
  const pvTopCatCount = !yearTotal && kpiTopCatKey
    ? sumBy(quotes.filter((r) => r.month === pv && cat1Of(r.category) === kpiTopCatKey), (r) => r.count)
    : 0;
  const catDelta = !yearTotal && kpiTopCat ? kpiTopCat.c - pvTopCatCount : null;
  const catDeltaNode = catDelta !== null && catDelta !== 0
    ? <span className={`s-delta ${catDelta > 0 ? 'up' : 'down'}`}>{' · '}{catDelta > 0 ? '▲' : '▼'} {fmt(Math.abs(catDelta))}건 {cmp}</span>
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
  const kpiCpaDetail = (
    <>
      <p>광고비 <b>{fmtWon(kpiSpend)}</b></p>
      <i>|</i>
      <p>견적 <b>{fmt(kpiAdQuotes)}건</b></p>
    </>
  );

  // 접수 목록 — 기간 보기에서는 날짜를 옮기지 않은 원본(trendRaw)에서 실제 날짜로 고른다
  const listRows = trendRaw.filter((r) => {
    if (period) return inDayRange(r.date, period.range);
    if (allPeriod) return true;
    const mo = r.date?.slice(0, 7) ?? '';
    return yearTotal ? mo.startsWith(yr) && mo <= curM : mo === curM;
  });
  const listPeriod = period ? period.label : allPeriod ? '전체 기간' : kpiLabel;
  // 접수처 비중 — 아래 접수 목록과 같은 기간·같은 행으로 센다. 전화문의 시트 건은 시트의 경로(전화·톡플러스·메일)로 나눈다
  // 주요 접수처는 건수가 0이어도 남겨 어디가 비었는지 보이게 한다
  const originItems = [...new Set(['itket', 'zbyhp', 'cadkorea', '전화', '톡플러스', ...listRows.map(originOf)])]
    .map((k) => {
      const count = listRows.filter((r) => originOf(r) === k).length;
      return { k, c: ORIGIN_COLORS[k] || '--c-etc', count, v: listRows.length ? Math.round((count / listRows.length) * 1000) / 10 : 0 };
    })
    .sort((a, b) => b.count - a.count);
  const showTrendChart = allPeriod || yearTotal;
  const trendTitle = allPeriod ? '연도별 견적 접수 수' : '월별 견적 접수 수';

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

  // 추이 표: 차트와 달리 '그 외'로 묶지 않고 1차 카테고리를 모두 펼친다
  const trendTableSeries = quoteCat1Order(yrQuotes)
    .map((k) => ({
      k,
      c: '--acc',
      v: axisKeys.map((key) =>
        sumBy(
          yrQuotes.filter((r) => r.month.startsWith(key) && cat1Of(r.category || '기타') === k),
          (r) => r.count
        )
      ),
    }))
    .filter((s) => s.v.some((x) => x));

  return (
    <View name="quotes" title="견적 상세">
      <ViewHeader
        title="ITKET 견적 상세 현황"
        description="아이티켓·zbyhp·cadkorea 견적과 전화문의의 월별·카테고리별 유입 추이"
        status={status}
      />

      {allPeriod && (
        <ViewNote>
          ※ 전체 기간 합산. 견적은 {dotYm(firstM)}부터, 유입 매체는 2026년 10월부터 추적합니다.
        </ViewNote>
      )}

      <KpiSection id="kpiQuotes">
        {allPeriod ? (
          <>
            <KpiCard label="전체 누적 견적/판매" value={<QuoteSalesValue quotes={allTotal} sales={allSales} />} sub={`${dotYm(firstM)} ~ ${dotYm(curM)}`} detail={allSiteDetail} />
            <KpiCard to="cat-efficiency"
              label={<>견적당 광고비 (CPA)</>}
              value={allCpa ? `${fmt(allCpa)}원` : '–'}
              sub={`${dotYm(starts.cpaFrom)} 이후 기준`}
              detail={<><p>광고비 <b>{fmtWon(cpaSpend)}</b></p><i>|</i><p>견적 <b>{fmt(cpaQuotesCount)}건</b></p></>}
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
            label={`${kpiLabel} 총 견적/판매`}
            value={<QuoteSalesValue quotes={curTot} sales={curSales} />}
            cur={curTot}
            prev={pvTot}
            cmpLabel={cmp}
            detail={curSiteDetail}
          />
        )}
        {yearTotal && (
          <KpiCard
            label={<>{yr}년 누적 견적/판매 (1~{mm}월)</>}
            value={<QuoteSalesValue quotes={ytdQuotes} sales={ytdSales} />}
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

      <div className="mock-bar">
        <SegmentedControl<'chart' | 'table'>
          dataKey="mode"
          options={[
            { value: 'chart', label: '그래프' },
            { value: 'table', label: '표' },
          ]}
          value={mode}
          onChange={setMode}
        />
        <span className="sp" />
      </div>

      {/* 추이는 여러 기간을 비교할 때만 의미가 있어 '전체'(연도 합계·전체 기간)에서만 보여 준다 */}
      {showTrendChart && (mode === 'chart' ? (
        <MultiChart id="chQuote" title={trendTitle} labels={labels} series={series} unit="건" />
      ) : (
        <TrendTable id="quotes-trend" title={trendTitle} nameLabel="카테고리" labels={labels} series={trendTableSeries} />
      ))}

      <div className="grid grid-4">
        <Card name="quotes-src" id="quotes-src" title="유입 매체 비중" subtitle={`(${listPeriod} · ${fmt(sumBy(srcItems, (s) => s.count ?? 0))}건)`}>
          {mode === 'chart' ? (
            <SourceBarChart id="chSrc" colorTop={5} items={srcItems} emptyMessage="취합된 실제 유입 매체 데이터가 없습니다." />
          ) : (
            <SourceShareTable items={srcItems} emptyMessage="취합된 실제 유입 매체 데이터가 없습니다." />
          )}
          <ViewNote>※ 유입 경로가 확인된 건만 집계 (2026.10.12부터 추적)</ViewNote>
        </Card>
        <Card name="quotes-origin" id="quotes-origin" title="접수처 비중" subtitle={`(${listPeriod} · ${fmt(listRows.length)}건)`}>
          {mode === 'chart' ? (
            <SourceBarChart id="chOrigin" nameLabel="접수처" itemColors colorTop={5} items={listRows.length ? originItems : []} emptyMessage="선택한 기간의 접수 내역이 없습니다." />
          ) : (
            <SourceShareTable tableId="tbQuoteOrigin" nameLabel="접수처" items={listRows.length ? originItems : []} emptyMessage="선택한 기간의 접수 내역이 없습니다." />
          )}
          <ViewNote>※ 전화·톡플러스·메일은 수기 기록 건만 집계 (2024.07~)</ViewNote>
        </Card>
        {(['cat', 'rep'] as const).map((group) => (
          <MonthlyQuotesTable
            key={group}
            group={group}
            quotes={period ? quotes : trendQuotes}
            quotesRaw={period ? quotesRaw : trendRaw}
            yr={yr}
            curM={curM}
            months={months}
            allMonths={allMonths}
            allPeriod={allPeriod}
            yearTotal={yearTotal}
            viewMode={mode}
            periodLabel={listPeriod}
            isRange={!!period}
          />
        ))}
      </div>
      <QuoteListTable rows={listRows} periodLabel={listPeriod} resetKey={`${curM}|${allPeriod}|${yearTotal}|${period?.label ?? ''}`} />
      <SecSrc sources={QUOTES_SOURCES} />
    </View>
  );
};
