import React, { useEffect, useState } from 'react';
import type { SiteId, SyncStatus } from '../types/dashboard';
import { MultiChart } from '../components/charts/MultiChart';
import { KpiCard, KpiDetailItems, KpiSection } from '../components/charts/KpiCard';
import { SourceBarChart } from '../components/charts/SourceBarChart';
import { Card } from '../components/common/Card';
import { PendingTag } from '../components/common/Muted';
import { SkelList } from '../components/common/SkeletonView';
import { ViewNote } from '../components/common/Note';
import { View } from '../components/common/View';
import { ViewHeader } from '../components/common/ViewHeader';
import { PurchasedGoodsTable } from '../components/quotes/PurchasedGoodsTable';
import { TrendTable } from '../components/quotes/TrendTable';
import { GA4_SOURCE_LABELS, ga4OrderSourceSet, loadGa4OrderSources } from '../data/ga4OrderSources';
import { GODOMALL_DAILY, GODOMALL_ORDERS, GODOMALL_ORDERS_AS_OF, goodsInMonth, salesCutoff, salesInMonths } from '../data/godomallOrders';
import { daysOfMonth } from '../utils/dayRange';
import { fmt, mLabel, prevM, sumBy, THIS_M, ym } from '../utils/format';
import { lastYearMonth, monthsUpTo, ymLabel } from '../utils/allPeriod';

interface PurchasesViewProps {
  status: SyncStatus;
  selectedMonth: string;
  allPeriod?: boolean;
  yearTotal?: boolean;
  /** 이 달까지만 보여 준다 — 로그인하지 않으면 진행 중인 달을 빼고 지난달까지 (빈 값이면 제한 없음) */
  untilMonth?: string;
  /** 이 날까지만 보여 준다 — 로그인하지 않으면 어제. 판매·제품은 이날까지 다시 세고, 오늘 값이 섞인 진행 중인 달의 GA4 월 합계는 마감 후 반영으로 둔다 (빈 값이면 제한 없음) */
  cutoffDay?: string;
  /** 보고 있는 사이트 — 고도몰 주문·GA4 값을 그 사이트 것으로 그린다 */
  site?: SiteId;
}

const TITLE = '구매 상세';

/** 수집 범위 밖의 달은 비교하지 않는다. 판매를 세는 마지막 날이 있으면(비로그인) 그 달은 1일~그날만 센다 */
const known = (month: string) => salesInMonths([month]);
const countOf = (month: string) => known(month) ?? 0;
const totalOf = (months: string[]) => sumBy(months, countOf);
const countText = (n: number) => `${fmt(n)}건`;
const PENDING = '수집 전';
const avgText = (n: number) => `${n.toFixed(1)}건`;

/** 판매를 센 마지막 날 — 수집일, 비로그인이면 어제까지 */
const asOfDate = () => {
  const cut = salesCutoff();
  return cut && cut < GODOMALL_ORDERS_AS_OF ? cut : GODOMALL_ORDERS_AS_OF;
};
// 수집 시점의 달은 그날까지의 값이다
const elapsedDays = (month: string) => (month === asOfDate().slice(0, 7) ? +asOfDate().slice(8, 10) : daysOfMonth(month));
const dailyOf = (month: string) => {
  const n = known(month);
  return n === null ? null : n / elapsedDays(month);
};

/** 건수가 가장 많은 달 */
const peakOf = (months: string[]) => months.reduce((best, m) => (countOf(m) > countOf(best) ? m : best), months[0]);
const peakCard = (months: string[]) => {
  // 고도몰 주문을 아직 수집하지 않은 사이트는 '수집 전'
  if (!months.some((m) => m in GODOMALL_ORDERS)) return <KpiCard label="최다 판매 월" value={PENDING} />;
  const peak = peakOf(months);
  return <KpiCard label="최다 판매 월" value={countText(countOf(peak))} sub={ymLabel(peak)} />;
};

