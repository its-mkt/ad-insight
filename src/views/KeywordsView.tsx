import React, { useMemo, useState } from 'react';
import type {
  AdRow,
  CategoryMap,
  DashboardData,
  SyncStatus,
} from '../types/dashboard';
import { catSum, catsOf, ctrText, fmt, fmtWon, mLabel, THIS_M } from '../utils/format';
import { adStatKey, groupAdsByAdgroup, selectRoundRobinAds, type AdStat } from '../utils/creativeImage';
import { EXTERNAL_LINKS } from '../utils/constants';
import type { DayPeriod } from '../utils/dayRange';
import type { SameDateCompare } from '../utils/dayData';
import { View } from '../components/common/View';
import { ViewNote } from '../components/common/Note';
import { ViewHeader, SecSrc, type SourceLinkItem } from '../components/common/ViewHeader';
import { SegmentedControl } from '../components/common/SegmentedControl';
import {
  CategoryFilter,
  buildCategoryFilter,
  matchesCategory,
  useCategoryFilterState,
} from '../components/common/CategoryFilter';
import { PeriodNavSlot } from '../components/common/PeriodNav';
import { KeywordAccordionTable } from '../components/keywords/KeywordAccordionTable';
import { AdCreativesList } from '../components/keywords/AdCreativesList';
import { KpiCard, KpiDetailItems, KpiSection } from '../components/charts/KpiCard';
import { Card } from '../components/common/Card';
import { EmptyState } from '../components/common/EmptyState';
import { dotYm, inMonths, mergeKeywordMonths, monthsUpTo, uncollectedItems, yearRangeLabel } from '../utils/allPeriod';
import { campaignBuckets, groupKeywordRows, withGroupTotals } from '../utils/keywordGroups';

