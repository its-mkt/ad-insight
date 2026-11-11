import React, { useEffect, useMemo, useState } from 'react';
import type { SyncStatus } from '../types/dashboard';
import { KpiCard, KpiDetailItems, KpiSection } from '../components/charts/KpiCard';
import { MultiChart } from '../components/charts/MultiChart';
import { Card } from '../components/common/Card';
import { EmptyState } from '../components/common/EmptyState';
import { MediaPill } from '../components/common/MediaPill';
import { PendingTag } from '../components/common/Muted';
import { ViewNote } from '../components/common/Note';
import { TableFootnote } from '../components/common/TableFootnote';
import { NumTd, TotalRow } from '../components/common/TableRows';
import { Th } from '../components/common/Th';
import { View } from '../components/common/View';
import { ViewHeader } from '../components/common/ViewHeader';
import { AdApiSource } from '../components/common/ExtLink';
import {
  AD_DEVICE_MONTHS,
  AD_DEVICE_ROWS,
  DEVICE_COLORS,
  DEVICE_KEYS,
  DEVICE_LABELS,
  GA4_FIRST_MONTH,
  loadGa4Devices,
  orderDeviceLabel,
  type DeviceKey,
  type Ga4ConvId,
  type Ga4DeviceMonth,
} from '../data/deviceStats';
import { GODOMALL_ORDER_LINES } from '../data/godomallOrders';
import { monthsUpTo, sameMonthsLastYear } from '../utils/allPeriod';
import { ctrText, fmt, mLabel, prevM, sumBy, THIS_M, ym } from '../utils/format';

interface DevicesViewProps {
  status: SyncStatus;
  selectedMonth: string;
  allPeriod?: boolean;
  yearTotal?: boolean;
}

const TITLE = '기기별 통계';
/** KPI 로 보여 주는 기기 — GA4 의 기타(스마트 TV 등)는 거의 없어 표에서만 보인다 */
const KPI_DEVICES: DeviceKey[] = ['desktop', 'mobile', 'tablet'];
const PENDING = '수집 전';
const pctText = (n: number | null) => (n === null ? '–' : `${n.toFixed(1)}%`);
const share = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : null);

/** 여러 달의 GA4 값을 합친다. 그 항목이 수집된 달만 더하고, 수집된 달 수를 함께 돌려준다 */
function sumGa4<T>(ga4: Record<string, Ga4DeviceMonth>, months: string[], pick: (m: Ga4DeviceMonth) => T | null, add: (acc: Map<string, number>, v: T) => void) {
  const acc = new Map<string, number>();
  let measured = 0;
  months.forEach((mo) => {
    const v = ga4[mo] ? pick(ga4[mo]) : null;
    if (v === null) return;
    measured++;
    add(acc, v);
  });
  return { acc, measured };
}
const addDevices = (acc: Map<string, number>, v: Partial<Record<DeviceKey, number>>) =>
  Object.entries(v).forEach(([d, n]) => acc.set(d, (acc.get(d) ?? 0) + (n ?? 0)));

/** 표 제목 옆 보조 글자 — 고른 기간 중 일부 달만 수집됐으면 몇 달인지 밝힌다 */
const coverText = (measured: number, total: number) => (measured === 0 ? PENDING : measured < total ? `${total}개월 중 ${measured}개월 수집` : '');

