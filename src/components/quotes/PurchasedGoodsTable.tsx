import React, { useState } from 'react';
import {
  GODOMALL_GOODS,
  GODOMALL_ORDER_CUSTOMERS,
  GODOMALL_ORDER_LINES,
  orderStatusLabel,
  settleLabel,
  type GodoGoodsRow,
  type GodoOrderLine,
} from '../../data/godomallOrders';
import { useSort } from '../../hooks/useSort';
import { sumBy } from '../../utils/format';
import { Card } from '../common/Card';
import { EmptyState } from '../common/EmptyState';
import { Muted } from '../common/Muted';
import { StatusBadge, type StatusLevel } from '../common/StatusBadge';
import { LIST_LIMIT, ShowMoreButton } from '../common/MoreButton';
import { SortableTh } from '../common/SortableTh';
import { TableFootnote } from '../common/TableFootnote';
import { NumTd, TotalRow } from '../common/TableRows';
import { GroupAccordionRow, GroupChildRow } from '../common/GroupAccordionRow';
import { Th } from '../common/Th';

type SortKey = 'orders' | 'qty' | 'amount';

interface PurchasedGoodsTableProps {
  /** 합칠 달 ('YYYY-MM') */
  months: string[];
  /** 제목 옆에 보여 줄 기간 */
  periodLabel: string;
}

/** 여러 달을 제품별로 합친다. 제품명이 바뀐 제품은 가장 최근 달의 이름을 쓴다 */
function goodsOf(months: string[]): GodoGoodsRow[] {
  const merged = new Map<string, GodoGoodsRow>();
  [...months].sort().forEach((month) => {
    (GODOMALL_GOODS[month] ?? []).forEach((row) => {
      const cur = merged.get(row.no);
      merged.set(row.no, cur ? { ...row, orders: cur.orders + row.orders, qty: cur.qty + row.qty, amount: cur.amount + row.amount } : row);
    });
  });
  return [...merged.values()];
}

/** 주문 완료 화면이 주문번호와 함께 실제로 남긴 유입 기록이 있는 주문의 경로만 — 날짜로 맞춘 추정 경로는 쓰지 않는다 */
const recordedSource = (line: GodoOrderLine): string => (line.basis === '기록' && line.source !== '미수집' ? line.source : '');

/** 여러 달의 제품별 유입 경로 건수 (많은 순). 실제 기록이 있는 주문만 센다 */
function inflowOf(months: string[]): Map<string, [string, number][]> {
  const inScope = new Set(months);
  const counts = new Map<string, Map<string, number>>();
  const counted = new Set<string>();
  GODOMALL_ORDER_LINES.forEach((line) => {
    const source = recordedSource(line);
    const key = `${line.goodsNo}|${line.key}`;
    if (!source || !inScope.has(line.month) || counted.has(key)) return;
    counted.add(key);
    const bySource = counts.get(line.goodsNo) ?? new Map<string, number>();
    bySource.set(source, (bySource.get(source) ?? 0) + 1);
    counts.set(line.goodsNo, bySource);
  });
  return new Map([...counts].map(([goodsNo, bySource]) => [goodsNo, [...bySource].sort((a, b) => b[1] - a[1])]));
}

/** 경로 이름만 많은 순으로 잇는다 ("네이버(검색) · 직접"). 경로를 아는 주문이 판매 건수보다 적으면 끝에 "외 미수집"을 붙인다 */
function inflowText(sources: [string, number][] | undefined, orders: number): string {
  if (!sources?.length) return '';
  const names = sources.map(([source]) => source).join(' · ');
  return sources.reduce((sum, [, n]) => sum + n, 0) < orders ? `${names} 외 미수집` : names;
}

