import React, { useMemo, useState } from 'react';
import type { CategoryMap, DashboardData, KeywordRow, QuoteRawRow, QuoteRow, SyncStatus } from '../types/dashboard';
import { cat1Of, ctrText, fmt, fmtWon, mLabel, prevM, quoteSeriesColor, quoteChartCats, SERIES_DEFS, sourceColorVar, sumBy } from '../utils/format';
import { dotYm, monthsUpTo, periodStartsOf, sameMonthsLastYear, yearRangeLabel, yearsOf } from '../utils/allPeriod';
import { monthOfDay, monthsOfRange, rangeLabel, type DayRange } from '../utils/dayRange';
import { parseScope, resultAdGroups, searchDashboard, type SearchTab } from '../utils/search';
import { campaignBuckets } from '../utils/keywordGroups';
import { adStatKey, groupAdsByAdgroup, type AdStat } from '../utils/creativeImage';
import { View } from '../components/common/View';
import { ViewNote } from '../components/common/Note';
import { ViewHeader } from '../components/common/ViewHeader';
import { KpiCard, KpiDetailItems, KpiSection, QuoteSalesValue } from '../components/charts/KpiCard';
import { originGroupCounts } from '../utils/quoteOrigin';
import { GODOMALL_ORDERS, salesInMonths, salesInRange } from '../data/godomallOrders';
import { MultiChart } from '../components/charts/MultiChart';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { TabButton } from '../components/common/TabButton';
import { LIST_LIMIT, ShowMoreButton } from '../components/common/MoreButton';
import { MediaPill } from '../components/common/MediaPill';
import { useSort } from '../hooks/useSort';
import { KeywordAccordionTable } from '../components/keywords/KeywordAccordionTable';
import { AdCreativesList } from '../components/keywords/AdCreativesList';
import { TableFootnote } from '../components/common/TableFootnote';
import { NumTd } from '../components/common/TableRows';
import { AdApiSource } from '../components/common/ExtLink';
import { Muted } from '../components/common/Muted';
import { AccordionChevron } from '../components/common/AccordionChevron';
import { SortableTh } from '../components/common/SortableTh';
import { Th } from '../components/common/Th';
import { colTip } from '../utils/columnTips';

interface SearchViewProps {
  data: DashboardData;
  categoryMap: CategoryMap;
  status: SyncStatus;
  query: string;
  initialTab?: SearchTab;
  selectedMonth: string;
  allPeriod?: boolean;
  yearTotal?: boolean;
  /** 일·기간 선택 — 있으면 견적은 그 날짜 그대로, 광고는 걸친 달 전체로 본다 */
  dayRange?: DayRange | null;
  /** 일·기간의 광고비가 일별 자료로 정확히 모인 상태 (아니면 걸친 달 전체) */
  dayCovered?: boolean;
  isLoggedIn: boolean;
  onLogin: () => void;
  onSelectAllPeriod: () => void;
}

const TITLE = '검색 결과';
const DESCRIPTION = '검색어와 관련된 광고와 견적을 한 화면에 요약합니다';
const CUSTOMER_FALLBACK = '–';
const SEARCH_HINT = '화면 위쪽 돋보기 버튼이나 Ctrl+K로 검색할 수 있습니다.';

const BREAKDOWN_LIMIT = 5;
const INQUIRY_WEB = '견적문의';

