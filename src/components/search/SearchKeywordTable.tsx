import React from 'react';
import type { KeywordRow } from '../../types/dashboard';
import type { SortOrder } from '../../hooks/useSort';
import { ctrText } from '../../utils/format';
import { MediaPill } from '../common/MediaPill';
import { NumTd } from '../common/TableRows';
import { SortableTh } from '../common/SortableTh';
import { Th } from '../common/Th';
import { KEYWORD_COLS, keywordMetric, SKW_COL_CLASS, type KeywordSort } from './searchHelpers';

interface SearchKeywordTableProps {
  /** 검색어와 일치한 키워드 행 */
  keywords: KeywordRow[];
  /** 보여 줄 줄 수 (없으면 전부) */
  limit?: number;
  /** 정렬 중인 열 */
  sortKey: KeywordSort;
  /** 정렬 방향 */
  order: SortOrder;
  /** 머리글을 눌러 정렬을 바꿀 때 */
  onSort: (key: KeywordSort) => void;
}

/** 검색 결과 '키워드' 탭의 표 */
export const SearchKeywordTable: React.FC<SearchKeywordTableProps> = ({ keywords, limit, sortKey: kKey, order: kOrd, onSort: kSort }) => (
  <div className="tw">
    <table className="stk" id="tbSearchKeywords">
      <colgroup>
        <col className="col-skw-name" />
        {KEYWORD_COLS.map((c) => (
          <col key={c.key} className={SKW_COL_CLASS[c.key]} />
        ))}
      </colgroup>
      <thead>
        <tr>
          <Th>키워드</Th>
          {KEYWORD_COLS.map((c) => (
            <SortableTh key={c.key} className="n" sortKey={c.key} activeKey={kKey} order={kOrd} onSort={kSort}>
              {c.label}
            </SortableTh>
          ))}
        </tr>
      </thead>
      <tbody>
        {[...keywords]
          .sort((a, b) => (kOrd === 'asc' ? 1 : -1) * (keywordMetric(a, kKey) - keywordMetric(b, kKey)))
          .slice(0, limit)
          .map((k) => (
            <tr key={`${k.media}|${k.campaign}|${k.adgroup}|${k.keyword}|${k.match || ''}`}>
              <td>
                <span className="s-media-row">
                  <MediaPill media={k.media} iconOnly size="0.875rem" />
                  <b>{k.keyword}</b>
                </span>
                <small className="search-sub search-sub-line" title={`${k.campaign} › ${k.adgroup}`}>
                  {k.campaign} › {k.adgroup}
                </small>
              </td>
              <NumTd value={k.bid || null} unit="원" />
              <NumTd value={k.quality || null} />
              <NumTd value={k.imp} />
              <NumTd value={k.clk} />
              <NumTd>{ctrText(k.clk, k.imp)}</NumTd>
              <NumTd value={k.conv} />
              <NumTd value={k.clk > 0 ? Math.round(k.cost / k.clk) : null} unit="원" />
              <NumTd value={k.cost} unit="원" />
            </tr>
          ))}
      </tbody>
    </table>
  </div>
);
