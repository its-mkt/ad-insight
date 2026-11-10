import React from 'react';

export type ChipTone = 'n' | 'g' | 'it' | 's';

interface ChipProps {
  /** n: 네이버 · g: 구글 · it: 견적 · s: 표준 카테고리 */
  tone: ChipTone;
  /** 흐린 글자 */
  muted?: boolean;
  className?: string;
  children: React.ReactNode;
}

/** 매핑 흐름도의 이름표 한 줄 */
export const Chip: React.FC<ChipProps> = ({ tone, muted, className, children }) => (
  <div className={`chip ${tone}${muted ? ' muted' : ''}${className ? ` ${className}` : ''}`}>{children}</div>
);