export const DevicesView: React.FC<DevicesViewProps> = ({ status, selectedMonth, allPeriod = false, yearTotal = false }) => {
  const yr = selectedMonth.slice(0, 4);
  // GA4 수집 첫 달부터 이번 달까지
  const allMonths = useMemo(() => {
    const out: string[] = [];
    for (let y = +GA4_FIRST_MONTH.slice(0, 4); y <= +THIS_M.slice(0, 4); y++) for (let m = 1; m <= 12; m++) out.push(ym(y, m));
    return out.filter((mo) => mo >= GA4_FIRST_MONTH && mo <= THIS_M);
  }, []);
  const scope = useMemo(() => (allPeriod ? allMonths : yearTotal ? monthsUpTo(selectedMonth) : [selectedMonth]), [allPeriod, yearTotal, selectedMonth, allMonths]);
  const prevScope = useMemo(() => (allPeriod ? [] : yearTotal ? sameMonthsLastYear(scope) : [prevM(selectedMonth)]), [allPeriod, yearTotal, scope, selectedMonth]);
  // 추이 차트: 전체 기간은 수집된 모든 달, 그 밖에는 그 해 1월~기준월
  const chartMonths = useMemo(() => (allPeriod ? allMonths : monthsUpTo(selectedMonth)), [allPeriod, allMonths, selectedMonth]);

  const [ga4, setGa4] = useState<Record<string, Ga4DeviceMonth> | null>(null);
  useEffect(() => {
    let alive = true;
    loadGa4Devices([...new Set([...scope, ...prevScope, ...chartMonths])]).then((got) => alive && setGa4(got));
    return () => {
      alive = false;
    };
  }, [scope, prevScope, chartMonths]);

  const periodLabel = allPeriod ? '전체 기간' : yearTotal ? `${yr}년` : mLabel(selectedMonth);
  const cmpLabel = allPeriod ? undefined : yearTotal ? '전년 동기' : '전월';
  const partial = scope.includes(THIS_M);
  const g = ga4 ?? {};

  // GA4 방문·전환
  const visits = sumGa4(g, scope, (m) => (Object.keys(m.sessions).length ? m.sessions : null), addDevices);
  const prevVisits = sumGa4(g, prevScope, (m) => (Object.keys(m.sessions).length ? m.sessions : null), addDevices);
  const conv = (id: Ga4ConvId, months: string[]) => sumGa4(g, months, (m) => m.conv?.[id] ?? null, addDevices);
  const estimates = conv('estimate', scope);
  const orders = conv('order', scope);
  const visitTotal = sumBy([...visits.acc.values()], (n) => n);

  // 기기 × 채널 (방문·견적 완료)
  const chVisits = sumGa4(g, scope, (m) => m.channels, (acc, rows) => rows.forEach((r) => acc.set(`${r.device}|${r.channel}`, (acc.get(`${r.device}|${r.channel}`) ?? 0) + r.sessions)));
  const chEst = sumGa4(g, scope, (m) => m.convChannels?.estimate ?? null, (acc, rows) => rows.forEach((r) => acc.set(`${r.device}|${r.channel}`, (acc.get(`${r.device}|${r.channel}`) ?? 0) + r.s)));
  const channelNames = [...new Set([...chVisits.acc.keys()].map((k) => k.slice(k.indexOf('|') + 1)))].sort(
    (a, b) => sumBy(DEVICE_KEYS, (d) => chVisits.acc.get(`${d}|${b}`) ?? 0) - sumBy(DEVICE_KEYS, (d) => chVisits.acc.get(`${d}|${a}`) ?? 0)
  );
  const tableDevices = KPI_DEVICES;

  // 광고 — 매체마다 기기 자료가 있는 달만
  const adMonths = (media: 'Google' | 'Naver') => scope.filter((m) => AD_DEVICE_MONTHS[media].has(m));
  const adRows = (['Google', 'Naver'] as const).flatMap((media) => {
    const months = new Set(adMonths(media));
    return DEVICE_KEYS.map((device) => {
      const rows = AD_DEVICE_ROWS.filter((r) => r.media === media && r.device === device && months.has(r.month));
      return { media, device, cost: sumBy(rows, (r) => r.cost), imp: sumBy(rows, (r) => r.imp), clk: sumBy(rows, (r) => r.clk), conv: sumBy(rows, (r) => r.conv), n: rows.length };
    }).filter((r) => r.n > 0);
  });
  const adTotal = { cost: sumBy(adRows, (r) => r.cost), imp: sumBy(adRows, (r) => r.imp), clk: sumBy(adRows, (r) => r.clk), conv: sumBy(adRows, (r) => r.conv) };
  const adCover = [`구글 ${coverText(adMonths('Google').length, scope.length) || '수집됨'}`, `네이버 ${coverText(adMonths('Naver').length, scope.length) || '수집됨'}`].join(' · ');

  // 판매 — 고도몰 주문 형태별 주문 수·금액 (주문 키로 한 번만 센다)
  const scopeSet = new Set(scope);
  const saleByLabel = new Map<string, { orders: Set<string>; amount: number }>();
  GODOMALL_ORDER_LINES.filter((l) => scopeSet.has(l.month)).forEach((l) => {
    const label = orderDeviceLabel(l.device);
    const cur = saleByLabel.get(label) ?? { orders: new Set<string>(), amount: 0 };
    cur.orders.add(l.key);
    cur.amount += l.amount;
    saleByLabel.set(label, cur);
  });
  const saleRows = [...saleByLabel].map(([label, v]) => ({ label, orders: v.orders.size, amount: v.amount })).sort((a, b) => (a.label === '미수집' ? 1 : b.label === '미수집' ? -1 : b.orders - a.orders));
  const saleTotal = sumBy(saleRows, (r) => r.orders);
  const saleKnown = saleRows.filter((r) => r.label !== '미수집');
  const saleCollected = saleKnown.length > 0;

  // 추이 차트 — 전체 기간은 연도별 합계
  const years = [...new Set(chartMonths.map((m) => m.slice(0, 4)))];
  const axis = allPeriod ? years : chartMonths;
  const axisLabels = axis.map((k) => (allPeriod ? `${k}년` : mLabel(k)));
  const inKey = (m: string, k: string) => (allPeriod ? m.startsWith(k) : m === k);
  const trend = (pick: (m: Ga4DeviceMonth) => Partial<Record<DeviceKey, number>> | null | undefined) =>
    KPI_DEVICES.map((d) => ({
      k: DEVICE_LABELS[d],
      c: DEVICE_COLORS[d],
      v: axis.map((key) => sumBy(chartMonths.filter((m) => inKey(m, key) && g[m]), (m) => pick(g[m])?.[d] ?? 0)),
    })).filter((s) => s.v.some((x) => x));

  const loading = ga4 === null;
  const kpiValue = (n: number | undefined) => (loading ? '…' : visits.measured ? `${fmt(n ?? 0)}회` : PENDING);

  return (
    <View name="devices" title={TITLE}>
      <ViewHeader title={TITLE} description="PC·모바일·태블릿별 방문, 견적·주문 전환, 광고 성과와 판매를 한 화면에 봅니다" status={status} />
      <ViewNote>
        ※ {periodLabel} 기준. 방문·전환은 GA4(견적 요청 완료·주문 완료 화면을 본 세션), 광고는 구글·네이버 API의 기기별 실적, 판매는 고도몰 주문 형태(PC·모바일·수기 주문) 그대로입니다.
        수집되지 않은 달은 0이 아니라 "{PENDING}"으로 두고, 다른 자료로 나눠 채우지 않습니다.
      </ViewNote>

      <KpiSection id="kpiDevices">
        {KPI_DEVICES.map((d) => {
          const n = visits.acc.get(d);
          const est = estimates.measured ? estimates.acc.get(d) ?? 0 : null;
          const ord = orders.measured ? orders.acc.get(d) ?? 0 : null;
          return (
            <KpiCard
              key={d}
              label={<>{periodLabel} {DEVICE_LABELS[d]} 방문{partial && <PendingTag />}</>}
              value={kpiValue(n)}
              cur={visits.measured ? n ?? 0 : null}
              prev={prevVisits.measured ? prevVisits.acc.get(d) ?? 0 : null}
              cmpLabel={cmpLabel}
              detail={
                <KpiDetailItems
                  items={[
                    ['비중', pctText(share(n ?? 0, visitTotal))],
                    // 괄호 안은 견적 전환율 (견적 완료 ÷ 방문)
                    ['견적 완료', est === null ? PENDING : `${fmt(est)}회 (${pctText(share(est, n ?? 0))})`],
                    ['주문 완료', ord === null ? PENDING : `${fmt(ord)}회`],
                  ]}
                />
              }
            />
          );
        })}
        <KpiCard
          label={<>{periodLabel} 판매 (고도몰){partial && <PendingTag />}</>}
          value={saleCollected ? `${fmt(saleTotal)}건` : PENDING}
          detail={
            saleCollected ? (
              <KpiDetailItems items={saleRows.slice(0, 4).map((r): [string, string] => [r.label, `${fmt(r.orders)}건`])} />
            ) : (
              <KpiDetailItems items={[['판매', `${fmt(saleTotal)}건`], ['기기', PENDING]]} />
            )
          }
        />
      </KpiSection>

      <div className="grid">
        <MultiChart
          id="chDeviceVisits"
          title={allPeriod ? '연도별 기기별 방문' : '월별 기기별 방문'}
          labels={axisLabels}
          series={trend((m) => m.sessions)}
          unit="회"
          emptyMessage={loading ? '불러오는 중입니다…' : 'GA4 방문 값이 없습니다.'}
        />
        <MultiChart
          id="chDeviceEstimates"
          title={allPeriod ? '연도별 기기별 견적 완료' : '월별 기기별 견적 완료'}
          labels={axisLabels}
          series={trend((m) => m.conv?.estimate)}
          unit="회"
          emptyMessage={loading ? '불러오는 중입니다…' : `기기별 견적 완료는 ${PENDING}입니다 (GA4 기기별 전환 수집을 반영하면 채워집니다).`}
        />
      </div>

      <Card name="device-channels" id="device-channels" title="기기 × 유입 채널" subtitle={`(${periodLabel}${coverText(chVisits.measured, scope.length) ? ` · ${coverText(chVisits.measured, scope.length)}` : ''})`} tableWrap>
        {chVisits.measured ? (
          <table className="stk" id="tbDeviceChannels">
            <colgroup>
              <col />
              {tableDevices.map((d) => (
                <React.Fragment key={d}>
                  <col className="col-dev-count" />
                  <col className="col-dev-count" />
                  <col className="col-dev-rate" />
                </React.Fragment>
              ))}
            </colgroup>
            <thead>
              <tr>
                <Th rowSpan={2}>채널</Th>
                {tableDevices.map((d) => (
                  <Th key={d} colSpan={3} className="c">{DEVICE_LABELS[d]}</Th>
                ))}
              </tr>
              <tr>
                {tableDevices.map((d) => (
                  <React.Fragment key={d}>
                    <Th className="n">방문</Th>
                    <Th className="n">견적 완료</Th>
                    <Th className="n">전환율</Th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {channelNames.map((ch) => (
                <tr key={ch}>
                  <td>{ch}</td>
                  {tableDevices.map((d) => {
                    const v = chVisits.acc.get(`${d}|${ch}`) ?? 0;
                    const e = chEst.measured ? chEst.acc.get(`${d}|${ch}`) ?? 0 : null;
                    return (
                      <React.Fragment key={d}>
                        <NumTd value={v} />
                        <NumTd value={e} fallback={PENDING} />
                        <NumTd>{e === null ? '–' : pctText(share(e, v))}</NumTd>
                      </React.Fragment>
                    );
                  })}
                </tr>
              ))}
              <TotalRow>
                {tableDevices.map((d) => {
                  const v = sumBy(channelNames, (ch) => chVisits.acc.get(`${d}|${ch}`) ?? 0);
                  const e = chEst.measured ? sumBy(channelNames, (ch) => chEst.acc.get(`${d}|${ch}`) ?? 0) : null;
                  return (
                    <React.Fragment key={d}>
                      <NumTd value={v} bold />
                      <NumTd value={e} fallback={PENDING} bold />
                      <NumTd bold>{e === null ? '–' : pctText(share(e, v))}</NumTd>
                    </React.Fragment>
                  );
                })}
              </TotalRow>
            </tbody>
          </table>
        ) : (
          <EmptyState message={loading ? '불러오는 중입니다…' : `기기 × 채널 유입은 ${PENDING}입니다.`} subMessage={loading ? undefined : 'GA4 수집기에 기기별 유입·전환 수집을 반영하면 지난 달까지 채워집니다.'} />
        )}
        <TableFootnote unit="회" basis="산출 근거: GA4 세션 · 견적 완료 = 견적 요청 완료 화면을 본 세션 · 전환율 = 견적 완료 ÷ 방문" sources={['출처: GA4 (itket-analytics 수집)']} />
      </Card>

      <Card name="device-ads" id="device-ads" title="기기별 광고 성과" subtitle={`(${periodLabel} · ${adCover})`} tableWrap>
        {adRows.length ? (
          <table className="stk" id="tbDeviceAds">
            <colgroup>
              <col />
              <col className="col-dev-amount" />
              <col className="col-dev-count" />
              <col className="col-dev-count" />
              <col className="col-dev-rate" />
              <col className="col-dev-count" />
              <col className="col-dev-unit" />
            </colgroup>
            <thead>
              <tr>
                <Th>매체 · 기기</Th>
                <Th className="n">광고비</Th>
                <Th className="n">노출</Th>
                <Th className="n">클릭</Th>
                <Th className="n">CTR</Th>
                <Th className="n">광고전환</Th>
                <Th className="n">평균 CPC</Th>
              </tr>
            </thead>
            <tbody>
              {adRows.map((r) => (
                <tr key={`${r.media}|${r.device}`}>
                  <td>
                    <span className="s-media-row">
                      <MediaPill media={r.media} iconOnly size="0.875rem" />
                      {DEVICE_LABELS[r.device]}
                    </span>
                  </td>
                  <NumTd value={r.cost} unit="원" />
                  <NumTd value={r.imp} />
                  <NumTd value={r.clk} />
                  <NumTd>{ctrText(r.clk, r.imp)}</NumTd>
                  <NumTd value={r.conv} />
                  <NumTd value={r.clk > 0 ? r.cost / r.clk : null} unit="원" />
                </tr>
              ))}
              <TotalRow>
                <NumTd value={adTotal.cost} unit="원" bold />
                <NumTd value={adTotal.imp} bold />
                <NumTd value={adTotal.clk} bold />
                <NumTd bold>{ctrText(adTotal.clk, adTotal.imp)}</NumTd>
                <NumTd value={adTotal.conv} bold />
                <NumTd value={adTotal.clk > 0 ? adTotal.cost / adTotal.clk : null} unit="원" bold />
              </TotalRow>
            </tbody>
          </table>
        ) : (
          <EmptyState message={`기기별 광고 성과는 ${PENDING}입니다.`} subMessage="구글 광고 스크립트와 네이버 수집에 기기별 수집을 반영하면 채워집니다." />
        )}
        <TableFootnote
          unit="원·회"
          basis="산출 근거: 매체 API 기기별 실적 · 네이버는 태블릿을 모바일에 포함 · 광고전환은 매체가 집계한 전환"
          sources={[<AdApiSource key="src" prefix="출처:" suffix="API" />]}
        />
      </Card>

      <Card name="device-sales" id="device-sales" title="기기별 판매 (고도몰)" subtitle={`(${periodLabel}${saleCollected ? '' : ` · 기기 ${PENDING}`})`} tableWrap>
        {saleCollected ? (
          <table className="stk" id="tbDeviceSales">
            <colgroup>
              <col />
              <col className="col-dev-count" />
              <col className="col-dev-rate" />
              <col className="col-dev-amount" />
            </colgroup>
            <thead>
              <tr>
                <Th>주문 형태</Th>
                <Th className="n">판매 건수</Th>
                <Th className="n">비중</Th>
                <Th className="n">판매 금액</Th>
              </tr>
            </thead>
            <tbody>
              {saleRows.map((r) => (
                <tr key={r.label}>
                  <td>{r.label}</td>
                  <NumTd value={r.orders} unit="건" />
                  <NumTd>{pctText(share(r.orders, saleTotal))}</NumTd>
                  <NumTd value={r.amount} unit="원" />
                </tr>
              ))}
              <TotalRow>
                <NumTd value={saleTotal} unit="건" bold />
                <NumTd bold>100%</NumTd>
                <NumTd value={sumBy(saleRows, (r) => r.amount)} unit="원" bold />
              </TotalRow>
            </tbody>
          </table>
        ) : (
          <EmptyState message={`판매 ${fmt(saleTotal)}건의 기기 구분은 ${PENDING}입니다.`} subMessage="고도몰 주문 수집에 주문 형태(PC·모바일)를 반영한 뒤 주문 줄을 다시 만들면 지난 주문까지 채워집니다." />
        )}
        <TableFootnote unit="건·원" basis="산출 근거: 고도몰 결제완료 주문 (주문 1건에 제품이 여럿이어도 1건) · 수기 주문은 관리자가 직접 넣은 주문" sources={['출처: 고도몰 주문 API']} />
      </Card>
    </View>
  );
};
