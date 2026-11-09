import React, { useState } from 'react';
import type { DayPeriod } from '../utils/dayRange';
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
import { ViewHeader, SecSrc, type SourceLinkItem } from '../components/common/ViewHeader';
import { SegmentedControl } from '../components/common/SegmentedControl';
import { KpiCard, KpiDetailItems, KpiSection } from '../components/charts/KpiCard';
import { MultiChart } from '../components/charts/MultiChart';
import { SpendDetailTable } from '../components/ads/SpendDetailTable';
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
}

const ADS_SOURCES: SourceLinkItem[] = [
  { label: 'Google Ads API', href: EXTERNAL_LINKS.googleAds },
  { label: '네이버 검색광고 API', href: EXTERNAL_LINKS.naverSearchAd },
  { label: 'Meta Ads 시트 (수동 입력)' },
  { label: '네이버 커머스 API', href: EXTERNAL_LINKS.naverSmartStore },
  { label: 'MDF 업로드 시트' },
  { label: '취합 스프레드시트', href: EXTERNAL_LINKS.masterSheet },
];

export const AdsView: React.FC<AdsViewProps> = ({ data, status, selectedMonth, allPeriod = false, yearTotal = false, monthly, period }) => {
  const years = [...new Set(data.spend.map((r) => Number(r.month.slice(0, 4))))].sort(
    (a, b) => b - a
  );
  const availableYears = years.length ? years : [THIS_Y];
  const [mode, setMode] = useState<'chart' | 'table'>('chart');
  const trendSpend = (monthly ?? data).spend;

  const targetYear = selectedMonth ? Number(selectedMonth.slice(0, 4)) : availableYears[0];
  const Y = availableYears.includes(targetYear) ? targetYear : availableYears[0];

  if (!data.spend.length) {
    return (
      <div className="view on" data-view="ads" data-title="매체 광고비">
        <ViewHeader
          title="매체 광고비"
          description="매체별·구분별 월간 광고비 집행 추이 및 소진 내역"
          status={status}
        />
        <KpiSection id="kpiAds">
          <div className="kpi">
            <div className="l">실제 광고비 데이터</div>
            <div className="v">–</div>
            <div className="d flat">데이터 연결 필요</div>
          </div>
        </KpiSection>
        <Card name="empty" id="ads-empty">
          <EmptyState message="취합된 실제 광고비 데이터가 없습니다. 상단 [연결 설정] 버튼에서 데이터 연결을 완료해 주세요." />
        </Card>
      </div>
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
  const cmp = period ? period.cmpLabel : '전월';
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
  const curConv       = sumBy(at(curM), (r) => r.conv);
  const curGoogleCost = sumBy(at(curM).filter((r) => r.media === 'Google'), (r) => r.cost);
  const curNaverCost  = sumBy(at(curM).filter((r) => r.media === 'Naver'),  (r) => r.cost);
  const curMetaCost   = sumBy(at(curM).filter((r) => r.media === 'Meta'),   (r) => r.cost);
  const mdfRatioPct   = tot(curM) > 0 ? ((mdfCost(curM) / tot(curM)) * 100).toFixed(1) : null;
  // 일평균: 진행 중인 달은 오늘까지의 날짜 수로 나눠, 다 끝난 전월과 같은 기준으로 비교한다
  const daysInMonth = (mo: string) => new Date(+mo.slice(0, 4), +mo.slice(5), 0).getDate();
  const elapsedDays = (mo: string) => (mo === THIS_M ? new Date().getDate() : daysInMonth(mo));
  const dailySpend = (mo: string) => tot(mo) / (period ? period.days : elapsedDays(mo));
  const missing = uncollectedMedia(data.spend, [curM]).map((m): [string, string] => [m, '미수집']);

  return (
    <div className="view on" data-view="ads" data-title="매체 광고비">
      <ViewHeader
        title="매체 광고비"
        description="매체별·구분별 월간 광고비 집행 추이 및 소진 내역"
        status={status}
      />

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

      {allPeriod && (
        <p className="leg-note quote-src-note">
          ※ 전체 기간 합산입니다. 데이터 시작 시기가 달라 구글 광고비는 {dotYm(starts.google)}, 네이버 광고비는 {dotYm(starts.naver)}
          {starts.meta && `, 메타 광고비는 ${dotYm(starts.meta)}`}부터입니다.
        </p>
      )}

      <KpiSection id="kpiAds">
        {allPeriod ? (
          <>
            <KpiCard
              label="전체 누적 광고비"
              value={`${fmt(costIn(yearKeys))}원`}
              sub={`구글 ${dotYm(starts.google)}~ · 네이버 ${dotYm(starts.naver)}~${starts.meta ? ` · 메타 ${dotYm(starts.meta)}~` : ''}`}
            />
            <KpiCard
              label="월평균 광고비"
              value={`${fmt(allSpendMonths ? Math.round(costIn(yearKeys) / allSpendMonths) : 0)}원`}
              sub={`${fmt(allSpendMonths)}개월 기준`}
            />
            <KpiCard label="전체 MDF 소진" value={`${fmt(mdfIn(yearKeys))}원`} sub="전체 기간 합계" />
            <KpiCard label="전체 전환 1건당 광고비" value={`${fmt(cpaIn(yearKeys))}원`} sub="전체 기간 기준" />
          </>
        ) : yearTotal ? (
          <>
            <KpiCard
              label={
                <>
                  {yearLabel} 광고비
                  {curM === THIS_M && !period && (
                    <>
                      {' '}
                      <small className="muted">(진행 중)</small>
                    </>
                  )}
                </>
              }
              value={`${fmt(costIn(yearMonths))}원`}
              cur={costIn(yearMonths)}
              prev={costIn(lastYrMonths)}
              cmpLabel="전년 동기"
            />
            <KpiCard
              label="월평균 광고비"
              value={`${fmt(spendMonths ? Math.round(costIn(yearMonths) / spendMonths) : 0)}원`}
              sub={`${fmt(spendMonths)}개월 기준`}
            />
            <KpiCard
              label={`${yearLabel} MDF 소진`}
              value={`${fmt(mdfIn(yearMonths))}원`}
              cur={mdfIn(yearMonths)}
              prev={mdfIn(lastYrMonths)}
              cmpLabel="전년 동기"
            />
            <KpiCard
              label={`${yearLabel} 전환 1건당 광고비`}
              value={`${fmt(cpaIn(yearMonths))}원`}
              cur={cpaIn(yearMonths)}
              prev={cpaIn(lastYrMonths)}
              cmpLabel="전년 동기"
            />
          </>
        ) : (
          <>
        <KpiCard
          label={
            <>
              {curCaption} 광고비
              {curM === THIS_M && !period && (
                <>
                  {' '}
                  <small className="muted">(진행 중)</small>
                </>
              )}
            </>
          }
          value={`${fmt(tot(curM))}원`}
          cur={tot(curM)}
          prev={tot(pv)}
          cmpLabel={cmp}
          detail={(() => {
            const items: [string, number | string][] = [];
            if (curGoogleCost > 0) items.push(['Google', curGoogleCost]);
            if (curNaverCost  > 0) items.push(['Naver',  curNaverCost]);
            if (curMetaCost   > 0) items.push(['Meta',   curMetaCost]);
            if (items.length) items.push(...missing);
            return items.length ? <KpiDetailItems items={items} /> : undefined;
          })()}
        />
        <KpiCard
          label={
            <>
              {curCaption} 일평균 광고비
              {curM === THIS_M && !period && (
                <>
                  {' '}
                  <small className="muted">(진행 중)</small>
                </>
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
          prev={mdfCost(pv)}
          cmpLabel={cmp}
          detail={mdfRatioPct ? <p>광고비 대비 <b>{mdfRatioPct}%</b></p> : undefined}
        />
        <KpiCard
          label={`${curCaption} 전환 1건당 광고비`}
          value={`${fmt(cpa(curM))}원`}
          cur={cpa(curM)}
          prev={cpa(pv)}
          cmpLabel={cmp}
          detail={<KpiDetailItems items={[['전환수', curConv]]} />}
        />
          </>
        )}
      </KpiSection>

      {mode === 'chart' && (
        <MultiChart
          id="chSpend"
          title={allPeriod ? '연도별 매체·구분별 광고비' : '월별 매체·구분별 광고비'}
          labels={months.map(colLabel)}
          series={series}
          unit="만원"
        />
      )}

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
      <SecSrc sources={ADS_SOURCES} />
    </div>
  );
};
