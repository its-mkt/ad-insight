import React, { useState } from 'react';
import { fmt, type CpaRankItem } from '../../utils/format';
import { EmptyState } from '../common/EmptyState';
import { Card } from '../common/Card';
import { LIST_LIMIT, ShowMoreButton } from '../common/MoreButton';

interface CpaRankListProps {
  sortedCats: CpaRankItem[];
  /** 기준 기간 표시 (예: 10월, 2026년 1~11월) */
  periodLabel: string;
}

export const CpaRankList: React.FC<CpaRankListProps> = ({ sortedCats, periodLabel }) => {
  const [showAll, setShowAll] = useState(false);
  const maxCpa = Math.max(...sortedCats.map((c) => c.cpa), 1);

  return (
    <Card name="cat-cpa" id="cat-cpa" titleId="ttCatCpa" title="카테고리별 견적 획득 단가 (CPA)" subtitle={`(${periodLabel} 실적 기준)`}>
      <div id="chCatCpa">
        {sortedCats.length ? (
          <div className="cpa-list">
            {sortedCats.slice(0, showAll ? undefined : LIST_LIMIT).map((c) => {
              const widthPct = Math.max(5, Math.round((c.cpa / maxCpa) * 100));
              return (
                <div key={c.k} className="cpa-row">
                  <div className="cpa-name" title={c.k}>
                    {c.k}
                  </div>
                  <div className="cpa-track">
                    <div className="cpa-bar" style={{ width: `${widthPct}%` }} />
                  </div>
                  <div className="cpa-info">
                    <span className="cpa-val">{fmt(c.cpa)}원</span>
                    <span className="cpa-badge">{c.quotes}건 견적</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState message="기준월의 견적 접수 데이터가 없어 CPA를 산출할 수 없습니다." />
        )}
        <ShowMoreButton total={sortedCats.length} expanded={showAll} onToggle={() => setShowAll((v) => !v)} />
      </div>
    </Card>
  );
};
