import React, { useEffect, useState } from 'react';
import type { SyncStatus } from '../types/dashboard';
import { MultiChart } from '../components/charts/MultiChart';
import { KpiCard, KpiDetailItems, KpiSection } from '../components/charts/KpiCard';
import { SourceBarChart } from '../components/charts/SourceBarChart';
import { Card } from '../components/common/Card';
import { PendingTag } from '../components/common/Muted';
import { ViewNote } from '../components/common/Note';
import { View } from '../components/common/View';
import { ViewHeader } from '../components/common/ViewHeader';
import { PurchasedGoodsTable } from '../components/quotes/PurchasedGoodsTable';
import { TrendTable } from '../components/quotes/TrendTable';
import { GA4_ORDER_SOURCES, GA4_ORDER_SOURCES_AS_OF, GA4_PARTIAL_START, GA4_PURCHASE_MONTHS, GA4_SOURCE_LABELS, loadLatestGa4OrderSources } from '../data/ga4OrderSources';
import { GODOMALL_DAILY, GODOMALL_GOODS, GODOMALL_ORDER_INFLOW, GODOMALL_ORDERS, GODOMALL_ORDERS_AS_OF } from '../data/godomallOrders';
import { daysOfMonth } from '../utils/dayRange';
import { fmt, mLabel, prevM, sumBy, ym } from '../utils/format';

interface PurchasesViewProps {
  status: SyncStatus;
  selectedMonth: string;
  allPeriod?: boolean;
  yearTotal?: boolean;
}

const TITLE = '구매 상세';

const countOf = (month: string) => GODOMALL_ORDERS[month] ?? 0;
/** 수집 범위 밖의 달은 비교하지 않는다 */
const known = (month: string) => (month in GODOMALL_ORDERS ? countOf(month) : null);
const totalOf = (months: string[]) => sumBy(months, countOf);
const lastYearOf = (month: string) => ym(+month.slice(0, 4) - 1, +month.slice(5));
const countText = (n: number) => `${fmt(n)}건`;
const avgText = (n: number) => `${n.toFixed(1)}건`;

// 수집 시점의 달은 그날까지의 값이다
const elapsedDays = (month: string) => (month === GODOMALL_ORDERS_AS_OF.slice(0, 7) ? +GODOMALL_ORDERS_AS_OF.slice(8, 10) : daysOfMonth(month));
const dailyOf = (month: string) => (month in GODOMALL_ORDERS ? countOf(month) / elapsedDays(month) : null);

/** 건수가 가장 많은 달 */
const peakOf = (months: string[]) => months.reduce((best, m) => (countOf(m) > countOf(best) ? m : best), months[0]);
const peakCard = (months: string[]) => {
  const peak = peakOf(months);
  return <KpiCard label="최다 판매 월" value={countText(countOf(peak))} sub={`${peak.slice(0, 4)}년 ${mLabel(peak)}`} />;
};

