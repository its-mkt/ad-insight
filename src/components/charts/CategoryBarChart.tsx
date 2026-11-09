import React from 'react';
import type { CategoryBarItem } from '../../types/dashboard';
import { fmt } from '../../utils/format';

import { EmptyState } from '../common/EmptyState';

interface CategoryBarChartProps {
  id: string;
  list: CategoryBarItem[];
  emptyMessage?: string;
  /** 비교 대상이 없을 때(전체 기간) 전월 막대를 숨긴다 */
  hidePrev?: boolean;
  /** 비교 대상 이름 (기본 전월) */
  prevLabel?: string;
  /** 기준 기간 이름 (기본 기준월) */
  curLabel?: string;
  /** 전체 카테고리 소진 합계(만원). 주면 기준·비교 기간의 소진 비중(%)을 함께 보여 준다 */
  totalCur?: number;
  totalPrev?: number;
  /** 주면 카테고리 이름이 버튼이 되어, 누르면 그 카테고리 이름을 넘긴다 (검색 결과로 이동 등) */
  onSelect?: (category: string) => void;
}

/**
 * 카테고리별 소진: 유입 매체 비중(SourceBarChart)과 같은 행 구조.
 * 열 머리글 + 굵은 막대(기준 기간) · 얇은 막대(비교 기간) + 오른쪽 값 열(소진 · 증감 · 견적).
 * 막대·행 모양은 .src-bar-* 스타일을 공유한다.
 */
export const CategoryBarChart: React.FC<CategoryBarChartProps> = ({
  id,
  list,
  emptyMessage = '표시할 데이터가 없습니다',
  hidePrev = false,
  prevLabel = '전월',
  curLabel = '기준월',
  totalCur,
  totalPrev,
  onSelect,
}) => {
  if (!list.length) {
    return (
      <div className="ch" id={id}>
        <EmptyState message={emptyMessage} />
      </div>
    );
  }

  const hasQ = list.some((c) => c.q != null);
  // 가장 긴 막대(기준·비교 통틀어)를 기준으로 비례시킨다. 비교 막대 옆에 값 글자가 붙으므로 78%까지만 쓴다
  const max = Math.max(1, ...list.map((c) => Math.max(c.cur, hidePrev ? 0 : c.prev)));
  // 비교 모드는 굵은 막대 끝에 소진액·비중, 얇은 막대 끝에 전월 소진액이 붙으므로 가장 긴 막대도 70%까지만 쓴다
  const full = hidePrev ? 100 : 70;
  const hasShare = (totalCur ?? 0) > 0;
  const shareOf = (v: number, total?: number) => (total && total > 0 ? Math.round((v / total) * 1000) / 10 : null);
  const fmtPct = (v: number | null) => (v == null ? '' : Number.isInteger(v) ? `${v}%` : `${v.toFixed(1)}%`);
  const wOf = (v: number) => (v > 0 ? Math.max(1.5, (v / max) * full) : 0);

  return (
    <div id={id} className="src-bars-wrap cat-bars cmp">
      <div className="src-bar-row src-bar-head" aria-hidden="true">
        <span className="cat-name">카테고리</span>
        <div className="src-bar-bars">소진액</div>
        <div className="src-bar-val">
          {hidePrev && <span className="amt">소진</span>}
          {hidePrev && hasShare && <span className="pct">비중</span>}
          {!hidePrev && <span className="delta">증감</span>}
          {hasQ && <span className="qn">견적</span>}
        </div>
      </div>
      {list.map((c, idx) => {
        const curShare = hasShare ? shareOf(c.cur, totalCur) : null;
        const prevShare = hasShare && !hidePrev ? shareOf(c.prev, totalPrev) : null;
        const d = c.prev ? Math.round(((c.cur - c.prev) / c.prev) * 1000) / 10 : null;
        return (
          <div key={c.k} className="src-bar-row has-prev">
            {onSelect ? (
              <button
                type="button"
                className="cat-name link"
                title={`${c.k} 검색 결과 보기`}
                onClick={() => onSelect(c.k)}
              >
                {c.k}
              </button>
            ) : (
              <span className="cat-name" title={c.k}>
                {c.k}
              </span>
            )}
            <div className="src-bar-bars">
              <div className="src-bar-track">
                <div
                  className="src-bar-fill"
                  style={{ width: `${wOf(c.cur)}%`, background: 'var(--bar)' }}
                  data-tip={`${c.k} · ${hidePrev ? '전체 기간' : curLabel}|${fmt(c.cur)}만원${curShare != null ? ` (${fmtPct(curShare)})` : ''}`}
                />
                {/* 비교 모드: 기준월 소진액(굵게)·비중(옅게)을 굵은 막대 끝에 붙이고 오른쪽 소진·비중 열은 두지 않는다 */}
                {!hidePrev && (
                  <span className="src-bar-cur-val">
                    {fmt(c.cur)}만
                    {curShare != null && <span className="src-bar-cur-count">({fmtPct(curShare)})</span>}
                  </span>
                )}
              </div>
              {!hidePrev && (
                <div className="src-bar-prev">
                  <div
                    className="src-bar-prev-fill"
                    style={{ width: `${wOf(c.prev)}%`, background: 'var(--bar2)', opacity: 1 }}
                    data-tip={`${c.k} · ${prevLabel}|${fmt(c.prev)}만원${prevShare != null ? ` (${fmtPct(prevShare)})` : ''}`}
                  />
                  <span className="src-bar-prev-val">
                    {fmt(c.prev)}만
                    {prevShare != null && <span className="src-bar-prev-count">({fmtPct(prevShare)})</span>}
                  </span>
                </div>
              )}
            </div>
            <div className="src-bar-val">
              {hidePrev && <span className="amt">{fmt(c.cur)}만</span>}
              {hidePrev && hasShare && <span className="pct">{fmtPct(curShare)}</span>}
              {!hidePrev && (
                <span className={`delta${d == null || d === 0 ? '' : d > 0 ? ' up' : ' down'}`}>
                  {d == null || d === 0 ? '–' : `${d > 0 ? '▲' : '▼'}${Math.abs(d)}%`}
                </span>
              )}
              {hasQ && <span className="qn">{c.q != null && c.q > 0 ? `${c.q}건` : '–'}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
};