/** 고도몰 주문통계의 구매건수 (결제완료일 기준) */
export const PurchasesView: React.FC<PurchasesViewProps> = ({ status, selectedMonth, allPeriod = false, yearTotal = false, untilMonth, cutoffDay, site = 'itket' }) => {
  // 최신 GA4 값을 받으면 다시 그린다
  const [, setGa4Loaded] = useState(0);
  // GA4 값을 받는 중인지 — 받은 값이 아직 하나도 없으면 그동안 자리표시를 보여 준다
  const [ga4Done, setGa4Done] = useState(false);
  useEffect(() => {
    let alive = true;
    setGa4Done(false);
    loadGa4OrderSources(site)
      .then((changed) => {
        if (changed && alive) setGa4Loaded((n) => n + 1);
      })
      .catch(() => undefined)
      .finally(() => alive && setGa4Done(true));
    return () => {
      alive = false;
    };
  }, [site]);
  const ga = ga4OrderSourceSet(site);

  // 시트 값을 받으면 달·기준일이 바뀌므로 그릴 때마다 읽는다
  const ALL_MONTHS = Object.keys(GODOMALL_ORDERS).filter((m) => !untilMonth || m <= untilMonth).sort();
  // 그 사이트 고도몰 주문을 아직 수집하지 않았으면 0건이 아니라 '수집 전'으로 둔다
  const hasOrders = ALL_MONTHS.length > 0;
  const YEARS = [...new Set(ALL_MONTHS.map((m) => m.slice(0, 4)))];
  const AS_OF = asOfDate();
  const AS_OF_MONTH = AS_OF.slice(0, 7);
  const AS_OF_DAY = +AS_OF.slice(8, 10);
  const yr = selectedMonth.slice(0, 4);
  const mm = +selectedMonth.slice(5, 7);
  const ytd = monthsUpTo(selectedMonth);
  const ytdTotal = totalOf(ytd);
  const lastYtd = ytd.map(lastYearMonth);
  const hasLastYtd = lastYtd.some((m) => m in GODOMALL_ORDERS);
  const lastYtdTotal = hasLastYtd ? totalOf(lastYtd) : null;
  const monthCount = countOf(selectedMonth);
  // 그래프·표는 고른 기간의 값만 그린다 (월은 그 달, 연도 전체는 그 해, 전체 기간은 모든 연도)
  const isMonth = !allPeriod && !yearTotal;

  const labels = allPeriod ? YEARS.map((y) => `${y}년`) : ytd.map((_, i) => `${i + 1}월`);
  // 수집 전이면 그래프·표에 0 을 그리지 않고 공용 빈 상태로 둔다
  const series = !hasOrders ? [] : allPeriod
    ? [{ k: '판매 건수', c: '--acc', v: YEARS.map((y) => totalOf(ALL_MONTHS.filter((m) => m.startsWith(y)))) }]
    : [{ k: `${yr}년`, c: '--acc', v: ytd.map(countOf) }];

  // 표는 항상 12칸으로 그려 기간을 바꿔도 월 칸 너비가 같다
  const monthKeys = Array.from({ length: 12 }, (_, i) => i + 1);
  const tableSeries = !hasOrders ? [] : (allPeriod ? [...YEARS].reverse() : [yr]).map((y) => ({ k: `${y}년`, c: '--acc', v: monthKeys.map((m) => (untilMonth && ym(y, m) > untilMonth ? 0 : countOf(ym(y, m)))) }));

  // 월 보기 — 쇼핑몰에서 결제된 주문의 값만 쓴다 (견적·광고비와 섞지 않는다)
  const monthName = mLabel(selectedMonth);
  const pv = prevM(selectedMonth);
  const lastYear = lastYearMonth(selectedMonth);
  // 비로그인 매월 1일처럼 마지막 날이 그 달 말일이면 끝난 달이다
  const partial = selectedMonth === AS_OF_MONTH && !(AS_OF === cutoffDay && AS_OF_DAY === daysOfMonth(AS_OF_MONTH));
  const amountOf = (mo: string) => {
    const goods = goodsInMonth(mo);
    return goods ? sumBy(goods, (g) => g.amount) : null;
  };
  const qtyOf = (mo: string) => {
    const goods = goodsInMonth(mo);
    return goods ? sumBy(goods, (g) => g.qty) : null;
  };
  const orDash = (v: number | null, text: (n: number) => string) => (v === null ? '–' : text(v));
  const wonText = (v: number) => `${fmt(v)}원`;
  const qtyText = (v: number) => `${fmt(v)}개`;
  const curAmount = amountOf(selectedMonth);
  const curQty = qtyOf(selectedMonth);
  /** 진행 중인 달은 끝난 달과 맞비교하지 않는다 */
  const monthCompare = (cur: number | null, prev: number | null) => (partial ? { sub: `${AS_OF_DAY}일까지 집계` } : { cur, prev, cmpLabel: '전월' });

  // 유입 매체별 구매 참고값 — GA4 가 실제로 측정한 '주문 완료' 화면 방문 수를 그대로 그린다 (추정·보정 없음).
  // 판매는 비교용으로 GA4 가 측정한 기간에 결제된 건수만 센다. 측정 시작일이 있는 달은 고도몰 일별 실측값으로 그 날부터 센다
  const scopeMonths = allPeriod ? ALL_MONTHS : yearTotal ? ytd : [selectedMonth];
  // GA4 는 달 합계로만 받아 진행 중인 달에는 오늘 값이 섞여 있다 — 마지막 날이 있으면(비로그인) 그 달은 마감 후 반영
  const ga4LiveHidden = (mo: string) => !!cutoffDay && mo === THIS_M;
  const measuredMonths = scopeMonths.filter((mo) => mo in ga.sources && !ga4LiveHidden(mo));
  const purchaseBasis = measuredMonths.length > 0 && measuredMonths.every((mo) => ga.purchaseMonths.has(mo));
  const sourceCounts = new Map<string, number>();
  measuredMonths.forEach((mo) =>
    Object.entries(ga.sources[mo] ?? {}).forEach(([raw, n]) => {
      const label = GA4_SOURCE_LABELS[raw] ?? '기타';
      sourceCounts.set(label, (sourceCounts.get(label) ?? 0) + n);
    }),
  );
  const sourceTotal = sumBy([...sourceCounts.values()], (n) => n);
  const hasDaily = GODOMALL_DAILY.length > 0;
  const measuredSales = sumBy(measuredMonths, (mo) => {
    const from = ga.partialStart[mo]?.from;
    return from && hasDaily ? sumBy(GODOMALL_DAILY.filter((r) => r.date.slice(0, 7) === mo && +r.date.slice(8) >= from), (r) => r.paid) : countOf(mo);
  });
  const sourceItems = [...sourceCounts]
    .sort((a, b) => b[1] - a[1])
    .map(([k, count]) => ({ k, c: '--acc', count, v: Math.round((count / sourceTotal) * 1000) / 10 }));
  // GA4 값이 도중에 멈춘 달은 어디까지인지 제목에 밝힌다
  const sourceCutoff = measuredMonths.includes(ga.asOf.slice(0, 7)) && ga.asOf < GODOMALL_ORDERS_AS_OF ? `, ${+ga.asOf.slice(8, 10)}일까지` : '';
  const sourcePeriod = allPeriod ? '전체 기간' : yearTotal ? `${yr}년` : monthName;
  const sourceStart = isMonth && hasDaily && ga.partialStart[selectedMonth] ? ` ${ga.partialStart[selectedMonth].from}일부터` : '';
  const sourceScope = isMonth ? `${sourcePeriod}${sourceStart}` : `${sourcePeriod} 중 측정된 ${measuredMonths.length}개월`;
  // GA4 기준일보다 뒤의 달은 측정이 없는 것이 아니라 값을 아직 받지 못한 것이다
  const ga4NotYet = isMonth && selectedMonth > ga.asOf.slice(0, 7);
  const ga4Closed = isMonth && ga4LiveHidden(selectedMonth);
  const sourceLoading = !ga4Done && !ga4Closed && measuredMonths.length === 0;
  const sourceSubtitle = measuredMonths.length
    ? `(${sourceScope} · 판매 ${hasOrders ? `${fmt(measuredSales)}건` : '수집 전'} · GA4 측정 ${fmt(sourceTotal)}건${sourceCutoff})`
    : `(${sourcePeriod} · ${ga4Closed ? '마감 후 반영' : ga4NotYet ? '집계 전' : '미측정'})`;

  return (
    <View name="purchases" title={TITLE}>
      <ViewHeader title={TITLE} description="고도몰 기준 판매 건수" status={status} />
      <ViewNote>※ 고도몰 결제완료일 기준 ·{hasOrders ? `${GODOMALL_ORDERS_AS_OF} 수집` : '수집 전'}</ViewNote>

      <KpiSection id="kpiPurchases">
        {allPeriod ? (
          <>
            <KpiCard label="전체 기간 판매 건수" value={hasOrders ? countText(totalOf(ALL_MONTHS)) : PENDING} sub={hasOrders ? `${ALL_MONTHS[0]} ~ ${ALL_MONTHS[ALL_MONTHS.length - 1]}` : undefined} />
            <KpiCard label="월 평균" value={hasOrders ? avgText(totalOf(ALL_MONTHS) / ALL_MONTHS.length) : PENDING} />
            {peakCard(ALL_MONTHS)}
          </>
        ) : yearTotal ? (
          <>
            <KpiCard label={`${yr}년 판매 건수`} value={hasOrders ? countText(ytdTotal) : PENDING} cur={hasOrders ? ytdTotal : null} prev={lastYtdTotal} cmpLabel="전년 동기" />
            <KpiCard label="월 평균" value={hasOrders ? avgText(ytdTotal / mm) : PENDING} cur={hasOrders ? ytdTotal / mm : null} prev={lastYtdTotal === null ? null : lastYtdTotal / mm} cmpLabel="전년 동기" />
            {peakCard(ytd)}
          </>
        ) : (
          <>
            {/* 진행 중인 달의 건수는 끝난 달과 맞비교하지 않는다. 일평균·비율은 기간이 달라도 비교할 수 있다 */}
            <KpiCard
              label={<>{monthName} 판매 건수{partial && <PendingTag />}</>}
              value={hasOrders ? countText(monthCount) : PENDING}
              {...(partial ? { sub: `${AS_OF_DAY}일까지 집계` } : { cur: hasOrders ? monthCount : null, prev: known(pv), cmpLabel: '전월' })}
              detail={<KpiDetailItems items={[['전월', orDash(known(pv), countText)], ['전년 동월', orDash(known(lastYear), countText)]]} />}
            />
            <KpiCard
              label={<>{monthName} 일평균 판매{partial && <PendingTag />}</>}
              value={hasOrders ? orDash(dailyOf(selectedMonth), (v) => `${v.toFixed(2)}건`) : PENDING}
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
              value={hasOrders ? orDash(curAmount, wonText) : PENDING}
              {...monthCompare(curAmount, amountOf(pv))}
              detail={<KpiDetailItems items={[['주문 1건당', curAmount !== null && monthCount > 0 ? wonText(curAmount / monthCount) : '–']]} />}
            />
            <KpiCard
              label={<>{monthName} 구매 개수{partial && <PendingTag />}</>}
              value={hasOrders ? orDash(curQty, qtyText) : PENDING}
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

      <Card name="purchases-source" id="purchases-source" title="유입 매체별 구매 참고값" subtitle={sourceLoading ? `(${sourcePeriod})` : sourceSubtitle}>
        {sourceLoading ? <SkelList /> : <SourceBarChart id="chPurchaseSource" countLabel="측정" items={sourceItems} emptyMessage={ga4Closed ? '진행 중인 달의 GA4 주문 완료 값은 달 합계로만 받아 오늘 값이 섞여 있어, 마감 후 반영합니다.' : ga4NotYet ? '이 기간의 GA4 주문 완료 값을 아직 받지 못했습니다.' : '이 기간은 GA4 주문 완료 값이 측정되지 않았습니다.'} />}
        <ViewNote>
          ※ GA4 {purchaseBasis ? '구매 이벤트' : '주문 완료 화면 방문(중복·누락 있음)'} · 판매 고도몰 · {ga.asOf || '–'} 수집
        </ViewNote>
      </Card>
    </View>
  );
};
