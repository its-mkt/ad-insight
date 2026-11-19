import React from 'react';
import { EmptyState } from '../common/EmptyState';
import { Legend, LegendItem } from '../common/Legend';
import { Tooltip } from '../common/Tooltip';

/** 막대 한 칸의 계열 (기기·매체 등) */
export interface RowBarsSeries {
  key: string;
  label: string;
  /** 색 토큰 이름 (예: '--acc') */
  color: string;
}

/** 막대 한 줄 (지표·채널 등) */
export interface RowBarsRow {
  key: string;
  label: React.ReactNode;
  /** 계열별 값 — 값이 없으면(null) 그 칸은 그리지 않는다 */
  values: Record<string, number | null>;
  /** 값 글자 (compare 의 막대 끝·툴팁) — 없으면 천 단위 쉼표 */
  format?: (v: number) => string;
  /** 줄 이름 아래 흐린 보조 글자 (합계 등) */
  sub?: React.ReactNode;
}

interface RowBarsChartProps {
  id: string;
  series: RowBarsSeries[];
  rows: RowBarsRow[];
  /** share: 줄마다 100% 누적 막대로 계열 비중 · compare: 줄마다 계열별 막대를 그 줄의 가장 큰 값에 맞춰 나란히 */
  mode: 'share' | 'compare';
  emptyMessage?: string;
  /** 범례 오른쪽 끝 단위 안내 */
  unit?: string;
  /** 값(건수·금액)은 숨기고 비중만 보인다 — 로그인 전 미리보기의 실제 기기 비중 카드 */
  valuesHidden?: boolean;
}

const num = (v: number) => Math.round(v).toLocaleString('ko-KR');
const pct = (v: number) => `${v >= 10 ? Math.round(v) : v.toFixed(1)}%`;

/**
 * 줄마다 계열을 막대로 비교하는 표 옆 그래프 — 기기별 비중(share)·매체 지표 비교(compare)처럼 표 하나를 그대로 그림으로 옮길 때 쓴다.
 * 단위가 다른 지표(건수·원·%)가 한 표에 섞여도 줄마다 따로 비교하므로 함께 그릴 수 있다
 */
export const RowBarsChart: React.FC<RowBarsChartProps> = ({ id, series, rows, mode, emptyMessage = '표시할 데이터가 없습니다.', unit, valuesHidden = false }) => {
  const visible = rows.filter((r) => series.some((s) => (r.values[s.key] ?? 0) > 0));
  if (!visible.length) {
    return (
      <div id={id}>
        <EmptyState message={emptyMessage} />
      </div>
    );
  }
  return (
    <div id={id} className={`row-bars ${mode}`}>
      <Legend unit={unit}>
        {series.map((s) => (
          <LegendItem key={s.key} color={s.color}>
            {s.label}
          </LegendItem>
        ))}
      </Legend>
      <ul className="row-bars-list">
        {visible.map((r) => {
          const fmtV = r.format || num;
          const vals = series.map((s) => ({ s, v: r.values[s.key] ?? null }));
          const total = vals.reduce((a, x) => a + (x.v ?? 0), 0);
          const max = Math.max(0, ...vals.map((x) => x.v ?? 0));
          return (
            <li key={r.key} className="row-bars-row">
              <div className="row-bars-name">
                <span>{r.label}</span>
                {r.sub != null && !valuesHidden && <small>{r.sub}</small>}
              </div>
              {mode === 'share' ? (
                <div className="row-bars-track">
                  {vals.map(({ s, v }) => {
                    if (!v || v <= 0 || total <= 0) return null;
                    const p = (v / total) * 100;
                    return (
                      <Tooltip key={s.key} content={valuesHidden ? `${s.label}|${pct(p)}` : `${s.label}|${pct(p)} · ${fmtV(v)}`}>
                        <span className="row-bars-seg" style={{ width: `${p}%`, background: `var(${s.color})` }}>
                          {p >= 12 && <em>{pct(p)}</em>}
                        </span>
                      </Tooltip>
                    );
                  })}
                </div>
              ) : (
                <div className="row-bars-pairs">
                  {vals.map(({ s, v }) => (
                    <div key={s.key} className="row-bars-pair">
                      <span className="row-bars-bar">
                        {v != null && v > 0 && max > 0 && <span style={{ width: `${Math.max(1.5, (v / max) * 100)}%`, background: `var(${s.color})` }} />}
                      </span>
                      <span className="row-bars-val">{v == null ? '–' : fmtV(v)}</span>
                    </div>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};