/** 고도몰 주문통계의 구매건수 (결제완료일 기준) */
export const PurchasesView: React.FC<PurchasesViewProps> = ({ status, selectedMonth, allPeriod = false, yearTotal = false }) => {
  // 최신 GA4 값을 받으면 다시 그린다
  const [, setGa4Loaded] = useState(0);
  useEffect(() => {
    let alive = true;
    loadLatestGa4OrderSources().then((changed) => {
      if (changed && alive) setGa4Loaded((n) => n + 1);
    });
    return () => {
      alive = false;
    };
  }, []);

  // 시트 값을 받으면 달·기준일이 바뀌므로 그릴 때마다 읽는다
  const ALL_MONTHS = Object.keys(GODOMALL_ORDERS).sort();
  const YEARS = [...new Set(ALL_MONTHS.map((m) => m.slice(0, 4)))];
  const AS_OF_MONTH = GODOMALL_ORDERS_AS_OF.slice(0, 7);
  const AS_OF_DAY = +GODOMALL_ORDERS_AS_OF.slice(8, 10);
  const yr = selectedMonth.slice(0, 4);
  const mm = +selectedMonth.slice(5, 7);
  const ytd = Array.from({ length: mm }, (_, i) => ym(yr, i + 1));
  const ytdTotal = totalOf(ytd);
  const lastYtd = ytd.map(lastYearOf);
  const hasLastYtd = lastYtd.some((m) => m in GODOMALL_ORDERS);
  const lastYtdTotal = hasLastYtd ? totalOf(lastYtd) : null;
  const monthCount = countOf(selectedMonth);
  // 그래프·표는 고른 기간의 값만 그린다 (월은 그 달, 연도 전체는 그 해, 전체 기간은 모든 연도)
  const isMonth = !allPeriod && !yearTotal;

  const labels = allPeriod ? YEARS.map((y) => `${y}년`) : ytd.map((_, i) => `${i + 1}월`);
  const series = allPeriod
    ? [{ k: '판매 건수', c: '--acc', v: YEARS.map((y) => totalOf(ALL_MONTHS.filter((m) => m.startsWith(y)))) }]
    : [{ k: `${yr}년`, c: '--acc', v: ytd.map(countOf) }];

  // 표는 항상 12칸으로 그려 기간을 바꿔도 월 칸 너비가 같다
  const monthKeys = Array.from({ length: 12 }, (_, i) => i + 1);
  const tableSeries = (allPeriod ? [...YEARS].reverse() : [yr]).map((y) => ({ k: `${y}년`, c: '--acc', v: monthKeys.map((m) => countOf(ym(y, m))) }));

  // 월 보기 — 쇼핑몰에서 결제된 주문의 값만 쓴다 (견적·광고비와 섞지 않는다)
  const monthName = mLabel(selectedMonth);
  const pv = prevM(selectedMonth);
  const lastYear = lastYearOf(selectedMonth);
  const partial = selectedMonth === AS_OF_MONTH;
  const amountOf = (mo: string) => (mo in GODOMALL_GOODS ? sumBy(GODOMALL_GOODS[mo], (g) => g.amount) : null);
  const qtyOf = (mo: string) => (mo in GODOMALL_GOODS ? sumBy(GODOMALL_GOODS[mo], (g) => g.qty) : null);
  const orDash = (v: number | null, text: (n: number) => string) => (v === null ? '–' : text(v));
  const wonText = (v: number) => `${fmt(v)}원`;
  const qtyText = (v: number) => `${fmt(v)}개`;
  const curAmount = amountOf(selectedMonth);
  const curQty = qtyOf(selectedMonth);
  /** 진행 중인 달은 끝난 달과 맞비교하지 않는다 */
  const monthCompare = (cur: number | null, prev: number | null) => (partial ? { sub: `${AS_OF_DAY}일까지 집계` } : { cur, prev, cmpLabel: '전월' });

  // 유입 매체별 구매 — 월 보기에서 주문번호로 유입을 확인한 주문이 있는 달만 그 값을 쓴다. 기록이 쌓이기 전까지 연도·전체 보기는 GA4 참고값을 유지하고, 두 기준을 섞지 않는다
  const scopeMonths = allPeriod ? ALL_MONTHS : yearTotal ? ytd : [selectedMonth];
  const orderBased = isMonth && Object.entries(GODOMALL_ORDER_INFLOW[selectedMonth] ?? {}).some(([source, n]) => source !== '미수집' && n > 0);
  // GA4 참고값은 판매 건수와 맞대 볼 수 있게 측정된 달끼리만 합치고, 측정 시작 전에 결제된 판매는 뺀다
  const measuredMonths = orderBased ? [selectedMonth] : scopeMonths.filter((mo) => mo in GA4_ORDER_SOURCES);
  // 일별 주문 값이 있으면 GA4 가 측정한 날짜 안의 주문만 세고, GA4 가 세는 대상(쇼핑몰 화면에서 접수된 주문)도 함께 보여 준다
  const compareRows = GODOMALL_DAILY.filter((r) => {
    const mo = r.date.slice(0, 7);
    return measuredMonths.includes(mo) && +r.date.slice(8) >= (GA4_PARTIAL_START[mo]?.from ?? 1) && r.date <= GA4_ORDER_SOURCES_AS_OF;
  });
  const hasDaily = !orderBased && compareRows.some((r) => r.reached > 0);
  const reachedOrders = sumBy(compareRows, (r) => (GA4_PURCHASE_MONTHS.has(r.date.slice(0, 7)) ? r.paid : r.reached));
  const purchaseBasis = measuredMonths.length > 0 && measuredMonths.every((mo) => GA4_PURCHASE_MONTHS.has(mo));
  const measuredSales = hasDaily ? sumBy(compareRows, (r) => r.paid) : sumBy(measuredMonths, (mo) => countOf(mo) - (orderBased ? 0 : GA4_PARTIAL_START[mo]?.salesBefore ?? 0));
  const sourceCounts = new Map<string, number>();
  measuredMonths.forEach((mo) => {
    Object.entries(orderBased ? GODOMALL_ORDER_INFLOW[mo] : GA4_ORDER_SOURCES[mo] ?? {}).forEach(([raw, n]) => {
      const label = orderBased ? raw : GA4_SOURCE_LABELS[raw] ?? '기타';
      sourceCounts.set(label, (sourceCounts.get(label) ?? 0) + n);
    });
  });
  const sourceTotal = sumBy([...sourceCounts.values()], (n) => n);
  const sourceItems = [...sourceCounts]
    .sort((a, b) => b[1] - a[1])
    .map(([k, count]) => ({ k, c: '--acc', count, v: Math.round((count / sourceTotal) * 1000) / 10 }));
  // GA4 값이 도중에 멈춘 달은 어디까지인지 제목에 밝힌다
  const sourceCutoff = measuredMonths.includes(GA4_ORDER_SOURCES_AS_OF.slice(0, 7)) && GA4_ORDER_SOURCES_AS_OF < GODOMALL_ORDERS_AS_OF ? `, ${+GA4_ORDER_SOURCES_AS_OF.slice(8, 10)}일까지` : '';
  const sourcePeriod = allPeriod ? '전체 기간' : yearTotal ? `${yr}년` : monthName;
  const sourceStart = !orderBased && isMonth && GA4_PARTIAL_START[selectedMonth] ? ` ${GA4_PARTIAL_START[selectedMonth].from}일부터` : '';
  const sourceScope = isMonth ? `${sourcePeriod}${sourceStart}` : `${sourcePeriod} 중 측정된 ${measuredMonths.length}개월`;
  // GA4 기준일보다 뒤의 달은 측정이 없는 것이 아니라 값을 아직 받지 못한 것이다
  const ga4NotYet = isMonth && selectedMonth > GA4_ORDER_SOURCES_AS_OF.slice(0, 7);
  const inflowKnown = sourceTotal - (sourceCounts.get('미수집') ?? 0);
  const sourceSubtitle = orderBased
    ? `(${sourceScope} · 판매 ${fmt(measuredSales)}건 · 유입 확인 ${fmt(inflowKnown)}건)`
    : measuredMonths.length
      ? `(${sourceScope} · 판매 ${fmt(measuredSales)}건${hasDaily && !purchaseBasis ? ` · 완료 화면 주문 ${fmt(reachedOrders)}건` : ''} · GA4 측정 ${fmt(sourceTotal)}건${sourceCutoff})`
      : `(${sourcePeriod} · ${ga4NotYet ? '집계 전' : '미측정'})`;

  return (
    <View name="purchases" title={TITLE}>
      <ViewHeader title={TITLE} description="고도몰 기준 판매 건수" status={status} />
      <ViewNote>※ 고도몰 주문통계의 구매건수(결제완료일 기준) · {GODOMALL_ORDERS_AS_OF} 수집</ViewNote>

      <KpiSection id="kpiPurchases">
        {allPeriod ? (
          <>
            <KpiCard label="전체 기간 판매 건수" value={countText(totalOf(ALL_MONTHS))} sub={`${ALL_MONTHS[0]} ~ ${ALL_MONTHS[ALL_MONTHS.length - 1]}`} />
            <KpiCard label="월 평균" value={avgText(totalOf(ALL_MONTHS) / ALL_MONTHS.length)} />
            {peakCard(ALL_MONTHS)}
          </>
        ) : yearTotal ? (
          <>
            <KpiCard label={`${yr}년 판매 건수`} value={countText(ytdTotal)} cur={ytdTotal} prev={lastYtdTotal} cmpLabel="전년 동기" />
            <KpiCard label="월 평균" value={avgText(ytdTotal / mm)} cur={ytdTotal / mm} prev={lastYtdTotal === null ? null : lastYtdTotal / mm} cmpLabel="전년 동기" />
            {peakCard(ytd)}
          </>
        ) : (
          <>
            {/* 진행 중인 달의 건수는 끝난 달과 맞비교하지 않는다. 일평균·비율은 기간이 달라도 비교할 수 있다 */}
            <KpiCard
              label={<>{monthName} 판매 건수{partial && <PendingTag />}</>}
              value={countText(monthCount)}
              {...(partial ? { sub: `${AS_OF_DAY}일까지 집계` } : { cur: monthCount, prev: known(pv), cmpLabel: '전월' })}
              detail={<KpiDetailItems items={[['전월', orDash(known(pv), countText)], ['전년 동월', orDash(known(lastYear), countText)]]} />}
            />
            <KpiCard
              label={<>{monthName} 일평균 판매{partial && <PendingTag />}</>}
              value={orDash(dailyOf(selectedMonth), (v) => `${v.toFixed(2)}건`)}
              cur={dailyOf(selectedMonth)}
              prev={dailyOf(pv)}
              cmpLabel="전월"
              detail={
                <KpiDetailItems
                  items={
                    partial
                      ? [['월말 예상', `${Math.round((monthCount / AS_OF_DAY) * daysOfMonth(selectedMonth))}건`], ['경과', `${AS_OF_DAY}/${daysOfMonth(selectedMonth)}일`]]
                      : [['기간', `${daysOfMonth(selectedMonth)}일`]]
                  }
                />
              }
            />
            <KpiCard
              label={<>{monthName} 판매 금액{partial && <PendingTag />}</>}
              value={orDash(curAmount, wonText)}
              {...monthCompare(curAmount, amountOf(pv))}
              detail={<KpiDetailItems items={[['주문 1건당', curAmount !== null && monthCount > 0 ? wonText(curAmount / monthCount) : '–']]} />}
            />
            <KpiCard
              label={<>{monthName} 구매 개수{partial && <PendingTag />}</>}
              value={orDash(curQty, qtyText)}
              {...monthCompare(curQty, qtyOf(pv))}
              detail={<KpiDetailItems items={[['주문 1건당', curQty !== null && monthCount > 0 ? `${(curQty / monthCount).toFixed(1)}개` : '–']]} />}
            />
          </>
        )}
      </KpiSection>

      {!isMonth && (
        <>
          <MultiChart id="chPurchases" title={allPeriod ? '연도별 판매 건수' : '월별 판매 건수'} labels={labels} series={series} unit="건" />
          <TrendTable id="purchases-table" title={allPeriod ? '연도·월별 판매 건수' : `${yr}년 월별 판매 건수`} nameLabel="연도" labels={monthKeys.map((m) => `${m}월`)} series={tableSeries} isFuture={(i, row) => (allPeriod ? row !== null && ym(row.slice(0, 4), i + 1) > AS_OF_MONTH : i >= mm)} />
        </>
      )}

      <PurchasedGoodsTable months={allPeriod ? ALL_MONTHS : yearTotal ? ytd : [selectedMonth]} periodLabel={allPeriod ? '전체 기간' : yearTotal ? `${yr}년` : `${monthName}${partial ? ` · ${AS_OF_DAY}일까지` : ''}`} />

      <Card name="purchases-source" id="purchases-source" title={orderBased ? '유입 매체별 구매' : '유입 매체별 구매 참고값'} subtitle={sourceSubtitle}>
        <SourceBarChart id="chPurchaseSource" countLabel={orderBased ? '판매' : '측정'} items={sourceItems} emptyMessage={ga4NotYet ? '이 기간의 GA4 주문 완료 값을 아직 받지 못했습니다.' : '이 기간은 GA4 주문 완료 값이 측정되지 않았습니다.'} />
        {orderBased ? (
          <ViewNote>※ 결제 주문과 주문번호로 맞춘 값 · 미수집은 유입 경로가 기록되지 않은 주문 (기록 시작 전 주문, 완료 화면 기록이 남지 않은 주문)</ViewNote>
        ) : (
          <ViewNote>
            ※ {purchaseBasis ? 'GA4 측정 = 결제 주문마다 보낸 구매 이벤트 수' : "판매는 실제로 결제된 주문 수, GA4 는 '주문 완료' 화면이 열린 횟수입니다. 입금하지 않은 주문이나 새로고침은 GA4 에 더 잡히고, 광고 차단 프로그램을 쓰면 덜 잡힙니다 · 11월 10일 결제분부터 결제 정보를 GA4 에 직접 보내 숫자를 맞춥니다"} · {GA4_ORDER_SOURCES_AS_OF} 수집
          </ViewNote>
        )}
      </Card>
    </View>
  );
};