/** 기간 안의 제품별 주문 줄 (최근 주문부터) */
function orderLinesOf(months: string[]): Map<string, GodoOrderLine[]> {
  const inScope = new Set(months);
  const byGoods = new Map<string, GodoOrderLine[]>();
  GODOMALL_ORDER_LINES.forEach((line) => {
    if (!inScope.has(line.month)) return;
    const list = byGoods.get(line.goodsNo) ?? [];
    list.push(line);
    byGoods.set(line.goodsNo, list);
  });
  byGoods.forEach((list) => list.sort((a, b) => b.placed.localeCompare(a.placed)));
  return byGoods;
}

/** 'YYYY-MM-DD HH:mm' → 'MM.DD', withYear 면 'YY.MM.DD' */
const shortDate = (at: string, withYear: boolean) => (withYear ? at.slice(2, 10).replace(/-/g, '.') : at.slice(5, 10).replace('-', '.'));

/** 주문 상태 뱃지 색 — 끝난 주문은 초록, 취소·환불처럼 판매에서 빠질 주문은 주황, 진행 중은 회색 */
const orderStatusLevel = (code: string): StatusLevel => {
  if (code === 'd2' || code.startsWith('s')) return 'ok';
  if (/^[crbf]/.test(code)) return 'chk'; // StatusBadge 의 주황 (warn 은 회색으로 그려진다)
  return 'man';
};

/**
 * 펼친 주문 한 줄의 첫 칸 — 주문일(결제일이 다르면 함께) · 상태 뱃지 · 결제 수단·회원 여부 순으로 중요한 것부터 둔다.
 * 관리자에게는 회원 등급과 주문자 이메일 도메인을 더 보여 준다 (회원 등급이 있으면 '회원' 대신 등급 이름)
 */
const OrderSummary: React.FC<{ line: GodoOrderLine; withYear: boolean }> = ({ line, withYear }) => {
  const customer = GODOMALL_ORDER_CUSTOMERS.get(line.key);
  const paidOther = line.paid.slice(0, 10) !== line.placed.slice(0, 10);
  const placedAt = shortDate(line.placed, withYear);
  const paidAt = shortDate(line.paid, withYear);
  return (
    <span className="pg-order">
      <span className={`pg-order-date${withYear ? ' with-year' : ''}`} title={paidOther ? `주문 ${placedAt} · 결제 ${paidAt}` : `주문·결제 ${placedAt}`}>
        {placedAt}
        {paidOther && <Muted small> 결제 {paidAt}</Muted>}
      </span>
      <StatusBadge level={orderStatusLevel(line.status)} size="sm">
        {orderStatusLabel(line.status)}
      </StatusBadge>
      <Muted>
        {settleLabel(line.settle)} · {customer?.memberGroup || line.member}
      </Muted>
      {customer?.emailDomain && (
        <Muted small className="pg-order-customer">
          @{customer.emailDomain}
        </Muted>
      )}
    </span>
  );
};

