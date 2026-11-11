import React, { useState } from 'react';
import type { DashboardData, SpendRow, SyncStatus } from '../types/dashboard';
import {
  fmt,
  fmtWon,
  mLabel,
  NOW_MONTH,
  prevM,
  SERIES_DEFS,
  sumBy,
  THIS_M,
  THIS_Y,
  ym,
} from '../utils/format';
import { EXTERNAL_LINKS } from '../utils/constants';
import type { DayPeriod } from '../utils/dayRange';
import type { SameDateCompare } from '../utils/dayData';
import { View } from '../components/common/View';
import { PendingTag } from '../components/common/Muted';
import { ViewNote } from '../components/common/Note';
import { ViewHeader, SecSrc, type SourceLinkItem } from '../components/common/ViewHeader';
import { KpiCard, KpiDetailItems, KpiPlaceholder, KpiSection } from '../components/charts/KpiCard';
import { MultiChart } from '../components/charts/MultiChart';
import { SegmentedControl } from '../components/common/SegmentedControl';
import { SpendDetailTable } from '../components/ads/SpendDetailTable';
import { MediaCompareTable, MediaStatsTabs } from '../components/ads/MediaStatsTable';
import { Card } from '../components/common/Card';
import { EmptyState } from '../components/common/EmptyState';
import { dotYm, monthsUpTo, periodStartsOf, sameMonthsLastYear, uncollectedMedia, yearRangeLabel } from '../utils/allPeriod';

