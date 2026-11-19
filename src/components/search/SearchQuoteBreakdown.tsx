import React from 'react';
import { fmt } from '../../utils/format';
import { Muted } from '../common/Muted';
import { MoreButton } from '../common/MoreButton';
import { BREAKDOWN_LIMIT } from './searchHelpers';

interface SearchQuoteBreakdownProps {
  /** 열마다 제목과 [이름, 건수] 목록 (많은 순) */
  breakdowns: { title: string; rows: [string, number][] }[];
  /** 모든 항목을 펼친 상태 */
  expanded: boolean;
  /** 상위 항목 밖으로 접혀 있는 항목 수 (모든 열 합계) */
  hiddenCount: number;
  /** 더보기·접기 버튼을 눌렀을 때 */
  onToggle: () => void;
}

/** 검색 결과 '견적' 탭 위의 견적 구성 (카테고리·유입 매체·문의 유형·담당자별 건수) */
export const SearchQuoteBreakdown: React.FC<SearchQuoteBreakdownProps> = ({ breakdowns, expanded: breakdownAll, hiddenCount: breakdownHidden, onToggle }) => (
  <div className="search-breakdown" id="searchBreakdown">
    {breakdowns.map((b) => (
      <div key={b.title} className="search-breakdown-col">
        <h4>{b.title}</h4>
        {b.rows.slice(0, breakdownAll ? undefined : BREAKDOWN_LIMIT).map(([k, n]) => (
          <p key={k}>
            <span title={k}>{k}</span>
            <b>{fmt(n)}건</b>
          </p>
        ))}
        {!breakdownAll && b.rows.length > BREAKDOWN_LIMIT && <Muted small>외 {fmt(b.rows.length - BREAKDOWN_LIMIT)}개</Muted>}
      </div>
    ))}
    {breakdownHidden > 0 && (
      <div className="search-breakdown-more">
        <MoreButton
          label={breakdownAll ? `상위 ${BREAKDOWN_LIMIT}개만 보기` : `더보기 (+${fmt(breakdownHidden)}개)`}
          open={breakdownAll}
          dataBtn="search-breakdown-more"
          onClick={onToggle}
        />
      </div>
    )}
  </div>
);