/** 견적을 키별로 세어 많은 순으로 — 비어 있는 값은 emptyLabel 로 모아 맨 뒤에 둔다 */
function breakdownOf(rows: QuoteRawRow[], keyOf: (r: QuoteRawRow) => string, emptyLabel: string) {
  const counts = new Map<string, number>();
  rows.forEach((r) => {
    const k = keyOf(r) || emptyLabel;
    counts.set(k, (counts.get(k) || 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => (a[0] === emptyLabel ? 1 : b[0] === emptyLabel ? -1 : b[1] - a[1]));
}


type KeywordSort = 'bid' | 'quality' | 'imp' | 'clk' | 'ctr' | 'conv' | 'cost';
const KEYWORD_COLS: { key: KeywordSort; label: string }[] = [
  { key: 'bid', label: '입찰가' },
  { key: 'quality', label: '품질지수' },
  { key: 'imp', label: '노출' },
  { key: 'clk', label: '클릭' },
  { key: 'ctr', label: 'CTR' },
  { key: 'conv', label: '전환' },
  { key: 'cost', label: '광고비' },
];
/** 열 종류별 공통 너비 클래스 — 입찰가는 단가, CTR 은 비율, 광고비는 금액, 나머지는 건수 폭 */
const SKW_COL_CLASS: Record<KeywordSort, string> = {
  bid: 'col-skw-unit',
  quality: 'col-skw-count',
  imp: 'col-skw-count',
  clk: 'col-skw-count',
  ctr: 'col-skw-rate',
  conv: 'col-skw-count',
  cost: 'col-skw-cost',
};
const keywordMetric = (k: KeywordRow, key: KeywordSort): number =>
  key === 'ctr' ? (k.imp > 0 ? k.clk / k.imp : 0) : k[key];

/** 견적 상세 머리말의 칩으로 올릴 짧은 항목, 그리고 한 줄 전체 폭을 쓰는 긴 항목 */
const QUOTE_CHIP_LABELS = ['번호', '사이트', '문의 유형'];
const QUOTE_WIDE_LABEL = '유입 경로';

/** 견적 상세 펼침의 항목 — 값이 있는 것만 */
const quoteDetails = (r: QuoteRawRow): [string, string][] =>
  (
    [
      ['번호', String(r.sno ?? '')],
      ['사이트', !r.site ? '아이티켓' : r.site === 'phone' ? '전화문의' : r.site],
      ['유입 경로', [r.source, r.sourceDetail].filter(Boolean).join(' - ')],
      ['문의 유형', r.inquiryType || INQUIRY_WEB],
      ['이메일', r.email || ''],
      ['전화번호', r.phone || ''],
      ['접수자', r.receiver || ''],
    ] as [string, string][]
  ).filter(([, v]) => v);

export const SearchView: React.FC<SearchViewProps> = ({
  data,
  categoryMap,
  status,
  query,
  initialTab,
  selectedMonth,
  allPeriod = false,
  yearTotal = false,
  dayRange = null,
  dayCovered = false,
  isLoggedIn,
  onLogin,
  onSelectAllPeriod,
}) => {
  const months = useMemo(
    () => (dayRange ? monthsOfRange(dayRange) : allPeriod ? null : yearTotal ? monthsUpTo(selectedMonth) : [selectedMonth]),
    [dayRange, allPeriod, yearTotal, selectedMonth]
  );
  const result = useMemo(
    () => (query ? searchDashboard(data, categoryMap, query, months, dayRange, dayCovered) : null),
    [data, categoryMap, query, months, dayRange, dayCovered]
  );
  // 추이 차트는 한 달을 골라도 그 해 1월~기준월 흐름을 보여 준다
  const chartMonths = useMemo(
    () => (allPeriod ? null : monthsUpTo(dayRange ? monthOfDay(dayRange.to) : selectedMonth)),
    [allPeriod, dayRange, selectedMonth]
  );
  const chartResult = useMemo(
    () => (query && !allPeriod && !yearTotal ? searchDashboard(data, categoryMap, query, chartMonths) : result),
    [data, categoryMap, query, allPeriod, yearTotal, chartMonths, result]
  );
  // 비교 기간: 한 달이면 전월, 연도 합계면 전년 동기, 전체 기간은 비교 없음 (종합 요약 KPI 와 같은 기준)
  const prevResult = useMemo(() => {
    if (!query || allPeriod || dayRange) return null;
    const prevMonths = yearTotal ? sameMonthsLastYear(months || []) : [prevM(selectedMonth)];
    return searchDashboard(data, categoryMap, query, prevMonths);
  }, [data, categoryMap, query, allPeriod, dayRange, yearTotal, months, selectedMonth]);
  const [tab, setTab] = useState<SearchTab | null>(initialTab || null);
  const [showAll, setShowAll] = useState(false);

  const { sortKey: kKey, sortOrder: kOrd, toggleSort: kSort } = useSort<KeywordSort>('cost');
  const { sortKey: qKey, sortOrder: qOrd, toggleSort: qSort } = useSort<'date'>('date');
  const [campTab, setCampTab] = useState(0);
  const [openQuotes, setOpenQuotes] = useState<Set<string>>(new Set());
  const toggleQuote = (key: string) =>
    setOpenQuotes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const adGroups = useMemo(() => (result ? resultAdGroups(result) : []), [result]);
  const campaigns = useMemo(() => campaignBuckets(adGroups), [adGroups]);
  const adCreatives = useMemo(() => groupAdsByAdgroup((result?.ads || []).map((a) => a.ad)), [result]);
  const adStats = useMemo(() => {
    const out: Record<string, AdStat> = {};
    (result?.ads || []).forEach(({ ad, stat }) => {
      if (stat) out[adStatKey(ad.media, ad.adId)] = stat;
    });
    return out;
  }, [result]);

  const periodLabel = dayRange
    ? rangeLabel(dayRange)
    : allPeriod
    ? '전체 기간'
    : yearTotal
      ? yearRangeLabel(selectedMonth)
      : `${selectedMonth.slice(0, 4)}년 ${mLabel(selectedMonth)}`;

  if (!query || !result) {
    return (
      <View name="search" title={TITLE}>
        <ViewHeader title={TITLE} description={DESCRIPTION} status={status} />
        <Card name="empty" id="search-empty">
          <EmptyState message="검색어를 입력해 주세요." subMessage={SEARCH_HINT} />
        </Card>
      </View>
    );
  }

  const counts: Record<SearchTab, number> = {
    groups: adGroups.length,
    keywords: result.keywords.length,
    ads: result.ads.length,
    quotes: result.quotes.length,
  };
  const total = counts.groups + counts.keywords + counts.ads + counts.quotes;

  if (!total) {
    return (
      <View name="search" title={TITLE}>
        <ViewHeader title={`"${query}" ${TITLE}`} highlight={query} description={DESCRIPTION} status={status} />
        <Card name="empty" id="search-empty">
          <EmptyState message={`${periodLabel}에 "${query}"와 일치하는 결과가 없습니다.`} subMessage={SEARCH_HINT} />
          {!allPeriod && (
            <div className="search-actions">
              <Button size="sm" className="btn-search-all" id="btn-search-all" data-btn="search-all" onClick={onSelectAllPeriod}>
                전체 기간에서 찾기
              </Button>
            </div>
          )}
        </Card>
      </View>
    );
  }

  const TABS: { id: SearchTab; label: string }[] = [
    { id: 'groups', label: '캠페인·광고그룹' },
    { id: 'keywords', label: '키워드' },
    { id: 'ads', label: '소재' },
    { id: 'quotes', label: '견적' },
  ];
  const activeTab = tab && counts[tab] ? tab : TABS.find((t) => counts[t.id])!.id;
  const changeTab = (t: SearchTab) => {
    setTab(t);
    setShowAll(false);
    setCampTab(0);
  };
  const limit = showAll ? undefined : LIST_LIMIT;

  // 추이 차트의 가로축 — 전체 기간은 연도, 그 밖에는 그 해 1월~기준월
  const chartSpend = chartResult?.spendRows || [];
  const rawQuotes = chartResult?.quotes || [];
  // 유입 매체 검색("유입 매체: 구글(광고)") — 견적만 있고 광고비는 이어지지 않아, 광고비·CPA 대신 견적 기준 요약을 보여 준다
  const sourceScope = parseScope(query)?.source;
  const queryTokens = sourceScope ? [] : query.toLowerCase().split(/\s+/).filter(Boolean);
  // 카테고리명에 검색어가 포함된 경우만 직접 매칭으로 본다
  const isCatMatch = (r: QuoteRawRow) => queryTokens.some((t) => (r.category || '').toLowerCase().includes(t));
  const catMatchCount = rawQuotes.filter(isCatMatch).length;
  // 직접 매칭이 20% 미만이면 브랜드·고객 검색으로 보고 모든 카테고리를 그대로 표시
  const useCatFilter = !sourceScope && catMatchCount >= rawQuotes.length * 0.2;
  const CAT_OTHER = '기타 카테고리';
  const chartQuotes: QuoteRow[] = rawQuotes.map((r) => ({
    month: r.date.slice(0, 7),
    category: useCatFilter && !isCatMatch(r) ? CAT_OTHER : r.category,
    source: r.source,
    count: 1,
  }));
  // breakdown 카테고리도 차트와 동일한 필터 적용
  const listCatFilter = !sourceScope && result.quotes.filter(isCatMatch).length >= result.quotes.length * 0.2;
  const axis = allPeriod
    ? yearsOf([...chartSpend.map((r) => r.month), ...chartQuotes.map((r) => r.month)])
    : monthsUpTo(selectedMonth);
  const axisLabels = axis.map((key) => (allPeriod ? `${key}년` : mLabel(key)));
  const spendSeries = SERIES_DEFS.map((s) => ({
    k: s.k,
    c: s.c,
    raw: axis.map((key) => sumBy(chartSpend.filter((r) => r.month.startsWith(key)).filter(s.f), (r) => r.cost)),
  }))
    .filter((s) => s.raw.some((v) => v))
    .map((s) => ({ ...s, v: s.raw.map((v) => v / 1e4) }));
  const quoteCats = quoteChartCats(chartQuotes);
  const quoteSeries = quoteCats.keys
    .map((k, i) => ({
      k,
      c: quoteSeriesColor(k, i),
      v: axis.map((key) =>
        sumBy(chartQuotes.filter((r) => r.month.startsWith(key) && quoteCats.keyOf(r.category) === k), (r) => r.count)
      ),
    }))
    .filter((s) => s.v.some((x) => x));

  const cpaFrom = periodStartsOf(data).cpaFrom;
  // 카드 제목용 짧은 기간 (예: 11월, 전체 기간)
  const kpiPeriod = dayRange || allPeriod || yearTotal ? periodLabel : mLabel(selectedMonth);
  const cmpLabel = prevResult ? (yearTotal ? '전년 동기' : '전월') : undefined;
  // 견적 카드에 함께 보여 줄 고도몰 판매 건수 — 검색어로 거를 수 없어 같은 기간의 전체 판매 건수다
  const periodSales = dayRange
    ? salesInRange(dayRange.from, dayRange.to)
    : salesInMonths(allPeriod ? Object.keys(GODOMALL_ORDERS) : yearTotal ? monthsUpTo(selectedMonth) : [selectedMonth]);
  const convCost = (r: { cost: number; conv: number }) => (r.conv > 0 ? r.cost / r.conv : null);
  // 광고비 카드 하단: 매체별 금액
  const mediaCost = (['Naver', 'Google', 'Meta'] as const)
    .map((m): [string, number] => [m === 'Naver' ? '네이버' : m === 'Google' ? '구글' : '메타', sumBy(result.spendRows.filter((r) => r.media === m), (r) => r.cost)])
    .filter(([k, v]) => v > 0 || k !== '메타') // 집행이 없어도 구글·네이버는 0 으로 보여 준다
    .map(([k, v]): [string, string] => [k, fmtWon(v)]);
  // 견적 카드 하단: 접수처별 건수
  const siteDetail = <KpiDetailItems items={originGroupCounts(result.quotes, data.site)} />;
  // 견적 카드의 추정 CPA 기준 — 매체·유입 경로 검색은 추적 기간이 달라 계산하지 않는다
  const cpaLabel = dayRange && !dayCovered ? '일별 광고비 수집 전 기간은 계산하지 않음' : result.cpaHidden ? '매체·유입 경로 검색은 계산하지 않음' : `${dotYm(cpaFrom)} 이후 기준`;

  // 견적 구성 — 제목·고객 정보 없이 건수만이라 로그아웃 상태에서도 보여 준다
  const catKeyOf = (r: QuoteRawRow) => (listCatFilter && !isCatMatch(r) ? CAT_OTHER : cat1Of(r.category || '기타'));
  const repKeyOf = (r: QuoteRawRow) => r.salesRep || '';
  const breakdowns = [
    { title: '카테고리', rows: breakdownOf(result.quotes, catKeyOf, '기타') },
    { title: '유입 매체', rows: breakdownOf(result.quotes.filter((r) => !r.inquiryType), (r) => (r.source === '미수집' ? '' : r.source), '미수집') },
    { title: '문의 유형', rows: breakdownOf(result.quotes, (r) => r.inquiryType || INQUIRY_WEB, '기타') },
    { title: '담당자', rows: breakdownOf(result.quotes, repKeyOf, '미지정') },
  ];

  // 유입 매체 검색 전용 — 이 매체가 전체 유입(매체가 기록된 견적)에서 차지하는 비중. 종합 요약의 유입 매체 비중과 같은 원장·기준이다
  const sameSource = (s?: string) => !!sourceScope && (s || '').replace(/\s+/g, '').toLowerCase() === sourceScope.replace(/\s+/g, '').toLowerCase();
  const sourceShareIn = (list: string[] | null) => {
    const set = list && new Set(list);
    const all = data.quotesRaw.filter((r) => r.date && r.source && r.source !== '미수집' && (!set || set.has(r.date.slice(0, 7))));
    const mine = all.filter((r) => sameSource(r.source)).length;
    return { mine, all: all.length, pct: all.length ? (mine / all.length) * 100 : null };
  };
  const srcShare = sourceScope ? sourceShareIn(months) : null;
  const srcSharePrev =
    sourceScope && !allPeriod ? sourceShareIn(yearTotal ? sameMonthsLastYear(months || []) : [prevM(selectedMonth)]) : null;
  const fmtShare = (v: number | null) => (v == null ? '–' : `${Number.isInteger(v) ? v : v.toFixed(1)}%`);
  const topRow = (rows: [string, number][], skip: string) => rows.find(([k]) => k !== skip);
  const topCat = topRow(breakdowns[0].rows, '기타');
  const topRep = topRow(breakdowns[3].rows, '미지정');
  // 최다 카테고리·담당자의 비교 기간 건수 — 같은 이름이 비교 기간에 몇 건이었는지로 증감을 낸다
  const prevCountOf = (keyOf: (r: QuoteRawRow) => string, key?: string) =>
    prevResult && key ? prevResult.quotes.filter((r) => keyOf(r) === key).length : null;
  const topDetail = (top: [string, number] | undefined, rows: [string, number][]) => {
    const items: [string, string][] = rows.filter((r) => r !== top).slice(0, 2).map(([k, n]) => [k, `${fmt(n)}건`]);
    // 비교 줄이 건수 줄 자리를 쓰므로, 비교가 있으면 건수·비중을 보조 줄 맨 앞으로 옮긴다
    if ((cmpLabel || !items.length) && top) items.unshift(['건수', `${fmt(top[1])}건 (${fmtShare((top[1] / result.quotes.length) * 100)})`]);
    return items.length ? <KpiDetailItems items={items} /> : <KpiDetailItems items={[['건수', '0건']]} />;
  };
  const monthlyTotal = axis.map((key) => sumBy(chartQuotes.filter((r) => r.month.startsWith(key)), (r) => r.count));

  return (
    <View name="search" title={TITLE}>
      <ViewHeader title={`"${query}" ${TITLE}`} highlight={query} description={DESCRIPTION} status={status} />

      {dayRange && (
        <ViewNote>
          {dayCovered
            ? '※ 일·기간 선택은 광고비·노출·클릭·전환과 견적을 선택한 날짜 그대로 집계합니다(키워드·소재 성과는 월 단위라 해당 달 전체). 전월 비교는 하지 않습니다.'
            : `※ 이 기간은 일별 광고비 수집 전이라 견적만 선택한 날짜 그대로 집계하고, 광고 지표는 기간이 걸친 달(${monthsOfRange(dayRange).map(mLabel).join('·')}) 전체로 표시하며 비교·CPA는 계산하지 않습니다.`}
        </ViewNote>
      )}

      {sourceScope ? (
        <ViewNote>
          ※ {periodLabel} 기준. 유입 매체가 "{sourceScope}"인 견적만 집계합니다(매체 추적은 2026년 10월부터). 매체는 광고비와 직접 연결되지 않아 광고비·CPA는 표시하지 않습니다.
        </ViewNote>
      ) : (
      <ViewNote>
          ※ {periodLabel} 기준. 광고비는 이름·카테고리·매체가 일치한 광고그룹·키워드 합계, 견적은 제목·카테고리·유입 매체 일치 건입니다(매체 추적은 2026년 10월부터). 둘은 직접 연결되지 않아 CPA는 추정치({cpaLabel})이고, 전환당 비용은 같은 광고 실적 기준이라 정확합니다.
      </ViewNote>
      )}

      {sourceScope ? (
        <KpiSection id="kpiSearch">
          <KpiCard
            label={`${kpiPeriod} 총 견적/판매`}
            value={<QuoteSalesValue quotes={result.quotes.length} sales={periodSales} />}
            cur={result.quotes.length}
            prev={prevResult?.quotes.length}
            cmpLabel={cmpLabel}
            sub={`${sourceScope} 유입`}
            detail={siteDetail}
          />
          <KpiCard
            label={`${kpiPeriod} 유입 점유율`}
            value={fmtShare(srcShare?.pct ?? null)}
            cur={srcShare?.pct ?? null}
            prev={srcSharePrev?.pct ?? null}
            cmpLabel={srcSharePrev ? cmpLabel : undefined}
            deltaUnit="pp"
            sub="전체 기간 기준"
            detail={
              srcShare ? (
                <KpiDetailItems items={[['이 매체', `${fmt(srcShare.mine)}건`], ['전체 유입', `${fmt(srcShare.all)}건`]]} />
              ) : null
            }
          />
          <KpiCard
            label={`${kpiPeriod} 최다 카테고리`}
            value={topCat ? topCat[0] : '–'}
            cur={topCat ? topCat[1] : null}
            prev={prevCountOf(catKeyOf, topCat?.[0])}
            cmpLabel={topCat ? cmpLabel : undefined}
            sub={topCat ? `${fmt(topCat[1])}건 (${fmtShare((topCat[1] / result.quotes.length) * 100)})` : '카테고리 정보 없음'}
            detail={topDetail(topCat, breakdowns[0].rows)}
          />
          <KpiCard
            label={`${kpiPeriod} 최다 담당자`}
            value={topRep ? topRep[0] : '–'}
            cur={topRep ? topRep[1] : null}
            prev={prevCountOf(repKeyOf, topRep?.[0])}
            cmpLabel={topRep ? cmpLabel : undefined}
            sub={topRep ? `${fmt(topRep[1])}건 (${fmtShare((topRep[1] / result.quotes.length) * 100)})` : '담당자 정보 없음'}
            detail={topDetail(topRep, breakdowns[3].rows)}
          />
        </KpiSection>
      ) : (
      <KpiSection id="kpiSearch">
        <KpiCard
          label={`${kpiPeriod} 광고비`}
          value={`${fmt(result.cost)}원`}
          cur={result.cost}
          prev={prevResult?.cost}
          cmpLabel={cmpLabel}
          sub={`광고그룹 ${fmt(result.groups.length)}개${result.keywordOnlyGroups ? ` · 키워드만 일치 ${fmt(result.keywordOnlyGroups)}개 그룹` : ''}`}
          detail={mediaCost.length ? <KpiDetailItems items={mediaCost} /> : `광고그룹 ${fmt(result.groups.length)}개`}
        />
        <KpiCard
          label={`${kpiPeriod} 총 견적/판매`}
          value={<QuoteSalesValue quotes={result.quotes.length} sales={periodSales} />}
          cur={result.quotes.length}
          prev={prevResult?.quotes.length}
          cmpLabel={cmpLabel}
          sub={`전체 ${fmt(result.quotes.length)}건`}
          detail={siteDetail}
        />
        <KpiCard
          label={`${kpiPeriod} 견적당 광고비 (CPA)`}
          value={result.cpa ? `${fmt(result.cpa)}원` : '–'}
          cur={result.cpa || null}
          prev={prevResult?.cpa || null}
          cmpLabel={cmpLabel}
          sub={cpaLabel}
          detail={
            result.cpa ? (
              <>
                <p>광고비 <b>{fmtWon(result.cpaCost)}</b></p>
                <i>|</i>
                <p>견적 <b>{fmt(result.cpaQuotes)}건</b></p>
              </>
            ) : (
              <span>{dayRange && !dayCovered ? cpaLabel : result.cpaHidden ? '추적 기간이 달라 계산하지 않음' : cpaLabel}</span>
            )
          }
        />
        <KpiCard
          label={<span data-tip={colTip('전환당 비용')} data-tip-desc="">{kpiPeriod} 전환당 비용</span>}
          value={result.conv > 0 ? `${fmt(result.cost / result.conv)}원` : '–'}
          cur={convCost(result)}
          prev={prevResult ? convCost(prevResult) : null}
          cmpLabel={cmpLabel}
          sub={result.conv > 0 ? `광고비 ÷ 광고전환 ${fmt(result.conv)}건` : '광고전환이 없어 계산하지 않습니다'}
          detail={<KpiDetailItems items={[['클릭', result.clk], ['전환', result.conv], ['CTR', ctrText(result.clk, result.imp)]]} />}
        />
      </KpiSection>
      )}

      <div className="grid">
        {sourceScope ? (
          // 광고비는 유입 매체와 이어지지 않으므로, 이 매체의 견적 접수 추이를 왼쪽에 둔다
          <MultiChart
            id="chSearchSourceTotal"
            title={allPeriod ? '연도별 견적 접수' : '월별 견적 접수'}
            labels={axisLabels}
            series={[{ k: sourceScope, c: sourceColorVar(sourceScope), v: monthlyTotal }].filter((s) => s.v.some((x) => x))}
            unit="건"
            emptyMessage="일치하는 견적이 없습니다."
          />
        ) : (
          <MultiChart
            id="chSearchSpend"
            title={allPeriod ? '연도별 광고비' : '월별 광고비'}
            labels={axisLabels}
            series={spendSeries}
            unit="만원"
            emptyMessage="일치하는 광고비가 없습니다."
          />
        )}
        <MultiChart
          id="chSearchQuotes"
          title={sourceScope ? (allPeriod ? '연도별 카테고리별 견적 접수' : '카테고리별 월별 견적 접수') : allPeriod ? '연도별 견적 접수' : '월별 견적 접수'}
          labels={axisLabels}
          series={quoteSeries}
          unit="건"
          emptyMessage="일치하는 견적이 없습니다."
        />
      </div>

      <Card name="search-list" id="search-list">
        <h3>일치 항목</h3>
        <div className="kw-tabs">
          {TABS.map((t) => (
            <TabButton
              key={t.id}
              className="btn-search-tab"
              data-btn={`search-tab-${t.id}`}
              active={activeTab === t.id}
              label={t.label}
              count={counts[t.id]}
              disabled={!counts[t.id]}
              title={counts[t.id] ? undefined : '일치하는 결과가 없습니다'}
              onClick={() => changeTab(t.id)}
            />
          ))}
        </div>

        {activeTab === 'groups' && (
          <KeywordAccordionTable
            title="캠페인·광고그룹"
            detailed
            topGroups={adGroups}
            campaigns={campaigns}
            month={selectedMonth}
            periodLabel={periodLabel}
            media="all"
            type="SA"
            kwTabIdx={campTab}
            onChangeTab={setCampTab}
          />
        )}

        {activeTab === 'ads' && (
          <AdCreativesList groups={adCreatives} stats={adStats} loading={false} periodLabel={periodLabel} media="all" type="SA" />
        )}

        {activeTab === 'keywords' && (
          <>
            <div className="tw">
              <table className="stk" id="tbSearchKeywords">
                <colgroup>
                  <col className="col-skw-name" />
                  {KEYWORD_COLS.map((c) => (
                    <col key={c.key} className={SKW_COL_CLASS[c.key]} />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    <Th>키워드</Th>
                    {KEYWORD_COLS.map((c) => (
                      <SortableTh key={c.key} className="n" sortKey={c.key} activeKey={kKey} order={kOrd} onSort={kSort}>
                        {c.label}
                      </SortableTh>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...result.keywords]
                    .sort((a, b) => (kOrd === 'asc' ? 1 : -1) * (keywordMetric(a, kKey) - keywordMetric(b, kKey)))
                    .slice(0, limit)
                    .map((k) => (
                      <tr key={`${k.media}|${k.campaign}|${k.adgroup}|${k.keyword}|${k.match || ''}`}>
                        <td>
                          <span className="s-media-row">
                            <MediaPill media={k.media} iconOnly size="0.875rem" />
                            <b>{k.keyword}</b>
                          </span>
                          <small className="search-sub search-sub-line" title={`${k.campaign} › ${k.adgroup}`}>
                            {k.campaign} › {k.adgroup}
                          </small>
                        </td>
                        <NumTd value={k.bid || null} unit="원" />
                        <NumTd value={k.quality || null} />
                        <NumTd value={k.imp} />
                        <NumTd value={k.clk} />
                        <NumTd>{ctrText(k.clk, k.imp)}</NumTd>
                        <NumTd value={k.conv} />
                        <NumTd value={k.cost} unit="원" />
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <ShowMoreButton noun="키워드" total={counts.keywords} expanded={showAll} onToggle={() => setShowAll((v) => !v)} />
            <TableFootnote
              unit="원·회"
              basis={`산출 근거: ${periodLabel} 실적 합계 · 입찰가·품질지수는 최근 달 값 · CTR = 클릭 ÷ 노출`}
              sources={[<AdApiSource key="src" prefix="출처:" suffix="API" />]}
            />
          </>
        )}

        {activeTab === 'quotes' && (
          <>
            <div className="search-breakdown" id="searchBreakdown">
              {breakdowns.map((b) => (
                <div key={b.title} className="search-breakdown-col">
                  <h4>{b.title}</h4>
                  {b.rows.slice(0, showAll ? undefined : BREAKDOWN_LIMIT).map(([k, n]) => (
                    <p key={k}>
                      <span title={k}>{k}</span>
                      <b>{fmt(n)}건</b>
                    </p>
                  ))}
                  {!showAll && b.rows.length > BREAKDOWN_LIMIT && <Muted small>외 {fmt(b.rows.length - BREAKDOWN_LIMIT)}개</Muted>}
                </div>
              ))}
            </div>

            {isLoggedIn ? (
              <>
                <div className="tw">
                  <table className="stk" id="tbSearchQuotes">
                    <colgroup>
                      <col className="col-sq-date" />
                      <col className="col-sq-subject" />
                      <col className="col-sq-customer" />
                      <col className="col-sq-text" />
                      <col className="col-sq-text" />
                      <col className="col-sq-text" />
                    </colgroup>
                    <thead>
                      <tr>
                        <SortableTh sortKey="date" activeKey={qKey} order={qOrd} onSort={qSort}>
                          접수일
                        </SortableTh>
                        <Th>제목</Th>
                        <Th>고객</Th>
                        <Th>카테고리</Th>
                        <Th>유입</Th>
                        <Th>담당자</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {(qOrd === 'asc' ? [...result.quotes].reverse() : result.quotes).slice(0, limit).map((r, i) => {
                        const key = String(r.id || i);
                        const isOpen = openQuotes.has(key);
                        const details = quoteDetails(r);
                        return (
                          <React.Fragment key={key}>
                            {/* 소재 표(.cr-row)와 같은 방식: 행 전체를 눌러 펼치고, 화살표 버튼은 키보드 조작용 */}
                            <tr
                              className={`cr-row can-open${isOpen ? ' open' : ''}`}
                              title={isOpen ? '클릭하여 상세 접기' : '클릭하여 상세 펼치기'}
                              onClick={() => toggleQuote(key)}
                            >
                              <td className="search-nowrap">
                                <button
                                  type="button"
                                  className="search-q-toggle grp-acc-main"
                                  aria-expanded={isOpen}
                                  aria-controls={`search-q-detail-${key}`}
                                >
                                  <AccordionChevron open={isOpen} />
                                  {r.date.slice(0, 10)}
                                </button>
                              </td>
                              <td className="search-ellipsis" title={r.subject}>{r.subject || CUSTOMER_FALLBACK}</td>
                              <td className="search-ellipsis">{[r.company, r.name].filter(Boolean).join(' · ') || CUSTOMER_FALLBACK}</td>
                              <td className="search-ellipsis">{r.category || CUSTOMER_FALLBACK}</td>
                              <td className="search-ellipsis">{r.inquiryType || r.source || CUSTOMER_FALLBACK}</td>
                              <td className="search-ellipsis">{r.salesRep || CUSTOMER_FALLBACK}</td>
                            </tr>
                            {isOpen && (
                              <tr className="search-q-detail cr-detail-row" id={`search-q-detail-${key}`}>
                                <td colSpan={6}>
                                  {/* 소재 표(.cr-detail)와 같은 흰 패널 — 항목은 이름 위, 값 아래로 칸에 맞춰 늘어놓는다 */}
                                  <div className="cr-detail search-q-panel">
                                    {/* 머리말: 전체 제목 + 짧은 정보(번호·사이트·문의 유형)는 칩으로. 긴 값(유입 경로)은 아래 칸에서 한 줄 전체 폭을 쓴다 */}
                                    <div className="search-q-head">
                                      {r.subject && <p className="search-q-subject">{r.subject}</p>}
                                      <div className="search-q-chips">
                                        {details
                                          .filter(([label]) => QUOTE_CHIP_LABELS.includes(label))
                                          .map(([label, value]) => (
                                            <span key={label} className="search-q-chip">
                                              <small>{label}</small>
                                              {value}
                                            </span>
                                          ))}
                                      </div>
                                    </div>
                                    <dl>
                                      {details
                                        .filter(([label]) => !QUOTE_CHIP_LABELS.includes(label))
                                        .map(([label, value]) => (
                                          <div key={label} className={label === QUOTE_WIDE_LABEL ? 'wide' : undefined}>
                                            <dt>{label}</dt>
                                            <dd>{value}</dd>
                                          </div>
                                        ))}
                                    </dl>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <ShowMoreButton noun="견적" total={counts.quotes} expanded={showAll} onToggle={() => setShowAll((v) => !v)} />
              </>
            ) : (
              <p className="leg-note search-login-note">
                견적 제목과 고객 정보는 로그인 후 볼 수 있습니다.{' '}
                <Button variant="link" className="btn-search-login" id="btn-search-login" data-btn="search-login" onClick={onLogin}>
                  로그인
                </Button>
              </p>
            )}
            <TableFootnote
              unit="건"
              basis="산출 근거: 제목·카테고리·유입 매체·담당자 일치 건 (매체 추적은 2026년 10월부터)"
            />
          </>
        )}
      </Card>
    </View>
  );
};
