import React from 'react';

interface BarDeltaProps {
  /** 비교 기간 대비 증감률(%) — 없거나 0 이면 '–' 로 그린다 */
  d?: number | null;
}

/** 막대 목록(카테고리·유입 경로) 오른쪽의 증감 칸 — 오르면 up, 내리면 down 클래스 */
export const BarDelta: React.FC<BarDeltaProps> = ({ d }) => (
  <span className={`delta${d == null || d === 0 ? '' : d > 0 ? ' up' : ' down'}`}>
    {d == null || d === 0 ? '–' : `${d > 0 ? '▲' : '▼'}${Math.abs(d)}%`}
  </span>
);
