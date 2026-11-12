import React from 'react';

interface MutedProps {
  /** small 태그로 그린다(줄 아래 보조 글자) */
  small?: boolean;
  /** 태그를 직접 고른다 — 문단처럼 따로 한 줄을 차지하면 'p' (지정하면 small 보다 우선) */
  as?: 'span' | 'small' | 'p';
  /** muted 뒤에 덧붙일 클래스 */
  className?: string;
  /** 마우스를 올리면 보이는 설명 */
  title?: string;
  children: React.ReactNode;
}

/** 흐린 보조 글자 */
export const Muted: React.FC<MutedProps> = ({ small, as, className, title, children }) => {
  const Tag = as ?? (small ? 'small' : 'span');
  return (
    <Tag className={`muted${className ? ` ${className}` : ''}`} title={title}>
      {children}
    </Tag>
  );
};

/** 집계 중인 기간 옆의 "(진행 중)" 표시 — 앞 공백까지 포함한다 */
export const PendingTag: React.FC<{ label?: string }> = ({ label = '진행 중' }) => (
  <>
    {' '}
    <Muted small>({label})</Muted>
  </>
);