interface KeywordsViewProps {
  data: DashboardData;
  categoryMap: CategoryMap;
  status: SyncStatus;
  /** 실데이터를 받는 중 (화면은 저장해 둔 이전 데이터로 먼저 그린다) */
  isSyncing?: boolean;
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

const KEYWORDS_SOURCES: SourceLinkItem[] = [
  { label: 'Google Ads API', href: EXTERNAL_LINKS.googleAds },
  { label: '네이버 검색광고 API', href: EXTERNAL_LINKS.naverSearchAd },
  { label: '취합 스프레드시트', href: EXTERNAL_LINKS.masterSheet },
  { label: '키워드·소재·입찰가·품질지수 포함' },
];

export const KeywordsView: React.FC<KeywordsViewProps> = ({
  data,
  categoryMap,
  status,
  isSyncing = false,
  selectedMonth,
  allPeriod = false,
  yearTotal = false,
  period,
  sameDate,
}) => {
  const [media, setMedia] = useState<'all' | 'Google' | 'Naver'>('all');
  const [type, setType] = useState<'SA' | 'DA'>('SA');
  const [kwTabIdx, setKwTabIdx] = useState<number>(0);
  const catState = useCategoryFilterState();

  const pass = (r: { media: string; type: string }) =>
    (media === 'all' || r.media === media) && r.type === type;

  // 기준월·기간 행·키워드 그룹은 캠페인 탭·카테고리 필터를 바꿀 때 다시 셀 필요가 없어 기간·매체·유형이 바뀔 때만 계산한다
  const base = useMemo(() => {
    const ms = [...new Set(data.spend.map((r) => r.month))].sort();
    const mo =
      (selectedMonth && ms.includes(selectedMonth) ? selectedMonth : undefined) ||
      selectedMonth ||
      ms.filter((m) => m <= THIS_M).pop() ||
      ms[ms.length - 1] ||
      THIS_M;
    const periodMonths = yearTotal ? monthsUpTo(mo) : [mo];
    const inPeriod = allPeriod ? () => true : inMonths(periodMonths);
    const rows = data.spend.filter((r) => inPeriod(r) && pass(r));
    // 키워드 그룹 집계 (SA) - 선택된 기간 기준 집계
    const monthKs = data.keywords.filter((k) => inPeriod(k) && pass(k));
    const ks = allPeriod || yearTotal ? mergeKeywordMonths(monthKs) : monthKs;
    // 키워드 실적이 있는 가장 이른 달 — 이보다 앞선 달은 키워드 재구성 전이라 비어 있다
    const kwFirstMonth = data.keywords.reduce<string | undefined>((min, k) => (pass(k) && (min === undefined || k.month < min) ? k.month : min), undefined);
    // 그룹 줄은 광고그룹 전체 실적(위 KPI 와 같은 값)으로 — 네이버는 키워드 확장·중지·삭제 키워드 실적이 키워드 목록에 없어 키워드 합이 더 작다.
    // 일·기간 보기는 광고비만 그 기간으로 바뀌고 키워드는 월 단위라 맞지 않으므로 키워드 합을 그대로 쓴다
    const allGroups = period || !ks.length ? groupKeywordRows(ks) : withGroupTotals(groupKeywordRows(ks), rows, true);
    return { mo, periodMonths, inPeriod, rows, kwFirstMonth, allGroups };
    // pass 는 media·type 으로만 정해진다
  }, [data.spend, data.keywords, media, type, selectedMonth, allPeriod, yearTotal, period]);
  const { mo, periodMonths, inPeriod, rows, kwFirstMonth, allGroups } = base;

  if (!data.keywords.length && !data.spend.length) {
    return (
      <View name="keywords" title="키워드 · 소재">
        <ViewHeader
          title="키워드 · 소재 성과"
          description="광고그룹별 검색 키워드 입찰/품질/전환 지표 및 배너·확장 소재 현황"
          status={status}
        />
        <Card name="empty" id="kw-empty">
          <EmptyState message="취합된 키워드 및 소재 데이터가 없습니다. 상단 [연결 설정] 버튼에서 데이터 연결을 완료해 주세요." />
        </Card>
        <SecSrc sources={KEYWORDS_SOURCES} />
      </View>
    );
  }

  const totalCost = rows.reduce((s, r) => s + r.cost, 0);
  const totalClk  = rows.reduce((s, r) => s + r.clk, 0);
  const totalImp  = rows.reduce((s, r) => s + r.imp, 0);
  const totalConv = rows.reduce((s, r) => s + r.conv, 0);
  const kpiCtr = ctrText(totalClk, totalImp);
  const kpiCpc = totalClk > 0 ? Math.round(totalCost / totalClk) : 0;
  const kpiAdCpa = totalConv > 0 ? Math.round(totalCost / totalConv) : 0;

  // 비교 기간 계산 (전월 / 전년 동기)
  const yr = mo.slice(0, 4);
  const mm = parseInt(mo.slice(5, 7));
  const pvMo = mm === 1 ? `${parseInt(yr) - 1}-12` : `${yr}-${String(mm - 1).padStart(2, '0')}`;
  const pvRows = allPeriod ? [] : data.spend.filter((r) => {
    if (yearTotal) {
      const pvYr = String(parseInt(yr) - 1);
      return r.month >= `${pvYr}-01` && r.month <= `${pvYr}-${String(mm).padStart(2, '0')}` && pass(r);
    }
    return r.month === pvMo && pass(r);
  });
  const hasPvData = pvRows.length > 0;
  const pvCost = pvRows.reduce((s, r) => s + r.cost, 0);
  const pvClk  = pvRows.reduce((s, r) => s + r.clk, 0);
  const pvConv = pvRows.reduce((s, r) => s + r.conv, 0);
  const pvCpc  = pvClk > 0 ? Math.round(pvCost / pvClk) : 0;
  const cmpLabel = allPeriod ? undefined : yearTotal ? '전년 동기' : period ? period.cmpLabel : sameDate ? sameDate.cmpLabel : '전월';

  // 매체별 집계
  const naverRows  = rows.filter((r) => r.media === 'Naver');
  const googleRows = rows.filter((r) => r.media === 'Google');
  const naverCost  = naverRows.reduce((s, r) => s + r.cost, 0);
  const googleCost = googleRows.reduce((s, r) => s + r.cost, 0);
  const naverClk   = naverRows.reduce((s, r) => s + r.clk, 0);
  const googleClk  = googleRows.reduce((s, r) => s + r.clk, 0);
  const naverCpc   = naverClk  > 0 ? Math.round(naverCost  / naverClk)  : 0;
  const googleCpc  = googleClk > 0 ? Math.round(googleCost / googleClk) : 0;
  // 광고비 비교 모드 detail: 클릭·전환 / allPeriod detail: 매체별 비용
  const mediaDetail = naverCost > 0 && googleCost > 0
    ? <KpiDetailItems items={[['네이버', fmtWon(naverCost)], ['구글', fmtWon(googleCost)]]} />
    : null;
  const missing = uncollectedItems(data.spend, allPeriod ? [] : periodMonths, media === 'all' ? undefined : [media]);
  const cpcItems: [string, number | string][] = [];
  if (naverCpc  > 0 || (media !== 'Google' && !missing.some(([k]) => k === '네이버'))) cpcItems.push(['네이버', `${fmt(naverCpc)}원`]);
  if (googleCpc > 0 || (media !== 'Naver' && !missing.some(([k]) => k === '구글'))) cpcItems.push(['구글',   `${fmt(googleCpc)}원`]);
  if (cpcItems.length) cpcItems.push(...missing);
  const cpcDetail = cpcItems.length > 0 ? <KpiDetailItems items={cpcItems} /> : null;

  // 카테고리 필터 목록 — 이 기간 광고비가 있는 카테고리를 광고비 큰 순으로
  const cost = catSum(categoryMap, rows, (r) => r.cost);
  const ck = Object.keys(cost).sort((a, b) => cost[b] - cost[a]);

  // 1차/2차 카테고리 필터 — ck에 실제로 존재하는 값만 노출
  const catFilter = buildCategoryFilter(ck, catState);


  // 카테고리 필터 — 광고그룹의 매핑 카테고리로 판단해 키워드 그룹과 주요 · 확장 소재에 똑같이 적용
  const inCategory = (g: { media: string; campaign: string; adgroup: string }) =>
    !catFilter.cat1 ||
    catsOf(categoryMap, {
      month: mo, media: g.media, type,
      campaign: g.campaign, adgroup: g.adgroup,
      cost: 0, imp: 0, clk: 0, conv: 0,
    }).some(({ c }) => matchesCategory(c, catFilter.cat1, catFilter.cat2));
  const activeGroups = allGroups.filter(inCategory);
  const topGroups = activeGroups;

  // 캠페인 탭: 캠페인명 단위로 묶고(같은 이름은 Google·Naver 합산) 광고비 상위 10개 캠페인
  // 전부 넘기고, 상위 10개만 탭으로 보이며 나머지는 '더보기' 목록에 둔다
  const campaigns = campaignBuckets(activeGroups);

  // 주요 소재: 기준월 광고비가 큰 캠페인의 소재부터
  const campCost: Record<string, number> = {};
  rows.forEach((r) => {
    const k = `${r.media}\u0001${r.campaign}`;
    campCost[k] = (campCost[k] || 0) + r.cost;
  });
  // 소재별 기준월 실적 — 캠페인 안에서는 비용(없으면 노출)이 큰 소재부터 고른다
  const adStats: Record<string, AdStat> = {};
  (data.adStats || [])
    .filter(inPeriod)
    .forEach((s) => {
      const k = adStatKey(s.media, s.adId);
      const cur = adStats[k] || (adStats[k] = { cost: 0, imp: 0, clk: 0, conv: 0 });
      cur.cost += s.cost;
      cur.imp += s.imp;
      cur.clk += s.clk;
      cur.conv += s.conv;
    });
  const adWeight = (a: AdRow) => {
    const s = adStats[adStatKey(a.media, a.adId)];
    return s ? s.cost * 1e3 + s.imp : 0;
  };
  // 광고그룹 단위로 묶어(그룹 안 소재마다 제목·설명·링크가 다를 수 있다) 캠페인마다 돌아가며 모두 넘긴다 — 개수 제한은 목록의 더보기가 맡는다
  const adGroups = selectRoundRobinAds(
    groupAdsByAdgroup(data.ads.filter((a) => pass(a) && inCategory(a)).sort((a, b) => adWeight(b) - adWeight(a))),
    Infinity,
    (g) => campCost[`${g.media}\u0001${g.campaign}`] || 0
  );

  const periodLabel = allPeriod ? '전체 기간' : yearTotal ? yearRangeLabel(mo) : `${mo.slice(0, 4)}년 ${mLabel(mo)}`;

  return (
    <View name="keywords" title="키워드 · 소재">
      <ViewHeader
        title="키워드 · 소재 성과"
        description="광고그룹별 검색 키워드 입찰/품질/전환 지표 및 배너·확장 소재 현황"
        status={status}
      />

      <KpiSection id="kpiKeywords">
        <KpiCard
          label="광고비"
          value={`${fmt(totalCost)}원`}
          cur={totalCost || null}
          prev={hasPvData ? pvCost : null}
          cmpLabel={cmpLabel}
          sub={`클릭 ${fmt(totalClk)} · 전환 ${fmt(totalConv)}`}
          detail={cmpLabel
            ? <KpiDetailItems items={[['클릭', totalClk], ['광고전환', totalConv]]} />
            : mediaDetail ?? <KpiDetailItems items={[['클릭', totalClk], ['광고전환', totalConv]]} />}
        />
        <KpiCard
          label="클릭수"
          value={fmt(totalClk)}
          cur={totalClk || null}
          prev={hasPvData ? pvClk : null}
          cmpLabel={cmpLabel}
          sub={`노출 ${fmt(totalImp)} · CTR ${kpiCtr}`}
          detail={<KpiDetailItems items={[['노출', totalImp], ['CTR', kpiCtr]]} />}
        />
        <KpiCard
          label="클릭당 비용 (CPC)"
          value={kpiCpc ? `${fmt(kpiCpc)}원` : '–'}
          cur={kpiCpc || null}
          prev={hasPvData && pvCpc ? pvCpc : null}
          cmpLabel={cmpLabel}
          sub={`${fmt(totalClk)}클릭 기준`}
          detail={cpcDetail ?? <KpiDetailItems items={[['네이버', '0원'], ['구글', '0원']]} />}
        />
        <KpiCard
          label="광고전환"
          value={fmt(totalConv)}
          cur={totalConv || null}
          prev={hasPvData ? pvConv : null}
          cmpLabel={cmpLabel}
          sub={kpiAdCpa ? `건당 ${fmt(kpiAdCpa)}원` : '견적 CPA는 카테고리 효율 참고'}
          detail={<KpiDetailItems items={[['건당', `${fmt(kpiAdCpa)}원`]]} />}
        />
      </KpiSection>

      {allPeriod && (
        <ViewNote>
          ※ 전체 기간 합산.
          {type === 'SA' && kwFirstMonth && ` 키워드 실적은 ${dotYm(kwFirstMonth)}부터라 카테고리 표와 기간이 다릅니다.`}
        </ViewNote>
      )}

      <div className="mock-bar">
        <SegmentedControl<'all' | 'Google' | 'Naver'>
          dataKey="media"
          options={[
            { value: 'all', label: '전체' },
            { value: 'Google', label: 'Google' },
            { value: 'Naver', label: 'Naver' },
          ]}
          value={media}
          onChange={(m) => {
            setMedia(m);
            setKwTabIdx(0);
          }}
        />
        <SegmentedControl<'SA' | 'DA'>
          dataKey="type"
          options={[
            { value: 'SA', label: 'SA' },
            { value: 'DA', label: 'DA' },
          ]}
          value={type}
          onChange={(t) => {
            setType(t);
            setKwTabIdx(0);
          }}
        />
        <PeriodNavSlot active={!!catFilter.cat1} onReset={() => catState.setCat1('')}>
          <CategoryFilter filter={catFilter} />
        </PeriodNavSlot>
      </div>

      {type === 'SA' && (
        <KeywordAccordionTable
          topGroups={topGroups}
          campaigns={campaigns}
          month={mo}
          periodLabel={periodLabel}
          firstMonth={kwFirstMonth}
          media={media}
          type={type}
          kwTabIdx={kwTabIdx}
          onChangeTab={setKwTabIdx}
        />
      )}

      {(type === 'SA' || adGroups.length > 0) && (
        <AdCreativesList groups={adGroups} stats={adStats} loading={isSyncing} periodLabel={periodLabel} media={media} type={type} />
      )}
      <SecSrc sources={KEYWORDS_SOURCES} />
    </View>
  );
};
