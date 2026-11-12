import React, { useMemo, useState } from 'react';
import type { CatEfficiencyItem } from './types';
import { fmt, sumBy } from '../../utils/format';
import { TableFootnote } from '../common/TableFootnote';
import { useSort } from '../../hooks/useSort';
import { SortableTh } from '../common/SortableTh';
import { Card } from '../common/Card';
import { AdApiSource } from '../common/ExtLink';
import { NumTd, TotalRow, TreeChildRow, TreeParentRow, childLabelOf } from '../common/TableRows';
import { LIST_LIMIT, ShowMoreButton } from '../common/MoreButton';

interface CatEfficiencyTableProps {
  catData: CatEfficiencyItem[];
  /** 기준 기간 표시 (예: 10월, 2026년 1~11월) */
  periodLabel: string;
  totSpend: number;
  totClk: number;
  totConv: number;
  totQuotes: number;
  avgCpa: number;
}

type SortKey = 'k' | 'cost' | 'clk' | 'conv' | 'quotes' | 'convRate' | 'cpa';

interface ParentGroup {
  parentKey: string;
  items: CatEfficiencyItem[];
  cost: number;
  clk: number;
  conv: number;
  quotes: number;
  cpa: number | null;
}

export const CatEfficiencyTable: React.FC<CatEfficiencyTableProps> = ({
  catData,
  periodLabel,
  totSpend,
  totClk,
  totConv,
  totQuotes,
  avgCpa,
}) => {
  const { sortKey, sortOrder, toggleSort } = useSort<SortKey>('cost');
  const [showAll, setShowAll] = useState(false);
  const [openParents, setOpenParents] = useState<Set<string>>(new Set());


  const toggleParent = (key: string) =>
    setOpenParents((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  // 1차·2차 카테고리 그룹화
  const parentGroups = useMemo((): ParentGroup[] => {
    const map: Record<string, CatEfficiencyItem[]> = {};
    const order: string[] = [];

    catData.forEach((item) => {
      const sep = item.k.indexOf(' > ');
      const parentKey = sep >= 0 ? item.k.slice(0, sep) : item.k;
      if (!map[parentKey]) { map[parentKey] = []; order.push(parentKey); }
      map[parentKey].push(item);
    });

    return order.map((parentKey) => {
      const items = map[parentKey];
      const cost    = sumBy(items, (i) => i.cost);
      const clk     = sumBy(items, (i) => i.clk);
      const conv    = sumBy(items, (i) => i.conv);
      const quotes  = sumBy(items, (i) => i.quotes);
      const cpa     = quotes > 0 ? cost / quotes : null;
      return { parentKey, items, cost, clk, conv, quotes, cpa };
    });
  }, [catData]);

  const sortedGroups = useMemo(() => {
    return [...parentGroups].sort((a, b) => {
      let diff = 0;
      if (sortKey === 'k') {
        diff = a.parentKey.localeCompare(b.parentKey);
      } else if (sortKey === 'convRate') {
        const ra = a.clk > 0 ? a.quotes / a.clk : 0;
        const rb = b.clk > 0 ? b.quotes / b.clk : 0;
        diff = ra - rb;
      } else if (sortKey === 'cpa') {
        // CPA 가 없는 그룹(견적 0건)은 정렬 방향과 관계없이 맨 뒤로 보낸다
        if (a.cpa == null || b.cpa == null) return (a.cpa == null ? 1 : 0) - (b.cpa == null ? 1 : 0);
        diff = a.cpa - b.cpa;
      } else {
        diff = (a[sortKey as 'cost' | 'clk' | 'conv' | 'quotes'] as number)
             - (b[sortKey as 'cost' | 'clk' | 'conv' | 'quotes'] as number);
      }
      return sortOrder === 'desc' ? -diff : diff;
    });
  }, [parentGroups, sortKey, sortOrder]);

  const th = (label: string, key: SortKey, align = 'n') => (
    <SortableTh sortKey={key} activeKey={sortKey} order={sortOrder} onSort={toggleSort} className={align || undefined}>
      {label}
    </SortableTh>
  );

  const convRateStr = (quotes: number, clk: number) =>
    clk > 0 ? `${((quotes / clk) * 100).toFixed(2)}%` : '–';

  const cpaStr = (cpa: number | null) =>
    cpa != null ? `${fmt(cpa)}원` : '–';

  return (
    <Card
      name="cat-table"
      tableWrap
      id="cat-table"
      titleId="ttCatTable"
      title="카테고리별 집행 성과 및 전환 효율 상세"
      subtitle={`(${periodLabel} 기준)`}
    >
      <table className="stk" id="tbCatEfficiency">
        <colgroup>
          <col className="col-eff-name" />
          <col className="col-eff-clk" />
          <col className="col-eff-conv" />
          <col className="col-eff-rate" />
          <col className="col-eff-quotes" />
          <col className="col-eff-cpa" />
          <col className="col-eff-cost" />
        </colgroup>
        <thead>
          <tr>
            {th('카테고리', 'k', '')}
            {th('클릭', 'clk')}
            {th('광고전환', 'conv')}
            {th('견적전환율', 'convRate')}
            {th('총 접수 견적', 'quotes')}
            {th('CPA', 'cpa')}
            {th('광고비', 'cost')}
          </tr>
        </thead>
        <tbody>
          {sortedGroups.slice(0, showAll ? undefined : LIST_LIMIT).map(({ parentKey, items, cost, clk, conv, quotes, cpa }) => {
            const hasChildren = items.length > 1 || items[0].k !== parentKey;
            const isOpen = openParents.has(parentKey);

            return (
              <React.Fragment key={parentKey}>
                <TreeParentRow
                  label={parentKey}
                  childCount={hasChildren ? items.length : 0}
                  open={isOpen}
                  onToggle={() => toggleParent(parentKey)}
                >
                  <NumTd value={clk} />
                  <NumTd value={conv} />
                  <NumTd>{convRateStr(quotes, clk)}</NumTd>
                  <NumTd value={quotes || null} unit="건" bold />
                  <NumTd bold>{cpaStr(cpa)}</NumTd>
                  <NumTd value={cost} unit="원" />
                </TreeParentRow>

                {hasChildren && isOpen && items.map((item) => (
                  <TreeChildRow key={item.k} label={childLabelOf(item.k, parentKey)}>
                    <NumTd value={item.clk} />
                    <NumTd value={item.conv} />
                    <NumTd>{convRateStr(item.quotes, item.clk)}</NumTd>
                    <NumTd value={item.quotes || null} unit="건" />
                    <NumTd>{cpaStr(item.cpa)}</NumTd>
                    <NumTd value={item.cost} unit="원" />
                  </TreeChildRow>
                ))}
              </React.Fragment>
            );
          })}
          <TotalRow>
            <NumTd value={totClk} />
            <NumTd value={totConv} />
            <NumTd>{convRateStr(totQuotes, totClk)}</NumTd>
            <NumTd value={totQuotes} unit="건" bold />
            <NumTd bold>{cpaStr(avgCpa || null)}</NumTd>
            <NumTd value={totSpend} unit="원" />
          </TotalRow>
        </tbody>
      </table>
      <ShowMoreButton total={sortedGroups.length} expanded={showAll} onToggle={() => setShowAll((v) => !v)} />
      <TableFootnote
        id="srcCatEfficiency"
        unit="원·건"
        basis="산출 근거: 견적전환율 = 견적 ÷ 클릭 × 100 · CPA = 광고비 ÷ 견적"
        sources={[
          <span key="ads">
            광고비·클릭·전환 — <AdApiSource separator="/" suffix="API" />
          </span>,
          '견적 — 아이티켓·zbyhp·cadkorea 견적 + 전화·톡플러스 문의',
        ]}
      />
    </Card>
  );
};