/** 기간 안에 판매된 제품별 건수·수량·금액. 주문 기록이 있는 제품은 눌러서 주문별로 펼친다 */
export const PurchasedGoodsTable: React.FC<PurchasedGoodsTableProps> = ({ months, periodLabel }) => {
  const { sortKey, sortOrder, toggleSort } = useSort<SortKey>('amount');
  const [showAll, setShowAll] = useState(false);
  const [openRows, setOpenRows] = useState<Set<string>>(() => new Set());
  const rows = goodsOf(months).sort((a, b) => (sortOrder === 'desc' ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey]) || b.amount - a.amount);
  const visible = showAll ? rows : rows.slice(0, LIST_LIMIT);
  const inflow = inflowOf(months);
  const ordersByGoods = orderLinesOf(months);
  // 여러 해에 걸친 기간(연도 합계·전체 기간)이면 주문일에 연도를 붙인다 — 모든 줄을 같은 자릿수로 맞춘다
  const withYear = new Set(months.map((m) => m.slice(0, 4))).size > 1 || months.some((m) => m.slice(0, 4) !== String(new Date().getFullYear()));
  const toggle = (no: string) =>
    setOpenRows((prev) => {
      const next = new Set(prev);
      if (next.has(no)) next.delete(no);
      else next.add(no);
      return next;
    });
  const header = (key: SortKey, label: string) => (
    <SortableTh sortKey={key} activeKey={sortKey} order={sortOrder} onSort={toggleSort} className="n">
      {label}
    </SortableTh>
  );

  return (
    <Card name="purchases-goods" id="purchases-goods" tableWrap title="구매 제품" subtitle={`(${periodLabel})`}>
      {rows.length ? (
        <>
          <table className="stk" id="tbPurchasesGoods">
            <colgroup>
              <col />
              <col className="col-pg-num" />
              <col className="col-pg-num" />
              <col className="col-pg-amount" />
              <col className="col-pg-inflow" />
            </colgroup>
            <thead>
              <tr>
                <Th>제품명</Th>
                {header('orders', '판매 건수')}
                {header('qty', '수량')}
                {header('amount', '금액')}
                <Th>유입 경로</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const orderLines = ordersByGoods.get(row.no) ?? [];
                const open = openRows.has(row.no);
                return (
                  <React.Fragment key={row.no}>
                    <GroupAccordionRow title={row.name} open={open} canOpen={orderLines.length > 0} onToggle={() => toggle(row.no)} toggleLabel="주문 목록" plain>
                      <NumTd value={row.orders} unit="건" />
                      <NumTd value={row.qty} unit="개" />
                      <NumTd value={row.amount} unit="원" bold />
                      <td className="pg-inflow">{inflowText(inflow.get(row.no), row.orders) || <Muted>미수집</Muted>}</td>
                    </GroupAccordionRow>
                    {open &&
                      orderLines.map((line, i) => (
                        <GroupChildRow key={`${line.key}-${i}`} label={<OrderSummary line={line} withYear={withYear} />}>
                          {/* 판매 건수 칸 — 주문 한 줄은 1건이라 비워 둔다 (상태는 첫 칸 뱃지) */}
                          <td />
                          <NumTd value={line.qty} unit="개" />
                          <NumTd value={line.amount} unit="원" />
                          <td className="pg-inflow">
                            {recordedSource(line) || <Muted>미수집</Muted>}
                            {recordedSource(line) && line.detail && <Muted small> {line.detail}</Muted>}
                          </td>
                        </GroupChildRow>
                      ))}
                  </React.Fragment>
                );
              })}
              <TotalRow>
                <NumTd value={sumBy(rows, (r) => r.orders)} unit="건" />
                <NumTd value={sumBy(rows, (r) => r.qty)} unit="개" />
                <NumTd value={sumBy(rows, (r) => r.amount)} unit="원" />
                <td />
              </TotalRow>
            </tbody>
          </table>
          <ShowMoreButton noun="제품" total={rows.length} expanded={showAll} onToggle={() => setShowAll((v) => !v)} dataBtn="purchases-goods-more" />
          <TableFootnote basis="결제완료일 기준이며 판매 건수와 같이 이후 취소·환불된 주문도 포함합니다 · 금액은 할인 반영, 배송비 제외 · 한 주문에 제품이 여러 개면 제품마다 1건으로 세므로 건수 합계는 실제 판매 건수보다 클 수 있습니다 · 개별 결제 상품은 고객별 결제 건을 묶은 값입니다 · 유입 경로는 주문 완료 화면이 주문번호와 함께 남긴 실제 기록만 표시하며, 기록을 시작한 2026.11.09 이전 주문과 기록이 남지 않은 주문은 미수집입니다 ·제품을 누르면 주문별로 펼쳐지며, 회원 등급과 주문자 메일 도메인은 관리자 로그인 때만 보입니다" />
        </>
      ) : (
        <EmptyState message="이 기간의 구매 제품 데이터가 없습니다." />
      )}
    </Card>
  );
};
