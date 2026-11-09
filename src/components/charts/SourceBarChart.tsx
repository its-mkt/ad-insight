import React from 'react';
import type { SourceShareItem } from '../../types/dashboard';

import { sourceTone } from '../../utils/format';
import { EmptyState } from '../common/EmptyState';

interface SourceBarChartProps {
  id: string;
  items: SourceShareItem[];
  emptyMessage?: string;
  /** 비교 기간 이름(예: '전월'). 주면 항목의 prevV 와 비교한 점유율 증감(%p)을 보여 준다 */
  compareLabel?: string;
  /** 기준 기간 이름(예: '11월'). 막대 툴팁 제목에 붙는다 */
  curLabel?: string;
  /** 주면 매체 이름이 버튼이 되어, 누르면 그 매체 이름을 넘긴다 (검색 결과로 이동 등) */
  onSelect?: (source: string) => void;
  /** 이름 열의 머리글 */
  nameLabel?: string;
  /** 매체 이름으로 정한 색 대신 항목의 색(c)을 쓴다 — 유입 매체가 아닌 목록용 */
  itemColors?: boolean;
  /** 주면 이 순위까지만 색을 쓰고 나머지는 회색으로 둔다 */
  colorTop?: number;
}

// 유입 매체 비중: 순위형 가로 막대 (매체가 많아 도넛·누적 막대보다 순위·값이 잘 읽힌다)
export const SourceBarChart: React.FC<SourceBarChartProps> = ({
  id,
  items,
  emptyMessage = '유입경로 수집 데이터가 없습니다.',
  compareLabel,
  curLabel,
  onSelect,
  nameLabel = '매체',
  itemColors = false,
  colorTop,
}) => {
  if (!items.length) {
    return (
      <div id={id}>
        <EmptyState message={emptyMessage} />
      </div>
    );
  }

  const fmtPct = (v: number) => (Number.isInteger(v) ? `${v}%` : `${v.toFixed(1)}%`);
  // 점유율 증감(%p): 기간 길이와 무관해 진행 중인 달에도 공정하게 비교된다
  const deltaOf = (s: SourceShareItem) =>
    compareLabel && s.prevV != null ? Math.round((s.v - s.prevV) * 10) / 10 : null;

  // 비교 모드는 가장 긴 막대(금월·전월 통틀어)를 칸 폭 전체로 보고 나머지를 비례시킨다 — 점유율 차이가 길이로 드러난다
  const scaleMax = compareLabel ? Math.max(1, ...items.map((s) => Math.max(s.v, s.prevV ?? 0))) : 100;
  // 비교 모드는 막대 오른쪽에 값 글자(점유율 · 건수)가 붙으므로 가장 긴 막대도 70%까지만 쓴다
  const full = compareLabel ? 70 : 100;
  const wOf = (v: number) => (v > 0 ? Math.max(1.5, (v / scaleMax) * full) : 0);

  return (
    <div id={id} className={`src-bars-wrap${compareLabel ? ' cmp' : ''}`}>
      {/* 열 머리글: 아래 행과 같은 구조(.src-bar-row)를 써서 칸 폭이 어긋나지 않게 한다 */}
      <div className="src-bar-row src-bar-head" aria-hidden="true">
        <span className="src-name">{nameLabel}</span>
        <div className="src-bar-bars">점유율</div>
        <div className="src-bar-val">
          {!compareLabel && <span className="count">건수</span>}
          {!compareLabel && <span className="pct">점유율</span>}
          {compareLabel && <span className="delta">증감</span>}
        </div>
      </div>
      {items.map((s, idx) => {
        const d = deltaOf(s);
        // 막대마다 따로 툴팁: 굵은 막대는 기준 기간, 얇은 막대는 비교 기간 값
        const curTip = `${curLabel ? `${s.k} · ${curLabel}` : s.k}|${
          s.count != null ? `${s.count.toLocaleString('ko-KR')}건 (${fmtPct(s.v)})` : fmtPct(s.v)
        }`;
        const prevTip = `${s.k} · ${compareLabel}|${(s.prevCount ?? 0).toLocaleString('ko-KR')}건 (${fmtPct(s.prevV ?? 0)})`;
        const tone = colorTop !== undefined && idx >= colorTop ? { bar: 'var(--c-rest)' } : itemColors ? { bar: `var(${s.c})` } : sourceTone(s.k);
        return (
        <div key={s.k} className={`src-bar-row${compareLabel ? ' has-prev' : ''}`}>
          {/* 카테고리 표처럼 플레인 텍스트 이름. 매체 구분 색은 앞의 작은 점으로 남긴다 */}
          {onSelect ? (
            <button
              type="button"
              className="src-name link"
              title={`${s.k} 검색 결과 보기`}
              onClick={() => onSelect(s.k)}
            >
              <i className="src-dot" style={{ background: tone.bar }} />
              {s.k}
            </button>
          ) : (
            <span className="src-name" title={s.k}>
              <i className="src-dot" style={{ background: tone.bar }} />
              {s.k}
            </span>
          )}
          <div className="src-bar-bars">
            <div className="src-bar-track">
              <div
                className="src-bar-fill"
                style={{
                  width: `${wOf(s.v)}%`,
                  background: tone.bar,
                }}
                data-tip={curTip}
              />
              {/* 비교 모드: 기준 기간 점유율은 굵은 막대 끝에 붙이고 오른쪽 점유율 열은 두지 않는다 */}
              {compareLabel && (
                <span className="src-bar-cur-val">
                  {fmtPct(s.v)}
                  {s.count != null && (
                    <span className="src-bar-cur-count">({s.count.toLocaleString('ko-KR')}건)</span>
                  )}
                </span>
              )}
            </div>
            {compareLabel && (
              // 비교 기간은 같은 색의 얇고 옅은 막대로 아래에 겹쳐 놓아, 호버 없이도 길이로 비교된다
              <div className="src-bar-prev">
                <div
                  className="src-bar-prev-fill"
                  style={{
                    width: `${wOf(s.prevV ?? 0)}%`,
                    background: tone.bar,
                  }}
                  data-tip={prevTip}
                />
                <span className="src-bar-prev-val">
                  {fmtPct(s.prevV ?? 0)}
                  {/* 전월 데이터가 없는 매체(0건)는 점유율만 둔다 */}
                  {(s.prevCount ?? 0) > 0 && (
                    <span className="src-bar-prev-count">({(s.prevCount ?? 0).toLocaleString('ko-KR')}건)</span>
                  )}
                </span>
              </div>
            )}
          </div>
          <div className="src-bar-val">
            {!compareLabel && s.count != null && (
              <span className="count">{s.count.toLocaleString('ko-KR')}건</span>
            )}
            {!compareLabel && <span className="pct">{fmtPct(s.v)}</span>}
            {compareLabel && (
              <span className={`delta${d == null || d === 0 ? '' : d > 0 ? ' up' : ' down'}`}>
                {d == null || d === 0 ? '–' : `${d > 0 ? '▲' : '▼'}${Math.abs(d)}%`}
              </span>
            )}
          </div>
        </div>
        );
      })}
    </div>
  );
};
