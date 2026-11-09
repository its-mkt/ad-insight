import React from 'react';

export interface LegendItemProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'color'> {
  /** cur: 기준 기간(진한 막대) · prev: 비교 기간(옅은 막대) — 색 견본 모양이 정해진다 */
  kind?: 'cur' | 'prev';
  /** 시리즈 색 — CSS 변수 이름('--c-g'). kind 가 없을 때만 쓴다(kind 가 있으면 무시) */
  color?: string;
  children: React.ReactNode;
}

/** 범례 한 칸 — 색 견본(i) + 글자 */
export const LegendItem: React.FC<LegendItemProps> = ({ kind, color, children, ...rest }) => (
  <span {...rest}>
    <i className={kind} style={!kind && color ? { background: `var(${color})` } : undefined} />
    {children}
  </span>
);

interface LegendProps {
  id?: string;
  className?: string;
  /** 오른쪽 끝 단위 안내 — "단위: 만원" */
  unit?: string;
  children?: React.ReactNode;
}

/** 차트 아래 범례 줄. 칸은 LegendItem 으로, 단위는 unit 으로 준다 */
export const Legend: React.FC<LegendProps> = ({ id, className, unit, children }) => (
  <div className={`leg${className ? ` ${className}` : ''}`} id={id}>
    {children}
    {unit !== undefined && <span className="leg-note">단위: {unit}</span>}
  </div>
);

interface CompareLegendProps {
  id?: string;
  className?: string;
  unit?: string;
  curLabel: React.ReactNode;
  /** 없으면 비교 칸을 그리지 않는다(전체 기간 등) */
  prevLabel?: React.ReactNode;
}

/** 기준 기간 / 비교 기간 두 칸짜리 범례 — 카테고리·매체 막대 차트 공용 */
export const CompareLegend: React.FC<CompareLegendProps> = ({ id, className, unit, curLabel, prevLabel }) => (
  <Legend id={id} className={className} unit={unit}>
    <LegendItem kind="cur">{curLabel}</LegendItem>
    {prevLabel != null && <LegendItem kind="prev">{prevLabel}</LegendItem>}
  </Legend>
);
