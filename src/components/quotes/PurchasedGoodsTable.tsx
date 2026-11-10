import React, { useState } from 'react';
import { GODOMALL_GOODS, type GodoGoodsRow } from '../../data/godomallOrders';
import { useSort } from '../../hooks/useSort';
import { sumBy } from '../../utils/format';
import { Card } from '../common/Card';
import { EmptyState } from '../common/EmptyState';
import { LIST_LIMIT, ShowMoreButton } from '../common/MoreButton';
import { SortableTh } from '../common/SortableTh';
import { TableFootnote } from '../common/TableFootnote';
import { NumTd, TotalRow } from '../common/TableRows';
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

/** 기간 안에 판매된 제품별 건수·수량·금액 */
export const PurchasedGoodsTable: React.FC<PurchasedGoodsTableProps> = ({ months, periodLabel }) => {
  const { sortKey, sortOrder, toggleSort } = useSort<SortKey>('amount');
  const [showAll, setShowAll] = useState(false);
  const rows = goodsOf(months).sort((a, b) => (sortOrder === 'desc' ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey]) || b.amount - a.amount);
  const visible = showAll ? rows : rows.slice(0, LIST_LIMIT);
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
            </colgroup>
            <thead>
              <tr>
                <Th>제품명</Th>
                {header('orders', '판매 건수')}
                {header('qty', '수량')}
                {header('amount', '금액')}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.no}>
                  <td>{row.name}</td>
                  <NumTd value={row.orders} unit="건" />
                  <NumTd value={row.qty} unit="개" />
                  <NumTd value={row.amount} unit="원" bold />
                </tr>
              ))}
              <TotalRow>
                <NumTd value={sumBy(rows, (r) => r.orders)} unit="건" />
                <NumTd value={sumBy(rows, (r) => r.qty)} unit="개" />
                <NumTd value={sumBy(rows, (r) => r.amount)} unit="원" />
              </TotalRow>
            </tbody>
          </table>
          <ShowMoreButton noun="제품" total={rows.length} expanded={showAll} onToggle={() => setShowAll((v) => !v)} dataBtn="purchases-goods-more" />
          <TableFootnote basis="결제완료일 기준이며 판매 건수와 같이 이후 취소·환불된 주문도 포함합니다 · 금액은 할인 반영, 배송비 제외 · 한 주문에 제품이 여러 개면 제품마다 1건으로 세므로 건수 합계는 실제 판매 건수보다 클 수 있습니다 · 개별 결제 상품은 고객별 결제 건을 묶은 값입니다" />
        </>
      ) : (
        <EmptyState message="이 기간의 구매 제품 데이터가 없습니다." />
      )}
    </Card>
  );
};
