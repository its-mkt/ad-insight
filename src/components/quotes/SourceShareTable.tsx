import React from 'react';
import type { SourceShareItem } from '../../types/dashboard';
import { sumBy } from '../../utils/format';
import { EmptyState } from '../common/EmptyState';
import { NumTd, TotalRow } from '../common/TableRows';
import { Th } from '../common/Th';

interface SourceShareTableProps {
  /** 그래프(SourceBarChart)와 같은 유입 매체 항목 */
  items: SourceShareItem[];
  /** 항목이 없을 때 글자 */
  emptyMessage?: string;
  /** 표 id — 한 화면에 두 번 쓸 때 겹치지 않게 한다 */
  tableId?: string;
  /** 첫 열 이름 */
  nameLabel?: string;
  /** 합계 줄의 건수 — 목록 일부만 넘길 때 전체 건수를 준다 */
  total?: number;
  /** 합계 줄 아래에 덧붙이는 줄 */
  children?: React.ReactNode;
}

const pctText = (v: number) => `${Number.isInteger(v) ? v : v.toFixed(1)}%`;

/** 비중 표 — 이름·건수·점유율 (기본은 유입 매체) */
export const SourceShareTable: React.FC<SourceShareTableProps> = ({ items, emptyMessage, tableId = 'tbQuoteSource', nameLabel = '매체', total, children }) => {
  if (!items.length) return <EmptyState message={emptyMessage} />;
  return (
    <table className="stk" id={tableId}>
      <thead>
        <tr>
          <Th>{nameLabel}</Th>
          <Th className="n">건수</Th>
          <Th className="n">점유율</Th>
        </tr>
      </thead>
      <tbody>
        {items.map((s) => (
          <tr key={s.k}>
            <td>{s.k}</td>
            <NumTd value={s.count ?? 0} unit="건" />
            <NumTd>{pctText(s.v)}</NumTd>
          </tr>
        ))}
        <TotalRow>
          <NumTd value={total ?? sumBy(items, (s) => s.count ?? 0)} unit="건" bold />
          <NumTd bold>100%</NumTd>
        </TotalRow>
        {children}
      </tbody>
    </table>
  );
};