interface AdsViewProps {
  data: DashboardData;
  status: SyncStatus;
  selectedMonth?: string;
  /** 기간 선택이 '전체' — 표·그래프의 열이 달 대신 연도(YYYY)가 된다 */
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

const ADS_SOURCES: SourceLinkItem[] = [
  { label: 'Google Ads API', href: EXTERNAL_LINKS.googleAds },
  { label: '네이버 검색광고 API', href: EXTERNAL_LINKS.naverSearchAd },
  { label: 'Meta Ads 시트 (수동 입력)' },
  { label: '네이버 커머스 API', href: EXTERNAL_LINKS.naverSmartStore },
  { label: 'MDF 업로드 시트' },
  { label: '취합 스프레드시트', href: EXTERNAL_LINKS.masterSheet },
];

export const AdsView: React.FC<AdsViewProps> = ({ data, status, selectedMonth, allPeriod = false, yearTotal = false, monthly, period, sameDate }) => {
  const [mode, setMode] = useState<'chart' | 'table'>('chart');
  const [chartSet, setChartSet] = useState<'media' | 'compare'>('media');
  const years = [...new Set(data.spend.map((r) => Number(r.month.slice(0, 4))))].sort(
    (a, b) => b - a
  );
  const availableYears = years.length ? years : [THIS_Y];
  const trendSpend = (monthly ?? data).spend;

  const targetYear = selectedMonth ? Number(selectedMonth.slice(0, 4)) : availableYears[0];
  const Y = availableYears.includes(targetYear) ? targetYear : availableYears[0];

  if (!data.spend.length) {
    return (
      <View name="ads" title="매체 광고비">
        <ViewHeader
          title="매체 광고비"
          description="매체별·구분별 월간 광고비 집행 추이 및 소진 내역"
          status={status}
        />
        <KpiSection id="kpiAds">
          <KpiPlaceholder label="실제 광고비 데이터" message="데이터 연결 필요" />
        </KpiSection>
        <Card name="empty" id="ads-empty">
          <EmptyState message="취합된 실제 광고비 데이터가 없습니다. 상단 [연결 설정] 버튼에서 데이터 연결을 완료해 주세요." />
        </Card>
      </View>
    );
  }

  const yearKeys = availableYears.map(String).sort();
  const yearMonths12 = Array.from({ length: 12 }, (_, i) => ym(Y, i + 1));
  const monthsOfY = Array.from({ length: Y === THIS_Y ? NOW_MONTH : 12 }, (_, i) => ym(Y, i + 1));
  const months = allPeriod ? yearKeys : monthsOfY;
  const allMonths12 = allPeriod ? yearKeys : yearMonths12;
  const isFuture = (mo: string) => !allPeriod && Y === THIS_Y && mo > months[months.length - 1];
  // 키는 달(YYYY-MM) 또는 전체 기간의 연도(YYYY)
  const at = (key: string) => data.spend.filter((r) => r.month.startsWith(key));
  const colLabel = (key: string) => (allPeriod ? `${key}년` : mLabel(key));
  const tot = (mo: string) => sumBy(at(mo), (r) => r.cost);
  const trendAt = (key: string) => trendSpend.filter((r) => r.month.startsWith(key));
  const trendTot = (mo: string) => sumBy(trendAt(mo), (r) => r.cost);
  const man = (mo: string, item: string) =>
    sumBy(
      data.manual.filter((r) => r.month === mo && r.item === item),
      (r) => r.amount
    );

  // MDF·스토어는 달마다 API 값과 시트 값 중 하나를 고르므로, 연도는 달별 값을 더한다
  const byMonthOrYear = (f: (mo: string) => number) => (key: string) =>
    key.length === 4 ? sumBy(Array.from({ length: 12 }, (_, i) => ym(key, i + 1)), f) : f(key);

  const storeCost = byMonthOrYear((mo: string) => {
    const apiStore = sumBy(
      trendSpend.filter(
        (r) => r.month === mo && (r.campaign.includes('스마트스토어') || r.campaign.includes('스토어'))
      ),
      (r) => r.cost
    );
    return apiStore || man(mo, 'STORE');
  });

  // 수동 입력 MDF 는 달 전체 금액이라 일·기간 보기에서는 쓰지 않는다
  const mdfOf = (spend: SpendRow[], useManual: boolean) => byMonthOrYear((mo: string) => {
    const manMdf = useManual ? man(mo, 'MDF') : 0;
    const apiMdf = sumBy(
      spend.filter((r) => r.month === mo && r.campaign.includes('MDF')),
      (r) => r.cost
    );
    return manMdf || apiMdf;
  });
  const mdfCost = mdfOf(data.spend, !period);
  const trendMdf = mdfOf(trendSpend, true);

  const curM =
    selectedMonth && selectedMonth.startsWith(String(Y))
      ? selectedMonth
      : monthsOfY[monthsOfY.length - 1];
  const pv = prevM(curM);
  const curCaption = period ? period.label : mLabel(curM);
  const cmp = period ? period.cmpLabel : sameDate ? sameDate.cmpLabel : '전월';
  const cpa = (mo: string) => {
    const c = sumBy(at(mo), (r) => r.conv);
    return c ? tot(mo) / c : 0;
  };

  const series = SERIES_DEFS.map((s) => ({
    ...s,
    raw: months.map((mo) => sumBy(trendAt(mo).filter(s.f), (r) => r.cost)),
  }))
    .filter((s) => s.raw.some((v) => v))
    .map((s) => ({ ...s, v: s.raw.map((v) => v / 1e4) }));

  const lastY = (mo: string) => trendTot(ym(Y - 1, +mo.slice(5)));

  const detailTitle = allPeriod ? '연도별 집행 상세 내역' : '월별 집행 상세 내역';
  // 집행 상세 그래프의 '합계·비교' 보기 — 선이 많아지지 않게 매체별 보기와 나눈다
  const detailSeries = [
    { k: '합계', c: '--c-it', raw: months.map(trendTot) },
    ...(allPeriod ? [] : [{ k: '전년 동월', c: '--c-rest', raw: months.map(lastY) }]),
    { k: 'MDF', c: '--c-m', raw: months.map(trendMdf) },
    { k: '스토어', c: '--c-ka', raw: months.map(storeCost) },
  ]
    .filter((s) => s.raw.some((v) => v))
    .map((s) => ({ ...s, v: s.raw.map((v) => v / 1e4) }));

  // 연도 합계: 1월~마지막 달을 전년 같은 달들과 비교한다
  const yearMonths = monthsUpTo(curM);
  const starts = periodStartsOf(data);
  const allSpendMonths = new Set(data.spend.filter((r) => r.cost > 0).map((r) => r.month)).size;
  const lastYrMonths = sameMonthsLastYear(yearMonths);
  const yearLabel = yearRangeLabel(curM);
  const costIn = (list: string[]) => sumBy(list, tot);
  const mdfIn = (list: string[]) => sumBy(list, mdfCost);
  const cpaIn = (list: string[]) => {
    const c = sumBy(list, (mo) => sumBy(at(mo), (r) => r.conv));
    return c ? costIn(list) / c : 0;
  };
  const spendMonths = yearMonths.filter((mo) => tot(mo) > 0).length;
  // 연도 합계·전체 기간 카드 하단 — 달 또는 연도 목록의 합계로 만든다
  const convIn = (list: string[]) => sumBy(list, (mo) => sumBy(at(mo), (r) => r.conv));
  const mediaDetailOf = (list: string[]) => {
    const items = ['Google', 'Naver', 'Meta']
      .map((m): [string, number] => [m, sumBy(list, (mo) => sumBy(at(mo).filter((r) => r.media === m), (r) => r.cost))])
      .filter(([m, v]) => v > 0 || m !== 'Meta'); // 집행이 없어도 구글·네이버는 0 으로 보여 준다
    return <KpiDetailItems items={items} />;
  };
  const mdfShareOf = (list: string[]) =>
    costIn(list) > 0 ? <p>광고비 대비 <b>{((mdfIn(list) / costIn(list)) * 100).toFixed(1)}%</b></p> : <p>광고비 대비 <b>0%</b></p>;
  const monthAvgDetail = (list: string[], count: number) => <KpiDetailItems items={[['광고비 합계', fmtWon(costIn(list))], ['집행', `${fmt(count)}개월`]]} />;
  const curConv       = sumBy(at(curM), (r) => r.conv);
  const curGoogleCost = sumBy(at(curM).filter((r) => r.media === 'Google'), (r) => r.cost);
  const curNaverCost  = sumBy(at(curM).filter((r) => r.media === 'Naver'),  (r) => r.cost);
  const curMetaCost   = sumBy(at(curM).filter((r) => r.media === 'Meta'),   (r) => r.cost);
  const mdfRatioPct   = tot(curM) > 0 ? ((mdfCost(curM) / tot(curM)) * 100).toFixed(1) : null;
  // 일평균: 진행 중인 달은 오늘까지의 날짜 수로 나눠, 다 끝난 전월과 같은 기준으로 비교한다
  const daysInMonth = (mo: string) => new Date(+mo.slice(0, 4), +mo.slice(5), 0).getDate();
  const elapsedDays = (mo: string) => (mo === THIS_M ? new Date().getDate() : daysInMonth(mo));
  const dailySpend = (mo: string) => tot(mo) / (period ? period.days : sameDate && mo === pv ? sameDate.days : elapsedDays(mo));
  // 수동 입력 MDF 는 달 전체 금액이라, 같은 날짜 비교에서는 일수 비율만큼만 쓴다
  const pvMdf = sameDate && man(pv, 'MDF') ? (man(pv, 'MDF') * sameDate.days) / daysInMonth(pv) : mdfCost(pv);
  const missing = uncollectedMedia(data.spend, [curM]).map((m): [string, string] => [m, '미수집']);
  // 매체별 성과 표 — 위 KPI 와 같은 기간 (전체 / 연도 합계 / 선택한 달·일 기간)
  const statsRows = allPeriod ? data.spend : data.spend.filter((r) => (yearTotal ? yearMonths : [curM]).includes(r.month));
  // 증감 비교 기간 — KPI 카드와 같다 (연도 합계는 전년 동기, 달·일 기간은 전월·직전 같은 일수). 전체 기간은 비교하지 않는다
  const statsPrev = allPeriod ? null : data.spend.filter((r) => (yearTotal ? lastYrMonths : [pv]).includes(r.month));
  const statsCmp = yearTotal ? '전년 동기' : cmp;
  const statsLabel = allPeriod ? '전체 기간' : yearTotal ? yearLabel : period ? period.label : `${curM.slice(0, 4)}년 ${mLabel(curM)}`;

  return (
    <View name="ads" title="매체 광고비">
      <ViewHeader
        title="매체 광고비"
        description="매체별·구분별 월간 광고비 집행 추이 및 소진 내역"
        status={status}
      />

      {allPeriod && (
        <ViewNote>
          ※ 전체 기간 합산. 광고비 집계 시작: 구글 {dotYm(starts.google)}, 네이버 {dotYm(starts.naver)}
          {starts.meta && `, 메타 ${dotYm(starts.meta)}`}.
        </ViewNote>
      )}

      <KpiSection id="kpiAds">
        {allPeriod ? (
          <>
            <KpiCard
              label="전체 누적 광고비"
              value={`${fmt(costIn(yearKeys))}원`}
              sub={`구글 ${dotYm(starts.google)}~ · 네이버 ${dotYm(starts.naver)}~${starts.meta ? ` · 메타 ${dotYm(starts.meta)}~` : ''}`}
              detail={mediaDetailOf(yearKeys)}
            />
            <KpiCard
              label="월평균 광고비"
              value={`${fmt(allSpendMonths ? Math.round(costIn(yearKeys) / allSpendMonths) : 0)}원`}
              sub={`${fmt(allSpendMonths)}개월 기준`}
              detail={monthAvgDetail(yearKeys, allSpendMonths)}
            />
            <KpiCard label="전체 MDF 소진" value={`${fmt(mdfIn(yearKeys))}원`} sub="전체 기간 합계" detail={mdfShareOf(yearKeys)} />
            <KpiCard label="전체 전환 1건당 광고비" value={`${fmt(cpaIn(yearKeys))}원`} sub="전체 기간 기준" detail={<KpiDetailItems items={[['광고전환', convIn(yearKeys)]]} />} />
          </>
        ) : yearTotal ? (
          <>
            <KpiCard
              label={
                <>
                  {yearLabel} 광고비
                  {curM === THIS_M && !period && (
                    <PendingTag />
                  )}
                </>
              }
              value={`${fmt(costIn(yearMonths))}원`}
              cur={costIn(yearMonths)}
              prev={costIn(lastYrMonths)}
              cmpLabel="전년 동기"
              detail={mediaDetailOf(yearMonths)}
            />
            <KpiCard
              label="월평균 광고비"
              value={`${fmt(spendMonths ? Math.round(costIn(yearMonths) / spendMonths) : 0)}원`}
              sub={`${fmt(spendMonths)}개월 기준`}
              detail={monthAvgDetail(yearMonths, spendMonths)}
            />
            <KpiCard
              label={`${yearLabel} MDF 소진`}
              value={`${fmt(mdfIn(yearMonths))}원`}
              cur={mdfIn(yearMonths)}
              prev={mdfIn(lastYrMonths)}
              cmpLabel="전년 동기"
              detail={mdfShareOf(yearMonths)}
            />
            <KpiCard
              label={`${yearLabel} 전환 1건당 광고비`}
              value={`${fmt(cpaIn(yearMonths))}원`}
              cur={cpaIn(yearMonths)}
              prev={cpaIn(lastYrMonths)}
              cmpLabel="전년 동기"
              detail={<KpiDetailItems items={[['광고전환', convIn(yearMonths)]]} />}
            />
          </>
        ) : (
          <>
        <KpiCard
          label={
            <>
              {curCaption} 광고비
              {curM === THIS_M && !period && (
                <PendingTag />
              )}
            </>
          }
          value={`${fmt(tot(curM))}원`}
          cur={tot(curM)}
          prev={tot(pv)}
          cmpLabel={cmp}
          detail={(() => {
            const items: [string, number | string][] = [];
            if (curGoogleCost > 0 || !missing.some(([m]) => m === 'Google')) items.push(['Google', curGoogleCost]);
            if (curNaverCost  > 0 || !missing.some(([m]) => m === 'Naver')) items.push(['Naver',  curNaverCost]);
            if (curMetaCost   > 0) items.push(['Meta',   curMetaCost]);
            if (items.length) items.push(...missing);
            return <KpiDetailItems items={items.length ? items : [['Google', 0], ['Naver', 0]]} />;
          })()}
        />
        <KpiCard
          label={
            <>
              {curCaption} 일평균 광고비
              {curM === THIS_M && !period && (
                <PendingTag />
              )}
            </>
          }
          value={`${fmt(dailySpend(curM))}원`}
          cur={dailySpend(curM)}
          prev={dailySpend(pv)}
          cmpLabel={cmp}
          detail={
            <KpiDetailItems
              items={[
                ...(curM === THIS_M && !period
                  ? ([
                      ['월말 예상', fmtWon(dailySpend(curM) * daysInMonth(curM))],
                      ['경과', `${elapsedDays(curM)}/${daysInMonth(curM)}일`],
                    ] as [string, string][])
                  : ([['기간', `${period ? period.days : daysInMonth(curM)}일`]] as [string, string][])),
              ]}
            />
          }
        />
        <KpiCard
          label={`${curCaption} MDF 소진`}
          value={`${fmt(mdfCost(curM))}원`}
          cur={mdfCost(curM)}
          prev={pvMdf}
          cmpLabel={cmp}
          detail={mdfRatioPct ? <p>광고비 대비 <b>{mdfRatioPct}%</b></p> : <p>광고비 대비 <b>0%</b></p>}
        />
        <KpiCard
          label={`${curCaption} 전환 1건당 광고비`}
          value={`${fmt(cpa(curM))}원`}
          cur={cpa(curM)}
          prev={cpa(pv)}
          cmpLabel={cmp}
          detail={<KpiDetailItems items={[['광고전환', curConv]]} />}
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

      {mode === 'chart' ? (
        <MultiChart
          id="chSpend"
          title={detailTitle}
          labels={months.map(colLabel)}
          series={chartSet === 'media' ? series : detailSeries}
          unit="만원"
          tools={
            <SegmentedControl<'media' | 'compare'>
              mini
              dataKey="chart-set"
              options={[
                { value: 'media', label: '매체별' },
                { value: 'compare', label: '합계·비교' },
              ]}
              value={chartSet}
              onChange={setChartSet}
            />
          }
        />
      ) : (
        <SpendDetailTable
          series={series}
          allMonths12={allMonths12}
          months={months}
          isFuture={isFuture}
          at={trendAt}
          tot={trendTot}
          mdfCost={trendMdf}
          storeCost={storeCost}
          lastY={lastY}
          allPeriod={allPeriod}
          colLabel={colLabel}
        />
      )}
      <MediaCompareTable rows={statsRows} prevRows={statsPrev} cmpLabel={statsCmp} periodLabel={statsLabel} />
      <MediaStatsTabs rows={statsRows} prevRows={statsPrev} cmpLabel={statsCmp} periodLabel={statsLabel} />
      <SecSrc sources={ADS_SOURCES} />
    </View>
  );
};
